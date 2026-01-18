"""Hetzner Cloud provider implementation.

Hetzner Cloud offers excellent price/performance ratio, especially for European users.
Popular for self-hosted infrastructure due to competitive pricing and GDPR compliance.

API Documentation: https://docs.hetzner.cloud/
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import aiohttp

from src.services.cloud_providers.base import (
    CloudProvider,
    CloudInstance,
    CloudProviderType,
    CloudRegion,
    InstanceSize,
    InstanceStatus,
)

logger = logging.getLogger(__name__)

# Hetzner API base URL
HETZNER_API_URL = "https://api.hetzner.cloud/v1"

# Default Ubuntu image for U-Node workers
DEFAULT_IMAGE = "ubuntu-22.04"

# Recommended size for U-Node workers (good balance of cost/performance)
RECOMMENDED_SIZE = "cx22"  # 2 vCPU, 4GB RAM, 40GB - ~$5.50/mo


class HetznerProvider(CloudProvider):
    """
    Hetzner Cloud provider implementation.

    Hetzner offers:
    - Excellent pricing (starting at ~$4/month)
    - European datacenters (Germany, Finland) + US (Ashburn, Hillsboro)
    - Simple, clean API
    - Good for GDPR-compliant infrastructure
    """

    def __init__(self, api_key: str, **kwargs):
        """
        Initialize Hetzner provider.

        Args:
            api_key: Hetzner Cloud API token
            **kwargs: Additional config (e.g., default_datacenter)
        """
        super().__init__(api_key, **kwargs)
        self._session: Optional[aiohttp.ClientSession] = None
        self.default_datacenter = kwargs.get("default_datacenter", "nbg1")

    @property
    def provider_type(self) -> CloudProviderType:
        return CloudProviderType.HETZNER

    @property
    def name(self) -> str:
        return "Hetzner Cloud"

    async def _get_session(self) -> aiohttp.ClientSession:
        """Get or create HTTP session."""
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                timeout=aiohttp.ClientTimeout(total=60),
            )
        return self._session

    async def _request(
        self,
        method: str,
        endpoint: str,
        json: Optional[Dict] = None,
        params: Optional[Dict] = None,
    ) -> Dict[str, Any]:
        """Make an API request to Hetzner Cloud."""
        session = await self._get_session()
        url = f"{HETZNER_API_URL}{endpoint}"

        async with session.request(
            method, url, json=json, params=params
        ) as response:
            data = await response.json()

            if response.status >= 400:
                error = data.get("error", {})
                error_msg = error.get("message", "Unknown error")
                error_code = error.get("code", "unknown")
                logger.error(f"Hetzner API error: {error_code} - {error_msg}")
                raise Exception(f"Hetzner API error: {error_msg}")

            return data

    async def close(self):
        """Close HTTP session."""
        if self._session and not self._session.closed:
            await self._session.close()

    # =========================================================================
    # Region & Size Discovery
    # =========================================================================

    async def list_regions(self) -> List[CloudRegion]:
        """List available Hetzner datacenters."""
        data = await self._request("GET", "/datacenters")

        regions = []
        for dc in data.get("datacenters", []):
            location = dc.get("location", {})
            regions.append(
                CloudRegion(
                    id=dc["name"],
                    name=dc["description"],
                    country=location.get("country", ""),
                    available=True,
                    features=dc.get("server_types", {}).get("available", []),
                )
            )

        return regions

    async def list_sizes(self, region: Optional[str] = None) -> List[InstanceSize]:
        """List available server types."""
        data = await self._request("GET", "/server_types")

        sizes = []
        for st in data.get("server_types", []):
            # Get pricing (prefer monthly price in EUR, convert to USD estimate)
            prices = st.get("prices", [])
            hourly = 0.0
            monthly = 0.0

            for price in prices:
                if price.get("location") == (region or self.default_datacenter):
                    hourly = float(price.get("price_hourly", {}).get("gross", 0))
                    monthly = float(price.get("price_monthly", {}).get("gross", 0))
                    break

            # Fall back to first available price
            if not monthly and prices:
                hourly = float(prices[0].get("price_hourly", {}).get("gross", 0))
                monthly = float(prices[0].get("price_monthly", {}).get("gross", 0))

            sizes.append(
                InstanceSize(
                    id=st["name"],
                    name=st["description"],
                    vcpus=st["cores"],
                    memory_mb=st["memory"] * 1024,  # Hetzner reports in GB
                    disk_gb=st["disk"],
                    price_hourly=hourly,
                    price_monthly=monthly,
                    provider=CloudProviderType.HETZNER,
                    metadata={
                        "cpu_type": st.get("cpu_type", "shared"),
                        "storage_type": st.get("storage_type", "local"),
                        "architecture": st.get("architecture", "x86"),
                    },
                )
            )

        # Sort by monthly price
        sizes.sort(key=lambda s: s.price_monthly)
        return sizes

    async def get_recommended_size(self) -> InstanceSize:
        """Get recommended size for U-Node workers."""
        sizes = await self.list_sizes()

        # Look for the recommended size
        for size in sizes:
            if size.id == RECOMMENDED_SIZE:
                return size

        # Fall back to smallest with at least 1 vCPU and 1GB RAM
        for size in sizes:
            if size.vcpus >= 1 and size.memory_mb >= 1024:
                return size

        # Last resort: first available
        if sizes:
            return sizes[0]

        raise Exception("No suitable instance sizes available")

    # =========================================================================
    # SSH Key Management
    # =========================================================================

    async def list_ssh_keys(self) -> List[Dict[str, Any]]:
        """List SSH keys."""
        data = await self._request("GET", "/ssh_keys")
        return [
            {
                "id": str(key["id"]),
                "name": key["name"],
                "fingerprint": key["fingerprint"],
                "public_key": key["public_key"],
            }
            for key in data.get("ssh_keys", [])
        ]

    async def create_ssh_key(self, name: str, public_key: str) -> Dict[str, Any]:
        """Create an SSH key."""
        data = await self._request(
            "POST",
            "/ssh_keys",
            json={"name": name, "public_key": public_key},
        )
        key = data["ssh_key"]
        return {
            "id": str(key["id"]),
            "name": key["name"],
            "fingerprint": key["fingerprint"],
        }

    async def delete_ssh_key(self, key_id: str) -> bool:
        """Delete an SSH key."""
        try:
            await self._request("DELETE", f"/ssh_keys/{key_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to delete SSH key {key_id}: {e}")
            return False

    # =========================================================================
    # Instance Lifecycle
    # =========================================================================

    def _parse_instance(self, server: Dict[str, Any]) -> CloudInstance:
        """Parse Hetzner server response into CloudInstance."""
        # Map Hetzner status to our status
        status_map = {
            "initializing": InstanceStatus.INITIALIZING,
            "starting": InstanceStatus.PENDING,
            "running": InstanceStatus.RUNNING,
            "stopping": InstanceStatus.STOPPING,
            "off": InstanceStatus.STOPPED,
            "deleting": InstanceStatus.DELETING,
            "migrating": InstanceStatus.PENDING,
            "rebuilding": InstanceStatus.INITIALIZING,
            "unknown": InstanceStatus.ERROR,
        }

        status = status_map.get(server.get("status", "unknown"), InstanceStatus.ERROR)

        # Get IPs
        public_net = server.get("public_net", {})
        ipv4 = public_net.get("ipv4", {}).get("ip")
        ipv6 = public_net.get("ipv6", {}).get("ip")

        # Get private IP if available
        private_ip = None
        private_nets = server.get("private_net", [])
        if private_nets:
            private_ip = private_nets[0].get("ip")

        # Parse created timestamp
        created_at = None
        if server.get("created"):
            try:
                created_at = datetime.fromisoformat(
                    server["created"].replace("Z", "+00:00")
                )
            except (ValueError, TypeError):
                pass

        # Get pricing
        server_type = server.get("server_type", {})
        hourly_cost = 0.0
        monthly_cost = 0.0
        prices = server_type.get("prices", [])
        if prices:
            hourly_cost = float(prices[0].get("price_hourly", {}).get("gross", 0))
            monthly_cost = float(prices[0].get("price_monthly", {}).get("gross", 0))

        return CloudInstance(
            id=str(server["id"]),
            name=server["name"],
            provider=CloudProviderType.HETZNER,
            region=server.get("datacenter", {}).get("name", "unknown"),
            size=server_type.get("name", "unknown"),
            status=status,
            public_ipv4=ipv4,
            public_ipv6=ipv6,
            private_ip=private_ip,
            created_at=created_at,
            hourly_cost=hourly_cost,
            estimated_monthly=monthly_cost,
            metadata={
                "datacenter": server.get("datacenter", {}),
                "image": server.get("image", {}),
                "labels": server.get("labels", {}),
            },
        )

    async def create_instance(
        self,
        name: str,
        region: str,
        size: str,
        ssh_key_ids: List[str],
        user_data: Optional[str] = None,
        labels: Optional[Dict[str, str]] = None,
    ) -> CloudInstance:
        """Create a new Hetzner Cloud server."""
        payload: Dict[str, Any] = {
            "name": name,
            "server_type": size,
            "datacenter": region,
            "image": DEFAULT_IMAGE,
            "ssh_keys": [int(k) for k in ssh_key_ids] if ssh_key_ids else [],
            "start_after_create": True,
        }

        if user_data:
            payload["user_data"] = user_data

        if labels:
            # Add ushadow identifier
            payload["labels"] = {**labels, "ushadow": "unode"}
        else:
            payload["labels"] = {"ushadow": "unode"}

        data = await self._request("POST", "/servers", json=payload)

        server = data["server"]
        instance = self._parse_instance(server)

        # Log root password if provided (only available right after creation)
        if "root_password" in data:
            logger.info(f"Created {name} - root password available in response")
            instance.metadata["root_password"] = data["root_password"]

        logger.info(f"Created Hetzner instance: {name} ({instance.id})")
        return instance

    async def get_instance(self, instance_id: str) -> Optional[CloudInstance]:
        """Get instance details."""
        try:
            data = await self._request("GET", f"/servers/{instance_id}")
            return self._parse_instance(data["server"])
        except Exception as e:
            logger.error(f"Failed to get instance {instance_id}: {e}")
            return None

    async def list_instances(
        self,
        label_selector: Optional[Dict[str, str]] = None,
    ) -> List[CloudInstance]:
        """List all instances."""
        params = {}

        # Hetzner supports label_selector as comma-separated key=value pairs
        if label_selector:
            selector = ",".join(f"{k}={v}" for k, v in label_selector.items())
            params["label_selector"] = selector

        data = await self._request("GET", "/servers", params=params or None)

        return [self._parse_instance(s) for s in data.get("servers", [])]

    async def delete_instance(self, instance_id: str) -> bool:
        """Delete an instance."""
        try:
            await self._request("DELETE", f"/servers/{instance_id}")
            logger.info(f"Deleted Hetzner instance: {instance_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to delete instance {instance_id}: {e}")
            return False

    async def start_instance(self, instance_id: str) -> bool:
        """Power on an instance."""
        try:
            await self._request("POST", f"/servers/{instance_id}/actions/poweron")
            return True
        except Exception as e:
            logger.error(f"Failed to start instance {instance_id}: {e}")
            return False

    async def stop_instance(self, instance_id: str) -> bool:
        """Power off an instance."""
        try:
            await self._request("POST", f"/servers/{instance_id}/actions/poweroff")
            return True
        except Exception as e:
            logger.error(f"Failed to stop instance {instance_id}: {e}")
            return False

    async def reboot_instance(self, instance_id: str) -> bool:
        """Reboot an instance."""
        try:
            await self._request("POST", f"/servers/{instance_id}/actions/reboot")
            return True
        except Exception as e:
            logger.error(f"Failed to reboot instance {instance_id}: {e}")
            return False

    # =========================================================================
    # Status & Health
    # =========================================================================

    async def wait_for_ready(
        self,
        instance_id: str,
        timeout_seconds: int = 300,
    ) -> bool:
        """Wait for instance to be running with public IP."""
        start_time = asyncio.get_event_loop().time()

        while True:
            instance = await self.get_instance(instance_id)

            if instance is None:
                logger.warning(f"Instance {instance_id} not found while waiting")
                return False

            if instance.status == InstanceStatus.RUNNING and instance.public_ipv4:
                logger.info(f"Instance {instance_id} is ready: {instance.public_ipv4}")
                return True

            if instance.status == InstanceStatus.ERROR:
                logger.error(f"Instance {instance_id} entered error state")
                return False

            elapsed = asyncio.get_event_loop().time() - start_time
            if elapsed > timeout_seconds:
                logger.error(f"Timeout waiting for instance {instance_id}")
                return False

            await asyncio.sleep(5)
