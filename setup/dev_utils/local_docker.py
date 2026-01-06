"""
Local Docker operations for ushadow development environments.

Simple docker-compose wrapper for local development. This is intentionally
simple - complex orchestration goes through the backend's UNode system.
"""

import os
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


@dataclass
class ContainerStatus:
    """Status of a Docker container."""
    name: str
    status: str  # running, exited, paused, etc.
    health: Optional[str] = None  # healthy, unhealthy, starting, none
    ports: list[str] = None

    def __post_init__(self):
        if self.ports is None:
            self.ports = []

    @property
    def is_running(self) -> bool:
        return self.status == "running"

    @property
    def is_healthy(self) -> bool:
        return self.health in ("healthy", None)  # None means no health check


class LocalDockerManager:
    """
    Manages local Docker containers for a ushadow environment.

    This is a thin wrapper around docker-compose for local development.
    For distributed/remote container management, use UNode.
    """

    def __init__(self, project_dir: Path | str, project_name: Optional[str] = None):
        """
        Initialize the Docker manager.

        Args:
            project_dir: Directory containing docker-compose.yml
            project_name: Docker Compose project name (defaults to directory name)
        """
        self.project_dir = Path(project_dir)
        self.project_name = project_name or self.project_dir.name

    def _run_compose(
        self,
        *args: str,
        capture: bool = False,
        check: bool = True,
    ) -> subprocess.CompletedProcess:
        """Run a docker compose command."""
        cmd = ["docker", "compose", "-p", self.project_name, *args]

        return subprocess.run(
            cmd,
            cwd=self.project_dir,
            capture_output=capture,
            text=True,
            check=check,
        )

    def is_docker_available(self) -> bool:
        """Check if Docker daemon is running."""
        result = subprocess.run(
            ["docker", "info"],
            capture_output=True,
            text=True,
        )
        return result.returncode == 0

    def list_containers(self) -> list[ContainerStatus]:
        """
        List containers for this project.

        Returns:
            List of ContainerStatus objects
        """
        result = self._run_compose(
            "ps", "--format", "json", "-a",
            capture=True,
            check=False,
        )

        if result.returncode != 0:
            return []

        import json
        containers = []

        # docker compose ps --format json outputs one JSON object per line
        for line in result.stdout.strip().split("\n"):
            if not line:
                continue
            try:
                data = json.loads(line)
                containers.append(ContainerStatus(
                    name=data.get("Name", ""),
                    status=data.get("State", "unknown"),
                    health=data.get("Health", None),
                    ports=self._parse_ports(data.get("Publishers", [])),
                ))
            except json.JSONDecodeError:
                continue

        return containers

    def _parse_ports(self, publishers: list) -> list[str]:
        """Parse port publishers from docker compose ps output."""
        ports = []
        for pub in publishers:
            if isinstance(pub, dict):
                host_port = pub.get("PublishedPort", 0)
                container_port = pub.get("TargetPort", 0)
                if host_port and container_port:
                    ports.append(f"{host_port}:{container_port}")
        return ports

    def is_running(self) -> bool:
        """Check if any containers are running for this project."""
        containers = self.list_containers()
        return any(c.is_running for c in containers)

    def start(self, services: Optional[list[str]] = None, build: bool = False) -> None:
        """
        Start containers.

        Args:
            services: Specific services to start (default: all)
            build: Whether to rebuild images before starting
        """
        args = ["up", "-d"]
        if build:
            args.append("--build")
        if services:
            args.extend(services)

        self._run_compose(*args)

    def stop(self, services: Optional[list[str]] = None) -> None:
        """
        Stop containers.

        Args:
            services: Specific services to stop (default: all)
        """
        args = ["stop"]
        if services:
            args.extend(services)

        self._run_compose(*args)

    def down(self, volumes: bool = False) -> None:
        """
        Stop and remove containers.

        Args:
            volumes: Also remove volumes
        """
        args = ["down"]
        if volumes:
            args.append("-v")

        self._run_compose(*args)

    def restart(self, services: Optional[list[str]] = None) -> None:
        """
        Restart containers.

        Args:
            services: Specific services to restart (default: all)
        """
        args = ["restart"]
        if services:
            args.extend(services)

        self._run_compose(*args)

    def logs(
        self,
        services: Optional[list[str]] = None,
        follow: bool = False,
        tail: Optional[int] = None,
    ) -> str:
        """
        Get container logs.

        Args:
            services: Specific services to get logs for
            follow: Follow log output (blocking)
            tail: Number of lines to show from the end

        Returns:
            Log output as string (if not following)
        """
        args = ["logs"]
        if follow:
            args.append("-f")
        if tail:
            args.extend(["--tail", str(tail)])
        if services:
            args.extend(services)

        if follow:
            # For follow mode, don't capture - let it stream to terminal
            self._run_compose(*args, capture=False, check=False)
            return ""
        else:
            result = self._run_compose(*args, capture=True, check=False)
            return result.stdout + result.stderr
