"""
Authenticated ushadow API Client

Wrapper around the auto-generated client that handles authentication.

Usage:
    from ushadow.client.auth import UshadowClient

    client = UshadowClient.from_env()
    services = client.list_services()
"""

import os
from pathlib import Path
from typing import Optional
from urllib.parse import urlencode

import httpx

try:
    import yaml
    HAS_YAML = True
except ImportError:
    HAS_YAML = False

from .client import Client, AuthenticatedClient
from .api.default import (
    health_check,
    list_services,
    get_service,
    start_service,
    stop_service,
)
from .models import Service


class UshadowClient:
    """
    Authenticated ushadow client with automatic login.

    Handles:
    - Credential loading from secrets.yaml or .env
    - Automatic login and token caching
    - Convenient methods for common operations
    """

    def __init__(self, base_url: str, email: str = "", password: str = "", verbose: bool = False):
        self.base_url = base_url
        self.email = email
        self.password = password
        self.verbose = verbose
        self._client: Optional[AuthenticatedClient] = None
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

    def _ensure_authenticated(self) -> AuthenticatedClient:
        """Login if needed, return authenticated client."""
        if self._client is not None:
            return self._client

        if self.verbose:
            print(f"🔐 Logging in as {self.email}...")

        login_data = urlencode({"username": self.email, "password": self.password})
        response = httpx.post(
            f"{self.base_url}/api/auth/jwt/login",
            content=login_data.encode(),
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=10.0,
        )
        response.raise_for_status()
        result = response.json()

        self._token = result["access_token"]
        self._client = AuthenticatedClient(
            base_url=self.base_url,
            token=self._token,
            prefix="Bearer",
            auth_header_name="Authorization",
        )

        if self.verbose:
            print("✅ Login successful")

        return self._client

    # API methods

    def health(self) -> dict:
        """Check backend health (no auth required)."""
        client = Client(base_url=self.base_url)
        response = health_check.sync_detailed(client=client)
        return response.parsed.to_dict() if response.parsed else {"status": "unknown"}

    def list_services(self) -> list[Service]:
        """List all services (no auth required)."""
        client = Client(base_url=self.base_url)
        response = list_services.sync_detailed(client=client)
        return response.parsed or []

    def get_service(self, service_name: str) -> Optional[Service]:
        """Get service details (no auth required)."""
        client = Client(base_url=self.base_url)
        response = get_service.sync_detailed(service_name=service_name, client=client)
        return response.parsed

    def start_service(self, service_name: str) -> dict:
        """Start a service (requires auth)."""
        client = self._ensure_authenticated()
        response = start_service.sync_detailed(service_name=service_name, client=client)
        return response.parsed.to_dict() if response.parsed else {"success": False}

    def stop_service(self, service_name: str) -> dict:
        """Stop a service (requires auth)."""
        client = self._ensure_authenticated()
        response = stop_service.sync_detailed(service_name=service_name, client=client)
        return {"success": response.status_code == 200}


# Convenience alias
def get_client(verbose: bool = False) -> UshadowClient:
    """Get authenticated client from environment."""
    return UshadowClient.from_env(verbose=verbose)
