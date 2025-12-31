"""
Compose Services API - Services discovered from Docker Compose files.

This is the compose-first approach where:
- Services are discovered from compose/*.yaml files
- Environment variables are extracted directly from compose
- Users configure env vars by selecting settings or entering values
- At runtime, values are injected via docker compose -e flags

Endpoints:
- GET /compose/services - List all discovered services
- GET /compose/services/{service_id} - Get service details with env schema
- GET /compose/services/{service_id}/env - Get env var configuration
- PUT /compose/services/{service_id}/env - Save env var configuration
- GET /compose/capabilities/{capability} - Services requiring a capability
"""

import logging
from typing import List, Dict, Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

try:
    from src.services.compose_registry import (
        get_compose_registry,
        EnvVarConfig,
        ServiceEnvSchema,
    )
    from src.config.omegaconf_settings import (
        get_settings_store,
        SettingSuggestion,
        env_var_matches_setting,
    )
    from src.services.provider_registry import get_provider_registry
except ImportError:
    from services.compose_registry import (
        get_compose_registry,
        EnvVarConfig,
        ServiceEnvSchema,
    )
    from config.omegaconf_settings import (
        get_settings_store,
        SettingSuggestion,
        env_var_matches_setting,
    )
    from services.provider_registry import get_provider_registry

logger = logging.getLogger(__name__)
router = APIRouter()


# =============================================================================
# Request/Response Models
# =============================================================================

class EnvVarConfigRequest(BaseModel):
    """Request to configure an environment variable."""
    name: str
    source: str  # "setting", "new_setting", "literal", "default"
    setting_path: Optional[str] = None       # For source="setting"
    new_setting_path: Optional[str] = None   # For source="new_setting" - path to create
    value: Optional[str] = None              # For source="literal" or "new_setting"


class EnvConfigUpdateRequest(BaseModel):
    """Request to update all env var configs for a service."""
    env_vars: List[EnvVarConfigRequest]


async def build_service_response(service, settings=None, include_env: bool = False) -> Dict[str, Any]:
    """Build response dict for a discovered service."""
    # Check if service needs setup
    # A service needs setup if it has required env vars without defaults
    # AND those vars don't have saved config or auto-mappable settings
    needs_setup = False

    required_without_defaults = [
        ev for ev in service.required_env_vars
        if ev.is_required and not ev.has_default
    ]

    if required_without_defaults:
        if settings:
            # Check saved config
            config_key = f"service_env_config.{service.service_id.replace(':', '_')}"
            saved_config = await settings.get(config_key) or {}

            for ev in required_without_defaults:
                saved = saved_config.get(ev.name, {})
                if saved.get("source") == "setting" and saved.get("setting_path"):
                    # Has saved mapping - check if setting has value
                    value = await settings.get(saved["setting_path"])
                    if not value:
                        needs_setup = True
                        break
                elif saved.get("source") == "literal" and saved.get("value"):
                    # Has literal value - ok
                    continue
                else:
                    # No saved config - check for auto-mappable setting
                    has_value = await settings.has_value_for_env_var(ev.name)
                    if not has_value:
                        needs_setup = True
                        break
        else:
            # No settings available - assume needs setup
            needs_setup = True

    response = {
        "service_id": service.service_id,
        "service_name": service.service_name,
        "compose_file": str(service.compose_file),
        "image": service.image,
        "description": service.description,
        "requires": service.requires,
        "depends_on": service.depends_on,
        "profiles": service.profiles,
        "ports": service.ports,
        "required_env_count": len(service.required_env_vars),
        "optional_env_count": len(service.optional_env_vars),
        "needs_setup": needs_setup,
    }

    if include_env:
        response["required_env_vars"] = [
            {
                "name": ev.name,
                "has_default": ev.has_default,
                "default_value": ev.default_value,
                "is_required": ev.is_required,
            }
            for ev in service.required_env_vars
        ]
        response["optional_env_vars"] = [
            {
                "name": ev.name,
                "has_default": ev.has_default,
                "default_value": ev.default_value,
                "is_required": ev.is_required,
            }
            for ev in service.optional_env_vars
        ]

    return response


# =============================================================================
# Installed Services Helpers
# =============================================================================

