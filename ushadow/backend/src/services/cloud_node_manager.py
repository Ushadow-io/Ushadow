"""Cloud Node Manager - Orchestrates cloud instance provisioning and U-Node integration.

This manager bridges cloud providers with the Ushadow U-Node system:
1. Provisions cloud instances with auto-bootstrap user data
2. Tracks instances and their costs
3. Integrates with Tailscale for secure networking
4. Links cloud instances to U-Nodes once they join
"""

import asyncio
import logging
import secrets
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from motor.motor_asyncio import AsyncIOMotorDatabase

from src.services.cloud_providers import (
    CloudProvider,
    CloudProviderType,
    CloudInstance,
    InstanceStatus,
    HetznerProvider,
    DigitalOceanProvider,
)

logger = logging.getLogger(__name__)

# Default SSH key name for Ushadow
USHADOW_SSH_KEY_NAME = "ushadow-cloud-key"


class CloudNodeManager:
    """
    Manages cloud-provisioned U-Nodes.

    Responsibilities:
    - Provider credential management
    - Instance lifecycle (provision, start, stop, terminate)
    - Cost tracking and estimation
    - U-Node linkage after Tailscale connection
    - Usage metering for billing
    """

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.cloud_instances_collection = db.cloud_instances
        self.cloud_credentials_collection = db.cloud_credentials
        self.usage_records_collection = db.usage_records
        self._providers: Dict[str, CloudProvider] = {}

    async def initialize(self):
        """Initialize indexes and load saved credentials."""
        await self.cloud_instances_collection.create_index("id", unique=True)
        await self.cloud_instances_collection.create_index("provider")
        await self.cloud_instances_collection.create_index("owner_id")
        await self.cloud_instances_collection.create_index("unode_id")
        await self.cloud_credentials_collection.create_index(
            [("owner_id", 1), ("provider", 1)], unique=True
        )
        await self.usage_records_collection.create_index("instance_id")
        await self.usage_records_collection.create_index("owner_id")
        await self.usage_records_collection.create_index("timestamp")

        logger.info("CloudNodeManager initialized")

    # =========================================================================
    # Provider Management
    # =========================================================================

    def _create_provider(
        self,
        provider_type: CloudProviderType,
        api_key: str,
        **kwargs,
    ) -> CloudProvider:
        """Create a provider instance."""
        if provider_type == CloudProviderType.HETZNER:
            return HetznerProvider(api_key, **kwargs)
        elif provider_type == CloudProviderType.DIGITALOCEAN:
            return DigitalOceanProvider(api_key, **kwargs)
        else:
            raise ValueError(f"Unsupported provider: {provider_type}")

    async def save_credentials(
        self,
        owner_id: str,
        provider: CloudProviderType,
        api_key: str,
        **kwargs,
    ) -> Tuple[bool, str]:
        """
        Save cloud provider credentials.

        Args:
            owner_id: User ID who owns these credentials
            provider: Cloud provider type
            api_key: API key/token
            **kwargs: Additional provider-specific config

        Returns:
            Tuple of (success, message)
        """
        # Validate credentials first
        try:
            temp_provider = self._create_provider(provider, api_key, **kwargs)
            valid = await temp_provider.validate_credentials()
            await temp_provider.close()

            if not valid:
                return False, "Invalid API credentials"

        except Exception as e:
            logger.error(f"Failed to validate credentials: {e}")
            return False, f"Validation failed: {str(e)}"

        # Encrypt and save
        # TODO: Use proper encryption (e.g., Fernet with user-specific key)
        from src.services.unode_manager import UNodeManager
        from src.config.secrets import get_auth_secret_key
        import hashlib
        import base64
        from cryptography.fernet import Fernet

        secret = get_auth_secret_key()
        key = hashlib.sha256(secret.encode()).digest()
        fernet_key = base64.urlsafe_b64encode(key)
        fernet = Fernet(fernet_key)
        encrypted_key = fernet.encrypt(api_key.encode()).decode()

        await self.cloud_credentials_collection.update_one(
            {"owner_id": owner_id, "provider": provider.value},
            {
                "$set": {
                    "api_key_encrypted": encrypted_key,
                    "config": kwargs,
                    "updated_at": datetime.now(timezone.utc),
                }
            },
            upsert=True,
        )

        logger.info(f"Saved {provider.value} credentials for user {owner_id}")
        return True, "Credentials saved successfully"

    async def get_provider(
        self,
        owner_id: str,
        provider_type: CloudProviderType,
    ) -> Optional[CloudProvider]:
        """Get a configured provider instance for a user."""
        cache_key = f"{owner_id}:{provider_type.value}"

        if cache_key in self._providers:
            return self._providers[cache_key]

        # Load credentials
        creds = await self.cloud_credentials_collection.find_one({
            "owner_id": owner_id,
            "provider": provider_type.value,
        })

        if not creds:
            return None

        # Decrypt API key
        from src.config.secrets import get_auth_secret_key
        import hashlib
        import base64
        from cryptography.fernet import Fernet

        secret = get_auth_secret_key()
        key = hashlib.sha256(secret.encode()).digest()
        fernet_key = base64.urlsafe_b64encode(key)
        fernet = Fernet(fernet_key)

        try:
            api_key = fernet.decrypt(creds["api_key_encrypted"].encode()).decode()
        except Exception as e:
            logger.error(f"Failed to decrypt credentials: {e}")
            return None

        provider = self._create_provider(
            provider_type,
            api_key,
            **creds.get("config", {}),
        )

        self._providers[cache_key] = provider
        return provider

    async def list_configured_providers(
        self,
        owner_id: str,
    ) -> List[Dict[str, Any]]:
        """List all providers configured for a user."""
        cursor = self.cloud_credentials_collection.find({"owner_id": owner_id})
        providers = []

        async for cred in cursor:
            providers.append({
                "provider": cred["provider"],
                "configured_at": cred.get("updated_at"),
            })

        return providers

    async def remove_credentials(
        self,
        owner_id: str,
        provider: CloudProviderType,
    ) -> bool:
        """Remove saved credentials for a provider."""
        result = await self.cloud_credentials_collection.delete_one({
            "owner_id": owner_id,
            "provider": provider.value,
        })

        # Clear from cache
        cache_key = f"{owner_id}:{provider.value}"
        if cache_key in self._providers:
            await self._providers[cache_key].close()
            del self._providers[cache_key]

        return result.deleted_count > 0

    # =========================================================================
    # Instance Provisioning
    # =========================================================================

    async def provision_node(
        self,
        owner_id: str,
        provider_type: CloudProviderType,
        name: Optional[str] = None,
        region: Optional[str] = None,
        size: Optional[str] = None,
        tailscale_auth_key: Optional[str] = None,
    ) -> Tuple[bool, Optional[CloudInstance], str]:
        """
        Provision a new cloud U-Node.

        This creates a cloud instance with:
        - Docker pre-installed
        - Tailscale connected (using auth key or manual login)
        - U-Node manager running

        Args:
            owner_id: User provisioning this node
            provider_type: Cloud provider to use
            name: Instance name (auto-generated if not provided)
            region: Region to deploy in (uses provider default if not specified)
            size: Instance size (uses recommended if not specified)
            tailscale_auth_key: Pre-auth key for automatic Tailscale connection

        Returns:
            Tuple of (success, instance, message)
        """
        provider = await self.get_provider(owner_id, provider_type)
        if not provider:
            return False, None, f"No credentials configured for {provider_type.value}"

        try:
            # Generate name if not provided
            if not name:
                suffix = secrets.token_hex(4)
                name = f"ushadow-unode-{suffix}"

            # Get region and size
            if not region:
                regions = await provider.list_regions()
                region = regions[0].id if regions else "default"

            if not size:
                recommended = await provider.get_recommended_size()
                size = recommended.id

            # Get or create SSH key
            ssh_keys = await provider.list_ssh_keys()
            ushadow_key = next(
                (k for k in ssh_keys if k["name"] == USHADOW_SSH_KEY_NAME),
                None,
            )

            ssh_key_ids = []
            if ushadow_key:
                ssh_key_ids = [ushadow_key["id"]]
            # If no SSH key, the instance will be accessible via Tailscale only

            # Generate join URL
            # This requires an active join token - we'll create one
            from src.services.unode_manager import get_unode_manager
            from src.models.unode import JoinTokenCreate, UNodeRole

            unode_manager = await get_unode_manager()
            token_response = await unode_manager.create_join_token(
                user_id=owner_id,
                request=JoinTokenCreate(
                    expires_in_hours=24,  # 24 hour validity
                    max_uses=1,           # Single use for this instance
                    role=UNodeRole.WORKER,
                ),
            )

            join_url = token_response.join_script_url

            # Generate user data for bootstrap
            user_data = provider.generate_unode_user_data(
                join_url=join_url,
                tailscale_auth_key=tailscale_auth_key,
            )

            # Create instance
            instance = await provider.create_instance(
                name=name,
                region=region,
                size=size,
                ssh_key_ids=ssh_key_ids,
                user_data=user_data,
                labels={"owner": owner_id[:16]},  # Truncate for label limits
            )

            # Set owner
            instance.owner_id = owner_id

            # Save to database
            await self.cloud_instances_collection.insert_one(instance.to_dict())

            # Start usage tracking
            await self._record_usage_event(
                instance_id=instance.id,
                owner_id=owner_id,
                event_type="provision",
                hourly_rate=instance.hourly_cost,
            )

            logger.info(
                f"Provisioned cloud node: {name} ({provider_type.value}) "
                f"in {region} for user {owner_id}"
            )

            return True, instance, f"Instance {name} provisioning started"

        except Exception as e:
            logger.error(f"Failed to provision cloud node: {e}")
            return False, None, str(e)

    async def get_instance(
        self,
        instance_id: str,
        owner_id: Optional[str] = None,
    ) -> Optional[CloudInstance]:
        """Get a cloud instance by ID."""
        query = {"id": instance_id}
        if owner_id:
            query["owner_id"] = owner_id

        doc = await self.cloud_instances_collection.find_one(query)
        if doc:
            return CloudInstance.from_dict(doc)
        return None

    async def list_instances(
        self,
        owner_id: Optional[str] = None,
        provider: Optional[CloudProviderType] = None,
    ) -> List[CloudInstance]:
        """List cloud instances with optional filters."""
        query = {}
        if owner_id:
            query["owner_id"] = owner_id
        if provider:
            query["provider"] = provider.value

        instances = []
        async for doc in self.cloud_instances_collection.find(query):
            instances.append(CloudInstance.from_dict(doc))

        return instances

    async def refresh_instance_status(
        self,
        instance_id: str,
        owner_id: str,
    ) -> Optional[CloudInstance]:
        """Refresh instance status from the cloud provider."""
        instance = await self.get_instance(instance_id, owner_id)
        if not instance:
            return None

        provider = await self.get_provider(owner_id, instance.provider)
        if not provider:
            return instance

        try:
            updated = await provider.get_instance(instance_id)
            if updated:
                # Preserve our metadata
                updated.owner_id = instance.owner_id
                updated.unode_id = instance.unode_id
                updated.tailscale_ip = instance.tailscale_ip

                # Update in database
                await self.cloud_instances_collection.update_one(
                    {"id": instance_id},
                    {"$set": updated.to_dict()},
                )
                return updated

        except Exception as e:
            logger.error(f"Failed to refresh instance {instance_id}: {e}")

        return instance

    async def terminate_instance(
        self,
        instance_id: str,
        owner_id: str,
    ) -> Tuple[bool, str]:
        """
        Terminate a cloud instance.

        Also removes the linked U-Node if one exists.
        """
        instance = await self.get_instance(instance_id, owner_id)
        if not instance:
            return False, "Instance not found"

        provider = await self.get_provider(owner_id, instance.provider)
        if not provider:
            return False, "Provider not configured"

        try:
            # Delete from provider
            success = await provider.delete_instance(instance_id)
            if not success:
                return False, "Failed to delete instance from provider"

            # Remove linked U-Node if exists
            if instance.unode_id:
                from src.services.unode_manager import get_unode_manager
                unode_manager = await get_unode_manager()
                await unode_manager.remove_unode(instance.unode_id)

            # Update status in database
            await self.cloud_instances_collection.update_one(
                {"id": instance_id},
                {"$set": {"status": InstanceStatus.DELETED.value}},
            )

            # Record termination
            await self._record_usage_event(
                instance_id=instance_id,
                owner_id=owner_id,
                event_type="terminate",
                hourly_rate=0,
            )

            logger.info(f"Terminated cloud instance: {instance_id}")
            return True, "Instance terminated"

        except Exception as e:
            logger.error(f"Failed to terminate instance {instance_id}: {e}")
            return False, str(e)

    async def start_instance(
        self,
        instance_id: str,
        owner_id: str,
    ) -> Tuple[bool, str]:
        """Start a stopped cloud instance."""
        instance = await self.get_instance(instance_id, owner_id)
        if not instance:
            return False, "Instance not found"

        provider = await self.get_provider(owner_id, instance.provider)
        if not provider:
            return False, "Provider not configured"

        try:
            success = await provider.start_instance(instance_id)
            if success:
                await self.cloud_instances_collection.update_one(
                    {"id": instance_id},
                    {"$set": {"status": InstanceStatus.PENDING.value}},
                )

                await self._record_usage_event(
                    instance_id=instance_id,
                    owner_id=owner_id,
                    event_type="start",
                    hourly_rate=instance.hourly_cost,
                )

                return True, "Instance starting"

            return False, "Failed to start instance"

        except Exception as e:
            logger.error(f"Failed to start instance {instance_id}: {e}")
            return False, str(e)

    async def stop_instance(
        self,
        instance_id: str,
        owner_id: str,
    ) -> Tuple[bool, str]:
        """Stop a running cloud instance."""
        instance = await self.get_instance(instance_id, owner_id)
        if not instance:
            return False, "Instance not found"

        provider = await self.get_provider(owner_id, instance.provider)
        if not provider:
            return False, "Provider not configured"

        try:
            success = await provider.stop_instance(instance_id)
            if success:
                await self.cloud_instances_collection.update_one(
                    {"id": instance_id},
                    {"$set": {"status": InstanceStatus.STOPPING.value}},
                )

                await self._record_usage_event(
                    instance_id=instance_id,
                    owner_id=owner_id,
                    event_type="stop",
                    hourly_rate=0,
                )

                return True, "Instance stopping"

            return False, "Failed to stop instance"

        except Exception as e:
            logger.error(f"Failed to stop instance {instance_id}: {e}")
            return False, str(e)

    # =========================================================================
    # U-Node Linkage
    # =========================================================================

    async def link_unode(
        self,
        instance_id: str,
        unode_id: str,
        tailscale_ip: str,
    ) -> bool:
        """
        Link a cloud instance to a U-Node after it joins.

        Called when a U-Node registers and we detect it's from a cloud instance.
        """
        result = await self.cloud_instances_collection.update_one(
            {"id": instance_id},
            {
                "$set": {
                    "unode_id": unode_id,
                    "tailscale_ip": tailscale_ip,
                    "status": InstanceStatus.RUNNING.value,
                }
            },
        )

        if result.modified_count > 0:
            logger.info(f"Linked cloud instance {instance_id} to U-Node {unode_id}")
            return True

        return False

    async def find_instance_by_ip(
        self,
        public_ip: str,
    ) -> Optional[CloudInstance]:
        """Find a cloud instance by its public IP."""
        doc = await self.cloud_instances_collection.find_one({
            "$or": [
                {"public_ipv4": public_ip},
                {"public_ipv6": public_ip},
            ]
        })

        if doc:
            return CloudInstance.from_dict(doc)
        return None

    # =========================================================================
    # Usage & Billing
    # =========================================================================

    async def _record_usage_event(
        self,
        instance_id: str,
        owner_id: str,
        event_type: str,
        hourly_rate: float,
    ):
        """Record a usage event for billing."""
        await self.usage_records_collection.insert_one({
            "instance_id": instance_id,
            "owner_id": owner_id,
            "event_type": event_type,
            "hourly_rate": hourly_rate,
            "timestamp": datetime.now(timezone.utc),
        })

    async def get_usage_summary(
        self,
        owner_id: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        """
        Get usage summary for billing.

        Returns estimated costs based on instance running time.
        """
        query: Dict[str, Any] = {"owner_id": owner_id}

        if start_date or end_date:
            query["timestamp"] = {}
            if start_date:
                query["timestamp"]["$gte"] = start_date
            if end_date:
                query["timestamp"]["$lte"] = end_date

        # Get all usage events
        events = []
        async for doc in self.usage_records_collection.find(query).sort("timestamp", 1):
            events.append(doc)

        # Calculate running time per instance
        instance_usage: Dict[str, Dict] = {}

        for event in events:
            inst_id = event["instance_id"]
            if inst_id not in instance_usage:
                instance_usage[inst_id] = {
                    "total_hours": 0.0,
                    "hourly_rate": 0.0,
                    "events": [],
                }

            instance_usage[inst_id]["events"].append(event)

            if event["event_type"] in ("provision", "start"):
                instance_usage[inst_id]["hourly_rate"] = event["hourly_rate"]
                instance_usage[inst_id]["last_start"] = event["timestamp"]
            elif event["event_type"] in ("stop", "terminate"):
                if "last_start" in instance_usage[inst_id]:
                    start = instance_usage[inst_id]["last_start"]
                    end = event["timestamp"]
                    hours = (end - start).total_seconds() / 3600
                    instance_usage[inst_id]["total_hours"] += hours
                    del instance_usage[inst_id]["last_start"]

        # Calculate totals
        total_hours = 0.0
        total_cost = 0.0

        for usage in instance_usage.values():
            # If still running, calculate time until now
            if "last_start" in usage:
                start = usage["last_start"]
                now = datetime.now(timezone.utc)
                hours = (now - start).total_seconds() / 3600
                usage["total_hours"] += hours

            total_hours += usage["total_hours"]
            total_cost += usage["total_hours"] * usage["hourly_rate"]

        return {
            "total_hours": round(total_hours, 2),
            "total_cost": round(total_cost, 2),
            "instances": len(instance_usage),
            "by_instance": {
                k: {
                    "hours": round(v["total_hours"], 2),
                    "cost": round(v["total_hours"] * v["hourly_rate"], 2),
                }
                for k, v in instance_usage.items()
            },
        }

    async def estimate_monthly_cost(
        self,
        owner_id: str,
    ) -> float:
        """Estimate monthly cost for currently running instances."""
        instances = await self.list_instances(owner_id=owner_id)

        total = 0.0
        for instance in instances:
            if instance.status == InstanceStatus.RUNNING:
                total += instance.estimated_monthly

        return round(total, 2)


# Global instance
_cloud_node_manager: Optional[CloudNodeManager] = None


async def get_cloud_node_manager() -> CloudNodeManager:
    """Get the global CloudNodeManager instance."""
    global _cloud_node_manager
    if _cloud_node_manager is None:
        raise RuntimeError("CloudNodeManager not initialized")
    return _cloud_node_manager


async def init_cloud_node_manager(db: AsyncIOMotorDatabase) -> CloudNodeManager:
    """Initialize the global CloudNodeManager."""
    global _cloud_node_manager
    _cloud_node_manager = CloudNodeManager(db)
    await _cloud_node_manager.initialize()
    return _cloud_node_manager
