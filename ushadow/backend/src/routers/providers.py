"""
Provider API - Thin HTTP layer over ProviderRegistry.

Endpoints:
- GET /providers - List all providers (summary)
- GET /providers/capability/{capability} - Providers for a capability
- GET /providers/capabilities - List capabilities
- GET /providers/{id} - Provider details
- GET /providers/{id}/missing - Missing required fields
- POST /providers/find - Query providers
- GET /providers/selected - Current selections
- PUT /providers/selected - Update selections
- POST /providers/apply-defaults/{mode} - Apply defaults
"""

import asyncio
import logging
from typing import Dict, List, Any, Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from src.services.provider_registry import get_provider_registry
from src.services.omegaconf_settings import get_omegaconf_settings

logger = logging.getLogger(__name__)
router = APIRouter()


# =============================================================================
# Helper - Check if local provider is available
# =============================================================================

async def check_local_provider_available(provider, settings) -> bool:
    """
    Check if a local provider's service is available/reachable.

    For local providers (like Ollama), checks if the service is running
    by hitting its health endpoint. Cloud providers always return True.
    """
    if provider.mode != 'local':
        return True  # Cloud providers are always "available" (just need credentials)

    # Get the health check URL from docker config
    if not provider.docker or not provider.docker.health:
        return True  # No health check defined, assume available

    health_cfg = provider.docker.health
    health_path = health_cfg.get('http_get', '/health') if isinstance(health_cfg, dict) else '/health'
    health_port = health_cfg.get('port', 8080) if isinstance(health_cfg, dict) else 8080

    # Get the base URL from settings or use default
    base_url = None
    for em in provider.env_maps:
        if em.key == 'base_url':
            if em.settings_path:
                base_url = await settings.get(em.settings_path)
            if not base_url:
                base_url = em.default
            break

    if not base_url:
        # Construct from docker config
        base_url = f"http://localhost:{health_port}"

    # Check if it's a docker-internal URL (e.g., http://ollama:11434)
    # Convert to localhost for external check
    if '://' in base_url:
        parts = base_url.split('://')
        host_part = parts[1].split('/')[0]
        # Check if host is a service name (not localhost/127.0.0.1)
        if ':' in host_part:
            host, port = host_part.rsplit(':', 1)
        else:
            host, port = host_part, str(health_port)

        # Convert docker service names to localhost for external check
        if host not in ('localhost', '127.0.0.1', '0.0.0.0'):
            base_url = f"http://localhost:{port}"

    # Build health check URL
    health_url = f"{base_url.rstrip('/')}{health_path}"

    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            response = await client.get(health_url)
            return response.status_code < 500
    except Exception:
        return False


# =============================================================================
# Helper - Check missing required fields (needs settings access)
# =============================================================================

async def get_missing_fields(provider, settings) -> List[Dict[str, Any]]:
    """Check which required fields are missing for a provider."""
    missing = []
    for em in provider.env_maps:
        if not em.required:
            continue
        # Check if value exists in settings or has default
        has_value = bool(em.default)
        if em.settings_path:
            value = await settings.get(em.settings_path)
            has_value = value is not None and str(value).strip() != ""
        if not has_value:
            missing.append({
                "key": em.key,
                "label": em.label or em.key,
                "settings_path": em.settings_path,
                "link": em.link
            })
    return missing


# =============================================================================
# List Endpoints
# =============================================================================

@router.get("")
async def list_providers() -> List[Dict[str, str]]:
    """List all providers (summary)."""
    registry = get_provider_registry()
    return [
        {"id": p.id, "name": p.name, "capability": p.capability}
        for p in registry.get_providers()
    ]


@router.get("/capability/{capability}")
async def get_providers_by_capability(capability: str) -> List[Dict[str, Any]]:
    """Get providers for a capability with config status."""
    registry = get_provider_registry()
    settings = get_omegaconf_settings()

    if not registry.get_capability(capability):
        raise HTTPException(status_code=404, detail=f"Capability '{capability}' not found")

    result = []
    for p in registry.find_providers(capability=capability):
        missing = await get_missing_fields(p, settings)
        result.append({
            "id": p.id,
            "name": p.name,
            "description": p.description,
            "mode": p.mode,
            "icon": p.icon,
            "tags": p.tags,
            "configured": len(missing) == 0,
            "missing": missing
        })
    return result


@router.get("/capabilities")
async def list_capabilities() -> List[Dict[str, Any]]:
    """List capabilities with providers and config status."""
    registry = get_provider_registry()
    settings = get_omegaconf_settings()
    selected = await settings.get("selected_providers", {}) or {}

    result = []
    for cap in registry.get_capabilities():
        selected_provider_id = selected.get(cap.id)
        default_provider_id = registry.get_default_provider_id(cap.id, 'cloud')

        # Build providers list with status and credentials (env_maps with values)
        providers = []
        cap_providers = registry.find_providers(capability=cap.id)

        # Check availability for local providers in parallel
        availability_tasks = [
            check_local_provider_available(p, settings) for p in cap_providers
        ]
        availability_results = await asyncio.gather(*availability_tasks)

        for i, p in enumerate(cap_providers):
            missing = await get_missing_fields(p, settings)
            is_available = availability_results[i]

            # Build credentials list (env_maps with has_value and value for non-secrets)
            credentials = []
            for em in p.env_maps:
                value = None
                has_value = bool(em.default)
                if em.settings_path:
                    stored_value = await settings.get(em.settings_path)
                    has_value = stored_value is not None and str(stored_value).strip() != ""
                    # Only return actual value for non-secrets
                    if has_value and em.type != "secret":
                        value = str(stored_value)
                credentials.append({
                    "key": em.key,
                    "type": em.type,
                    "label": em.label or em.key,
                    "settings_path": em.settings_path,
                    "link": em.link,
                    "required": em.required,
                    "default": em.default,
                    "has_value": has_value,
                    "value": value,  # Actual value for non-secrets only
                })

            providers.append({
                "id": p.id,
                "name": p.name,
                "description": p.description,
                "mode": p.mode,
                "icon": p.icon,
                "tags": p.tags,
                "configured": len(missing) == 0,
                "missing": missing,
                "is_selected": p.id == selected_provider_id,
                "is_default": p.id == default_provider_id,
                "credentials": credentials,  # env_maps with has_value
                # Local provider availability
                "available": is_available,
                "setup_needed": p.mode == 'local' and not is_available,
            })

        result.append({
            "id": cap.id,
            "description": cap.description,
            "selected_provider": selected_provider_id,
            "providers": providers
        })

    return result