async def get_installed_service_names(settings) -> tuple[set, set]:
    """
    Get the sets of installed and removed service names.

    Returns:
        Tuple of (installed_names, removed_names)

    Combines:
    - default_services from config (default-services.yaml)
    - user additions from installed_services in MongoDB
    - user removals (installed_services.{name}.removed = true)
    """
    # Get default services from config
    default_services = await settings.get("default_services") or []
    installed = set(default_services)
    removed = set()

    # Get user modifications from MongoDB
    user_installed = await settings.get("installed_services") or {}

    for service_name, state in user_installed.items():
        # Convert OmegaConf to plain dict if needed
        if hasattr(state, 'items'):
            state_dict = dict(state)
        else:
            state_dict = state if isinstance(state, dict) else {}

        is_removed = state_dict.get("removed") == True
        is_added = state_dict.get("added") == True

        if is_removed:
            installed.discard(service_name)
            removed.add(service_name)
        elif is_added:
            installed.add(service_name)

    return installed, removed


def service_matches_installed(service, installed_names: set, removed_names: set) -> bool:
    """
    Check if a service matches any of the installed service names.

    Matching logic:
    1. If explicitly removed, not installed
    2. Exact match on service_name (e.g., "chronicle")
    3. Also checks if the compose file base name matches (for grouped services)
    """
    # Check if explicitly removed
    if service.service_name in removed_names:
        return False

    # Direct name match
    if service.service_name in installed_names:
        return True

    # Check compose file name (e.g., "chronicle-compose" for chronicle.yaml)
    compose_base = service.compose_file.stem.replace('-compose', '')
    if compose_base in installed_names:
        return True

    return False


# =============================================================================
# List Endpoints
# =============================================================================

@router.get("/services")
async def list_compose_services() -> List[Dict[str, Any]]:
    """
    List installed services only.

    Returns services that are in default_services or user-added.
    Use /compose/catalog for all available services.
    """
    registry = get_compose_registry()
    settings = get_settings_store()

    # Get installed and removed service names
    installed_names, removed_names = await get_installed_service_names(settings)

    # Filter registry to only installed services
    all_services = registry.get_services()
    installed_services = [
        s for s in all_services
        if service_matches_installed(s, installed_names, removed_names)
    ]

    return [await build_service_response(s, settings=settings, include_env=False) for s in installed_services]


@router.get("/catalog")
async def list_catalog_services() -> List[Dict[str, Any]]:
    """
    List all available services from the registry (catalog).

    Returns all discovered services regardless of installation status.
    Each service includes an 'installed' flag.
    """
    registry = get_compose_registry()
    settings = get_settings_store()

    # Get installed and removed service names
    installed_names, removed_names = await get_installed_service_names(settings)

    all_services = registry.get_services()
    results = []

    for s in all_services:
        response = await build_service_response(s, settings=settings, include_env=False)
        response["installed"] = service_matches_installed(s, installed_names, removed_names)
        results.append(response)

    return results


@router.get("/services/{service_id}")
async def get_compose_service(service_id: str) -> Dict[str, Any]:
    """
    Get details for a specific service including env vars.

    Args:
        service_id: Service identifier (compose_file:service_name)
    """
    registry = get_compose_registry()
    service = registry.get_service(service_id)

    if not service:
        raise HTTPException(
            status_code=404,
            detail=f"Service '{service_id}' not found"
        )

    return build_service_response(service, include_env=True)


@router.get("/capabilities/{capability}")
async def get_services_by_capability(capability: str) -> List[Dict[str, Any]]:
    """
    Get all services that require a specific capability.

    Args:
        capability: Capability name (e.g., 'llm', 'transcription')
    """
    registry = get_compose_registry()
    services = registry.get_services_requiring(capability)

    return [build_service_response(s, include_env=False) for s in services]


# =============================================================================
# Environment Variable Configuration
# =============================================================================

