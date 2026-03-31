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
from typing import Dict, List, Optional, Any

from src.config.secrets import mask_if_secret
from src.services.provider_registry import get_provider_registry
from src.services.compose_registry import get_compose_registry
from src.models.provider import Provider
from src.utils.logging import get_logger

logger = get_logger(__name__, prefix="Resolve")


class CapabilityResolver:
    """
    Resolves capability requirements to concrete environment variables.

    Given a service configuration with `uses:` declarations, produces
    a dict of env vars ready to inject into a container.
    """

    def __init__(self):
        from src.config import get_settings
        self._provider_registry = get_provider_registry()
        self._compose_registry = get_compose_registry()
        self._settings = get_settings()
        self._services_cache: Dict[str, dict] = {}

    async def resolve_capabilities(
        self,
        requires: List[str],
        capability_env_mappings: Dict[str, Dict[str, str]],
        consumer_id: Optional[str] = None,
    ) -> Dict[str, str]:
        """
        Resolve capability env vars using explicit mappings from x-ushadow header.

        This is the preferred entry point for the settings module — it already has
        the service's capability_env_mappings, so we don't re-discover them.

        Args:
            requires: Capabilities the service needs (e.g. ["llm", "transcription"])
            capability_env_mappings: From x-ushadow: {capability -> {canonical_key -> env_var}}
            consumer_id: Optional service ID for wiring lookup

        Returns:
            Dict of ENV_VAR_NAME -> value (e.g. {"TRANSCRIPTION_MODEL": "Systran/..."})
        """
        env: Dict[str, str] = {}
        for capability in requires:
            use = {
                'capability': capability,
                'required': False,  # Best-effort: don't let one missing cap block others
                'env_mapping': capability_env_mappings.get(capability, {}),
            }
            try:
                vals = await self._resolve_capability(use, consumer_id)
                env.update(vals)
            except ValueError as e:
                logger.debug(f"Could not resolve {capability} for {consumer_id}: {e}")
        return env

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

    async def resolve_for_instance(self, config_id: str) -> Dict[str, str]:
        """
        Resolve all env vars for an instance or compose service, using its wiring configuration.

        This method checks instance-level wiring before falling back to
        global selected_providers.

        Args:
            config_id: ServiceConfig identifier or compose service ID (e.g., "chronicle-compose:chronicle-backend")

        Returns:
            Dict of ENV_VAR_NAME -> value

        Raises:
            ValueError: If instance not found or required capability missing
        """
        from src.services.service_config_manager import get_service_config_manager
        from src.services.compose_registry import get_compose_registry

        service_config_manager = get_service_config_manager()
        instance = service_config_manager.get_service_config(config_id)

        # If not an instance, check if it's a compose service
        if not instance:
            # Try to get compose service
            registry = get_compose_registry()
            compose_service = registry.get_service(config_id)
            if compose_service:
                # Resolve capabilities for compose service using wiring
                return await self._resolve_for_compose_service(compose_service, config_id)
            raise ValueError(f"ServiceConfig or service '{config_id}' not found")

        # Get the service config from the service config's template
        service_config = self._load_service_config(instance.template_id)
        if not service_config:
            raise ValueError(
                f"Service template '{instance.template_id}' not found for instance '{config_id}'"
            )

        env: Dict[str, str] = {}
        errors: List[str] = []

        # Resolve each capability, passing the service config ID for wiring lookup
        for use in service_config.get('uses', []):
            try:
                capability_env = await self._resolve_capability(use, config_id)
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
                f"ServiceConfig '{config_id}' has unresolved capabilities:\n"
                + "\n".join(f"  - {e}" for e in errors)
            )

        logger.info(f"Resolved {len(env)} env vars for instance '{config_id}'")
        return env

    async def resolve_for_instance_with_sources(self, config_id: str) -> Dict[str, 'EnvVarValue']:
        """
        Resolve all env vars for an instance WITH source tracking.

        Args:
            config_id: ServiceConfig identifier or compose service ID

        Returns:
            Dict of ENV_VAR_NAME -> EnvVarValue (with value, source, source_path)

        Raises:
            ValueError: If instance not found or required capability missing
        """
        from src.models.service_config import EnvVarValue, EnvVarSource
        from src.services.service_config_manager import get_service_config_manager

        service_config_manager = get_service_config_manager()
        instance = service_config_manager.get_service_config(config_id)

        # If not an instance, check if it's a compose service
        if not instance:
            from src.services.compose_registry import get_compose_registry
            registry = get_compose_registry()
            compose_service = registry.get_service(config_id)
            if compose_service:
                # For compose services, use the non-source-tracked method for now
                # TODO: Add source tracking for compose services
                simple_env = await self._resolve_for_compose_service(compose_service, config_id)
                return {
                    k: EnvVarValue(value=v, source=EnvVarSource.PROVIDER, source_path=None)
                    for k, v in simple_env.items()
                }
            raise ValueError(f"ServiceConfig or service '{config_id}' not found")

        # Get the service config from the service config's template
        service_config = self._load_service_config(instance.template_id)
        if not service_config:
            raise ValueError(
                f"Service template '{instance.template_id}' not found for instance '{config_id}'"
            )

        env: Dict[str, EnvVarValue] = {}
        errors: List[str] = []

        # Resolve each capability with source tracking
        for use in service_config.get('uses', []):
            try:
                capability_env = await self._resolve_capability_with_sources(use, config_id)
                env.update(capability_env)
            except ValueError as e:
                if use.get('required', True):
                    errors.append(str(e))
                else:
                    logger.warning(f"Optional capability failed: {e}")

        if errors:
            raise ValueError(
                f"ServiceConfig '{config_id}' has unresolved capabilities:\n"
                + "\n".join(f"  - {e}" for e in errors)
            )

        logger.info(f"Resolved {len(env)} env vars with sources for instance '{config_id}'")
        return env

    async def _resolve_capability_with_sources(
        self,
        use: dict,
        consumer_config_id: Optional[str] = None
    ) -> Dict[str, 'EnvVarValue']:
        """
        Resolve a single capability usage WITH source tracking.

        Args:
            use: Dict with 'capability', 'required', 'env_mapping'
            consumer_config_id: Optional instance ID if resolving for an instance

        Returns:
            Dict of env vars with EnvVarValue objects
        """
        from src.models.service_config import EnvVarValue, EnvVarSource

        capability = use['capability']
        env_mapping = use.get('env_mapping', {})

        # Get the selected provider for this capability
        provider, provider_config = await self._get_selected_provider(capability, consumer_config_id)
        print(f"[capability_resolver] {capability} → {provider.id if provider else None} (consumer={consumer_config_id}, instance={provider_config.id if provider_config else None})")
        if not provider:
            raise ValueError(
                f"No provider selected for capability '{capability}'. "
                f"Run the wizard or set selected_providers.{capability} in settings."
            )

        # Look up canonical env var names from capability contract
        cap_def = self._provider_registry.get_capability(capability)
        cap_provides = cap_def.provides if cap_def else {}

        # Resolve each env mapping the provider offers
        env: Dict[str, EnvVarValue] = {}

        for env_map in provider.env_maps:
            derived_path = f"{provider.capability}.{provider.id}.{env_map.key}"
            result = await self._resolve_env_map_with_source(env_map, provider_config, settings_path=derived_path)

            if result is None:
                if env_map.required:
                    raise ValueError(
                        f"Provider '{provider.id}' requires {env_map.key} but it's not configured. "
                        f"Set {derived_path} in settings."
                    )
                continue

            value, source, source_path = result

            provider_env = env_map.env_var or env_map.key.upper()
            cap_key = cap_provides.get(env_map.key)
            canonical_env = cap_key.env[0] if (cap_key and cap_key.env) else None

            explicit_mapping = env_mapping.get(env_map.key) or env_mapping.get(provider_env)
            service_env = explicit_mapping or canonical_env or provider_env

            env_val = EnvVarValue(value=value, source=source, source_path=source_path)
            env[service_env] = env_val

            # When no explicit mapping is declared and we used the canonical name,
            # also inject under the provider's own env_var name so services that
            # use provider-specific names get Source.CAPABILITY marking too.
            if not explicit_mapping and canonical_env and provider_env != canonical_env:
                env.setdefault(provider_env, env_val)

            logger.debug(
                f"Resolved {capability}.{env_map.key}: "
                f"{provider_env} -> {service_env} = *** (source={source})"
            )

        return env

    async def _resolve_for_compose_service(self, compose_service, service_id: str) -> Dict[str, str]:
        """
        Resolve env vars for a compose service using wiring.

        Args:
            compose_service: DiscoveredService from compose registry
            service_id: Full service ID for wiring lookup (e.g., "chronicle-compose:chronicle-backend")

        Returns:
            Dict of ENV_VAR_NAME -> value
        """
        env: Dict[str, str] = {}
        errors: List[str] = []

        # Resolve each required capability using wiring
        for capability in compose_service.requires:
            try:
                # Create a minimal "use" dict for _resolve_capability
                use = {
                    'capability': capability,
                    'required': True,
                    'env_mapping': compose_service.capability_env_mappings.get(capability, {}),
                }
                capability_env = await self._resolve_capability(use, service_id)
                env.update(capability_env)
            except ValueError as e:
                errors.append(str(e))

        if errors:
            logger.warning(
                f"Service '{service_id}' has unresolved capabilities (returning partial):\n"
                + "\n".join(f"  - {e}" for e in errors)
            )

        logger.info(f"Resolved {len(env)} env vars for compose service '{service_id}'")
        return env

    async def _resolve_capability(
        self,
        use: dict,
        consumer_config_id: Optional[str] = None
    ) -> Dict[str, str]:
        """
        Resolve a single capability usage.

        Args:
            use: Dict with 'capability', 'required', 'env_mapping'
            consumer_config_id: Optional instance ID if resolving for an instance

        Returns:
            Dict of env vars for this capability
        """
        capability = use['capability']
        env_mapping = use.get('env_mapping', {})

        # Get the selected provider for this capability (and instance if applicable)
        provider, provider_config = await self._get_selected_provider(capability, consumer_config_id)
        print(f"[capability_resolver] {capability} → {provider.id if provider else None} (consumer={consumer_config_id}, instance={provider_config.id if provider_config else None})")
        if not provider:
            raise ValueError(
                f"No provider selected for capability '{capability}'. "
                f"Run the wizard or set selected_providers.{capability} in settings."
            )

        # Look up canonical env var names from capability contract
        cap_def = self._provider_registry.get_capability(capability)
        cap_provides = cap_def.provides if cap_def else {}

        # Resolve each env mapping the provider offers
        env: Dict[str, str] = {}

        for env_map in provider.env_maps:
            # Auto-derive settings path: {capability}.{provider_id}.{key}
            derived_path = f"{provider.capability}.{provider.id}.{env_map.key}"
            value = await self._resolve_env_map(env_map, provider_config, settings_path=derived_path)

            if value is None:
                if env_map.required:
                    raise ValueError(
                        f"Provider '{provider.id}' requires {env_map.key} but it's not configured. "
                        f"Set {derived_path} in settings."
                    )
                continue

            # Resolve the env var name to inject into the consumer:
            # 1. Explicit mapping from consumer's x-ushadow capability_env_mappings
            # 2. Capability's canonical env var (first in env list)
            # 3. Provider's own env_var as fallback
            provider_env = env_map.env_var or env_map.key.upper()
            cap_key = cap_provides.get(env_map.key)
            canonical_env = cap_key.env[0] if (cap_key and cap_key.env) else None

            explicit_mapping = env_mapping.get(env_map.key) or env_mapping.get(provider_env)
            service_env = explicit_mapping or canonical_env or provider_env

            env[service_env] = str(value)

            # When no explicit mapping is declared and we used the canonical name,
            # also inject under the provider's own env_var name so that services
            # using provider-specific names (e.g. OPENAI_API_KEY instead of
            # LLM_API_KEY) are resolved via Source.CAPABILITY rather than falling
            # through to the config-default path.
            if not explicit_mapping and canonical_env and provider_env != canonical_env:
                env.setdefault(provider_env, str(value))

            logger.debug(
                f"Resolved {capability}.{env_map.key}: "
                f"{provider_env} -> {service_env} = ***"
            )

        return env

    def _get_provider_for_compose_service(self, service_id: str) -> Optional[Provider]:
        """
        Get the YAML Provider for a compose service via its provider_id link.

        Compose services that implement a capability declare which YAML provider
        definition they use (e.g. faster-whisper -> provider_id: whisper-local).
        This reuses the existing credential schema without duplicating it.

        Returns:
            The linked YAML Provider, or None if not found.
        """
        service = self._compose_registry.get_service(service_id)
        if not service or not service.provider_id:
            return None
        return self._provider_registry.get_provider(service.provider_id)

    async def _get_selected_provider(
        self,
        capability: str,
        consumer_config_id: Optional[str] = None
    ) -> tuple[Optional[Provider], Optional[any]]:
        """
        Get the provider selected for a capability.

        Resolution order:
        1. ServiceConfig wiring (if consumer_config_id provided)
        2. ServiceConfig defaults (if consumer_config_id provided)
        3. settings.selected_providers
        4. Default based on wizard_mode

        Returns:
            Tuple of (Provider, provider_config)
            - Provider: The provider template
            - provider_config: The specific instance if wired, None if using global config
        """
        # 1. Check instance wiring and defaults (if resolving for an instance)
        if consumer_config_id:
            from src.services.service_config_manager import get_service_config_manager
            service_config_manager = get_service_config_manager()
            provider_config = service_config_manager.get_provider_for_capability(
                consumer_config_id, capability
            )
            if provider_config:
                # The instance's template_id is the provider ID — try YAML provider first
                provider = self._provider_registry.get_provider(provider_config.template_id)
                if provider:
                    logger.info(
                        f"Using wired provider instance '{provider_config.id}' "
                        f"for {capability} (consumer={consumer_config_id})"
                    )
                    # Return both provider template AND instance for config override
                    return provider, provider_config

                # Fallback: compose service linked to a YAML provider via provider_id
                compose_provider = self._get_provider_for_compose_service(provider_config.template_id)
                if compose_provider:
                    logger.info(
                        f"Using compose service '{provider_config.template_id}' "
                        f"backed by YAML provider '{compose_provider.id}' "
                        f"for {capability} (consumer={consumer_config_id})"
                    )
                    return compose_provider, provider_config

            # 1b. Inline wiring on the ServiceConfig may reference a YAML provider ID directly
            # (e.g. wiring: {llm: "ollama-net"}).  get_provider_for_capability() only resolves
            # wiring entries whose source is *another ServiceConfig*, so it silently drops these.
            # Check the consumer's wiring dict directly and treat the source as a provider ID.
            check_ids = [consumer_config_id]
            if ':' in consumer_config_id:
                check_ids.append(consumer_config_id.split(':', 1)[1])
            for check_id in check_ids:
                consumer_cfg = service_config_manager.get_service_config(check_id)
                if consumer_cfg and capability in consumer_cfg.wiring:
                    source_id = consumer_cfg.wiring[capability]
                    provider = self._provider_registry.get_provider(source_id)
                    if provider:
                        logger.info(
                            f"Using inline-wired provider '{source_id}' "
                            f"for {capability} (consumer={consumer_config_id})"
                        )
                        return provider, None
                    compose_provider = self._get_provider_for_compose_service(source_id)
                    if compose_provider:
                        logger.info(
                            f"Using inline-wired compose service '{source_id}' "
                            f"backed by YAML provider '{compose_provider.id}' "
                            f"for {capability} (consumer={consumer_config_id})"
                        )
                        return compose_provider, None
                    break  # Found wiring entry — don't try other candidate IDs


        # 2. Try to get explicit selection from settings
        selected = await self._settings.get(f"selected_providers.{capability}")
        if selected:
            provider = self._provider_registry.get_provider(selected)
            if provider:
                # Look up ServiceConfig for this provider so user-configured values
                # (e.g. a custom server_url) take priority over template defaults.
                from src.services.service_config_manager import get_service_config_manager
                provider_config = get_service_config_manager().get_service_config_by_template(provider.id)
                return provider, provider_config

            # Fallback: selected value may be a compose service ID (e.g. "faster-whisper")
            # that links to a YAML provider via provider_id
            compose_provider = self._get_provider_for_compose_service(selected)
            if compose_provider:
                logger.info(
                    f"Using compose service '{selected}' backed by YAML provider "
                    f"'{compose_provider.id}' for {capability}"
                )
                return compose_provider, None


            logger.warning(f"Selected provider '{selected}' not found for {capability}")

        # 3. Fall back to default based on wizard mode
        wizard_mode = await self._settings.get("wizard_mode", "quickstart")
        mode = "local" if wizard_mode == "local" else "cloud"

        default_provider = self._provider_registry.get_default_provider(capability, mode)
        if default_provider:
            logger.info(
                f"Using default provider '{default_provider.id}' for {capability} "
                f"(mode={mode})"
            )
            from src.services.service_config_manager import get_service_config_manager
            provider_config = get_service_config_manager().get_service_config_by_template(default_provider.id)
            return default_provider, provider_config

        return None, None

    async def _resolve_env_map(self, env_map, provider_config=None, settings_path: Optional[str] = None) -> Optional[str]:
        """
        Resolve an env mapping to its actual value.

        Priority:
        1. ServiceConfig-specific config override (if provider_config provided)
        2. Settings path lookup — auto-derived as {capability}.{provider_id}.{key}
        3. Default value (provider's default)

        Args:
            env_map: The environment map to resolve
            provider_config: Optional instance with config overrides
            settings_path: Derived settings path (e.g. "transcription.deepgram.api_key")
        """
        # 1. Check instance-specific config override first
        if provider_config and hasattr(provider_config, 'config'):
            config_values = provider_config.config.values if provider_config.config else {}
            if env_map.key in config_values:
                value = config_values[env_map.key]
                if value:
                    logger.info(
                        f"[Capability Resolver] {env_map.key} -> {mask_if_secret(env_map.key, str(value))} "
                        f"(from instance '{provider_config.id}' config override)"
                    )
                    return str(value)

        # 2. Try auto-derived settings path
        path = settings_path
        if path:
            value = await self._settings.get(path)
            if value:
                logger.info(
                    f"[Capability Resolver] {env_map.key} -> {mask_if_secret(env_map.key, str(value))} "
                    f"(from settings: {path})"
                )
                return str(value)

        # 2b. Fallback: fuzzy-match the provider env var name across all settings.
        #     Handles migration where keys were stored under old wizard paths
        #     (e.g. api_keys.openai_api_key) rather than the derived path.
        env_var_name = env_map.env_var or env_map.key.upper()
        setting_result = await self._settings.find_value_for_env_var(env_var_name)
        if setting_result:
            fallback_path, fallback_value = setting_result
            if fallback_value:
                logger.info(
                    f"[Capability Resolver] {env_map.key} -> {mask_if_secret(env_map.key, str(fallback_value))} "
                    f"(from settings fallback: {fallback_path})"
                )
                return str(fallback_value)

        # 3. Fall back to provider's default
        if env_map.default is not None:
            logger.info(
                f"[Capability Resolver] {env_map.key} -> {mask_if_secret(env_map.key, env_map.default)} "
                f"(using provider default)"
            )
            return env_map.default

        return None

    async def _resolve_env_map_with_source(self, env_map, provider_config=None, settings_path: Optional[str] = None) -> Optional[tuple[str, str, Optional[str]]]:
        """
        Resolve an env mapping to its actual value WITH source tracking.

        Returns:
            Tuple of (value, source, source_path) or None if not resolved
            - value: The resolved string value
            - source: One of: "override", "settings", "default"
            - source_path: Settings path or provider ID for the source
        """
        from src.models.service_config import EnvVarSource

        # 1. Check instance-specific config override first
        if provider_config and hasattr(provider_config, 'config'):
            config_values = provider_config.config.values if provider_config.config else {}
            if env_map.key in config_values:
                value = config_values[env_map.key]
                if value:
                    logger.info(
                        f"[Capability Resolver] {env_map.key} -> {mask_if_secret(env_map.key, str(value))} "
                        f"(from instance '{provider_config.id}' config override)"
                    )
                    return (str(value), EnvVarSource.OVERRIDE.value, provider_config.id)

        # 2. Try auto-derived settings path
        path = settings_path
        if path:
            value = await self._settings.get(path)
            if value:
                logger.info(
                    f"[Capability Resolver] {env_map.key} -> {mask_if_secret(env_map.key, str(value))} "
                    f"(from settings: {path})"
                )
                return (str(value), EnvVarSource.SETTINGS.value, path)

        # 2b. Fallback: fuzzy-match the provider env var name across all settings.
        #     Handles migration where keys were stored under old wizard paths
        #     (e.g. api_keys.openai_api_key) rather than the derived path.
        env_var_name = env_map.env_var or env_map.key.upper()
        setting_result = await self._settings.find_value_for_env_var(env_var_name)
        if setting_result:
            fallback_path, fallback_value = setting_result
            if fallback_value:
                logger.info(
                    f"[Capability Resolver] {env_map.key} -> {mask_if_secret(env_map.key, str(fallback_value))} "
                    f"(from settings fallback: {fallback_path})"
                )
                return (str(fallback_value), EnvVarSource.SETTINGS.value, fallback_path)

        # 3. Fall back to provider's default
        if env_map.default is not None:
            logger.info(
                f"[Capability Resolver] {env_map.key} -> {mask_if_secret(env_map.key, env_map.default)} "
                f"(using provider default)"
            )
            return (env_map.default, EnvVarSource.DEFAULT.value, None)

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
        """
        Load service configuration from ComposeServiceRegistry.

        Converts the DiscoveredService.requires list to the expected format:
        {'uses': [{'capability': 'llm', 'required': True}, ...]}

        Matching logic:
        1. Exact service ID match (e.g., 'ushadow-compose:ushadow-backend')
        2. Service name match (e.g., 'chronicle-backend')
        3. Compose file base name match (e.g., 'chronicle' matches chronicle-compose.yaml)
        """
        if service_id in self._services_cache:
            return self._services_cache[service_id]

        # Try exact service ID match first (e.g., "ushadow-compose:ushadow-backend")
        service = self._compose_registry.get_service(service_id)

        # If not found, try matching by service name only
        if not service:
            service = self._compose_registry.get_service_by_name(service_id)

        # If not found, try matching by compose file base name
        # e.g., 'chronicle' matches services in 'chronicle-compose.yaml'
        if not service:
            for s in self._compose_registry.get_services():
                compose_base = s.compose_file.stem.replace('-compose', '')
                if compose_base == service_id:
                    service = s
                    break

        if not service:
            logger.debug(f"Service '{service_id}' not found in compose registry")
            return None

        # Convert requires list to uses format, including capability_env_mappings
        # capability_env_mappings: {capability -> {canonical_key -> service_env_var}}
        uses = [
            {
                'capability': cap,
                'required': True,
                'env_mapping': service.capability_env_mappings.get(cap, {}),
            }
            for cap in service.requires
        ]

        config = {
            'uses': uses,
            'service_name': service.service_name,
            'compose_file': str(service.compose_file),
        }

        self._services_cache[service_id] = config
        logger.debug(f"Loaded service config for '{service_id}': requires {service.requires}")
        return config

    def reload(self) -> None:
        """Clear caches and reload."""
        self._services_cache = {}
        self._provider_registry.reload()
        self._compose_registry.reload()

    # =========================================================================
    # Validation Methods
    # =========================================================================

    async def validate_service(self, service_id: str) -> Dict[str, Any]:
        """
        Validate a service can be started.

        Returns dict with:
        - can_start: bool
        - missing_capabilities: List of missing required capabilities
        - missing_keys: List of missing required keys (API keys, secrets, etc.)
        - warnings: List of optional issues
        """
        service_config = self._load_service_config(service_id)
        if not service_config:
            return {
                "can_start": False,
                "error": f"Service '{service_id}' not found",
                "missing_capabilities": [],
                "missing_keys": [],
                "warnings": []
            }

        missing_caps = []
        missing_keys = []
        warnings = []

        for use in service_config.get('uses', []):
            capability = use['capability']
            required = use.get('required', True)

            provider, _ = await self._get_selected_provider(capability)
            if not provider:
                if required:
                    missing_caps.append({
                        "capability": capability,
                        "message": f"No provider selected for {capability}"
                    })
                else:
                    warnings.append(f"Optional capability {capability} not configured")
                continue

            # Check provider keys (API keys, secrets, etc.)
            for env_map in provider.env_maps:
                if not env_map.required:
                    continue

                derived_path = f"{provider.capability}.{provider.id}.{env_map.key}"
                value = await self._resolve_env_map(env_map, settings_path=derived_path)
                if not value:
                    if required:
                        missing_keys.append({
                            "capability": capability,
                            "provider": provider.id,
                            "key": env_map.key,
                            "settings_path": derived_path,
                            "link": env_map.link,
                            "label": env_map.label or env_map.key
                        })
                    else:
                        warnings.append(
                            f"Optional {capability} missing {env_map.key}"
                        )

        return {
            "can_start": len(missing_caps) == 0 and len(missing_keys) == 0,
            "missing_capabilities": missing_caps,
            "missing_keys": missing_keys,
            "warnings": warnings
        }

    async def get_setup_requirements(self, service_ids: List[str]) -> Dict[str, Any]:
        """
        Get setup requirements for multiple services.

        Aggregates capabilities and missing keys across all services,
        deduplicating by capability (e.g., if both chronicle and openmemory
        need 'llm', we only ask for the OpenAI key once).

        Args:
            service_ids: List of service identifiers

        Returns:
            Dict with:
            - required_capabilities: List of capabilities with provider info and missing keys
            - services: List of service IDs being configured
            - all_configured: True if all services can start
        """
        # Track capabilities we've seen (to deduplicate)
        seen_capabilities: Dict[str, Dict[str, Any]] = {}
        all_can_start = True

        for service_id in service_ids:
            service_config = self._load_service_config(service_id)
            if not service_config:
                logger.warning(f"Service '{service_id}' not found, skipping")
                continue

            for use in service_config.get('uses', []):
                capability = use['capability']
                required = use.get('required', True)

                # Skip if we've already processed this capability
                if capability in seen_capabilities:
                    continue

                provider, _ = await self._get_selected_provider(capability)
                if not provider:
                    if required:
                        seen_capabilities[capability] = {
                            "id": capability,
                            "selected_provider": None,
                            "provider_name": None,
                            "provider_mode": None,
                            "configured": False,
                            "missing_keys": [],
                            "error": f"No provider selected for {capability}"
                        }
                        all_can_start = False
                    continue

                # Check which keys are missing for this provider
                missing_keys = []
                for env_map in provider.env_maps:
                    if not env_map.required:
                        continue

                    derived_path = f"{provider.capability}.{provider.id}.{env_map.key}"
                    value = await self._resolve_env_map(env_map, settings_path=derived_path)
                    if not value:
                        missing_keys.append({
                            "key": env_map.key,
                            "label": env_map.label or env_map.key,
                            "settings_path": derived_path,
                            "link": env_map.link,
                            "type": env_map.type or "secret"
                        })

                is_configured = len(missing_keys) == 0
                if not is_configured and required:
                    all_can_start = False

                seen_capabilities[capability] = {
                    "id": capability,
                    "selected_provider": provider.id,
                    "provider_name": provider.name,
                    "provider_mode": provider.mode,
                    "configured": is_configured,
                    "missing_keys": missing_keys
                }

        return {
            "required_capabilities": list(seen_capabilities.values()),
            "services": service_ids,
            "all_configured": all_can_start
        }


# Global singleton
_resolver: Optional[CapabilityResolver] = None


def get_capability_resolver() -> CapabilityResolver:
    """Get the global CapabilityResolver instance."""
    global _resolver
    if _resolver is None:
        _resolver = CapabilityResolver()
    return _resolver
