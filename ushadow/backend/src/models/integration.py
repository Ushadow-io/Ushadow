"""
Integration Configuration Models

Models for external service integrations (REST APIs, file systems, etc.)
These are distinct from "services" which are Docker containers managed via compose files.

INTEGRATIONS = External APIs/data sources you connect to
  - Examples: mem0.ai API, Notion, Obsidian vault, Google Drive
  - Defined by: Connection config, auth, field mappings
  - Managed by: IntegrationOrchestrator (future), Memory adapters

SERVICES = Docker containers you run locally
  - Examples: chronicle, openmemory, neo4j
  - Defined by: Compose files, env vars, ports
  - Managed by: ServiceOrchestrator, DockerManager
"""

from enum import Enum
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field


class IntegrationType(str, Enum):
    """How the integration communicates."""
    REST = "rest"          # REST API
    GRAPHQL = "graphql"    # GraphQL API
    MCP = "mcp"            # Model Context Protocol
    WEBSOCKET = "websocket"  # WebSocket connection
    GRPC = "grpc"          # gRPC service
    FILESYSTEM = "filesystem"  # Local filesystem (Obsidian, etc.)
    DATABASE = "database"   # Direct database connection


class AuthMethod(str, Enum):
    """Authentication method for external integrations."""
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
    """Connection configuration for external integrations."""
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
    """Data transformation types for field mapping."""
    LOWERCASE = "lowercase"
    UPPERCASE = "uppercase"
    TRIM = "trim"
    JSON_PARSE = "json_parse"
    SPLIT = "split"
    DATE_FORMAT = "date_format"


class FieldMapping(BaseModel):
    """Maps an external field to an internal field."""
    source_field: str  # Dot notation path in source data (e.g., "user.profile.name")
    target_field: str  # Target field in MemoryCreate or other model
    transform: Optional[TransformType] = None
    default_value: Optional[Any] = None


class MemoryMappingConfig(BaseModel):
    """Configuration for mapping external data to memory format."""
    field_mappings: List[FieldMapping]
    include_unmapped: bool = True  # Add unmapped fields to metadata


class IntegrationConfigSchema(BaseModel):
    """Schema definition for integration configuration fields (for UI forms)."""
    key: str = Field(..., description="Setting key (will be namespaced under integration_id)")
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
    settings_path: Optional[str] = Field(None, description="Dot-notation path to setting in config")

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


class IntegrationTemplateModeConfig(BaseModel):
    """Template configuration for a specific deployment mode."""
    config_schema: List[IntegrationConfigSchema] = []
    connection: Optional[Dict[str, Any]] = None  # Connection defaults
    dependencies: Optional[List[str]] = None  # Required other integrations


class IntegrationTemplate(BaseModel):
    """Integration type template from integration-templates.yaml."""
    description: str
    cloud: Optional[IntegrationTemplateModeConfig] = None
    local: Optional[IntegrationTemplateModeConfig] = None


class IntegrationConfig(BaseModel):
    """
    Integration Instance Configuration.

    Integrations are external services/data sources that Ushadow connects to:
    - Cloud APIs (OpenAI, Notion, mem0.ai)
    - File systems (Obsidian vault, local directories)
    - Databases (external PostgreSQL, MongoDB)
    - MCP servers (Model Context Protocol)

    This is DISTINCT from Services (Docker containers defined in compose files).
    """
    # Core identity
    integration_id: str = Field(..., pattern=r'^[a-z0-9-]+$')
    name: str
    description: Optional[str] = None

    # Template reference (e.g., "memory_source", "llm_provider", "tool_provider")
    template: str = Field(..., description="Template name from integration-templates.yaml")
    mode: str = Field(..., pattern=r'^(cloud|local)$', description="Deployment mode")

    # Integration type (how it communicates)
    integration_type: IntegrationType = IntegrationType.REST

    # Wizard/UI behavior
    is_default: bool = False  # Show in quickstart wizard
    enabled: bool = True

    # Instance-specific config overrides
    config_overrides: Dict[str, Any] = {}

    # Connection configuration
    connection_url: Optional[str] = None  # Simple URL (for basic configs)
    connection: Optional[ConnectionConfig] = None  # Full connection config (advanced)

    # Memory mapping (for memory_source integrations)
    memory_mapping: Optional[MemoryMappingConfig] = None

    # Sync configuration (for integrations that sync data)
    sync_interval: Optional[int] = None  # Seconds between syncs
    last_sync: Optional[str] = None  # ISO datetime

    # Metadata
    tags: List[str] = []
    metadata: Dict[str, Any] = {}

    class Config:
        json_schema_extra = {
            "example": {
                "integration_id": "obsidian-main",
                "name": "My Obsidian Vault",
                "description": "Personal knowledge base",
                "template": "memory_source",
                "mode": "local",
                "integration_type": "filesystem",
                "enabled": True,
                "connection_url": "file:///Users/stu/Documents/Obsidian",
                "memory_mapping": {
                    "field_mappings": [
                        {"source_field": "title", "target_field": "title"},
                        {"source_field": "content", "target_field": "content"},
                        {"source_field": "tags", "target_field": "tags"}
                    ],
                    "include_unmapped": True
                },
                "sync_interval": 21600,
                "tags": ["memory", "obsidian"]
            }
        }
