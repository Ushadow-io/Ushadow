"""
Provider selection and capability endpoints.

Provides REST API for:
- Listing available capabilities and their providers
- Getting/setting selected providers per capability
- Validating service configurations
"""

import logging
from typing import Dict, List, Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from src.services.provider_registry import get_provider_registry
from src.services.capability_resolver import get_capability_resolver
from src.services.omegaconf_settings import get_omegaconf_settings

logger = logging.getLogger(__name__)
router = APIRouter()


# =============================================================================
# Response Models
# =============================================================================

class ProviderCredentialResponse(BaseModel):
    """Credential definition for a provider."""
    key: str
    label: Optional[str] = None
    type: str = "string"
    required: bool = False
    link: Optional[str] = None
    settings_path: Optional[str] = None
    has_value: bool = False  # Whether this credential is configured
    default: Optional[str] = None  # Default value if not configured
    value: Optional[str] = None  # Current effective value (non-secrets only)


class ProviderResponse(BaseModel):
    """Provider information."""
    id: str
    name: str
    description: Optional[str] = None
    mode: str  # cloud | local
    is_selected: bool = False
    is_default: bool = False
    credentials: List[ProviderCredentialResponse] = []
    tags: List[str] = []


class CapabilityResponse(BaseModel):
    """Capability with its providers."""
    id: str
    description: str
    selected_provider: Optional[str] = None
    providers: List[ProviderResponse] = []


class SelectedProvidersResponse(BaseModel):
    """Current provider selections."""
    wizard_mode: str
    selected_providers: Dict[str, str]


class SelectedProvidersUpdate(BaseModel):
    """Update provider selections."""
    wizard_mode: Optional[str] = None
    selected_providers: Optional[Dict[str, str]] = None


class ServiceValidationResponse(BaseModel):
    """Service validation result."""
    service_id: str
    can_start: bool
    missing_capabilities: List[Dict[str, Any]] = []
    missing_credentials: List[Dict[str, Any]] = []
    warnings: List[str] = []


# =============================================================================
# Endpoints
# =============================================================================

@router.get("/capabilities", response_model=List[CapabilityResponse])
async def list_capabilities():
    """
    List all capabilities with their available providers.

    Returns capabilities (llm, transcription, memory) with:
    - Which provider is currently selected
    - All available providers for each
    - Credential requirements per provider
    """
    registry = get_provider_registry()
    settings = get_omegaconf_settings()

    capabilities = []

    for cap in registry.get_capabilities():
        # Get selected provider for this capability
        selected_id = await settings.get(f"selected_providers.{cap.id}")

        # Get all providers for this capability
        providers = []
        for provider in registry.get_providers_for_capability(cap.id):
            # Check if credentials are configured
            credentials = []
            for key, cred in provider.credentials.items():
                has_value = False
                current_value = None

                if cred.value is not None:
                    has_value = True
                    current_value = cred.value
                elif cred.settings_path:
                    saved_value = await settings.get(cred.settings_path)
                    if saved_value is not None and str(saved_value).strip() != "":
                        has_value = True
                        current_value = str(saved_value)

                # Use default if no saved value
                effective_value = current_value if current_value else cred.default

                # Only expose value for non-secret types
                display_value = effective_value if cred.type != 'secret' else None

                credentials.append(ProviderCredentialResponse(
                    key=key,
                    label=cred.label or key,
                    type=cred.type,
                    required=cred.required,
                    link=cred.link,
                    settings_path=cred.settings_path,
                    has_value=has_value,
                    default=cred.default,
                    value=display_value
                ))

            # Check if this is the default for any mode
            is_default = (
                registry.get_default_provider_id(cap.id, 'cloud') == provider.id or
                registry.get_default_provider_id(cap.id, 'local') == provider.id
            )

            providers.append(ProviderResponse(
                id=provider.id,
                name=provider.name,
                description=provider.description,
                mode=provider.mode,
                is_selected=(provider.id == selected_id),
                is_default=is_default,
                credentials=credentials,
                tags=provider.ui.get('tags', [])
            ))

        capabilities.append(CapabilityResponse(
            id=cap.id,
            description=cap.description,
            selected_provider=selected_id,
            providers=providers
        ))

    return capabilities


@router.get("/capabilities/{capability_id}", response_model=CapabilityResponse)
async def get_capability(capability_id: str):
    """Get a specific capability with its providers."""
    registry = get_provider_registry()
    settings = get_omegaconf_settings()

    cap = registry.get_capability(capability_id)
    if not cap:
        raise HTTPException(status_code=404, detail=f"Capability '{capability_id}' not found")

    selected_id = await settings.get(f"selected_providers.{capability_id}")

    providers = []
    for provider in registry.get_providers_for_capability(capability_id):
        credentials = []
        for key, cred in provider.credentials.items():
            has_value = False
            current_value = None

            if cred.value is not None:
                has_value = True
                current_value = cred.value
            elif cred.settings_path:
                saved_value = await settings.get(cred.settings_path)
                if saved_value is not None and str(saved_value).strip() != "":
                    has_value = True
                    current_value = str(saved_value)

            # Use default if no saved value
            effective_value = current_value if current_value else cred.default

            # Only expose value for non-secret types
            display_value = effective_value if cred.type != 'secret' else None

            credentials.append(ProviderCredentialResponse(
                key=key,
                label=cred.label or key,
                type=cred.type,
                required=cred.required,
                link=cred.link,
                settings_path=cred.settings_path,
                has_value=has_value,
                default=cred.default,
                value=display_value
            ))

        is_default = (
            registry.get_default_provider_id(capability_id, 'cloud') == provider.id or
            registry.get_default_provider_id(capability_id, 'local') == provider.id
        )

        providers.append(ProviderResponse(
            id=provider.id,
            name=provider.name,
            description=provider.description,
            mode=provider.mode,
            is_selected=(provider.id == selected_id),
            is_default=is_default,
            credentials=credentials,
            tags=provider.ui.get('tags', [])
        ))

    return CapabilityResponse(
        id=cap.id,
        description=cap.description,
        selected_provider=selected_id,
        providers=providers
    )


