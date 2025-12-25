#!/usr/bin/env python3
"""
Ushadow Manager - Node management daemon for distributed clusters.

This service runs on worker nodes and:
- Maintains connection to the leader node
- Sends periodic heartbeats
- Executes commands from the leader (start/stop containers, etc.)
- Reports node status and metrics
"""

import asyncio
import logging
import os
import platform
import signal
import sys
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

import aiohttp
import docker
from docker.errors import DockerException

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("ushadow-manager")

# Configuration from environment
LEADER_URL = os.environ.get("LEADER_URL", "http://localhost:8010")
NODE_SECRET = os.environ.get("NODE_SECRET", "")
NODE_HOSTNAME = os.environ.get("NODE_HOSTNAME", platform.node())
TAILSCALE_IP = os.environ.get("TAILSCALE_IP", "")
HEARTBEAT_INTERVAL = int(os.environ.get("HEARTBEAT_INTERVAL", "15"))
MANAGER_PORT = int(os.environ.get("MANAGER_PORT", "8444"))


class UshadowManager:
    """Main manager service for worker nodes."""

    def __init__(self):
        self.leader_url = LEADER_URL.rstrip("/")
        self.node_secret = NODE_SECRET
        self.hostname = NODE_HOSTNAME
        self.tailscale_ip = TAILSCALE_IP
        self.running = True
        self.docker_client: Optional[docker.DockerClient] = None
        self.session: Optional[aiohttp.ClientSession] = None
        self.services_running: List[str] = []

    async def start(self):
        """Start the manager service."""
        logger.info(f"Starting Ushadow Manager on {self.hostname}")
        logger.info(f"Leader URL: {self.leader_url}")
        logger.info(f"Tailscale IP: {self.tailscale_ip}")

        # Initialize Docker client
        try:
            self.docker_client = docker.from_env()
            logger.info("Docker client initialized")
        except DockerException as e:
            logger.error(f"Failed to connect to Docker: {e}")
            logger.error("Make sure Docker socket is mounted")

        # Initialize HTTP session
        self.session = aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=30),
            headers={"X-Node-Secret": self.node_secret}
        )

        # Start heartbeat loop
        await self.heartbeat_loop()

    async def stop(self):
        """Stop the manager service."""
        logger.info("Stopping Ushadow Manager...")
        self.running = False
        if self.session:
            await self.session.close()
        if self.docker_client:
            self.docker_client.close()

    async def heartbeat_loop(self):
        """Send periodic heartbeats to the leader."""
        while self.running:
            try:
                await self.send_heartbeat()
            except Exception as e:
                logger.error(f"Heartbeat failed: {e}")

            await asyncio.sleep(HEARTBEAT_INTERVAL)

    async def send_heartbeat(self):
        """Send a heartbeat to the leader."""
        if not self.session:
            return

        # Gather metrics
        metrics = self.get_node_metrics()
        self.services_running = self.get_running_services()

        heartbeat_data = {
            "hostname": self.hostname,
            "status": "online",
            "services_running": self.services_running,
            "capabilities": self.get_capabilities(),
            "metrics": metrics,
        }

        try:
            async with self.session.post(
                f"{self.leader_url}/api/nodes/heartbeat",
                json=heartbeat_data
            ) as response:
                if response.status == 200:
                    logger.debug("Heartbeat sent successfully")
                else:
                    text = await response.text()
                    logger.warning(f"Heartbeat response: {response.status} - {text}")
        except aiohttp.ClientError as e:
            logger.error(f"Failed to send heartbeat: {e}")

    def get_node_metrics(self) -> Dict[str, Any]:
        """Gather node metrics."""
        metrics = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        # CPU usage (simplified)
        try:
            import psutil
            metrics["cpu_percent"] = psutil.cpu_percent(interval=0.1)
            metrics["memory_percent"] = psutil.virtual_memory().percent
            metrics["disk_percent"] = psutil.disk_usage("/").percent
        except ImportError:
            pass  # psutil not available

        # Docker stats
        if self.docker_client:
            try:
                containers = self.docker_client.containers.list()
                metrics["containers_running"] = len(containers)
            except Exception:
                pass

        return metrics

    def get_running_services(self) -> List[str]:
        """Get list of running ushadow services."""
        services = []
        if not self.docker_client:
            return services

        try:
            containers = self.docker_client.containers.list()
            for container in containers:
                name = container.name
                # Only include ushadow-related containers
                if "ushadow" in name.lower():
                    services.append(name)
        except Exception as e:
            logger.error(f"Failed to list containers: {e}")

        return services

    def get_capabilities(self) -> Dict[str, Any]:
        """Get node capabilities."""
        capabilities = {
            "can_run_docker": self.docker_client is not None,
            "can_run_gpu": False,
            "can_become_leader": False,
            "available_memory_mb": 0,
            "available_cpu_cores": 0,
            "available_disk_gb": 0,
        }

        try:
            import psutil
            mem = psutil.virtual_memory()
            capabilities["available_memory_mb"] = int(mem.available / 1024 / 1024)
            capabilities["available_cpu_cores"] = psutil.cpu_count()
            disk = psutil.disk_usage("/")
            capabilities["available_disk_gb"] = round(disk.free / 1024 / 1024 / 1024, 1)
        except ImportError:
            pass

        # Check for GPU
        try:
            import subprocess
            result = subprocess.run(
                ["nvidia-smi", "-L"],
                capture_output=True,
                timeout=5
            )
            if result.returncode == 0:
                capabilities["can_run_gpu"] = True
        except Exception:
            pass

        return capabilities

    # Service management commands
    async def start_service(self, service_name: str, image: str, **kwargs) -> Dict[str, Any]:
        """Start a Docker container."""
        if not self.docker_client:
            return {"success": False, "error": "Docker not available"}

        try:
            container = self.docker_client.containers.run(
                image,
                name=service_name,
                detach=True,
                **kwargs
            )
            return {"success": True, "container_id": container.id}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def stop_service(self, service_name: str) -> Dict[str, Any]:
        """Stop a Docker container."""
        if not self.docker_client:
            return {"success": False, "error": "Docker not available"}

        try:
            container = self.docker_client.containers.get(service_name)
            container.stop()
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def restart_service(self, service_name: str) -> Dict[str, Any]:
        """Restart a Docker container."""
        if not self.docker_client:
            return {"success": False, "error": "Docker not available"}

        try:
            container = self.docker_client.containers.get(service_name)
            container.restart()
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def get_service_logs(self, service_name: str, tail: int = 100) -> Dict[str, Any]:
        """Get logs from a Docker container."""
        if not self.docker_client:
            return {"success": False, "error": "Docker not available"}

        try:
            container = self.docker_client.containers.get(service_name)
            logs = container.logs(tail=tail).decode("utf-8")
            return {"success": True, "logs": logs}
        except Exception as e:
            return {"success": False, "error": str(e)}


async def main():
    """Main entry point."""
    manager = UshadowManager()

    # Handle shutdown signals
    loop = asyncio.get_event_loop()

    def shutdown_handler():
        logger.info("Received shutdown signal")
        asyncio.create_task(manager.stop())

    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, shutdown_handler)

    try:
        await manager.start()
    except KeyboardInterrupt:
        await manager.stop()


if __name__ == "__main__":
    asyncio.run(main())
