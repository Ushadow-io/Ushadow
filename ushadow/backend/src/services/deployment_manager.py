"""Deployment manager for orchestrating services across u-nodes."""

import asyncio
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import aiohttp
from motor.motor_asyncio import AsyncIOMotorDatabase

from src.models.deployment import (
    ServiceDefinition,
    ServiceDefinitionCreate,
    ServiceDefinitionUpdate,
    Deployment,
    DeploymentStatus,
    ResolvedServiceDefinition,
)
from src.models.unode import UNode
from src.services.compose_registry import get_compose_registry
from src.services.deployment_backends import get_deployment_backend

logger = logging.getLogger(__name__)


def _is_local_deployment(unode_hostname: str) -> bool:
    """Check if deployment is to the local node (same COMPOSE_PROJECT_NAME)."""
    env_name = os.getenv("COMPOSE_PROJECT_NAME", "").strip() or "ushadow"
    # Local if hostname matches environment name or is the local machine
    return unode_hostname == env_name or unode_hostname == "localhost"


def _update_tailscale_serve_route(service_id: str, container_name: str, port: int, add: bool = True) -> bool:
    """Update tailscale serve route for a deployed service.

    Args:
        service_id: Service identifier (used as URL path)
        container_name: Container name to route to
        port: Container port
        add: True to add route, False to remove

    Returns:
        True if successful
    """
    try:
        from src.utils.tailscale_serve import add_service_route, remove_service_route

        if add:
            return add_service_route(service_id, container_name, port)
        else:
            return remove_service_route(service_id)
    except Exception as e:
        logger.warning(f"Failed to update tailscale serve route: {e}")
        return False

# Manager API port on worker nodes
MANAGER_PORT = 8444