@router.get("/selected", response_model=SelectedProvidersResponse)
async def get_selected_providers():
    """Get current provider selections."""
    settings = get_omegaconf_settings()

    wizard_mode = await settings.get("wizard_mode", "quickstart")
    selected = await settings.get("selected_providers", {})

    return SelectedProvidersResponse(
        wizard_mode=wizard_mode,
        selected_providers=selected or {}
    )


@router.put("/selected", response_model=SelectedProvidersResponse)
async def update_selected_providers(update: SelectedProvidersUpdate):
    """
    Update provider selections.

    Can update wizard_mode and/or specific provider selections.
    """
    settings = get_omegaconf_settings()
    registry = get_provider_registry()

    updates = {}

    # Update wizard mode if provided
    if update.wizard_mode:
        if update.wizard_mode not in ['quickstart', 'local', 'custom']:
            raise HTTPException(
                status_code=400,
                detail="wizard_mode must be 'quickstart', 'local', or 'custom'"
            )
        updates['wizard_mode'] = update.wizard_mode

    # Update selected providers if provided
    if update.selected_providers:
        # Validate each selection
        for capability, provider_id in update.selected_providers.items():
            cap = registry.get_capability(capability)
            if not cap:
                raise HTTPException(
                    status_code=400,
                    detail=f"Unknown capability: {capability}"
                )

            provider = registry.get_provider(provider_id)
            if not provider:
                raise HTTPException(
                    status_code=400,
                    detail=f"Unknown provider: {provider_id}"
                )

            if provider.capability != capability:
                raise HTTPException(
                    status_code=400,
                    detail=f"Provider '{provider_id}' does not implement '{capability}'"
                )

        updates['selected_providers'] = update.selected_providers

    # Apply updates
    if updates:
        await settings.update(updates)

    # Return updated state
    wizard_mode = await settings.get("wizard_mode", "quickstart")
    selected = await settings.get("selected_providers", {})

    return SelectedProvidersResponse(
        wizard_mode=wizard_mode,
        selected_providers=selected or {}
    )


@router.post("/select/{capability}/{provider_id}")
async def select_provider(capability: str, provider_id: str):
    """
    Select a provider for a capability.

    Shorthand for PUT /selected with a single capability update.
    """
    registry = get_provider_registry()
    settings = get_omegaconf_settings()

    # Validate
    cap = registry.get_capability(capability)
    if not cap:
        raise HTTPException(status_code=404, detail=f"Capability '{capability}' not found")

    provider = registry.get_provider(provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail=f"Provider '{provider_id}' not found")

    if provider.capability != capability:
        raise HTTPException(
            status_code=400,
            detail=f"Provider '{provider_id}' does not implement '{capability}'"
        )

    # Update
    await settings.update({
        "selected_providers": {capability: provider_id}
    })

    return {"message": f"Selected {provider_id} for {capability}"}


@router.get("/validate/{service_id}", response_model=ServiceValidationResponse)
async def validate_service(service_id: str):
    """
    Validate a service can be started.

    Checks:
    - All required capabilities have selected providers
    - All required credentials are configured

    Returns details about what's missing if not ready.
    """
    resolver = get_capability_resolver()
    result = await resolver.validate_service(service_id)

    return ServiceValidationResponse(
        service_id=service_id,
        can_start=result.get('can_start', False),
        missing_capabilities=result.get('missing_capabilities', []),
        missing_credentials=result.get('missing_credentials', []),
        warnings=result.get('warnings', [])
    )


@router.post("/apply-defaults/{mode}")
async def apply_default_providers(mode: str):
    """
    Apply default providers for a wizard mode.

    Args:
        mode: 'cloud' or 'local'

    Sets selected_providers to the default for each capability
    based on the specified mode.
    """
    if mode not in ['cloud', 'local']:
        raise HTTPException(
            status_code=400,
            detail="mode must be 'cloud' or 'local'"
        )

    registry = get_provider_registry()
    settings = get_omegaconf_settings()

    selected = {}
    for cap in registry.get_capabilities():
        default = registry.get_default_provider_id(cap.id, mode)
        if default:
            selected[cap.id] = default

    wizard_mode = 'local' if mode == 'local' else 'quickstart'

    await settings.update({
        'wizard_mode': wizard_mode,
        'selected_providers': selected
    })

    return {
        "message": f"Applied {mode} defaults",
        "wizard_mode": wizard_mode,
        "selected_providers": selected
    }
