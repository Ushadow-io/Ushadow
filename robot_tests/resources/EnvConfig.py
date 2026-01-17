"""Robot Framework library for reading environment configuration."""

import os
from pathlib import Path


class EnvConfig:
    """Library for accessing environment configuration from .env file."""

    def __init__(self):
        """Initialize and load .env file from project root."""
        self.config = {}
        self._load_env_file()

    def _load_env_file(self):
        """Load .env file from project root (3 levels up from robot_tests/resources)."""
        # robot_tests/resources -> robot_tests -> project_root
        current_dir = Path(__file__).parent
        project_root = current_dir.parent.parent
        env_file = project_root / ".env"

        if not env_file.exists():
            raise FileNotFoundError(f"Could not find .env file at {env_file}")

        with open(env_file, 'r') as f:
            for line in f:
                line = line.strip()
                # Skip comments and empty lines
                if not line or line.startswith('#'):
                    continue

                # Parse KEY=VALUE
                if '=' in line:
                    key, value = line.split('=', 1)
                    # Remove quotes if present
                    value = value.strip().strip('"').strip("'")
                    self.config[key.strip()] = value

    def get_api_url(self):
        """Get the backend API URL from BACKEND_PORT in .env.

        Returns:
            API URL (e.g., http://localhost:8080)
        """
        port = self.config.get('BACKEND_PORT', '8000')
        return f"http://localhost:{port}"

    def get_backend_port(self):
        """Get the backend port from .env.

        Returns:
            Backend port as string (e.g., "8080")
        """
        return self.config.get('BACKEND_PORT', '8000')

    def get_env_value(self, key, default=''):
        """Get any environment value from .env file.

        Args:
            key: The environment variable key
            default: Default value if key not found

        Returns:
            The value from .env or default
        """
        return self.config.get(key, default)
