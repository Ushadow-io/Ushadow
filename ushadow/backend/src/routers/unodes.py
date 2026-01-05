"""UNode management API endpoints."""

import logging
import os
from typing import List, Optional

import httpx
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel

from src.models.unode import (
    UNode,
    UNodeRole,
    UNodeStatus,
    UNodeCreate,
    UNodeHeartbeat,
    JoinTokenCreate,
    JoinTokenResponse,
    UNodeCapabilities,
    UNodePlatform,
)
from src.services.unode_manager import get_unode_manager
from src.services.auth import get_current_user
from src.services.tailscale_serve import get_tailscale_status
from src.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter()


# Request/Response models
class UNodeRegistrationRequest(BaseModel):
    """Request to register a u-node."""
    token: str
    hostname: str
    tailscale_ip: str
    platform: str = "unknown"
    manager_version: str = "0.1.0"
    capabilities: Optional[UNodeCapabilities] = None


class UNodeRegistrationResponse(BaseModel):
    """Response from u-node registration."""
    success: bool
    message: str
    unode: Optional[UNode] = None


class UNodeListResponse(BaseModel):
    """Response with list of u-nodes."""
    unodes: List[UNode]
    total: int


class UNodeActionResponse(BaseModel):
    """Response from a u-node action."""
    success: bool
    message: str


# Public endpoints (for u-node registration)
@router.get("/join/{token}", response_class=PlainTextResponse)
async def get_join_script(token: str):
    """
    Get the join script for a token (bash).
    This is called by: curl -sL "http://leader/api/unodes/join/TOKEN" | sh
    """
    unode_manager = await get_unode_manager()
    script = await unode_manager.get_join_script(token)
    return PlainTextResponse(content=script, media_type="text/plain")


@router.get("/join/{token}/ps1", response_class=PlainTextResponse)
async def get_join_script_powershell(token: str):
    """
    Get the join script for a token (PowerShell).
    This is called by: iex (iwr "http://leader/api/unodes/join/TOKEN/ps1").Content
    """
    unode_manager = await get_unode_manager()
    script = await unode_manager.get_join_script_powershell(token)
    return PlainTextResponse(content=script, media_type="text/plain")


@router.get("/bootstrap/{token}", response_class=PlainTextResponse)
async def get_bootstrap_script(token: str):
    """
    Get the bootstrap script for a token (bash).
    Works on machines without Tailscale - installs everything from scratch.
    Usage: curl -sL "http://PUBLIC_IP:8000/api/unodes/bootstrap/TOKEN" | sh
    """
    unode_manager = await get_unode_manager()
    script = await unode_manager.get_bootstrap_script_bash(token)
    return PlainTextResponse(content=script, media_type="text/plain")


@router.get("/bootstrap/{token}/ps1", response_class=PlainTextResponse)
async def get_bootstrap_script_powershell(token: str):
    """
    Get the bootstrap script for a token (PowerShell).
    Works on machines without Tailscale - installs everything from scratch.
    Usage: iex (iwr "http://PUBLIC_IP:8000/api/unodes/bootstrap/TOKEN/ps1").Content
    """
    unode_manager = await get_unode_manager()
    script = await unode_manager.get_bootstrap_script_powershell(token)
    return PlainTextResponse(content=script, media_type="text/plain")


@router.post("/register", response_model=UNodeRegistrationResponse)
async def register_unode(request: UNodeRegistrationRequest):
    """
    Register a new u-node with the cluster.
    Called by the join script.
    """
    unode_manager = await get_unode_manager()

    # Convert platform string to enum
    try:
        platform = UNodePlatform(request.platform)
    except ValueError:
        platform = UNodePlatform.UNKNOWN

    unode_create = UNodeCreate(
        hostname=request.hostname,
        tailscale_ip=request.tailscale_ip,
        platform=platform,
        manager_version=request.manager_version,
        capabilities=request.capabilities,
    )

    success, unode, error = await unode_manager.register_unode(
        request.token,
        unode_create
    )

    if not success:
        return UNodeRegistrationResponse(
            success=False,
            message=error,
            unode=None
        )

    return UNodeRegistrationResponse(
        success=True,
        message="UNode registered successfully",
        unode=unode
    )