@router.get("/services/{service_id}/env")
async def get_service_env_config(service_id: str) -> Dict[str, Any]:
    """
    Get environment variable configuration for a service.

    Returns the env schema with current configuration and suggested settings.
    """
    registry = get_compose_registry()
    settings = get_settings_store()
    provider_registry = get_provider_registry()

    service = registry.get_service(service_id)
    if not service:
        raise HTTPException(
            status_code=404,
            detail=f"Service '{service_id}' not found"
        )

    schema = service.get_env_schema()

    # Load saved configuration
    saved_config = await settings.get(f"service_env_config.{service_id.replace(':', '_')}")
    saved_config = saved_config or {}

    # Helper to find auto-matching suggestion for an env var
    def find_auto_match(env_name: str, suggestions: List[SettingSuggestion]) -> Optional[SettingSuggestion]:
        """Find a suggestion that matches the env var name and has a value."""
        for s in suggestions:
            if not s.has_value:
                continue
            # Get the last part of the setting path
            path_parts = s.path.split('.')
            key_part = path_parts[-1]
            if env_var_matches_setting(env_name, key_part):
                return s
        return None

    # Helper to resolve env var value based on source
    async def resolve_env_value(source: str, setting_path: Optional[str], value: Optional[str], default_value: str | None) -> str | None:
        if source == "setting" and setting_path:
            return await settings.get(setting_path)
        elif source == "literal" and value:
            return value
        elif source == "default":
            return default_value
        return None

    # Build response with suggestions and auto-mapping
    required_vars = []
    for ev in schema.required_env_vars:
        saved = saved_config.get(ev.name, {})
        suggestions = await settings.get_suggestions_for_env_var(
            ev.name, provider_registry, schema.requires
        )

        # Determine source and setting_path (auto-map if not saved and match found)
        source = saved.get("source", "default")
        setting_path = saved.get("setting_path")
        value = saved.get("value")

        # Auto-map if no saved config and a matching suggestion with value exists
        if source == "default" and not setting_path:
            auto_match = find_auto_match(ev.name, suggestions)
            if auto_match:
                source = "setting"
                setting_path = auto_match.path

        resolved = await resolve_env_value(source, setting_path, value, ev.default_value)

        required_vars.append({
            "name": ev.name,
            "is_required": True,
            "has_default": ev.has_default,
            "default_value": ev.default_value,
            "source": source,
            "setting_path": setting_path,
            "value": value,
            "resolved_value": resolved,
            "suggestions": [s.to_dict() for s in suggestions],
        })

    optional_vars = []
    for ev in schema.optional_env_vars:
        saved = saved_config.get(ev.name, {})
        suggestions = await settings.get_suggestions_for_env_var(
            ev.name, provider_registry, schema.requires
        )

        # Determine source and setting_path (auto-map if not saved and match found)
        source = saved.get("source", "default")
        setting_path = saved.get("setting_path")
        value = saved.get("value")

        # Auto-map if no saved config and a matching suggestion with value exists
        if source == "default" and not setting_path:
            auto_match = find_auto_match(ev.name, suggestions)
            if auto_match:
                source = "setting"
                setting_path = auto_match.path

        resolved = await resolve_env_value(source, setting_path, value, ev.default_value)

        optional_vars.append({
            "name": ev.name,
            "is_required": False,
            "has_default": ev.has_default,
            "default_value": ev.default_value,
            "source": source,
            "setting_path": setting_path,
            "value": value,
            "resolved_value": resolved,
            "suggestions": [s.to_dict() for s in suggestions],
        })

    return {
        "service_id": service_id,
        "service_name": schema.service_name,
        "compose_file": schema.compose_file,
        "requires": schema.requires,
        "required_env_vars": required_vars,
        "optional_env_vars": optional_vars,
    }


@router.put("/services/{service_id}/env")
async def update_service_env_config(
    service_id: str,
    request: EnvConfigUpdateRequest
) -> Dict[str, Any]:
    """
    Save environment variable configuration for a service.

    This stores the user's choices for where each env var value comes from:
    - "setting": Use value from an existing settings path
    - "new_setting": Create a new setting and map to it
    - "literal": Use a directly entered value (not saved as setting)
    - "default": Use the compose file's default
    """
    registry = get_compose_registry()
    settings = get_settings_store()

    service = registry.get_service(service_id)
    if not service:
        raise HTTPException(
            status_code=404,
            detail=f"Service '{service_id}' not found"
        )

    # Process env vars - handle new_setting by creating settings first
    new_settings_to_create = {}
    env_config = {}

    for ev in request.env_vars:
        if ev.source == "new_setting" and ev.new_setting_path and ev.value:
            # Queue the new setting to be created
            new_settings_to_create[ev.new_setting_path] = ev.value
            # Store as regular setting mapping
            env_config[ev.name] = {
                "source": "setting",
                "setting_path": ev.new_setting_path,
            }
        else:
            env_config[ev.name] = {
                "source": ev.source,
                "setting_path": ev.setting_path,
                "value": ev.value,
            }

    # Create new settings if any
    if new_settings_to_create:
        await settings.update(new_settings_to_create)
        logger.info(f"Created {len(new_settings_to_create)} new settings")

    # Save env config mapping using nested structure (OmegaConf.create doesn't interpret dots)
    service_key = service_id.replace(':', '_')
    await settings.update({
        "service_env_config": {
            service_key: env_config
        }
    })

    logger.info(f"Saved env config for {service_id}: {len(env_config)} vars")

    return {
        "service_id": service_id,
        "saved": len(env_config),
        "new_settings_created": len(new_settings_to_create),
        "message": f"Environment configuration saved for {service.service_name}"
    }