class DeploymentManager:
    """
    Manages service deployments across u-nodes.

    Responsible for:
    - CRUD operations on service definitions
    - Deploying/stopping/restarting services on remote nodes
    - Tracking deployment status
    - Health checking deployed services
    """

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.services_collection = db.service_definitions
        self.deployments_collection = db.deployments
        self.unodes_collection = db.unodes
        self._http_session: Optional[aiohttp.ClientSession] = None

    async def initialize(self):
        """Initialize indexes."""
        await self.services_collection.create_index("service_id", unique=True)
        await self.deployments_collection.create_index("id", unique=True)
        await self.deployments_collection.create_index("service_id")
        await self.deployments_collection.create_index("unode_hostname")

        # Handle compound index with potential conflicts from old versions
        try:
            await self.deployments_collection.create_index(
                [("service_id", 1), ("unode_hostname", 1)],
                unique=True
            )
        except Exception as e:
            # If index exists with different spec (e.g., with partialFilterExpression),
            # drop it and recreate
            if "IndexKeySpecsConflict" in str(e) or "index has the same name" in str(e):
                logger.warning("Dropping conflicting index 'service_id_1_unode_hostname_1' and recreating")
                try:
                    await self.deployments_collection.drop_index("service_id_1_unode_hostname_1")
                    await self.deployments_collection.create_index(
                        [("service_id", 1), ("unode_hostname", 1)],
                        unique=True
                    )
                except Exception as drop_error:
                    logger.error(f"Failed to drop and recreate index: {drop_error}")
                    # Index might not exist or other issue, continue anyway
            else:
                # Re-raise if it's a different error
                raise

        logger.info("DeploymentManager initialized")

    async def _get_session(self) -> aiohttp.ClientSession:
        """Get or create HTTP session for communicating with nodes."""
        if self._http_session is None or self._http_session.closed:
            self._http_session = aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=120)  # Long timeout for image pulls
            )
        return self._http_session

    async def close(self):
        """Close HTTP session."""
        if self._http_session and not self._http_session.closed:
            await self._http_session.close()

    # =========================================================================
    # Centralized Service Resolution
    # =========================================================================

    async def resolve_service_for_deployment(
        self,
        service_id: str
    ) -> "ResolvedServiceDefinition":
        """
        Resolve all variables for a service using docker-compose config.

        This is the single source of truth for variable resolution across all
        deployment targets (local docker, remote unode, kubernetes).

        Steps:
        1. Get service from compose registry
        2. Get user's saved env configuration
        3. Run `docker-compose -f <file> config <service>` with resolved env vars
        4. Parse the resolved YAML output (all ${VAR:-default} substituted)
        5. Return ResolvedServiceDefinition with clean values

        Args:
            service_id: Service identifier (e.g., "openmemory-compose:mem0-ui")

        Returns:
            ResolvedServiceDefinition with all variables resolved

        Raises:
            ValueError: If service not found or resolution fails
        """
        import subprocess
        import yaml
        from pathlib import Path
        from src.models.deployment import ResolvedServiceDefinition

        compose_registry = get_compose_registry()

        # Get service from compose registry
        service = compose_registry.get_service(service_id)
        if not service:
            raise ValueError(f"Service not found: {service_id}")

        # Get user's saved env configuration (same as docker_manager does)
        from src.services.docker_manager import get_docker_manager
        docker_manager = get_docker_manager()

        # Build environment variables with user configuration
        subprocess_env, container_env = await docker_manager._build_env_vars_for_service(
            service.service_name
        )

        # Get compose file path (DiscoveredService has compose_file as direct attribute)
        compose_file = str(service.compose_file)
        if not compose_file:
            raise ValueError(f"Service {service_id} has no compose_file")

        # Translate to container paths (same logic as docker_manager)
        if compose_file.startswith("compose/"):
            compose_path = Path("/") / compose_file
        elif compose_file.startswith("docker-compose"):
            compose_path = Path("/config").parent / compose_file
            if not compose_path.exists():
                compose_path = Path(".") / compose_file
        else:
            compose_path = Path(compose_file)

        if not compose_path.exists():
            raise ValueError(f"Compose file not found: {compose_path}")

        compose_dir = compose_path.parent if compose_path.parent.exists() else Path(".")

        # Determine project name (namespace)
        project_name = service.namespace if service.namespace else None
        if not project_name:
            project_name = subprocess_env.get("COMPOSE_PROJECT_NAME", "ushadow")

        # Run docker-compose config to resolve all variables
        cmd = ["docker", "compose", "-f", str(compose_path)]
        if project_name:
            cmd.extend(["-p", project_name])
        cmd.append("config")

        logger.info(
            f"Resolving service {service_id} with docker-compose config: "
            f"{' '.join(cmd)}"
        )

        try:
            result = subprocess.run(
                cmd,
                env=subprocess_env,  # All env vars for ${VAR} substitution
                cwd=str(compose_dir),
                capture_output=True,
                text=True,
                timeout=30
            )

            if result.returncode != 0:
                logger.error(f"docker-compose config failed: {result.stderr}")
                raise ValueError(f"Failed to resolve compose file: {result.stderr}")

            # Parse the resolved YAML
            resolved_compose = yaml.safe_load(result.stdout)
            services = resolved_compose.get("services", {})

            # Get our specific service
            resolved_service = services.get(service.service_name)
            if not resolved_service:
                raise ValueError(
                    f"Service {service.service_name} not found in resolved compose output"
                )

            # Extract resolved values
            image = resolved_service.get("image", "")
            if not image:
                raise ValueError(f"Service {service.service_name} has no image defined")

            # Parse ports from resolved compose
            ports = []
            for port_def in resolved_service.get("ports", []):
                if isinstance(port_def, dict):
                    # Long format: {target: 3000, published: 3002}
                    target = port_def.get("target")
                    published = port_def.get("published")
                    if target and published:
                        ports.append(f"{published}:{target}")
                    elif target:
                        ports.append(str(target))
                else:
                    # Short format: "3002:3000" or "3000"
                    ports.append(str(port_def))

            # Get resolved environment
            environment = resolved_service.get("environment", {})
            if isinstance(environment, list):
                # Convert list format ["KEY=value"] to dict
                env_dict = {}
                for env_item in environment:
                    if "=" in env_item:
                        key, value = env_item.split("=", 1)
                        env_dict[key] = value
                environment = env_dict

            # Get other fields - handle volumes (can be list of strings or dicts)
            volumes_raw = resolved_service.get("volumes", [])
            volumes = []
            for vol in volumes_raw:
                if isinstance(vol, str):
                    # Already in string format: "/host:/container"
                    volumes.append(vol)
                elif isinstance(vol, dict):
                    # Long format: {"type": "volume", "source": "name", "target": "/path"}
                    # or {"type": "bind", "source": "/host/path", "target": "/container/path"}
                    vol_type = vol.get("type", "volume")
                    source = vol.get("source", "")
                    target = vol.get("target", "")
                    read_only = vol.get("read_only", False)

                    if source and target:
                        vol_str = f"{source}:{target}"
                        if read_only:
                            vol_str += ":ro"
                        volumes.append(vol_str)
                    elif target:
                        # Anonymous volume
                        volumes.append(target)

            command = resolved_service.get("command")
            if isinstance(command, list):
                command = " ".join(command)

            restart_policy = resolved_service.get("restart", "unless-stopped")

            # Handle networks (can be list or dict)
            networks = resolved_service.get("networks", {})
            if isinstance(networks, list):
                network = networks[0] if networks else None
            elif isinstance(networks, dict):
                # Dict format: {"infra-network": null} - get first key
                network = list(networks.keys())[0] if networks else None
            else:
                network = None

            # Create ResolvedServiceDefinition
            resolved = ResolvedServiceDefinition(
                service_id=service_id,
                name=service.service_name,
                image=image,
                ports=ports,
                environment=environment,
                volumes=volumes,
                command=command,
                restart_policy=restart_policy,
                network=network,
                compose_file=str(compose_path),
                compose_service_name=service.service_name,
                description=service.description,
                namespace=service.namespace,
                requires=service.requires  # Direct attribute on DiscoveredService
            )

            logger.info(
                f"Resolved service {service_id}: image={image}, "
                f"ports={ports}, env_vars={len(environment)}"
            )

            return resolved

        except subprocess.TimeoutExpired:
            raise ValueError("docker-compose config timed out")
        except Exception as e:
            import traceback
            logger.error(f"Failed to resolve service {service_id}: {e}")
            logger.error(f"Exception type: {type(e).__name__}")
            logger.error(f"Traceback: {traceback.format_exc()}")
            raise ValueError(f"Service resolution failed: {e}")

    # =========================================================================
    # Service Definition CRUD
    # =========================================================================

    async def create_service(
        self,
        data: ServiceDefinitionCreate,
        created_by: Optional[str] = None
    ) -> ServiceDefinition:
        """Create a new service definition."""
        now = datetime.now(timezone.utc)

        service = ServiceDefinition(
            service_id=data.service_id,
            name=data.name,
            description=data.description,
            image=data.image,
            ports=data.ports,
            environment=data.environment,
            volumes=data.volumes,
            command=data.command,
            restart_policy=data.restart_policy,
            network=data.network,
            health_check_path=data.health_check_path,
            health_check_port=data.health_check_port,
            tags=data.tags,
            metadata=data.metadata,
            created_at=now,
            updated_at=now,
            created_by=created_by,
        )

        await self.services_collection.insert_one(service.model_dump())
        logger.info(f"Created service definition: {service.service_id}")
        return service

    async def list_services(self) -> List[ServiceDefinition]:
        """List all service definitions."""
        cursor = self.services_collection.find({})
        services = []
        async for doc in cursor:
            services.append(ServiceDefinition(**doc))
        return services

    async def get_service(self, service_id: str) -> Optional[ServiceDefinition]:
        """Get a service definition by ID."""
        doc = await self.services_collection.find_one({"service_id": service_id})
        if doc:
            return ServiceDefinition(**doc)
        return None

    async def update_service(
        self,
        service_id: str,
        data: ServiceDefinitionUpdate
    ) -> Optional[ServiceDefinition]:
        """Update a service definition."""
        update_data = data.model_dump(exclude_unset=True)
        if not update_data:
            return await self.get_service(service_id)

        update_data["updated_at"] = datetime.now(timezone.utc)

        result = await self.services_collection.find_one_and_update(
            {"service_id": service_id},
            {"$set": update_data},
            return_document=True
        )
        if result:
            logger.info(f"Updated service definition: {service_id}")
            return ServiceDefinition(**result)
        return None

    async def delete_service(self, service_id: str) -> bool:
        """Delete a service definition."""
        # Check for active deployments
        deployment_count = await self.deployments_collection.count_documents({
            "service_id": service_id,
            "status": {"$in": [DeploymentStatus.RUNNING, DeploymentStatus.DEPLOYING]}
        })
        if deployment_count > 0:
            raise ValueError(
                f"Cannot delete service with {deployment_count} active deployments. "
                "Remove deployments first."
            )

        result = await self.services_collection.delete_one({"service_id": service_id})
        if result.deleted_count > 0:
            logger.info(f"Deleted service definition: {service_id}")
            return True
        return False

    # =========================================================================
    # Deployment Operations
    # =========================================================================

    async def deploy_service(
        self,
        service_id: str,
        unode_hostname: str,
        namespace: Optional[str] = None,
        instance_id: Optional[str] = None
    ) -> Deployment:
        """
        Deploy a service to any deployment target (Docker unode or K8s cluster).

        Uses centralized resolution via resolve_service_for_deployment() to ensure
        all variables are resolved before sending to target.

        Args:
            service_id: Service to deploy
            unode_hostname: Target unode hostname (Docker host or K8s cluster ID)
            namespace: Optional K8s namespace (only used for K8s deployments)
            instance_id: Optional instance ID (for instance-based deployments)
        """
        # Resolve service with all variables substituted
        try:
            resolved_service = await self.resolve_service_for_deployment(service_id)
        except ValueError as e:
            logger.error(f"Failed to resolve service {service_id}: {e}")
            raise ValueError(f"Service resolution failed: {e}")

        # Get u-node
        unode_dict = await self.unodes_collection.find_one({"hostname": unode_hostname})
        if not unode_dict:
            raise ValueError(f"U-node not found: {unode_hostname}")

        if unode_dict.get("status") != "online":
            raise ValueError(f"U-node is not online: {unode_hostname}")

        # Convert to UNode model
        unode = UNode(**unode_dict)

        # Check if already deployed
        # If instance_id is provided, check for that specific instance
        # Otherwise, check for any deployment of this service (legacy behavior)
        query = {
            "service_id": service_id,
            "unode_hostname": unode_hostname
        }
        if instance_id:
            query["instance_id"] = instance_id

        existing = await self.deployments_collection.find_one(query)
        if existing and existing.get("status") in [
            DeploymentStatus.RUNNING,
            DeploymentStatus.DEPLOYING
        ]:
            if instance_id:
                raise ValueError(
                    f"Instance {instance_id} already deployed to {unode_hostname}"
                )
            else:
                raise ValueError(
                    f"Service {service_id} already deployed to {unode_hostname}"
                )

        # Create deployment ID
        deployment_id = str(uuid.uuid4())[:8]

        # Get appropriate deployment backend
        k8s_manager = None
        from src.models.unode import UNodeType
        if unode.type == UNodeType.KUBERNETES:
            from src.services.kubernetes_manager import get_kubernetes_manager
            k8s_manager = await get_kubernetes_manager()

        backend = get_deployment_backend(unode, k8s_manager)

        # Check for port conflicts using the existing method (Docker only)
        if unode.type != UNodeType.KUBERNETES:
            from src.services.docker_manager import get_docker_manager
            docker_mgr = get_docker_manager()

            # Get the service name from the resolved service
            service_name = resolved_service.compose_service_name

            # Use existing port conflict checking method
            conflicts = docker_mgr.check_port_conflicts(service_name)

            if conflicts:
                logger.info(f"Found {len(conflicts)} port conflicts for {service_name}, remapping ports")

                # Remap ports in resolved_service to use suggested alternatives
                updated_ports = []
                for port_str in resolved_service.ports:
                    if ":" in port_str:
                        host_port, container_port = port_str.split(":")
                        original_port = int(host_port)

                        # Find if this port has a conflict
                        conflict = next((c for c in conflicts if c.port == original_port), None)
                        if conflict and conflict.suggested_port:
                            # Use suggested alternative port
                            updated_ports.append(f"{conflict.suggested_port}:{container_port}")
                            logger.info(f"Remapped port {original_port} -> {conflict.suggested_port}")
                        else:
                            updated_ports.append(port_str)
                    else:
                        updated_ports.append(port_str)

                # Update the resolved service with new ports
                resolved_service.ports = updated_ports
            else:
                logger.info(f"No port conflicts detected for {service_name}")

        # Deploy using the backend
        try:
            deployment = await backend.deploy(
                unode=unode,
                resolved_service=resolved_service,
                deployment_id=deployment_id,
                namespace=namespace
            )

            # Set instance_id on the deployment
            deployment.instance_id = instance_id

            # For Docker deployments, update tailscale serve routes
            if deployment.backend_type == "docker":
                is_local = _is_local_deployment(unode_hostname)
                if is_local and deployment.exposed_port:
                    _update_tailscale_serve_route(
                        service_id,
                        deployment.container_name,
                        deployment.exposed_port,
                        add=True
                    )

                # Set access URL using tailscale helper
                if deployment.exposed_port:
                    from src.services.tailscale_serve import get_service_access_url
                    access_url = get_service_access_url(
                        unode_hostname,
                        deployment.exposed_port,
                        is_local=is_local
                    )
                    if access_url:
                        if is_local:
                            # Local services have path-based routing
                            deployment.access_url = f"{access_url}/{service_id}"
                        else:
                            deployment.access_url = access_url

            deployment.deployed_at = datetime.now(timezone.utc)

        except Exception as e:
            logger.error(f"Deploy failed for {service_id} on {unode_hostname}: {e}")
            # Create failed deployment record
            deployment = Deployment(
                id=deployment_id,
                service_id=service_id,
                unode_hostname=unode_hostname,
                instance_id=instance_id,
                status=DeploymentStatus.FAILED,
                created_at=datetime.now(timezone.utc),
                deployed_config=resolved_service.model_dump(),
                error=str(e),
                backend_type=unode.type.value
            )

            # Upsert failed deployment record
            await self.deployments_collection.replace_one(
                {"service_id": service_id, "unode_hostname": unode_hostname},
                deployment.model_dump(),
                upsert=True
            )

            # Re-raise exception so API returns proper error status
            raise

        # Upsert deployment (replace if exists)
        await self.deployments_collection.replace_one(
            {"service_id": service_id, "unode_hostname": unode_hostname},
            deployment.model_dump(),
            upsert=True
        )

        # Send deploy command to node
        try:
            result = await self._send_deploy_command(unode, service, container_name)

            logger.info(f"Deploy result from {unode_hostname}: {result}")
            if result.get("success"):
                deployment.status = DeploymentStatus.RUNNING
                deployment.container_id = result.get("container_id")
                deployment.deployed_at = datetime.now(timezone.utc)

                # Get port from service definition (first exposed port or default 8080)
                port = 8080
                if service.ports:
                    port = list(service.ports.values())[0] if service.ports else 8080
                deployment.exposed_port = port

                # Calculate access URL and update tailscale serve for local deployments
                is_local = _is_local_deployment(unode_hostname)
                if is_local:
                    _update_tailscale_serve_route(service_id, container_name, port, add=True)

                # Set access URL using tailscale helper
                from src.utils.tailscale_serve import get_service_access_url
                access_url = get_service_access_url(unode_hostname, port, is_local=is_local)
                if access_url:
                    if is_local:
                        # Local services have path-based routing
                        deployment.access_url = f"{access_url}/{service_id}"
                    else:
                        deployment.access_url = access_url
            else:
                deployment.status = DeploymentStatus.FAILED
                deployment.error = result.get("error", "Unknown error")
                logger.error(f"Deploy failed on {unode_hostname}: {deployment.error}")

        except Exception as e:
            logger.error(f"Deploy failed for {service_id} on {unode_hostname}: {e}")
            deployment.status = DeploymentStatus.FAILED
            deployment.error = str(e)

        # Update deployment record
        await self.deployments_collection.replace_one(
            {"id": deployment_id},
            deployment.model_dump()
        )

        return deployment

    async def stop_deployment(self, deployment_id: str) -> Deployment:
        """Stop a deployment."""
        deployment = await self.get_deployment(deployment_id)
        if not deployment:
            raise ValueError(f"Deployment not found: {deployment_id}")

        unode_dict = await self.unodes_collection.find_one({
            "hostname": deployment.unode_hostname
        })
        if not unode_dict:
            raise ValueError(f"U-node not found: {deployment.unode_hostname}")

        unode = UNode(**unode_dict)

        # Get appropriate backend
        k8s_manager = None
        from src.models.unode import UNodeType
        if unode.type == UNodeType.KUBERNETES:
            from src.services.kubernetes_manager import get_kubernetes_manager
            k8s_manager = await get_kubernetes_manager()

        backend = get_deployment_backend(unode, k8s_manager)

        try:
            success = await backend.stop(unode, deployment)

            if success:
                deployment.status = DeploymentStatus.STOPPED
                deployment.stopped_at = datetime.now(timezone.utc)
            else:
                deployment.error = "Stop failed"

        except Exception as e:
            logger.error(f"Stop failed for deployment {deployment_id}: {e}")
            deployment.error = str(e)

        await self.deployments_collection.replace_one(
            {"id": deployment_id},
            deployment.model_dump()
        )
        return deployment

    async def restart_deployment(self, deployment_id: str) -> Deployment:
        """Restart a deployment."""
        deployment = await self.get_deployment(deployment_id)
        if not deployment:
            raise ValueError(f"Deployment not found: {deployment_id}")

        unode = await self.unodes_collection.find_one({
            "hostname": deployment.unode_hostname
        })
        if not unode:
            raise ValueError(f"U-node not found: {deployment.unode_hostname}")

        try:
            result = await self._send_restart_command(unode, deployment.container_name)

            if result.get("success"):
                deployment.status = DeploymentStatus.RUNNING
                deployment.stopped_at = None
            else:
                deployment.error = result.get("error", "Restart failed")

        except Exception as e:
            logger.error(f"Restart failed for deployment {deployment_id}: {e}")
            deployment.error = str(e)

        await self.deployments_collection.replace_one(
            {"id": deployment_id},
            deployment.model_dump()
        )
        return deployment

    async def remove_deployment(self, deployment_id: str) -> bool:
        """Remove a deployment (stop and delete)."""
        deployment = await self.get_deployment(deployment_id)
        if not deployment:
            return False

        unode_dict = await self.unodes_collection.find_one({
            "hostname": deployment.unode_hostname
        })

        if unode_dict:
            unode = UNode(**unode_dict)

            # Get appropriate backend
            k8s_manager = None
            if unode.type.value == "kubernetes":
                from src.services.kubernetes_manager import get_kubernetes_manager
                k8s_manager = await get_kubernetes_manager()

            backend = get_deployment_backend(unode, k8s_manager)

            try:
                await backend.remove(unode, deployment)
            except Exception as e:
                logger.warning(f"Failed to remove deployment on node: {e}")

        # Remove tailscale serve route for local Docker deployments
        if deployment.backend_type == "docker" and _is_local_deployment(deployment.unode_hostname):
            _update_tailscale_serve_route(deployment.service_id, "", 0, add=False)

        await self.deployments_collection.delete_one({"id": deployment_id})
        logger.info(f"Removed deployment: {deployment_id}")
        return True

    async def get_deployment(self, deployment_id: str) -> Optional[Deployment]:
        """Get a deployment by ID."""
        doc = await self.deployments_collection.find_one({"id": deployment_id})
        if doc:
            return Deployment(**doc)
        return None

    async def list_deployments(
        self,
        service_id: Optional[str] = None,
        unode_hostname: Optional[str] = None
    ) -> List[Deployment]:
        """List deployments with optional filters."""
        query = {}
        if service_id:
            query["service_id"] = service_id
        if unode_hostname:
            query["unode_hostname"] = unode_hostname

        cursor = self.deployments_collection.find(query)
        deployments = []
        async for doc in cursor:
            deployments.append(Deployment(**doc))
        return deployments

    async def get_deployment_logs(
        self,
        deployment_id: str,
        tail: int = 100
    ) -> Optional[str]:
        """Get logs for a deployment."""
        deployment = await self.get_deployment(deployment_id)
        if not deployment:
            return None

        unode_dict = await self.unodes_collection.find_one({
            "hostname": deployment.unode_hostname
        })
        if not unode_dict:
            return None

        unode = UNode(**unode_dict)

        # Get appropriate backend
        k8s_manager = None
        from src.models.unode import UNodeType
        if unode.type == UNodeType.KUBERNETES:
            from src.services.kubernetes_manager import get_kubernetes_manager
            k8s_manager = await get_kubernetes_manager()

        backend = get_deployment_backend(unode, k8s_manager)

        try:
            logs = await backend.get_logs(unode, deployment, tail)
            return "\n".join(logs)
        except Exception as e:
            logger.error(f"Failed to get logs for {deployment_id}: {e}")
            return None

    # =========================================================================
    # Node Communication
    # =========================================================================

    async def _get_node_url(self, unode: Dict[str, Any]) -> str:
        """Get the manager API URL for a u-node."""
        # Prefer Tailscale IP for cross-node communication
        ip = unode.get("tailscale_ip") or unode.get("hostname")
        return f"http://{ip}:{MANAGER_PORT}"

    async def _get_node_secret(self, unode: Dict[str, Any]) -> str:
        """Get the secret for authenticating with a u-node."""
        # Secret is stored encrypted - need to decrypt it
        encrypted_secret = unode.get("unode_secret_encrypted", "")
        hostname = unode.get('hostname', 'unknown')

        if not encrypted_secret:
            logger.warning(f"No encrypted secret found for node {hostname}")
            logger.warning(f"Available unode fields: {list(unode.keys())}")
            return ""

        try:
            from src.services.unode_manager import get_unode_manager
            unode_manager = await get_unode_manager()
            secret = unode_manager._decrypt_secret(encrypted_secret)
            logger.info(f"Decrypted secret for {hostname}: {'[OK]' if secret else '[EMPTY]'} (length={len(secret)})")
            return secret
        except Exception as e:
            logger.error(f"Failed to decrypt node secret for {hostname}: {e}")
            return ""

    async def _send_deploy_command(
        self,
        unode: Dict[str, Any],
        resolved_service: ResolvedServiceDefinition,
        container_name: str
    ) -> Dict[str, Any]:
        """
        Send deploy command to a u-node.

        Args:
            unode: U-node document
            resolved_service: Fully resolved service definition (all vars substituted)
            container_name: Container name to use

        Returns:
            Deploy result from remote node
        """
        session = await self._get_session()
        url = await self._get_node_url(unode)
        secret = await self._get_node_secret(unode)

        # Convert port list ["3002:3000", "8080"] to Docker API format {3000: 3002, 8080: 8080}
        ports_dict = {}
        for port_str in resolved_service.ports:
            if ":" in port_str:
                host_port, container_port = port_str.split(":", 1)
                ports_dict[f"{container_port}/tcp"] = int(host_port)
            else:
                ports_dict[f"{port_str}/tcp"] = int(port_str)

        payload = {
            "container_name": container_name,
            "image": resolved_service.image,
            "ports": ports_dict,
            "environment": resolved_service.environment,
            "volumes": resolved_service.volumes,
            "restart_policy": resolved_service.restart_policy,
            "network": resolved_service.network,
            "command": resolved_service.command,
        }

        headers = {"X-Node-Secret": secret}

        logger.info(
            f"Deploying {container_name} to {unode.get('hostname')}: "
            f"image={resolved_service.image}, ports={resolved_service.ports}"
        )

        async with session.post(
            f"{url}/deploy",
            json=payload,
            headers=headers
        ) as response:
            return await response.json()

    async def _send_stop_command(
        self,
        unode: Dict[str, Any],
        container_name: str
    ) -> Dict[str, Any]:
        """Send stop command to a u-node."""
        session = await self._get_session()
        url = await self._get_node_url(unode)
        secret = await self._get_node_secret(unode)

        headers = {"X-Node-Secret": secret}

        async with session.post(
            f"{url}/stop",
            json={"container_name": container_name},
            headers=headers
        ) as response:
            return await response.json()

    async def _send_restart_command(
        self,
        unode: Dict[str, Any],
        container_name: str
    ) -> Dict[str, Any]:
        """Send restart command to a u-node."""
        session = await self._get_session()
        url = await self._get_node_url(unode)
        secret = await self._get_node_secret(unode)

        headers = {"X-Node-Secret": secret}

        async with session.post(
            f"{url}/restart",
            json={"container_name": container_name},
            headers=headers
        ) as response:
            return await response.json()

    async def _send_remove_command(
        self,
        unode: Dict[str, Any],
        container_name: str
    ) -> Dict[str, Any]:
        """Send remove command to a u-node."""
        session = await self._get_session()
        url = await self._get_node_url(unode)
        secret = await self._get_node_secret(unode)

        headers = {"X-Node-Secret": secret}

        async with session.post(
            f"{url}/remove",
            json={"container_name": container_name},
            headers=headers
        ) as response:
            return await response.json()

    async def _send_logs_command(
        self,
        unode: Dict[str, Any],
        container_name: str,
        tail: int = 100
    ) -> Dict[str, Any]:
        """Get logs from a container on a u-node."""
        session = await self._get_session()
        url = await self._get_node_url(unode)
        secret = await self._get_node_secret(unode)

        headers = {"X-Node-Secret": secret}

        async with session.get(
            f"{url}/logs/{container_name}",
            params={"tail": tail},
            headers=headers
        ) as response:
            return await response.json()


# Global instance
_deployment_manager: Optional[DeploymentManager] = None


def get_deployment_manager() -> DeploymentManager:
    """Get the global DeploymentManager instance."""
    global _deployment_manager
    if _deployment_manager is None:
        raise RuntimeError("DeploymentManager not initialized")
    return _deployment_manager


async def init_deployment_manager(db: AsyncIOMotorDatabase) -> DeploymentManager:
    """Initialize the global DeploymentManager."""
    global _deployment_manager
    _deployment_manager = DeploymentManager(db)
    await _deployment_manager.initialize()
    return _deployment_manager
