"""
ushadow Settings Configuration
Loads configuration from environment variables
"""

from functools import lru_cache
from typing import List, Union

from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment."""

    # Environment
    ENV_NAME: str = "ushadow"
    NODE_ENV: str = "development"
    DEBUG: bool = False

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8010  # 8000 + PORT_OFFSET (default 10)

    # Security
    AUTH_SECRET_KEY: str
    SESSION_SECRET: str
    ADMIN_NAME: str = "admin"
    ADMIN_EMAIL: str
    ADMIN_PASSWORD: str

    # Database
    MONGODB_URI: str = "mongodb://mongo:27017"
    MONGODB_DATABASE: str = "ushadow"
    REDIS_URL: str = "redis://redis:6379/0"

    # CORS - Can be comma-separated string or list
    CORS_ORIGINS: Union[str, List[str]] = "http://localhost:3010,http://127.0.0.1:3010"

    @field_validator('CORS_ORIGINS', mode='before')
    @classmethod
    def parse_cors_origins(cls, v):
        """Parse CORS_ORIGINS from comma-separated string or list."""
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    # Chronicle Integration
    CHRONICLE_URL: str = "http://chronicle-backend:8000"
    CHRONICLE_API_TIMEOUT: int = 30

    # MCP Integration
    MCP_SERVER_URL: str = "http://mcp-server:8765"
    MCP_ENABLED: bool = False
    MCP_TIMEOUT: int = 30

    # Agent Zero Integration
    AGENT_ZERO_URL: str = "http://agent-zero:9000"
    AGENT_ZERO_ENABLED: bool = False
    AGENT_ZERO_TIMEOUT: int = 60

    # n8n Workflow Automation
    N8N_URL: str = "http://n8n:5678"
    N8N_ENABLED: bool = False

    # API Keys (optional)
    OPENAI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    DEEPGRAM_API_KEY: str = ""
    MISTRAL_API_KEY: str = ""

    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
