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
from src.config.omegaconf_settings import get_settings_store

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/svc-configs", tags=["instances"])


async def _check_provider_configured(provider) -> bool:
    """Check if a provider has all required fields configured."""
    settings = get_settings_store()
    for em in provider.env_maps:
        if not em.required:
            continue
        # Check if value exists in settings or has default
        has_value = bool(em.default)
        if em.settings_path:
            value = await settings.get(em.settings_path)
            has_value = value is not None and str(value).strip() != ""
        if not has_value:
            return False
    return True


# =============================================================================
# Template Endpoints
# =============================================================================

@router.get("/templates", response_model=List[Template])
async def list_templates(
    source: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
) -> List[Template]:
    """
    List available templates (compose services + providers).

    Templates are discovered from compose/*.yaml and providers/*.yaml.
    """
    templates = []

    # Get compose services as templates
    try:
        from src.services.compose_registry import get_compose_registry
        registry = get_compose_registry()
        settings = get_settings_store()

        # Get installed service names (same logic as ServiceOrchestrator)
        default_services = await settings.get("default_services") or []
        installed_names = set(default_services)
        removed_names = set()

        logger.info(f"Loading templates - default_services from settings: {default_services}")
        logger.info(f"Loading templates - installed_names: {installed_names}")

        user_installed = await settings.get("installed_services") or {}
        for service_name, state in user_installed.items():
            if hasattr(state, 'items'):
                state_dict = dict(state)
            else:
                state_dict = state if isinstance(state, dict) else {}

            is_removed = state_dict.get("removed") == True
            is_added = state_dict.get("added") == True

            if is_removed:
                installed_names.discard(service_name)
                removed_names.add(service_name)
            elif is_added:
                installed_names.add(service_name)

        for service in registry.get_services():
            if source and source != "compose":
                continue

            # Check if service is installed
            is_installed = False
            if service.service_name in removed_names:
                is_installed = False
            elif service.service_name in installed_names:
                is_installed = True
            else:
                compose_base = service.compose_file.stem.replace('-compose', '')
                if compose_base in installed_names:
                    is_installed = True

            # Debug logging
            logger.info(f"Service: {service.service_name}, installed: {is_installed}, installed_names: {installed_names}")

            templates.append(Template(
                id=service.service_id,
                source=TemplateSource.COMPOSE,
                name=service.display_name or service.service_name,
                description=service.description,
                requires=service.requires,
                optional=service.optional,
                provides=service.provides,
                config_schema=[],  # TODO: extract from env vars
                compose_file=str(service.namespace) if service.namespace else None,
                service_name=service.service_name,
                mode="local",
                installed=is_installed,
            ))
    except Exception as e:
        logger.warning(f"Failed to load compose templates: {e}")

    # Get providers as templates
    try:
        from src.services.provider_registry import get_provider_registry
        from src.routers.providers import check_local_provider_available
        provider_registry = get_provider_registry()
        settings = get_settings_store()
        for provider in provider_registry.get_providers():
            if source and source != "provider":
                continue
            # Check if provider is configured (has all required keys)
            is_configured = await _check_provider_configured(provider)

            # Check if local provider is available (service running)
            is_available = True
            if provider.mode == 'local':
                is_available = await check_local_provider_available(provider, settings)

            # Build config_schema with current values from settings
            config_schema = []
            for em in provider.env_maps:
                value = None
                has_value = bool(em.default)
                if em.settings_path:
                    stored_value = await settings.get(em.settings_path)
                    has_value = stored_value is not None and str(stored_value).strip() != ""
                    # Only return actual value for non-secrets
                    if has_value and em.type != "secret":
                        value = str(stored_value)
                config_schema.append({
                    "key": em.key,
                    "type": em.type,
                    "label": em.label,
                    "required": em.required,
                    "default": em.default,
                    "env_var": em.env_var,
                    "settings_path": em.settings_path,
                    "has_value": has_value,
                    "value": value,  # Non-secret values for pre-population
                })

            templates.append(Template(
                id=provider.id,
                source=TemplateSource.PROVIDER,
                name=provider.name,
                description=provider.description,
                requires=[u.capability for u in provider.uses] if provider.uses else [],
                provides=provider.capability,
                config_schema=config_schema,
                provider_file=f"providers/{provider.capability}.yaml",
                mode=provider.mode,
                icon=provider.icon,
                tags=provider.tags,
                configured=is_configured,
                available=is_available,
                installed=True,  # Providers are always "installed" (discoverable)
            ))
    except Exception as e:
        logger.warning(f"Failed to load provider templates: {e}")

    return templates


