#!/usr/bin/env python3
"""
Apply Ushadow Theme to Keycloak

Updates the Keycloak realm to use the custom Ushadow login theme.
The theme must already be mounted in the Keycloak container.

Usage:
    python scripts/apply_keycloak_theme.py
"""

import os
import sys

try:
    import requests
except ImportError:
    print("❌ Error: requests library not found")
    print("   Install it with: pip install requests")
    sys.exit(1)


def get_admin_token(keycloak_url: str, admin_user: str, admin_password: str) -> str:
    """Get admin access token from Keycloak."""
    token_url = f"{keycloak_url}/realms/master/protocol/openid-connect/token"

    response = requests.post(
        token_url,
        data={
            "grant_type": "password",
            "client_id": "admin-cli",
            "username": admin_user,
            "password": admin_password,
        },
        timeout=10.0,
    )

    if response.status_code != 200:
        print(f"❌ Failed to authenticate: {response.text}")
        sys.exit(1)

    return response.json()["access_token"]


def update_realm_theme(keycloak_url: str, token: str, realm: str, theme: str) -> bool:
    """Update realm to use specified login theme."""
    url = f"{keycloak_url}/admin/realms/{realm}"

    # Get current realm config
    response = requests.get(
        url,
        headers={"Authorization": f"Bearer {token}"},
        timeout=10.0,
    )

    if response.status_code != 200:
        print(f"❌ Failed to get realm config: {response.text}")
        return False

    realm_config = response.json()

    # Update theme
    realm_config["loginTheme"] = theme

    # Apply update
    response = requests.put(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        json=realm_config,
        timeout=10.0,
    )

    if response.status_code != 204:
        print(f"❌ Failed to update realm: {response.status_code} - {response.text}")
        return False

    return True


def main():
    # Get configuration from environment
    keycloak_url = os.getenv("KEYCLOAK_URL", "http://localhost:8081")
    realm = os.getenv("KEYCLOAK_REALM", "ushadow")
    theme = os.getenv("KEYCLOAK_LOGIN_THEME", "ushadow")
    admin_user = os.getenv("KEYCLOAK_ADMIN_USER", "admin")
    admin_password = os.getenv("KEYCLOAK_ADMIN_PASSWORD", "admin")

    print(f"🎨 Applying Ushadow theme to Keycloak realm '{realm}'...")
    print(f"   Keycloak URL: {keycloak_url}")
    print(f"   Theme: {theme}")
    print()

    # Authenticate
    print("🔑 Authenticating as Keycloak admin...")
    token = get_admin_token(keycloak_url, admin_user, admin_password)
    print("   ✅ Authenticated")
    print()

    # Update theme
    print(f"🎨 Setting login theme to '{theme}'...")
    success = update_realm_theme(keycloak_url, token, realm, theme)

    if success:
        print(f"   ✅ Theme applied successfully!")
        print()
        print(f"🎉 Done! The Ushadow theme is now active.")
        print(f"   Visit: {keycloak_url}/realms/{realm}/protocol/openid-connect/auth")
        print()
    else:
        print(f"   ❌ Failed to apply theme")
        sys.exit(1)


if __name__ == "__main__":
    main()
