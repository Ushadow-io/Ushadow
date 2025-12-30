"""
Service Configuration Models

Defines the schema for service definitions loaded from config/services/*.yaml
Each service is self-contained - no template indirection needed.
"""

from enum import Enum
from typing import Any, Dict, List, Optional, Union
from pydantic import BaseModel, Field


# =============================================================================
# Enums
# =============================================================================

class ServiceType(str, Enum):
    """Service category - matches service_types in config/services.yaml."""
    MEMORY = "memory"
    LLM = "llm"
    TRANSCRIPTION = "transcription"
    CONVERSATION_ENGINE = "conversation_engine"
    INFRASTRUCTURE = "infrastructure"


class OptionType(str, Enum):
    """Types of user-configurable options."""
    BOOLEAN = "boolean"
    STRING = "string"
    NUMBER = "number"
    SELECT = "select"


# =============================================================================
# Container Components
# =============================================================================

class Port(BaseModel):
    """Container port mapping."""
    container: int = Field(..., description="Port inside the container")
    host: Optional[int] = Field(None, description="Port on host (defaults to container port)")
    protocol: str = Field("http", description="Protocol: http, grpc, tcp, bolt")


class Volume(BaseModel):
    """Volume mount configuration."""
    name: str = Field(..., description="Volume name (used for Docker named volumes)")
    path: str = Field(..., description="Mount path inside container")
    persistent: bool = Field(True, description="Whether to persist across restarts")


class HealthCheck(BaseModel):
    """Container health check configuration."""
    http_get: Optional[str] = Field(None, description="HTTP endpoint to check")
    exec: Optional[List[str]] = Field(None, description="Command to execute")
    port: Optional[int] = Field(None, description="Port for HTTP health checks (required if http_get)")
    interval: str = Field("10s", description="Check interval")
    timeout: str = Field("5s", description="Check timeout")
    retries: int = Field(3, description="Retries before unhealthy")
    start_period: Optional[str] = Field(None, description="Initial delay before checks")


class EnvConfig(BaseModel):
    """Environment variable configuration for a container or cloud service."""
    required: List[str] = Field(default_factory=list, description="Required env vars")
    optional: List[str] = Field(default_factory=list, description="Optional env vars")
    values: Dict[str, str] = Field(default_factory=dict, description="Static env values")


class DeployResources(BaseModel):
    """Resource reservations (e.g., GPU)."""
    reservations: Optional[Dict[str, Any]] = None


class DeployConfig(BaseModel):
    """Container deployment configuration."""
    resources: Optional[DeployResources] = None


class Container(BaseModel):
    """Container definition for local services."""
    name: str = Field(..., description="Container/service name")
    image: str = Field(..., description="Docker image")
    ports: List[Port] = Field(default_factory=list)
    env: Optional[EnvConfig] = None
    volumes: List[Volume] = Field(default_factory=list)
    health: Optional[HealthCheck] = None
    command: Optional[List[str]] = Field(None, description="Override container command")
    deploy: Optional[DeployConfig] = Field(None, description="Deployment config (GPU, etc.)")


# =============================================================================
# Service Options (User-Configurable)
# =============================================================================

class OptionChoice(BaseModel):
    """A choice in a select option."""
    value: str
    label: str
    requires_env: Optional[str] = Field(None, description="Env var required for this choice")


class ServiceOption(BaseModel):
    """User-configurable option shown in wizard/settings."""
    type: OptionType
    label: str
    description: Optional[str] = None
    default: Optional[Any] = None

    # For select type
    choices: Optional[List[OptionChoice]] = None

    # For number type
    min: Optional[float] = None
    max: Optional[float] = None
    step: Optional[float] = None

    # For boolean that enables a dependency
    triggers_dependency: Optional[str] = Field(
        None,
        description="Infrastructure service to start when this is true"
    )


# =============================================================================
# Environment Variable Overrides
# =============================================================================

class EnvOverride(BaseModel):
    """Per-service override for global env var mapping."""
    settings_path: str = Field(..., description="Path in settings/secrets store")
    link: Optional[str] = Field(None, description="URL to obtain this credential")
    description: Optional[str] = None


