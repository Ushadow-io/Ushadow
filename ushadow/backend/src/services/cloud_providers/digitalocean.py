"""DigitalOcean provider implementation.

DigitalOcean is developer-friendly with simple API and good documentation.
Popular for startups and small teams due to simplicity.

API Documentation: https://docs.digitalocean.com/reference/api/
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

# DigitalOcean API base URL
DO_API_URL = "https://api.digitalocean.com/v2"

# Default Ubuntu image for U-Node workers
DEFAULT_IMAGE = "ubuntu-22-04-x64"

# Recommended size for U-Node workers
RECOMMENDED_SIZE = "s-1vcpu-2gb"  # 1 vCPU, 2GB RAM, 50GB - $12/mo


class DigitalOceanProvider(CloudProvider):
    """
    DigitalOcean provider implementation.

    DigitalOcean offers:
    - Simple, developer-friendly API
    - Good documentation
    - Global datacenter coverage
    - App Platform for managed K8s
    """

    def __init__(self, api_key: str, **kwargs):
        """
        Initialize DigitalOcean provider.

        Args:
            api_key: DigitalOcean API token
            **kwargs: Additional config (e.g., default_region)
        """
        super().__init__(api_key, **kwargs)
        self._session: Optional[aiohttp.ClientSession] = None
        self.default_region = kwargs.get("default_region", "nyc1")

    @property
    def provider_type(self) -> CloudProviderType:
        return CloudProviderType.DIGITALOCEAN

    @property
    def name(self) -> str:
        return "DigitalOcean"

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
        """Make an API request to DigitalOcean."""
        session = await self._get_session()
        url = f"{DO_API_URL}{endpoint}"

        async with session.request(
            method, url, json=json, params=params
        ) as response:
            # DELETE requests may return 204 No Content
            if response.status == 204:
                return {}

            data = await response.json()

            if response.status >= 400:
                error_msg = data.get("message", "Unknown error")
                error_id = data.get("id", "unknown")
                logger.error(f"DigitalOcean API error: {error_id} - {error_msg}")
                raise Exception(f"DigitalOcean API error: {error_msg}")

            return data

    async def close(self):
        """Close HTTP session."""
        if self._session and not self._session.closed:
            await self._session.close()

    # =========================================================================
    # Region & Size Discovery
    # =========================================================================

    async def list_regions(self) -> List[CloudRegion]:
        """List available DigitalOcean regions."""
        data = await self._request("GET", "/regions")

        regions = []
        for region in data.get("regions", []):
            # Map slug to country (approximate)
            country_map = {
                "nyc": "US", "sfo": "US", "tor": "CA",
                "ams": "NL", "lon": "GB", "fra": "DE",
                "blr": "IN", "sgp": "SG", "syd": "AU",
            }
            prefix = region["slug"][:3]
            country = country_map.get(prefix, "")

            regions.append(
                CloudRegion(
                    id=region["slug"],
                    name=region["name"],
                    country=country,
                    available=region.get("available", True),
                    features=region.get("features", []),
                )
            )

        return regions

    async def list_sizes(self, region: Optional[str] = None) -> List[InstanceSize]:
        """List available droplet sizes."""
        data = await self._request("GET", "/sizes")

        sizes = []
        for size in data.get("sizes", []):
            # Filter by region if specified
            if region and region not in size.get("regions", []):
                continue

            sizes.append(
                InstanceSize(
                    id=size["slug"],
                    name=size.get("description", size["slug"]),
                    vcpus=size["vcpus"],
                    memory_mb=size["memory"],  # Already in MB
                    disk_gb=size["disk"],
                    price_hourly=float(size.get("price_hourly", 0)),
                    price_monthly=float(size.get("price_monthly", 0)),
                    provider=CloudProviderType.DIGITALOCEAN,
                    metadata={
                        "transfer": size.get("transfer"),
                        "available": size.get("available", True),
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

        if sizes:
            return sizes[0]

        raise Exception("No suitable instance sizes available")

    # =========================================================================
    # SSH Key Management
    # =========================================================================

    async def list_ssh_keys(self) -> List[Dict[str, Any]]:
        """List SSH keys."""
        data = await self._request("GET", "/account/keys")
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
            "/account/keys",
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
            await self._request("DELETE", f"/account/keys/{key_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to delete SSH key {key_id}: {e}")
            return False

    # =========================================================================
    # Instance Lifecycle
    # =========================================================================

    def _parse_instance(self, droplet: Dict[str, Any]) -> CloudInstance:
        """Parse DigitalOcean droplet response into CloudInstance."""
        # Map DO status to our status
        status_map = {
            "new": InstanceStatus.PENDING,
            "active": InstanceStatus.RUNNING,
            "off": InstanceStatus.STOPPED,
            "archive": InstanceStatus.DELETED,
        }

        status = status_map.get(droplet.get("status", ""), InstanceStatus.ERROR)

        # Get IPs from networks
        networks = droplet.get("networks", {})
        public_ipv4 = None
        public_ipv6 = None
        private_ip = None

        for v4 in networks.get("v4", []):
            if v4.get("type") == "public":
                public_ipv4 = v4.get("ip_address")
            elif v4.get("type") == "private":
                private_ip = v4.get("ip_address")

        for v6 in networks.get("v6", []):
            if v6.get("type") == "public":
                public_ipv6 = v6.get("ip_address")

        # Parse created timestamp
        created_at = None
        if droplet.get("created_at"):
            try:
                created_at = datetime.fromisoformat(
                    droplet["created_at"].replace("Z", "+00:00")
                )
            except (ValueError, TypeError):
                pass

        # Get size info
        size = droplet.get("size", {})
        hourly_cost = float(size.get("price_hourly", 0))
        monthly_cost = float(size.get("price_monthly", 0))

        return CloudInstance(
            id=str(droplet["id"]),
            name=droplet["name"],
            provider=CloudProviderType.DIGITALOCEAN,
            region=droplet.get("region", {}).get("slug", "unknown"),
            size=size.get("slug", "unknown"),
            status=status,
            public_ipv4=public_ipv4,
            public_ipv6=public_ipv6,
            private_ip=private_ip,
            created_at=created_at,
            hourly_cost=hourly_cost,
            estimated_monthly=monthly_cost,
            metadata={
                "region": droplet.get("region", {}),
                "image": droplet.get("image", {}),
                "tags": droplet.get("tags", []),
                "vpc_uuid": droplet.get("vpc_uuid"),
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
        """Create a new DigitalOcean droplet."""
        # Convert labels to tags (DO uses tags, not labels)
        tags = ["ushadow", "unode"]
        if labels:
            tags.extend(f"{k}:{v}" for k, v in labels.items())

        payload: Dict[str, Any] = {
            "name": name,
            "region": region,
            "size": size,
            "image": DEFAULT_IMAGE,
            "ssh_keys": [int(k) for k in ssh_key_ids] if ssh_key_ids else [],
            "tags": tags,
            "ipv6": True,
            "monitoring": True,
        }

        if user_data:
            payload["user_data"] = user_data

        data = await self._request("POST", "/droplets", json=payload)

        droplet = data["droplet"]
        instance = self._parse_instance(droplet)

        logger.info(f"Created DigitalOcean droplet: {name} ({instance.id})")
        return instance

    async def get_instance(self, instance_id: str) -> Optional[CloudInstance]:
        """Get droplet details."""
        try:
            data = await self._request("GET", f"/droplets/{instance_id}")
            return self._parse_instance(data["droplet"])
        except Exception as e:
            logger.error(f"Failed to get droplet {instance_id}: {e}")
            return None

    async def list_instances(
        self,
        label_selector: Optional[Dict[str, str]] = None,
    ) -> List[CloudInstance]:
        """List all droplets."""
        params = {}

        # DigitalOcean supports tag_name filter
        if label_selector:
            # Use the first label as tag filter
            for k, v in label_selector.items():
                params["tag_name"] = f"{k}:{v}"
                break
        else:
            # Default to ushadow tag
            params["tag_name"] = "ushadow"

        data = await self._request("GET", "/droplets", params=params or None)

        return [self._parse_instance(d) for d in data.get("droplets", [])]

    async def delete_instance(self, instance_id: str) -> bool:
        """Delete a droplet."""
        try:
            await self._request("DELETE", f"/droplets/{instance_id}")
            logger.info(f"Deleted DigitalOcean droplet: {instance_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to delete droplet {instance_id}: {e}")
            return False

    async def start_instance(self, instance_id: str) -> bool:
        """Power on a droplet."""
        try:
            await self._request(
                "POST",
                f"/droplets/{instance_id}/actions",
                json={"type": "power_on"},
            )
            return True
        except Exception as e:
            logger.error(f"Failed to start droplet {instance_id}: {e}")
            return False

    async def stop_instance(self, instance_id: str) -> bool:
        """Power off a droplet."""
        try:
            await self._request(
                "POST",
                f"/droplets/{instance_id}/actions",
                json={"type": "power_off"},
            )
            return True
        except Exception as e:
            logger.error(f"Failed to stop droplet {instance_id}: {e}")
            return False

    async def reboot_instance(self, instance_id: str) -> bool:
        """Reboot a droplet."""
        try:
            await self._request(
                "POST",
                f"/droplets/{instance_id}/actions",
                json={"type": "reboot"},
            )
            return True
        except Exception as e:
            logger.error(f"Failed to reboot droplet {instance_id}: {e}")
            return False

    # =========================================================================
    # Status & Health
    # =========================================================================

    async def wait_for_ready(
        self,
        instance_id: str,
        timeout_seconds: int = 300,
    ) -> bool:
        """Wait for droplet to be active with public IP."""
        start_time = asyncio.get_event_loop().time()

        while True:
            instance = await self.get_instance(instance_id)

            if instance is None:
                logger.warning(f"Droplet {instance_id} not found while waiting")
                return False

            if instance.status == InstanceStatus.RUNNING and instance.public_ipv4:
                logger.info(f"Droplet {instance_id} is ready: {instance.public_ipv4}")
                return True

            if instance.status == InstanceStatus.ERROR:
                logger.error(f"Droplet {instance_id} entered error state")
                return False

            elapsed = asyncio.get_event_loop().time() - start_time
            if elapsed > timeout_seconds:
                logger.error(f"Timeout waiting for droplet {instance_id}")
                return False

            await asyncio.sleep(5)
