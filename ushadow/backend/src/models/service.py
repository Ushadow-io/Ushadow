"""
Service Configuration Models

Models for external service integrations (REST APIs, MCP servers, etc.)
"""

from enum import Enum
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field


class ServiceType(str, Enum):
    """Type of service being integrated."""
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


class ServiceConfig(BaseModel):
    """Complete service configuration."""
    service_id: str = Field(..., pattern=r'^[a-z0-9-]+$')
    name: str
    description: Optional[str] = None
    service_type: ServiceType
    integration_type: IntegrationType
    enabled: bool = True
    
    # Connection details
    connection: ConnectionConfig
    
    # Memory mapping (for memory_source services)
    memory_mapping: Optional[MemoryMappingConfig] = None
    
    # Sync configuration
    sync_interval: Optional[int] = None  # Seconds between syncs
    last_sync: Optional[str] = None  # ISO datetime
    
    # Metadata
    tags: List[str] = []
    metadata: Dict[str, Any] = {}
    
    class Config:
        json_schema_extra = {
            "example": {
                "service_id": "pieces-app",
                "name": "Pieces for Developers",
                "description": "Personal micro-repo and AI assistant",
                "service_type": "memory_source",
                "integration_type": "rest",
                "enabled": True,
                "connection": {
                    "url": "http://localhost:1000",
                    "timeout": 30,
                    "auth": {
                        "method": "api_key",
                        "api_key": "{{config.api_keys.pieces_api_key}}",
                        "api_key_header": "Authorization"
                    },
                    "list_endpoint": "/api/snippets",
                    "detail_endpoint": "/api/snippets/{id}"
                },
                "memory_mapping": {
                    "field_mappings": [
                        {
                            "source_field": "name",
                            "target_field": "title"
                        },
                        {
                            "source_field": "raw.value",
                            "target_field": "content"
                        },
                        {
                            "source_field": "classification.specific",
                            "target_field": "tags",
                            "transform": "split"
                        }
                    ],
                    "include_unmapped": True
                },
                "sync_interval": 3600,
                "tags": ["memory", "code-snippets"]
            }
        }
