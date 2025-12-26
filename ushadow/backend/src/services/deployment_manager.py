"""Deployment manager for orchestrating services across u-nodes."""

import asyncio
import logging
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
)

logger = logging.getLogger(__name__)

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
        await self.deployments_collection.create_index(
            [("service_id", 1), ("unode_hostname", 1)],
            unique=True
        )
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
        unode_hostname: str
    ) -> Deployment:
        """Deploy a service to a u-node."""
        # Get service definition
        service = await self.get_service(service_id)
        if not service:
            raise ValueError(f"Service not found: {service_id}")

        # Get u-node
        unode = await self.unodes_collection.find_one({"hostname": unode_hostname})
        if not unode:
            raise ValueError(f"U-node not found: {unode_hostname}")

        if unode.get("status") != "online":
            raise ValueError(f"U-node is not online: {unode_hostname}")

        # Check if already deployed
        existing = await self.deployments_collection.find_one({
            "service_id": service_id,
            "unode_hostname": unode_hostname
        })
        if existing and existing.get("status") in [
            DeploymentStatus.RUNNING,
            DeploymentStatus.DEPLOYING
        ]:
            raise ValueError(
                f"Service {service_id} already deployed to {unode_hostname}"
            )

        # Create deployment record
        deployment_id = str(uuid.uuid4())[:8]
        container_name = f"{service.service_id}-{deployment_id}"
        now = datetime.now(timezone.utc)

        deployment = Deployment(
            id=deployment_id,
            service_id=service_id,
            unode_hostname=unode_hostname,
            status=DeploymentStatus.DEPLOYING,
            container_name=container_name,
            created_at=now,
            deployed_config=service.model_dump(),
        )

        # Upsert deployment (replace if exists)
        await self.deployments_collection.replace_one(
            {"service_id": service_id, "unode_hostname": unode_hostname},
            deployment.model_dump(),
            upsert=True
        )

        # Send deploy command to node
        try:
            result = await self._send_deploy_command(unode, service, container_name)

            if result.get("success"):
                deployment.status = DeploymentStatus.RUNNING
                deployment.container_id = result.get("container_id")
                deployment.deployed_at = datetime.now(timezone.utc)
            else:
                deployment.status = DeploymentStatus.FAILED
                deployment.error = result.get("error", "Unknown error")

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

        unode = await self.unodes_collection.find_one({
            "hostname": deployment.unode_hostname
        })
        if not unode:
            raise ValueError(f"U-node not found: {deployment.unode_hostname}")

        try:
            result = await self._send_stop_command(unode, deployment.container_name)

            if result.get("success"):
                deployment.status = DeploymentStatus.STOPPED
                deployment.stopped_at = datetime.now(timezone.utc)
            else:
                deployment.error = result.get("error", "Stop failed")

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
        """Remove a deployment (stop container and delete record)."""
        deployment = await self.get_deployment(deployment_id)
        if not deployment:
            return False

        unode = await self.unodes_collection.find_one({
            "hostname": deployment.unode_hostname
        })

        if unode:
            try:
                await self._send_remove_command(unode, deployment.container_name)
            except Exception as e:
                logger.warning(f"Failed to remove container on node: {e}")

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

        unode = await self.unodes_collection.find_one({
            "hostname": deployment.unode_hostname
        })
        if not unode:
            return None

        try:
            result = await self._send_logs_command(
                unode,
                deployment.container_name,
                tail
            )
            if result.get("success"):
                return result.get("logs", "")
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
        # Secret is stored in node metadata during registration
        return unode.get("metadata", {}).get("unode_secret", "")

    async def _send_deploy_command(
        self,
        unode: Dict[str, Any],
        service: ServiceDefinition,
        container_name: str
    ) -> Dict[str, Any]:
        """Send deploy command to a u-node."""
        session = await self._get_session()
        url = await self._get_node_url(unode)
        secret = await self._get_node_secret(unode)

        payload = {
            "container_name": container_name,
            "image": service.image,
            "ports": service.ports,
            "environment": service.environment,
            "volumes": service.volumes,
            "restart_policy": service.restart_policy,
            "network": service.network,
            "command": service.command,
        }

        headers = {"X-Node-Secret": secret}

        logger.info(f"Deploying {container_name} to {unode.get('hostname')}")

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
