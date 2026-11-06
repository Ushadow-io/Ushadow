"""
Mobile / external client connection info endpoint.

GET /api/connect returns everything a client needs to authenticate and connect
to this ushadow environment, regardless of platform (Docker, Kubernetes, or
public unode). This is the single bootstrap endpoint encoded in QR codes.

Auth is Casdoor. auth_url is the Casdoor URL reachable from the client device:
  docker     — CASDOOR_MOBILE_URL, else the node's Tailscale IP + CASDOOR_PORT
  kubernetes — CASDOOR_MOBILE_URL / CASDOOR_EXTERNAL_URL
  public     — the public unode's "auth_url" metadata, else its public_url
"""

import logging
import os

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/connect", tags=["connect"])


class ConnectionInfo(BaseModel):
    """Everything a mobile or external client needs to connect to this environment."""
    api_url: str            # ushadow backend base URL
    auth_url: str           # Casdoor URL reachable from the client device
    organization: str       # Casdoor organization
    client_id: str          # Casdoor application client ID
    platform: str           # "docker" | "kubernetes" | "public"
    zone: str               # "private" | "public"


def _casdoor() -> dict:
    from src.config.casdoor_settings import get_casdoor_config

    return get_casdoor_config()


def _casdoor_url_for_node(tailscale_ip: str) -> str:
    """Casdoor URL for a Docker node: explicit mobile URL, else Tailscale IP + Casdoor port."""
    port = os.getenv("CASDOOR_PORT", "8082")
    return _casdoor()["mobile_url"] or f"http://{tailscale_ip}:{port}"


def _info(api_url: str, auth_url: str, platform: str, zone: str) -> ConnectionInfo:
    casdoor = _casdoor()
    return ConnectionInfo(
        api_url=api_url,
        auth_url=auth_url.rstrip("/"),
        organization=casdoor["organization"],
        client_id=casdoor["client_id"],
        platform=platform,
        zone=zone,
    )


@router.get("", response_model=ConnectionInfo)
async def get_connection_info(
    target_id: str | None = Query(
        None,
        description="Deploy target ID (e.g. 'my-cluster.k8s.prod' or 'orange-public.unode.orange'). "
                    "Auto-detected when omitted.",
    ),
) -> ConnectionInfo:
    """
    Get connection info for a mobile or external client.

    Unauthenticated — this is the bootstrap endpoint encoded in QR codes.
    After connecting, clients use the returned api_url and auth_url
    to authenticate and access the API.
    """
    from src.utils.environment import is_kubernetes

    if target_id:
        return await _connection_info_for_target(target_id)

    if is_kubernetes():
        return _connection_info_k8s()

    return await _connection_info_docker()


# ── Platform handlers ────────────────────────────────────────────────────────

async def _connection_info_docker() -> ConnectionInfo:
    """Connection info for a private Docker/unode deployment."""
    from src.models.unode import UNodeRole
    from src.services.unode_manager import get_unode_manager
    from src.utils.tailscale_serve import get_tailscale_status

    unode_manager = await get_unode_manager()
    leader = await unode_manager.get_unode_by_role(UNodeRole.LEADER)
    if not leader:
        raise HTTPException(status_code=404, detail="Leader node not found.")

    if not leader.tailscale_ip:
        raise HTTPException(
            status_code=503,
            detail="Leader has no Tailscale IP. Complete Tailscale setup first.",
        )

    ts_status = get_tailscale_status()
    api_url = (
        f"https://{ts_status.hostname}"
        if ts_status.hostname
        else f"http://{leader.tailscale_ip}:{os.getenv('BACKEND_PORT', '8000')}"
    )
    return _info(api_url, _casdoor_url_for_node(leader.tailscale_ip), "docker", "private")


def _connection_info_k8s() -> ConnectionInfo:
    """Connection info for a Kubernetes deployment."""
    api_url = os.getenv("USHADOW_PUBLIC_URL", "").rstrip("/")
    auth_url = _casdoor()["mobile_url"]

    if not api_url:
        raise HTTPException(
            status_code=503,
            detail="USHADOW_PUBLIC_URL is not set. Configure the K8s deployment.",
        )
    if not auth_url:
        raise HTTPException(
            status_code=503,
            detail="CASDOOR_EXTERNAL_URL is not set. Configure the K8s deployment.",
        )
    return _info(api_url, auth_url, "kubernetes", "private")


async def _connection_info_for_target(target_id: str) -> ConnectionInfo:
    """Connection info for an explicit deploy target (public unode or specific cluster)."""
    from src.models.deploy_target import DeployTarget

    try:
        target = await DeployTarget.from_id(target_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e

    is_public = (target.raw_metadata.get("labels") or {}).get("zone") == "public"

    if target.type == "k8s":
        public_url = (target.raw_metadata.get("public_url") or "").rstrip("/")
        ingress = target.raw_metadata.get("ingress_domain", "")
        api_url = public_url or (f"https://ushadow.{ingress}" if ingress else "")
        if not api_url:
            raise HTTPException(
                status_code=503,
                detail=f"No public URL configured for cluster '{target.name}'.",
            )
        auth_url = _casdoor()["mobile_url"] or api_url
        return _info(api_url, auth_url, "kubernetes", "public" if is_public else "private")

    if is_public:
        return _connection_info_public_unode(target)

    # Standard remote Docker unode — use its Tailscale IP
    tailscale_ip = target.raw_metadata.get("tailscale_ip")
    if not tailscale_ip:
        raise HTTPException(
            status_code=503,
            detail=f"UNode '{target.name}' has no Tailscale IP.",
        )
    api_url = target.raw_metadata.get("public_url") or f"http://{tailscale_ip}:8000"
    return _info(api_url, _casdoor_url_for_node(tailscale_ip), "docker", "private")


def _connection_info_public_unode(target) -> ConnectionInfo:
    """Connection info for a public unode (Tailscale Funnel, external access).

    External users (outside the tailnet) need a publicly reachable Casdoor.
    Set it as the unode's "auth_url" metadata; until then the unode's
    public_url is returned as a placeholder.
    """
    public_url = (target.raw_metadata.get("public_url") or "").rstrip("/")
    if not public_url:
        raise HTTPException(
            status_code=503,
            detail=f"Public unode '{target.name}' has no public_url configured. "
                   "Set public_url after Tailscale Funnel is active.",
        )

    auth_url = target.raw_metadata.get("auth_url")
    if not auth_url:
        logger.warning(
            f"[connect] Public unode '{target.name}' has no auth_url; "
            f"returning public_url as placeholder: {public_url}"
        )
    return _info(public_url, auth_url or public_url, "public", "public")
