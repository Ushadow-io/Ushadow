#!/usr/bin/env python3
"""
Register Redirect URIs with Keycloak

This script adds redirect URIs to the ushadow-frontend Keycloak client.
Use this to register new URLs (localhost ports, Tailscale domains, etc.)

Usage:
    python scripts/register_keycloak_redirects.py http://localhost:3010/oauth/callback
    python scripts/register_keycloak_redirects.py https://myapp.ts.net/oauth/callback
"""

import asyncio
import sys
import os

# Add backend to Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "ushadow", "backend"))

from src.services.keycloak_admin import KeycloakAdminClient


async def main():
    if len(sys.argv) < 2:
        print("Usage: python register_keycloak_redirects.py <redirect_uri>")
        print("Example: python register_keycloak_redirects.py http://localhost:3010/oauth/callback")
        sys.exit(1)

    redirect_uri = sys.argv[1]

    # Get Keycloak config from environment
    keycloak_url = os.getenv("KEYCLOAK_URL", "http://localhost:8081")
    realm = os.getenv("KEYCLOAK_REALM", "ushadow")
    admin_user = os.getenv("KEYCLOAK_ADMIN", "admin")
    admin_password = os.getenv("KEYCLOAK_ADMIN_PASSWORD", "admin")
    client_id = "ushadow-frontend"

    print(f"🔐 Registering redirect URI with Keycloak")
    print(f"   Keycloak: {keycloak_url}")
    print(f"   Realm: {realm}")
    print(f"   Client: {client_id}")
    print(f"   Redirect URI: {redirect_uri}")
    print()

    # Create admin client
    admin_client = KeycloakAdminClient(
        keycloak_url=keycloak_url,
        realm=realm,
        admin_user=admin_user,
        admin_password=admin_password,
    )

    # Register the redirect URI (merges with existing)
    success = await admin_client.register_redirect_uri(client_id, redirect_uri)

    if success:
        print("✅ Success! Redirect URI registered.")

        # Also register as post-logout redirect URI
        base_url = redirect_uri.replace("/oauth/callback", "")
        logout_success = await admin_client.update_post_logout_redirect_uris(
            client_id,
            [base_url, base_url + "/"],
            merge=True
        )

        if logout_success:
            print(f"✅ Post-logout redirect URIs also registered: {base_url}")

        print()
        print("You can now use OAuth login from this URL!")
    else:
        print("❌ Failed to register redirect URI")
        print("Check that:")
        print("  1. Keycloak is running")
        print("  2. Admin credentials are correct")
        print("  3. The realm and client exist")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
