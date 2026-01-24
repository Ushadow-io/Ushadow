"""
ServiceConfig and Wiring Models

Unified model for service/provider instances and capability wiring.

Core concepts:
- Template: Discovered from compose/*.yaml or providers/*.yaml
- ServiceConfig: Template + Config Set + Deployment Target
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


class ServiceConfigStatus(str, Enum):
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

    # Installation status (for compose services - whether service is installed)
    installed: bool = Field(default=True, description="Whether service is installed (default or user-added)")


class ConfigValues(BaseModel):
    """Configuration values for an instance."""
    values: Dict[str, Any] = Field(default_factory=dict, description="Config key-value pairs")


class EnvVarSource(str, Enum):
    """Source of an environment variable value."""
    OS_ENVIRON = "os.environ"          # From host environment variables
    DEFAULT = "default"                # From template default value
    SETTINGS = "settings"              # From global settings store
    PROVIDER = "provider"              # From wired provider instance
    OVERRIDE = "override"              # From ServiceConfig-specific override
    INFRASTRUCTURE = "infrastructure"  # From K8s/deployment backend


class EnvVarValue(BaseModel):
    """Environment variable with source tracking."""
    value: str = Field(..., description="Resolved value")
    source: EnvVarSource = Field(..., description="Where this value came from")
    source_path: Optional[str] = Field(None, description="Path/identifier in the source (e.g., settings path, provider ID)")


class ServiceOutputs(BaseModel):
    """Outputs from an instance after deployment."""
    access_url: Optional[str] = Field(None, description="URL to access the service")
    env_vars: Dict[str, EnvVarValue] = Field(
        default_factory=dict,
        description="Resolved environment variables with source tracking"
    )
    capability_values: Dict[str, Any] = Field(
        default_factory=dict,
        description="Values for the capability this instance provides"
    )


class ServiceConfig(BaseModel):
    """
    Configuration mappings for a service (reusable across deployments).

    ServiceConfig = Template + Configuration Mappings

    Stores ONLY configuration (@settings.path mappings or literal values).
    Does NOT store deployment state - see Deployment model for runtime state.
    """
    id: str = Field(..., description="Unique config identifier (e.g., 'chronicle-prod-config')")
    template_id: str = Field(..., description="Reference to the template")
    name: str = Field(..., description="Display name for this config")
    description: Optional[str] = Field(None, description="Config description")

    # Configuration mappings (@settings.path or literals)
    config: ConfigValues = Field(default_factory=ConfigValues, description="Config values")

    # Timestamps (for config tracking)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    # Integration-specific configuration (null for non-integrations)
    integration_type: Optional[IntegrationType] = Field(
        None,
        description="Integration type (filesystem, rest, graphql) - null for non-integrations"
    )
    sync_enabled: Optional[bool] = Field(None, description="Whether auto-sync is enabled (config)")
    sync_interval: Optional[int] = Field(None, description="Sync interval in seconds (config, e.g., 21600 for 6 hours)")

    model_config = {"use_enum_values": True}


class Wiring(BaseModel):
    """
    Connects an instance output to an instance input.

    When wired, the source instance's output values override
    the target instance's input configuration for that capability.
    """
    id: str = Field(..., description="Unique wiring identifier")

    # Source (provides the capability)
    source_config_id: str = Field(..., description="ServiceConfig providing the capability")
    source_capability: str = Field(..., description="Capability being provided (e.g., 'llm', 'memory')")

    # Target (consumes the capability)
    target_config_id: str = Field(..., description="ServiceConfig consuming the capability")
    target_capability: str = Field(..., description="Capability slot being filled")

    # Metadata
    created_at: Optional[datetime] = None
    created_by: Optional[str] = None


# API Request/Response Models

class ServiceConfigCreate(BaseModel):
    """Request to create a new service configuration."""
    id: str = Field(..., min_length=1, max_length=100, pattern=r'^[a-z0-9-]+$')
    template_id: str = Field(..., description="Template to instantiate")
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    config: Dict[str, Any] = Field(default_factory=dict, description="Config values")


class ServiceConfigUpdate(BaseModel):
    """Request to update a service configuration."""
    name: Optional[str] = None
    description: Optional[str] = None
    config: Optional[Dict[str, Any]] = None


class WiringCreate(BaseModel):
    """Request to create a wiring connection."""
    source_config_id: str
    source_capability: str
    target_config_id: str
    target_capability: str


class ServiceConfigSummary(BaseModel):
    """Lightweight config info for listings."""
    id: str
    template_id: str
    name: str
    provides: Optional[str] = None
    description: Optional[str] = None