@router.post("/heartbeat", response_model=UNodeActionResponse)
async def unode_heartbeat(heartbeat: UNodeHeartbeat):
    """
    Receive a heartbeat from a u-node.
    Called periodically by ushadow-manager.
    """
    unode_manager = await get_unode_manager()
    success = await unode_manager.process_heartbeat(heartbeat)

    if not success:
        raise HTTPException(status_code=404, detail="UNode not found")

    return UNodeActionResponse(success=True, message="Heartbeat received")


# Authenticated endpoints (for UI/admin)
@router.get("", response_model=UNodeListResponse)
async def list_unodes(
    status: Optional[UNodeStatus] = None,
    role: Optional[UNodeRole] = None,
    current_user: User = Depends(get_current_user)
):
    """
    List all u-nodes in the cluster.
    """
    unode_manager = await get_unode_manager()
    unodes = await unode_manager.list_unodes(status=status, role=role)

    return UNodeListResponse(unodes=unodes, total=len(unodes))


@router.get("/discover/peers", response_model=dict)
async def discover_peers(
    current_user: User = Depends(get_current_user)
):
    """
    Discover all Tailscale peers on the network.
    
    Returns:
    - registered: Nodes registered to this leader
    - available: Nodes with u-node manager but not registered here
    - unknown: Other Tailscale peers without u-node manager
    """
    unode_manager = await get_unode_manager()
    peers = await unode_manager.discover_tailscale_peers()
    
    # Categorize peers by status
    categorized = {
        "registered": [],
        "available": [],
        "unknown": []
    }
    
    for peer in peers:
        status = peer.get("status", "unknown")
        categorized.get(status, categorized["unknown"]).append(peer)
    
    return {
        "peers": categorized,
        "total": len(peers),
        "counts": {k: len(v) for k, v in categorized.items()}
    }


@router.post("/claim", response_model=UNodeRegistrationResponse)
async def claim_node(
    request: dict,
    current_user: User = Depends(get_current_user)
):
    """
    Claim an available u-node by registering it to this leader.
    
    This endpoint allows claiming nodes that are:
    - Discovered on Tailscale network
    - Running u-node manager
    - Either unregistered or released from another leader
    """
    hostname = request.get("hostname")
    tailscale_ip = request.get("tailscale_ip")
    
    if not hostname or not tailscale_ip:
        raise HTTPException(status_code=400, detail="hostname and tailscale_ip are required")
    
    unode_manager = await get_unode_manager()
    
    # Use the claim_unode method which doesn't require a token
    success, unode, error = await unode_manager.claim_unode(
        hostname=hostname,
        tailscale_ip=tailscale_ip
    )
    
    if not success:
        return UNodeRegistrationResponse(
            success=False,
            message=error,
            unode=None
        )
    
    return UNodeRegistrationResponse(
        success=True,
        message=f"Successfully claimed node {hostname}",
        unode=unode
    )


# Constants for version fetching
GHCR_REGISTRY = "ghcr.io"
GHCR_IMAGE = "ushadow-io/ushadow-manager"


class ManagerVersionsResponse(BaseModel):
    """Response with available manager versions."""
    versions: List[str]
    latest: str
    registry: str
    image: str


@router.get("/versions", response_model=ManagerVersionsResponse)
async def get_manager_versions(
    current_user: User = Depends(get_current_user)
):
    """
    Get available ushadow-manager versions from the container registry.

    Fetches tags from ghcr.io/ushadow-io/ushadow-manager and returns
    them sorted with semantic versioning (latest first).
    """
    try:
        # Get anonymous token for public repo
        async with httpx.AsyncClient(timeout=10.0) as client:
            token_response = await client.get(
                f"https://{GHCR_REGISTRY}/token",
                params={"scope": f"repository:{GHCR_IMAGE}:pull"}
            )

            if token_response.status_code != 200:
                raise HTTPException(
                    status_code=502,
                    detail="Failed to authenticate with container registry"
                )

            token = token_response.json().get("token")

            # Fetch tags
            tags_response = await client.get(
                f"https://{GHCR_REGISTRY}/v2/{GHCR_IMAGE}/tags/list",
                headers={"Authorization": f"Bearer {token}"}
            )

            if tags_response.status_code != 200:
                raise HTTPException(
                    status_code=502,
                    detail="Failed to fetch tags from container registry"
                )

            data = tags_response.json()
            tags = data.get("tags", [])

            if not tags:
                # Return default if no tags found
                return ManagerVersionsResponse(
                    versions=["latest"],
                    latest="latest",
                    registry=GHCR_REGISTRY,
                    image=GHCR_IMAGE
                )

            # Sort versions: 'latest' first, then semantic versions descending
            def version_sort_key(v: str) -> tuple:
                if v == "latest":
                    return (0, 0, 0, 0)  # Always first
                # Try to parse semantic version
                try:
                    # Remove 'v' prefix if present
                    clean = v.lstrip("v")
                    parts = clean.split(".")
                    # Pad to 3 parts
                    while len(parts) < 3:
                        parts.append("0")
                    return (1, -int(parts[0]), -int(parts[1]), -int(parts[2]))
                except (ValueError, IndexError):
                    return (2, 0, 0, 0)  # Non-semantic versions last

            sorted_tags = sorted(tags, key=version_sort_key)

            return ManagerVersionsResponse(
                versions=sorted_tags,
                latest=sorted_tags[0] if sorted_tags else "latest",
                registry=GHCR_REGISTRY,
                image=GHCR_IMAGE
            )

    except httpx.RequestError as e:
        # Log full error internally but don't expose details to client
        logger.error(f"Failed to fetch versions from registry: {e}")
        raise HTTPException(
            status_code=502,
            detail="Failed to connect to container registry. Please try again later."
        )


