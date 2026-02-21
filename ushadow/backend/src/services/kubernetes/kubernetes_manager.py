"""
Kubernetes cluster management and deployment service.

KubernetesManager is the public facade. Internal concerns are split across:
  - KubernetesClient           src.services.kubernetes_client
  - KubernetesClusterStore     src.services.kubernetes_cluster_store
  - KubernetesManifestBuilder  src.services.kubernetes_manifest_builder
  - KubernetesDeployService    src.services.kubernetes_deploy
"""

import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from kubernetes.client.rest import ApiException
from motor.motor_asyncio import AsyncIOMotorDatabase

from src.models.kubernetes import (
    KubernetesCluster,
    KubernetesClusterCreate,
    KubernetesDeploymentSpec,
)
from .kubernetes_client import KubernetesClient
from .kubernetes_cluster_store import KubernetesClusterStore
from .kubernetes_deploy import KubernetesDeployService
from .kubernetes_manifest_builder import KubernetesManifestBuilder
from src.utils.logging import get_logger

logger = get_logger(__name__, prefix="K8s")


class KubernetesManager:
    """
    Facade for all Kubernetes operations.

    Composes four focused sub-services and adds the cluster-level query methods
    (list_nodes, list_pods, get_pod_logs, get_pod_events, scan_cluster_for_infra_services)
    that don't belong neatly to any single sub-service.

    All external callers (routers, deployment_manager, etc.) import only this class
    and the singleton helpers below.
    """

    def __init__(self, db: AsyncIOMotorDatabase):
        kubeconfig_dir = Path(os.getenv("KUBECONFIG_DIR", "/app/data/kubeconfigs"))
        self._k8s_client = KubernetesClient(kubeconfig_dir)
        self._store = KubernetesClusterStore(db, self._k8s_client)
        self._builder = KubernetesManifestBuilder()
        self._deploy = KubernetesDeployService(self._k8s_client, self._builder)

    # -------------------------------------------------------------------------
    # Lifecycle
    # -------------------------------------------------------------------------

    async def initialize(self) -> None:
        """Create required database indexes."""
        await self._store.initialize()
        logger.info("KubernetesManager initialized")

    # -------------------------------------------------------------------------
    # Cluster CRUD — delegated to KubernetesClusterStore
    # -------------------------------------------------------------------------

    async def add_cluster(
        self,
        cluster_data: KubernetesClusterCreate,
    ) -> Tuple[bool, Optional[KubernetesCluster], str]:
        return await self._store.add_cluster(cluster_data)

    async def list_clusters(self) -> List[KubernetesCluster]:
        return await self._store.list_clusters()

    async def get_cluster(self, cluster_id: str) -> Optional[KubernetesCluster]:
        return await self._store.get_cluster(cluster_id)

    async def update_cluster(
        self, cluster_id: str, updates: Dict[str, Any]
    ) -> Optional[KubernetesCluster]:
        return await self._store.update_cluster(cluster_id, updates)

    async def remove_cluster(self, cluster_id: str) -> bool:
        return await self._store.remove_cluster(cluster_id)

    async def update_cluster_infra_scan(
        self, cluster_id: str, namespace: str, scan_results: Dict[str, Dict]
    ) -> bool:
        return await self._store.update_cluster_infra_scan(cluster_id, namespace, scan_results)

    async def delete_cluster_infra_scan(self, cluster_id: str, namespace: str) -> bool:
        return await self._store.delete_cluster_infra_scan(cluster_id, namespace)

    # -------------------------------------------------------------------------
    # Low-level client access — delegated to KubernetesClient
    # -------------------------------------------------------------------------

    def _get_kube_client(self, cluster_id: str):
        """Compatibility shim — prefer self._k8s_client.get_kube_client() in new code."""
        return self._k8s_client.get_kube_client(cluster_id)

    async def get_client(self, cluster_id: str):
        """
        Load the kubeconfig for a cluster and return the kubernetes.client module.

        Used by deployment_platforms.py to obtain API constructors such as
        client.AppsV1Api() after the cluster config has been loaded.
        """
        self._k8s_client.get_kube_client(cluster_id)  # loads config into global k8s state
        from kubernetes import client as k8s_client_module
        return k8s_client_module

    async def run_kubectl_command(self, cluster_id: str, command: str) -> str:
        return await self._k8s_client.run_kubectl_command(cluster_id, command)

    # -------------------------------------------------------------------------
    # Manifest compilation — delegated to KubernetesManifestBuilder
    # -------------------------------------------------------------------------

    async def compile_service_to_k8s(
        self,
        service_def: Dict,
        namespace: str = "default",
        k8s_spec: Optional[KubernetesDeploymentSpec] = None,
    ) -> Dict[str, Dict]:
        return await self._builder.compile_service_to_k8s(service_def, namespace, k8s_spec)

    # -------------------------------------------------------------------------
    # Deployment — delegated to KubernetesDeployService
    # -------------------------------------------------------------------------

    async def ensure_namespace_exists(self, cluster_id: str, namespace: str) -> bool:
        return await self._deploy.ensure_namespace_exists(cluster_id, namespace)

    async def get_or_create_envmap(
        self,
        cluster_id: str,
        namespace: str,
        service_name: str,
        env_vars: Dict[str, str],
    ) -> Tuple[str, str]:
        return await self._deploy.get_or_create_envmap(cluster_id, namespace, service_name, env_vars)

    async def deploy_to_kubernetes(
        self,
        cluster_id: str,
        service_def: Dict,
        namespace: str = "default",
        k8s_spec: Optional[KubernetesDeploymentSpec] = None,
    ) -> Tuple[bool, str]:
        return await self._deploy.deploy_to_kubernetes(cluster_id, service_def, namespace, k8s_spec)

    # -------------------------------------------------------------------------
    # Cluster query operations (use the k8s API directly)
    # -------------------------------------------------------------------------

    async def list_nodes(self, cluster_id: str) -> List[Any]:
        """List all nodes in a cluster."""
        from src.models.kubernetes import KubernetesNode

        cluster = await self.get_cluster(cluster_id)
        if not cluster:
            raise ValueError(f"Cluster not found: {cluster_id}")

        try:
            core_api, _ = self._k8s_client.get_kube_client(cluster_id)
            nodes_list = core_api.list_node()
            k8s_nodes = []
            for node in nodes_list.items:
                conditions = node.status.conditions or []
                ready = False
                status = "Unknown"
                for condition in conditions:
                    if condition.type == "Ready":
                        ready = condition.status == "True"
                        status = "Ready" if ready else "NotReady"
                        break

                labels = node.metadata.labels or {}
                roles = []
                if (
                    "node-role.kubernetes.io/control-plane" in labels
                    or "node-role.kubernetes.io/master" in labels
                ):
                    roles.append("control-plane")
                if not roles or "node-role.kubernetes.io/worker" in labels:
                    roles.append("worker")

                addresses = node.status.addresses or []
                internal_ip = external_ip = hostname = None
                for addr in addresses:
                    if addr.type == "InternalIP":
                        internal_ip = addr.address
                    elif addr.type == "ExternalIP":
                        external_ip = addr.address
                    elif addr.type == "Hostname":
                        hostname = addr.address

                node_info = node.status.node_info
                capacity = node.status.capacity or {}
                allocatable = node.status.allocatable or {}

                taints = [
                    {"key": t.key, "value": t.value or "", "effect": t.effect}
                    for t in (node.spec.taints or [])
                ]

                k8s_nodes.append(KubernetesNode(
                    name=node.metadata.name,
                    cluster_id=cluster_id,
                    status=status,
                    ready=ready,
                    kubelet_version=node_info.kubelet_version if node_info else None,
                    os_image=node_info.os_image if node_info else None,
                    kernel_version=node_info.kernel_version if node_info else None,
                    container_runtime=node_info.container_runtime_version if node_info else None,
                    cpu_capacity=capacity.get("cpu"),
                    memory_capacity=capacity.get("memory"),
                    cpu_allocatable=allocatable.get("cpu"),
                    memory_allocatable=allocatable.get("memory"),
                    roles=roles,
                    internal_ip=internal_ip,
                    external_ip=external_ip,
                    hostname=hostname,
                    taints=taints,
                    labels=labels,
                ))

            logger.info(f"Listed {len(k8s_nodes)} nodes for cluster {cluster_id}")
            return k8s_nodes
        except Exception as e:
            logger.error(f"Error listing nodes for cluster {cluster_id}: {e}")
            raise ValueError(f"Failed to list nodes: {e}")

    async def list_pods(self, cluster_id: str, namespace: str = "ushadow") -> List[Dict[str, Any]]:
        """List all pods in a namespace."""
        try:
            core_api, _ = self._k8s_client.get_kube_client(cluster_id)
            pods_list = core_api.list_namespaced_pod(namespace=namespace)
            pods = []
            for pod in pods_list.items:
                status = "Unknown"
                restarts = 0
                if pod.status.container_statuses:
                    restarts = sum(cs.restart_count for cs in pod.status.container_statuses)
                    if pod.status.phase == "Running":
                        all_ready = all(cs.ready for cs in pod.status.container_statuses)
                        status = "Running" if all_ready else "Starting"
                    else:
                        status = pod.status.phase
                    for cs in pod.status.container_statuses:
                        if cs.state.waiting:
                            status = cs.state.waiting.reason or "Waiting"
                        elif cs.state.terminated:
                            status = cs.state.terminated.reason or "Terminated"
                else:
                    status = pod.status.phase or "Pending"

                age = ""
                if pod.metadata.creation_timestamp:
                    age_seconds = (
                        datetime.now(timezone.utc) - pod.metadata.creation_timestamp
                    ).total_seconds()
                    if age_seconds < 60:
                        age = f"{int(age_seconds)}s"
                    elif age_seconds < 3600:
                        age = f"{int(age_seconds / 60)}m"
                    elif age_seconds < 86400:
                        age = f"{int(age_seconds / 3600)}h"
                    else:
                        age = f"{int(age_seconds / 86400)}d"

                pods.append({
                    "name": pod.metadata.name,
                    "namespace": pod.metadata.namespace,
                    "status": status,
                    "restarts": restarts,
                    "age": age,
                    "labels": pod.metadata.labels or {},
                    "node": pod.spec.node_name or "N/A",
                })
            return pods
        except ApiException as e:
            logger.error(f"Failed to list pods: {e}")
            raise Exception(f"Failed to list pods: {e.reason}")
        except Exception as e:
            logger.error(f"Error listing pods: {e}")
            raise

    async def get_pod_logs(
        self,
        cluster_id: str,
        pod_name: str,
        namespace: str = "ushadow",
        previous: bool = False,
        tail_lines: int = 100,
    ) -> str:
        """Get logs from a pod."""
        try:
            core_api, _ = self._k8s_client.get_kube_client(cluster_id)
            return core_api.read_namespaced_pod_log(
                name=pod_name,
                namespace=namespace,
                previous=previous,
                tail_lines=tail_lines,
            )
        except ApiException as e:
            if e.status == 404:
                raise Exception(f"Pod '{pod_name}' not found in namespace '{namespace}'")
            if e.status == 400:
                raise Exception(f"Logs not available for pod '{pod_name}': {e.reason}")
            logger.error(f"Failed to get pod logs: {e}")
            raise Exception(f"Failed to get pod logs: {e.reason}")
        except Exception as e:
            logger.error(f"Error getting pod logs: {e}")
            raise

    async def get_pod_events(
        self,
        cluster_id: str,
        pod_name: str,
        namespace: str = "ushadow",
    ) -> List[Dict[str, Any]]:
        """Get events for a specific pod (useful for debugging CrashLoopBackOff etc.)."""
        try:
            core_api, _ = self._k8s_client.get_kube_client(cluster_id)
            field_selector = (
                f"involvedObject.name={pod_name},involvedObject.namespace={namespace}"
            )
            events_list = core_api.list_namespaced_event(
                namespace=namespace, field_selector=field_selector
            )
            events = [
                {
                    "type": e.type,
                    "reason": e.reason,
                    "message": e.message,
                    "count": e.count,
                    "first_timestamp": e.first_timestamp.isoformat() if e.first_timestamp else None,
                    "last_timestamp": e.last_timestamp.isoformat() if e.last_timestamp else None,
                }
                for e in events_list.items
            ]
            events.sort(key=lambda e: e["last_timestamp"] or "", reverse=True)
            return events
        except ApiException as e:
            logger.error(f"Failed to get pod events: {e}")
            raise Exception(f"Failed to get pod events: {e.reason}")
        except Exception as e:
            logger.error(f"Error getting pod events: {e}")
            raise

    async def scan_cluster_for_infra_services(
        self,
        cluster_id: str,
        namespace: str = "ushadow",
    ) -> Dict[str, Dict]:
        """
        Scan a cluster for common infrastructure services (mongo, redis, postgres, etc.).

        Returns a dict mapping service_name → {found, endpoints, type, namespace}.
        """
        infra_services = {
            "mongo":    {"names": ["mongo", "mongodb"], "port": 27017},
            "redis":    {"names": ["redis"],             "port": 6379},
            "postgres": {"names": ["postgres", "postgresql"], "port": 5432},
            "qdrant":   {"names": ["qdrant"],            "port": 6333},
            "neo4j":    {"names": ["neo4j"],             "port": 7687},
            "keycloak": {"names": ["keycloak"],          "port": 8080},
        }
        namespaces_to_scan = list(dict.fromkeys(
            [namespace, "default", "kube-system", "infra", "infrastructure"]
        ))

        try:
            core_api, _ = self._k8s_client.get_kube_client(cluster_id)
            results: Dict[str, Dict] = {}

            for ns in namespaces_to_scan:
                try:
                    services = core_api.list_namespaced_service(namespace=ns)
                except ApiException:
                    continue

                for infra_name, cfg in infra_services.items():
                    if results.get(infra_name, {}).get("found"):
                        continue
                    for svc in services.items:
                        if any(p in svc.metadata.name.lower() for p in cfg["names"]):
                            ports = [p.port for p in svc.spec.ports]
                            endpoints = []
                            for port in ports:
                                if svc.spec.type == "ClusterIP":
                                    endpoints.append(
                                        f"{svc.metadata.name}.{ns}.svc.cluster.local:{port}"
                                    )
                                elif svc.spec.type == "NodePort":
                                    endpoints.append(f"<node-ip>:{port}")
                                elif svc.spec.type == "LoadBalancer":
                                    if svc.status.load_balancer.ingress:
                                        lb_ip = svc.status.load_balancer.ingress[0].ip
                                        endpoints.append(f"{lb_ip}:{port}")
                            results[infra_name] = {
                                "found": True,
                                "endpoints": endpoints,
                                "type": infra_name,
                                "namespace": ns,
                                "default_port": cfg["port"],
                            }
                            break

            for infra_name in infra_services:
                if infra_name not in results:
                    results[infra_name] = {
                        "found": False,
                        "endpoints": [],
                        "type": infra_name,
                        "namespace": None,
                        "default_port": infra_services[infra_name]["port"],
                    }
            return results

        except Exception as e:
            logger.error(f"Error scanning cluster for infra services: {e}")
            return {
                name: {"found": False, "endpoints": [], "type": name, "error": str(e)}
                for name in infra_services
            }


# ---------------------------------------------------------------------------
# Singleton helpers (unchanged public API)
# ---------------------------------------------------------------------------

_kubernetes_manager: Optional[KubernetesManager] = None


async def init_kubernetes_manager(db: AsyncIOMotorDatabase) -> KubernetesManager:
    """Initialize the global KubernetesManager."""
    global _kubernetes_manager
    _kubernetes_manager = KubernetesManager(db)
    await _kubernetes_manager.initialize()
    return _kubernetes_manager


async def get_kubernetes_manager() -> KubernetesManager:
    """Return the global KubernetesManager instance."""
    if _kubernetes_manager is None:
        raise RuntimeError(
            "KubernetesManager not initialized. Call init_kubernetes_manager first."
        )
    return _kubernetes_manager
