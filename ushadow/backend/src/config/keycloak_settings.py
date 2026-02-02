"""Keycloak configuration settings.

This module provides configuration for Keycloak integration using OmegaConf.
All sensitive values (passwords, client secrets) are stored in secrets.yaml.
"""

from src.config import get_settings_store as get_settings

def get_keycloak_config() -> dict:
    """Get Keycloak configuration from OmegaConf settings.

    Returns:
        dict with keys:
            - enabled: bool
            - url: str (internal Docker URL)
            - public_url: str (external browser URL)
            - realm: str
            - backend_client_id: str
            - backend_client_secret: str (from secrets.yaml)
            - frontend_client_id: str
            - admin_user: str
            - admin_password: str (from secrets.yaml)
    """
    settings = get_settings()

    # Public configuration (from config.defaults.yaml)
    config = {
        "enabled": settings.get_sync("keycloak.enabled", False),
        "url": settings.get_sync("keycloak.url", "http://keycloak:8080"),
        "public_url": settings.get_sync("keycloak.public_url", "http://localhost:8080"),
        "realm": settings.get_sync("keycloak.realm", "ushadow"),
        "backend_client_id": settings.get_sync("keycloak.backend_client_id", "ushadow-backend"),
        "frontend_client_id": settings.get_sync("keycloak.frontend_client_id", "ushadow-frontend"),
        "admin_user": settings.get_sync("keycloak.admin_user", "admin"),
    }

    # Secrets (from config/SECRETS/secrets.yaml)
    config["backend_client_secret"] = settings.get_sync("keycloak.backend_client_secret")
    config["admin_password"] = settings.get_sync("keycloak.admin_password")

    return config


def is_keycloak_enabled() -> bool:
    """Check if Keycloak authentication is enabled.

    This allows running both auth systems in parallel during migration:
    - keycloak.enabled=false: Use existing fastapi-users auth
    - keycloak.enabled=true: Use Keycloak (or hybrid mode)
    """
    settings = get_settings()
    return settings.get_sync("keycloak.enabled", False)
