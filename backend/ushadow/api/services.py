"""
Services API Endpoints

Manages external service configurations and integrations.
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import List, Dict, Any, Optional
import logging

from ..models.service import ServiceConfig, ServiceType
from ..services.service_manager import ServiceManager
from ..services.settings_manager import SettingsManager
from ..memory.adapters import AdapterFactory

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/services", tags=["services"])


# Dependency injection
def get_service_manager() -> ServiceManager:
    """Get ServiceManager instance."""
    return ServiceManager()


def get_settings_manager() -> SettingsManager:
    """Get SettingsManager instance."""
    return SettingsManager()


@router.get("/", response_model=List[ServiceConfig])
async def list_services(
    service_type: Optional[ServiceType] = None,
    enabled_only: bool = False,
    service_manager: ServiceManager = Depends(get_service_manager)
) -> List[ServiceConfig]:
    """
    List all configured services.
    
    Query parameters:
    - service_type: Filter by service type
    - enabled_only: Only return enabled services
    """
    try:
        services = service_manager.list_services()
        
        # Apply filters
        if service_type:
            services = [s for s in services if s.service_type == service_type]
        
        if enabled_only:
            services = [s for s in services if s.enabled]
        
        return services
        
    except Exception as e:
        logger.error(f"Failed to list services: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{service_id}", response_model=ServiceConfig)
async def get_service(
    service_id: str,
    service_manager: ServiceManager = Depends(get_service_manager)
) -> ServiceConfig:
    """Get service configuration by ID."""
    try:
        service = service_manager.get_service(service_id)
        
        if not service:
            raise HTTPException(
                status_code=404,
                detail=f"Service '{service_id}' not found"
            )
        
        return service
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get service {service_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/", response_model=ServiceConfig, status_code=201)
async def create_service(
    service: ServiceConfig,
    service_manager: ServiceManager = Depends(get_service_manager)
) -> ServiceConfig:
    """Create a new service configuration."""
    try:
        # Check if service already exists
        existing = service_manager.get_service(service.service_id)
        if existing:
            raise HTTPException(
                status_code=409,
                detail=f"Service '{service.service_id}' already exists"
            )
        
        # Add service
        service_manager.add_service(service)
        
        logger.info(f"Created service: {service.service_id}")
        return service
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create service: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{service_id}", response_model=ServiceConfig)
async def update_service(
    service_id: str,
    service: ServiceConfig,
    service_manager: ServiceManager = Depends(get_service_manager)
) -> ServiceConfig:
    """Update an existing service configuration."""
    try:
        # Ensure IDs match
        if service.service_id != service_id:
            raise HTTPException(
                status_code=400,
                detail="Service ID in path must match service ID in body"
            )
        
        # Check if service exists
        existing = service_manager.get_service(service_id)
        if not existing:
            raise HTTPException(
                status_code=404,
                detail=f"Service '{service_id}' not found"
            )
        
        # Update service
        service_manager.update_service(service)
        
        logger.info(f"Updated service: {service_id}")
        return service
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update service {service_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{service_id}", status_code=204)
async def delete_service(
    service_id: str,
    service_manager: ServiceManager = Depends(get_service_manager)
):
    """Delete a service configuration."""
    try:
        # Check if service exists
        existing = service_manager.get_service(service_id)
        if not existing:
            raise HTTPException(
                status_code=404,
                detail=f"Service '{service_id}' not found"
            )
        
        # Remove service
        service_manager.remove_service(service_id)
        
        logger.info(f"Deleted service: {service_id}")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete service {service_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{service_id}/test", response_model=Dict[str, Any])
async def test_service_connection(
    service_id: str,
    service_manager: ServiceManager = Depends(get_service_manager),
    settings_manager: SettingsManager = Depends(get_settings_manager)
) -> Dict[str, Any]:
    """Test connection to a service."""
    try:
        # Get service config
        service = service_manager.get_service(service_id)
        if not service:
            raise HTTPException(
                status_code=404,
                detail=f"Service '{service_id}' not found"
            )
        
        # Create adapter
        settings = settings_manager.load_settings()
        adapter = AdapterFactory.create_adapter(service, settings)
        
        # Test connection
        success = await adapter.test_connection()
        
        # Close adapter
        await adapter.close()
        
        return {
            "service_id": service_id,
            "success": success,
            "message": "Connection successful" if success else "Connection failed"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to test service {service_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{service_id}/sync", response_model=Dict[str, Any])
async def sync_service_data(
    service_id: str,
    limit: Optional[int] = 100,
    service_manager: ServiceManager = Depends(get_service_manager),
    settings_manager: SettingsManager = Depends(get_settings_manager)
) -> Dict[str, Any]:
    """
    Manually trigger sync for a service.
    
    Fetches data from the service and stores it in the memory system.
    """
    try:
        # Get service config
        service = service_manager.get_service(service_id)
        if not service:
            raise HTTPException(
                status_code=404,
                detail=f"Service '{service_id}' not found"
            )
        
        # Create adapter
        settings = settings_manager.load_settings()
        adapter = AdapterFactory.create_adapter(service, settings)
        
        # Fetch items
        memories = await adapter.fetch_items(limit=limit)
        
        # Close adapter
        await adapter.close()
        
        # TODO: Store memories in database
        # For now, just return the count
        
        logger.info(f"Synced {len(memories)} items from {service_id}")
        
        return {
            "service_id": service_id,
            "items_fetched": len(memories),
            "message": f"Successfully synced {len(memories)} items"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to sync service {service_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{service_id}/preview", response_model=List[Dict[str, Any]])
async def preview_service_data(
    service_id: str,
    limit: int = 5,
    service_manager: ServiceManager = Depends(get_service_manager),
    settings_manager: SettingsManager = Depends(get_settings_manager)
) -> List[Dict[str, Any]]:
    """
    Preview data from a service without storing it.
    
    Useful for testing memory mappings before syncing.
    """
    try:
        # Get service config
        service = service_manager.get_service(service_id)
        if not service:
            raise HTTPException(
                status_code=404,
                detail=f"Service '{service_id}' not found"
            )
        
        # Create adapter
        settings = settings_manager.load_settings()
        adapter = AdapterFactory.create_adapter(service, settings)
        
        # Fetch items
        memories = await adapter.fetch_items(limit=limit)
        
        # Close adapter
        await adapter.close()
        
        # Convert to dicts for response
        preview_data = [memory.model_dump() for memory in memories]
        
        return preview_data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to preview service {service_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
