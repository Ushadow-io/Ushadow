#!/usr/bin/env python3
"""Keycloak automated setup script.

This script configures a fresh Keycloak instance with:
- ushadow realm
- Client configurations for frontend, backend, and services
- Authorization settings for voice message sharing
- Example users and permissions

Usage:
    python scripts/setup_keycloak.py

Prerequisites:
    pip install python-keycloak python-dotenv
"""

import os
import sys
from pathlib import Path

try:
    from keycloak import KeycloakAdmin, KeycloakOpenIDConnection
    from dotenv import load_dotenv
except ImportError:
    print("❌ Missing dependencies. Install with:")
    print("   pip install python-keycloak python-dotenv")
    sys.exit(1)

# Load environment variables
load_dotenv()

# Keycloak connection settings
KEYCLOAK_URL = os.getenv("KEYCLOAK_URL", "http://localhost:8080")
ADMIN_USER = os.getenv("KEYCLOAK_ADMIN_USER", "admin")
ADMIN_PASSWORD = os.getenv("KEYCLOAK_ADMIN_PASSWORD", "admin")

REALM_NAME = "ushadow"


def main():
    """Main setup function."""
    print(f"🔧 Connecting to Keycloak at {KEYCLOAK_URL}...")

    try:
        # Connect as admin
        keycloak_admin = KeycloakAdmin(
            server_url=KEYCLOAK_URL,
            username=ADMIN_USER,
            password=ADMIN_PASSWORD,
            realm_name="master",
            verify=True
        )

        print("✅ Connected successfully")

        # Create realm
        create_realm(keycloak_admin)

        # Switch to ushadow realm
        keycloak_admin.realm_name = REALM_NAME

        # Create clients
        backend_client_id = create_backend_client(keycloak_admin)
        create_frontend_client(keycloak_admin)
        create_service_client(keycloak_admin, "chronicle")

        # Configure authorization for voice message sharing
        configure_authorization(keycloak_admin, backend_client_id)

        # Create example users (optional)
        create_example_users(keycloak_admin)

        print("\n✅ Keycloak setup complete!")
        print(f"\n📋 Next steps:")
        print(f"   1. Access admin console: {KEYCLOAK_URL}")
        print(f"   2. Update backend to use Keycloak OIDC")
        print(f"   3. Update frontend to use OIDC login flow")

    except Exception as e:
        print(f"❌ Setup failed: {e}")
        sys.exit(1)


def create_realm(admin: KeycloakAdmin):
    """Create ushadow realm."""
    print(f"\n📦 Creating realm '{REALM_NAME}'...")

    try:
        admin.create_realm(
            payload={
                "realm": REALM_NAME,
                "enabled": True,
                "displayName": "Ushadow",
                "registrationAllowed": True,
                "registrationEmailAsUsername": True,
                "resetPasswordAllowed": True,
                "rememberMe": True,
                "verifyEmail": False,  # Enable when email is configured
                "loginWithEmailAllowed": True,
                "duplicateEmailsAllowed": False,
                "sslRequired": "none",  # Change to "external" in production
                "accessTokenLifespan": 86400,  # 24 hours
                # Custom theme
                "loginTheme": "ushadow",
                "accountTheme": "ushadow",
                "emailTheme": "ushadow",
            },
            skip_exists=True
        )
        print("✅ Realm created")
    except Exception as e:
        print(f"⚠️  Realm might already exist: {e}")


def create_backend_client(admin: KeycloakAdmin) -> str:
    """Create backend API client with authorization enabled."""
    print("\n🔐 Creating backend client...")

    client_config = {
        "clientId": "ushadow-backend",
        "name": "Ushadow Backend API",
        "description": "Backend API server with authorization services",
        "enabled": True,
        "protocol": "openid-connect",
        "publicClient": False,  # Confidential client (has secret)
        "serviceAccountsEnabled": True,  # For service-to-service auth
        "authorizationServicesEnabled": True,  # Enable fine-grained authorization
        "standardFlowEnabled": True,
        "directAccessGrantsEnabled": True,  # For password grant (testing)
        "redirectUris": ["http://localhost:*"],
        "webOrigins": ["+"],  # Allow CORS for redirectUris
        "attributes": {
            "access.token.lifespan": "86400",  # 24 hours
        }
    }

    try:
        client_id = admin.create_client(client_config, skip_exists=True)
        print("✅ Backend client created")

        # Get client secret
        client_uuid = admin.get_client_id("ushadow-backend")
        secret = admin.get_client_secrets(client_uuid)["value"]
        print(f"   Client secret: {secret}")
        print(f"   ⚠️  Save this to .env: KEYCLOAK_BACKEND_SECRET={secret}")

        return client_uuid

    except Exception as e:
        print(f"⚠️  Client might already exist: {e}")
        return admin.get_client_id("ushadow-backend")