# =============================================================================
# Runtime Resolution
# =============================================================================

@router.get("/services/{service_id}/resolve")
async def resolve_service_env_vars(service_id: str) -> Dict[str, Any]:
    """
    Resolve environment variables for runtime injection.

    Returns the actual values that would be passed to docker compose.
    Sensitive values are masked in the response.
    """
    registry = get_compose_registry()
    settings = get_settings_store()

    service = registry.get_service(service_id)
    if not service:
        raise HTTPException(
            status_code=404,
            detail=f"Service '{service_id}' not found"
        )

    # Load saved configuration
    config_key = f"service_env_config.{service_id.replace(':', '_')}"
    saved_config = await settings.get(config_key)
    saved_config = saved_config or {}

    resolved = {}
    missing = []

    for ev in service.all_env_vars:
        config = saved_config.get(ev.name, {})
        source = config.get("source", "default")

        if source == "setting":
            setting_path = config.get("setting_path")
            if setting_path:
                value = await settings.get(setting_path)
                if value:
                    # Mask sensitive values
                    if "KEY" in ev.name or "SECRET" in ev.name or "PASSWORD" in ev.name:
                        resolved[ev.name] = f"***{str(value)[-4:]}" if len(str(value)) > 4 else "****"
                    else:
                        resolved[ev.name] = str(value)
                elif ev.is_required:
                    missing.append(f"{ev.name} (setting '{setting_path}' is empty)")

        elif source == "literal":
            value = config.get("value")
            if value:
                if "KEY" in ev.name or "SECRET" in ev.name or "PASSWORD" in ev.name:
                    resolved[ev.name] = f"***{str(value)[-4:]}" if len(str(value)) > 4 else "****"
                else:
                    resolved[ev.name] = value
            elif ev.is_required:
                missing.append(f"{ev.name} (no value provided)")

        elif source == "default":
            if ev.has_default:
                resolved[ev.name] = f"(default: {ev.default_value})"
            elif ev.is_required:
                missing.append(f"{ev.name} (no default, not configured)")

    return {
        "service_id": service_id,
        "ready": len(missing) == 0,
        "resolved": resolved,
        "missing": missing,
        "compose_file": str(service.compose_file),
    }


# =============================================================================
# Service Installation Management
# =============================================================================

@router.post("/services/{service_id}/install")
async def install_service(service_id: str) -> Dict[str, Any]:
    """
    Install a service (add to installed services list).

    This marks the service as user-added, overriding default_services.
    """
    registry = get_compose_registry()
    settings = get_settings_store()

    service = registry.get_service(service_id)
    if not service:
        raise HTTPException(
            status_code=404,
            detail=f"Service '{service_id}' not found in registry"
        )

    # Add to installed_services with added=true
    service_name = service.service_name
    await settings.update({
        "installed_services": {
            service_name: {
                "added": True,
                "removed": False,
            }
        }
    })

    logger.info(f"Installed service: {service_name}")

    return {
        "service_id": service_id,
        "service_name": service_name,
        "installed": True,
        "message": f"Service '{service_name}' has been installed"
    }


@router.post("/services/{service_id}/uninstall")
async def uninstall_service(service_id: str) -> Dict[str, Any]:
    """
    Uninstall a service (remove from installed services list).

    This marks the service as removed, overriding default_services.
    """
    registry = get_compose_registry()
    settings = get_settings_store()

    service = registry.get_service(service_id)
    if not service:
        raise HTTPException(
            status_code=404,
            detail=f"Service '{service_id}' not found in registry"
        )

    # Add to installed_services with removed=true
    service_name = service.service_name
    await settings.update({
        "installed_services": {
            service_name: {
                "added": False,
                "removed": True,
            }
        }
    })

    logger.info(f"Uninstalled service: {service_name}")

    return {
        "service_id": service_id,
        "service_name": service_name,
        "installed": False,
        "message": f"Service '{service_name}' has been uninstalled"
    }
