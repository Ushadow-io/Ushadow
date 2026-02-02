"""
Provider and Capability Models

Capability-based service composition:
- Capability: Abstract interface (llm, memory, transcription)
- Provider: Implementation of a capability (openai, anthropic, ollama)
- EnvMap: Maps settings to environment variables
"""

from typing import Dict, List, Optional, Any, Literal
from pydantic import BaseModel, Field


class EnvMap(BaseModel):
    """
    Maps a settings path to an environment variable.

    Reusable across providers and services. The provider declares the mapping,
    the actual value lives in settings (OmegaConf).

    Resolution order:
    1. settings.get(settings_path) - User override
    2. default - Provider's default value
    """
    key: str = Field(..., description="Logical key (e.g., 'api_key', 'base_url')")
    env_var: str = Field(..., description="Environment variable name to expose")
    settings_path: Optional[str] = Field(None, description="Dot-notation path in settings")
    default: Optional[str] = Field(None, description="Default value if not in settings")
    type: Literal["string", "secret", "url", "boolean", "integer"] = Field(
        "string", description="Value type (affects UI rendering)"
    )
    label: Optional[str] = Field(None, description="UI display label")
    link: Optional[str] = Field(None, description="URL to obtain this value (e.g., API key page)")
    required: bool = Field(False, description="Whether this value must be set")


class Capability(BaseModel):
    """
    Abstract interface that providers implement.

    Defined in capabilities.yaml. Services declare which capabilities they need,
    providers declare which capability they implement.
    """
    id: str = Field(..., description="Capability identifier (e.g., 'llm', 'memory')")
    description: str = Field(..., description="Human-readable description")
    provides: Dict[str, str] = Field(
        default_factory=dict,
        description="Schema: key -> type (string, secret, url, boolean, integer)"
    )


class ProviderUses(BaseModel):
    """Declares a capability that a provider requires."""
    capability: str = Field(..., description="Required capability ID (e.g., 'llm')")
    required: bool = Field(True, description="Whether this capability is required")
    purpose: Optional[str] = Field(None, description="Why this capability is needed")


class DockerConfig(BaseModel):
    """Docker configuration for local providers."""
    image: str = Field(..., description="Docker image name")
    compose_file: Optional[str] = Field(None, description="Path to compose file")
    service_name: Optional[str] = Field(None, description="Service name in compose")
    ports: List[Dict[str, Any]] = Field(default_factory=list)
    volumes: List[Dict[str, Any]] = Field(default_factory=list)
    environment: Dict[str, str] = Field(default_factory=dict)
    health: Optional[Dict[str, Any]] = Field(None, description="Health check config")


class Provider(BaseModel):
    """
    A provider implements a capability.

    Defined in config/providers/*.yaml. Each provider specifies:
    - Which capability it implements
    - How to map capability keys to env vars
    - Docker config (for local providers)
    """
    id: str = Field(..., description="Provider identifier (e.g., 'openai', 'ollama')")
    name: str = Field(..., description="Display name")
    capability: str = Field(..., description="Which capability this implements")
    mode: Literal["cloud", "local", "client", "relay", "webhook", "custom", "upload", "remote"] = Field(..., description="Deployment mode")
    description: Optional[str] = None

    # Environment variable mappings (capability keys → env vars)
    env_maps: List[EnvMap] = Field(
        default_factory=list,
        description="Maps capability keys to environment variables"
    )

    # Docker config (for local providers)
    docker: Optional[DockerConfig] = None

    # UI metadata (inlined)
    icon: Optional[str] = None
    tags: List[str] = Field(default_factory=list)

    # Requirements (other capabilities this provider needs)
    uses: List[ProviderUses] = Field(
        default_factory=list,
        description="Capabilities this provider requires"
    )
