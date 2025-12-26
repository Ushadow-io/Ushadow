"""UNode management API endpoints."""

import logging
from typing import List, Optional

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
from src.services.auth_dependencies import get_current_user
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
    - Either unregistered or registered to another leader
    """
    hostname = request.get("hostname")
    tailscale_ip = request.get("tailscale_ip")
    
    if not hostname or not tailscale_ip:
        raise HTTPException(status_code=400, detail="hostname and tailscale_ip are required")
    
    unode_manager = await get_unode_manager()
    
    # Create a registration request for this node
    unode_create = UNodeCreate(
        hostname=hostname,
        tailscale_ip=tailscale_ip,
        platform="linux",  # Will be updated by actual registration
        manager_version="0.1.0",
        role=UNodeRole.WORKER,
        capabilities=None  # Will be provided by the node
    )
    
    # For now, create a basic registration
    # In a full implementation, you'd want to contact the node's u-node manager
    # and have it re-register with this leader
    success, unode, error = await unode_manager.register_unode(
        token_doc=None,  # Claiming doesn't require a token
        unode_data=unode_create
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
