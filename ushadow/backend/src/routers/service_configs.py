"""API routes for service/provider instances and wiring."""

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException

from src.models.service_config import (
    ServiceConfig,
    ServiceConfigCreate,
    ServiceConfigSummary,
    ServiceConfigUpdate,
    Template,
    TemplateSource,
    Wiring,
    WiringCreate,
)
from src.services.auth import get_current_user
from src.services.service_config_manager import get_service_config_manager
from src.config import get_settings
from src.config.helpers import env_var_matches_setting

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/svc-configs", tags=["instances"])


# =============================================================================
# Template Endpoints
# =============================================================================

@router.get("/templates", response_model=List[Template])
async def list_templates_endpoint(
    source: Optional[str] = None,
    installed: Optional[bool] = None,
    current_user: dict = Depends(get_current_user),
) -> List[Template]:
    """
    List available templates (compose services + providers).

    Templates are discovered from compose/*.yaml and providers/*.yaml.

    Args:
        installed: When True, only return installed compose services (provider templates
                   are always included as they are capability options, not installable services).
    """
    from src.services.template_service import list_templates
    return await list_templates(source, installed_only=bool(installed))


@router.get("/templates/{template_id}", response_model=Template)
async def get_template(
    template_id: str,
    current_user: dict = Depends(get_current_user),
) -> Template:
    """Get a template by ID."""
    from src.services.template_service import list_templates
    templates = await list_templates()
    for template in templates:
        if template.id == template_id:
            return template
    raise HTTPException(status_code=404, detail=f"Template not found: {template_id}")


@router.get("/templates/{template_id}/env")
async def get_template_env_config(
    template_id: str,
    current_user: dict = Depends(get_current_user),
) -> List[Dict[str, Any]]:
    """
    Get environment variable configuration with suggestions for a template.

    Uses the Settings v2 API for consistent behavior with services endpoint.
    Returns same format as /api/services/{name}/env for unified frontend handling.
    """
    from src.config import get_settings, Source
    from src.services.template_service import list_templates

    # Search provider templates specifically — compose templates share IDs (e.g. 'ollama')
    # but have empty config_schema. Provider templates have the credential definitions.
    provider_templates = await list_templates(source='provider')
    template = next((t for t in provider_templates if t.id == template_id), None)

    # Fallback: compose service linked to a YAML provider via provider_id
    if template is None:
        from src.services.compose_registry import get_compose_registry
        from src.services.provider_registry import get_provider_registry
        compose_service = get_compose_registry().get_service(template_id)
        if compose_service and compose_service.provider_id:
            provider = get_provider_registry().get_provider(compose_service.provider_id)
            if provider:
                template = next(
                    (t for t in await list_templates(source='provider') if t.id == provider.id),
                    None,
                )
    if template is None:
        raise HTTPException(status_code=404, detail=f"Provider template not found: {template_id}")
    settings_v2 = get_settings()

    result = []
    for field in template.config_schema:
        # Get env var name from field
        if isinstance(field, dict):
            env_name = field.get("env_var") or field["key"].upper()
            default_val = field.get("default")
            has_default = bool(default_val)
            is_required = field.get("required", True)
        else:
            env_name = getattr(field, "env_var", None) or field.key.upper()
            default_val = getattr(field, "default", None)
            has_default = bool(default_val)
            is_required = getattr(field, "required", True)

        # Get suggestions using Settings v2 API
        suggestions = await settings_v2.get_suggestions(env_name)

        # Try to find a matching suggestion with a value for auto-mapping.
        # Use env_var_matches_setting which normalizes underscores to dots and
        # requires a direct or suffix match — prevents false positives like
        # matching WHISPER_SERVER_URL to casdoor.url just because both end in "url".
        matching_suggestion = None
        for s in suggestions:
            if s.has_value and env_var_matches_setting(env_name, s.path):
                matching_suggestion = s
                break

        # Determine source and setting_path based on matching suggestion
        if matching_suggestion:
            source = Source.CONFIG_DEFAULT.value
            setting_path = matching_suggestion.path
            resolved_value = matching_suggestion.value
        else:
            source = "default"
            setting_path = None
            resolved_value = default_val

        result.append({
            "name": env_name,
            "is_required": is_required,
            "has_default": has_default,
            "default_value": default_val,
            "source": source,
            "setting_path": setting_path,
            "value": None,  # User-entered value
            "resolved_value": resolved_value,
            "suggestions": [s.to_dict() for s in suggestions],
            "locked": False,
            "provider_name": None,
        })

    return result


