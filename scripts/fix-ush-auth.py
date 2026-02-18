#!/usr/bin/env python3
"""
Fix ush CLI authentication by ensuring Keycloak is properly configured.

This script:
1. Creates or updates the admin user in Keycloak
2. Enables Direct Access Grants for ushadow-frontend client
3. Tests the authentication flow

Usage:
    python scripts/fix-ush-auth.py
    python scripts/fix-ush-auth.py --verbose
"""

import argparse
import os
import sys
from pathlib import Path
import httpx
import yaml


def load_env():
    """Load .env file into a dict."""
    env_file = Path(".env")
    if not env_file.exists():
        return {}

    env_vars = {}
    with open(env_file) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                env_vars[key.strip()] = value.strip()
    return env_vars


def load_secrets():
    """Load secrets.yaml file."""
    secrets_file = Path("config/SECRETS/secrets.yaml")
    if not secrets_file.exists():
        return {}

    with open(secrets_file) as f:
        return yaml.safe_load(f) or {}


def get_credentials():
    """Get admin credentials from secrets or env."""
    secrets = load_secrets()
    env_vars = load_env()

    admin_config = secrets.get("admin", {})
    email = (
        admin_config.get("email")
        or env_vars.get("ADMIN_EMAIL")
        or os.environ.get("ADMIN_EMAIL", "admin@example.com")
    )
    password = (
        admin_config.get("password")
        or env_vars.get("ADMIN_PASSWORD")
        or os.environ.get("ADMIN_PASSWORD")
    )

    kc_admin_user = (
        secrets.get("keycloak", {}).get("admin_user")
        or env_vars.get("KEYCLOAK_ADMIN")
        or os.environ.get("KEYCLOAK_ADMIN", "admin")
    )
    kc_admin_password = (
        secrets.get("keycloak", {}).get("admin_password")
        or env_vars.get("KEYCLOAK_ADMIN_PASSWORD")
        or os.environ.get("KEYCLOAK_ADMIN_PASSWORD", "admin")
    )

    return {
        "admin_email": email,
        "admin_password": password,
        "kc_admin_user": kc_admin_user,
        "kc_admin_password": kc_admin_password,
    }


def get_admin_token(keycloak_url, realm, admin_user, admin_password):
    """Get admin access token from Keycloak."""
    token_url = f"{keycloak_url}/realms/master/protocol/openid-connect/token"

    response = httpx.post(
        token_url,
        data={
            "grant_type": "password",
            "client_id": "admin-cli",
            "username": admin_user,
            "password": admin_password,
        },
        timeout=10.0,
    )
    response.raise_for_status()
    return response.json()["access_token"]


def get_user_by_email(keycloak_url, realm, admin_token, email):
    """Get user by email from Keycloak."""
    url = f"{keycloak_url}/admin/realms/{realm}/users"
    response = httpx.get(
        url,
        headers={"Authorization": f"Bearer {admin_token}"},
        params={"email": email, "exact": "true"},
        timeout=10.0,
    )
    response.raise_for_status()
    users = response.json()
    return users[0] if users else None


def create_user(keycloak_url, realm, admin_token, email, password, name="Admin"):
    """Create user in Keycloak."""
    url = f"{keycloak_url}/admin/realms/{realm}/users"

    user_data = {
        "username": email,
        "email": email,
        "firstName": name,
        "lastName": "",
        "enabled": True,
        "emailVerified": True,
        "credentials": [
            {
                "type": "password",
                "value": password,
                "temporary": False,
            }
        ],
    }

    response = httpx.post(
        url,
        headers={
            "Authorization": f"Bearer {admin_token}",
            "Content-Type": "application/json",
        },
        json=user_data,
        timeout=10.0,
    )

    if response.status_code == 201:
        # Get the created user
        return get_user_by_email(keycloak_url, realm, admin_token, email)
    elif response.status_code == 409:
        # User already exists
        return get_user_by_email(keycloak_url, realm, admin_token, email)
    else:
        response.raise_for_status()


def update_user_password(keycloak_url, realm, admin_token, user_id, password):
    """Update user password in Keycloak."""
    url = f"{keycloak_url}/admin/realms/{realm}/users/{user_id}/reset-password"

    response = httpx.put(
        url,
        headers={
            "Authorization": f"Bearer {admin_token}",
            "Content-Type": "application/json",
        },
        json={
            "type": "password",
            "value": password,
            "temporary": False,
        },
        timeout=10.0,
    )

    if response.status_code not in (200, 204):
        response.raise_for_status()


def enable_direct_access_grants(backend_url):
    """Enable Direct Access Grants for ushadow-cli client."""
    response = httpx.post(
        f"{backend_url}/api/keycloak/clients/ushadow-cli/enable-direct-grant",
        timeout=10.0,
    )
    response.raise_for_status()
    return response.json()


