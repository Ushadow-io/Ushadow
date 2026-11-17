"""Discovery endpoints: find services already running in a Kubernetes cluster."""

from fastapi import APIRouter, Depends, HTTPException
from kubernetes.client.rest import ApiException

from src.models.user import User
from src.services.auth import get_current_user
from src.services.kubernetes import get_kubernetes_manager

router = APIRouter()


@router.get("/{cluster_id}/llm-services")
async def discover_llm_services(
    cluster_id: str,
    current_user: User = Depends(get_current_user),
):
    """List OpenAI-compatible LLM servers in the cluster, with their models."""
    k8s_manager = await get_kubernetes_manager()
    if not await k8s_manager.get_cluster(cluster_id):
        raise HTTPException(status_code=404, detail="Cluster not found")
    try:
        endpoints = await k8s_manager.discover_llm_services(cluster_id)
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ApiException as exc:
        raise HTTPException(status_code=502, detail=f"Kubernetes API error: {exc.reason}") from exc
    return {"cluster_id": cluster_id, "services": [e.to_dict() for e in endpoints]}
