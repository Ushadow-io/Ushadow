"""
Mobile / external client connection info endpoint.

GET /api/connect returns everything a client needs to authenticate and connect
to this ushadow environment, regardless of platform (Docker, Kubernetes, or
public unode). This is the single bootstrap endpoint encoded in QR codes.

Platforms:
  docker     — private tailnet, KC via direct Tailscale IP:port
  kubernetes — ingress-hosted, KC via KC_HOSTNAME_URL
  public     — Tailscale Funnel, KC on the public unode (future)
"""

import logging
import os
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/connect", tags=["connect"])


class ConnectionInfo(BaseModel):
    """Everything a mobile or external client needs to connect to this environment."""
    api_url: str            # ushadow backend base URL
    keycloak_mobile_url: str  # KC URL reachable from the client device
    realm: str
    mobile_client_id: str
    platform: str           # "docker" | "kubernetes" | "public"
    zone: str               # "private" | "public"


@router.get("", response_model=ConnectionInfo)
async def get_connection_info(
    target_id: Optional[str] = Query(
        None,
        description="Deploy target ID (e.g. 'my-cluster.k8s.prod' or 'orange-public.unode.orange'). "
                    "Auto-detected when omitted.",
    ),
) -> ConnectionInfo:
    """
    Get connection info for a mobile or external client.

    Unauthenticated — this is the bootstrap endpoint encoded in QR codes.
    After connecting, clients use the returned api_url and keycloak_mobile_url
    to authenticate and access the API.
    """
    from src.utils.environment import is_kubernetes
    from src.config.casdoor_settings import get_casdoor_config

    casdoor_config = get_casdoor_config()
    realm = casdoor_config.get("organization", "ushadow")

    if target_id:
        return await _connection_info_for_target(target_id, realm)

    if is_kubernetes():
        return _connection_info_k8s(realm)

    return await _connection_info_docker(realm, casdoor_config["public_url"])


# ── Platform handlers ────────────────────────────────────────────────────────

async def _connection_info_docker(realm: str, auth_url: str) -> ConnectionInfo:
    """Connection info for a private Docker/unode deployment."""
    from src.services.unode_manager import get_unode_manager
    from src.models.unode import UNodeRole
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

    return ConnectionInfo(
        api_url=api_url,
        keycloak_mobile_url=auth_url,
        realm=realm,
        mobile_client_id="ushadow-mobile",
        platform="docker",
        zone="private",
    )


def _connection_info_k8s(realm: str) -> ConnectionInfo:
    """Connection info for a Kubernetes deployment."""
    api_url = os.getenv("USHADOW_PUBLIC_URL", "").rstrip("/")
    kc_mobile_url = os.getenv("KC_HOSTNAME_URL", "").rstrip("/")

    if not api_url:
        raise HTTPException(
            status_code=503,
            detail="USHADOW_PUBLIC_URL is not set. Configure the K8s deployment.",
        )
    if not kc_mobile_url:
        raise HTTPException(
            status_code=503,
            detail="KC_HOSTNAME_URL is not set. Configure the K8s deployment.",
        )

    return ConnectionInfo(
        api_url=api_url,
        keycloak_mobile_url=kc_mobile_url,
        realm=realm,
        mobile_client_id="ushadow-mobile",
        platform="kubernetes",
        zone="private",
    )


async def _connection_info_for_target(target_id: str, realm: str) -> ConnectionInfo:
    """Connection info for an explicit deploy target (public unode or specific cluster)."""
    from src.models.deploy_target import DeployTarget

    try:
        target = await DeployTarget.from_id(target_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    is_public = (target.raw_metadata.get("labels") or {}).get("zone") == "public"

    if target.type == "k8s":
        # K8s cluster: public_url and KC URL come from cluster metadata
        public_url = (target.raw_metadata.get("public_url") or "").rstrip("/")
        ingress = target.raw_metadata.get("ingress_domain", "")
        api_url = public_url or (f"https://ushadow.{ingress}" if ingress else "")
        kc_mobile_url = os.getenv("KC_HOSTNAME_URL", api_url).rstrip("/")

        if not api_url:
            raise HTTPException(
                status_code=503,
                detail=f"No public URL configured for cluster '{target.name}'.",
            )

        return ConnectionInfo(
            api_url=api_url,
            keycloak_mobile_url=kc_mobile_url,
            realm=realm,
            mobile_client_id="ushadow-mobile",
            platform="kubernetes",
            zone="public" if is_public else "private",
        )

    # Docker unode (including public unodes)
    if is_public:
        return _connection_info_public_unode(target, realm)

    # Standard remote Docker unode — use its Tailscale IP
    from src.config.casdoor_settings import get_casdoor_config

    tailscale_ip = target.raw_metadata.get("tailscale_ip")
    if not tailscale_ip:
        raise HTTPException(
            status_code=503,
            detail=f"UNode '{target.name}' has no Tailscale IP.",
        )

    api_url = target.raw_metadata.get("public_url") or f"http://{tailscale_ip}:8000"
    auth_url = get_casdoor_config()["public_url"]
    return ConnectionInfo(
        api_url=api_url,
        keycloak_mobile_url=auth_url,
        realm=realm,
        mobile_client_id="ushadow-mobile",
        platform="docker",
        zone="private",
    )


def _connection_info_public_unode(target, realm: str) -> ConnectionInfo:
    """Connection info for a public unode (Tailscale Funnel, external access).

    Public unodes expose services over Tailscale Funnel so external users
    (outside the tailnet) can connect. KC for these users must also be
    publicly reachable — this will be a KC instance deployed on the public
    unode itself (not yet fully implemented).
    """
    public_url = (target.raw_metadata.get("public_url") or "").rstrip("/")
    if not public_url:
        raise HTTPException(
            status_code=503,
            detail=f"Public unode '{target.name}' has no public_url configured. "
                   "Set public_url after Tailscale Funnel is active.",
        )

    # KC on the public unode is not yet deployed — for now return the public
    # unode's base URL as the KC URL placeholder so clients can at least
    # discover the endpoint. This will be replaced once public KC is deployed.
    kc_mobile_url = target.raw_metadata.get("keycloak_public_url") or public_url
    logger.warning(
        f"[connect] Public unode '{target.name}' KC URL not yet configured; "
        f"returning public_url as placeholder: {kc_mobile_url}"
    )

    return ConnectionInfo(
        api_url=public_url,
        keycloak_mobile_url=kc_mobile_url,
        realm=realm,
        mobile_client_id="ushadow-public",
        platform="public",
        zone="public",
    )
