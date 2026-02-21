"""
Node discovery: determine which deploy-target node this ushadow instance is running on.

Returns a unified UNode regardless of whether the installation runs on a Docker
host or inside a Kubernetes cluster.

Usage:
    from src.utils.node_discovery import get_current_node

    unode = await get_current_node()
    if unode:
        print(unode.type)        # UNodeType.DOCKER or UNodeType.KUBERNETES
        print(unode.public_url)  # https://ushadow.chakra  (or None)
        print(unode.deployment_target_id)  # my-cluster.k8s.prod
"""

import logging
import os
from typing import Optional

from src.models.unode import UNode

logger = logging.getLogger(__name__)


async def _resolve_cluster_by_hint(hint: str, kubernetes_manager) -> Optional[object]:
    """Resolve a KubernetesCluster from a name/id hint with fallbacks.

    Resolution order:
    1. Exact name match
    2. cluster_id match
    3. Only cluster registered (single-cluster convenience)
    """
    clusters = await kubernetes_manager.list_clusters()
    if not clusters:
        return None

    cluster = next((c for c in clusters if c.name == hint), None)
    if cluster:
        return cluster

    cluster = next((c for c in clusters if c.cluster_id == hint), None)
    if cluster:
        return cluster

    if len(clusters) == 1:
        logger.info(
            f"[node-discovery] USHADOW_CLUSTER_NAME={hint!r} didn't match; "
            f"using sole registered cluster {clusters[0].name!r}"
        )
        return clusters[0]

    logger.warning(
        f"[node-discovery] Could not resolve cluster from hint {hint!r} "
        f"({len(clusters)} registered clusters)"
    )
    return None


async def get_current_node() -> Optional[UNode]:
    """Return the UNode representing the node this ushadow instance is running on.

    Detection strategy:
    - Kubernetes: KUBERNETES_SERVICE_HOST is auto-injected into every pod.
      USHADOW_CLUSTER_NAME gives the registered cluster name/id hint.
      USHADOW_PUBLIC_URL gives the externally-reachable base URL.
    - Docker: returns the LEADER unode from UNodeManager.

    Returns None if the node cannot be determined (e.g. unode not registered yet).
    """
    from src.utils.environment import get_current_k8s_cluster_name, get_env_name

    k8s_hint = get_current_k8s_cluster_name()
    if k8s_hint:
        from src.services.kubernetes import get_kubernetes_manager

        k8s_manager = await get_kubernetes_manager()
        cluster = await _resolve_cluster_by_hint(k8s_hint, k8s_manager)
        if cluster:
            public_url = os.getenv("USHADOW_PUBLIC_URL", "").strip() or None
            unode = cluster.to_unode(get_env_name(), public_url)
            logger.info(f"[node-discovery] Current node: K8s cluster {cluster.name!r} → {unode.deployment_target_id}")
            return unode
        logger.warning(
            f"[node-discovery] Running in K8s but cluster hint {k8s_hint!r} not found in DB"
        )
        return None

    # Docker / unode path
    from src.models.unode import UNodeRole
    from src.services.unode_manager import get_unode_manager

    unode_manager = await get_unode_manager()
    leader = await unode_manager.get_unode_by_role(UNodeRole.LEADER)
    if leader:
        logger.debug(f"[node-discovery] Current node: Docker leader unode {leader.hostname!r}")
    return leader
