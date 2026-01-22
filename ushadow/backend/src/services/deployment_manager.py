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
from src.models.deploy_target import DeployTarget
from src.services.compose_registry import get_compose_registry
from src.services.deployment_platforms import get_deploy_platform

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
        # NOTE: deployments_collection no longer used - deployments are stateless
        # self.deployments_collection = db.deployments
        self.unodes_collection = db.unodes
        self._http_session: Optional[aiohttp.ClientSession] = None

    async def initialize(self):
        """Initialize indexes."""
        await self.services_collection.create_index("service_id", unique=True)
        # NOTE: Deployment indexes no longer needed - deployments are stateless (queried from Docker/K8s runtime)
        # await self.deployments_collection.create_index("id", unique=True)
        # await self.deployments_collection.create_index("service_id")
        # await self.deployments_collection.create_index("unode_hostname")

        # Handle compound index with potential conflicts from old versions
        # NOTE: No longer needed - deployments are stateless
        # try:
        #     await self.deployments_collection.create_index(
        #         [("service_id", 1), ("unode_hostname", 1)],
        #         unique=True
        #     )
        # except Exception as e:
        #     # If index exists with different spec (e.g., with partialFilterExpression),
        #     # drop it and recreate
        #     if "IndexKeySpecsConflict" in str(e) or "index has the same name" in str(e):
        #         logger.warning("Dropping conflicting index 'service_id_1_unode_hostname_1' and recreating")
        #         try:
        #             await self.deployments_collection.drop_index("service_id_1_unode_hostname_1")
        #             await self.deployments_collection.create_index(
        #                 [("service_id", 1), ("unode_hostname", 1)],
        #                 unique=True
        #             )
        #         except Exception as drop_error:
        #             logger.error(f"Failed to drop and recreate index: {drop_error}")
        #             # Index might not exist or other issue, continue anyway
        #     else:
        #         # Re-raise if it's a different error
        #         raise

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
        service_id: str,
        deploy_target: Optional[str] = None,
        config_id: Optional[str] = None
    ) -> "ResolvedServiceDefinition":
        """
        Resolve all variables for a service using the new Settings API.

        This is the single source of truth for variable resolution across all
        deployment targets (local docker, remote unode, kubernetes).

        Uses Settings.for_deploy_config() to get properly resolved environment
        variables through the complete hierarchy:
        - config.defaults.yaml
        - Docker Compose file defaults
        - .env file (os.environ)
        - Capability/provider values
        - Deploy environment overrides
        - User overrides (if config_id provided)

        Steps:
        1. Get service from compose registry
        2. Use Settings API to resolve all env vars for this deployment target
        3. Run `docker-compose config` to resolve image/port/volume variables
        4. Combine Settings-resolved env vars with compose-resolved structure
        5. Return ResolvedServiceDefinition with clean values

        Args:
            service_id: Service identifier (e.g., "openmemory-compose:mem0-ui")
            deploy_target: Target unode hostname or cluster ID for deployment
            config_id: Optional ServiceConfig ID to load env var overrides from

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

        # Use new Settings API to resolve environment variables
        from src.config import get_settings
        settings = get_settings()

        # Choose resolution method based on context:
        # - config_id provided: use for_deployment() (full hierarchy with user overrides)
        # - deploy_target provided: use for_deploy_config() (up to deploy_env layer)
        # - neither: use for_service() (up to capability layer)
        if config_id:
            logger.info(f"Resolving settings for deployment {config_id}")
            env_resolutions = await settings.for_deployment(config_id)
        elif deploy_target:
            logger.info(f"Resolving settings for service {service_id} targeting {deploy_target}")
            env_resolutions = await settings.for_deploy_config(deploy_target, service_id)
        else:
            # Fallback to service-level resolution (layers 1-4 only)
            logger.info(f"Resolving settings for service {service_id} (no context)")
            env_resolutions = await settings.for_service(service_id)

        # Extract values from Resolution objects
        container_env = {
            env_var: resolution.value
            for env_var, resolution in env_resolutions.items()
            if resolution.value is not None
        }

        # Build subprocess environment for docker-compose config (needs all vars for ${VAR} substitution)
        import os
        subprocess_env = os.environ.copy()
        subprocess_env.update(container_env)

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

            # Use the properly resolved environment from _build_env_vars_for_service
            # This includes all layers: config defaults, compose defaults, .env, capabilities, etc.
            # Don't rely on docker-compose config output as it only includes vars listed in the compose file
            environment = container_env

            # Also merge any environment vars from the compose file output that aren't in container_env
            # This handles edge cases where compose file has additional vars not managed by our system
            compose_environment = resolved_service.get("environment", {})
            if isinstance(compose_environment, list):
                # Convert list format ["KEY=value"] to dict
                env_dict = {}
                for env_item in compose_environment:
                    if "=" in env_item:
                        key, value = env_item.split("=", 1)
                        env_dict[key] = value
                compose_environment = env_dict

            # Merge compose environment (lower priority) with container_env (higher priority)
            for key, value in compose_environment.items():
                if key not in environment:
                    environment[key] = value

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

            # Keep command as-is (list or string) - don't join lists
            # Docker needs the array format to preserve shell quoting
            command = resolved_service.get("command")

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
                f"ports={ports}, env_vars={len(environment)}, volumes={len(volumes)}"
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
        # Check for active deployments (query runtime, not database)
        deployments = await self.list_deployments(service_id=service_id)
        active_deployments = [
            d for d in deployments
            if d.status in [DeploymentStatus.RUNNING, DeploymentStatus.DEPLOYING]
        ]

        if active_deployments:
            raise ValueError(
                f"Cannot delete service with {len(active_deployments)} active deployments. "
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
        config_id: Optional[str] = None
    ) -> Deployment:
        """
        Deploy a service to any deployment target (Docker unode or K8s cluster).

        Uses centralized resolution via resolve_service_for_deployment() to ensure
        all variables are resolved before sending to target.

        Args:
            service_id: Service to deploy
            unode_hostname: Target unode hostname (Docker host or K8s cluster ID)
            namespace: Optional K8s namespace (only used for K8s deployments)
            config_id: Optional instance ID (for instance-based deployments)
        """
        # Resolve service with all variables substituted
        try:
            resolved_service = await self.resolve_service_for_deployment(
                service_id,
                deploy_target=unode_hostname,
                config_id=config_id
            )
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

        # Create deployment ID
        deployment_id = str(uuid.uuid4())[:8]

        # Create deployment target from unode with standardized fields
        from src.models.unode import UNodeType, UNodeRole
        from src.utils.deployment_targets import parse_deployment_target_id

        parsed = parse_deployment_target_id(unode.deployment_target_id)
        is_leader = unode.role == UNodeRole.LEADER

        target = DeployTarget(
            id=unode.deployment_target_id,
            type="k8s" if unode.type == UNodeType.KUBERNETES else "docker",
            name=f"{unode.hostname} ({'Leader' if is_leader else 'Remote'})",
            identifier=unode.hostname,
            environment=parsed["environment"],
            status=unode.status.value if unode.status else "unknown",
            provider="local" if is_leader else "remote",
            region=None,
            is_leader=is_leader,
            namespace=None,
            infrastructure=None,
            raw_metadata=unode.model_dump()
        )

        # Get appropriate deployment platform
        platform = get_deploy_platform(target)

        # Check for port conflicts directly from resolved service (Docker only)
        if unode.type != UNodeType.KUBERNETES:
            from src.services.docker_manager import check_port_in_use

            logger.info(f"Checking port conflicts for {resolved_service.service_id}")
            logger.info(f"Ports to check: {resolved_service.ports}")

            updated_ports = []
            conflicts_found = False

            for port_str in resolved_service.ports:
                if ":" in port_str:
                    host_port, container_port = port_str.split(":")
                    original_port = int(host_port)

                    # Check if port is in use (don't exclude anything - we're deploying a new instance)
                    used_by = check_port_in_use(original_port)

                    if used_by:
                        conflicts_found = True
                        logger.warning(f"Port conflict detected: port {original_port} is used by {used_by}")

                        # Find alternative port
                        suggested_port = original_port + 1
                        while check_port_in_use(suggested_port) and suggested_port < original_port + 100:
                            suggested_port += 1

                        if suggested_port < original_port + 100:
                            updated_ports.append(f"{suggested_port}:{container_port}")
                            logger.info(f"Remapped port {original_port} -> {suggested_port} for container port {container_port}")
                        else:
                            # No available port found in range
                            raise ValueError(f"Could not find available port for {original_port} (checked up to {original_port + 100})")
                    else:
                        updated_ports.append(port_str)
                        logger.debug(f"Port {original_port} is available")
                else:
                    updated_ports.append(port_str)

            if conflicts_found:
                logger.info(f"Remapped ports: {resolved_service.ports} -> {updated_ports}")
                resolved_service.ports = updated_ports
            else:
                logger.info(f"No port conflicts detected for {resolved_service.service_id}")

        # Deploy using the platform
        try:
            deployment = await platform.deploy(
                target=target,
                resolved_service=resolved_service,
                deployment_id=deployment_id,
                namespace=namespace
            )

            # Set config_id on the deployment
            deployment.config_id = config_id

            # For Docker deployments, optionally update tailscale serve routes (non-blocking)
            if deployment.backend_type == "docker":
                is_local = _is_local_deployment(unode_hostname)

                try:
                    if is_local and deployment.exposed_port:
                        _update_tailscale_serve_route(
                            service_id,
                            deployment.container_name,
                            deployment.exposed_port,
                            add=True
                        )

                    # Set access URL using tailscale helper
                    if deployment.exposed_port:
                        from src.utils.tailscale_serve import get_service_access_url
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
                except Exception as e:
                    # Tailscale configuration is optional - don't fail deployment
                    logger.warning(f"Could not configure Tailscale access URL: {e}")
                    logger.debug("Deployment will continue without Tailscale URL")

            deployment.deployed_at = datetime.now(timezone.utc)

        except Exception as e:
            logger.error(f"Deploy failed for {service_id} on {unode_hostname}: {e}")
            # Re-raise exception - no database state to save
            raise

        logger.info(
            f"Deployment {deployment_id} completed successfully: "
            f"{service_id} on {unode_hostname} (status: {deployment.status})"
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

        # Create deployment target from unode with standardized fields
        from src.models.unode import UNodeType, UNodeRole
        from src.utils.deployment_targets import parse_deployment_target_id

        parsed = parse_deployment_target_id(unode.deployment_target_id)
        is_leader = unode.role == UNodeRole.LEADER

        target = DeployTarget(
            id=unode.deployment_target_id,
            type="k8s" if unode.type == UNodeType.KUBERNETES else "docker",
            name=f"{unode.hostname} ({'Leader' if is_leader else 'Remote'})",
            identifier=unode.hostname,
            environment=parsed["environment"],
            status=unode.status.value if unode.status else "unknown",
            provider="local" if is_leader else "remote",
            region=None,
            is_leader=is_leader,
            namespace=None,
            infrastructure=None,
            raw_metadata=unode.model_dump()
        )

        # Get appropriate deployment platform
        platform = get_deploy_platform(target)

        try:
            success = await platform.stop(target, deployment)

            if success:
                deployment.status = DeploymentStatus.STOPPED
                deployment.stopped_at = datetime.now(timezone.utc)
            else:
                deployment.error = "Stop failed"

        except Exception as e:
            logger.error(f"Stop failed for deployment {deployment_id}: {e}")
            deployment.error = str(e)

        # Stateless: Container state is source of truth, no database update needed
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

        # Stateless: Container state is source of truth, no database update needed
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

            # Create deployment target from unode with standardized fields
            from src.models.unode import UNodeType, UNodeRole
            from src.utils.deployment_targets import parse_deployment_target_id

            parsed = parse_deployment_target_id(unode.deployment_target_id)
            is_leader = unode.role == UNodeRole.LEADER

            target = DeployTarget(
                id=unode.deployment_target_id,
                type="k8s" if unode.type == UNodeType.KUBERNETES else "docker",
                name=f"{unode.hostname} ({'Leader' if is_leader else 'Remote'})",
                identifier=unode.hostname,
                environment=parsed["environment"],
                status=unode.status.value if unode.status else "unknown",
                provider="local" if is_leader else "remote",
                region=None,
                is_leader=is_leader,
                namespace=None,
                infrastructure=None,
                raw_metadata=unode.model_dump()
            )

            # Get appropriate deployment platform
            platform = get_deploy_platform(target)

            try:
                await platform.remove(target, deployment)
            except Exception as e:
                logger.warning(f"Failed to remove deployment on node: {e}")

        # Remove tailscale serve route for local Docker deployments
        if deployment.backend_type == "docker" and _is_local_deployment(deployment.unode_hostname):
            _update_tailscale_serve_route(deployment.service_id, "", 0, add=False)

        # Stateless: Container removed, no database record to delete
        logger.info(f"Removed deployment: {deployment_id}")
        return True

    async def get_deployment(self, deployment_id: str) -> Optional[Deployment]:
        """
        Get a deployment by ID by querying runtime.

        Queries all online unodes until deployment is found.
        """
        from src.models.unode import UNodeType, UNodeRole
        from src.utils.deployment_targets import parse_deployment_target_id

        # Query all online unodes
        cursor = self.unodes_collection.find({"status": "online"})
        async for unode_dict in cursor:
            unode = UNode(**unode_dict)

            # Create deployment target
            parsed = parse_deployment_target_id(unode.deployment_target_id)
            is_leader = unode.role == UNodeRole.LEADER

            target = DeployTarget(
                id=unode.deployment_target_id,
                type="k8s" if unode.type == UNodeType.KUBERNETES else "docker",
                name=f"{unode.hostname} ({'Leader' if is_leader else 'Remote'})",
                identifier=unode.hostname,
                environment=parsed["environment"],
                status=unode.status.value,
                provider="local" if is_leader else "remote",
                region=None,
                is_leader=is_leader,
                namespace=None,
                infrastructure=None,
                raw_metadata=unode.model_dump()
            )

            # Query platform
            platform = get_deploy_platform(target)
            deployment = await platform.get_deployment_by_id(target, deployment_id)

            if deployment:
                return deployment

        return None

    async def list_deployments(
        self,
        service_id: Optional[str] = None,
        unode_hostname: Optional[str] = None
    ) -> List[Deployment]:
        """
        List deployments by querying runtime (Docker/K8s).

        This is stateless - queries container runtime, not database.
        """
        from src.models.unode import UNodeType, UNodeRole
        from src.utils.deployment_targets import parse_deployment_target_id

        all_deployments = []

        # Get all unodes (or specific one if hostname provided)
        query = {}
        if unode_hostname:
            query["hostname"] = unode_hostname

        cursor = self.unodes_collection.find(query)
        async for unode_dict in cursor:
            unode = UNode(**unode_dict)

            # Skip if not online
            if unode.status.value != "online":
                continue

            # Create deployment target
            parsed = parse_deployment_target_id(unode.deployment_target_id)
            is_leader = unode.role == UNodeRole.LEADER

            target = DeployTarget(
                id=unode.deployment_target_id,
                type="k8s" if unode.type == UNodeType.KUBERNETES else "docker",
                name=f"{unode.hostname} ({'Leader' if is_leader else 'Remote'})",
                identifier=unode.hostname,
                environment=parsed["environment"],
                status=unode.status.value,
                provider="local" if is_leader else "remote",
                region=None,
                is_leader=is_leader,
                namespace=None,
                infrastructure=None,
                raw_metadata=unode.model_dump()
            )

            # Query platform for deployments
            platform = get_deploy_platform(target)
            deployments = await platform.list_deployments(target, service_id=service_id)
            all_deployments.extend(deployments)

        return all_deployments

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

        # Create deployment target from unode with standardized fields
        from src.models.unode import UNodeType, UNodeRole
        from src.utils.deployment_targets import parse_deployment_target_id

        parsed = parse_deployment_target_id(unode.deployment_target_id)
        is_leader = unode.role == UNodeRole.LEADER

        target = DeployTarget(
            id=unode.deployment_target_id,
            type="k8s" if unode.type == UNodeType.KUBERNETES else "docker",
            name=f"{unode.hostname} ({'Leader' if is_leader else 'Remote'})",
            identifier=unode.hostname,
            environment=parsed["environment"],
            status=unode.status.value if unode.status else "unknown",
            provider="local" if is_leader else "remote",
            region=None,
            is_leader=is_leader,
            namespace=None,
            infrastructure=None,
            raw_metadata=unode.model_dump()
        )

        # Get appropriate deployment platform
        platform = get_deploy_platform(target)

        try:
            logs = await platform.get_logs(target, deployment, tail)
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
