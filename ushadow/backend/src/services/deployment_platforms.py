"""Deployment platform implementations for different target types."""

from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone
import logging
import os
import httpx
import docker

from src.models.deployment import ResolvedServiceDefinition, Deployment, DeploymentStatus
from src.models.deploy_target import DeployTarget
from src.services.kubernetes_manager import KubernetesManager
from src.utils.environment import get_environment_info, is_local_deployment

logger = logging.getLogger(__name__)


async def check_deployment_health(
    host: str,
    port: int,
    health_path: str = "/health",
    timeout: float = 3.0
) -> tuple[bool, Optional[str]]:
    """
    Check if a deployment is healthy via HTTP health check.

    Args:
        host: Host to check (e.g., "localhost" or container IP)
        port: Port to check
        health_path: HTTP path for health endpoint
        timeout: Request timeout in seconds

    Returns:
        Tuple of (is_healthy, error_message)
    """
    url = f"http://{host}:{port}{health_path}"

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(url)

            # Consider 2xx status codes as healthy
            if 200 <= response.status_code < 300:
                return (True, None)
            else:
                return (False, f"Health check returned {response.status_code}")

    except httpx.TimeoutException:
        return (False, "Health check timed out")
    except httpx.ConnectError:
        return (False, "Cannot connect to service")
    except Exception as e:
        return (False, f"Health check failed: {str(e)}")


class DeployPlatform(ABC):
    """
    Abstract platform implementation.

    This is the "HOW" - the strategy for deploying to a type of target.
    Stateless - operates on DeployTarget instances.
    """

    @abstractmethod
    async def get_infrastructure(self, target: DeployTarget) -> Optional[Dict[str, Any]]:
        """
        Get infrastructure scan for this target.

        Returns cluster-detected services like Redis, MongoDB, etc.
        Only applicable for Kubernetes targets.
        """
        pass

    @abstractmethod
    async def deploy(
        self,
        target: DeployTarget,
        resolved_service: ResolvedServiceDefinition,
        deployment_id: str,
        namespace: Optional[str] = None,
        config_id: Optional[str] = None,
        force_rebuild: bool = False,
    ) -> Deployment:
        """
        Deploy a service to this target.

        Args:
            target: The deployment target
            resolved_service: Fully resolved service definition
            deployment_id: Unique deployment identifier
            namespace: Optional namespace (K8s only)
            config_id: Optional ServiceConfig ID used for this deployment

        Returns:
            Deployment object with status and metadata
        """
        pass

    @abstractmethod
    async def get_status(
        self,
        target: DeployTarget,
        deployment: Deployment
    ) -> DeploymentStatus:
        """Get current status of a deployment."""
        pass

    @abstractmethod
    async def stop(
        self,
        target: DeployTarget,
        deployment: Deployment
    ) -> bool:
        """Stop a running deployment."""
        pass

    @abstractmethod
    async def remove(
        self,
        target: DeployTarget,
        deployment: Deployment
    ) -> bool:
        """Remove a deployment completely."""
        pass

    @abstractmethod
    async def get_logs(
        self,
        target: DeployTarget,
        deployment: Deployment,
        tail: int = 100
    ) -> List[str]:
        """Get logs from a deployment."""
        pass


