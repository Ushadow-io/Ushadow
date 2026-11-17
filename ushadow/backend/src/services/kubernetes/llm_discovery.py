"""Find OpenAI-compatible LLM servers running in a Kubernetes cluster.

The scan lists every Service, keeps the ones that look like model servers, and
asks each one for ``/v1/models``. Probes go through the Kubernetes API server's
service proxy, not cluster DNS, so they work from anywhere Ushadow holds a
kubeconfig and are not blocked by in-cluster network policies.

The URLs returned are the cluster DNS names, because those are what consuming
pods (Chronicle, etc.) will use.
"""

import asyncio
import json
import logging
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass, field
from typing import Any

from kubernetes.client.rest import ApiException

from .kubernetes_client import KubernetesClient

logger = logging.getLogger(__name__)

# A Service labelled with this is always probed, on every port.
LLM_LABEL_KEY = "ushadow.io/capability"
LLM_LABEL_VALUE = "llm"

# Unlabelled Services are probed only on ports model servers commonly use:
# Ollama 11434, llama.cpp/vLLM/TGI 8080/8000/80, LM Studio 1234, LiteLLM 4000.
LLM_PORTS = frozenset({80, 1234, 4000, 8000, 8080, 11434})

SKIP_NAMESPACES = frozenset({"kube-system", "kube-public", "kube-node-lease"})
PROBE_TIMEOUT_SECONDS = 3
MAX_PARALLEL_PROBES = 8


@dataclass
class LlmEndpoint:
    """One OpenAI-compatible server found in the cluster."""

    name: str
    namespace: str
    port: int
    base_url: str  # http://svc.ns.svc.cluster.local:port
    openai_url: str  # base_url + /v1
    models: list[str] = field(default_factory=list)
    labelled: bool = False

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class _Candidate:
    name: str
    namespace: str
    port: int
    labelled: bool


def select_candidates(services: list[Any]) -> list[_Candidate]:
    """Pick the (service, port) pairs worth probing from a Service list."""
    candidates: list[_Candidate] = []
    for svc in services:
        meta, spec = svc.metadata, svc.spec
        if meta.namespace in SKIP_NAMESPACES or not spec or not spec.ports:
            continue
        if spec.cluster_ip in (None, "None"):  # headless: no stable address
            continue
        labelled = (meta.labels or {}).get(LLM_LABEL_KEY) == LLM_LABEL_VALUE
        for port in spec.ports:
            if labelled or port.port in LLM_PORTS:
                candidates.append(_Candidate(meta.name, meta.namespace, port.port, labelled))
    return candidates


def parse_model_ids(body: bytes) -> list[str] | None:
    """Return model ids from an OpenAI ``/v1/models`` body, or None if it is not one."""
    try:
        payload = json.loads(body)
    except (ValueError, TypeError):
        return None
    data = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(data, list):
        return None
    return [str(m["id"]) for m in data if isinstance(m, dict) and m.get("id")]


def to_endpoint(candidate: _Candidate, models: list[str]) -> LlmEndpoint:
    base_url = f"http://{candidate.name}.{candidate.namespace}.svc.cluster.local:{candidate.port}"
    return LlmEndpoint(
        name=candidate.name,
        namespace=candidate.namespace,
        port=candidate.port,
        base_url=base_url,
        openai_url=f"{base_url}/v1",
        models=models,
        labelled=candidate.labelled,
    )


class LlmServiceDiscovery:
    """Scans one cluster for OpenAI-compatible model servers."""

    def __init__(self, k8s_client: KubernetesClient):
        self._k8s_client = k8s_client

    async def discover(self, cluster_id: str) -> list[LlmEndpoint]:
        """List reachable LLM servers in the cluster, labelled ones first.

        Raises:
            FileNotFoundError / ValueError: the cluster's kubeconfig is missing or unreadable.
            ApiException: the Service list call itself failed.
        """
        return await asyncio.to_thread(self._discover_sync, cluster_id)

    def _discover_sync(self, cluster_id: str) -> list[LlmEndpoint]:
        core_api, _ = self._k8s_client.get_kube_client(cluster_id)
        services = core_api.list_service_for_all_namespaces().items
        candidates = select_candidates(services)
        with ThreadPoolExecutor(max_workers=MAX_PARALLEL_PROBES) as pool:
            probed = pool.map(lambda c: (c, self._probe(core_api, c)), candidates)
            found = [to_endpoint(c, models) for c, models in probed if models is not None]
        return sorted(found, key=lambda e: (not e.labelled, e.namespace, e.name, e.port))

    @staticmethod
    def _probe(core_api: Any, candidate: _Candidate) -> list[str] | None:
        """Ask one service port for /v1/models through the API server proxy."""
        try:
            response = core_api.connect_get_namespaced_service_proxy_with_path(
                name=f"{candidate.name}:{candidate.port}",
                namespace=candidate.namespace,
                path="v1/models",
                _preload_content=False,
                _request_timeout=PROBE_TIMEOUT_SECONDS,
            )
            return parse_model_ids(response.data)
        except ApiException:
            return None  # not an OpenAI server, or not reachable
        except Exception as exc:  # noqa: BLE001 - one bad port must not fail the scan
            logger.debug("LLM probe %s/%s:%s failed: %s",
                         candidate.namespace, candidate.name, candidate.port, exc)
            return None
