"""Pydantic models for cloud hosting and billing.

These models support:
- Cloud instance tracking
- Usage metering
- Billing and invoicing
- Subscription tiers
"""

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


# =============================================================================
# Enums
# =============================================================================


class CloudProviderType(str, Enum):
    """Supported cloud providers."""
    HETZNER = "hetzner"
    DIGITALOCEAN = "digitalocean"
    VULTR = "vultr"
    LINODE = "linode"
    FLY = "fly"


class InstanceStatus(str, Enum):
    """Cloud instance lifecycle status."""
    PENDING = "pending"
    INITIALIZING = "initializing"
    RUNNING = "running"
    STOPPING = "stopping"
    STOPPED = "stopped"
    DELETING = "deleting"
    DELETED = "deleted"
    ERROR = "error"


class SubscriptionTier(str, Enum):
    """Subscription tiers for cloud hosting."""
    FREE = "free"           # Self-hosted only
    STARTER = "starter"     # 1-2 cloud nodes
    TEAM = "team"           # 5 cloud nodes
    BUSINESS = "business"   # 20 cloud nodes
    ENTERPRISE = "enterprise"  # Unlimited


class UsageEventType(str, Enum):
    """Types of usage events for billing."""
    PROVISION = "provision"
    START = "start"
    STOP = "stop"
    TERMINATE = "terminate"
    DEPLOY = "deploy"  # Service deployment
    TRANSFER = "transfer"  # Data transfer (future)


class InvoiceStatus(str, Enum):
    """Invoice payment status."""
    DRAFT = "draft"
    PENDING = "pending"
    PAID = "paid"
    OVERDUE = "overdue"
    CANCELLED = "cancelled"


# =============================================================================
# Cloud Instance Models
# =============================================================================


class CloudInstanceBase(BaseModel):
    """Base cloud instance information."""
    name: str
    provider: CloudProviderType
    region: str
    size: str


class CloudInstanceCreate(CloudInstanceBase):
    """Request to create a cloud instance."""
    tailscale_auth_key: Optional[str] = None
    labels: Dict[str, str] = Field(default_factory=dict)


class CloudInstance(CloudInstanceBase):
    """Full cloud instance model."""
    id: str
    status: InstanceStatus = InstanceStatus.PENDING

    # Networking
    public_ipv4: Optional[str] = None
    public_ipv6: Optional[str] = None
    private_ip: Optional[str] = None
    tailscale_ip: Optional[str] = None

    # Ownership & Linkage
    owner_id: str
    unode_id: Optional[str] = None

    # Cost tracking
    hourly_cost: float = 0.0
    estimated_monthly: float = 0.0

    # Timestamps
    created_at: datetime
    started_at: Optional[datetime] = None
    stopped_at: Optional[datetime] = None

    # Provider-specific
    metadata: Dict[str, Any] = Field(default_factory=dict)

    class Config:
        from_attributes = True


# =============================================================================
# Usage & Billing Models
# =============================================================================


class UsageEvent(BaseModel):
    """A billable usage event."""
    id: str
    instance_id: str
    owner_id: str
    event_type: UsageEventType
    hourly_rate: float
    timestamp: datetime
    metadata: Dict[str, Any] = Field(default_factory=dict)

    class Config:
        from_attributes = True


class UsageRecord(BaseModel):
    """Aggregated usage for a period."""
    instance_id: str
    owner_id: str
    provider: CloudProviderType

    # Time period
    start_time: datetime
    end_time: datetime

    # Metrics
    running_hours: float
    total_cost: float

    # Rate at time of usage
    hourly_rate: float

    class Config:
        from_attributes = True


class UsageSummary(BaseModel):
    """Usage summary for billing."""
    owner_id: str
    period_start: datetime
    period_end: datetime

    # Totals
    total_hours: float
    total_cost: float
    instance_count: int

    # By provider
    by_provider: Dict[str, Dict[str, float]] = Field(default_factory=dict)

    # By instance
    by_instance: Dict[str, Dict[str, float]] = Field(default_factory=dict)


# =============================================================================
# Subscription Models
# =============================================================================


class SubscriptionLimits(BaseModel):
    """Limits for a subscription tier."""
    max_cloud_nodes: int
    max_deployments: int
    max_storage_gb: float
    included_hours: float
    overage_rate: float  # Cost per hour over included