# =============================================================================
# ServiceConfig Endpoints
# =============================================================================

@router.get("", response_model=List[ServiceConfigSummary])
async def list_service_configs_endpoint(
    current_user: dict = Depends(get_current_user),
) -> List[ServiceConfigSummary]:
    """
    List all service configurations.

    Returns both actual ServiceConfig entries AND placeholder entries
    for installed templates that don't have configs yet.

    This helps users see: "You installed OpenAI but haven't configured it yet"
    """
    manager = get_service_config_manager()
    manager.reload()  # Force reload from disk to bust cache
    return await manager.list_service_configs_async()


@router.get("/{config_id}", response_model=ServiceConfig)
async def get_instance(
    config_id: str,
    current_user: dict = Depends(get_current_user),
) -> ServiceConfig:
    """Get an instance by ID.

    The config.values will only contain override values - values that differ
    from the template defaults. This uses two methods:
    1. OmegaConf.is_interpolation to identify inherited values (interpolations)
    2. Comparison with template defaults for direct values
    """
    manager = get_service_config_manager()
    instance = manager.get_service_config(config_id)
    if not instance:
        raise HTTPException(status_code=404, detail=f"ServiceConfig not found: {config_id}")

    # Get overrides translated to capability keys with resolved values
    instance.config.values = await manager.get_display_config_overrides(config_id)
    return instance


@router.post("", response_model=ServiceConfig)
async def create_service_config(
    data: ServiceConfigCreate,
    current_user: dict = Depends(get_current_user),
) -> ServiceConfig:
    """Create a new service configuration from a template."""
    manager = get_service_config_manager()
    try:
        from src.models.service_config import ServiceConfigCreate as IC
        # Strip internal metadata keys then normalize to canonical format
        filtered_config = {
            k: v for k, v in (data.config or {}).items()
            if not k.startswith('_save_') and not k.startswith('_from_')
        }
        # Create with raw config first so normalize_incoming_config can look up template
        # For creates, the config_id doesn't exist yet — pass template_id as a hint
        # by creating a temporary entry then normalizing immediately after
        filtered_data = IC(
            id=data.id,
            template_id=data.template_id,
            name=data.name,
            description=data.description,
            config=filtered_config,
        )
        created = manager.create_service_config(filtered_data)
        # Normalize stored config (translate env var keys, resolve _from_setting refs)
        normalized = await manager.normalize_incoming_config(created.id, filtered_config)
        if normalized != filtered_config:
            from src.models.service_config import ServiceConfigUpdate as IU
            created = manager.update_service_config(created.id, IU(config=normalized))
        return created
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{config_id}", response_model=ServiceConfig)
async def update_service_config(
    config_id: str,
    data: ServiceConfigUpdate,
    current_user: dict = Depends(get_current_user),
) -> ServiceConfig:
    """Update a service configuration."""
    manager = get_service_config_manager()

    if data.config is not None:
        from src.models.service_config import ServiceConfigUpdate as IU
        # Strip metadata keys, then normalize to canonical format:
        # env var keys → capability keys, _from_setting dicts → literal values
        stripped = {
            k: v for k, v in data.config.items()
            if not k.startswith('_save_') and not k.startswith('_from_')
        }
        normalized = await manager.normalize_incoming_config(config_id, stripped)
        data = IU(name=data.name, description=data.description, config=normalized)

    try:
        return manager.update_service_config(config_id, data)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/{config_id}")