def create_frontend_client(admin: KeycloakAdmin):
    """Create frontend web client (public, PKCE-enabled)."""
    print("\n🌐 Creating frontend client...")

    client_config = {
        "clientId": "ushadow-frontend",
        "name": "Ushadow Web UI",
        "description": "React frontend application",
        "enabled": True,
        "protocol": "openid-connect",
        "publicClient": True,  # Public client (no secret)
        "standardFlowEnabled": True,  # Authorization Code flow
        "implicitFlowEnabled": False,  # Don't use implicit flow
        "directAccessGrantsEnabled": False,  # No password grant for frontend
        "redirectUris": [
            "http://localhost:*/*",
            "http://localhost:*/callback",
        ],
        "webOrigins": ["+"],
        "attributes": {
            "pkce.code.challenge.method": "S256",  # Require PKCE
        }
    }

    try:
        admin.create_client(client_config, skip_exists=True)
        print("✅ Frontend client created")
    except Exception as e:
        print(f"⚠️  Client might already exist: {e}")


def create_service_client(admin: KeycloakAdmin, service_name: str):
    """Create service client (for chronicle, mycelia, etc.)."""
    print(f"\n🔧 Creating {service_name} service client...")

    client_config = {
        "clientId": service_name,
        "name": f"{service_name.title()} Service",
        "enabled": True,
        "protocol": "openid-connect",
        "publicClient": False,
        "serviceAccountsEnabled": True,
        "standardFlowEnabled": False,  # Service doesn't use browser flow
        "directAccessGrantsEnabled": False,
        "attributes": {
            "access.token.lifespan": "86400",
        }
    }

    try:
        admin.create_client(client_config, skip_exists=True)
        client_uuid = admin.get_client_id(service_name)
        secret = admin.get_client_secrets(client_uuid)["value"]
        print(f"✅ {service_name} client created")
        print(f"   Client secret: {secret}")
        print(f"   ⚠️  Save to .env: KEYCLOAK_{service_name.upper()}_SECRET={secret}")
    except Exception as e:
        print(f"⚠️  Client might already exist: {e}")


def configure_authorization(admin: KeycloakAdmin, backend_client_uuid: str):
    """Configure authorization resources and scopes for voice messages."""
    print("\n🔒 Configuring authorization services...")

    # TODO: This requires the Keycloak admin API extensions for authorization
    # For now, we'll document what needs to be done manually or via REST API

    print("   📝 Manual steps required:")
    print("   1. Go to Clients → ushadow-backend → Authorization → Resources")
    print("   2. Create resource type: 'voice-message'")
    print("   3. Add scopes: view, share, delete")
    print("   4. Create policies:")
    print("      - Owner policy: Only resource owner can delete")
    print("      - Shared policy: Explicitly shared users can view")
    print("      - Time-based policy: Share links expire")

    # Note: Full automation would require direct REST API calls
    # The python-keycloak library doesn't fully support authorization APIs yet


def create_example_users(admin: KeycloakAdmin):
    """Create example users for testing."""
    print("\n👥 Creating example users...")

    users = [
        {
            "username": "alice@example.com",
            "email": "alice@example.com",
            "firstName": "Alice",
            "lastName": "Demo",
            "enabled": True,
            "emailVerified": True,
            "credentials": [
                {
                    "type": "password",
                    "value": "password",
                    "temporary": False
                }
            ]
        },
        {
            "username": "bob@example.com",
            "email": "bob@example.com",
            "firstName": "Bob",
            "lastName": "Demo",
            "enabled": True,
            "emailVerified": True,
            "credentials": [
                {
                    "type": "password",
                    "value": "password",
                    "temporary": False
                }
            ]
        }
    ]

    for user_data in users:
        try:
            admin.create_user(user_data, exist_ok=True)
            print(f"✅ Created user: {user_data['username']}")
        except Exception as e:
            print(f"⚠️  User might already exist: {user_data['username']}")


if __name__ == "__main__":
    main()
