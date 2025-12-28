"""
Service Configuration Models

Models for external service integrations (REST APIs, MCP servers, etc.)
"""

from enum import Enum
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field


class ServiceCategory(str, Enum):
    """High-level service category (user-facing grouping)."""
    MEMORY = "memory"                          # Memory/knowledge storage
    LLM = "llm"                                # Language models
    TRANSCRIPTION = "transcription"            # Speech-to-text
    SPEAKER_RECOGNITION = "speaker_recognition"  # Speaker identification
    AUDIO_RECORDING = "audio_recording"        # Audio capture
    WORKFLOW = "workflow"                      # Automation (n8n, etc.)
    AGENT = "agent"                            # Autonomous agents


class ServiceType(str, Enum):
    """Type of service being integrated (technical classification)."""
    INFRASTRUCTURE = "infrastructure"  # Docker containers managed by docker_manager
    MEMORY_SOURCE = "memory_source"    # External memory/knowledge sources
    MCP_SERVER = "mcp_server"          # Model Context Protocol servers
    TOOL_PROVIDER = "tool_provider"     # External tool APIs
    DATA_SYNC = "data_sync"            # Data synchronization services


class IntegrationType(str, Enum):
    """How the service is integrated."""
    REST = "rest"          # REST API
    GRAPHQL = "graphql"    # GraphQL API
    MCP = "mcp"            # MCP protocol
    WEBSOCKET = "websocket"  # WebSocket connection
    DOCKER = "docker"      # Docker container (via docker_manager)


class AuthMethod(str, Enum):
    """Authentication method for external services."""
    NONE = "none"
    BEARER = "bearer"
    API_KEY = "api_key"
    BASIC = "basic"
    OAUTH2 = "oauth2"


class AuthConfig(BaseModel):
    """Authentication configuration."""
    method: AuthMethod = AuthMethod.NONE
    token: Optional[str] = None
    api_key: Optional[str] = None
    api_key_header: Optional[str] = "X-API-Key"
    username: Optional[str] = None
    password: Optional[str] = None
    oauth2_url: Optional[str] = None


class ConnectionConfig(BaseModel):
    """Connection configuration for external services."""
    url: str
    timeout: int = 30
    retry_attempts: int = 3
    auth: Optional[AuthConfig] = None
    headers: Optional[Dict[str, str]] = None
    query_params: Optional[Dict[str, str]] = None
    
    # API endpoints
    health_endpoint: Optional[str] = None
    list_endpoint: Optional[str] = None
    detail_endpoint: Optional[str] = None  # Should include {id} placeholder


class TransformType(str, Enum):
    """Data transformation types."""
    LOWERCASE = "lowercase"
    UPPERCASE = "uppercase"
    TRIM = "trim"
    JSON_PARSE = "json_parse"
    SPLIT = "split"
    DATE_FORMAT = "date_format"


class FieldMapping(BaseModel):
    """Maps an external field to a memory field."""
    source_field: str  # Dot notation path in source data
    target_field: str  # Target field in MemoryCreate
    transform: Optional[TransformType] = None
    default_value: Optional[Any] = None


class MemoryMappingConfig(BaseModel):
    """Configuration for mapping external data to memory format."""
    field_mappings: List[FieldMapping]
    include_unmapped: bool = True  # Add unmapped fields to metadata


class ServiceConfigSchema(BaseModel):
    """Schema definition for service configuration fields."""
    key: str = Field(..., description="Setting key (will be namespaced under service_id)")
    type: str = Field(..., description="Field type: string, secret, integer, boolean, url, number")
    label: str = Field(..., description="Human-readable label for UI")
    description: Optional[str] = Field(None, description="Help text for this setting")
    link: Optional[str] = Field(None, description="URL for getting this value (e.g., where to obtain API key)")
    required: bool = Field(False, description="Whether this field is required")
    default: Optional[Any] = Field(None, description="Default value if not set")
    env_var: Optional[str] = Field(None, description="Environment variable to load from")
    validation: Optional[str] = Field(None, description="Regex pattern for validation")
    options: Optional[List[str]] = Field(None, description="Valid options for enum/select fields")
    min: Optional[float] = Field(None, description="Min value for numbers")
    max: Optional[float] = Field(None, description="Max value for numbers")
    min_length: Optional[int] = Field(None, description="Min length for strings")
    settings_path: Optional[str] = Field(None, description="Dot-notation path to setting in config (e.g., 'api_keys.openai_api_key')")

    class Config:
        json_schema_extra = {
            "example": {
                "key": "api_key",
                "type": "secret",
                "label": "API Key",
                "description": "Your OpenAI API key from platform.openai.com",
                "required": True,
                "env_var": "OPENAI_API_KEY",
                "settings_path": "api_keys.openai_api_key"
            }
        }


class ServiceTemplateModeConfig(BaseModel):
    """Template configuration for a specific deployment mode."""
    config_schema: List[ServiceConfigSchema] = []
    connection: Optional[Dict[str, Any]] = None  # Connection defaults
    docker: Optional[Dict[str, Any]] = None  # Docker requirements
    dependencies: Optional[List[str]] = None  # Required other services


class ServiceTemplate(BaseModel):
    """Service type template from service-templates.yaml."""
    description: str
    cloud: Optional[ServiceTemplateModeConfig] = None
    local: Optional[ServiceTemplateModeConfig] = None


class ServiceConfig(BaseModel):
    """
    Service Instance Configuration (Template/Instance Pattern).

    Each service instance references a template and inherits its config_schema.
    Templates are defined in config/service-templates.yaml
    Instances are defined in config/default-services.yaml
    """
    # Core identity
    service_id: str = Field(..., pattern=r'^[a-z0-9-]+$')
    name: str
    description: Optional[str] = None

    # Template reference (e.g., "memory", "llm", "transcription")
    template: str = Field(..., description="Template name from service-templates.yaml")
    mode: str = Field(..., pattern=r'^(cloud|local)$', description="Deployment mode")

    # Wizard/UI behavior
    is_default: bool = False  # Show in quickstart wizard
    enabled: bool = True

    # Instance-specific config overrides
    # These override defaults from the template
    config_overrides: Dict[str, Any] = {}

    # Cloud service configuration (when mode=cloud)
    connection_url: Optional[str] = None  # Base URL for cloud APIs
    connection: Optional[ConnectionConfig] = None  # Full connection config (advanced)

    # Local service configuration (when mode=local)
    docker_image: Optional[str] = None
    docker_compose_file: Optional[str] = None
    docker_service_name: Optional[str] = None
    docker_profile: Optional[str] = None  # Compose profile to activate

    # Memory mapping (for memory_source category services)
    memory_mapping: Optional[MemoryMappingConfig] = None

    # Sync configuration (for services that sync data)
    sync_interval: Optional[int] = None  # Seconds between syncs
    last_sync: Optional[str] = None  # ISO datetime

    # Metadata
    tags: List[str] = []
    metadata: Dict[str, Any] = {}

    # NOTE: config_schema is NOT stored here - it's inherited from the template!
    # Use ServiceRegistry.get_effective_schema(service_id) to get merged schema
    
    class Config:
        json_schema_extra = {
            "example": {
                "service_id": "openai",
                "name": "OpenAI",
                "description": "OpenAI GPT models",
                "template": "llm",  # References service-templates.yaml:templates.llm
                "mode": "cloud",    # Uses llm.cloud config_schema from template
                "is_default": True,
                "enabled": True,
                "connection_url": "https://api.openai.com/v1",
                "config_overrides": {
                    "model": "gpt-4o-mini"  # Override template default
                },
                "tags": ["llm", "cloud"]
            }
        }
