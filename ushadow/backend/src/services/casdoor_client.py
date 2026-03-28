"""
Casdoor OAuth2 Client

Handles token exchange, refresh, and app management via Casdoor.
Uses CasdoorClient from ushadow-sdk for all Casdoor interactions.
"""

import logging
import os
from typing import Optional

import httpx

from src.config.casdoor_settings import get_casdoor_config

logger = logging.getLogger(__name__)


def get_tailscale_hostname() -> Optional[str]:
    """Get the full Tailscale hostname for the current environment."""
    try:
        from src.services.tailscale_manager import TailscaleManager
        manager = TailscaleManager()
        tailnet_suffix = manager.get_tailnet_suffix()
        if not tailnet_suffix:
            return None
        env_name = os.getenv("ENV_NAME", "ushadow")
        return f"{env_name}.{tailnet_suffix}"
    except Exception as e:
        logger.debug(f"[CASDOOR-CLIENT] Could not get Tailscale hostname: {e}")
        return None


def exchange_code_for_tokens(
    code: str,
    redirect_uri: str,
    code_verifier: str,
    client_id: Optional[str] = None,
) -> dict:
    """Exchange authorization code for access/refresh tokens via Casdoor."""
    config = get_casdoor_config()
    client_id = client_id or config["client_id"]
    token_url = f"{config['url']}/api/login/oauth/access_token"

    logger.info(f"[CASDOOR-CLIENT] Exchanging code for tokens (client_id={client_id})")

    response = httpx.post(
        token_url,
        json={
            "grant_type": "authorization_code",
            "client_id": client_id,
            "code": code,
            "redirect_uri": redirect_uri,
            "code_verifier": code_verifier,
        },
        timeout=10.0,
    )
    response.raise_for_status()
    tokens = response.json()
    logger.info("[CASDOOR-CLIENT] ✅ Token exchange successful")
    return tokens


def refresh_token(refresh_token_str: str, client_id: Optional[str] = None) -> dict:
    """Refresh access token using refresh token."""
    import jwt as pyjwt

    config = get_casdoor_config()
    token_url = f"{config['url']}/api/login/oauth/access_token"

    if not client_id:
        try:
            decoded = pyjwt.decode(refresh_token_str, options={"verify_signature": False})
            client_id = decoded.get("azp") or decoded.get("aud") or config["client_id"]
            if isinstance(client_id, list):
                client_id = client_id[0]
        except Exception:
            client_id = config["client_id"]

    logger.info(f"[CASDOOR-CLIENT] Refreshing token (client_id={client_id})")

    response = httpx.post(
        token_url,
        json={
            "grant_type": "refresh_token",
            "refresh_token": refresh_token_str,
            "client_id": client_id,
        },
        timeout=10.0,
    )
    response.raise_for_status()
    tokens = response.json()
    logger.info("[CASDOOR-CLIENT] ✅ Token refresh successful")
    return tokens


def register_redirect_uri(redirect_uri: str, client_id: Optional[str] = None) -> bool:
    """Add a redirect URI to the Casdoor application if not already present."""
    config = get_casdoor_config()
    # app_name is used as the Casdoor API id (owner/name), not the hex clientId
    app_name = os.getenv("CASDOOR_APP_NAME") or config.get("app_name") or "ushadow"
    app_client_id = os.getenv("CASDOOR_CLIENT_ID") or config["client_id"]
    app_client_secret = os.getenv("CASDOOR_CLIENT_SECRET") or config.get("client_secret", "")
    base = config["url"]

    if not app_client_id or not app_client_secret:
        logger.warning("[CASDOOR-CLIENT] Missing client_id or client_secret — cannot register redirect URI")
        return False

    # Fetch the application record by app name (not hex clientId)
    app = None
    app_id = None
    for owner in ("admin", "built-in"):
        app_id = f"{owner}/{app_name}"
        resp = httpx.get(
            f"{base}/api/get-application",
            params={"id": app_id, "clientId": app_client_id, "clientSecret": app_client_secret},
            timeout=10.0,
        )
        resp.raise_for_status()
        app = resp.json().get("data") if isinstance(resp.json(), dict) else None
        if isinstance(app, dict):
            break
    else:
        logger.warning(f"[CASDOOR-CLIENT] Could not fetch app '{app_name}'")
        return False

    uris: list = app.get("redirectUris") or []
    if redirect_uri in uris:
        logger.info(f"[CASDOOR-CLIENT] Redirect URI already registered: {redirect_uri}")
        return True

    app["redirectUris"] = uris + [redirect_uri]
    resp = httpx.post(
        f"{base}/api/update-application",
        params={"id": app_id, "clientId": app_client_id, "clientSecret": app_client_secret},
        json=app,
        timeout=10.0,
    )
    resp.raise_for_status()
    logger.info(f"[CASDOOR-CLIENT] ✅ Registered redirect URI: {redirect_uri}")
    return True


def is_casdoor_token(token: str) -> bool:
    """Check if a JWT was issued by Casdoor (by inspecting iss without verification)."""
    try:
        import jwt as pyjwt
        decoded = pyjwt.decode(token, options={"verify_signature": False})
        iss = decoded.get("iss", "")
        config = get_casdoor_config()
        casdoor_internal = config["url"]
        casdoor_public = config["public_url"]
        return any(base in iss for base in [casdoor_internal, casdoor_public, "casdoor"])
    except Exception:
        return False