# =============================================================================
# Dependencies
# =============================================================================

class Dependencies(BaseModel):
    """Service dependencies on infrastructure."""
    required: List[str] = Field(default_factory=list, description="Always started")
    optional: List[str] = Field(default_factory=list, description="Started if triggered")


# =============================================================================
# API Configuration (Cloud Services)
# =============================================================================

class ApiConfig(BaseModel):
    """API configuration for cloud services."""
    auth_header: str = Field("Authorization", description="Header name for auth token")
    auth_prefix: str = Field("Bearer", description="Prefix for auth header value")


# =============================================================================
# Main Service Model
# =============================================================================

class Service(BaseModel):
    """
    Complete service definition.

    Loaded from config/services/*.yaml or config/services/infrastructure/*.yaml
    Each service is self-contained with all configuration needed.
    """
    # Identity
    id: str = Field(..., pattern=r'^[a-z0-9-]+$', description="Unique service identifier")
    type: ServiceType = Field(..., description="Service category")
    name: str = Field(..., description="Display name")
    description: str = Field("", description="Service description")
    is_default: bool = Field(False, description="Show in quickstart wizard")

    # Mode: cloud services have api_base, local services have containers
    mode: Optional[str] = Field(None, description="'cloud' for cloud services, None for local")
    api_base: Optional[str] = Field(None, description="Base URL for cloud APIs")
    api_config: Optional[ApiConfig] = Field(None, description="API auth configuration")

    # Containers (for local services)
    containers: List[Container] = Field(default_factory=list)

    # Environment configuration
    env: Optional[EnvConfig] = Field(None, description="Env config for cloud services")
    env_overrides: Dict[str, EnvOverride] = Field(
        default_factory=dict,
        description="Per-service overrides for global env mappings"
    )

    # Dependencies
    depends_on: Optional[Dependencies] = None

    # User-configurable options
    options: Dict[str, ServiceOption] = Field(default_factory=dict)

    # Metadata
    tags: List[str] = Field(default_factory=list)

    # Infrastructure-specific fields
    managed: bool = Field(False, description="System-managed infrastructure service")
    optional: bool = Field(False, description="Only started when needed by another service")

    @property
    def is_cloud(self) -> bool:
        """Check if this is a cloud service."""
        return self.mode == "cloud"

    @property
    def is_local(self) -> bool:
        """Check if this is a local (containerized) service."""
        return self.mode != "cloud" and len(self.containers) > 0

    @property
    def is_infrastructure(self) -> bool:
        """Check if this is an infrastructure service."""
        return self.type == ServiceType.INFRASTRUCTURE

    def get_required_env_vars(self) -> List[str]:
        """Get all required environment variables for this service."""
        required = set()

        # Cloud service env
        if self.env and self.env.required:
            required.update(self.env.required)

        # Container env
        for container in self.containers:
            if container.env and container.env.required:
                required.update(container.env.required)

        return sorted(required)

    def get_optional_env_vars(self) -> List[str]:
        """Get all optional environment variables for this service."""
        optional = set()

        if self.env and self.env.optional:
            optional.update(self.env.optional)

        for container in self.containers:
            if container.env and container.env.optional:
                optional.update(container.env.optional)

        return sorted(optional)


# =============================================================================
# Environment Mapping (from env-mappings.yaml)
# =============================================================================

class EnvMapping(BaseModel):
    """Global environment variable to settings path mapping."""
    settings_path: str = Field(..., description="Dot-notation path in settings store")


class EnvMappingsConfig(BaseModel):
    """Root config from env-mappings.yaml."""
    mappings: Dict[str, str] = Field(
        default_factory=dict,
        description="Map of ENV_VAR -> settings.path"
    )


# =============================================================================
# Deployment Configuration (from deployments/*.yaml)
# =============================================================================

class NetworkConfig(BaseModel):
    """Docker network configuration."""
    name: str = "ushadow"
    driver: str = "bridge"


class InfrastructureConfig(BaseModel):
    """Infrastructure service startup configuration."""
    always: List[str] = Field(default_factory=list, description="Always start these")
    on_demand: List[str] = Field(default_factory=list, description="Start when needed")


