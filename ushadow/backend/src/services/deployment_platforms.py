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
    ) -> Deployment:
        """
        Deploy a service to this target.

        Args:
            target: The deployment target
            resolved_service: Fully resolved service definition
            deployment_id: Unique deployment identifier
            namespace: Optional namespace (K8s only)

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
        container_name: str
    ) -> Deployment:
        """Deploy directly to local Docker (bypasses unode manager)."""
        try:
            docker_client = docker.from_env()

            # Parse ports to Docker format
            port_bindings = {}
            exposed_ports = {}
            for port_str in resolved_service.ports:
                if ":" in port_str:
                    host_port, container_port = port_str.split(":")
                    port_key = f"{container_port}/tcp"
                    port_bindings[port_key] = int(host_port)
                    exposed_ports[port_key] = {}
                else:
                    port_key = f"{port_str}/tcp"
                    exposed_ports[port_key] = {}

            # Create container with ushadow labels for stateless tracking
            env_info = get_environment_info()

            labels = {
                "ushadow.deployment_id": deployment_id,
                "ushadow.service_id": resolved_service.service_id,
                "ushadow.unode_hostname": target.identifier,
                "ushadow.deployed_at": datetime.now(timezone.utc).isoformat(),
                "ushadow.backend_type": "docker",
            }

            # Add health check configuration to labels
            if resolved_service.health_check_path:
                labels["ushadow.health_check_path"] = resolved_service.health_check_path
            if resolved_service.health_check_port:
                labels["ushadow.health_check_port"] = str(resolved_service.health_check_port)

            # Add compose project labels so deployed services appear in the same compose project
            labels.update(env_info.get_container_labels())

            # Determine network - use compose network if available
            network = resolved_service.network
            if not network:
                # Try to use the compose default network
                compose_network = env_info.compose_network_name
                try:
                    docker_client.networks.get(compose_network)
                    network = compose_network
                    logger.info(f"Using compose network: {compose_network}")
                except:
                    network = "bridge"

            logger.info(f"Creating container {container_name} from image {resolved_service.image}")
            container = docker_client.containers.run(
                image=resolved_service.image,
                name=container_name,
                labels=labels,
                environment=resolved_service.environment,
                ports=port_bindings,
                volumes=resolved_service.volumes if resolved_service.volumes else None,
                command=resolved_service.command,
                restart_policy={"Name": resolved_service.restart_policy or "unless-stopped"},
                network=network,
                detach=True,
                remove=False,
            )

            logger.info(f"Container {container_name} created: {container.id[:12]}")

            # Extract exposed port
            exposed_port = None
            if resolved_service.ports:
                first_port = resolved_service.ports[0]
                if ":" in first_port:
                    exposed_port = int(first_port.split(":")[0])
                else:
                    exposed_port = int(first_port)

            # Build deployment object
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
                backend_type="docker",
                backend_metadata={
                    "container_id": container.id,
                    "local_deployment": True,
                }
            )

            logger.info(f"✅ Local Docker deployment successful: {container_name}")
            return deployment

        except docker.errors.ImageNotFound as e:
            logger.error(f"Image not found: {resolved_service.image}")
            raise ValueError(f"Docker image not found: {resolved_service.image}")
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
    ) -> Deployment:
        """Deploy to a Docker host via unode manager API or local Docker."""
        hostname = target.identifier  # Use standardized field (hostname for Docker targets)
        logger.info(f"Deploying {resolved_service.service_id} to Docker host {hostname}")

        # Generate container name
        container_name = f"{resolved_service.compose_service_name}-{deployment_id[:8]}"

        # Check if this is a local deployment
        if self._is_local_deployment(hostname):
            # Use Docker directly for local deployments
            logger.info("Using local Docker for deployment")
            return await self._deploy_local(
                target,
                resolved_service,
                deployment_id,
                container_name
            )

        # Build deploy payload for remote unode manager
        from datetime import datetime, timezone
        labels = {
            "ushadow.deployment_id": deployment_id,
            "ushadow.service_id": resolved_service.service_id,
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
                    backend_type="docker",
                    backend_metadata={
                        "container_id": result.get("container_id"),
                        "unode_manager_port": self.UNODE_MANAGER_PORT,
                    }
                )

                logger.info(f"✅ Docker deployment successful: {container_name}")
                return deployment

            except httpx.HTTPStatusError as e:
                logger.error(f"Deploy failed: {e.response.text}")
                raise ValueError(f"Deploy failed: {e.response.text}")
            except Exception as e:
                logger.error(f"Deploy error: {str(e)}")
                raise ValueError(f"Deploy error: {str(e)}")

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
        deployments = []

        try:
            if self._is_local_deployment(target.identifier):
                # Query local Docker
                docker_client = docker.from_env()
                filters = {"label": "ushadow.deployment_id"}

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

                    # For running containers, perform health check if configured
                    health_message = None
                    healthy = None
                    if deployment_status == DeploymentStatus.RUNNING:
                        health_check_path = labels.get("ushadow.health_check_path")
                        health_check_port_str = labels.get("ushadow.health_check_port")

                        # Determine health check port (use exposed port if not explicitly configured)
                        health_check_port = None
                        if health_check_port_str:
                            health_check_port = int(health_check_port_str)
                        elif container.ports:
                            # Use first exposed port
                            for container_port, host_bindings in container.ports.items():
                                if host_bindings:
                                    health_check_port = int(host_bindings[0]["HostPort"])
                                    break

                        # Perform health check if we have the necessary info
                        if health_check_path and health_check_port:
                            is_healthy, error_msg = await check_deployment_health(
                                host="localhost",
                                port=health_check_port,
                                health_path=health_check_path,
                                timeout=2.0
                            )

                            healthy = is_healthy
                            health_message = error_msg

                            # If not healthy yet, status is DEPLOYING
                            if not is_healthy:
                                deployment_status = DeploymentStatus.DEPLOYING

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

                    # Build deployed_config with ports
                    deployed_config = {}
                    if container.ports:
                        port_list = []
                        for container_port, host_bindings in container.ports.items():
                            if host_bindings:
                                port_list.append(f"{host_bindings[0]['HostPort']}:{container_port.split('/')[0]}")
                        deployed_config["ports"] = port_list

                    # Extract environment from container
                    if hasattr(container, 'attrs') and 'Config' in container.attrs:
                        env_list = container.attrs['Config'].get('Env', [])
                        deployed_config["environment"] = {
                            k: v for k, v in (e.split('=', 1) for e in env_list if '=' in e)
                        }

                    deployment = Deployment(
                        id=deployment_id,
                        service_id=labels.get("ushadow.service_id", "unknown"),
                        unode_hostname=labels.get("ushadow.unode_hostname", target.identifier),
                        status=deployment_status,
                        container_id=container.id,
                        container_name=container.name,
                        deployed_at=deployed_at,
                        exposed_port=exposed_port,
                        deployed_config=deployed_config if deployed_config else None,
                        healthy=healthy,
                        health_message=health_message,
                        last_health_check=datetime.now(timezone.utc) if healthy is not None else None,
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
    ) -> Deployment:
        """Deploy to a Kubernetes cluster."""
        # Use standardized fields
        cluster_id = target.identifier  # cluster_id
        hostname = target.name  # cluster name

        logger.info(f"Deploying {resolved_service.service_id} to K8s cluster {hostname}")

        # Use cluster's default namespace if not specified
        namespace = namespace or target.namespace or "default"

        # Use kubernetes_manager.deploy_to_kubernetes
        result = await self.k8s_manager.deploy_to_kubernetes(
            cluster_id=cluster_id,
            service_id=resolved_service.service_id,
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
            },
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