def test_auth(keycloak_url, realm, email, password):
    """Test authentication with Direct Access Grants."""
    token_url = f"{keycloak_url}/realms/{realm}/protocol/openid-connect/token"

    response = httpx.post(
        token_url,
        data={
            "grant_type": "password",
            "client_id": "ushadow-cli",
            "username": email,
            "password": password,
        },
        timeout=10.0,
    )

    if response.status_code == 200:
        return True, "Success"
    else:
        error_data = response.json()
        error_msg = error_data.get("error_description", error_data.get("error", "Unknown error"))
        return False, error_msg


def main():
    parser = argparse.ArgumentParser(description="Fix ush CLI authentication")
    parser.add_argument("--verbose", "-v", action="store_true", help="Verbose output")
    args = parser.parse_args()

    print("")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print("🔧 Fixing ush CLI Authentication")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print("")

    # Load configuration
    env_vars = load_env()
    backend_port = env_vars.get("BACKEND_PORT", "8000")
    backend_url = f"http://localhost:{backend_port}"

    print("📋 Step 1: Loading configuration...")

    # Get Keycloak config from backend
    try:
        response = httpx.get(f"{backend_url}/api/keycloak/config", timeout=5.0)
        response.raise_for_status()
        kc_config = response.json()
    except httpx.RequestError as e:
        print(f"❌ Cannot connect to backend at {backend_url}")
        print(f"   Error: {e}")
        print(f"   Fix: Start backend with: cd ushadow/backend && pixi run dev")
        sys.exit(1)

    if not kc_config.get("enabled"):
        print("❌ Keycloak is disabled in backend configuration")
        print("   Fix: Enable in config/config.defaults.yaml: keycloak.enabled: true")
        sys.exit(1)

    keycloak_url = kc_config["public_url"]
    realm = kc_config["realm"]
    print(f"✓ Keycloak URL: {keycloak_url}")
    print(f"✓ Realm: {realm}")

    # Get credentials
    creds = get_credentials()
    admin_email = creds["admin_email"]
    admin_password = creds["admin_password"]
    kc_admin_user = creds["kc_admin_user"]
    kc_admin_password = creds["kc_admin_password"]

    if not admin_password:
        print("❌ No admin password configured")
        print("   Add to config/SECRETS/secrets.yaml:")
        print("   admin:")
        print("     password: your_password")
        sys.exit(1)

    print(f"✓ Admin user: {admin_email}")
    print("")

    # Get admin token
    print("📋 Step 2: Authenticating as Keycloak admin...")
    try:
        admin_token = get_admin_token(keycloak_url, realm, kc_admin_user, kc_admin_password)
        print(f"✓ Authenticated as Keycloak admin: {kc_admin_user}")
    except httpx.HTTPStatusError as e:
        print(f"❌ Failed to authenticate as Keycloak admin")
        print(f"   Status: {e.response.status_code}")
        print(f"   Fix: Check Keycloak admin credentials in secrets.yaml or .env")
        sys.exit(1)
    except httpx.RequestError as e:
        print(f"❌ Cannot connect to Keycloak at {keycloak_url}")
        print(f"   Error: {e}")
        print(f"   Fix: Ensure Keycloak is running: docker-compose up -d keycloak")
        sys.exit(1)
    print("")

    # Check if user exists
    print(f"📋 Step 3: Checking if user {admin_email} exists in Keycloak...")
    user = get_user_by_email(keycloak_url, realm, admin_token, admin_email)

    if user:
        print(f"✓ User exists (ID: {user['id']})")
        print(f"  Updating password to match secrets.yaml...")
        update_user_password(keycloak_url, realm, admin_token, user["id"], admin_password)
        print(f"✓ Password updated")
    else:
        print(f"  User does not exist - creating...")
        user = create_user(keycloak_url, realm, admin_token, admin_email, admin_password)
        print(f"✓ User created (ID: {user['id']})")
    print("")

    # Enable Direct Access Grants
    print("📋 Step 4: Enabling Direct Access Grants...")
    try:
        result = enable_direct_access_grants(backend_url)
        if result.get("success"):
            print(f"✓ {result.get('message')}")
        else:
            print(f"⚠️  {result.get('message')}")
    except httpx.HTTPStatusError as e:
        print(f"⚠️  Failed to enable Direct Access Grants: {e}")
    print("")

    # Test authentication
    print("📋 Step 5: Testing authentication...")
    success, message = test_auth(keycloak_url, realm, admin_email, admin_password)

    if success:
        print("✓ Authentication successful!")
        print("")
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print("✅ Setup Complete")
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print("")
        print("You can now use ush with Keycloak authentication:")
        print("  ./ush services list")
        print("  ./ush health")
        print("  ./ush whoami")
        print("")
    else:
        print(f"❌ Authentication failed: {message}")
        print("")
        print("Run diagnostics:")
        print("  ./scripts/diagnose-ush-auth.sh")
        sys.exit(1)


if __name__ == "__main__":
    main()
