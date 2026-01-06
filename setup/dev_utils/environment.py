"""
Environment management for ushadow development.

An "environment" combines:
- A git worktree (code checkout)
- Docker containers (running services)
- VS Code workspace (with color theme)
- Configuration (.env file)

This module scans for ALL environments, not just running ones.
"""

import os
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Optional

from .worktree import WorktreeManager, WorktreeInfo
from .local_docker import LocalDockerManager, ContainerStatus


class EnvironmentStatus(Enum):
    """Status of a development environment."""
    RUNNING = "running"      # Containers are up and healthy
    PARTIAL = "partial"      # Some containers running
    STOPPED = "stopped"      # Containers exist but stopped
    AVAILABLE = "available"  # Worktree exists, no containers
    ERROR = "error"          # Something is wrong


@dataclass
class EnvironmentConfig:
    """Configuration extracted from an environment's .env file."""
    env_name: str
    port_offset: int = 0
    backend_port: int = 8000
    frontend_port: int = 3000
    dev_mode: bool = True

    @classmethod
    def from_env_file(cls, env_file: Path) -> Optional["EnvironmentConfig"]:
        """Parse configuration from a .env file."""
        if not env_file.exists():
            return None

        config = {}
        with open(env_file) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" in line:
                    key, value = line.split("=", 1)
                    config[key.strip()] = value.strip().strip("\"'")

        return cls(
            env_name=config.get("ENV_NAME", env_file.parent.name),
            port_offset=int(config.get("PORT_OFFSET", 0)),
            backend_port=int(config.get("BACKEND_PORT", 8000)),
            frontend_port=int(config.get("WEBUI_PORT", 3000)),
            dev_mode=config.get("DEV_MODE", "true").lower() == "true",
        )


@dataclass
class Environment:
    """A ushadow development environment."""
    name: str
    path: Path
    status: EnvironmentStatus
    worktree: Optional[WorktreeInfo] = None
    config: Optional[EnvironmentConfig] = None
    containers: list[ContainerStatus] = field(default_factory=list)

    @property
    def branch(self) -> Optional[str]:
        """Git branch for this environment."""
        return self.worktree.branch if self.worktree else None

    @property
    def backend_url(self) -> Optional[str]:
        """URL to access the backend API."""
        if self.config:
            return f"http://localhost:{self.config.backend_port}"
        return None

    @property
    def frontend_url(self) -> Optional[str]:
        """URL to access the frontend."""
        if self.config:
            return f"http://localhost:{self.config.frontend_port}"
        return None

    @property
    def is_running(self) -> bool:
        """Check if environment is running."""
        return self.status == EnvironmentStatus.RUNNING

    @property
    def running_containers(self) -> list[ContainerStatus]:
        """Get only running containers."""
        return [c for c in self.containers if c.is_running]


class EnvironmentManager:
    """
    Manages ushadow development environments.

    Scans worktrees and Docker to discover all environments,
    regardless of whether they're currently running.
    """

    def __init__(
        self,
        main_repo: Path | str | None = None,
        worktrees_dir: Path | str | None = None,
        project_name: str = "ushadow",
    ):
        """
        Initialize the environment manager.

        Args:
            main_repo: Path to the main git repository
            worktrees_dir: Directory where worktrees are created
            project_name: Name of the project
        """
        self.project_name = project_name
        self.worktree_manager = WorktreeManager(
            main_repo=main_repo,
            worktrees_dir=worktrees_dir,
            project_name=project_name,
        )

    def list_environments(self) -> list[Environment]:
        """
        List all environments (worktrees) with their status.

        Returns:
            List of Environment objects
        """
        environments = []

        for wt in self.worktree_manager.list_worktrees():
            # Skip the main repo (bare worktree)
            if wt.is_bare:
                continue

            env = self._build_environment(wt)
            environments.append(env)

        return sorted(environments, key=lambda e: e.name)

    def _build_environment(self, worktree: WorktreeInfo) -> Environment:
        """Build an Environment object from a worktree."""
        path = worktree.path
        name = worktree.name

        # Load config from .env file
        env_file = path / ".env"
        config = EnvironmentConfig.from_env_file(env_file)

        # Get Docker container status
        docker = LocalDockerManager(path, project_name=name)
        containers = docker.list_containers()

        # Determine status
        status = self._determine_status(containers, config)

        return Environment(
            name=name,
            path=path,
            status=status,
            worktree=worktree,
            config=config,
            containers=containers,
        )

    def _determine_status(
        self,
        containers: list[ContainerStatus],
        config: Optional[EnvironmentConfig],
    ) -> EnvironmentStatus:
        """Determine the status of an environment based on its containers."""
        if not containers:
            return EnvironmentStatus.AVAILABLE

        running = [c for c in containers if c.is_running]
        stopped = [c for c in containers if not c.is_running]

        if not running and stopped:
            return EnvironmentStatus.STOPPED
        elif running and stopped:
            return EnvironmentStatus.PARTIAL
        elif running:
            # Check health
            unhealthy = [c for c in running if c.health == "unhealthy"]
            if unhealthy:
                return EnvironmentStatus.ERROR
            return EnvironmentStatus.RUNNING
        else:
            return EnvironmentStatus.AVAILABLE

    def get_environment(self, name: str) -> Optional[Environment]:
        """Get a specific environment by name."""
        for env in self.list_environments():
            if env.name == name:
                return env
        return None

    def create_environment(
        self,
        name: str,
        base_branch: str = "main",
        setup_vscode: bool = True,
        open_vscode: bool = False,
        start: bool = False,
    ) -> Environment:
        """
        Create a new development environment.

        Args:
            name: Name for the environment (becomes worktree dir name)
            base_branch: Git branch to base the worktree on
            setup_vscode: Whether to configure VS Code colors
            open_vscode: Whether to open VS Code after creation
            start: Whether to start Docker containers after creation

        Returns:
            The created Environment
        """
        # Create the worktree
        wt = self.worktree_manager.create_worktree(
            name=name,
            base_branch=base_branch,
            setup_vscode_colors=setup_vscode,
            open_vscode=open_vscode,
        )

        # Optionally start containers
        if start:
            docker = LocalDockerManager(wt.path, project_name=name)
            docker.start()

        return self.get_environment(name)

    def start_environment(self, name: str, build: bool = False) -> None:
        """Start Docker containers for an environment."""
        env = self.get_environment(name)
        if not env:
            raise ValueError(f"Environment '{name}' not found")

        docker = LocalDockerManager(env.path, project_name=name)
        docker.start(build=build)

    def stop_environment(self, name: str) -> None:
        """Stop Docker containers for an environment."""
        env = self.get_environment(name)
        if not env:
            raise ValueError(f"Environment '{name}' not found")

        docker = LocalDockerManager(env.path, project_name=name)
        docker.stop()

    def remove_environment(self, name: str, force: bool = False) -> None:
        """
        Remove an environment (worktree and containers).

        Args:
            name: Name of the environment to remove
            force: Force removal even if there are uncommitted changes
        """
        env = self.get_environment(name)
        if not env:
            raise ValueError(f"Environment '{name}' not found")

        # Stop and remove containers first
        docker = LocalDockerManager(env.path, project_name=name)
        docker.down(volumes=False)

        # Remove the worktree
        self.worktree_manager.remove_worktree(name, force=force)

    def open_in_vscode(self, name: str) -> None:
        """Open an environment in VS Code."""
        self.worktree_manager.open_in_vscode(name)
