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
        """Load .env.test file from robot_tests directory."""
        # robot_tests/resources -> robot_tests
        current_dir = Path(__file__).parent
        robot_tests_dir = current_dir.parent
        env_file = robot_tests_dir / ".env.test"

        if not env_file.exists():
            raise FileNotFoundError(f"Could not find .env.test file at {env_file}")

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
        """Get the backend API URL from .env.test.

        Returns:
            API URL (e.g., http://localhost:8200)
        """
        # First try BACKEND_URL directly, then fall back to constructing from port
        backend_url = self.config.get('BACKEND_URL')
        if backend_url:
            return backend_url

        # Fall back to TEST_BACKEND_PORT
        port = self.config.get('TEST_BACKEND_PORT', '8200')
        return f"http://localhost:{port}"

    def get_backend_port(self):
        """Get the backend port from .env.test.

        Returns:
            Backend port as string (e.g., "8200")
        """
        return self.config.get('TEST_BACKEND_PORT', '8200')

    def get_env_value(self, key, default=''):
        """Get any environment value from .env file.

        Args:
            key: The environment variable key
            default: Default value if key not found

        Returns:
            The value from .env or default
        """
        return self.config.get(key, default)