# Define tier limits
TIER_LIMITS = {
    SubscriptionTier.FREE: SubscriptionLimits(
        max_cloud_nodes=0,
        max_deployments=5,
        max_storage_gb=1.0,
        included_hours=0,
        overage_rate=0,
    ),
    SubscriptionTier.STARTER: SubscriptionLimits(
        max_cloud_nodes=2,
        max_deployments=10,
        max_storage_gb=10.0,
        included_hours=100,
        overage_rate=0.05,
    ),
    SubscriptionTier.TEAM: SubscriptionLimits(
        max_cloud_nodes=5,
        max_deployments=50,
        max_storage_gb=50.0,
        included_hours=500,
        overage_rate=0.04,
    ),
    SubscriptionTier.BUSINESS: SubscriptionLimits(
        max_cloud_nodes=20,
        max_deployments=200,
        max_storage_gb=200.0,
        included_hours=2000,
        overage_rate=0.03,
    ),
    SubscriptionTier.ENTERPRISE: SubscriptionLimits(
        max_cloud_nodes=999999,
        max_deployments=999999,
        max_storage_gb=999999.0,
        included_hours=999999,
        overage_rate=0.02,
    ),
}


class Subscription(BaseModel):
    """User subscription information."""
    id: str
    owner_id: str
    tier: SubscriptionTier
    status: str = "active"

    # Pricing
    monthly_price: float
    currency: str = "USD"

    # Period
    current_period_start: datetime
    current_period_end: datetime

    # Usage this period
    hours_used: float = 0.0
    cost_this_period: float = 0.0

    # Timestamps
    created_at: datetime
    cancelled_at: Optional[datetime] = None

    class Config:
        from_attributes = True

    @property
    def limits(self) -> SubscriptionLimits:
        """Get limits for this subscription tier."""
        return TIER_LIMITS[self.tier]


# =============================================================================
# Invoice Models
# =============================================================================


class InvoiceLineItem(BaseModel):
    """A line item on an invoice."""
    description: str
    quantity: float
    unit_price: float
    total: float
    instance_id: Optional[str] = None


class Invoice(BaseModel):
    """Monthly invoice for cloud usage."""
    id: str
    owner_id: str
    status: InvoiceStatus = InvoiceStatus.DRAFT

    # Period
    period_start: datetime
    period_end: datetime

    # Amounts
    subtotal: float
    tax: float = 0.0
    total: float

    # Currency
    currency: str = "USD"

    # Line items
    line_items: List[InvoiceLineItem] = Field(default_factory=list)

    # Timestamps
    created_at: datetime
    due_date: datetime
    paid_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# =============================================================================
# Pricing Configuration
# =============================================================================


class PricingTier(BaseModel):
    """Pricing configuration for a tier."""
    tier: SubscriptionTier
    name: str
    monthly_price: float
    description: str
    features: List[str]


# Default pricing (can be overridden via config)
DEFAULT_PRICING = [
    PricingTier(
        tier=SubscriptionTier.FREE,
        name="Free",
        monthly_price=0,
        description="Self-hosted deployment",
        features=[
            "Unlimited self-hosted nodes",
            "5 service deployments",
            "Community support",
        ],
    ),
    PricingTier(
        tier=SubscriptionTier.STARTER,
        name="Starter",
        monthly_price=19,
        description="For individuals and small projects",
        features=[
            "2 cloud U-Nodes",
            "100 included hours/month",
            "10 service deployments",
            "Email support",
        ],
    ),
    PricingTier(
        tier=SubscriptionTier.TEAM,
        name="Team",
        monthly_price=79,
        description="For growing teams",
        features=[
            "5 cloud U-Nodes",
            "500 included hours/month",
            "50 service deployments",
            "Priority support",
            "Team management",
        ],
    ),
    PricingTier(
        tier=SubscriptionTier.BUSINESS,
        name="Business",
        monthly_price=249,
        description="For scaling businesses",
        features=[
            "20 cloud U-Nodes",
            "2000 included hours/month",
            "200 service deployments",
            "Premium support",
            "SSO & SAML",
            "Custom integrations",
        ],
    ),
    PricingTier(
        tier=SubscriptionTier.ENTERPRISE,
        name="Enterprise",
        monthly_price=-1,  # Custom pricing
        description="Custom solutions for large organizations",
        features=[
            "Unlimited cloud U-Nodes",
            "Unlimited hours",
            "Unlimited deployments",
            "Dedicated support",
            "On-premise option",
            "Custom SLA",
        ],
    ),
]