class DockerDeployPlatform(DeployPlatform):
    """Platform implementation for Docker hosts (local or remote unodes)."""

    UNODE_MANAGER_PORT = 8444

    def _is_local_deployment(self, hostname: str) -> bool:
        """Check if this is a local deployment (same host as backend)."""
        return is_local_deployment(hostname)

    def _get_target_ip(self, target: DeployTarget) -> str:
        """Get target IP (localhost for local, tailscale IP for remote)."""
        hostname = target.identifier  # Use standardized field (hostname for Docker targets)

        if self._is_local_deployment(hostname):
            return "localhost"

        tailscale_ip = target.raw_metadata.get("tailscale_ip")
        if tailscale_ip:
            return tailscale_ip
        else:
            raise ValueError(f"UNode {hostname} has no Tailscale IP configured")

    async def get_infrastructure(self, target: DeployTarget) -> Optional[Dict[str, Any]]:
        """Docker hosts don't have infrastructure scans."""
        return None

    async def _deploy_local(
        self,
        target: DeployTarget,
        resolved_service: ResolvedServiceDefinition,
        deployment_id: str,
        container_name: str,
        project_name: str,
        config_id: Optional[str] = None,
        force_rebuild: bool = False,
    ) -> Deployment:
        """Deploy directly to local Docker (bypasses unode manager)."""
        try:
            docker_client = docker.from_env()

            # Force rebuild if requested
            if force_rebuild:
                logger.info(f"Force rebuild requested for {resolved_service.image}")
                compose_file = resolved_service.compose_file
                service_name = resolved_service.compose_service_name

                if compose_file and service_name:
                    from src.services.docker_manager import get_docker_manager
                    docker_mgr = get_docker_manager()

                    logger.info(f"Building image from compose: {compose_file}, service: {service_name}")
                    success, message = docker_mgr.build_image_from_compose(
                        compose_file=compose_file,
                        service_name=service_name,
                        tag=resolved_service.image
                    )

                    if success:
                        logger.info(f"✅ Force rebuild successful: {message}")
                    else:
                        raise ValueError(f"Force rebuild failed: {message}")
                else:
                    logger.warning(f"Cannot force rebuild - no compose file information available for {resolved_service.service_id}")


            # ===== PORT CONFIGURATION =====
            # Parse all port-related configuration in one place
            logger.info(f"[PORT DEBUG] Starting port parsing for {resolved_service.service_id}")
            logger.info(f"[PORT DEBUG] Input ports from resolved_service.ports: {resolved_service.ports}")

            port_bindings = {}
            exposed_ports = {}
            exposed_port = None  # First host port for deployment tracking

            for port_str in resolved_service.ports:
                logger.info(f"[PORT DEBUG] Processing port_str: {port_str}")
                if ":" in port_str:
                    host_port, container_port = port_str.split(":")
                    port_key = f"{container_port}/tcp"
                    port_bindings[port_key] = int(host_port)
                    exposed_ports[port_key] = {}

                    # Save first host port for deployment tracking
                    if exposed_port is None:
                        exposed_port = int(host_port)

                    logger.info(f"[PORT DEBUG] Mapped: host={host_port} -> container={container_port} (key={port_key})")
                else:
                    port_key = f"{port_str}/tcp"
                    exposed_ports[port_key] = {}

                    # Save first port for deployment tracking
                    if exposed_port is None:
                        exposed_port = int(port_str)

                    logger.info(f"[PORT DEBUG] Exposed only: {port_key}")

            logger.info(f"[PORT DEBUG] Final port_bindings: {port_bindings}")
            logger.info(f"[PORT DEBUG] Final exposed_ports: {exposed_ports}")
            logger.info(f"[PORT DEBUG] Tracking exposed_port: {exposed_port}")
            # ===== END PORT CONFIGURATION =====

            # Create container with ushadow labels for stateless tracking
            from datetime import datetime, timezone
            labels = {
                "ushadow.deployment_id": deployment_id,
                "ushadow.service_id": resolved_service.service_id,
                "ushadow.config_id": config_id or resolved_service.service_id,  # Required for Deployment model
                "ushadow.unode_hostname": target.identifier,
                "ushadow.deployed_at": datetime.now(timezone.utc).isoformat(),
                "ushadow.backend_type": "docker",
                "com.docker.compose.project": project_name,
            }

            # Use ushadow-network to communicate with infrastructure (mongo, redis, qdrant)
            # This shared network is defined as external in all compose files
            network = "ushadow-network"
            logger.info(f"Using network: {network}")

            # Log environment variables being passed (redact sensitive values)
            env_preview = {}
            for key, value in (resolved_service.environment or {}).items():
                if any(secret in key.lower() for secret in ['key', 'secret', 'token', 'password']):
                    env_preview[key] = f"****{value[-4:]}" if value and len(value) > 4 else "****"
                else:
                    env_preview[key] = value
            logger.info(f"Environment variables ({len(resolved_service.environment or {})} total): {env_preview}")

            logger.info(f"Creating container {container_name} from image {resolved_service.image}")

            # Use high-level API which handles port format better
            # High-level API expects ports dict like: {'8000/tcp': 8090} for host port mapping
            logger.info(f"[PORT DEBUG] Creating container with high-level API")
            logger.info(f"[PORT DEBUG] ports (high-level format): {port_bindings}")

            container = docker_client.containers.create(
                image=resolved_service.image,
                name=container_name,
                labels=labels,
                environment=resolved_service.environment,
                command=resolved_service.command,
                ports=port_bindings,  # High-level API takes port_bindings directly as 'ports'
                volumes={v.split(':')[0]: {'bind': v.split(':')[1], 'mode': v.split(':')[2] if len(v.split(':')) > 2 else 'rw'}
                        for v in (resolved_service.volumes or [])},
                restart_policy={"Name": resolved_service.restart_policy or "unless-stopped"},
                detach=True,
            )
            logger.info(f"[PORT DEBUG] Container created with ID: {container.id[:12]}")

            # Connect to custom network with service name as alias BEFORE starting
            # This allows containers to reach each other by service name (e.g., "mycelia-python-worker")
            logger.info(f"[PORT DEBUG] Connecting container to network {network} with alias {resolved_service.service_id}")
            network_obj = docker_client.networks.get(network)
            network_obj.connect(container, aliases=[resolved_service.service_id])
            logger.info(f"[PORT DEBUG] Connected to network {network}")

            # Now start the container
            logger.info(f"[PORT DEBUG] Starting container {container_name}...")
            container.start()

            # Reload to get updated port info
            container.reload()
            logger.info(f"[PORT DEBUG] Container started. Ports mapping: {container.ports}")
            logger.info(f"Container {container_name} created and started: {container.id[:12]}")

            # Build deployment object (exposed_port was extracted during port parsing above)
            hostname = target.identifier  # Use standardized field (hostname for Docker targets)
            deployment = Deployment(
                id=deployment_id,
                service_id=resolved_service.service_id,
                unode_hostname=hostname,
                status=DeploymentStatus.RUNNING,
                container_id=container.id,
                container_name=container_name,
                deployed_config={
                    "image": resolved_service.image,
                    "ports": resolved_service.ports,
                    "environment": resolved_service.environment,
                },
                exposed_port=exposed_port,
                config_id=config_id,
                backend_type="docker",
                backend_metadata={
                    "container_id": container.id,
                    "local_deployment": True,
                }
            )

            logger.info(f"✅ Local Docker deployment successful: {container_name}")
            return deployment

        except docker.errors.ImageNotFound as e:
            logger.warning(f"Image not found locally: {resolved_service.image}, attempting to pull...")

            try:
                # Attempt to pull the image
                logger.info(f"Pulling image: {resolved_service.image}")
                docker_client.images.pull(resolved_service.image)
                logger.info(f"✅ Successfully pulled image: {resolved_service.image}")

                # Retry deployment after successful pull
                logger.info(f"Retrying deployment after image pull...")
                return await self._deploy_local(
                    target,
                    resolved_service,
                    deployment_id,
                    container_name,
                    project_name,
                    config_id
                )

            except docker.errors.ImageNotFound as pull_error:
                # Image not in registry - try to build using DockerManager
                logger.warning(f"Image not found in registry, attempting to build: {resolved_service.image}")

                compose_file = resolved_service.compose_file
                service_name = resolved_service.compose_service_name

                if compose_file and service_name:
                    from src.services.docker_manager import get_docker_manager
                    docker_mgr = get_docker_manager()

                    success, message = docker_mgr.build_image_from_compose(
                        compose_file=compose_file,
                        service_name=service_name,
                        tag=resolved_service.image
                    )

                    if success:
                        logger.info(f"✅ {message}")
                        # Retry deployment after successful build
                        return await self._deploy_local(
                            target, resolved_service, deployment_id,
                            container_name, project_name, config_id
                        )
                    else:
                        # Provide helpful fallback command
                        user_compose_path = compose_file
                        if compose_file.startswith("/compose/"):
                            user_compose_path = f"compose/{compose_file[9:]}"
                        raise ValueError(
                            f"{message}. "
                            f"Try manually: docker compose -f {user_compose_path} build {service_name}"
                        )
                else:
                    raise ValueError(f"Docker image not found: {resolved_service.image}. No build context available.")
            except docker.errors.APIError as pull_error:
                logger.error(f"Failed to pull image: {pull_error}")
                raise ValueError(f"Failed to pull Docker image {resolved_service.image}: {str(pull_error)}")
            except Exception as pull_error:
                logger.error(f"Error pulling image: {pull_error}")
                raise ValueError(f"Failed to pull Docker image {resolved_service.image}: {str(pull_error)}")
        except docker.errors.APIError as e:
            logger.error(f"Docker API error: {e}")
            raise ValueError(f"Docker deployment failed: {str(e)}")
        except Exception as e:
            logger.error(f"Local deployment error: {e}", exc_info=True)
            raise ValueError(f"Local deployment error: {str(e)}")

    async def deploy(
        self,
        target: DeployTarget,
        resolved_service: ResolvedServiceDefinition,
        deployment_id: str,
        namespace: Optional[str] = None,
        config_id: Optional[str] = None,
        force_rebuild: bool = False,
    ) -> Deployment:
        """Deploy to a Docker host via unode manager API or local Docker."""
        hostname = target.identifier  # Use standardized field (hostname for Docker targets)
        logger.info(f"Deploying {resolved_service.service_id} to Docker host {hostname}")

        # Generate container name with compose project prefix
        import os
        project_name = os.getenv("COMPOSE_PROJECT_NAME", "ushadow")
        container_name = f"{project_name}-{resolved_service.compose_service_name}-{deployment_id[:8]}"
        logger.info(f"Generated container name: {container_name} (project: {project_name})")

        # Check if this is a local deployment
        if self._is_local_deployment(hostname):
            # Use Docker directly for local deployments
            logger.info("Using local Docker for deployment")
            return await self._deploy_local(
                target,
                resolved_service,
                deployment_id,
                container_name,
                project_name,
                config_id,
                force_rebuild
            )

        # Build deploy payload for remote unode manager
        from datetime import datetime, timezone
        labels = {
            "ushadow.deployment_id": deployment_id,
            "ushadow.service_id": resolved_service.service_id,
            "ushadow.config_id": config_id or resolved_service.service_id,  # Required for Deployment model
            "ushadow.unode_hostname": hostname,
            "ushadow.deployed_at": datetime.now(timezone.utc).isoformat(),
            "ushadow.backend_type": "docker",
        }

        payload = {
            "service_id": resolved_service.service_id,
            "container_name": container_name,
            "image": resolved_service.image,
            "labels": labels,
            "ports": resolved_service.ports,
            "environment": resolved_service.environment,
            "volumes": resolved_service.volumes,
            "command": resolved_service.command,
            "restart_policy": resolved_service.restart_policy,
            "network": resolved_service.network,
            "health_check_path": resolved_service.health_check_path,
        }

        # Get target IP (tailscale IP for remote)
        target_ip = self._get_target_ip(target)
        logger.info(f"Deploying to remote unode via {target_ip}")

        # Send deploy command to unode manager
        url = f"http://{target_ip}:{self.UNODE_MANAGER_PORT}/api/deploy"

        async with httpx.AsyncClient(timeout=300.0) as client:
            try:
                response = await client.post(url, json=payload)
                response.raise_for_status()
                result = response.json()

                # Build deployment object
                deployment = Deployment(
                    id=deployment_id,
                    service_id=resolved_service.service_id,
                    unode_hostname=hostname,
                    status=DeploymentStatus.RUNNING,
                    container_id=result.get("container_id"),
                    container_name=container_name,
                    deployed_config={
                        "image": resolved_service.image,
                        "ports": resolved_service.ports,
                        "environment": resolved_service.environment,
                    },
                    access_url=result.get("access_url"),
                    exposed_port=result.get("exposed_port"),
                    config_id=config_id,
                    backend_type="docker",
                    backend_metadata={
                        "container_id": result.get("container_id"),
                        "unode_manager_port": self.UNODE_MANAGER_PORT,
                    }
                )

                logger.info(f"✅ Docker deployment successful: {container_name}")
                return deployment

            except httpx.HTTPStatusError as e:
                error_detail = e.response.text or str(e)
                logger.error(f"Remote deployment failed - Status {e.response.status_code}: {error_detail}")
                logger.error(f"Target: {url}")
                if e.response.status_code == 404:
                    raise ValueError(
                        f"Remote unode manager not found at {target_ip}:{self.UNODE_MANAGER_PORT}. "
                        f"Ensure the unode manager is running on the remote host and accessible via Tailscale."
                    )
                else:
                    raise ValueError(f"Remote deployment failed ({e.response.status_code}): {error_detail}")
            except httpx.ConnectError as e:
                logger.error(f"Failed to connect to remote unode: {str(e)}")
                raise ValueError(
                    f"Cannot connect to remote unode at {target_ip}:{self.UNODE_MANAGER_PORT}. "
                    f"Check that the remote host is online and accessible via Tailscale."
                )
            except Exception as e:
                logger.error(f"Deploy error: {str(e)}")
                raise ValueError(f"Deployment error: {str(e)}")

    async def get_status(
        self,
        target: DeployTarget,
        deployment: Deployment
    ) -> DeploymentStatus:
        """Get container status from Docker host."""
        target_ip = self._get_target_ip(target)
        url = f"http://{target_ip}:{self.UNODE_MANAGER_PORT}/api/status/{deployment.container_name}"

        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                response = await client.get(url)
                response.raise_for_status()
                result = response.json()

                status_map = {
                    "running": DeploymentStatus.RUNNING,
                    "exited": DeploymentStatus.STOPPED,
                    "dead": DeploymentStatus.FAILED,
                    "paused": DeploymentStatus.STOPPED,
                }

                return status_map.get(result.get("status", ""), DeploymentStatus.FAILED)

            except Exception as e:
                logger.error(f"Failed to get status: {e}")
                return DeploymentStatus.FAILED

    async def stop(
        self,
        target: DeployTarget,
        deployment: Deployment
    ) -> bool:
        """Stop a Docker container."""
        target_ip = self._get_target_ip(target)
        url = f"http://{target_ip}:{self.UNODE_MANAGER_PORT}/api/stop/{deployment.container_name}"

        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.post(url)
                response.raise_for_status()
                return True
            except Exception as e:
                logger.error(f"Failed to stop container: {e}")
                return False

    async def remove(
        self,
        target: DeployTarget,
        deployment: Deployment
    ) -> bool:
        """Remove a Docker container."""
        target_ip = self._get_target_ip(target)
        url = f"http://{target_ip}:{self.UNODE_MANAGER_PORT}/api/remove/{deployment.container_name}"

        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.delete(url)
                response.raise_for_status()
                return True
            except Exception as e:
                logger.error(f"Failed to remove container: {e}")
                return False

    async def get_logs(
        self,
        target: DeployTarget,
        deployment: Deployment,
        tail: int = 100
    ) -> List[str]:
        """Get Docker container logs."""
        target_ip = self._get_target_ip(target)
        url = f"http://{target_ip}:{self.UNODE_MANAGER_PORT}/api/logs/{deployment.container_name}?tail={tail}"

        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.get(url)
                response.raise_for_status()
                result = response.json()
                return result.get("logs", [])
            except Exception as e:
                logger.error(f"Failed to get logs: {e}")
                return [f"Error getting logs: {str(e)}"]

    async def list_deployments(
        self,
        target: DeployTarget,
        service_id: Optional[str] = None,
    ) -> List[Deployment]:
        """
        Query Docker for all ushadow deployments.

        Returns deployments by querying containers with ushadow labels.
        This is stateless - container runtime is the source of truth.
        """
        from datetime import datetime, timezone
        import docker

        deployments = []

        try:
            if self._is_local_deployment(target.identifier):
                # Query local Docker
                docker_client = docker.from_env()
                filters = {"label": [
                    "ushadow.deployment_id",
                    f"ushadow.unode_hostname={target.identifier}"
                ]}

                if service_id:
                    filters["label"].append(f"ushadow.service_id={service_id}")

                containers = docker_client.containers.list(all=True, filters=filters)

                for container in containers:
                    labels = container.labels

                    # Extract deployment info from labels
                    deployment_id = labels.get("ushadow.deployment_id")
                    if not deployment_id:
                        continue

                    # Map container status to deployment status
                    status_map = {
                        "running": DeploymentStatus.RUNNING,
                        "exited": DeploymentStatus.STOPPED,
                        "created": DeploymentStatus.PENDING,
                        "dead": DeploymentStatus.FAILED,
                        "paused": DeploymentStatus.STOPPED,
                    }

                    container_status = container.status.lower()
                    deployment_status = status_map.get(container_status, DeploymentStatus.FAILED)

                    # Extract exposed port
                    exposed_port = None
                    if container.ports:
                        for container_port, host_bindings in container.ports.items():
                            if host_bindings:
                                exposed_port = int(host_bindings[0]["HostPort"])
                                break

                    # Parse deployed_at from label
                    deployed_at = None
                    deployed_at_str = labels.get("ushadow.deployed_at")
                    if deployed_at_str:
                        try:
                            deployed_at = datetime.fromisoformat(deployed_at_str.replace('Z', '+00:00'))
                        except:
                            pass

                    # Extract config_id from labels (or fallback to service_id for backwards compatibility)
                    config_id = labels.get("ushadow.config_id") or labels.get("ushadow.service_id", "unknown")

                    # Reconstruct deployed_config from container's current configuration
                    # This allows the proxy to determine the correct internal port
                    deployed_config = {}

                    # Reconstruct ports list in the format expected by proxy: ["host:container", ...]
                    ports_list = []
                    logger.debug(f"[list_deployments] Container {container.name} ports: {container.ports}")
                    if container.ports:
                        for container_port, host_bindings in container.ports.items():
                            if host_bindings:
                                # container_port format: "8765/tcp"
                                port_num = container_port.split('/')[0]
                                host_port = host_bindings[0]["HostPort"]
                                ports_list.append(f"{host_port}:{port_num}")
                                logger.debug(f"[list_deployments] Added port mapping: {host_port}:{port_num}")
                    if ports_list:
                        deployed_config["ports"] = ports_list
                        logger.info(f"[list_deployments] Reconstructed ports for {container.name}: {ports_list}")

                    # Add image and environment if available
                    if hasattr(container, 'image') and container.image:
                        deployed_config["image"] = container.image.tags[0] if container.image.tags else "unknown"

                    # Environment from container config
                    if hasattr(container, 'attrs') and 'Config' in container.attrs:
                        env_list = container.attrs['Config'].get('Env', [])
                        env_dict = {}
                        for env_pair in env_list:
                            if '=' in env_pair:
                                key, value = env_pair.split('=', 1)
                                env_dict[key] = value
                        if env_dict:
                            deployed_config["environment"] = env_dict

                    deployment = Deployment(
                        id=deployment_id,
                        service_id=labels.get("ushadow.service_id", "unknown"),
                        config_id=config_id,
                        unode_hostname=labels.get("ushadow.unode_hostname", target.identifier),
                        status=deployment_status,
                        container_id=container.id,
                        container_name=container.name,
                        deployed_at=deployed_at,
                        exposed_port=exposed_port,
                        deployed_config=deployed_config if deployed_config else None,
                        backend_type="docker",
                        backend_metadata={
                            "container_id": container.id,
                            "local_deployment": True,
                        }
                    )

                    deployments.append(deployment)

            else:
                # Query remote unode manager
                # TODO: Implement remote query via unode manager API
                logger.warning(f"Remote deployment listing not yet implemented for {target.identifier}")

        except Exception as e:
            logger.error(f"Failed to list deployments: {e}")

        return deployments

    async def get_deployment_by_id(
        self,
        target: DeployTarget,
        deployment_id: str
    ) -> Optional[Deployment]:
        """
        Get a specific deployment by ID.

        Queries Docker for container with matching deployment_id label.
        """
        deployments = await self.list_deployments(target)

        for deployment in deployments:
            if deployment.id == deployment_id:
                return deployment

        return None