class ServiceDeployment(BaseModel):
    """A service deployed on a unode."""
    name: str
    display_name: str
    status: str  # running, stopped, etc.
    unode_hostname: str
    route_path: Optional[str] = None  # e.g., "/chronicle"
    internal_port: Optional[int] = None  # Container's internal port
    external_url: Optional[str] = None  # e.g., "https://pink.spangled-kettle.ts.net/chronicle"
    internal_url: Optional[str] = None  # e.g., "http://ushadow-pink-chronicle-backend:8000"
    # Legacy WebSocket URLs (for chronicle service)
    ws_pcm_url: Optional[str] = None  # WebSocket for PCM audio streaming
    ws_omi_url: Optional[str] = None  # WebSocket for OMI format streaming


class LeaderInfoResponse(BaseModel):
    """Full leader information for mobile app connection.

    This endpoint returns everything the mobile app needs after connecting:
    - Leader node details and capabilities
    - WebSocket streaming URLs for audio
    - All unodes in the cluster
    - Services deployed across the cluster
    """
    # Leader info
    hostname: str
    tailscale_ip: str
    tailscale_hostname: Optional[str] = None  # Full Tailscale DNS name
    capabilities: UNodeCapabilities
    api_port: int = 8000

    # API URLs for specific services
    ushadow_api_url: str  # Main ushadow backend API
    chronicle_api_url: Optional[str] = None  # Chronicle/OMI backend API (if running)

    # Streaming URLs (only available when Chronicle service is running)
    ws_pcm_url: Optional[str] = None  # WebSocket for PCM audio streaming
    ws_omi_url: Optional[str] = None  # WebSocket for OMI format streaming

    # Cluster info
    unodes: List[UNode]  # Physical/virtual nodes in the cluster
    services: List[ServiceDeployment]  # Actually deployed services (from docker)