@router.get("/templates/{template_id}", response_model=Template)
async def get_template(
    template_id: str,
    current_user: dict = Depends(get_current_user),
) -> Template:
    """Get a template by ID."""
    templates = await list_templates(current_user=current_user)
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

    Uses the same build_env_var_config() process as services for consistent
    auto-mapping and suggestion behavior.
    """
    from dataclasses import dataclass

    template = await get_template(template_id, current_user)
    settings = get_settings_store()

    # Convert config_schema to EnvVarConfig-like objects for build_env_var_config
    @dataclass
    class EnvVarStub:
        name: str
        default_value: Optional[str] = None
        has_default: bool = False

    env_vars = []
    for field in template.config_schema:
        default_val = field.get("default") if isinstance(field, dict) else getattr(field, "default", None)
        env_vars.append(EnvVarStub(
            name=field.get("env_var") or field["key"].upper() if isinstance(field, dict) else getattr(field, "env_var", None) or field.key.upper(),
            default_value=default_val,
            has_default=bool(default_val),
        ))

    # Use same process as services - builds suggestions and auto-maps
    result = await settings.build_env_var_config(
        env_vars=env_vars,
        saved_config={},  # No saved config for templates
        requires=template.requires or [],
        provider_registry=None,  # Could add for capability-based suggestions
        is_required=True,
    )

    return result


# =============================================================================
# ServiceConfig Endpoints
# =============================================================================

@router.get("", response_model=List[ServiceConfigSummary])
async def list_service_configs(
    current_user: dict = Depends(get_current_user),
) -> List[ServiceConfigSummary]:
    """List all instances."""
    manager = get_service_config_manager()
    return manager.list_service_configs()


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

    # Get raw overrides (non-interpolation values)
    overrides = manager.get_config_overrides(config_id)

    # For existing instances with direct values, also compare with template defaults
    # to filter out values that match the template
    if overrides:
        try:
            from src.services.capability_resolver import get_capability_resolver
            settings = get_settings_store()
            resolver = get_capability_resolver()

            # Get template defaults from provider registry
            provider = resolver.get_provider_by_id(instance.template_id)
            if provider and provider.env_maps:
                template_defaults = {}
                for em in provider.env_maps:
                    # Get the current value from settings (the "template default")
                    if em.settings_path:
                        stored_value = await settings.get(em.settings_path)
                        if stored_value is not None:
                            template_defaults[em.key] = str(stored_value)
                    elif em.default:
                        template_defaults[em.key] = em.default

                # Filter overrides to only include values that differ from template
                true_overrides = {}
                for key, value in overrides.items():
                    template_value = template_defaults.get(key)
                    # Include if no template value or if values differ
                    if template_value is None or str(value) != str(template_value):
                        true_overrides[key] = value

                overrides = true_overrides
        except Exception as e:
            logger.debug(f"Could not compare with template defaults: {e}")
            # Fall back to raw overrides

    instance.config.values = overrides
    return instance


@router.post("", response_model=ServiceConfig)
async def create_instance(
    data: ServiceConfigCreate,
    current_user: dict = Depends(get_current_user),
) -> ServiceConfig:
    """Create a new instance from a template.

    Config values that match template defaults are filtered out,
    so only actual overrides are stored.
    """
    # Filter config to only include values that differ from template defaults
    filtered_config = data.config.copy() if data.config else {}

    if filtered_config:
        try:
            from src.services.capability_resolver import get_capability_resolver
            settings = get_settings_store()
            resolver = get_capability_resolver()

            # Get template defaults from provider registry
            provider = resolver.get_provider_by_id(data.template_id)
            if provider and provider.env_maps:
                template_defaults = {}
                for em in provider.env_maps:
                    # Get the current value from settings (the "template default")
                    if em.settings_path:
                        stored_value = await settings.get(em.settings_path)
                        if stored_value is not None:
                            template_defaults[em.key] = str(stored_value)
                    elif em.default:
                        template_defaults[em.key] = em.default

                # Filter to only values that differ from template
                true_overrides = {}
                for key, value in filtered_config.items():
                    template_value = template_defaults.get(key)
                    # Include if no template value or if values differ
                    if template_value is None or str(value) != str(template_value):
                        true_overrides[key] = value

                filtered_config = true_overrides
                logger.debug(f"Filtered config from {len(data.config)} to {len(filtered_config)} overrides")
        except Exception as e:
            logger.debug(f"Could not filter against template defaults: {e}")
            # Fall back to using all provided config

    # Create instance with filtered config
    manager = get_service_config_manager()
    try:
        # Create a modified data object with filtered config
        from src.models.service_config import ServiceConfigCreate as IC
        filtered_data = IC(
            id=data.id,
            template_id=data.template_id,
            name=data.name,
            description=data.description,
            config=filtered_config,
            deployment_target=data.deployment_target,
        )
        return manager.create_instance(filtered_data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{config_id}", response_model=ServiceConfig)
async def update_instance(
    config_id: str,
    data: ServiceConfigUpdate,
    current_user: dict = Depends(get_current_user),
) -> ServiceConfig:
    """Update an instance.

    Config values that match template defaults are filtered out,
    so only actual overrides are stored.
    """
    manager = get_service_config_manager()

    # If config is being updated, filter to only include overrides
    if data.config is not None:
        filtered_config = data.config.copy() if data.config else {}

        if filtered_config:
            try:
                # Get the service config to find its template_id
                instance = manager.get_service_config(config_id)
                if instance:
                    from src.services.capability_resolver import get_capability_resolver
                    settings = get_settings_store()
                    resolver = get_capability_resolver()

                    # Get template defaults from provider registry
                    provider = resolver.get_provider_by_id(instance.template_id)
                    if provider and provider.env_maps:
                        template_defaults = {}
                        for em in provider.env_maps:
                            if em.settings_path:
                                stored_value = await settings.get(em.settings_path)
                                if stored_value is not None:
                                    template_defaults[em.key] = str(stored_value)
                            elif em.default:
                                template_defaults[em.key] = em.default

                        # Filter to only values that differ from template
                        true_overrides = {}
                        for key, value in filtered_config.items():
                            template_value = template_defaults.get(key)
                            if template_value is None or str(value) != str(template_value):
                                true_overrides[key] = value

                        filtered_config = true_overrides
                        logger.debug(f"Filtered update config to {len(filtered_config)} overrides")
            except Exception as e:
                logger.debug(f"Could not filter against template defaults: {e}")

        # Create a modified data object with filtered config
        from src.models.service_config import ServiceConfigUpdate as IU
        data = IU(
            name=data.name,
            description=data.description,
            config=filtered_config,
            deployment_target=data.deployment_target,
        )

    try:
        return manager.update_instance(config_id, data)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/{config_id}")
async def delete_instance(
    config_id: str,
    current_user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """Delete an instance."""
    manager = get_service_config_manager()
    if not manager.delete_instance(config_id):
        raise HTTPException(status_code=404, detail=f"ServiceConfig not found: {config_id}")
    return {"success": True, "message": f"ServiceConfig {config_id} deleted"}


@router.post("/{config_id}/deploy")
async def deploy_instance(
    config_id: str,
    current_user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """Deploy/start an instance.

    For compose services, this starts the docker container.
    For cloud providers, this marks the service config as active.
    """
    manager = get_service_config_manager()
    success, message = await manager.deploy_instance(config_id)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {"success": True, "message": message}


@router.post("/{config_id}/undeploy")
async def undeploy_instance(
    config_id: str,
    current_user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """Stop/undeploy an instance.

    For compose services, this stops the docker container.
    For cloud providers, this marks the service config as inactive.
    """
    manager = get_service_config_manager()
    success, message = await manager.undeploy_instance(config_id)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {"success": True, "message": message}


# =============================================================================
# Wiring Endpoints
# =============================================================================

@router.get("/wiring/all", response_model=List[Wiring])
async def list_wiring(
    current_user: dict = Depends(get_current_user),
) -> List[Wiring]:
    """List all wiring connections."""
    manager = get_service_config_manager()
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


@router.delete("/wiring/{wiring_id}")
async def delete_wiring(
    wiring_id: str,
    current_user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """Delete a wiring connection."""
    manager = get_service_config_manager()
    if not manager.delete_wiring(wiring_id):
        raise HTTPException(status_code=404, detail=f"Wiring not found: {wiring_id}")
    return {"success": True, "message": f"Wiring {wiring_id} deleted"}


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
