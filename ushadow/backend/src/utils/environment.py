"""
Centralized environment configuration access.

Single source of truth for environment name, compose project, and deployment context.
"""

import os
from typing import Optional
from functools import lru_cache


class EnvironmentInfo:
    """
    Centralized access to environment configuration.

    This class provides a single source of truth for:
    - Environment name (ENV_NAME)
    - Compose project name (COMPOSE_PROJECT_NAME)
    - Kubernetes namespace (derived from env name)
    - Deployment target identification

    Usage:
        from src.utils.environment import get_environment_info

        env = get_environment_info()
        print(env.env_name)              # 'purple'
        print(env.compose_project_name)  # 'ushadow-purple'
        print(env.k8s_namespace)         # 'ushadow-purple'
    """

    def __init__(self):
        self._env_name: Optional[str] = None
        self._compose_project_name: Optional[str] = None

    @property
    def env_name(self) -> str:
        """
        Get the environment name.

        Priority:
        1. ENV_NAME environment variable
        2. Derived from COMPOSE_PROJECT_NAME (strips 'ushadow-' prefix)
        3. Default: 'ushadow'

        Returns:
            Environment name (e.g., 'purple', 'dev', 'prod')
        """
        if self._env_name is None:
            # Try ENV_NAME first
            env = os.getenv("ENV_NAME", "").strip()

            if env:
                self._env_name = env
            else:
                # Try to derive from COMPOSE_PROJECT_NAME
                compose = os.getenv("COMPOSE_PROJECT_NAME", "").strip()
                if compose and compose.startswith("ushadow-"):
                    self._env_name = compose.replace("ushadow-", "", 1)
                elif compose:
                    self._env_name = compose
                else:
                    self._env_name = "ushadow"

        return self._env_name

    @property
    def compose_project_name(self) -> str:
        """
        Get the Docker Compose project name.

        Priority:
        1. COMPOSE_PROJECT_NAME environment variable
        2. Derived from ENV_NAME (adds 'ushadow-' prefix)
        3. Default: 'ushadow'

        Returns:
            Compose project name (e.g., 'ushadow-purple', 'ushadow-dev')
        """
        if self._compose_project_name is None:
            compose = os.getenv("COMPOSE_PROJECT_NAME", "").strip()

            if compose:
                self._compose_project_name = compose
            else:
                # Try to derive from ENV_NAME
                env = os.getenv("ENV_NAME", "").strip()
                if env:
                    self._compose_project_name = f"ushadow-{env}"
                else:
                    self._compose_project_name = "ushadow"

        return self._compose_project_name

    @property
    def k8s_namespace(self) -> str:
        """
        Get the Kubernetes namespace for this environment.

        For Kubernetes deployments, uses compose_project_name as the namespace.
        This ensures environment isolation in K8s clusters.

        Returns:
            Kubernetes namespace (e.g., 'ushadow-purple', 'ushadow-dev')
        """
        return self.compose_project_name

    @property
    def compose_network_name(self) -> str:
        """
        Get the default Docker Compose network name.

        Returns:
            Network name (e.g., 'ushadow-purple_default')
        """
        return f"{self.compose_project_name}_default"

    def is_local_deployment(self, hostname: str) -> bool:
        """
        Check if a hostname refers to the local environment.

        Args:
            hostname: Hostname to check (can be env_name, compose_project_name,
                     HOST_HOSTNAME, or display_name format like "Orion-orange")

        Returns:
            True if hostname matches current environment, False otherwise
        """
        # Basic matches
        local_names = [self.env_name, self.compose_project_name, "localhost", "local"]

        # Add HOST_HOSTNAME if set
        host_hostname = os.getenv("HOST_HOSTNAME", "").strip()
        if host_hostname:
            local_names.append(host_hostname)
            # Also add display_name format: {HOST_HOSTNAME}-{env_name}
            local_names.append(f"{host_hostname}-{self.env_name}")

        return hostname in local_names

    def get_container_labels(self) -> dict:
        """
        Get standard Docker labels for containers in this environment.

        Returns labels for:
        - Compose project association
        - Environment identification
        - ushadow tracking

        Returns:
            Dict of label key-value pairs
        """
        return {
            "com.docker.compose.project": self.compose_project_name,
            "com.docker.compose.project.working_dir": os.environ.get("PWD", "/app"),
            "com.docker.compose.project.config_files": "",
            "ushadow.env_name": self.env_name,
        }

    def __repr__(self) -> str:
        return (
            f"EnvironmentInfo(env_name={self.env_name!r}, "
            f"compose_project={self.compose_project_name!r})"
        )


# Global singleton instance
_environment_info: Optional[EnvironmentInfo] = None


def get_environment_info() -> EnvironmentInfo:
    """
    Get the global EnvironmentInfo singleton.

    This is the recommended way to access environment configuration.

    Returns:
        EnvironmentInfo singleton instance
    """
    global _environment_info
    if _environment_info is None:
        _environment_info = EnvironmentInfo()
    return _environment_info


# Convenience functions for common access patterns
def get_env_name() -> str:
    """Get current environment name."""
    return get_environment_info().env_name


def get_compose_project_name() -> str:
    """Get current compose project name."""
    return get_environment_info().compose_project_name


def get_k8s_namespace() -> str:
    """Get Kubernetes namespace for current environment."""
    return get_environment_info().k8s_namespace


def is_local_deployment(hostname: str) -> bool:
    """Check if hostname is local to this environment."""
    return get_environment_info().is_local_deployment(hostname)
