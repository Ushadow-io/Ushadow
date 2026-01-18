"""Cloud hosting API router.

Provides endpoints for:
- Configuring cloud provider credentials
- Provisioning cloud U-Nodes
- Managing cloud instances (start, stop, terminate)
- Usage and billing information
"""

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from src.auth.dependencies import get_current_user
from src.services.cloud_node_manager import get_cloud_node_manager
from src.services.cloud_providers import (
    CloudProviderType,
    InstanceStatus,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/cloud", tags=["cloud"])


# =============================================================================
# Request/Response Models
# =============================================================================


class ProviderCredentials(BaseModel):
    """Cloud provider credentials."""
    provider: CloudProviderType
    api_key: str = Field(..., min_length=1)
    config: Dict[str, Any] = Field(default_factory=dict)


class ProviderInfo(BaseModel):
    """Cloud provider configuration info."""
    provider: str
    configured: bool
    configured_at: Optional[str] = None


class RegionInfo(BaseModel):
    """Cloud region information."""
    id: str
    name: str
    country: str
    available: bool


class SizeInfo(BaseModel):
    """Instance size information."""
    id: str
    name: str
    vcpus: int
    memory_mb: int
    disk_gb: int
    price_hourly: float
    price_monthly: float


class ProvisionRequest(BaseModel):
    """Request to provision a cloud node."""
    provider: CloudProviderType
    name: Optional[str] = None
    region: Optional[str] = None
    size: Optional[str] = None
    tailscale_auth_key: Optional[str] = None


class InstanceInfo(BaseModel):
    """Cloud instance information."""
    id: str
    name: str
    provider: str
    region: str
    size: str
    status: str
    public_ipv4: Optional[str]
    public_ipv6: Optional[str]
    tailscale_ip: Optional[str]
    unode_id: Optional[str]
    hourly_cost: float
    estimated_monthly: float
    created_at: Optional[str]


class UsageSummary(BaseModel):
    """Usage and billing summary."""
    total_hours: float
    total_cost: float
    instances: int
    estimated_monthly: float


class StandardResponse(BaseModel):
    """Standard API response."""
    success: bool
    message: str
    data: Optional[Any] = None


# =============================================================================
# Provider Configuration
# =============================================================================


@router.get("/providers", response_model=List[ProviderInfo])
async def list_providers(
    user: dict = Depends(get_current_user),
):
    """List all cloud providers and their configuration status."""
    manager = await get_cloud_node_manager()
    configured = await manager.list_configured_providers(user["sub"])

    configured_map = {p["provider"]: p for p in configured}

    providers = []
    for provider_type in CloudProviderType:
        config = configured_map.get(provider_type.value)
        providers.append(
            ProviderInfo(
                provider=provider_type.value,
                configured=config is not None,
                configured_at=config["configured_at"].isoformat() if config else None,
            )
        )

    return providers


@router.post("/providers/credentials", response_model=StandardResponse)
async def save_provider_credentials(
    credentials: ProviderCredentials,
    user: dict = Depends(get_current_user),
):
    """Save cloud provider credentials."""
    manager = await get_cloud_node_manager()

    success, message = await manager.save_credentials(
        owner_id=user["sub"],
        provider=credentials.provider,
        api_key=credentials.api_key,
        **credentials.config,
    )

    if not success:
        raise HTTPException(status_code=400, detail=message)

    return StandardResponse(success=True, message=message)


@router.delete("/providers/{provider}/credentials", response_model=StandardResponse)
async def remove_provider_credentials(
    provider: CloudProviderType,
    user: dict = Depends(get_current_user),
):
    """Remove cloud provider credentials."""
    manager = await get_cloud_node_manager()

    success = await manager.remove_credentials(user["sub"], provider)

    if not success:
        raise HTTPException(status_code=404, detail="Credentials not found")

    return StandardResponse(success=True, message="Credentials removed")


@router.get("/providers/{provider}/regions", response_model=List[RegionInfo])
async def list_regions(
    provider: CloudProviderType,
    user: dict = Depends(get_current_user),
):
    """List available regions for a cloud provider."""
    manager = await get_cloud_node_manager()
    provider_instance = await manager.get_provider(user["sub"], provider)

    if not provider_instance:
        raise HTTPException(
            status_code=400,
            detail=f"No credentials configured for {provider.value}",
        )

    try:
        regions = await provider_instance.list_regions()
        return [
            RegionInfo(
                id=r.id,
                name=r.name,
                country=r.country,
                available=r.available,
            )
            for r in regions
        ]
    except Exception as e:
        logger.error(f"Failed to list regions: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/providers/{provider}/sizes", response_model=List[SizeInfo])
async def list_sizes(
    provider: CloudProviderType,
    region: Optional[str] = Query(None, description="Filter by region"),
    user: dict = Depends(get_current_user),
):
    """List available instance sizes for a cloud provider."""
    manager = await get_cloud_node_manager()
    provider_instance = await manager.get_provider(user["sub"], provider)

    if not provider_instance:
        raise HTTPException(
            status_code=400,
            detail=f"No credentials configured for {provider.value}",
        )

    try:
        sizes = await provider_instance.list_sizes(region)
        return [
            SizeInfo(
                id=s.id,
                name=s.name,
                vcpus=s.vcpus,
                memory_mb=s.memory_mb,
                disk_gb=s.disk_gb,
                price_hourly=s.price_hourly,
                price_monthly=s.price_monthly,
            )
            for s in sizes
        ]
    except Exception as e:
        logger.error(f"Failed to list sizes: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Instance Management
# =============================================================================


@router.post("/instances", response_model=StandardResponse)
async def provision_instance(
    request: ProvisionRequest,
    user: dict = Depends(get_current_user),
):
    """Provision a new cloud U-Node."""
    manager = await get_cloud_node_manager()

    success, instance, message = await manager.provision_node(
        owner_id=user["sub"],
        provider_type=request.provider,
        name=request.name,
        region=request.region,
        size=request.size,
        tailscale_auth_key=request.tailscale_auth_key,
    )

    if not success:
        raise HTTPException(status_code=400, detail=message)

    return StandardResponse(
        success=True,
        message=message,
        data=_instance_to_info(instance) if instance else None,
    )


@router.get("/instances", response_model=List[InstanceInfo])
async def list_instances(
    provider: Optional[CloudProviderType] = Query(None),
    user: dict = Depends(get_current_user),
):
    """List all cloud instances owned by the user."""
    manager = await get_cloud_node_manager()

    instances = await manager.list_instances(
        owner_id=user["sub"],
        provider=provider,
    )

    return [_instance_to_info(i) for i in instances]


@router.get("/instances/{instance_id}", response_model=InstanceInfo)
async def get_instance(
    instance_id: str,
    refresh: bool = Query(False, description="Refresh status from provider"),
    user: dict = Depends(get_current_user),
):
    """Get details for a specific cloud instance."""
    manager = await get_cloud_node_manager()

    if refresh:
        instance = await manager.refresh_instance_status(instance_id, user["sub"])
    else:
        instance = await manager.get_instance(instance_id, user["sub"])

    if not instance:
        raise HTTPException(status_code=404, detail="Instance not found")

    return _instance_to_info(instance)


@router.post("/instances/{instance_id}/start", response_model=StandardResponse)
async def start_instance(
    instance_id: str,
    user: dict = Depends(get_current_user),
):
    """Start a stopped cloud instance."""
    manager = await get_cloud_node_manager()

    success, message = await manager.start_instance(instance_id, user["sub"])

    if not success:
        raise HTTPException(status_code=400, detail=message)

    return StandardResponse(success=True, message=message)


@router.post("/instances/{instance_id}/stop", response_model=StandardResponse)
async def stop_instance(
    instance_id: str,
    user: dict = Depends(get_current_user),
):
    """Stop a running cloud instance."""
    manager = await get_cloud_node_manager()

    success, message = await manager.stop_instance(instance_id, user["sub"])

    if not success:
        raise HTTPException(status_code=400, detail=message)

    return StandardResponse(success=True, message=message)


@router.delete("/instances/{instance_id}", response_model=StandardResponse)
async def terminate_instance(
    instance_id: str,
    user: dict = Depends(get_current_user),
):
    """Terminate (delete) a cloud instance."""
    manager = await get_cloud_node_manager()

    success, message = await manager.terminate_instance(instance_id, user["sub"])

    if not success:
        raise HTTPException(status_code=400, detail=message)

    return StandardResponse(success=True, message=message)


# =============================================================================
# Usage & Billing
# =============================================================================


@router.get("/usage", response_model=UsageSummary)
async def get_usage_summary(
    user: dict = Depends(get_current_user),
):
    """Get usage summary and estimated costs."""
    manager = await get_cloud_node_manager()

    summary = await manager.get_usage_summary(user["sub"])
    estimated = await manager.estimate_monthly_cost(user["sub"])

    return UsageSummary(
        total_hours=summary["total_hours"],
        total_cost=summary["total_cost"],
        instances=summary["instances"],
        estimated_monthly=estimated,
    )


# =============================================================================
# Helpers
# =============================================================================


def _instance_to_info(instance) -> InstanceInfo:
    """Convert CloudInstance to InstanceInfo."""
    return InstanceInfo(
        id=instance.id,
        name=instance.name,
        provider=instance.provider.value,
        region=instance.region,
        size=instance.size,
        status=instance.status.value,
        public_ipv4=instance.public_ipv4,
        public_ipv6=instance.public_ipv6,
        tailscale_ip=instance.tailscale_ip,
        unode_id=instance.unode_id,
        hourly_cost=instance.hourly_cost,
        estimated_monthly=instance.estimated_monthly,
        created_at=instance.created_at.isoformat() if instance.created_at else None,
    )
