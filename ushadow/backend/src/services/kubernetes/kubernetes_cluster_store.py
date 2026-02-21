"""MongoDB data-access layer for Kubernetes cluster documents."""

import base64
import binascii
import os
import secrets
import yaml
from typing import Any, Dict, List, Optional, Tuple

from kubernetes import client, config
from kubernetes.client.rest import ApiException
from motor.motor_asyncio import AsyncIOMotorDatabase

from src.models.kubernetes import (
    KubernetesCluster,
    KubernetesClusterCreate,
    KubernetesClusterStatus,
)
from .kubernetes_client import KubernetesClient
from src.utils.logging import get_logger

logger = get_logger(__name__, prefix="K8s")


class KubernetesClusterStore:
    """
    Persistent storage for Kubernetes cluster records (MongoDB + kubeconfig files).

    Depends on KubernetesClient for kubeconfig encryption and file management.
    """

    def __init__(self, db: AsyncIOMotorDatabase, k8s_client: KubernetesClient):
        self._collection = db.kubernetes_clusters
        self._client = k8s_client

    async def initialize(self) -> None:
        """Create required MongoDB indexes."""
        await self._collection.create_index("cluster_id", unique=True)
        await self._collection.create_index("context", unique=True)
        logger.info("KubernetesClusterStore initialized")

    # -------------------------------------------------------------------------
    # Write operations
    # -------------------------------------------------------------------------

    async def add_cluster(
        self,
        cluster_data: KubernetesClusterCreate,
    ) -> Tuple[bool, Optional[KubernetesCluster], str]:
        """
        Validate, store, and register a new Kubernetes cluster.

        Decodes the base64 kubeconfig, validates YAML syntax, tests connectivity,
        encrypts the kubeconfig to disk, and inserts a cluster document.

        Returns:
            (success, cluster_or_None, error_message)
        """
        temp_kubeconfig_path = None
        cluster_id = secrets.token_hex(8)
        kubeconfig_dir = self._client._kubeconfig_dir

        try:
            # 1. Decode base64 kubeconfig
            try:
                kubeconfig_yaml = base64.b64decode(cluster_data.kubeconfig).decode("utf-8")
            except (binascii.Error, ValueError) as e:
                return False, None, f"Invalid base64 encoding in kubeconfig: {e}"
            except UnicodeDecodeError as e:
                return False, None, f"Kubeconfig is not valid UTF-8 text: {e}"

            # 2. Validate YAML syntax
            try:
                yaml.safe_load(kubeconfig_yaml)
            except yaml.YAMLError as e:
                error_msg = "Invalid YAML in kubeconfig"
                if hasattr(e, "problem_mark"):
                    mark = e.problem_mark
                    error_msg += f" at line {mark.line + 1}, column {mark.column + 1}"
                if hasattr(e, "problem"):
                    error_msg += f": {e.problem}"
                error_details = str(e).lower()
                if "tab" in error_details or "\\t" in error_details:
                    error_msg += ". Tip: Replace tab characters with spaces"
                elif ":" in error_details or "colon" in error_details:
                    error_msg += ". Tip: Check that all keys have colons (key: value)"
                elif "indent" in error_details:
                    error_msg += ". Tip: Ensure consistent indentation (use 2 spaces)"
                return False, None, error_msg

            # 3. Write temp file for k8s client validation
            temp_kubeconfig_path = kubeconfig_dir / f".tmp_{cluster_id}.yaml"
            temp_kubeconfig_path.write_text(kubeconfig_yaml)
            os.chmod(temp_kubeconfig_path, 0o600)

            # 4. Load config and validate context
            try:
                config.load_kube_config(
                    config_file=str(temp_kubeconfig_path),
                    context=cluster_data.context,
                )
            except config.ConfigException as e:
                return False, None, f"Invalid kubeconfig format: {e}"

            # 5. Test connectivity and gather cluster info
            api_client = client.ApiClient()
            v1 = client.CoreV1Api(api_client)
            version_api = client.VersionApi(api_client)

            try:
                version_info = version_api.get_code()
                nodes = v1.list_node()

                contexts, active_context = config.list_kube_config_contexts(
                    config_file=str(temp_kubeconfig_path)
                )
                context_to_use = cluster_data.context or active_context["name"]
                context_details = next(c for c in contexts if c["name"] == context_to_use)
                server = context_details["context"]["cluster"]

            except ApiException as e:
                return False, None, f"Cannot connect to cluster: {e.reason}"

            # 6. Persist encrypted kubeconfig
            self._client.save_kubeconfig(cluster_id, kubeconfig_yaml)

            # 7. Insert cluster document
            cluster = KubernetesCluster(
                cluster_id=cluster_id,
                name=cluster_data.name,
                context=context_to_use,
                server=server,
                status=KubernetesClusterStatus.CONNECTED,
                version=version_info.git_version,
                node_count=len(nodes.items),
                namespace=cluster_data.namespace,
                labels=cluster_data.labels,
            )
            await self._collection.insert_one(cluster.model_dump())

            logger.info(f"Added K8s cluster: {cluster.name} ({cluster.cluster_id})")
            return True, cluster, ""

        except Exception as e:
            logger.error(f"Error adding K8s cluster: {e}")
            # Clean up any partially-written kubeconfig
            self._client.remove_kubeconfig(cluster_id)
            return False, None, str(e)

        finally:
            if temp_kubeconfig_path and temp_kubeconfig_path.exists():
                temp_kubeconfig_path.unlink()

    async def remove_cluster(self, cluster_id: str) -> bool:
        """Delete the cluster record and its kubeconfig files."""
        self._client.remove_kubeconfig(cluster_id)
        result = await self._collection.delete_one({"cluster_id": cluster_id})
        return result.deleted_count > 0

    async def update_cluster(
        self,
        cluster_id: str,
        updates: Dict[str, Any],
    ) -> Optional[KubernetesCluster]:
        """Apply a partial update to a cluster document."""
        try:
            cluster = await self.get_cluster(cluster_id)
            if not cluster:
                return None
            result = await self._collection.update_one(
                {"cluster_id": cluster_id},
                {"$set": updates},
            )
            if result.modified_count == 0 and result.matched_count == 0:
                return None
            return await self.get_cluster(cluster_id)
        except Exception as e:
            logger.error(f"Error updating cluster: {e}")
            return None

    async def update_cluster_infra_scan(
        self,
        cluster_id: str,
        namespace: str,
        scan_results: Dict[str, Dict],
    ) -> bool:
        """Cache infrastructure scan results for a namespace on a cluster."""
        try:
            result = await self._collection.update_one(
                {"cluster_id": cluster_id},
                {"$set": {f"infra_scans.{namespace}": scan_results}},
            )
            return result.modified_count > 0 or result.matched_count > 0
        except Exception as e:
            logger.error(f"Error updating cluster infra scan: {e}")
            return False

    async def delete_cluster_infra_scan(self, cluster_id: str, namespace: str) -> bool:
        """Remove cached infrastructure scan for a specific namespace."""
        try:
            result = await self._collection.update_one(
                {"cluster_id": cluster_id},
                {"$unset": {f"infra_scans.{namespace}": ""}},
            )
            return result.modified_count > 0
        except Exception as e:
            logger.error(f"Error deleting cluster infra scan: {e}")
            return False

    # -------------------------------------------------------------------------
    # Read operations
    # -------------------------------------------------------------------------

    async def list_clusters(self) -> List[KubernetesCluster]:
        """Return all registered clusters."""
        clusters = []
        async for doc in self._collection.find():
            clusters.append(KubernetesCluster(**doc))
        return clusters

    async def get_cluster(self, cluster_id: str) -> Optional[KubernetesCluster]:
        """Return a cluster by ID, or None if not found."""
        doc = await self._collection.find_one({"cluster_id": cluster_id})
        return KubernetesCluster(**doc) if doc else None
