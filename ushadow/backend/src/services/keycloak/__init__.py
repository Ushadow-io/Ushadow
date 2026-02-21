"""
Keycloak service package.

Public API — import from here rather than individual modules:

    from src.services.keycloak import (
        KeycloakAdminClient,
        get_keycloak_admin,
        KeycloakClient,
        get_keycloak_client,
        get_current_user_hybrid,
        get_current_user_or_none,
        register_current_environment,
        get_or_create_user_from_keycloak,
        get_mongodb_user_id_for_keycloak_user,
    )
"""

from .keycloak_admin import (
    KeycloakAdminClient,
    get_keycloak_admin,
    register_current_environment_redirect_uri,
)
from .keycloak_auth import (
    get_current_user_hybrid,
    get_current_user_or_none,
    validate_keycloak_token,
    get_keycloak_user_from_token,
    get_jwks_client,
    clear_jwks_cache,
)
from .keycloak_client import KeycloakClient, get_keycloak_client
from .keycloak_startup import (
    register_current_environment,
    register_url_with_keycloak,
    register_mobile_client,
)
from .keycloak_user_sync import (
    get_or_create_user_from_keycloak,
    get_mongodb_user_id_for_keycloak_user,
)

__all__ = [
    "KeycloakAdminClient",
    "get_keycloak_admin",
    "register_current_environment_redirect_uri",
    "get_current_user_hybrid",
    "get_current_user_or_none",
    "validate_keycloak_token",
    "get_keycloak_user_from_token",
    "get_jwks_client",
    "clear_jwks_cache",
    "KeycloakClient",
    "get_keycloak_client",
    "register_current_environment",
    "register_url_with_keycloak",
    "register_mobile_client",
    "get_or_create_user_from_keycloak",
    "get_mongodb_user_id_for_keycloak_user",
]
