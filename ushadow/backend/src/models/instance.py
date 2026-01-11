"""
Instance and Wiring Models

Unified model for service/provider instances and capability wiring.

Core concepts:
- Template: Discovered from compose/*.yaml or providers/*.yaml
- Instance: Template + Config Set + Deployment Target
- Wiring: Connects instance outputs to instance inputs
"""

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from .integration import IntegrationType


class TemplateSource(str, Enum):
    """Where a template was discovered from."""
    COMPOSE = "compose"      # compose/*.yaml
    PROVIDER = "provider"    # providers/*.yaml


class InstanceStatus(str, Enum):
    """Status of an instance."""
    PENDING = "pending"          # Created but not deployed
    DEPLOYING = "deploying"      # Deployment in progress
    RUNNING = "running"          # Deployed and running
    STOPPED = "stopped"          # Deployed but stopped
    ERROR = "error"              # Deployment failed
    NOT_APPLICABLE = "n/a"       # Cloud providers (no deployment needed)


class Template(BaseModel):
    """
    A discoverable service or provider template.

    Templates are discovered from compose files or provider definitions.
    They define the "shape" of a service - what it needs and provides.
    """
    id: str = Field(..., description="Template identifier (e.g., 'openmemory', 'openai')")
    source: TemplateSource = Field(..., description="Where this was discovered from")
    name: str = Field(..., description="Display name")
    description: Optional[str] = Field(None, description="Human-readable description")

    # Capability requirements and provisions
    requires: List[str] = Field(default_factory=list, description="Capability inputs (e.g., ['llm'])")
    optional: List[str] = Field(default_factory=list, description="Optional capabilities")
    provides: Optional[str] = Field(None, description="Capability this provides (e.g., 'memory')")

    # Config schema - what can be configured when creating an instance
    config_schema: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Schema for configurable fields"
    )

    # Source reference
    compose_file: Optional[str] = Field(None, description="Path to compose file (if source=compose)")
    service_name: Optional[str] = Field(None, description="Service name in compose file")
    provider_file: Optional[str] = Field(None, description="Path to provider file (if source=provider)")

    # Mode
    mode: Optional[str] = Field(None, description="'cloud' or 'local'")

    # UI metadata
    icon: Optional[str] = None
    tags: List[str] = Field(default_factory=list)

    # Configuration status (for providers - whether required keys are set)
    configured: bool = Field(default=True, description="Whether required config is present")

    # Availability status (for local providers - whether service is running)
    available: bool = Field(default=True, description="Whether local service is running/reachable")


class InstanceConfig(BaseModel):
    """Configuration values for an instance."""
    values: Dict[str, Any] = Field(default_factory=dict, description="Config key-value pairs")


class InstanceOutputs(BaseModel):
    """Outputs from an instance after deployment."""
    access_url: Optional[str] = Field(None, description="URL to access the service")
    env_vars: Dict[str, str] = Field(default_factory=dict, description="Resolved environment variables")
    capability_values: Dict[str, Any] = Field(
        default_factory=dict,
        description="Values for the capability this instance provides"
    )


class Instance(BaseModel):
    """
    An instance of a template with configuration applied.

    Instance = Template + Config Set + Deployment Target

    Instances have inputs (config values, capability requirements)
    and outputs (resolved config + access URL after deployment).
    """
    id: str = Field(..., description="Unique instance identifier (e.g., 'openmemory-prod')")
    template_id: str = Field(..., description="Reference to the template")
    name: str = Field(..., description="Display name for this instance")
    description: Optional[str] = Field(None, description="Instance description")

    # Configuration
    config: InstanceConfig = Field(default_factory=InstanceConfig, description="Config values")

    # Deployment
    deployment_target: Optional[str] = Field(
        None,
        description="Deployment target: None=local docker, hostname=u-node, 'cloud'=no deployment"
    )
    status: InstanceStatus = Field(default=InstanceStatus.PENDING, description="Current status")

    # Outputs (populated after deployment or for cloud providers)
    outputs: InstanceOutputs = Field(default_factory=InstanceOutputs, description="Instance outputs")

    # Deployment tracking
    container_id: Optional[str] = Field(None, description="Docker container ID when deployed")
    container_name: Optional[str] = Field(None, description="Container name")
    deployment_id: Optional[str] = Field(None, description="Reference to Deployment record if remote")

    # Timestamps
    created_at: Optional[datetime] = None
    deployed_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    # Error tracking
    error: Optional[str] = None

    # Integration-specific fields (null for non-integrations)
    integration_type: Optional[IntegrationType] = Field(
        None,
        description="Integration type (filesystem, rest, graphql) - null for non-integrations"
    )
    sync_enabled: Optional[bool] = Field(None, description="Whether auto-sync is enabled")
    sync_interval: Optional[int] = Field(None, description="Sync interval in seconds (e.g., 21600 for 6 hours)")
    last_sync_at: Optional[datetime] = Field(None, description="Timestamp of last successful sync")
    last_sync_status: Optional[str] = Field(
        None,
        description="Status of last sync: 'success', 'error', 'in_progress', 'never'"
    )
    last_sync_items_count: Optional[int] = Field(None, description="Number of items synced in last sync")
    last_sync_error: Optional[str] = Field(None, description="Error message from last failed sync")
    next_sync_at: Optional[datetime] = Field(None, description="Computed timestamp of next scheduled sync")

    model_config = {"use_enum_values": True}


class Wiring(BaseModel):
    """
    Connects an instance output to an instance input.

    When wired, the source instance's output values override
    the target instance's input configuration for that capability.
    """
    id: str = Field(..., description="Unique wiring identifier")

    # Source (provides the capability)
    source_instance_id: str = Field(..., description="Instance providing the capability")
    source_capability: str = Field(..., description="Capability being provided (e.g., 'llm', 'memory')")

    # Target (consumes the capability)
    target_instance_id: str = Field(..., description="Instance consuming the capability")
    target_capability: str = Field(..., description="Capability slot being filled")

    # Metadata
    created_at: Optional[datetime] = None
    created_by: Optional[str] = None


# API Request/Response Models

class InstanceCreate(BaseModel):
    """Request to create a new instance."""
    id: str = Field(..., min_length=1, max_length=100, pattern=r'^[a-z0-9-]+$')
    template_id: str = Field(..., description="Template to instantiate")
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    config: Dict[str, Any] = Field(default_factory=dict, description="Config values")
    deployment_target: Optional[str] = Field(None, description="Where to deploy")


class InstanceUpdate(BaseModel):
    """Request to update an instance."""
    name: Optional[str] = None
    description: Optional[str] = None
    config: Optional[Dict[str, Any]] = None
    deployment_target: Optional[str] = None


class WiringCreate(BaseModel):
    """Request to create a wiring connection."""
    source_instance_id: str
    source_capability: str
    target_instance_id: str
    target_capability: str


class InstanceSummary(BaseModel):
    """Lightweight instance info for listings."""
    id: str
    template_id: str
    name: str
    status: InstanceStatus
    provides: Optional[str] = None
    deployment_target: Optional[str] = None
    access_url: Optional[str] = None

    model_config = {"use_enum_values": True}
