"""
Capability Resolver - Wires provider credentials to service env vars.

When a service declares `uses: [{capability: llm, env_mapping: {...}}]`,
the resolver:
1. Looks up which provider the user selected for that capability
2. Gets the provider's credentials
3. Resolves credential values from settings
4. Maps canonical env vars to service-expected env vars
"""

import logging
from pathlib import Path
from typing import Dict, List, Optional, Any

import yaml

from src.services.provider_registry import get_provider_registry
from src.models.provider import Provider, EnvMap
from src.services.omegaconf_settings import get_omegaconf_settings

logger = logging.getLogger(__name__)

# Config paths
CONFIG_DIR = Path("/config") if Path("/config").exists() else Path("config")
SERVICES_DIR = CONFIG_DIR / "services"


class CapabilityResolver:
    """
    Resolves capability requirements to concrete environment variables.

    Given a service configuration with `uses:` declarations, produces
    a dict of env vars ready to inject into a container.
    """

    def __init__(self):
        self._provider_registry = get_provider_registry()
        self._settings = get_omegaconf_settings()
        self._services_cache: Dict[str, dict] = {}

    async def resolve_for_service(self, service_id: str) -> Dict[str, str]:
        """
        Resolve all env vars for a service.

        Args:
            service_id: Service identifier (e.g., 'chronicle', 'openmemory')

        Returns:
            Dict of ENV_VAR_NAME -> value

        Raises:
            ValueError: If service not found or required capability missing
        """
        service_config = self._load_service_config(service_id)
        if not service_config:
            raise ValueError(f"Service '{service_id}' not found in {SERVICES_DIR}")

        env: Dict[str, str] = {}
        errors: List[str] = []

        # Resolve each capability the service uses
        for use in service_config.get('uses', []):
            try:
                capability_env = await self._resolve_capability(use)
                env.update(capability_env)
            except ValueError as e:
                if use.get('required', True):
                    errors.append(str(e))
                else:
                    logger.warning(f"Optional capability failed: {e}")

        # Resolve service-specific config
        for config_item in service_config.get('config', []):
            try:
                value = await self._resolve_config_item(config_item)
                if value is not None:
                    env[config_item['env_var']] = str(value)
            except Exception as e:
                logger.warning(f"Failed to resolve config {config_item.get('key')}: {e}")

        if errors:
            raise ValueError(
                f"Service '{service_id}' has unresolved capabilities:\n"
                + "\n".join(f"  - {e}" for e in errors)
            )

        return env

    async def _resolve_capability(self, use: dict) -> Dict[str, str]:
        """
        Resolve a single capability usage.

        Args:
            use: Dict with 'capability', 'required', 'env_mapping'

        Returns:
            Dict of env vars for this capability
        """
        capability = use['capability']
        env_mapping = use.get('env_mapping', {})

        # Get the selected provider for this capability
        provider = await self._get_selected_provider(capability)
        if not provider:
            raise ValueError(
                f"No provider selected for capability '{capability}'. "
                f"Run the wizard or set selected_providers.{capability} in settings."
            )

        # Resolve each env mapping the provider offers
        env: Dict[str, str] = {}

        for env_map in provider.env_maps:
            value = await self._resolve_env_map(env_map)

            if value is None:
                if env_map.required:
                    raise ValueError(
                        f"Provider '{provider.id}' requires {env_map.key} but it's not configured. "
                        f"Set {env_map.settings_path or env_map.key} in settings."
                    )
                continue

            # Use provider's env_var directly, apply service env_mapping only for overrides
            provider_env = env_map.env_var or env_map.key.upper()
            service_env = env_mapping.get(provider_env, provider_env)

            env[service_env] = str(value)
            logger.debug(
                f"Resolved {capability}.{env_map.key}: "
                f"{provider_env} -> {service_env} = ***"
            )

        return env

    async def _get_selected_provider(self, capability: str) -> Optional[Provider]:
        """
        Get the provider selected for a capability.

        Checks settings.selected_providers first, falls back to default
        based on wizard_mode.
        """
        # Try to get explicit selection
        selected = await self._settings.get(f"selected_providers.{capability}")
        if selected:
            provider = self._provider_registry.get_provider(selected)
            if provider:
                return provider
            logger.warning(f"Selected provider '{selected}' not found for {capability}")

        # Fall back to default based on wizard mode
        wizard_mode = await self._settings.get("wizard_mode", "quickstart")
        mode = "local" if wizard_mode == "local" else "cloud"

        default_provider = self._provider_registry.get_default_provider(capability, mode)
        if default_provider:
            logger.info(
                f"Using default provider '{default_provider.id}' for {capability} "
                f"(mode={mode})"
            )
            return default_provider

        return None

    async def _resolve_env_map(self, env_map) -> Optional[str]:
        """
        Resolve an env mapping to its actual value.

        Priority:
        1. Settings path lookup (user override)
        2. Default value (provider's default)
        """
        # Try settings path first (user override)
        if env_map.settings_path:
            value = await self._settings.get(env_map.settings_path)
            if value:
                return str(value)

        # Fall back to provider's default
        if env_map.default is not None:
            return env_map.default

        return None

    async def _resolve_config_item(self, config: dict) -> Optional[str]:
        """Resolve a service-specific config item."""
        import secrets

        settings_path = config.get('settings_path')

        if settings_path:
            value = await self._settings.get(settings_path)
            if value is not None:
                return str(value)

        # Handle generate_if_missing for secrets
        if config.get('generate_if_missing') and settings_path:
            generator = config.get('generator', 'random_hex_32')

            if generator == 'random_hex_32':
                value = secrets.token_hex(32)
            elif generator == 'random_hex_16':
                value = secrets.token_hex(16)
            elif generator == 'random_urlsafe':
                value = secrets.token_urlsafe(32)
            else:
                value = secrets.token_hex(32)

            # Save to settings for persistence (using dot notation)
            await self._settings.update({settings_path: value})
            logger.info(f"Generated secret for {settings_path}")
            return value

        return config.get('default')

    def _load_service_config(self, service_id: str) -> Optional[dict]:
        """Load service configuration from YAML."""
        if service_id in self._services_cache:
            return self._services_cache[service_id]

        service_file = SERVICES_DIR / f"{service_id}.yaml"
        if not service_file.exists():
            return None

        try:
            with open(service_file, 'r') as f:
                config = yaml.safe_load(f)
                self._services_cache[service_id] = config
                return config
        except Exception as e:
            logger.error(f"Failed to load service config {service_file}: {e}")
            return None

    def reload(self) -> None:
        """Clear caches and reload."""
        self._services_cache = {}
        self._provider_registry.reload()

    # =========================================================================
    # Validation Methods
    # =========================================================================

    async def validate_service(self, service_id: str) -> Dict[str, Any]:
        """
        Validate a service can be started.

        Returns dict with:
        - can_start: bool
        - missing_capabilities: List of missing required capabilities
        - missing_credentials: List of missing required credentials
        - warnings: List of optional issues
        """
        service_config = self._load_service_config(service_id)
        if not service_config:
            return {
                "can_start": False,
                "error": f"Service '{service_id}' not found",
                "missing_capabilities": [],
                "missing_credentials": [],
                "warnings": []
            }

        missing_caps = []
        missing_creds = []
        warnings = []

        for use in service_config.get('uses', []):
            capability = use['capability']
            required = use.get('required', True)

            provider = await self._get_selected_provider(capability)
            if not provider:
                if required:
                    missing_caps.append({
                        "capability": capability,
                        "message": f"No provider selected for {capability}"
                    })
                else:
                    warnings.append(f"Optional capability {capability} not configured")
                continue

            # Check env mappings
            for env_map in provider.env_maps:
                if not env_map.required:
                    continue

                value = await self._resolve_env_map(env_map)
                if not value:
                    if required:
                        missing_creds.append({
                            "capability": capability,
                            "provider": provider.id,
                            "credential": env_map.key,
                            "settings_path": env_map.settings_path,
                            "link": env_map.link,
                            "label": env_map.label or env_map.key
                        })
                    else:
                        warnings.append(
                            f"Optional {capability} missing {env_map.key}"
                        )

        return {
            "can_start": len(missing_caps) == 0 and len(missing_creds) == 0,
            "missing_capabilities": missing_caps,
            "missing_credentials": missing_creds,
            "warnings": warnings
        }


# Global singleton
_resolver: Optional[CapabilityResolver] = None


def get_capability_resolver() -> CapabilityResolver:
    """Get the global CapabilityResolver instance."""
    global _resolver
    if _resolver is None:
        _resolver = CapabilityResolver()
    return _resolver
