"""UNode models for distributed cluster management."""

from datetime import datetime
from enum import Enum
from typing import Optional, List, Dict, Any

from pydantic import BaseModel, Field


class UNodeRole(str, Enum):
    """Role of a u-node in the cluster."""
    LEADER = "leader"       # Control plane + infrastructure
    STANDBY = "standby"     # Can become leader
    WORKER = "worker"       # Runs assigned services only


class UNodeStatus(str, Enum):
    """Connection status of a u-node."""
    ONLINE = "online"
    OFFLINE = "offline"
    CONNECTING = "connecting"
    ERROR = "error"


class UNodePlatform(str, Enum):
    """Platform the u-node is running on."""
    LINUX = "linux"
    MACOS = "macos"
    WINDOWS = "windows"
    UNKNOWN = "unknown"


class UNodeType(str, Enum):
    """Type of deployment target."""
    DOCKER = "docker"        # Traditional Docker host (worker/leader)
    KUBERNETES = "kubernetes"  # Kubernetes cluster


class UNodeCapabilities(BaseModel):
    """Capabilities of a u-node."""
    can_run_docker: bool = True
    can_run_kubernetes: bool = False
    can_run_gpu: bool = False
    can_become_leader: bool = False
    available_memory_mb: int = 0
    available_cpu_cores: float = 0
    available_disk_gb: float = 0


class UNodeBase(BaseModel):
    """Base u-node model."""
    hostname: str = Field(..., description="Tailscale hostname or K8s cluster ID")
    display_name: Optional[str] = None
    type: UNodeType = Field(UNodeType.DOCKER, description="Deployment target type")
    role: UNodeRole = UNodeRole.WORKER
    platform: UNodePlatform = UNodePlatform.UNKNOWN
    tailscale_ip: Optional[str] = None
    capabilities: UNodeCapabilities = Field(default_factory=UNodeCapabilities)
    labels: Dict[str, str] = Field(default_factory=dict)


class UNodeCreate(BaseModel):
    """Model for registering a new u-node."""
    hostname: str
    tailscale_ip: str
    platform: UNodePlatform = UNodePlatform.UNKNOWN
    capabilities: Optional[UNodeCapabilities] = None
    manager_version: str = "0.1.0"


class UNode(UNodeBase):
    """Full u-node model for API responses."""
    id: str
    status: UNodeStatus = UNodeStatus.OFFLINE
    last_seen: Optional[datetime] = None
    registered_at: datetime
    manager_version: str = "0.1.0"
    services: List[str] = Field(default_factory=list)
    error_message: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)

    class Config:
        from_attributes = True


class UNodeInDB(UNodeBase):
    """UNode model as stored in database."""
    id: str
    status: UNodeStatus = UNodeStatus.OFFLINE
    last_seen: Optional[datetime] = None
    registered_at: datetime
    manager_version: str = "0.1.0"
    services: List[str] = Field(default_factory=list)
    error_message: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    # Secret for u-node authentication (hashed)
    unode_secret_hash: str


class JoinToken(BaseModel):
    """Join token for u-node registration."""
    token: str
    created_at: datetime
    expires_at: datetime
    created_by: str  # User ID who created it
    max_uses: int = 1
    uses: int = 0
    role: UNodeRole = UNodeRole.WORKER
    is_active: bool = True


class JoinTokenCreate(BaseModel):
    """Request to create a join token."""
    role: UNodeRole = UNodeRole.WORKER
    max_uses: int = 1
    expires_in_hours: int = 24


class JoinTokenResponse(BaseModel):
    """Response with join token and script."""
    token: str
    expires_at: datetime
    join_command: str  # Bash/shell command (requires Tailscale connected)
    join_command_powershell: str  # PowerShell command (requires Tailscale connected)
    join_script_url: str
    join_script_url_powershell: str
    # Bootstrap commands - work without Tailscale, install everything from scratch
    bootstrap_command: str  # One-liner for bash (Linux/macOS)
    bootstrap_command_powershell: str  # One-liner for PowerShell (Windows)


class UNodeHeartbeat(BaseModel):
    """Heartbeat message from a u-node."""
    hostname: str
    status: UNodeStatus = UNodeStatus.ONLINE
    manager_version: Optional[str] = None
    services_running: List[str] = Field(default_factory=list)
    capabilities: Optional[UNodeCapabilities] = None
    metrics: Dict[str, Any] = Field(default_factory=dict)


class UNodeCommand_not_used(BaseModel):
    """Command to send to a u-node. NOT IN USE - for future distributed cluster commands."""
    command: str  # "start_service", "stop_service", "update", etc.
    target_unode: str  # hostname
    payload: Dict[str, Any] = Field(default_factory=dict)


class UNodeCommandResponse_not_used(BaseModel):
    """Response from a u-node command. NOT IN USE - for future distributed cluster commands."""
    success: bool
    message: str
    data: Optional[Dict[str, Any]] = None
