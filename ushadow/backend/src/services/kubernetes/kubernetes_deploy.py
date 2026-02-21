"""Apply compiled Kubernetes manifests to a cluster and manage PVC seeding."""

import asyncio
import base64
import json
import secrets
import yaml
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from kubernetes import client
from kubernetes.client.rest import ApiException

from src.models.kubernetes import KubernetesDeploymentSpec
from .kubernetes_client import KubernetesClient
from .kubernetes_manifest_builder import KubernetesManifestBuilder
from src.utils.logging import get_logger

logger = get_logger(__name__, prefix="K8s")


class KubernetesDeployService:
    """
    Applies compiled manifests to a Kubernetes cluster.

    Depends on KubernetesClient (API setup) and KubernetesManifestBuilder (compilation).
    Contains no DB access — cluster documents are managed by KubernetesClusterStore.
    """

    def __init__(self, k8s_client: KubernetesClient, builder: KubernetesManifestBuilder):
        self._client = k8s_client
        self._builder = builder

    # -------------------------------------------------------------------------
    # Namespace management
    # -------------------------------------------------------------------------

    async def ensure_namespace_exists(self, cluster_id: str, namespace: str) -> bool:
        """
        Ensure a namespace exists, creating it if necessary.

        Returns True if namespace exists or was created.
        Raises on API errors other than 404.
        """
        logger.info(f"Getting K8s client for cluster {cluster_id}...")
        core_api, _ = self._client.get_kube_client(cluster_id)
        logger.info("K8s client obtained successfully")

        try:
            logger.info(f"Checking if namespace {namespace} exists...")
            await asyncio.get_event_loop().run_in_executor(
                None,
                core_api.read_namespace,
                namespace,
            )
            logger.info(f"Namespace {namespace} already exists")
            return True
        except ApiException as e:
            logger.info(f"Namespace check: status={e.status}, reason={e.reason}")
            if e.status != 404:
                logger.error(f"K8s API error in ensure_namespace_exists: {e}")
                if hasattr(e, "body"):
                    logger.error(f"Body: {e.body}")
                raise

        # Create the namespace
        logger.info(f"Creating namespace {namespace}...")
        namespace_manifest = {
            "apiVersion": "v1",
            "kind": "Namespace",
            "metadata": {
                "name": namespace,
                "labels": {"app.kubernetes.io/managed-by": "ushadow"},
            },
        }
        await asyncio.get_event_loop().run_in_executor(
            None,
            core_api.create_namespace,
            namespace_manifest,
        )
        logger.info(f"Created namespace {namespace}")
        return True

    # -------------------------------------------------------------------------
    # ConfigMap / Secret upsert
    # -------------------------------------------------------------------------

    async def get_or_create_envmap(
        self,
        cluster_id: str,
        namespace: str,
        service_name: str,
        env_vars: Dict[str, str],
    ) -> Tuple[str, str]:
        """
        Upsert a ConfigMap and Secret for service environment variables.

        Separates sensitive (KEY, SECRET, PASSWORD, TOKEN, PASS, CREDENTIALS) from
        non-sensitive values. Also injects a deployment-config.yaml entry.

        Returns:
            (configmap_name, secret_name) — empty string if not created.
        """
        await self.ensure_namespace_exists(cluster_id, namespace)
        core_api, _ = self._client.get_kube_client(cluster_id)

        sensitive_patterns = ("SECRET", "KEY", "PASSWORD", "TOKEN", "PASS", "CREDENTIALS")
        config_data: Dict[str, str] = {}
        secret_data: Dict[str, str] = {}

        for key, value in env_vars.items():
            if any(p in key.upper() for p in sensitive_patterns):
                secret_data[key] = base64.b64encode(str(value).encode()).decode()
            else:
                config_data[key] = str(value)

        deployment_config_yaml = self._builder.generate_deployment_config_yaml(env_vars)
        config_data["deployment-config.yaml"] = deployment_config_yaml
        logger.info(f"Generated deployment config for {service_name}")

        configmap_name = f"{service_name}-config"
        secret_name = f"{service_name}-secrets"

        base_labels = {
            "app.kubernetes.io/name": service_name,
            "app.kubernetes.io/managed-by": "ushadow",
        }

        if config_data:
            cm_body = {
                "apiVersion": "v1",
                "kind": "ConfigMap",
                "metadata": {"name": configmap_name, "namespace": namespace, "labels": base_labels},
                "data": config_data,
            }
            try:
                core_api.create_namespaced_config_map(namespace=namespace, body=cm_body)
                logger.info(f"Created ConfigMap {configmap_name}")
            except ApiException as e:
                if e.status == 409:
                    core_api.patch_namespaced_config_map(
                        name=configmap_name, namespace=namespace, body=cm_body
                    )
                    logger.info(f"Updated ConfigMap {configmap_name}")
                else:
                    raise

        if secret_data:
            secret_body = {
                "apiVersion": "v1",
                "kind": "Secret",
                "type": "Opaque",
                "metadata": {"name": secret_name, "namespace": namespace, "labels": base_labels},
                "data": secret_data,
            }
            try:
                core_api.create_namespaced_secret(namespace=namespace, body=secret_body)
                logger.info(f"Created Secret {secret_name}")
            except ApiException as e:
                if e.status == 409:
                    core_api.patch_namespaced_secret(
                        name=secret_name, namespace=namespace, body=secret_body
                    )
                    logger.info(f"Updated Secret {secret_name}")
                else:
                    raise

        return (
            configmap_name if config_data else "",
            secret_name if secret_data else "",
        )

    # -------------------------------------------------------------------------
    # PVC seeding
    # -------------------------------------------------------------------------

    async def _seed_pvc_from_path(
        self,
        cluster_id: str,
        namespace: str,
        pvc_claim_name: str,
        source_path: str,
        skip_if_not_empty: bool = True,
    ) -> bool:
        """
        Seed a PVC with files from a local path via a temporary busybox pod.

        Files are transferred using base64 encoding over the Kubernetes exec API —
        no kubectl required. The seeder pod is always deleted in the finally block.

        Returns True if seeding succeeded or was skipped (PVC already had content).
        """
        source = Path(source_path)
        if not source.exists():
            logger.warning(f"Seed source {source_path!r} does not exist, skipping PVC {pvc_claim_name!r}")
            return False

        files_to_copy: Dict[str, bytes] = {}
        if source.is_file():
            files_to_copy[source.name] = source.read_bytes()
        else:
            for f in source.rglob("*"):
                if f.is_file():
                    rel = str(f.relative_to(source))
                    try:
                        files_to_copy[rel] = f.read_bytes()
                    except Exception as exc:
                        logger.warning(f"Could not read {f}: {exc}")

        if not files_to_copy:
            logger.info(f"No files in {source_path!r}, nothing to seed into PVC {pvc_claim_name!r}")
            return True

        logger.info(f"Seeding PVC {pvc_claim_name!r} with {len(files_to_copy)} files from {source_path!r}")

        pod_name = f"seed-{pvc_claim_name[:18]}-{secrets.token_hex(4)}"
        core_api, _ = self._client.get_kube_client(cluster_id)

        seed_pod = {
            "apiVersion": "v1",
            "kind": "Pod",
            "metadata": {
                "name": pod_name,
                "namespace": namespace,
                "labels": {
                    "app.kubernetes.io/managed-by": "ushadow",
                    "ushadow/role": "pvc-seeder",
                },
            },
            "spec": {
                "restartPolicy": "Never",
                "containers": [{
                    "name": "seeder",
                    "image": "busybox:1.36",
                    "command": ["sh", "-c", "sleep 600"],
                    "volumeMounts": [{"name": "pvc", "mountPath": "/seed-data"}],
                }],
                "volumes": [{
                    "name": "pvc",
                    "persistentVolumeClaim": {"claimName": pvc_claim_name},
                }],
            },
        }

        loop = asyncio.get_event_loop()
        try:
            await loop.run_in_executor(
                None,
                lambda: core_api.create_namespaced_pod(namespace=namespace, body=seed_pod),
            )
            logger.info(f"Created seeder pod {pod_name!r}")

            # Wait up to 120 s for Running phase
            for _ in range(120):
                pod = await loop.run_in_executor(
                    None,
                    lambda: core_api.read_namespaced_pod(name=pod_name, namespace=namespace),
                )
                phase = pod.status.phase
                if phase == "Running":
                    break
                if phase in ("Failed", "Unknown"):
                    raise RuntimeError(f"Seeder pod {pod_name!r} entered phase {phase!r}")
                await asyncio.sleep(1)
            else:
                raise RuntimeError(f"Seeder pod {pod_name!r} did not become Running within 120s")

            from kubernetes.stream import stream as k8s_stream

            if skip_if_not_empty:
                check = await loop.run_in_executor(
                    None,
                    lambda: k8s_stream(
                        core_api.connect_get_namespaced_pod_exec,
                        pod_name, namespace,
                        command=["sh", "-c", "ls /seed-data | wc -l"],
                        stderr=True, stdin=False, stdout=True, tty=False,
                    ),
                )
                if check and check.strip() != "0":
                    logger.info(f"PVC {pvc_claim_name!r} already has content, skipping seed")
                    return True

            for rel_path, content in files_to_copy.items():
                dest_path = f"/seed-data/{rel_path}"
                dest_dir = str(Path(dest_path).parent)

                await loop.run_in_executor(
                    None,
                    lambda d=dest_dir: k8s_stream(
                        core_api.connect_get_namespaced_pod_exec,
                        pod_name, namespace,
                        command=["mkdir", "-p", d],
                        stderr=True, stdin=False, stdout=True, tty=False,
                    ),
                )

                encoded = base64.b64encode(content).decode()
                chunks = [encoded[i:i + 32768] for i in range(0, len(encoded), 32768)]
                cmd = f"printf '%s' '{chunks[0]}' | base64 -d > {dest_path}"
                for chunk in chunks[1:]:
                    cmd += f" && printf '%s' '{chunk}' | base64 -d >> {dest_path}"

                await loop.run_in_executor(
                    None,
                    lambda c=cmd: k8s_stream(
                        core_api.connect_get_namespaced_pod_exec,
                        pod_name, namespace,
                        command=["sh", "-c", c],
                        stderr=True, stdin=False, stdout=True, tty=False,
                    ),
                )
                logger.debug(f"Seeded {rel_path!r} ({len(content)} bytes) into PVC {pvc_claim_name!r}")

            logger.info(f"Seeded {len(files_to_copy)} files into PVC {pvc_claim_name!r}")
            return True

        except Exception as exc:
            logger.error(f"Failed to seed PVC {pvc_claim_name!r}: {exc}")
            return False
        finally:
            try:
                await loop.run_in_executor(
                    None,
                    lambda: core_api.delete_namespaced_pod(
                        name=pod_name,
                        namespace=namespace,
                        body=client.V1DeleteOptions(grace_period_seconds=0),
                    ),
                )
                logger.info(f"Deleted seeder pod {pod_name!r}")
            except Exception as cleanup_exc:
                logger.warning(f"Failed to delete seeder pod {pod_name!r}: {cleanup_exc}")

    # -------------------------------------------------------------------------
    # Deployment
    # -------------------------------------------------------------------------

    async def deploy_to_kubernetes(
        self,
        cluster_id: str,
        service_def: Dict,
        namespace: str = "default",
        k8s_spec: Optional[KubernetesDeploymentSpec] = None,
    ) -> Tuple[bool, str]:
        """
        Compile and apply a service definition to a Kubernetes cluster.

        Ensures namespace exists, compiles manifests, saves them for debugging,
        then applies: ConfigMap → Secret → PVCs → (PVC seeding) → Deployment → Service → Ingress.
        """
        service_name = service_def.get("name", "unknown")
        logger.info(f"Starting deployment of {service_name} to cluster {cluster_id}, namespace {namespace}")
        logger.info(f"image={service_def.get('image')}, ports={service_def.get('ports')}")

        try:
            logger.info(f"Ensuring namespace {namespace} exists...")
            try:
                await asyncio.wait_for(
                    self.ensure_namespace_exists(cluster_id, namespace),
                    timeout=15.0,
                )
                logger.info(f"Namespace {namespace} ready")
            except asyncio.TimeoutError:
                raise Exception(
                    "Timeout connecting to Kubernetes cluster. "
                    "The cluster may be unreachable. Check network connectivity and kubeconfig."
                )

            logger.info(f"Compiling K8s manifests for {service_name}...")
            manifests = await self._builder.compile_service_to_k8s(service_def, namespace, k8s_spec)
            logger.info("Manifests compiled successfully")

            # Persist manifests to disk for debugging
            manifest_dir = Path("/tmp/k8s-manifests") / cluster_id / namespace
            manifest_dir.mkdir(parents=True, exist_ok=True)
            for manifest_type, manifest in manifests.items():
                if manifest_type.startswith("_"):
                    continue
                manifest_file = manifest_dir / f"{service_name}-{manifest_type}.yaml"
                with open(manifest_file, "w") as f:
                    yaml.dump(manifest, f, default_flow_style=False)
            logger.info(f"Manifests saved to {manifest_dir}")

            core_api, apps_api = self._client.get_kube_client(cluster_id)
            networking_api = client.NetworkingV1Api()

            self._apply_config_map(core_api, manifests, namespace)
            self._apply_secret(core_api, manifests, namespace)
            self._apply_pvcs(core_api, manifests, namespace)

            for seed_info in manifests.get("_volumes_to_seed", []):
                await self._seed_pvc_from_path(
                    cluster_id=cluster_id,
                    namespace=namespace,
                    pvc_claim_name=seed_info["pvc_claim_name"],
                    source_path=seed_info["source_path"],
                    skip_if_not_empty=True,
                )

            deployment_name = self._apply_deployment(apps_api, manifests, namespace)
            svc_name = self._apply_service(core_api, manifests, namespace)
            self._apply_ingress(networking_api, manifests, namespace)

            deployed = []
            if "config_map" in manifests:
                deployed.append(f"ConfigMap/{manifests['config_map']['metadata']['name']}")
            if "secret" in manifests:
                deployed.append(f"Secret/{manifests['secret']['metadata']['name']}")
            deployed.append(f"Deployment/{deployment_name}")
            deployed.append(f"Service/{svc_name}")
            if "ingress" in manifests:
                deployed.append(f"Ingress/{manifests['ingress']['metadata']['name']}")

            msg = f"Successfully deployed {deployment_name} to {namespace}. Resources: {', '.join(deployed)}"
            logger.info(msg)
            return True, msg

        except ApiException as e:
            logger.error(f"K8s API error during deployment: {e}")
            logger.error(f"Response body: {getattr(e, 'body', 'N/A')}")
            error_detail = e.reason
            if getattr(e, "body", None):
                try:
                    body = json.loads(e.body)
                    error_detail = body.get("message", e.reason)
                    causes = body.get("details", {}).get("causes", [])
                    if causes:
                        cause_msgs = [
                            f"{c.get('field', '?')}: {c.get('message', '?')}" for c in causes
                        ]
                        error_detail += f" | Causes: {'; '.join(cause_msgs)}"
                except (json.JSONDecodeError, KeyError, TypeError):
                    pass
            return False, f"Deployment failed: {error_detail}"

        except Exception as e:
            import traceback
            logger.error(f"Error deploying to K8s: {e}")
            logger.error(traceback.format_exc())
            return False, str(e)

    # -------------------------------------------------------------------------
    # Private apply helpers (upsert pattern: create → 409 → patch/replace)
    # -------------------------------------------------------------------------

    def _apply_config_map(self, core_api, manifests: Dict, namespace: str) -> None:
        if "config_map" not in manifests:
            return
        body = manifests["config_map"]
        try:
            core_api.create_namespaced_config_map(namespace=namespace, body=body)
        except ApiException as e:
            if e.status == 409:
                core_api.patch_namespaced_config_map(
                    name=body["metadata"]["name"], namespace=namespace, body=body
                )
            else:
                raise

    def _apply_secret(self, core_api, manifests: Dict, namespace: str) -> None:
        if "secret" not in manifests:
            return
        body = manifests["secret"]
        try:
            core_api.create_namespaced_secret(namespace=namespace, body=body)
        except ApiException as e:
            if e.status == 409:
                core_api.patch_namespaced_secret(
                    name=body["metadata"]["name"], namespace=namespace, body=body
                )
            else:
                raise

    def _apply_pvcs(self, core_api, manifests: Dict, namespace: str) -> None:
        for key, manifest in manifests.items():
            if not key.startswith("pvc_"):
                continue
            pvc_name = manifest["metadata"]["name"]
            try:
                core_api.create_namespaced_persistent_volume_claim(
                    namespace=namespace, body=manifest
                )
                logger.info(f"Created PVC {pvc_name} in {namespace}")
            except ApiException as e:
                if e.status == 409:
                    logger.info(f"PVC {pvc_name} already exists in {namespace}")
                else:
                    raise

    def _apply_deployment(self, apps_api, manifests: Dict, namespace: str) -> str:
        body = manifests["deployment"]
        name = body["metadata"]["name"]
        volumes = body["spec"]["template"]["spec"].get("volumes", [])
        logger.info(f"Deployment manifest volumes ({len(volumes)} volumes):")
        for idx, vol in enumerate(volumes):
            logger.info(f"  manifest[{idx}] = {vol}")
        try:
            apps_api.create_namespaced_deployment(namespace=namespace, body=body)
            logger.info(f"Created deployment {name} in {namespace}")
        except ApiException as e:
            if e.status == 409:
                # Delete-and-recreate avoids volume merge issues from patching
                logger.info(f"Deployment exists, replacing to avoid volume merge issues")
                apps_api.delete_namespaced_deployment(name=name, namespace=namespace)
                logger.info(f"Deleted existing deployment {name}")
                apps_api.create_namespaced_deployment(namespace=namespace, body=body)
                logger.info(f"Recreated deployment {name} in {namespace}")
            else:
                raise
        return name

    def _apply_service(self, core_api, manifests: Dict, namespace: str) -> str:
        body = manifests["service"]
        name = body["metadata"]["name"]
        try:
            core_api.create_namespaced_service(namespace=namespace, body=body)
            logger.info(f"Created service {name} in {namespace}")
        except ApiException as e:
            if e.status == 409:
                core_api.patch_namespaced_service(name=name, namespace=namespace, body=body)
                logger.info(f"Updated service {name} in {namespace}")
            else:
                raise
        return name

    def _apply_ingress(self, networking_api, manifests: Dict, namespace: str) -> None:
        if "ingress" not in manifests:
            return
        body = manifests["ingress"]
        name = body["metadata"]["name"]
        try:
            networking_api.create_namespaced_ingress(namespace=namespace, body=body)
            logger.info(f"Created ingress {name} in {namespace}")
        except ApiException as e:
            if e.status == 409:
                networking_api.patch_namespaced_ingress(name=name, namespace=namespace, body=body)
                logger.info(f"Updated ingress {name} in {namespace}")
            else:
                raise
