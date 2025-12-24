"""
Secrets loader for Ushadow
Loads secrets from config/secrets.yaml with fallback to environment variables
"""

import logging
from pathlib import Path
from typing import Optional

import yaml

logger = logging.getLogger(__name__)


class SecretsLoader:
    """Load secrets from secrets.yaml file."""

    def __init__(self, secrets_path: Optional[Path] = None):
        """
        Initialize secrets loader.

        Args:
            secrets_path: Path to secrets.yaml. Defaults to config/secrets.yaml
        """
        if secrets_path is None:
            # Try common locations (Docker mount and local dev paths)
            candidates = [
                Path("/config/secrets.yaml"),  # Docker mounted volume
                Path("config/secrets.yaml"),  # Local from backend dir
                Path("../config/secrets.yaml"),  # Local from backend/src
                Path("../../config/secrets.yaml"),  # Local from backend/src/config
            ]
            for candidate in candidates:
                if candidate.exists():
                    secrets_path = candidate
                    break

        self.secrets_path = secrets_path
        self._secrets_cache = None

    def _load_secrets(self) -> dict:
        """Load secrets from YAML file."""
        if self._secrets_cache is not None:
            return self._secrets_cache

        if self.secrets_path is None or not self.secrets_path.exists():
            logger.warning(f"Secrets file not found: {self.secrets_path}")
            self._secrets_cache = {}
            return self._secrets_cache

        try:
            with open(self.secrets_path, 'r') as f:
                data = yaml.safe_load(f) or {}
            self._secrets_cache = data
            logger.info(f"Loaded secrets from {self.secrets_path}")
            return data
        except Exception as e:
            logger.error(f"Error loading secrets: {e}")
            self._secrets_cache = {}
            return self._secrets_cache

    def get_auth_secret_key(self) -> Optional[str]:
        """Get AUTH_SECRET_KEY from secrets.yaml."""
        secrets = self._load_secrets()
        return secrets.get('security', {}).get('auth_secret_key')

    def get_session_secret(self) -> Optional[str]:
        """Get SESSION_SECRET from secrets.yaml."""
        secrets = self._load_secrets()
        return secrets.get('security', {}).get('session_secret')

    def get_admin_email(self) -> Optional[str]:
        """Get admin email from secrets.yaml."""
        secrets = self._load_secrets()
        return secrets.get('admin', {}).get('email')

    def get_admin_password(self) -> Optional[str]:
        """Get admin password from secrets.yaml."""
        secrets = self._load_secrets()
        return secrets.get('admin', {}).get('password')


# Global instance
_secrets_loader = None


def get_secrets_loader() -> SecretsLoader:
    """Get global secrets loader instance."""
    global _secrets_loader
    if _secrets_loader is None:
        _secrets_loader = SecretsLoader()
    return _secrets_loader
