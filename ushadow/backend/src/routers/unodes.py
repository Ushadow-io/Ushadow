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