@router.get("/leader/info", response_model=LeaderInfoResponse)
async def get_leader_info():
    """
    Get full leader information for mobile app connection.

    This is an unauthenticated endpoint that returns leader details
    for mobile apps that have just connected via QR code.
    The mobile app uses this to display cluster status and capabilities.
    """
    from src.services.docker_manager import get_docker_manager

    unode_manager = await get_unode_manager()
    docker_mgr = get_docker_manager()

    # Get the leader unode
    leader = await unode_manager.get_unode_by_role(UNodeRole.LEADER)
    if not leader:
        raise HTTPException(
            status_code=404,
            detail="Leader node not found. Cluster may not be initialized."
        )

    # Get all unodes for cluster topology info
    unodes = await unode_manager.list_unodes()

    # Get Tailscale status (single source of truth)
    ts_status = get_tailscale_status()
    tailscale_hostname = ts_status.hostname  # e.g., "blue.spangled-kettle.ts.net"
    api_port = 8000

    # Build main API URLs
    if tailscale_hostname:
        ushadow_api_url = f"https://{tailscale_hostname}"
    else:
        ushadow_api_url = f"http://{leader.tailscale_ip}:{api_port}"

    # Build service deployments with URLs from compose registry
    from src.services.compose_registry import get_compose_registry

    env_name = os.getenv("COMPOSE_PROJECT_NAME", "").strip() or "ushadow"
    compose_registry = get_compose_registry()

    # Get Chronicle service route_path for WebSocket URLs
    chronicle_service = compose_registry.get_service_by_name("chronicle-backend")
    chronicle_route = chronicle_service.route_path if chronicle_service else None

    # Build Chronicle API URL
    chronicle_api_url = None
    if tailscale_hostname and chronicle_route:
        chronicle_api_url = f"https://{tailscale_hostname}{chronicle_route}"

    # Build WebSocket URLs from Chronicle's route_path
    ws_pcm_url = None
    ws_omi_url = None
    if tailscale_hostname and chronicle_route:
        ws_pcm_url = f"wss://{tailscale_hostname}{chronicle_route}/ws_pcm"
        ws_omi_url = f"wss://{tailscale_hostname}{chronicle_route}/ws_omi"

    services: List[ServiceDeployment] = []
    for unode in unodes:
        for service_name in unode.services:
            # Look up service in compose registry for route_path and ports
            discovered_service = compose_registry.get_service_by_name(service_name)

            route_path = None
            internal_port = None
            external_url = None
            internal_url = None
            display_name = service_name.replace("_", " ").replace("-", " ").title()

            if discovered_service:
                route_path = discovered_service.route_path
                display_name = discovered_service.display_name or display_name

                # Get internal port from compose ports
                if discovered_service.ports:
                    container_port = discovered_service.ports[0].get("container")
                    if container_port:
                        try:
                            internal_port = int(container_port)
                        except (ValueError, TypeError):
                            pass

                # Build container name
                container_name = f"{env_name}-{service_name}"

                # Build internal URL (container-to-container)
                if internal_port:
                    internal_url = f"http://{container_name}:{internal_port}"

                # Build external URL (through Tailscale Serve)
                if route_path and tailscale_hostname:
                    external_url = f"https://{tailscale_hostname}{route_path}"

            # Add WebSocket URLs for chronicle service (legacy support)
            service_ws_pcm_url = None
            service_ws_omi_url = None
            if service_name == "chronicle-backend" and tailscale_hostname and route_path:
                service_ws_pcm_url = f"wss://{tailscale_hostname}{route_path}/ws_pcm"
                service_ws_omi_url = f"wss://{tailscale_hostname}{route_path}/ws_omi"

            services.append(ServiceDeployment(
                name=service_name,
                display_name=display_name,
                status="running",  # TODO: Get actual status from docker
                unode_hostname=unode.hostname,
                route_path=route_path,
                internal_port=internal_port,
                external_url=external_url,
                internal_url=internal_url,
                ws_pcm_url=service_ws_pcm_url,
                ws_omi_url=service_ws_omi_url,
            ))

    return LeaderInfoResponse(
        hostname=leader.hostname,
        tailscale_ip=leader.tailscale_ip,
        tailscale_hostname=tailscale_hostname,
        capabilities=leader.capabilities,
        api_port=api_port,
        ushadow_api_url=ushadow_api_url,
        chronicle_api_url=chronicle_api_url,
        ws_pcm_url=ws_pcm_url,
        ws_omi_url=ws_omi_url,
        unodes=unodes,
        services=services,
    )


@router.get("/{hostname}", response_model=UNode)
async def get_unode(
    hostname: str,
    current_user: User = Depends(get_current_user)
):
    """
    Get details of a specific u-node.
    """
    unode_manager = await get_unode_manager()
    unode = await unode_manager.get_unode(hostname)

    if not unode:
        raise HTTPException(status_code=404, detail="UNode not found")

    return unode


@router.post("/tokens", response_model=JoinTokenResponse)
async def create_join_token(
    request: JoinTokenCreate,
    current_user: User = Depends(get_current_user)
):
    """
    Create a join token for new u-nodes.
    Returns the token and a one-liner join command.
    """
    unode_manager = await get_unode_manager()
    response = await unode_manager.create_join_token(
        user_id=current_user.id,
        request=request
    )

    return response


