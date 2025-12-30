"""
Infrastructure Settings

Minimal settings for infrastructure connections loaded from environment variables.
Application config (API keys, services, providers) is handled by OmegaConf.
"""

from functools import lru_cache
from typing import List, Union

from pydantic import field_validator
from pydantic_settings import BaseSettings


class InfraSettings(BaseSettings):
    """Infrastructure settings from environment variables."""

    # Environment
    ENV_NAME: str = "ushadow"
    NODE_ENV: str = "development"
    DEBUG: bool = False

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8010
    BACKEND_PORT: int = 8000  # External port for URLs

    # Database
    MONGODB_URI: str = "mongodb://mongo:27017"
    MONGODB_DATABASE: str = "ushadow"
    REDIS_URL: str = "redis://redis:6379/0"

    # CORS
    CORS_ORIGINS: Union[str, List[str]] = "http://localhost:3010,http://127.0.0.1:3010"

    @field_validator('CORS_ORIGINS', mode='before')
    @classmethod
    def parse_cors_origins(cls, v):
        """Parse CORS_ORIGINS from comma-separated string or list."""
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "ignore"


@lru_cache()
def get_infra_settings() -> InfraSettings:
    """Get cached infrastructure settings instance."""
    return InfraSettings()


# Backward compatibility alias
def get_settings() -> InfraSettings:
    """Alias for get_infra_settings() - for backward compatibility."""
    return get_infra_settings()
