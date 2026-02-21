"""
Authentication helper utilities for handling both Keycloak and legacy user formats.
"""

from typing import Union, Optional


def get_user_id(user: Union[dict, object]) -> str:
    """
    Safely extract user ID from either Keycloak dict or legacy User object.

    Args:
        user: Either Keycloak user dict (with 'sub' field) or legacy User object (with 'id' attribute)

    Returns:
        User ID as string
    """
    if isinstance(user, dict):
        return user.get("sub", "")
    return str(getattr(user, "id", ""))


def get_user_email(user: Union[dict, object]) -> str:
    """
    Safely extract user email from either Keycloak dict or legacy User object.

    Args:
        user: Either Keycloak user dict (with 'email' field) or legacy User object (with 'email' attribute)

    Returns:
        User email as string
    """
    if isinstance(user, dict):
        return user.get("email", "")
    return getattr(user, "email", "")


def get_user_name(user: Union[dict, object]) -> Optional[str]:
    """
    Safely extract user name from either Keycloak dict or legacy User object.

    Args:
        user: Either Keycloak user dict (with 'name' field) or legacy User object (with 'display_name' attribute)

    Returns:
        User name as string or None
    """
    if isinstance(user, dict):
        return user.get("name") or user.get("preferred_username")
    return getattr(user, "display_name", None) or getattr(user, "email", None)


def is_superuser(user: Union[dict, object]) -> bool:
    """
    Check if user is a superuser/admin.

    For Keycloak users, checks for 'admin' role in realm_access.roles.
    For legacy User objects, checks the is_superuser attribute.

    Args:
        user: Either Keycloak user dict or legacy User object

    Returns:
        True if user is a superuser/admin
    """
    if isinstance(user, dict):
        # Keycloak tokens store roles in realm_access.roles
        realm_access = user.get("realm_access", {})
        roles = realm_access.get("roles", [])
        return "admin" in roles or "superuser" in roles
    return getattr(user, "is_superuser", False)