@router.delete("/{hostname}", response_model=UNodeActionResponse)
async def remove_unode(
    hostname: str,
    current_user: User = Depends(get_current_user)
):
    """
    Remove a u-node from the cluster.
    """
    unode_manager = await get_unode_manager()

    # Prevent removing the leader
    unode = await unode_manager.get_unode(hostname)
    if unode and unode.role == UNodeRole.LEADER:
        raise HTTPException(
            status_code=400,
            detail="Cannot remove the leader u-node. Transfer leadership first."
        )

    success = await unode_manager.remove_unode(hostname)

    if not success:
        raise HTTPException(status_code=404, detail="UNode not found")

    return UNodeActionResponse(success=True, message=f"UNode {hostname} removed")


@router.post("/{hostname}/release", response_model=UNodeActionResponse)
async def release_unode(
    hostname: str,
    current_user: User = Depends(get_current_user)
):
    """
    Release a u-node so it can be claimed by another leader.

    This removes the node from this leader's cluster but keeps the worker's
    manager container running. The node will appear in the "Discovered" tab
    for other leaders to claim.
    """
    unode_manager = await get_unode_manager()

    success, message = await unode_manager.release_unode(hostname)

    if not success:
        raise HTTPException(status_code=400, detail=message)

    return UNodeActionResponse(success=True, message=message)


@router.post("/{hostname}/status", response_model=UNodeActionResponse)
async def update_unode_status(
    hostname: str,
    status: UNodeStatus,
    current_user: User = Depends(get_current_user)
):
    """
    Manually update a u-node's status.
    """
    unode_manager = await get_unode_manager()
    success = await unode_manager.update_unode_status(hostname, status)

    if not success:
        raise HTTPException(status_code=404, detail="UNode not found")

    return UNodeActionResponse(
        success=True,
        message=f"UNode {hostname} status updated to {status.value}"
    )


class UpgradeRequest(BaseModel):
    """Request to upgrade a u-node's manager."""
    version: str = "latest"  # Version tag (e.g., "latest", "0.2.0", "v0.2.0")
    registry: str = "ghcr.io/ushadow-io"  # Container registry

    @property
    def image(self) -> str:
        """Get the full image reference."""
        return f"{self.registry}/ushadow-manager:{self.version}"


class UpgradeResponse(BaseModel):
    """Response from upgrade request."""
    success: bool
    message: str
    hostname: str
    new_image: Optional[str] = None


@router.post("/{hostname}/upgrade", response_model=UpgradeResponse)
async def upgrade_unode(
    hostname: str,
    request: UpgradeRequest = UpgradeRequest(),
    current_user: User = Depends(get_current_user)
):
    """
    Upgrade a u-node's manager to a new version.

    This triggers the remote node to:
    1. Pull the new manager image
    2. Stop and remove its current container
    3. Start a new container with the new image

    The node will be briefly offline during the upgrade (~10 seconds).
    """
    unode_manager = await get_unode_manager()

    # Get the node
    unode = await unode_manager.get_unode(hostname)
    if not unode:
        raise HTTPException(status_code=404, detail="UNode not found")

    # Can't upgrade the leader this way (it runs differently)
    if unode.role == UNodeRole.LEADER:
        raise HTTPException(
            status_code=400,
            detail="Cannot upgrade leader via this endpoint. Update leader containers directly."
        )

    # Check node is online
    if unode.status != UNodeStatus.ONLINE:
        raise HTTPException(
            status_code=400,
            detail=f"UNode is {unode.status.value}. Must be online to upgrade."
        )

    # Trigger upgrade on the remote node
    success, message = await unode_manager.upgrade_unode(
        hostname=hostname,
        image=request.image
    )

    return UpgradeResponse(
        success=success,
        message=message,
        hostname=hostname,
        new_image=request.image if success else None
    )


@router.post("/upgrade-all", response_model=dict)
async def upgrade_all_unodes(
    request: UpgradeRequest = UpgradeRequest(),
    current_user: User = Depends(get_current_user)
):
    """
    Upgrade all online worker u-nodes to a new manager version.

    This performs a rolling upgrade across all workers.
    """
    unode_manager = await get_unode_manager()

    # Get all online workers
    unodes = await unode_manager.list_unodes(status=UNodeStatus.ONLINE)
    workers = [n for n in unodes if n.role == UNodeRole.WORKER]

    results = {
        "total": len(workers),
        "succeeded": [],
        "failed": [],
        "image": request.image
    }

    for unode in workers:
        success, message = await unode_manager.upgrade_unode(
            hostname=unode.hostname,
            image=request.image
        )

        if success:
            results["succeeded"].append(unode.hostname)
        else:
            results["failed"].append({"hostname": unode.hostname, "error": message})

    return results
