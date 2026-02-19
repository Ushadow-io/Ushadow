#!/usr/bin/env python3
"""
Create the ushadow-cli client in Keycloak.

This script creates the dedicated CLI client with Direct Access Grants enabled.
Run this once to set up the new client in an existing Keycloak instance.

Usage:
    python scripts/create-cli-client.py
"""

import httpx
import yaml
from pathlib import Path


def main():
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print("🔧 Creating ushadow-cli Client in Keycloak")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print()

    # Load secrets
    secrets_file = Path("config/SECRETS/secrets.yaml")
    if not secrets_file.exists():
        print("❌ config/SECRETS/secrets.yaml not found")
        return 1

    with open(secrets_file) as f:
        secrets = yaml.safe_load(f)

    kc_admin_user = secrets.get("keycloak", {}).get("admin_user", "admin")
    kc_admin_password = secrets.get("keycloak", {}).get("admin_password", "admin")

    # Keycloak URL (from .env or default)
    env_file = Path(".env")
    keycloak_url = "http://localhost:8081"
    realm = "ushadow"

    if env_file.exists():
        with open(env_file) as f:
            for line in f:
                if line.startswith("KEYCLOAK_EXTERNAL_URL="):
                    keycloak_url = line.split("=", 1)[1].strip()
                elif line.startswith("KEYCLOAK_REALM="):
                    realm = line.split("=", 1)[1].strip()

    print(f"Keycloak URL: {keycloak_url}")
    print(f"Realm: {realm}")
    print()

    # Get admin token
    print("🔑 Getting admin token...")
    try:
        token_response = httpx.post(
            f"{keycloak_url}/realms/master/protocol/openid-connect/token",
            data={
                "grant_type": "password",
                "client_id": "admin-cli",
                "username": kc_admin_user,
                "password": kc_admin_password,
            },
            timeout=10.0,
        )
        token_response.raise_for_status()
        admin_token = token_response.json()["access_token"]
        print("✓ Admin token obtained")
    except Exception as e:
        print(f"❌ Failed to get admin token: {e}")
        return 1

    print()

    # Check if client already exists
    print("🔍 Checking if ushadow-cli client exists...")
    try:
        clients_response = httpx.get(
            f"{keycloak_url}/admin/realms/{realm}/clients",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10.0,
        )
        clients_response.raise_for_status()
        clients = clients_response.json()

        existing_client = None
        for client in clients:
            if client.get("clientId") == "ushadow-cli":
                existing_client = client
                break

        if existing_client:
            print("⚠️  Client 'ushadow-cli' already exists")
            print(f"   ID: {existing_client['id']}")
            print(f"   Direct Access Grants: {existing_client.get('directAccessGrantsEnabled', False)}")

            if not existing_client.get("directAccessGrantsEnabled"):
                print()
                print("🔧 Enabling Direct Access Grants...")
                existing_client["directAccessGrantsEnabled"] = True

                update_response = httpx.put(
                    f"{keycloak_url}/admin/realms/{realm}/clients/{existing_client['id']}",
                    headers={
                        "Authorization": f"Bearer {admin_token}",
                        "Content-Type": "application/json",
                    },
                    json=existing_client,
                    timeout=10.0,
                )

                if update_response.status_code in (200, 204):
                    print("✓ Direct Access Grants enabled")
                else:
                    print(f"❌ Failed to update client: {update_response.status_code}")
                    return 1
            else:
                print("✓ Direct Access Grants already enabled")

            print()
            print("✅ Client is ready for use")
            return 0

    except Exception as e:
        print(f"❌ Failed to check clients: {e}")
        return 1

    # Create new client
    print("📋 Creating ushadow-cli client...")

    client_data = {
        "clientId": "ushadow-cli",
        "name": "Ushadow CLI",
        "description": "Ushadow command-line tools (ush)",
        "enabled": True,
        "publicClient": True,
        "protocol": "openid-connect",
        "standardFlowEnabled": False,
        "implicitFlowEnabled": False,
        "directAccessGrantsEnabled": True,
        "serviceAccountsEnabled": False,
        "authorizationServicesEnabled": False,
        "fullScopeAllowed": True,
        "redirectUris": [],
        "webOrigins": [],
        "attributes": {},
        "protocolMappers": [
            {
                "name": "sub",
                "protocol": "openid-connect",
                "protocolMapper": "oidc-sub-mapper",
                "consentRequired": False,
                "config": {
                    "access.token.claim": "true",
                    "id.token.claim": "true",
                    "userinfo.token.claim": "true",
                },
            }
        ],
    }

    try:
        create_response = httpx.post(
            f"{keycloak_url}/admin/realms/{realm}/clients",
            headers={
                "Authorization": f"Bearer {admin_token}",
                "Content-Type": "application/json",
            },
            json=client_data,
            timeout=10.0,
        )

        if create_response.status_code == 201:
            print("✓ Client created successfully")
        elif create_response.status_code == 409:
            print("⚠️  Client already exists (conflict)")
        else:
            print(f"❌ Failed to create client: {create_response.status_code}")
            print(f"   {create_response.text}")
            return 1

    except Exception as e:
        print(f"❌ Failed to create client: {e}")
        return 1

    print()
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print("✅ Setup Complete")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print()
    print("The ushadow-cli client is now ready.")
    print("Test it with: ./ush whoami --verbose")
    print()

    return 0


if __name__ == "__main__":
    exit(main())