# =============================================================================
# Single Provider
# =============================================================================

@router.get("/{provider_id}")
async def get_provider(provider_id: str) -> Dict[str, Any]:
    """Get full provider details."""
    registry = get_provider_registry()
    settings = get_omegaconf_settings()

    p = registry.get_provider(provider_id)
    if not p:
        raise HTTPException(status_code=404, detail=f"Provider '{provider_id}' not found")

    missing = await get_missing_fields(p, settings)
    return {
        "id": p.id,
        "name": p.name,
        "description": p.description,
        "capability": p.capability,
        "mode": p.mode,
        "icon": p.icon,
        "tags": p.tags,
        "env_maps": [em.model_dump() for em in p.env_maps],
        "configured": len(missing) == 0,
        "missing": missing
    }


@router.get("/{provider_id}/missing")
async def get_provider_missing(provider_id: str) -> Dict[str, Any]:
    """Get missing required fields for a provider."""
    registry = get_provider_registry()
    settings = get_omegaconf_settings()

    p = registry.get_provider(provider_id)
    if not p:
        raise HTTPException(status_code=404, detail=f"Provider '{provider_id}' not found")

    missing = await get_missing_fields(p, settings)
    return {"provider_id": provider_id, "configured": len(missing) == 0, "missing": missing}


# =============================================================================
# Search
# =============================================================================

class ProviderQuery(BaseModel):
    capability: Optional[str] = None
    mode: Optional[str] = None
    configured: Optional[bool] = None


@router.post("/find")
async def find_providers(query: ProviderQuery) -> List[Dict[str, Any]]:
    """Find providers matching criteria."""
    registry = get_provider_registry()
    settings = get_omegaconf_settings()

    if query.capability and not registry.get_capability(query.capability):
        raise HTTPException(status_code=404, detail=f"Capability '{query.capability}' not found")

    result = []
    for p in registry.find_providers(capability=query.capability, mode=query.mode):
        missing = await get_missing_fields(p, settings)
        is_configured = len(missing) == 0

        if query.configured is not None and is_configured != query.configured:
            continue

        result.append({
            "id": p.id,
            "name": p.name,
            "description": p.description,
            "capability": p.capability,
            "mode": p.mode,
            "configured": is_configured,
            "missing": missing
        })
    return result


# =============================================================================
# Selection Management
# =============================================================================

@router.get("/selected")
async def get_selected() -> Dict[str, Any]:
    """Get current provider selections."""
    settings = get_omegaconf_settings()
    return {
        "wizard_mode": await settings.get("wizard_mode", "quickstart"),
        "selected_providers": await settings.get("selected_providers", {}) or {}
    }


class SelectionUpdate(BaseModel):
    wizard_mode: Optional[str] = None
    selected_providers: Optional[Dict[str, str]] = None


@router.put("/selected")
async def update_selected(update: SelectionUpdate) -> Dict[str, Any]:
    """Update provider selections."""
    settings = get_omegaconf_settings()
    registry = get_provider_registry()
    updates = {}

    if update.wizard_mode:
        if update.wizard_mode not in ['quickstart', 'local', 'custom']:
            raise HTTPException(status_code=400, detail="Invalid wizard_mode")
        updates['wizard_mode'] = update.wizard_mode

    if update.selected_providers:
        for cap, pid in update.selected_providers.items():
            p = registry.get_provider(pid)
            if not p:
                raise HTTPException(status_code=400, detail=f"Unknown provider: {pid}")
            if p.capability != cap:
                raise HTTPException(status_code=400, detail=f"Provider '{pid}' doesn't implement '{cap}'")
        updates['selected_providers'] = update.selected_providers

    if updates:
        await settings.update(updates)

    return {
        "wizard_mode": await settings.get("wizard_mode", "quickstart"),
        "selected_providers": await settings.get("selected_providers", {}) or {}
    }


@router.post("/apply-defaults/{mode}")
async def apply_defaults(mode: str) -> Dict[str, Any]:
    """Apply default providers for a mode."""
    if mode not in ['cloud', 'local']:
        raise HTTPException(status_code=400, detail="mode must be 'cloud' or 'local'")

    registry = get_provider_registry()
    settings = get_omegaconf_settings()

    selected = {
        cap.id: registry.get_default_provider_id(cap.id, mode)
        for cap in registry.get_capabilities()
        if registry.get_default_provider_id(cap.id, mode)
    }
    wizard_mode = 'local' if mode == 'local' else 'quickstart'

    await settings.update({'wizard_mode': wizard_mode, 'selected_providers': selected})
    return {"wizard_mode": wizard_mode, "selected_providers": selected}
