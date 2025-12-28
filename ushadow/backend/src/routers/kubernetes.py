"""Kubernetes cluster management API endpoints."""

import logging
from typing import List

from fastapi import APIRouter, HTTPException, Depends

from src.models.kubernetes import (
    KubernetesCluster,
    KubernetesClusterCreate,
)
from src.services.kubernetes_manager import get_kubernetes_manager
from src.services.auth_dependencies import get_current_user
from src.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("", response_model=KubernetesCluster)
async def add_cluster(
    cluster_data: KubernetesClusterCreate,
    current_user: User = Depends(get_current_user)
):
    """
    Add a new Kubernetes cluster.

    Upload a kubeconfig file (base64-encoded) to register a cluster.
    Ushadow will validate connectivity before adding it.
    """
    k8s_manager = await get_kubernetes_manager()

    success, cluster, error = await k8s_manager.add_cluster(cluster_data)

    if not success:
        raise HTTPException(status_code=400, detail=error)

    return cluster


@router.get("", response_model=List[KubernetesCluster])
async def list_clusters(
    current_user: User = Depends(get_current_user)
):
    """List all registered Kubernetes clusters."""
    k8s_manager = await get_kubernetes_manager()
    return await k8s_manager.list_clusters()


@router.get("/{cluster_id}", response_model=KubernetesCluster)
async def get_cluster(
    cluster_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get details of a specific Kubernetes cluster."""
    k8s_manager = await get_kubernetes_manager()
    cluster = await k8s_manager.get_cluster(cluster_id)

    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")

    return cluster


@router.delete("/{cluster_id}")
async def remove_cluster(
    cluster_id: str,
    current_user: User = Depends(get_current_user)
):
    """Remove a Kubernetes cluster from Ushadow."""
    k8s_manager = await get_kubernetes_manager()

    success = await k8s_manager.remove_cluster(cluster_id)

    if not success:
        raise HTTPException(status_code=404, detail="Cluster not found")

    return {"success": True, "message": f"Cluster {cluster_id} removed"}
