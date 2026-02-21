#!/usr/bin/env python3
"""
Update Keycloak realm browser security headers to allow embedding in Tauri/Tailscale.

This script updates the CSP frame-ancestors to allow the frontend to embed Keycloak
in iframes from any origin (needed for Tauri launcher and Tailscale domains).
"""

import os
import sys
from keycloak import KeycloakAdmin


def update_csp():
    """Update Keycloak realm CSP to allow embedding from any origin."""

    # Get config from environment
    keycloak_url = os.getenv("KEYCLOAK_URL", "http://keycloak:8080")
    realm = os.getenv("KEYCLOAK_REALM", "ushadow")
    admin_user = os.getenv("KEYCLOAK_ADMIN", "admin")
    admin_password = os.getenv("KEYCLOAK_ADMIN_PASSWORD", "admin")

    print(f"[UPDATE-CSP] Connecting to Keycloak at {keycloak_url}")
    print(f"[UPDATE-CSP] Realm: {realm}")

    # Connect to Keycloak
    admin = KeycloakAdmin(
        server_url=keycloak_url,
        username=admin_user,
        password=admin_password,
        realm_name="master",  # Authenticate against master realm
        verify=True,
    )

    # Browser security headers with relaxed frame-ancestors for development
    # Note: 'self' allows Keycloak to embed itself
    # http: https: allows any HTTP/HTTPS origin (needed for Tailscale and launcher)
    # tauri: allows Tauri apps
    headers = {
        "contentSecurityPolicy": "frame-src 'self'; frame-ancestors 'self' http: https: tauri:; object-src 'none';",
        "xContentTypeOptions": "nosniff",
        "xRobotsTag": "none",
        "xFrameOptions": "",  # Remove X-Frame-Options (conflicts with CSP frame-ancestors)
        "xXSSProtection": "1; mode=block",
        "strictTransportSecurity": "max-age=31536000; includeSubDomains"
    }

    print("[UPDATE-CSP] Updating Keycloak realm browser security headers...")
    print(f"[UPDATE-CSP] CSP: {headers['contentSecurityPolicy']}")

    try:
        # Get current realm configuration
        realm_config = admin.get_realm(realm)

        # Update browserSecurityHeaders
        realm_config["browserSecurityHeaders"] = headers

        # Update realm
        admin.update_realm(realm, realm_config)

        print("[UPDATE-CSP] ✓ Successfully updated Keycloak CSP")
        print("[UPDATE-CSP] The frontend can now embed Keycloak from any origin")
        return 0
    except Exception as e:
        print(f"[UPDATE-CSP] ❌ Failed to update CSP: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(update_csp())
