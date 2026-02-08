#!/usr/bin/env python3
"""
Ushadow Manager - Node management daemon for distributed clusters.

This service runs on worker nodes and:
- Maintains connection to the leader node
- Sends periodic heartbeats
- Executes commands from the leader (start/stop containers, etc.)
- Reports node status and metrics
- Exposes HTTP API for receiving deployment commands
"""

import asyncio
import json
import logging
import os
import platform
import signal
import sys
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

import aiohttp
from aiohttp import web
import docker
from docker.errors import DockerException, NotFound, ImageNotFound
from telemetry import TelemetryClient
import threading

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("ushadow-manager")

# Version info - update this when releasing new versions
MANAGER_VERSION = "0.3.0"

# Configuration from environment
LEADER_URL = os.environ.get("LEADER_URL", "http://localhost:8010")
NODE_SECRET = os.environ.get("NODE_SECRET", "")
NODE_HOSTNAME = os.environ.get("NODE_HOSTNAME", platform.node())
TAILSCALE_IP = os.environ.get("TAILSCALE_IP", "")
HEARTBEAT_INTERVAL = int(os.environ.get("HEARTBEAT_INTERVAL", "15"))
MANAGER_PORT = int(os.environ.get("MANAGER_PORT", "8444"))
TELEMETRY_ENDPOINT = os.environ.get(
    "TELEMETRY_ENDPOINT",
    "https://ushadow-telemetry.your-subdomain.workers.dev"
)


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
        self.web_app: Optional[web.Application] = None
        self.web_runner: Optional[web.AppRunner] = None

    def _check_auth(self, request: web.Request) -> bool:
        """Verify request authentication via X-Node-Secret header."""
        secret = request.headers.get("X-Node-Secret", "")
        return secret == self.node_secret and self.node_secret != ""

    async def start(self):
        """Start the manager service."""
        logger.info(f"Starting Ushadow Manager on {self.hostname}")
        logger.info(f"Leader URL: {self.leader_url}")
        logger.info(f"Tailscale IP: {self.tailscale_ip}")
        logger.info(f"API Port: {MANAGER_PORT}")

        # Send telemetry ping (non-blocking)
        def send_telemetry():
            try:
                telemetry_client = TelemetryClient(
                    endpoint=TELEMETRY_ENDPOINT,
                    app_version=f"manager-{MANAGER_VERSION}"
                )
                success = telemetry_client.send_ping()
                if success:
                    logger.info("✓ Telemetry ping sent")
            except Exception as e:
                logger.debug(f"Telemetry failed (non-critical): {e}")

        threading.Thread(target=send_telemetry, daemon=True).start()

        # Initialize Docker client
        try:
            self.docker_client = docker.from_env()
            logger.info("Docker client initialized")
        except DockerException as e:
            logger.error(f"Failed to connect to Docker: {e}")
            logger.error("Make sure Docker socket is mounted")

        # Initialize HTTP session for outbound requests
        self.session = aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=30),
            headers={"X-Node-Secret": self.node_secret}
        )

        # Start HTTP API server and heartbeat loop concurrently
        await asyncio.gather(
            self.start_api_server(),
            self.heartbeat_loop()
        )

    async def stop(self):
        """Stop the manager service."""
        logger.info("Stopping Ushadow Manager...")
        self.running = False
        if self.web_runner:
            await self.web_runner.cleanup()
        if self.session:
            await self.session.close()
        if self.docker_client:
            self.docker_client.close()

    # =========================================================================
    # HTTP API Server
    # =========================================================================

    async def start_api_server(self):
        """Start the HTTP API server for receiving commands from leader."""
        self.web_app = web.Application()
        # Health endpoint at root (no /api prefix)
        self.web_app.router.add_get("/health", self.handle_health)

        # API endpoints with /api prefix
        self.web_app.router.add_get("/api/info", self.handle_info)
        self.web_app.router.add_post("/api/deploy", self.handle_deploy)
        self.web_app.router.add_post("/api/stop", self.handle_stop)
        self.web_app.router.add_post("/api/restart", self.handle_restart)
        self.web_app.router.add_post("/api/remove", self.handle_remove)
        self.web_app.router.add_post("/api/upgrade", self.handle_upgrade)
        self.web_app.router.add_get("/api/status/{container_name}", self.handle_status)
        self.web_app.router.add_get("/api/logs/{container_name}", self.handle_logs)
        self.web_app.router.add_get("/api/containers", self.handle_list_containers)

        self.web_runner = web.AppRunner(self.web_app)
        await self.web_runner.setup()
        site = web.TCPSite(self.web_runner, "0.0.0.0", MANAGER_PORT)
        await site.start()
        logger.info(f"API server started on port {MANAGER_PORT}")

        # Keep running until stopped
        while self.running:
            await asyncio.sleep(1)

    async def handle_health(self, request: web.Request) -> web.Response:
        """Health check endpoint (no auth required)."""
        return web.json_response({
            "status": "healthy",
            "hostname": self.hostname,
            "version": MANAGER_VERSION,
            "docker_available": self.docker_client is not None
        })

    async def handle_info(self, request: web.Request) -> web.Response:
        """Get node info endpoint (no auth required, used for discovery)."""
        return web.json_response({
            "hostname": self.hostname,
            "tailscale_ip": self.tailscale_ip,
            "leader_url": self.leader_url,
            "manager_version": MANAGER_VERSION,
            "platform": platform.system().lower(),
            "docker_available": self.docker_client is not None,
        })

    async def handle_upgrade(self, request: web.Request) -> web.Response:
        """
        Upgrade the manager to a new version.

        This pulls a new image and schedules a self-restart.
        The restart happens after responding to avoid connection issues.
        """
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)

        try:
            data = await request.json()
        except json.JSONDecodeError:
            data = {}

        image = data.get("image", "ghcr.io/ushadow-io/ushadow-manager:latest")

        if not self.docker_client:
            return web.json_response({"success": False, "error": "Docker not available"}, status=500)

        try:
            # Pull the new image first
            logger.info(f"Pulling new manager image: {image}")
            self.docker_client.images.pull(image)
            logger.info("New image pulled successfully")

            # Schedule the restart after responding
            # We use a background task to restart ourselves
            asyncio.create_task(self._perform_self_upgrade(image))

            return web.json_response({
                "success": True,
                "message": "Upgrade initiated. Manager will restart in ~5 seconds.",
                "new_image": image
            })

        except ImageNotFound:
            return web.json_response({"success": False, "error": f"Image not found: {image}"}, status=404)
        except Exception as e:
            logger.error(f"Upgrade failed: {e}")
            return web.json_response({"success": False, "error": str(e)}, status=500)

    async def _perform_self_upgrade(self, new_image: str):
        """
        Perform the actual self-upgrade by recreating our own container.

        This runs after responding to the upgrade request.
        """
        await asyncio.sleep(3)  # Give time for response to be sent

        logger.info("Starting self-upgrade process...")

        try:
            # Get our own container
            my_container = self.docker_client.containers.get("ushadow-manager")

            # Capture current config
            env_vars = my_container.attrs.get("Config", {}).get("Env", [])
            env_dict = {}
            for env in env_vars:
                if "=" in env:
                    k, v = env.split("=", 1)
                    env_dict[k] = v

            # Get port bindings
            ports = my_container.attrs.get("HostConfig", {}).get("PortBindings", {})
            port_bindings = {}
            for container_port, host_bindings in ports.items():
                if host_bindings:
                    port_bindings[container_port] = int(host_bindings[0].get("HostPort", 8444))

            # Get volume mounts
            mounts = my_container.attrs.get("Mounts", [])
            volumes = []
            for mount in mounts:
                if mount.get("Type") == "bind":
                    volumes.append(f"{mount['Source']}:{mount['Destination']}")

            logger.info(f"Recreating container with image: {new_image}")
            logger.info(f"Env vars: {list(env_dict.keys())}")
            logger.info(f"Ports: {port_bindings}")
            logger.info(f"Volumes: {volumes}")

            # Stop and remove ourselves
            my_container.stop(timeout=5)
            my_container.remove()

            # Start new container with same config
            self.docker_client.containers.run(
                new_image,
                name="ushadow-manager",
                detach=True,
                restart_policy={"Name": "unless-stopped"},
                environment=env_dict,
                ports=port_bindings,
                volumes=volumes,
            )

            logger.info("Self-upgrade complete - new container started")

        except Exception as e:
            logger.error(f"Self-upgrade failed: {e}")
            # If we fail, try to at least log it - we may be killed mid-process

    async def handle_deploy(self, request: web.Request) -> web.Response:
        """Deploy a container."""
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)

        try:
            data = await request.json()
        except json.JSONDecodeError:
            return web.json_response({"error": "Invalid JSON"}, status=400)

        container_name = data.get("container_name")
        image = data.get("image")

        if not container_name or not image:
            return web.json_response({"error": "container_name and image required"}, status=400)

        result = await self.deploy_container(
            container_name=container_name,
            image=image,
            ports=data.get("ports", {}),
            environment=data.get("environment", {}),
            volumes=data.get("volumes", []),
            restart_policy=data.get("restart_policy", "unless-stopped"),
            network=data.get("network"),
            command=data.get("command"),
        )
        status = 200 if result.get("success") else 500
        return web.json_response(result, status=status)

    async def handle_stop(self, request: web.Request) -> web.Response:
        """Stop a container."""
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)

        try:
            data = await request.json()
        except json.JSONDecodeError:
            return web.json_response({"error": "Invalid JSON"}, status=400)

        container_name = data.get("container_name")
        if not container_name:
            return web.json_response({"error": "container_name required"}, status=400)

        result = await self.stop_service(container_name)
        status = 200 if result.get("success") else 500
        return web.json_response(result, status=status)

    async def handle_restart(self, request: web.Request) -> web.Response:
        """Restart a container."""
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)

        try:
            data = await request.json()
        except json.JSONDecodeError:
            return web.json_response({"error": "Invalid JSON"}, status=400)

        container_name = data.get("container_name")
        if not container_name:
            return web.json_response({"error": "container_name required"}, status=400)

        result = await self.restart_service(container_name)
        status = 200 if result.get("success") else 500
        return web.json_response(result, status=status)

    async def handle_remove(self, request: web.Request) -> web.Response:
        """Stop and remove a container."""
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)

        try:
            data = await request.json()
        except json.JSONDecodeError:
            return web.json_response({"error": "Invalid JSON"}, status=400)

        container_name = data.get("container_name")
        if not container_name:
            return web.json_response({"error": "container_name required"}, status=400)

        result = await self.remove_container(container_name)
        status = 200 if result.get("success") else 500
        return web.json_response(result, status=status)

    async def handle_status(self, request: web.Request) -> web.Response:
        """Get container status."""
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)

        container_name = request.match_info["container_name"]
        result = self.get_container_status(container_name)
        status = 200 if result.get("success") else 404
        return web.json_response(result, status=status)

    async def handle_logs(self, request: web.Request) -> web.Response:
        """Get container logs."""
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)

        container_name = request.match_info["container_name"]
        tail = int(request.query.get("tail", "100"))
        result = await self.get_service_logs(container_name, tail=tail)
        status = 200 if result.get("success") else 404
        return web.json_response(result, status=status)

    async def handle_list_containers(self, request: web.Request) -> web.Response:
        """List all containers."""
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)

        result = self.list_all_containers()
        return web.json_response(result)

    # =========================================================================
    # Container Operations
    # =========================================================================

    async def deploy_container(
        self,
        container_name: str,
        image: str,
        ports: Dict[str, int] = None,
        environment: Dict[str, str] = None,
        volumes: List[str] = None,
        restart_policy: str = "unless-stopped",
        network: str = None,
        command: str = None,
    ) -> Dict[str, Any]:
        """Deploy (pull and run) a Docker container."""
        if not self.docker_client:
            return {"success": False, "error": "Docker not available"}

        try:
            # Stop and remove existing container if present
            try:
                existing = self.docker_client.containers.get(container_name)
                logger.info(f"Stopping existing container: {container_name}")
                existing.stop(timeout=10)
                existing.remove()
            except NotFound:
                pass

            # Pull the image
            logger.info(f"Pulling image: {image}")
            self.docker_client.images.pull(image)

            # Prepare port bindings
            port_bindings = {}
            if ports:
                for container_port, host_port in ports.items():
                    port_bindings[container_port] = host_port

            # Prepare restart policy
            restart_policy_config = {"Name": restart_policy}
            if restart_policy == "on-failure":
                restart_policy_config["MaximumRetryCount"] = 5

            # Run the container
            logger.info(f"Starting container: {container_name}")
            container = self.docker_client.containers.run(
                image,
                name=container_name,
                detach=True,
                ports=port_bindings if port_bindings else None,
                environment=environment or {},
                volumes=volumes or [],
                restart_policy=restart_policy_config,
                network=network,
                command=command,
            )

            return {
                "success": True,
                "container_id": container.id[:12],
                "container_name": container_name,
                "status": container.status
            }
        except ImageNotFound:
            return {"success": False, "error": f"Image not found: {image}"}
        except Exception as e:
            logger.error(f"Failed to deploy container {container_name}: {e}")
            return {"success": False, "error": str(e)}

    async def remove_container(self, container_name: str) -> Dict[str, Any]:
        """Stop and remove a container."""
        if not self.docker_client:
            return {"success": False, "error": "Docker not available"}

        try:
            container = self.docker_client.containers.get(container_name)
            if container.status == "running":
                container.stop(timeout=10)
            container.remove()
            return {"success": True, "message": f"Container {container_name} removed"}
        except NotFound:
            return {"success": False, "error": f"Container not found: {container_name}"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def get_container_status(self, container_name: str) -> Dict[str, Any]:
        """Get status of a specific container."""
        if not self.docker_client:
            return {"success": False, "error": "Docker not available"}

        try:
            container = self.docker_client.containers.get(container_name)
            return {
                "success": True,
                "container_id": container.id[:12],
                "container_name": container.name,
                "status": container.status,
                "image": container.image.tags[0] if container.image.tags else container.image.short_id,
                "created": container.attrs.get("Created"),
                "health": container.attrs.get("State", {}).get("Health", {}).get("Status"),
            }
        except NotFound:
            return {"success": False, "error": f"Container not found: {container_name}"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def list_all_containers(self) -> Dict[str, Any]:
        """List all containers on this node."""
        if not self.docker_client:
            return {"success": False, "error": "Docker not available", "containers": []}

        try:
            containers = self.docker_client.containers.list(all=True)
            result = []
            for c in containers:
                result.append({
                    "container_id": c.id[:12],
                    "name": c.name,
                    "status": c.status,
                    "image": c.image.tags[0] if c.image.tags else c.image.short_id,
                })
            return {"success": True, "containers": result}
        except Exception as e:
            return {"success": False, "error": str(e), "containers": []}

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
            "manager_version": MANAGER_VERSION,
            "services_running": self.services_running,
            "capabilities": self.get_capabilities(),
            "metrics": metrics,
        }

        try:
            async with self.session.post(
                f"{self.leader_url}/api/unodes/heartbeat",
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
