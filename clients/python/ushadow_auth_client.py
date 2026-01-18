"""
Authenticated ushadow API Client

Wrapper around the auto-generated client that handles authentication.
Automatically logs in with admin credentials and maintains Bearer token.

Usage:
    from ushadow_auth_client import UshadowAuthClient

    # Auto-login with credentials from secrets.yaml or .env
    client = UshadowAuthClient.from_env()

    # List services
    services = client.list_services()
    for service in services:
        print(f"{service.service_name}: {service.status}")

    # Start a service
    result = client.start_service("chronicle-backend")
    print(result.message)
"""

import os
from pathlib import Path
from typing import Optional
from urllib.parse import urlencode

try:
    import yaml
    HAS_YAML = True
except ImportError:
    HAS_YAML = False

# Import the auto-generated client
from ushadow_api_client import Client, AuthenticatedClient
from ushadow_api_client.api.default import (
    auth_jwt_login,
    health_check,
    list_services,
    get_service,
    start_service,
    stop_service,
)
from ushadow_api_client.models import Service, AuthJwtLoginBody


class UshadowAuthClient:
    """
    Authenticated ushadow client with automatic login.

    This class wraps the auto-generated client and handles:
    - Credential loading from secrets.yaml or .env
    - Automatic login and token caching
    - Convenient methods for common operations
    """

    def __init__(self, base_url: str, email: str, password: str, verbose: bool = False):
        """
        Initialize client with credentials.

        Args:
            base_url: Base URL of ushadow backend (e.g., http://localhost:8000)
            email: Admin email
            password: Admin password
            verbose: Enable verbose logging
        """
        self.base_url = base_url
        self.email = email
        self.password = password
        self.verbose = verbose
        self._client: Optional[AuthenticatedClient] = None
        self._token: Optional[str] = None

    @classmethod
    def from_env(cls, env_file: Optional[Path] = None, verbose: bool = False) -> "UshadowAuthClient":
        """
        Create client from environment variables and secrets.yaml.

        Credential priority:
        1. secrets.yaml (admin.email, admin.password)
        2. .env file (ADMIN_EMAIL, ADMIN_PASSWORD)
        3. Environment variables

        Args:
            env_file: Path to .env file (searches parent dirs if None)
            verbose: Enable verbose logging
        """
        # Find .env file
        if env_file is None:
            env_file = cls._find_env_file()

        env_vars = cls._load_env(env_file) if env_file else {}
        secrets = cls._load_secrets()

        # Get credentials
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

        if not password:
            raise ValueError(
                "No admin password found. Check config/SECRETS/secrets.yaml or .env file"
            )

        # Get base URL
        port = env_vars.get("BACKEND_PORT", os.environ.get("BACKEND_PORT", "8000"))
        host = env_vars.get("BACKEND_HOST", os.environ.get("BACKEND_HOST", "localhost"))
        base_url = f"http://{host}:{port}"

        return cls(base_url=base_url, email=email, password=password, verbose=verbose)

    @staticmethod
    def _find_env_file() -> Optional[Path]:
        """Search parent directories for .env file."""
        current = Path.cwd()
        while current != current.parent:
            env_file = current / ".env"
            if env_file.exists():
                return env_file
            current = current.parent
        return None

    @staticmethod
    def _load_env(env_file: Path) -> dict[str, str]:
        """Load environment variables from .env file."""
        env_vars = {}
        if env_file.exists():
            with open(env_file) as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        key, _, value = line.partition("=")
                        env_vars[key.strip()] = value.strip()
        return env_vars

    @staticmethod
    def _load_secrets() -> dict:
        """Load secrets from config/SECRETS/secrets.yaml."""
        # Search for secrets.yaml in parent directories
        current = Path.cwd()
        while current != current.parent:
            secrets_file = current / "config" / "SECRETS" / "secrets.yaml"
            if secrets_file.exists() and HAS_YAML:
                with open(secrets_file) as f:
                    return yaml.safe_load(f) or {}
            current = current.parent
        return {}

    def _ensure_authenticated(self) -> AuthenticatedClient:
        """Ensure we have an authenticated client, logging in if necessary."""
        if self._client is not None:
            return self._client

        if self.verbose:
            print(f"🔐 Logging in as {self.email}...")

        # Create unauthenticated client for login
        unauth_client = Client(base_url=self.base_url)

        # Login using the auto-generated login method
        # Note: The generated client expects form data, so we construct the body manually
        import httpx
        from ushadow_api_client.models import AuthJwtLoginResponse200

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

        # Create authenticated client with Bearer token
        self._client = AuthenticatedClient(
            base_url=self.base_url,
            token=self._token,
            prefix="Bearer",
            auth_header_name="Authorization",
        )

        if self.verbose:
            print("✅ Login successful")

        return self._client

    # Convenience methods using auto-generated API functions

    def health(self) -> dict:
        """Check backend health."""
        client = Client(base_url=self.base_url)
        response = health_check.sync_detailed(client=client)
        if response.parsed:
            return response.parsed.to_dict()
        return {"status": "unknown"}

    def list_services(self) -> list[Service]:
        """List all services."""
        client = Client(base_url=self.base_url)
        response = list_services.sync_detailed(client=client)
        return response.parsed or []

    def get_service(self, service_name: str) -> Optional[Service]:
        """Get service details."""
        client = Client(base_url=self.base_url)
        response = get_service.sync_detailed(service_name=service_name, client=client)
        return response.parsed

    def start_service(self, service_name: str) -> dict:
        """Start a service (requires authentication)."""
        client = self._ensure_authenticated()
        response = start_service.sync_detailed(service_name=service_name, client=client)
        if response.parsed:
            return response.parsed.to_dict()
        return {"success": False, "message": "Unknown error"}

    def stop_service(self, service_name: str) -> dict:
        """Stop a service (requires authentication)."""
        client = self._ensure_authenticated()
        response = stop_service.sync_detailed(service_name=service_name, client=client)
        # stop_service may not return a body, just check status
        return {"success": response.status_code == 200}


# Convenience function for quick scripts
def get_client(verbose: bool = False) -> UshadowAuthClient:
    """Get an authenticated client using environment configuration."""
    return UshadowAuthClient.from_env(verbose=verbose)
