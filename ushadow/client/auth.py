"""
Authenticated ushadow API Client

Wrapper around the auto-generated client that handles authentication.
Uses raw JSON responses to avoid model parsing issues.

Usage:
    from ushadow.client.auth import UshadowClient

    client = UshadowClient.from_env()
    services = client.list_services()
"""

import json
import os
from pathlib import Path
from typing import Optional, Any
from urllib.parse import urlencode

import httpx

try:
    import yaml
    HAS_YAML = True
except ImportError:
    HAS_YAML = False


class UshadowClient:
    """
    Authenticated ushadow client with automatic login.

    Uses httpx directly for simpler, more reliable API access.
    The auto-generated client models are complex; this wrapper
    returns raw dicts for flexibility.
    """

    def __init__(self, base_url: str, email: str = "", password: str = "", verbose: bool = False, verify_ssl: bool = True):
        self.base_url = base_url.rstrip("/")
        self.email = email
        self.password = password
        self.verbose = verbose
        self.verify_ssl = verify_ssl
        self._token: Optional[str] = None

    @classmethod
    def from_env(cls, verbose: bool = False) -> "UshadowClient":
        """Create client from environment variables and secrets.yaml."""
        env_vars = cls._load_env()
        secrets = cls._load_secrets()

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

        port = env_vars.get("BACKEND_PORT", os.environ.get("BACKEND_PORT", "8000"))
        host = env_vars.get("BACKEND_HOST", os.environ.get("BACKEND_HOST", "localhost"))
        base_url = f"http://{host}:{port}"

        return cls(base_url=base_url, email=email, password=password or "", verbose=verbose)

    @staticmethod
    def _load_env() -> dict[str, str]:
        """Load .env from parent directories."""
        current = Path.cwd()
        while current != current.parent:
            env_file = current / ".env"
            if env_file.exists():
                env_vars = {}
                with open(env_file) as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith("#") and "=" in line:
                            key, _, value = line.partition("=")
                            env_vars[key.strip()] = value.strip()
                return env_vars
            current = current.parent
        return {}

    @staticmethod
    def _load_secrets() -> dict:
        """Load secrets from config/SECRETS/secrets.yaml."""
        current = Path.cwd()
        while current != current.parent:
            secrets_file = current / "config" / "SECRETS" / "secrets.yaml"
            if secrets_file.exists() and HAS_YAML:
                with open(secrets_file) as f:
                    return yaml.safe_load(f) or {}
            current = current.parent
        return {}

    def _ensure_authenticated(self) -> str:
        """Login if needed, return token."""
        if self._token is not None:
            return self._token

        if self.verbose:
            print(f"🔐 Logging in as {self.email}...")

        # Try Keycloak direct grant flow first
        token = self._try_keycloak_direct_grant()
        if token:
            self._token = token
            if self.verbose:
                print("✅ Login successful (Keycloak)")
            return self._token

        # Fallback to legacy JWT login
        try:
            login_data = urlencode({"username": self.email, "password": self.password})
            response = httpx.post(
                f"{self.base_url}/api/auth/jwt/login",
                content=login_data.encode(),
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=10.0,
                verify=self.verify_ssl,
            )
            response.raise_for_status()
            result = response.json()
            self._token = result["access_token"]

            if self.verbose:
                print("✅ Login successful (legacy)")

            return self._token
        except Exception as e:
            if self.verbose:
                print(f"❌ Login failed: {e}")
            raise

    def _try_keycloak_direct_grant(self) -> Optional[str]:
        """Try to authenticate using Keycloak direct grant (Resource Owner Password Credentials).

        Returns:
            Access token if successful, None if Keycloak is not available or auth fails
        """
        try:
            # Get Keycloak configuration from backend
            config_response = httpx.get(
                f"{self.base_url}/api/keycloak/config",
                timeout=5.0,
                verify=self.verify_ssl,
            )

            if config_response.status_code != 200:
                if self.verbose:
                    print(f"⚠️  Keycloak config endpoint failed: {config_response.status_code}")
                return None

            kc_config = config_response.json()

            # Use Keycloak if a URL is present, regardless of the enabled flag
            # (k8s deployments may return enabled=null but still use Keycloak)
            keycloak_url = kc_config.get("public_url")
            if not keycloak_url:
                return None

            realm = kc_config.get("realm", "ushadow")
            token_url = f"{keycloak_url}/realms/{realm}/protocol/openid-connect/token"

            # Try ushadow-cli client first (intended for direct grant / CLI use),
            # fall back to ushadow-frontend if it doesn't exist
            for client_id in ("ushadow-cli", "ushadow-frontend"):
                token_response = httpx.post(
                    token_url,
                    data={
                        "grant_type": "password",
                        "client_id": client_id,
                        "username": self.email,
                        "password": self.password,
                    },
                    timeout=10.0,
                    verify=self.verify_ssl,
                )
                if token_response.status_code == 200:
                    break
                if self.verbose:
                    print(f"⚠️  Keycloak client '{client_id}' failed: {token_response.status_code}")

            if token_response.status_code != 200:
                if self.verbose:
                    try:
                        error_detail = token_response.json()
                        error_msg = error_detail.get("error_description") or error_detail.get("error")
                        print(f"⚠️  Keycloak auth failed ({token_response.status_code}): {error_msg}")
                    except Exception:
                        print(f"⚠️  Keycloak auth failed: {token_response.status_code} - {token_response.text[:200]}")
                return None

            tokens = token_response.json()
            return tokens.get("access_token")

        except Exception as e:
            if self.verbose:
                print(f"⚠️  Keycloak not available: {e.__class__.__name__}: {e}")
            return None

    def _request(
        self,
        method: str,
        endpoint: str,
        data: Optional[dict] = None,
        auth: bool = False,
        timeout: float = 30.0,
    ) -> Any:
        """Make an API request."""
        url = f"{self.base_url}{endpoint}"
        headers = {"Content-Type": "application/json"}

        if auth:
            token = self._ensure_authenticated()
            headers["Authorization"] = f"Bearer {token}"

        response = httpx.request(
            method=method,
            url=url,
            json=data,
            headers=headers,
            timeout=timeout,
            verify=self.verify_ssl,
        )
        response.raise_for_status()

        if response.content:
            return response.json()
        return {"success": True}

    # =========================================================================
    # Health
    # =========================================================================

    def health(self) -> dict:
        """Check backend health."""
        return self._request("GET", "/health")

    # =========================================================================
    # Services
    # =========================================================================

    def list_services(self) -> list[dict]:
        """List all services."""
        return self._request("GET", "/api/services/")

    def get_service(self, name: str) -> dict:
        """Get service details."""
        return self._request("GET", f"/api/services/{name}")

    def get_service_status(self, name: str) -> dict:
        """Get service status."""
        return self._request("GET", f"/api/services/{name}/status")

    def start_service(self, name: str) -> dict:
        """Start a service (requires auth)."""
        return self._request("POST", f"/api/services/{name}/start", auth=True)

    def stop_service(self, name: str) -> dict:
        """Stop a service (requires auth)."""
        return self._request("POST", f"/api/services/{name}/stop", auth=True)

    def restart_service(self, name: str) -> dict:
        """Restart a service (requires auth)."""
        return self._request("POST", f"/api/services/{name}/restart", auth=True)

    def get_service_logs(self, name: str, lines: int = 100) -> dict:
        """Get service logs."""
        return self._request("GET", f"/api/services/{name}/logs?lines={lines}")

    def get_service_env(self, name: str) -> dict:
        """Get service environment config."""
        return self._request("GET", f"/api/services/{name}/env")

    def export_service_env(self, name: str) -> dict:
        """Export environment variables for a service."""
        return self._request("GET", f"/api/services/{name}/env-export", auth=True)

    # =========================================================================
    # Generic API Access
    # =========================================================================

    def api(self, method: str, endpoint: str, data: Optional[dict] = None, auth: bool = True) -> Any:
        """Make a generic API request."""
        if not endpoint.startswith("/"):
            endpoint = "/" + endpoint
        return self._request(method.upper(), endpoint, data=data, auth=auth)


# Convenience alias
def get_client(verbose: bool = False) -> UshadowClient:
    """Get authenticated client from environment."""
    return UshadowClient.from_env(verbose=verbose)
