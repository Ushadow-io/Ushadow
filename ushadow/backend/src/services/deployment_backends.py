"""Deployment backend implementations for different target types."""

from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, List
import logging
import httpx
from datetime import datetime

from src.models.deployment import ResolvedServiceDefinition, Deployment, DeploymentStatus
from src.models.unode import UNode, UNodeType
from src.services.kubernetes_manager import KubernetesManager
import docker

logger = logging.getLogger(__name__)


class DeploymentBackend(ABC):
    """Base class for deployment backends."""

    @abstractmethod
    async def deploy(
        self,
        unode: UNode,
        resolved_service: ResolvedServiceDefinition,
        deployment_id: str,
        namespace: Optional[str] = None,
    ) -> Deployment:
        """
        Deploy a service to this backend.

        Args:
            unode: The target unode (Docker host or K8s cluster)
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
        unode: UNode,
        deployment: Deployment
    ) -> DeploymentStatus:
        """Get current status of a deployment."""
        pass

    @abstractmethod
    async def stop(
        self,
        unode: UNode,
        deployment: Deployment
    ) -> bool:
        """Stop a running deployment."""
        pass

    @abstractmethod
    async def remove(
        self,
        unode: UNode,
        deployment: Deployment
    ) -> bool:
        """Remove a deployment completely."""
        pass

    @abstractmethod
    async def get_logs(
        self,
        unode: UNode,
        deployment: Deployment,
        tail: int = 100
    ) -> List[str]:
        """Get logs from a deployment."""
        pass


class DockerDeploymentBackend(DeploymentBackend):
    """Deployment backend for Docker hosts (traditional unodes)."""

    UNODE_MANAGER_PORT = 8444

    def _is_local_deployment(self, unode: UNode) -> bool:
        """Check if this is a local deployment (same host as backend)."""
        import os
        env_name = os.getenv("COMPOSE_PROJECT_NAME", "").strip() or "ushadow"
        return unode.hostname == env_name or unode.hostname == "localhost"

    def _get_target_ip(self, unode: UNode) -> str:
        """Get target IP for unode (localhost for local, tailscale IP for remote)."""
        if self._is_local_deployment(unode):
            return "localhost"
        elif unode.tailscale_ip:
            return unode.tailscale_ip
        else:
            raise ValueError(f"Unode {unode.hostname} has no Tailscale IP configured")

    async def _deploy_local(
        self,
        unode: UNode,
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

            # Create container
            logger.info(f"Creating container {container_name} from image {resolved_service.image}")
            container = docker_client.containers.run(
                image=resolved_service.image,
                name=container_name,
                environment=resolved_service.environment,
                ports=port_bindings,
                volumes=resolved_service.volumes if resolved_service.volumes else None,
                command=resolved_service.command,
                restart_policy={"Name": resolved_service.restart_policy or "unless-stopped"},
                network=resolved_service.network or "bridge",
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
            deployment = Deployment(
                id=deployment_id,
                service_id=resolved_service.service_id,
                unode_hostname=unode.hostname,
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
        unode: UNode,
        resolved_service: ResolvedServiceDefinition,
        deployment_id: str,
        namespace: Optional[str] = None,
    ) -> Deployment:
        """Deploy to a Docker host via unode manager API or local Docker."""
        logger.info(f"Deploying {resolved_service.service_id} to Docker host {unode.hostname}")

        # Generate container name
        container_name = f"{resolved_service.compose_service_name}-{deployment_id[:8]}"

        # Check if this is a local deployment
        if self._is_local_deployment(unode):
            # Use Docker directly for local deployments
            logger.info("Using local Docker for deployment")
            return await self._deploy_local(
                unode,
                resolved_service,
                deployment_id,
                container_name
            )

        # Build deploy payload for remote unode manager
        payload = {
            "service_id": resolved_service.service_id,
            "container_name": container_name,
            "image": resolved_service.image,
            "ports": resolved_service.ports,
            "environment": resolved_service.environment,
            "volumes": resolved_service.volumes,
            "command": resolved_service.command,
            "restart_policy": resolved_service.restart_policy,
            "network": resolved_service.network,
            "health_check_path": resolved_service.health_check_path,
        }

        # Get target IP (tailscale IP for remote)
        target_ip = self._get_target_ip(unode)
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
                    unode_hostname=unode.hostname,
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
        unode: UNode,
        deployment: Deployment
    ) -> DeploymentStatus:
        """Get container status from Docker host."""
        target_ip = self._get_target_ip(unode)
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
        unode: UNode,
        deployment: Deployment
    ) -> bool:
        """Stop a Docker container."""
        target_ip = self._get_target_ip(unode)
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
        unode: UNode,
        deployment: Deployment
    ) -> bool:
        """Remove a Docker container."""
        target_ip = self._get_target_ip(unode)
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
        unode: UNode,
        deployment: Deployment,
        tail: int = 100
    ) -> List[str]:
        """Get Docker container logs."""
        target_ip = self._get_target_ip(unode)
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


class KubernetesDeploymentBackend(DeploymentBackend):
    """Deployment backend for Kubernetes clusters."""

    def __init__(self, k8s_manager: KubernetesManager):
        self.k8s_manager = k8s_manager

    async def deploy(
        self,
        unode: UNode,
        resolved_service: ResolvedServiceDefinition,
        deployment_id: str,
        namespace: Optional[str] = None,
    ) -> Deployment:
        """Deploy to a Kubernetes cluster."""
        logger.info(f"Deploying {resolved_service.service_id} to K8s cluster {unode.hostname}")

        # Use unode.hostname as cluster_id for K8s unodes
        cluster_id = unode.hostname
        namespace = namespace or unode.metadata.get("default_namespace", "default")

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
            unode_hostname=unode.hostname,
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
        unode: UNode,
        deployment: Deployment
    ) -> DeploymentStatus:
        """Get pod status from Kubernetes."""
        cluster_id = unode.hostname
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
        unode: UNode,
        deployment: Deployment
    ) -> bool:
        """Scale K8s deployment to 0 replicas."""
        cluster_id = unode.hostname
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
        unode: UNode,
        deployment: Deployment
    ) -> bool:
        """Delete K8s deployment, service, and configmaps."""
        cluster_id = unode.hostname
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
        unode: UNode,
        deployment: Deployment,
        tail: int = 100
    ) -> List[str]:
        """Get logs from K8s pods."""
        cluster_id = unode.hostname
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


def get_deployment_backend(unode: UNode, k8s_manager: Optional[KubernetesManager] = None) -> DeploymentBackend:
    """
    Factory function to get the appropriate deployment backend for a unode.

    Args:
        unode: The target unode
        k8s_manager: KubernetesManager instance (required for K8s backends)

    Returns:
        Appropriate DeploymentBackend implementation
    """
    if unode.type == UNodeType.KUBERNETES:
        if not k8s_manager:
            raise ValueError("KubernetesManager required for K8s deployments")
        return KubernetesDeploymentBackend(k8s_manager)
    else:
        return DockerDeploymentBackend()
