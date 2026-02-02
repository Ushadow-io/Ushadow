"""
Template Service - Business logic for discovering and listing templates.

Handles:
- Discovering templates from compose files and provider definitions
- Checking installation/configuration status
- Building template metadata
"""

import logging
from typing import List, Optional

from src.models.service_config import Template, TemplateSource
from src.config import get_settings

logger = logging.getLogger(__name__)


async def _check_provider_configured(provider) -> bool:
    """Check if a provider has all required fields configured."""
    settings = get_settings()
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


async def list_templates(source: Optional[str] = None) -> List[Template]:
    """
    List available templates (compose services + providers).

    Templates are discovered from compose/*.yaml and providers/*.yaml.

    Args:
        source: Optional filter - "compose" or "provider"

    Returns:
        List of Template objects with installation/configuration status
    """
    templates = []

    # Get compose services as templates
    try:
        from src.services.compose_registry import get_compose_registry
        registry = get_compose_registry()
        registry.reload()  # Force reload from compose files to bust cache
        settings = get_settings()

        # Get installed service names
        # Final = (default_services + installed_services) - removed_services
        default_services = await settings.get("default_services") or []
        user_installed = await settings.get("installed_services") or []
        removed_services = await settings.get("removed_services") or []

        # Build final installed set
        installed_names = set(default_services) | set(user_installed)
        removed_names = set(removed_services)
        installed_names -= removed_names

        logger.info(f"Loading templates - defaults: {default_services}, user_installed: {user_installed}, removed: {removed_services}")
        logger.info(f"Loading templates - final installed_names: {installed_names}")

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
            logger.debug(f"Service: {service.service_name}, installed: {is_installed}, installed_names: {installed_names}")

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
        provider_registry.reload()  # Force reload from provider files to bust cache
        settings = get_settings()

        # Get installed providers (same pattern as compose services)
        user_installed = await settings.get("installed_services") or []

        for provider in provider_registry.get_providers():
            if source and source != "provider":
                continue

            # Check if provider is installed (user explicitly added it)
            is_installed = provider.id in user_installed

            # Check if provider is configured (has all required keys)
            is_configured = await _check_provider_configured(provider)

            # Check if local provider is running (Docker container up)
            is_running = True
            if provider.mode == 'local':
                is_running = await check_local_provider_available(provider, settings)

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
                running=is_running,
                installed=is_installed,
            ))
    except Exception as e:
        logger.warning(f"Failed to load provider templates: {e}")

    return templates
