#!/usr/bin/env python3
"""
Add Google OAuth identity provider to Keycloak.

This enables "Sign in with Google" on the Keycloak login page.

Prerequisites:
1. Create Google OAuth credentials at https://console.cloud.google.com/
2. Set authorized redirect URI to: http://localhost:8081/realms/ushadow/broker/google/endpoint
3. Export GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables

Usage:
    export GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
    export GOOGLE_CLIENT_SECRET="your-client-secret"
    python scripts/add_google_oauth.py
"""

import os
import sys
from keycloak import KeycloakAdmin

# Configuration
KEYCLOAK_URL = os.getenv("KEYCLOAK_URL", "http://localhost:8081")
ADMIN_USER = os.getenv("KEYCLOAK_ADMIN_USER", "admin")
ADMIN_PASSWORD = os.getenv("KEYCLOAK_ADMIN_PASSWORD", "admin")
REALM_NAME = "ushadow"

# Google OAuth credentials (from environment)
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")


def setup_google_provider():
    """Add Google as an identity provider."""
    print(f"\n🔐 Adding Google OAuth Provider to Keycloak")
    print(f"   Keycloak URL: {KEYCLOAK_URL}")
    print(f"   Realm: {REALM_NAME}")

    # Connect to Keycloak
    try:
        admin = KeycloakAdmin(
            server_url=KEYCLOAK_URL,
            username=ADMIN_USER,
            password=ADMIN_PASSWORD,
            realm_name="master",
            verify=True
        )
        admin.realm_name = REALM_NAME
        print("✅ Connected to Keycloak")
    except Exception as e:
        print(f"❌ Failed to connect to Keycloak: {e}")
        print(f"\n💡 Make sure Keycloak is running:")
        print(f"   docker compose -f compose/docker-compose.infra.yml --profile postgres --profile keycloak up -d")
        sys.exit(1)

    # Configure Google identity provider
    provider_config = {
        "alias": "google",
        "providerId": "google",
        "enabled": True,
        "updateProfileFirstLoginMode": "on",  # Ask user to review profile on first login
        "trustEmail": True,  # Google emails are verified
        "storeToken": True,  # Store Google token (allows API access later)
        "addReadTokenRoleOnCreate": False,
        "authenticateByDefault": False,  # Don't auto-redirect to Google
        "linkOnly": False,  # Allow account creation
        "firstBrokerLoginFlowAlias": "first broker login",  # Standard flow
        "config": {
            "clientId": GOOGLE_CLIENT_ID,
            "clientSecret": GOOGLE_CLIENT_SECRET,
            "defaultScope": "openid profile email",
            "syncMode": "IMPORT",  # Import user data from Google
            "hideOnLoginPage": "false",  # Show button on login page
            "guiOrder": "1",  # Display order (first)
        }
    }

    try:
        admin.create_identity_provider(provider_config)
        print("✅ Google OAuth provider added successfully!")
        print(f"\n📋 Configuration:")
        print(f"   Provider Alias: google")
        print(f"   Client ID: {GOOGLE_CLIENT_ID}")
        print(f"   Redirect URI: {KEYCLOAK_URL}/realms/{REALM_NAME}/broker/google/endpoint")
        print(f"\n🎉 Users can now sign in with Google!")
        print(f"   Visit: {KEYCLOAK_URL}/realms/{REALM_NAME}/account")
    except Exception as e:
        if "already exists" in str(e).lower():
            print(f"⚠️  Google provider already exists, updating configuration...")
            try:
                # Update existing provider
                admin.update_identity_provider("google", provider_config)
                print("✅ Google OAuth provider updated!")
            except Exception as update_error:
                print(f"❌ Failed to update provider: {update_error}")
                sys.exit(1)
        else:
            print(f"❌ Failed to add Google provider: {e}")
            sys.exit(1)


def validate_credentials():
    """Validate that Google OAuth credentials are provided."""
    if not GOOGLE_CLIENT_ID:
        print("❌ GOOGLE_CLIENT_ID environment variable not set")
        print("\n📋 To get Google OAuth credentials:")
        print("   1. Go to https://console.cloud.google.com/")
        print("   2. Create a new project or select existing")
        print("   3. Enable Google+ API")
        print("   4. Go to APIs & Services → Credentials")
        print("   5. Create OAuth 2.0 Client ID (Web application)")
        print("   6. Set Authorized redirect URI to:")
        print(f"      {KEYCLOAK_URL}/realms/{REALM_NAME}/broker/google/endpoint")
        print("   7. Copy Client ID and Client Secret")
        print("\n🔧 Then run:")
        print('   export GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"')
        print('   export GOOGLE_CLIENT_SECRET="your-client-secret"')
        print("   python scripts/add_google_oauth.py")
        return False

    if not GOOGLE_CLIENT_SECRET:
        print("❌ GOOGLE_CLIENT_SECRET environment variable not set")
        print('   export GOOGLE_CLIENT_SECRET="your-client-secret"')
        return False

    return True


if __name__ == "__main__":
    if not validate_credentials():
        sys.exit(1)

    setup_google_provider()

    print("\n✨ Next steps:")
    print("   1. Test login: Visit http://localhost:8081/realms/ushadow/account")
    print("   2. You should see 'Sign in with Google' button")
    print("   3. Implement frontend OIDC flow (see docs/NEXT_STEPS.md)")