async def delete_service_config(
    config_id: str,
    current_user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """Delete a service configuration."""
    manager = get_service_config_manager()
    if not manager.delete_service_config(config_id):
        raise HTTPException(status_code=404, detail=f"ServiceConfig not found: {config_id}")
    return {"success": True, "message": f"ServiceConfig {config_id} deleted"}


# =============================================================================
# Wiring Endpoints
# =============================================================================

@router.get("/wiring/all", response_model=List[Wiring])
async def list_wiring(
    current_user: dict = Depends(get_current_user),
) -> List[Wiring]:
    """List all wiring connections."""
    manager = get_service_config_manager()
    manager.reload()  # Force reload from disk to bust cache
    return manager.list_wiring()


@router.get("/wiring/defaults")
async def get_defaults(
    current_user: dict = Depends(get_current_user),
) -> Dict[str, str]:
    """Get default capability -> instance mappings."""
    manager = get_service_config_manager()
    return manager.get_defaults()


@router.put("/wiring/defaults/{capability}")
async def set_default(
    capability: str,
    config_id: str,
    current_user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """Set default instance for a capability."""
    manager = get_service_config_manager()
    try:
        manager.set_default(capability, config_id)
        return {"success": True, "capability": capability, "config_id": config_id}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/wiring", response_model=Wiring)
async def create_wiring(
    data: WiringCreate,
    current_user: dict = Depends(get_current_user),
) -> Wiring:
    """Create a wiring connection."""
    manager = get_service_config_manager()
    try:
        return manager.create_wiring(data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/wiring/{target_config_id}/{capability}")
async def delete_wiring(
    target_config_id: str,
    capability: str,
    current_user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """Delete a wiring connection."""
    manager = get_service_config_manager()
    if not manager.delete_wiring(target_config_id, capability):
        raise HTTPException(status_code=404, detail=f"Wiring not found: {target_config_id}/{capability}")
    return {"success": True, "message": f"Wiring {target_config_id}/{capability} deleted"}


@router.get("/{config_id}/wiring", response_model=List[Wiring])
async def get_instance_wiring(
    config_id: str,
    current_user: dict = Depends(get_current_user),
) -> List[Wiring]:
    """Get wiring connections for an instance."""
    manager = get_service_config_manager()
    instance = manager.get_service_config(config_id)
    if not instance:
        raise HTTPException(status_code=404, detail=f"ServiceConfig not found: {config_id}")
    return manager.get_wiring_for_instance(config_id)


# =============================================================================
# Integration-Specific Endpoints
# =============================================================================

@router.post("/{config_id}/test-connection")
async def test_integration_connection(
    config_id: str,
    current_user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Test connection to an integration.

    Only works for integration instances (instances with integration_type set).
    """
    from src.services.integration_operations import get_integration_operations

    ops = get_integration_operations()
    success, message = await ops.test_connection(config_id)

    return {"success": success, "message": message}


@router.post("/{config_id}/sync")
async def trigger_integration_sync(
    config_id: str,
    current_user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Manually trigger sync for an integration.

    Only works for integration instances (instances with integration_type set).
    """
    from src.services.integration_operations import get_integration_operations

    ops = get_integration_operations()
    result = await ops.sync_now(config_id)

    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Sync failed"))

    return result


@router.get("/{config_id}/sync-status")
async def get_integration_sync_status(
    config_id: str,
    current_user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Get current sync status for an integration.

    Only works for integration instances (instances with integration_type set).
    """
    from src.services.integration_operations import get_integration_operations

    ops = get_integration_operations()
    result = ops.get_sync_status(config_id)

    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])

    return result


@router.post("/{config_id}/sync/enable")
async def enable_integration_auto_sync(
    config_id: str,
    current_user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Enable automatic syncing for an integration.

    Only works for integration instances (instances with integration_type set).
    Requires sync_interval to be configured on the service config.
    """
    from src.services.integration_operations import get_integration_operations

    ops = get_integration_operations()
    success, message = await ops.enable_auto_sync(config_id)

    if not success:
        raise HTTPException(status_code=400, detail=message)

    return {"success": True, "message": message}


@router.post("/{config_id}/sync/disable")
async def disable_integration_auto_sync(
    config_id: str,
    current_user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Disable automatic syncing for an integration.

    Only works for integration instances (instances with integration_type set).
    """
    from src.services.integration_operations import get_integration_operations

    ops = get_integration_operations()
    success, message = await ops.disable_auto_sync(config_id)

    if not success:
        raise HTTPException(status_code=400, detail=message)

    return {"success": True, "message": message}
