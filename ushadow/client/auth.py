"""
Authenticated ushadow API Client

Wrapper around the auto-generated client that handles authentication.
Uses raw JSON responses to avoid model parsing issues.

Usage:
    from ushadow.client.auth import UshadowClient

    client = UshadowClient.from_env()
    services = client.list_services()
"""

import os
from pathlib import Path
from typing import Optional, Any

import httpx


class UshadowClient:
    """
    Authenticated ushadow client with automatic login.

    Uses httpx directly for simpler, more reliable API access.
    The auto-generated client models are complex; this wrapper
    returns raw dicts for flexibility.
    """

    def __init__(self, base_url: str, email: str = "", password: str = "", verbose: bool = False):
        self.base_url = base_url.rstrip("/")
        self.email = email
        self.password = password
        self.verbose = verbose
        self._token: Optional[str] = None

    @classmethod
    def from_env(cls, verbose: bool = False) -> "UshadowClient":
        """Create client from environment variables."""
        env_vars = cls._load_env()

        port = env_vars.get("BACKEND_PORT", os.environ.get("BACKEND_PORT", "8000"))
        host = env_vars.get("BACKEND_HOST", os.environ.get("BACKEND_HOST", "localhost"))
        base_url = f"http://{host}:{port}"

        # Credentials come from CASDOOR_APP_ADMIN_USER/PASSWORD in .env.
        # _try_casdoor_direct_grant reads the authoritative values from the
        # backend settings API (which resolves the same env vars), so these
        # are only used as a local fallback for the error message.
        raw_user = (
            env_vars.get("CASDOOR_APP_ADMIN_USER")
            or os.environ.get("CASDOOR_APP_ADMIN_USER", "admin")
        )
        email = raw_user.split("/")[-1]
        password = str(
            env_vars.get("CASDOOR_APP_ADMIN_PASSWORD")
            or os.environ.get("CASDOOR_APP_ADMIN_PASSWORD", "")
        )

        return cls(base_url=base_url, email=email, password=password, verbose=verbose)

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

    def _ensure_authenticated(self) -> str:
        """Login if needed, return token."""
        if self._token is not None:
            return self._token

        if self.verbose:
            print(f"🔐 Logging in as {self.email}...")

        token = self._try_casdoor_direct_grant()
        if token:
            self._token = token
            if self.verbose:
                print("✅ Login successful (Casdoor)")
            return self._token

        raise RuntimeError(
            f"Authentication failed for {self.email}. "
            "Check CASDOOR_APP_ADMIN_USER/PASSWORD in .env and that casdoor-provision has been run."
        )

    def _try_casdoor_direct_grant(self) -> Optional[str]:
        """Authenticate via Casdoor Resource Owner Password Credentials grant.

        Uses the 'password' grant type on the ushadow Casdoor app.
        Casdoor URL and client_id come from the backend settings API.
        Client secret comes from CASDOOR_CLIENT_SECRET in .env.
        """
        try:
            # Get Casdoor config from backend settings
            config_response = httpx.get(
                f"{self.base_url}/api/settings/config",
                timeout=5.0,
            )
            if config_response.status_code != 200:
                if self.verbose:
                    print(f"⚠️  Could not fetch settings: {config_response.status_code}")
                return None

            config = config_response.json()
            casdoor = config.get("casdoor", {})
            casdoor_url = casdoor.get("public_url", "http://localhost:8082")
            client_id = casdoor.get("client_id", "ushadow")

            # Read credentials from .env — backend redacts sensitive values in the API
            env_vars = self._load_env()
            client_secret = (
                env_vars.get("CASDOOR_CLIENT_SECRET")
                or os.environ.get("CASDOOR_CLIENT_SECRET", "")
            )
            username = (
                env_vars.get("CASDOOR_APP_ADMIN_USER")
                or os.environ.get("CASDOOR_APP_ADMIN_USER", self.email)
            ).split("/")[-1]
            password = str(
                env_vars.get("CASDOOR_APP_ADMIN_PASSWORD")
                or os.environ.get("CASDOOR_APP_ADMIN_PASSWORD", "")
                or self.password
            )

            token_url = f"{casdoor_url}/api/login/oauth/access_token"

            if self.verbose:
                print(f"🔐 Casdoor ROPC: {token_url} (client_id={client_id})")

            response = httpx.post(
                token_url,
                json={
                    "grant_type": "password",
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "username": username,
                    "password": password,
                },
                timeout=10.0,
            )

            if response.status_code != 200:
                if self.verbose:
                    try:
                        err = response.json()
                        print(f"⚠️  Casdoor auth failed ({response.status_code}): {err.get('error_description') or err.get('error') or err}")
                    except Exception:
                        print(f"⚠️  Casdoor auth failed: {response.status_code} - {response.text[:200]}")
                return None

            return response.json().get("access_token")

        except Exception as e:
            if self.verbose:
                print(f"⚠️  Casdoor not available: {e.__class__.__name__}: {e}")
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
