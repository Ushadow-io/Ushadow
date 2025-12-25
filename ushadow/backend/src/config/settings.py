"""
ushadow Settings Configuration
Loads configuration from environment variables with secrets.yaml fallback
"""

from functools import lru_cache
from typing import List, Union, Optional

from pydantic import field_validator
from pydantic_settings import BaseSettings

from src.config.secrets_loader import get_secrets_loader


class Settings(BaseSettings):
    """Application settings loaded from environment."""

    # Environment
    ENV_NAME: str = "ushadow"
    NODE_ENV: str = "development"
    DEBUG: bool = False

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8010  # Internal container port
    BACKEND_PORT: int = 8000  # External port for join URLs (mapped by docker)

    # Security (loaded from secrets.yaml with env override)
    AUTH_SECRET_KEY: Optional[str] = None
    SESSION_SECRET: Optional[str] = None
    ADMIN_NAME: str = "admin"
    ADMIN_EMAIL: Optional[str] = None
    ADMIN_PASSWORD: Optional[str] = None

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
        extra = "ignore"  # Ignore extra environment variables (like COMPOSE_PROJECT_NAME, etc.)

    def model_post_init(self, __context) -> None:
        """Load secrets from secrets.yaml if not provided via environment."""
        secrets = get_secrets_loader()

        # Load security keys from secrets.yaml if not in environment
        if not self.AUTH_SECRET_KEY:
            self.AUTH_SECRET_KEY = secrets.get_auth_secret_key()
        if not self.SESSION_SECRET:
            self.SESSION_SECRET = secrets.get_session_secret()
        if not self.ADMIN_EMAIL:
            self.ADMIN_EMAIL = secrets.get_admin_email()
        if not self.ADMIN_PASSWORD:
            self.ADMIN_PASSWORD = secrets.get_admin_password()

        # Validate required secrets are present
        if not self.AUTH_SECRET_KEY:
            raise ValueError("AUTH_SECRET_KEY not found in environment or config/secrets.yaml")
        if not self.SESSION_SECRET:
            raise ValueError("SESSION_SECRET not found in environment or config/secrets.yaml")
        if not self.ADMIN_EMAIL:
            raise ValueError("ADMIN_EMAIL not found in environment or config/secrets.yaml")


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
