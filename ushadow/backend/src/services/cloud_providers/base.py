"""Abstract base class for cloud provider integrations."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional


class CloudProviderType(str, Enum):
    """Supported cloud providers."""
    HETZNER = "hetzner"
    DIGITALOCEAN = "digitalocean"
    VULTR = "vultr"
    LINODE = "linode"
    FLY = "fly"


class InstanceStatus(str, Enum):
    """Cloud instance status."""
    PENDING = "pending"          # Being created
    INITIALIZING = "initializing"  # Created, installing software
    RUNNING = "running"          # Ready and running
    STOPPING = "stopping"        # Shutting down
    STOPPED = "stopped"          # Powered off
    DELETING = "deleting"        # Being deleted
    DELETED = "deleted"          # Removed
    ERROR = "error"              # Error state


@dataclass
class InstanceSize:
    """Represents a cloud instance size/type."""
    id: str                      # Provider-specific ID (e.g., "cx11", "s-1vcpu-1gb")
    name: str                    # Human-readable name
    vcpus: int                   # Number of vCPUs
    memory_mb: int               # RAM in MB
    disk_gb: int                 # Disk size in GB
    price_hourly: float          # Price per hour in USD
    price_monthly: float         # Price per month in USD
    provider: CloudProviderType
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class CloudRegion:
    """Represents a cloud provider region/datacenter."""
    id: str                      # Provider-specific ID (e.g., "nbg1", "nyc1")
    name: str                    # Human-readable name (e.g., "Nuremberg 1", "New York 1")
    country: str                 # Country code (e.g., "DE", "US")
    available: bool = True       # Whether region is available
    features: List[str] = field(default_factory=list)  # Available features


@dataclass
class CloudInstance:
    """Represents a cloud instance (VM)."""
    id: str                      # Provider-specific instance ID
    name: str                    # Instance name/hostname
    provider: CloudProviderType
    region: str                  # Region ID
    size: str                    # Size/type ID
    status: InstanceStatus

    # Networking
    public_ipv4: Optional[str] = None
    public_ipv6: Optional[str] = None
    private_ip: Optional[str] = None
    tailscale_ip: Optional[str] = None  # Set after Tailscale connects

    # Metadata
    created_at: Optional[datetime] = None
    unode_id: Optional[str] = None       # Linked U-Node ID after joining
    owner_id: Optional[str] = None       # User who owns this instance

    # Cost tracking
    hourly_cost: float = 0.0
    estimated_monthly: float = 0.0

    # Provider-specific data
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for storage."""
        return {
            "id": self.id,
            "name": self.name,
            "provider": self.provider.value,
            "region": self.region,
            "size": self.size,
            "status": self.status.value,
            "public_ipv4": self.public_ipv4,
            "public_ipv6": self.public_ipv6,
            "private_ip": self.private_ip,
            "tailscale_ip": self.tailscale_ip,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "unode_id": self.unode_id,
            "owner_id": self.owner_id,
            "hourly_cost": self.hourly_cost,
            "estimated_monthly": self.estimated_monthly,
            "metadata": self.metadata,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "CloudInstance":
        """Create from dictionary."""
        return cls(
            id=data["id"],
            name=data["name"],
            provider=CloudProviderType(data["provider"]),
            region=data["region"],
            size=data["size"],
            status=InstanceStatus(data["status"]),
            public_ipv4=data.get("public_ipv4"),
            public_ipv6=data.get("public_ipv6"),
            private_ip=data.get("private_ip"),
            tailscale_ip=data.get("tailscale_ip"),
            created_at=datetime.fromisoformat(data["created_at"]) if data.get("created_at") else None,
            unode_id=data.get("unode_id"),
            owner_id=data.get("owner_id"),
            hourly_cost=data.get("hourly_cost", 0.0),
            estimated_monthly=data.get("estimated_monthly", 0.0),
            metadata=data.get("metadata", {}),
        )


class CloudProvider(ABC):
    """
    Abstract base class for cloud provider integrations.

    Each provider implementation handles:
    - API authentication
    - Instance lifecycle (create, start, stop, delete)
    - Region and size discovery
    - SSH key management
    - User data scripts for bootstrap
    """

    def __init__(self, api_key: str, **kwargs):
        """
        Initialize the provider with API credentials.

        Args:
            api_key: API key/token for the cloud provider
            **kwargs: Provider-specific configuration
        """
        self.api_key = api_key
        self._config = kwargs

    @property
    @abstractmethod
    def provider_type(self) -> CloudProviderType:
        """Return the provider type."""
        pass

    @property
    @abstractmethod
    def name(self) -> str:
        """Human-readable provider name."""
        pass

    # =========================================================================
    # Region & Size Discovery
    # =========================================================================

    @abstractmethod
    async def list_regions(self) -> List[CloudRegion]:
        """List available regions/datacenters."""
        pass

    @abstractmethod
    async def list_sizes(self, region: Optional[str] = None) -> List[InstanceSize]:
        """
        List available instance sizes.

        Args:
            region: Optional region to filter sizes by availability

        Returns:
            List of available instance sizes
        """
        pass

    @abstractmethod
    async def get_recommended_size(self) -> InstanceSize:
        """
        Get the recommended size for U-Node workers.

        Should return a cost-effective size suitable for running
        Docker containers (at least 1 vCPU, 1GB RAM, 20GB disk).
        """
        pass

    # =========================================================================
    # SSH Key Management
    # =========================================================================

    @abstractmethod
    async def list_ssh_keys(self) -> List[Dict[str, Any]]:
        """List SSH keys registered with the provider."""
        pass

    @abstractmethod
    async def create_ssh_key(self, name: str, public_key: str) -> Dict[str, Any]:
        """
        Register an SSH key with the provider.

        Args:
            name: Key name/label
            public_key: Public key content (OpenSSH format)

        Returns:
            Key info including provider-specific ID
        """
        pass

    @abstractmethod
    async def delete_ssh_key(self, key_id: str) -> bool:
        """Delete an SSH key from the provider."""
        pass

    # =========================================================================
    # Instance Lifecycle
    # =========================================================================

    @abstractmethod
    async def create_instance(
        self,
        name: str,
        region: str,
        size: str,
        ssh_key_ids: List[str],
        user_data: Optional[str] = None,
        labels: Optional[Dict[str, str]] = None,
    ) -> CloudInstance:
        """
        Create a new cloud instance.

        Args:
            name: Instance hostname
            region: Region ID
            size: Instance size ID
            ssh_key_ids: List of SSH key IDs to add
            user_data: Cloud-init user data script
            labels: Instance labels/tags

        Returns:
            Created CloudInstance (status will be PENDING)
        """
        pass

    @abstractmethod
    async def get_instance(self, instance_id: str) -> Optional[CloudInstance]:
        """Get instance details by ID."""
        pass

    @abstractmethod
    async def list_instances(
        self,
        label_selector: Optional[Dict[str, str]] = None
    ) -> List[CloudInstance]:
        """
        List all instances, optionally filtered by labels.

        Args:
            label_selector: Filter by labels (e.g., {"ushadow": "unode"})
        """
        pass

    @abstractmethod
    async def delete_instance(self, instance_id: str) -> bool:
        """
        Delete/destroy an instance.

        Args:
            instance_id: Instance ID to delete

        Returns:
            True if deletion initiated successfully
        """
        pass

    @abstractmethod
    async def start_instance(self, instance_id: str) -> bool:
        """Power on a stopped instance."""
        pass

    @abstractmethod
    async def stop_instance(self, instance_id: str) -> bool:
        """Power off a running instance."""
        pass

    @abstractmethod
    async def reboot_instance(self, instance_id: str) -> bool:
        """Reboot an instance."""
        pass

    # =========================================================================
    # Status & Health
    # =========================================================================

    @abstractmethod
    async def wait_for_ready(
        self,
        instance_id: str,
        timeout_seconds: int = 300
    ) -> bool:
        """
        Wait for an instance to become ready (running with IP).

        Args:
            instance_id: Instance to wait for
            timeout_seconds: Maximum wait time

        Returns:
            True if instance became ready, False if timeout
        """
        pass

    async def validate_credentials(self) -> bool:
        """
        Validate that the API credentials are valid.

        Returns:
            True if credentials are valid
        """
        try:
            # Try listing regions as a simple API test
            await self.list_regions()
            return True
        except Exception:
            return False

    # =========================================================================
    # User Data Generation
    # =========================================================================

    def generate_unode_user_data(
        self,
        join_url: str,
        tailscale_auth_key: Optional[str] = None,
    ) -> str:
        """
        Generate cloud-init user data for U-Node bootstrap.

        This creates a script that:
        1. Installs Docker
        2. Installs and connects Tailscale
        3. Joins the Ushadow cluster

        Args:
            join_url: Full URL for U-Node join script
            tailscale_auth_key: Pre-auth key for automatic Tailscale connection

        Returns:
            Cloud-init compatible user data script
        """
        tailscale_up_cmd = "tailscale up"
        if tailscale_auth_key:
            tailscale_up_cmd = f"tailscale up --authkey={tailscale_auth_key}"

        return f'''#!/bin/bash
# Ushadow U-Node Cloud Bootstrap
# Auto-generated by {self.name} provider

set -e

echo "=== Ushadow U-Node Bootstrap ==="

# Update system
apt-get update -qq

# Install Docker
echo "[1/4] Installing Docker..."
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker

# Install Tailscale
echo "[2/4] Installing Tailscale..."
curl -fsSL https://tailscale.com/install.sh | sh

# Connect to Tailscale
echo "[3/4] Connecting to Tailscale..."
{tailscale_up_cmd}

# Wait for Tailscale to be ready
sleep 5

# Join cluster
echo "[4/4] Joining Ushadow cluster..."
curl -sL "{join_url}" | bash

echo "=== Bootstrap complete ==="
'''

    # =========================================================================
    # Cost Estimation
    # =========================================================================

    async def estimate_monthly_cost(
        self,
        size: str,
        count: int = 1
    ) -> float:
        """
        Estimate monthly cost for running instances.

        Args:
            size: Instance size ID
            count: Number of instances

        Returns:
            Estimated monthly cost in USD
        """
        sizes = await self.list_sizes()
        for s in sizes:
            if s.id == size:
                return s.price_monthly * count
        return 0.0