class KubernetesDeployPlatform(DeployPlatform):
    """Platform implementation for Kubernetes clusters."""

    def __init__(self, k8s_manager: KubernetesManager):
        self.k8s_manager = k8s_manager

    async def get_infrastructure(self, target: DeployTarget) -> Optional[Dict[str, Any]]:
        """Get infrastructure scan for the K8s cluster."""
        # Use standardized infrastructure field (already resolved for the namespace)
        return target.infrastructure or {}

    async def deploy(
        self,
        target: DeployTarget,
        resolved_service: ResolvedServiceDefinition,
        deployment_id: str,
        namespace: Optional[str] = None,
        config_id: Optional[str] = None,
        force_rebuild: bool = False,
    ) -> Deployment:
        """Deploy to a Kubernetes cluster."""
        # Use standardized fields
        cluster_id = target.identifier  # cluster_id
        hostname = target.name  # cluster name

        logger.info(f"Deploying {resolved_service.service_id} to K8s cluster {hostname}")

        # Use cluster's default namespace if not specified
        namespace = namespace or target.namespace or "default"

        # Convert ResolvedServiceDefinition to dict for K8s manager
        # Include all resolved environment variables
        service_def = {
            "name": resolved_service.name,
            "image": resolved_service.image,
            "ports": resolved_service.ports,
            "environment": resolved_service.environment,  # Fully resolved env vars
        }

        logger.info(f"Service environment variables: {list(service_def.get('environment', {}).keys())}")
        if "MONGODB_DATABASE" in service_def.get("environment", {}):
            logger.info(f"  MONGODB_DATABASE={service_def['environment']['MONGODB_DATABASE']}")

        # Use kubernetes_manager.deploy_to_kubernetes
        result = await self.k8s_manager.deploy_to_kubernetes(
            cluster_id=cluster_id,
            service_def=service_def,  # Pass resolved service definition with env vars
            namespace=namespace,
        )

        # Build deployment object
        deployment = Deployment(
            id=deployment_id,
            service_id=resolved_service.service_id,
            unode_hostname=hostname,
            status=DeploymentStatus.RUNNING,
            container_id=None,  # K8s uses pod names, not container IDs
            container_name=result["deployment_name"],
            deployed_config={
                "image": resolved_service.image,
                "namespace": namespace,
                "ports": resolved_service.ports,
                "environment": resolved_service.environment,  # Include env vars for edit
            },
            config_id=config_id,
            backend_type="kubernetes",
            backend_metadata={
                "cluster_id": cluster_id,
                "namespace": namespace,
                "deployment_name": result["deployment_name"],
                "config_id": result["config_id"],
            }
        )

        logger.info(f"✅ K8s deployment successful: {result['deployment_name']}")
        return deployment

    async def get_status(
        self,
        target: DeployTarget,
        deployment: Deployment
    ) -> DeploymentStatus:
        """Get pod status from Kubernetes."""
        # Use standardized identifier field (cluster_id for K8s targets)
        cluster_id = target.identifier
        namespace = deployment.backend_metadata.get("namespace", "default")
        deployment_name = deployment.backend_metadata.get("deployment_name")

        try:
            # Get deployment status from K8s
            client = await self.k8s_manager.get_client(cluster_id)
            apps_v1 = client.AppsV1Api()

            k8s_deployment = apps_v1.read_namespaced_deployment(
                name=deployment_name,
                namespace=namespace
            )

            # Check replicas
            if k8s_deployment.status.ready_replicas and k8s_deployment.status.ready_replicas > 0:
                return DeploymentStatus.RUNNING
            elif k8s_deployment.status.replicas == 0:
                return DeploymentStatus.STOPPED
            else:
                return DeploymentStatus.DEPLOYING

        except Exception as e:
            logger.error(f"Failed to get K8s status: {e}")
            return DeploymentStatus.FAILED

    async def stop(
        self,
        target: DeployTarget,
        deployment: Deployment
    ) -> bool:
        """Scale K8s deployment to 0 replicas."""
        # Use standardized identifier field (cluster_id for K8s targets)
        cluster_id = target.identifier
        namespace = deployment.backend_metadata.get("namespace", "default")
        deployment_name = deployment.backend_metadata.get("deployment_name")

        try:
            client = await self.k8s_manager.get_client(cluster_id)
            apps_v1 = client.AppsV1Api()

            # Scale to 0
            body = {"spec": {"replicas": 0}}
            apps_v1.patch_namespaced_deployment_scale(
                name=deployment_name,
                namespace=namespace,
                body=body
            )

            logger.info(f"Scaled K8s deployment {deployment_name} to 0 replicas")
            return True

        except Exception as e:
            logger.error(f"Failed to stop K8s deployment: {e}")
            return False

    async def remove(
        self,
        target: DeployTarget,
        deployment: Deployment
    ) -> bool:
        """Delete K8s deployment, service, and configmaps."""
        # Use standardized identifier field (cluster_id for K8s targets)
        cluster_id = target.identifier
        namespace = deployment.backend_metadata.get("namespace", "default")
        deployment_name = deployment.backend_metadata.get("deployment_name")

        try:
            client = await self.k8s_manager.get_client(cluster_id)
            apps_v1 = client.AppsV1Api()
            core_v1 = client.CoreV1Api()

            # Delete deployment
            apps_v1.delete_namespaced_deployment(
                name=deployment_name,
                namespace=namespace
            )

            # Delete service (same name as deployment)
            try:
                core_v1.delete_namespaced_service(
                    name=deployment_name,
                    namespace=namespace
                )
            except:
                pass  # Service might not exist

            # Delete configmaps (named with deployment prefix)
            try:
                configmaps = core_v1.list_namespaced_config_map(
                    namespace=namespace,
                    label_selector=f"app.kubernetes.io/instance={deployment_name}"
                )
                for cm in configmaps.items:
                    core_v1.delete_namespaced_config_map(
                        name=cm.metadata.name,
                        namespace=namespace
                    )
            except:
                pass

            logger.info(f"Deleted K8s deployment {deployment_name}")
            return True

        except Exception as e:
            logger.error(f"Failed to remove K8s deployment: {e}")
            return False

    async def get_logs(
        self,
        target: DeployTarget,
        deployment: Deployment,
        tail: int = 100
    ) -> List[str]:
        """Get logs from K8s pods."""
        # Use standardized identifier field (cluster_id for K8s targets)
        cluster_id = target.identifier
        namespace = deployment.backend_metadata.get("namespace", "default")
        deployment_name = deployment.backend_metadata.get("deployment_name")

        try:
            client = await self.k8s_manager.get_client(cluster_id)
            core_v1 = client.CoreV1Api()

            # Find pods for this deployment
            pods = core_v1.list_namespaced_pod(
                namespace=namespace,
                label_selector=f"app.kubernetes.io/name={deployment_name}"
            )

            if not pods.items:
                return [f"No pods found for deployment {deployment_name}"]

            # Get logs from first pod
            pod_name = pods.items[0].metadata.name
            logs = core_v1.read_namespaced_pod_log(
                name=pod_name,
                namespace=namespace,
                tail_lines=tail
            )

            return logs.split("\n")

        except Exception as e:
            logger.error(f"Failed to get K8s logs: {e}")
            return [f"Error getting logs: {str(e)}"]


def get_deploy_platform(target: DeployTarget, k8s_manager: Optional[KubernetesManager] = None) -> DeployPlatform:
    """
    Get the appropriate platform implementation for a target.

    Args:
        target: The deployment target
        k8s_manager: KubernetesManager instance (required for K8s targets)

    Returns:
        Appropriate DeployPlatform implementation
    """
    if target.type == "k8s":
        if not k8s_manager:
            from src.services.kubernetes_manager import get_kubernetes_manager
            k8s_manager = get_kubernetes_manager()
        return KubernetesDeployPlatform(k8s_manager)
    else:
        return DockerDeployPlatform()