class PortsConfig(BaseModel):
    """Port allocation strategy."""
    strategy: str = Field("direct", description="'direct' or 'offset'")
    offset: Optional[int] = None


class ResourceLimits(BaseModel):
    """Container resource limits."""
    memory_limit: Optional[str] = None
    cpu_limit: Optional[int] = None


class HealthOverrides(BaseModel):
    """Health check overrides for deployment target."""
    timeout_multiplier: float = Field(1.0)
    retries_extra: int = Field(0)


class VolumeConfig(BaseModel):
    """Volume storage configuration."""
    data_path: str = Field("~/.ushadow/data")
    backup_on_update: bool = Field(True)


class LoggingConfig(BaseModel):
    """Container logging configuration."""
    driver: str = Field("json-file")
    options: Dict[str, str] = Field(default_factory=lambda: {"max-size": "10m", "max-file": "3"})


class EnvSource(BaseModel):
    """Environment variable source."""
    file: Optional[str] = None
    settings: Optional[bool] = None


class DeploymentConfig(BaseModel):
    """
    Deployment configuration for a target environment.

    Loaded from config/deployments/*.yaml
    """
    target: str = Field(..., description="'docker', 'kubernetes', or 'remote'")
    network: Optional[NetworkConfig] = None
    volume_prefix: str = Field("ushadow")
    infrastructure: Optional[InfrastructureConfig] = None
    ports: Optional[PortsConfig] = None
    resources: Optional[ResourceLimits] = None
    health: Optional[HealthOverrides] = None
    volumes: Optional[VolumeConfig] = None
    logging: Optional[LoggingConfig] = None
    env_sources: List[EnvSource] = Field(default_factory=list)


# =============================================================================
# Service Index (from services.yaml)
# =============================================================================

class ServiceTypeInfo(BaseModel):
    """Metadata about a service type."""
    description: str
    icon: Optional[str] = None
    required: bool = Field(False, description="At least one service of this type required")
    managed: bool = Field(False, description="System-managed, not user-toggled")


class ServicesIndex(BaseModel):
    """
    Root config from config/services.yaml.

    Defines service type metadata and default providers.
    """
    defaults: Dict[str, str] = Field(
        default_factory=dict,
        description="Default provider for each service type"
    )
    service_types: Dict[str, ServiceTypeInfo] = Field(default_factory=dict)


# =============================================================================
# Runtime State (not from YAML - computed at runtime)
# =============================================================================

class ServiceStatus(str, Enum):
    """Runtime status of a service."""
    UNKNOWN = "unknown"
    STOPPED = "stopped"
    STARTING = "starting"
    RUNNING = "running"
    UNHEALTHY = "unhealthy"
    ERROR = "error"


class ServiceState(BaseModel):
    """
    Runtime state of a service instance.

    Combines static Service definition with runtime status.
    """
    service: Service
    status: ServiceStatus = ServiceStatus.UNKNOWN
    enabled: bool = False
    error_message: Optional[str] = None

    # Container states (for local services)
    container_states: Dict[str, ServiceStatus] = Field(default_factory=dict)

    # Health check results
    last_health_check: Optional[str] = None  # ISO datetime
    health_check_passed: bool = False

    # Configuration validation
    missing_env_vars: List[str] = Field(default_factory=list)
    config_valid: bool = True


# =============================================================================
# Backwards Compatibility - Deprecated Models
# =============================================================================

# These are kept for migration but should not be used in new code

class ServiceCategory(str, Enum):
    """DEPRECATED: Use ServiceType instead."""
    MEMORY = "memory"
    LLM = "llm"
    TRANSCRIPTION = "transcription"
    SPEAKER_RECOGNITION = "speaker_recognition"
    AUDIO_RECORDING = "audio_recording"
    WORKFLOW = "workflow"
    AGENT = "agent"


class IntegrationType(str, Enum):
    """DEPRECATED: Services now self-describe their integration."""
    REST = "rest"
    GRAPHQL = "graphql"
    MCP = "mcp"
    WEBSOCKET = "websocket"
    DOCKER = "docker"
