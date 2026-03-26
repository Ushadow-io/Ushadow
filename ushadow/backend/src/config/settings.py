"""
Settings API - Entity-based settings resolution.

Provides a clean API for resolving settings at different entity levels:
- for_service() - Service template level settings
- for_deploy_config() - Deployment target preview
- for_deployment() - Running instance (all layers)

Resolution hierarchy (highest priority wins):
1. config_default - config.defaults.yaml
2. compose_default - Default in compose file
3. env_file - .env file (os.environ)
4. capability - Wired provider/capability
5. infrastructure - Scanned infrastructure from DeployTarget (K8s only)
6. template_override - services.{service_id} in config.overrides.yaml
7. instance_override - instances.{deployment_id} in instance-overrides.yaml
"""

import os
from dataclasses import dataclass
from enum import Enum
from typing import Any, Optional, List, Tuple, Dict

from omegaconf import OmegaConf

from src.config.store import SettingsStore, get_settings_store
from src.config.secrets import is_secret_key, mask_secret_value, should_store_in_secrets
from src.config.helpers import (
    infer_value_type,
    infer_setting_type,
    env_var_matches_setting,
)
from src.config.infrastructure_registry import get_infrastructure_registry
from src.services.provider_registry import get_provider_registry
from src.utils.logging import get_logger

logger = get_logger(__name__, prefix="Settings")


# =============================================================================
# Data Models
# =============================================================================

class Source(str, Enum):
    """Where a resolved value came from (lowest to highest priority)."""
    CONFIG_DEFAULT = "config_default"
    COMPOSE_DEFAULT = "compose_default"
    ENV_FILE = "env_file"
    CAPABILITY = "capability"
    INFRASTRUCTURE = "infrastructure"  # From deploy target infrastructure scan (K8s only)
    TEMPLATE_OVERRIDE = "template_override"  # services.{service_id} in config.overrides.yaml
    INSTANCE_OVERRIDE = "instance_override"  # instances.{deployment_id} in instance-overrides.yaml
    NOT_FOUND = "not_found"


@dataclass
class Resolution:
    """Result of resolving an environment variable."""
    value: Optional[str]
    source: Source
    path: Optional[str] = None

    @property
    def found(self) -> bool:
        return self.source != Source.NOT_FOUND

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dict for API responses."""
        return {
            "value": self.value,
            "source": self.source.value,
            "path": self.path,
        }


@dataclass
class SettingSuggestion:
    """A suggested setting that could fill an environment variable."""
    path: str
    label: str
    has_value: bool
    value: Optional[str] = None
    capability: Optional[str] = None
    provider_name: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "path": self.path,
            "label": self.label,
            "has_value": self.has_value,
            "value": self.value,
            "capability": self.capability,
            "provider_name": self.provider_name,
        }


# =============================================================================
# Helpers
# =============================================================================

def _service_keywords(service_type: str) -> List[str]:
    """
    Return uppercase keyword patterns that identify env vars for a given service type.

    Used to pattern-match env vars like MONGODB_HOST, REDIS_URL, QDRANT_PORT
    against the service that provides them.

    Examples:
        "mongo"    → ["MONGO", "MONGODB"]
        "redis"    → ["REDIS"]
        "postgres" → ["POSTGRES", "POSTGRESQL", "DATABASE"]
        "qdrant"   → ["QDRANT"]
    """
    base = service_type.upper()
    extras: Dict[str, List[str]] = {
        "MONGO":    ["MONGO", "MONGODB"],
        "POSTGRES": ["POSTGRES", "POSTGRESQL", "DATABASE"],
    }
    return extras.get(base, [base])


# =============================================================================
# Settings API
# =============================================================================

class Settings:
    """
    Settings API for entity-based resolution.

    Public Methods:
        for_service() - Get settings for a service template
        for_deploy_config() - Get settings for a deployment target
        for_deployment() - Get settings for a running instance
        get_suggestions() - Get setting suggestions for an env var
        get() / get_sync() / get_all() - Direct path access
        set() - Update a single setting
        delete() - Remove a setting override
        update() - Update multiple settings
        reset() - Clear all overrides
        clear_cache() - Invalidate cache
    """

    def __init__(self, store: Optional[SettingsStore] = None):
        self._store = store or get_settings_store()

    # -------------------------------------------------------------------------
    # Entity-Level Resolution (Public API)
    # -------------------------------------------------------------------------

    async def for_service(self, service_id: str) -> Dict[str, Resolution]:
        """
        Get settings for a service template.

        Args:
            service_id: Service identifier (e.g., "chronicle-compose:chronicle-backend")

        Returns:
            Dict mapping env var names to Resolution objects

        Resolution layers applied:
            config_default → compose_default → env_file → capability → template_override

        Note:
            Infrastructure defaults are not included since this is template-level,
            not deployment-level. Use for_deploy_config() for infrastructure defaults.
        """
        env_vars, compose_defaults, capability_values, template_overrides = \
            await self._load_service_context(service_id)

        return await self._resolve_all(
            env_vars=env_vars,
            compose_defaults=compose_defaults,
            capability_values=capability_values,
            infrastructure_values={},  # No infrastructure at template level
            template_overrides=template_overrides,
            infrastructure_overrides={},
            instance_overrides={},
        )

    async def for_deploy_config(
        self,
        deploy_target: str,
        service_id: str,
        config_id: Optional[str] = None,
    ) -> Dict[str, Resolution]:
        """
        Get settings preview for a deployment target.

        Args:
            deploy_target: Target environment (cluster ID, unode hostname, etc.)
            service_id: Service identifier
            config_id: Optional ServiceConfig ID — when provided, previously saved
                       deploy values are included as instance_override (layer 7),
                       so the deploy dialog pre-fills with the user's last values.

        Returns:
            Dict mapping env var names to Resolution objects

        Resolution layers applied:
            config_default → compose_default → env_file → capability →
            infrastructure → template_override → instance_override (if config_id)
        """
        env_vars, compose_defaults, capability_values, template_overrides = \
            await self._load_service_context(service_id, config_id=config_id)

        # Load infrastructure values if deploy_target is a K8s target
        infrastructure_values = await self._load_infrastructure_defaults(
            deploy_target,
            env_vars
        )
        infrastructure_overrides = await self._load_infrastructure_overrides(deploy_target)

        # Load saved deploy values from ServiceConfig as instance_overrides (highest priority)
        instance_overrides = await self._load_service_config_overrides(config_id) if config_id else {}

        return await self._resolve_all(
            env_vars=env_vars,
            compose_defaults=compose_defaults,
            capability_values=capability_values,
            infrastructure_values=infrastructure_values,
            template_overrides=template_overrides,
            infrastructure_overrides=infrastructure_overrides,
            instance_overrides=instance_overrides,
        )

    async def for_deployment(
        self,
        deployment_id: str,
        deploy_target: Optional[str] = None,
    ) -> Dict[str, Resolution]:
        """
        Get settings for a running deployment instance.

        Args:
            deployment_id: Deployment/instance identifier
            deploy_target: Optional deployment target ID (e.g. "k8s.k8s.pink") to
                          load infrastructure env vars. If not provided, falls back
                          to whatever _load_deployment_context returns.

        Returns:
            Dict mapping env var names to Resolution objects

        Resolution layers applied:
            ALL layers (config_default → ... → infrastructure → ... → instance_override)
        """
        env_vars, compose_defaults, capability_values, template_overrides, instance_overrides, context_target = \
            await self._load_deployment_context(deployment_id)

        # Use explicitly provided deploy_target, fall back to context-derived one
        effective_target = deploy_target or context_target

        infrastructure_values = {}
        infrastructure_overrides = {}
        if effective_target:
            infrastructure_values = await self._load_infrastructure_defaults(
                effective_target,
                env_vars
            )
            infrastructure_overrides = await self._load_infrastructure_overrides(effective_target)

        results = await self._resolve_all(
            env_vars=env_vars,
            compose_defaults=compose_defaults,
            capability_values=capability_values,
            infrastructure_values=infrastructure_values,
            template_overrides=template_overrides,
            infrastructure_overrides=infrastructure_overrides,
            instance_overrides=instance_overrides,
        )

        self._log_resolution_summary(env_vars, results)
        return results

    # -------------------------------------------------------------------------
    # Suggestions (Public API)
    # -------------------------------------------------------------------------

    async def get_suggestions(
        self,
        env_var: str,
        cluster_id: Optional[str] = None,
        filter_by_type: bool = False,
        infra_scan_values: Optional[Dict[str, str]] = None,
    ) -> List[SettingSuggestion]:
        """
        Get setting suggestions that could fill an environment variable.

        Used for dropdown menus in the UI.

        Args:
            env_var: Environment variable name
            cluster_id: Optional cluster ID for infrastructure scan suggestions
            filter_by_type: If True, filter suggestions by env var type (URL, HOST, PORT, etc.)
            infra_scan_values: Pre-computed infra scan values for this env var (from for_deploy_config)

        Returns:
            List of SettingSuggestion objects
        """
        return await self._build_suggestions(
            env_var,
            cluster_id=cluster_id,
            filter_by_type=filter_by_type,
            infra_scan_values=infra_scan_values,
        )

    # -------------------------------------------------------------------------
    # Direct Access (Public API)
    # -------------------------------------------------------------------------

    async def get(self, path: str, default: Any = None) -> Any:
        """Get a value by settings path (e.g., "api_keys.openai_api_key")."""
        return await self._store.get(path, default)

    def get_sync(self, path: str, default: Any = None) -> Any:
        """Sync version of get() for module initialization."""
        return self._store.get_sync(path, default)

    async def get_all(self) -> Dict[str, Any]:
        """Get all settings as a plain Python dict."""
        return await self._store._get_config_as_dict()

    # -------------------------------------------------------------------------
    # Mutations (Public API)
    # -------------------------------------------------------------------------

    async def set(self, path: str, value: Any) -> None:
        """Set a setting value (auto-routes to secrets.yaml or config.overrides.yaml)."""
        await self._store.update({path: value})

    async def delete(self, path: str) -> bool:
        """Delete a setting override. Returns True if it existed."""
        current = await self._store.get(path)
        if current is None:
            return False

        file_path = (
            self._store.secrets_path if should_store_in_secrets(path)
            else self._store.overrides_path
        )

        if not file_path.exists():
            return False

        config = self._store._load_yaml_if_exists(file_path)
        if config is None:
            return False

        parts = path.split('.')
        if len(parts) == 1:
            if parts[0] in config:
                del config[parts[0]]
                OmegaConf.save(config, file_path)
                self._store.clear_cache()
                return True
            return False

        parent = config
        for part in parts[:-1]:
            if part not in parent:
                return False
            parent = parent[part]

        key = parts[-1]
        if key in parent:
            del parent[key]
            OmegaConf.save(config, file_path)
            self._store.clear_cache()
            return True

        return False

    async def update(self, updates: dict) -> None:
        """Update multiple settings at once."""
        await self._store.update(updates)

    async def reset(self, include_secrets: bool = True) -> int:
        """Reset all settings by deleting config files. Returns count of files deleted."""
        return await self._store.reset(include_secrets)

    def clear_cache(self) -> None:
        """Clear the configuration cache."""
        self._store.clear_cache()

    # =========================================================================
    # Internal Implementation (Private)
    # =========================================================================

    async def _resolve_mapping(self, value: str) -> Optional[str]:
        """
        Resolve @settings.path mapping syntax.

        Args:
            value: String that may contain @settings.path reference

        Returns:
            Resolved value or None if mapping not found

        Examples:
            "@settings.api_keys.openai" -> "sk-123..."
            "literal_value" -> "literal_value"
        """
        if not isinstance(value, str) or not value.startswith('@settings.'):
            return value

        # Extract the path after @settings.
        path = value[10:]  # Remove '@settings.' prefix
        resolved = await self._store.get(path)

        if resolved:
            logger.debug(f"Resolved mapping {value} -> {path}")
            return str(resolved)
        else:
            logger.warning(f"Mapping {value} not found at path: {path}")
            return None

    def _get_infrastructure_mapping(self) -> Dict[str, List[str]]:
        """
        Get mapping of infrastructure service names to environment variable patterns.

        Reads from compose/docker-compose.infra.yml to discover available services
        and their conventional environment variable names.

        Returns:
            Dict mapping service type -> list of env var names

        Examples:
            {
                "mongo": ["MONGO_URL", "MONGODB_URL"],
                "redis": ["REDIS_URL"],
                "postgres": ["POSTGRES_URL", "DATABASE_URL"],
            }

        Note:
            Data-driven from compose definitions. Service names and URL schemes
            are inferred from docker-compose.infra.yml, not hardcoded.
        """
        registry = get_infrastructure_registry()
        return registry.get_env_var_mapping()

    def _load_infrastructure_values(
        self,
        deploy_target: Optional['DeployTarget']
    ) -> Dict[str, str]:
        """
        Load infrastructure values from DeployTarget.infrastructure.

        Scans the infrastructure dict from DeployTarget and builds env var mappings
        based on found services. Only includes services that were successfully found.

        Args:
            deploy_target: DeployTarget with infrastructure scan results

        Returns:
            Dict of env_var -> value mappings from infrastructure

        Examples:
            If deploy_target.infrastructure contains:
            {
                "mongo": {
                    "found": True,
                    "endpoints": ["mongodb.default.svc.cluster.local:27017"]
                },
                "redis": {"found": False}
            }

            Returns:
            {
                "MONGO_URL": "mongodb://mongodb.default.svc.cluster.local:27017",
                "MONGODB_URL": "mongodb://mongodb.default.svc.cluster.local:27017"
            }
            (redis not included because found=False)
        """
        if not deploy_target or not deploy_target.infrastructure:
            return {}

        infra_values = {}
        mapping = self._get_infrastructure_mapping()

        for service_type, service_info in deploy_target.infrastructure.items():
            # Only process services that were found
            if not isinstance(service_info, dict) or not service_info.get("found"):
                continue

            endpoints = service_info.get("endpoints", [])
            if not endpoints:
                continue

            # Get the first endpoint
            endpoint = endpoints[0]

            # Build URL using infrastructure registry (data-driven)
            registry = get_infrastructure_registry()
            url = registry.build_url(service_type, endpoint)

            if not url:
                # Unknown service type - fallback to generic http://
                url = f"http://{endpoint}"
                logger.warning(
                    f"Unknown infrastructure service type '{service_type}', "
                    f"using generic http:// URL scheme"
                )

            # Map to all URL vars for this service type
            for env_var in mapping.get(service_type, []):
                infra_values[env_var] = url
                logger.info(f"[Load] [Infrastructure] {env_var} = {url}")

        return infra_values

    async def _load_infrastructure_defaults(
        self,
        deploy_target_id: str,
        env_vars: List[str]
    ) -> Dict[str, str]:
        """
        Load infrastructure for a deployment target.

        Uses DeployTarget/DeploymentPlatform abstraction - works for K8s, Docker,
        cloud platforms, etc. Platform-agnostic infrastructure loading.

        Args:
            deploy_target_id: Deployment target ID (e.g., "anubis.k8s.purple")
            env_vars: List of env var names needed for the service

        Returns:
            Dict of env_var -> value mappings from infrastructure scans.
            Empty dict if no infrastructure available.

        Examples:
            For a K8s cluster with mongo discovered:
            → returns {"MONGO_URL": "mongodb://mongodb.default.svc.cluster.local:27017"}

            For a Docker host with external postgres:
            → returns {"POSTGRES_URL": "postgresql://postgres.local:5432"}
        """
        try:
            # 1. Get the deployment target (abstraction layer)
            from src.models.deploy_target import DeployTarget
            from src.services.deployment_platforms import get_deploy_platform

            target = await DeployTarget.from_id(deploy_target_id)

            # 2. Get platform-specific infrastructure via abstraction
            platform = get_deploy_platform(target)
            infrastructure_scan = await platform.get_infrastructure(target)

            if not infrastructure_scan:
                logger.debug(f"No infrastructure available for {deploy_target_id}")
                return {}

            # 3. Parse infrastructure using registry (platform-agnostic)
            registry = get_infrastructure_registry()
            mapping = self._get_infrastructure_mapping()
            infrastructure_values = {}

            # infra_scans is {namespace: {service_type: {...}}} — iterate both levels
            for namespace_or_type, namespace_or_info in infrastructure_scan.items():
                # Detect whether this is a namespace-keyed scan (dict of service_types)
                # or a flat scan (direct service_type → info). Use presence of "found" key.
                if isinstance(namespace_or_info, dict) and "found" not in namespace_or_info:
                    # Namespace-keyed: {namespace: {service_type: service_info}}
                    services_iter = namespace_or_info.items()
                else:
                    # Flat (legacy): {service_type: service_info}
                    services_iter = [(namespace_or_type, namespace_or_info)]

                for service_type, service_info in services_iter:
                    # Only process services that were found
                    if not isinstance(service_info, dict) or not service_info.get("found"):
                        continue

                    endpoints = service_info.get("endpoints", [])
                    if not endpoints:
                        continue

                    # Build URL using registry (data-driven from compose)
                    endpoint = endpoints[0]
                    url = registry.build_url(service_type, endpoint)

                    if not url:
                        # Unknown service type - fallback to generic http://
                        url = f"http://{endpoint}"
                        logger.warning(
                            f"Unknown infrastructure service type '{service_type}', "
                            f"using generic http:// URL scheme"
                        )

                    # Parse host and port from endpoint (e.g., "mongo.root.svc.cluster.local:27017")
                    host, port = endpoint.rsplit(':', 1) if ':' in endpoint else (endpoint, '')

                    # 1. Assign full URL to known URL-mapped vars (e.g., MONGO_URL, MONGODB_URL)
                    for env_var in mapping.get(service_type, []):
                        if env_var in env_vars:
                            infrastructure_values[env_var] = url
                            logger.info(f"[Infrastructure] {env_var} = {url}")

                    # 2. Pattern-match remaining env vars by service keyword and assign
                    # component values (HOST → hostname, PORT → port number, URI/URL → full url)
                    keywords = _service_keywords(service_type)
                    for env_var in env_vars:
                        if env_var in infrastructure_values:
                            continue  # Already assigned
                        var_upper = env_var.upper()
                        if not any(kw in var_upper for kw in keywords):
                            continue
                        # HOST var → just the hostname
                        if 'HOST' in var_upper and 'HOSTNAME' not in var_upper:
                            infrastructure_values[env_var] = host
                            logger.info(f"[Infrastructure] {env_var} = {host}")
                        # PORT var → just the port number
                        elif 'PORT' in var_upper and port:
                            infrastructure_values[env_var] = port
                            logger.info(f"[Infrastructure] {env_var} = {port}")
                        # URI/URL var → full connection URL
                        elif 'URI' in var_upper or 'URL' in var_upper:
                            infrastructure_values[env_var] = url
                            logger.info(f"[Infrastructure] {env_var} = {url}")
                        # DATABASE, AUTH_SOURCE, etc. are app-specific — do not auto-assign

            logger.info(
                f"Loaded infrastructure for {deploy_target_id}: "
                f"{list(infrastructure_values.keys())}"
            )

            return infrastructure_values

        except Exception as e:
            logger.warning(f"Failed to load infrastructure for {deploy_target_id}: {e}")
            return {}

    async def _load_service_config_overrides(self, config_id: str) -> Dict[str, str]:
        """
        Load env var overrides from a ServiceConfig entry.

        Handles both plain values and { _from_setting: "path" } references,
        mirroring the logic in _load_deployment_context.

        Args:
            config_id: ServiceConfig ID (e.g. "chronicle-backend-pink")

        Returns:
            Dict mapping env var names to their resolved string values.
        """
        from src.services.service_config_manager import get_service_config_manager

        config_mgr = get_service_config_manager()
        service_config = config_mgr.get_service_config(config_id)
        if not service_config or not service_config.config or not service_config.config.values:
            return {}

        overrides: Dict[str, str] = {}
        for env_var, value in service_config.config.values.items():
            if isinstance(value, dict) and '_from_setting' in value:
                setting_path = value['_from_setting']
                resolved = await self._store.get(setting_path)
                if resolved:
                    overrides[env_var] = str(resolved)
            elif value:
                overrides[env_var] = str(value)

        logger.info(f"[Load] [ServiceConfig Override] Loaded {len(overrides)} overrides from config_id={config_id!r}")
        return overrides

    async def _load_service_context(
        self, service_id: str, config_id: Optional[str] = None
    ) -> Tuple[List[str], Dict[str, str], Dict[str, str], Dict[str, str]]:
        """Load service schema, resolve capabilities, and load template overrides.

        Args:
            service_id: Compose service template ID (e.g. "mycelia-compose:mycelia-backend")
            config_id: Optional ServiceConfig instance ID. When provided, capability
                       resolution uses the instance ID so instance-level wiring is honoured.
        """
        from src.services.compose_registry import get_compose_registry
        from src.services.capability_resolver import CapabilityResolver

        registry = get_compose_registry()
        service = registry.get_service(service_id)
        if not service:
            return [], {}, {}, {}

        env_vars = [ev.name for ev in service.required_env_vars + service.optional_env_vars]

        compose_defaults = {
            ev.name: ev.default_value
            for ev in service.required_env_vars + service.optional_env_vars
            if ev.has_default and ev.default_value
        }

        capability_values = {}
        if service.requires:
            try:
                resolver = CapabilityResolver()
                # If a ServiceConfig instance ID is available use it so instance-level
                # wiring (stored in service_configs.yaml) is picked up. Fall back to the
                # template ID which checks wiring.yaml and global selected_providers.
                capability_id = config_id or service_id
                capability_values = await resolver.resolve_for_instance(capability_id)
            except Exception as e:
                logger.debug(f"Could not resolve capabilities for {service_id}: {e}")

        # Load template-level overrides from config.overrides.yaml (services.{service_id})
        # Don't resolve mappings yet - store raw values so we can track the mapping path
        template_overrides = {}
        template_config = await self._store.get(f"services.{service_id}") or {}
        if template_config:
            for env_var, value in template_config.items():
                if value:
                    # Store raw value (including @settings.path if it's a mapping)
                    template_overrides[env_var] = str(value)
                    logger.info(f"[Load] [Template Override] {env_var} = {value}")

        return env_vars, compose_defaults, capability_values, template_overrides

    async def _load_infrastructure_overrides(self, deploy_target: str) -> Dict[str, str]:
        """
        Load infrastructure overrides for a deploy target.

        Returns a merged dict of two layers (user store overrides win):
          1. Compose defaults from docker-compose.infra.yml for non-HOST/PORT/URL vars
             (credential vars like MONGODB_USERNAME, KC_DB_PASSWORD default values)
          2. User-saved manual overrides from the settings store

        HOST/PORT/URL vars are excluded — those come from K8s cluster scan via
        _load_infrastructure_defaults and land at the lower-priority layer 5.

        Args:
            deploy_target: Deployment target ID (e.g. "anubis.k8s.purple")

        Returns:
            Dict mapping env var names to their values.
        """
        from src.models.deploy_target import DeployTarget
        from src.config import get_settings_store

        try:
            target = await DeployTarget.from_id(deploy_target)
            if target.type != "k8s":
                return {}

            cluster_name = target.name
            if not cluster_name:
                return {}

            store = get_settings_store()

            if not target.infrastructure:
                logger.warning(f"No infrastructure data for deploy target: {deploy_target}")
                # Continue to load manual overrides even if no auto-scanned data
            else:
                logger.debug(f"Infrastructure data available: {list(target.infrastructure.keys())}")
            # Layer 1: compose defaults from docker-compose.infra.yml (non-HOST/PORT/URL)
            # These fill credential/config vars without requiring any user action.
            from src.services.compose_registry import get_compose_registry
            from src.services.infrastructure_env_service import _sanitize_compose_default, _SCANNABLE_VAR

            result: Dict[str, str] = {}
            compose_registry = get_compose_registry()
            for service in compose_registry.get_services():
                if "infra" not in str(service.compose_file):
                    continue
                for env_var in service.required_env_vars + service.optional_env_vars:
                    if not env_var.has_default or not env_var.default_value:
                        continue
                    if _SCANNABLE_VAR.search(env_var.name):
                        continue  # HOST/PORT/URL — resolved from K8s scan, not here
                    clean = _sanitize_compose_default(env_var.default_value)
                    if clean:
                        result[env_var.name] = clean

            # Layer 2: user-saved overrides from the settings store (take priority)
            overrides: Dict[str, str] = await store.get(f"infrastructure.overrides.{cluster_name}") or {}
            for name, value in overrides.items():
                if value:
                    result[name] = str(value)

            if result:
                logger.info(f"Loaded {len(result)} infrastructure overrides for {cluster_name}")
            return result
        except Exception as e:
            logger.warning(f"Could not load infrastructure overrides for {deploy_target}: {e}")
            return {}

    async def _load_deployment_context(
        self, deployment_id: str
    ) -> Tuple[List[str], Dict[str, str], Dict[str, str], Dict[str, str], Dict[str, str], Optional[str]]:
        """
        Load deployment context including template and instance overrides.

        Handles three ID formats:
        1. deployment_id (future: from Deployment storage)
        2. config_id (current: ServiceConfig ID) - loads ServiceConfig to get template_id + overrides
        3. service_id/template_id (legacy: direct template reference)

        Returns:
            Tuple of (env_vars, compose_defaults, capability_values, template_overrides, instance_overrides, deployment_target)
        """
        from src.services.compose_registry import get_compose_registry
        from src.services.capability_resolver import CapabilityResolver
        from src.services.service_config_manager import get_service_config_manager

        config_mgr = get_service_config_manager()
        registry = get_compose_registry()

        # Try to load as ServiceConfig first (handles config_id format)
        service_config = config_mgr.get_service_config(deployment_id)
        deployment_target = None

        if service_config:
            # This is a config_id - use ServiceConfig
            logger.info(f"[Settings] for_deployment({deployment_id}): Found ServiceConfig, template={service_config.template_id}")

            # Extract service_id from template_id
            # Template IDs are like "chronicle-backend" (compose services) or "openai" (providers)
            service_id = service_config.template_id

            # Get instance overrides from ServiceConfig.config
            # Values can be plain strings or { _from_setting: "path" } references (from Map dropdown).
            instance_overrides_from_config = {}
            if service_config.config and service_config.config.values:
                for env_var, value in service_config.config.values.items():
                    if isinstance(value, dict) and '_from_setting' in value:
                        setting_path = value['_from_setting']
                        resolved = await self._store.get(setting_path)
                        if resolved:
                            instance_overrides_from_config[env_var] = str(resolved)
                            logger.info(f"[Load] [ServiceConfig Override] {env_var} = <resolved from {setting_path}>")
                        else:
                            # infrastructure.overrides.* paths may not be in the store but still
                            # resolve via _load_infrastructure_overrides (compose defaults layer).
                            if setting_path.startswith("infrastructure.overrides."):
                                logger.debug(f"[Load] [ServiceConfig Override] {env_var}: {setting_path!r} not in store, will resolve via infrastructure layer")
                            else:
                                logger.warning(f"[Load] [ServiceConfig Override] {env_var}: _from_setting path {setting_path!r} resolved to None")
                    elif value:
                        instance_overrides_from_config[env_var] = str(value)
                        logger.info(f"[Load] [ServiceConfig Override] {env_var} = {value}")
        else:
            # Not a ServiceConfig - try as direct service_id/template_id
            logger.info(f"[Settings] for_deployment({deployment_id}): Not a ServiceConfig, using as service_id")

            # Parse deployment_id to get service_id (legacy behavior)
            parts = deployment_id.rsplit(':', 1) if ':' in deployment_id else [deployment_id]
            service_id = parts[0] if len(parts) == 1 else ':'.join(parts[:-1])

            instance_overrides_from_config = {}

        logger.info(f"[Settings] Resolved service_id={service_id}")

        # Get service schema from ComposeRegistry
        service = registry.get_service(service_id)

        if not service:
            # Fallback: config_id may be a convention like "mycelia-backend-k8s" where
            # the base compose service is "mycelia-backend". Strip known suffixes and retry.
            for suffix in ("-k8s", "-docker", "-local"):
                if service_id.endswith(suffix):
                    base_id = service_id[: -len(suffix)]
                    service = registry.get_service(base_id)
                    if service:
                        logger.info(f"[Settings] Resolved '{service_id}' -> base service '{base_id}'")
                        service_id = base_id
                        break

        if not service:
            logger.error(f"[Settings] Service '{service_id}' not found in registry")
            return [], {}, {}, {}, {}, None

        env_vars = [ev.name for ev in service.required_env_vars + service.optional_env_vars]
        logger.info(f"[Settings] Collected {len(env_vars)} env vars from service schema")

        compose_defaults = {
            ev.name: ev.default_value
            for ev in service.required_env_vars + service.optional_env_vars
            if ev.has_default and ev.default_value
        }

        # Resolve capabilities
        capability_values = {}
        if service.requires:
            try:
                resolver = CapabilityResolver()
                capability_values = await resolver.resolve_for_instance(deployment_id)
            except Exception:
                try:
                    capability_values = await resolver.resolve_for_service(service_id)
                except Exception:
                    pass

        logger.info(f"[Settings] Capability values ({len(capability_values)}): {list(capability_values.keys())}")

        # Load template-level overrides from config.overrides.yaml (services.{service_id})
        # Don't resolve mappings yet - store raw values so we can track the mapping path
        template_overrides = {}
        template_config = await self._store.get(f"services.{service_id}") or {}
        # Fallback: config.defaults.yaml stores entries by service_name (e.g., "faster-whisper")
        # but service_id includes the compose prefix (e.g., "whisper-compose:faster-whisper")
        if not template_config and ":" in service_id:
            service_name = service_id.split(":", 1)[-1]
            template_config = await self._store.get(f"services.{service_name}") or {}
        if template_config:
            for env_var, value in template_config.items():
                if value:
                    # Store raw value (including @settings.path if it's a mapping)
                    template_overrides[env_var] = str(value)
                    logger.info(f"[Load] [Template Override] {env_var} = {value}")

        # Merge instance overrides: ServiceConfig.config takes precedence over instances.{deployment_id}
        # Priority: ServiceConfig.config > instances.{deployment_id} (legacy)
        instance_overrides = {}

        # First load from legacy instance-overrides.yaml (instances.{deployment_id})
        legacy_instance_config = await self._store.get(f"instances.{deployment_id}") or {}
        if legacy_instance_config:
            for env_var, value in legacy_instance_config.items():
                if value:
                    instance_overrides[env_var] = str(value)
                    logger.info(f"[Load] [Legacy Instance Override] {env_var} = {value}")

        # Then apply ServiceConfig.config (higher priority)
        for env_var, value in instance_overrides_from_config.items():
            instance_overrides[env_var] = value

        return env_vars, compose_defaults, capability_values, template_overrides, instance_overrides, deployment_target

    async def _resolve_all(
        self,
        env_vars: List[str],
        compose_defaults: Dict[str, str],
        capability_values: Dict[str, str],
        infrastructure_values: Dict[str, str],
        template_overrides: Dict[str, str],
        infrastructure_overrides: Dict[str, str],
        instance_overrides: Dict[str, str],
    ) -> Dict[str, Resolution]:
        """Resolve all env vars through the priority hierarchy."""
        results: Dict[str, Resolution] = {}

        # Collect all env var names from schema AND all override sources
        # This ensures we resolve vars that are only in overrides (not in schema)
        all_env_vars = set(env_vars)
        all_env_vars.update(compose_defaults.keys())
        all_env_vars.update(capability_values.keys())
        all_env_vars.update(template_overrides.keys())
        all_env_vars.update(infrastructure_overrides.keys())
        all_env_vars.update(instance_overrides.keys())

        for env_var in all_env_vars:
            # Check from highest to lowest priority

            # 7. Instance override (highest)
            if env_var in instance_overrides:
                value = instance_overrides[env_var]
                if value and str(value).strip():
                    # Check if it's a mapping (@settings.path)
                    if str(value).startswith('@settings.'):
                        mapping_path = str(value)[10:]  # Remove '@settings.' prefix
                        resolved_value = await self._resolve_mapping(value)
                        if resolved_value:
                            results[env_var] = Resolution(
                                value=resolved_value,
                                source=Source.INSTANCE_OVERRIDE,
                                path=mapping_path  # Track the mapping path
                            )
                            continue
                    else:
                        # Direct literal value
                        results[env_var] = Resolution(
                            value=str(value),
                            source=Source.INSTANCE_OVERRIDE,
                            path=None
                        )
                        continue

            # 6. Template override
            if env_var in template_overrides:
                value = template_overrides[env_var]
                if value and str(value).strip():
                    # Check if it's a mapping (@settings.path)
                    if str(value).startswith('@settings.'):
                        mapping_path = str(value)[10:]  # Remove '@settings.' prefix
                        resolved_value = await self._resolve_mapping(value)
                        if resolved_value:
                            results[env_var] = Resolution(
                                value=resolved_value,
                                source=Source.TEMPLATE_OVERRIDE,
                                path=mapping_path  # Track the mapping path
                            )
                            continue
                    else:
                        # Direct literal value
                        results[env_var] = Resolution(
                            value=str(value),
                            source=Source.TEMPLATE_OVERRIDE,
                            path=None
                        )
                        continue

            # 5b. Infrastructure overrides (user-set values from infra screen)
            if env_var in infrastructure_overrides:
                value = infrastructure_overrides[env_var]
                if value and str(value).strip():
                    results[env_var] = Resolution(
                        value=str(value),
                        source=Source.INFRASTRUCTURE,
                        path=f"infrastructure.{env_var}"
                    )
                    continue

            # 5. Infrastructure (scanned from K8s cluster)
            if env_var in infrastructure_values:
                value = infrastructure_values[env_var]
                if value and str(value).strip():
                    results[env_var] = Resolution(
                        value=str(value),
                        source=Source.INFRASTRUCTURE,
                        path=f"infrastructure.{env_var}"
                    )
                    continue

            # 4. Capability/provider wiring
            if env_var in capability_values:
                value = capability_values[env_var]
                if value and str(value).strip():
                    results[env_var] = Resolution(
                        value=str(value),
                        source=Source.CAPABILITY,
                        path=None
                    )
                    continue

            # 3. .env file (os.environ)
            env_value = os.environ.get(env_var)
            if env_value and env_value.strip():
                results[env_var] = Resolution(
                    value=env_value,
                    source=Source.ENV_FILE,
                    path=None
                )
                continue

            # 2. Compose file default
            if env_var in compose_defaults:
                value = compose_defaults[env_var]
                # Skip sentinel/placeholder defaults so higher-specificity layers
                # (e.g. api_keys.* fuzzy match at layer 1) can provide the real value.
                _PLACEHOLDER_DEFAULTS = {"none", "null", "", "undefined", "changeme"}
                if value and str(value).strip() and str(value).strip().lower() not in _PLACEHOLDER_DEFAULTS:
                    results[env_var] = Resolution(
                        value=str(value),
                        source=Source.COMPOSE_DEFAULT,
                        path=None
                    )
                    continue

            # 1. Config default (config.defaults.yaml)
            setting_result = await self._find_config_default(env_var)
            if setting_result:
                path, value = setting_result
                if value and str(value).strip():
                    results[env_var] = Resolution(
                        value=str(value),
                        source=Source.CONFIG_DEFAULT,
                        path=path
                    )
                    continue

            # Not found
            results[env_var] = Resolution(
                value=None,
                source=Source.NOT_FOUND,
                path=None
            )

        # Post-process: inject credentials into URI/URL vars that came from infra scan.
        # K8s infra scan produces URIs without auth (e.g., mongodb://mongo.ns.svc:27017).
        # If USER/PASSWORD are resolved from higher-priority layers, embed them.
        self._inject_uri_credentials(results)

        return results

    def _inject_uri_credentials(self, results: Dict[str, "Resolution"]) -> None:
        """
        Inject user/password credentials into URI vars that lack them.

        Scans for vars named *_URI or *_URL that have no '@' in the authority
        section, then looks for a matching *_USER and *_PASSWORD var. If found,
        rewrites the URI to include the credentials.

        Example: MONGODB_URI=mongodb://mongo:27017 + MONGODB_USER=root +
                 MONGODB_PASSWORD=secret → mongodb://root:secret@mongo:27017
        """
        from urllib.parse import urlparse, urlunparse

        def _get_val(var: str) -> Optional[str]:
            r = results.get(var)
            return r.value if r and r.value and str(r.value).strip() else None

        for env_var in list(results.keys()):
            var_upper = env_var.upper()
            if 'URI' not in var_upper and 'URL' not in var_upper:
                continue

            uri = _get_val(env_var)
            if not uri or '://' not in uri or '@' in uri:
                continue  # Already has credentials or not a URI

            # Derive the prefix (e.g., "MONGODB" from "MONGODB_URI")
            prefix = var_upper.rsplit('_', 1)[0]
            user = _get_val(f"{prefix}_USER") or _get_val(f"{prefix}_USERNAME")
            password = _get_val(f"{prefix}_PASSWORD") or _get_val(f"{prefix}_PASS")

            if not user and not password:
                continue  # No credentials to inject

            try:
                parsed = urlparse(uri)
                auth = f"{user or ''}:{password}" if password else (user or '')
                netloc = f"{auth}@{parsed.hostname}"
                if parsed.port:
                    netloc += f":{parsed.port}"
                new_uri = urlunparse(parsed._replace(netloc=netloc))

                # Append authSource if available and not already in query
                auth_source = _get_val(f"{prefix}_AUTH_SOURCE")
                if auth_source and '?' not in new_uri:
                    new_uri += f"?authSource={auth_source}"

                existing = results[env_var]
                results[env_var] = Resolution(
                    value=new_uri,
                    source=existing.source,
                    path=existing.path,
                )
                logger.info(f"[Credentials] Injected credentials into {env_var} (prefix={prefix})")
            except Exception as exc:
                logger.warning(f"[Credentials] Could not inject credentials into {env_var}: {exc}")

    async def _find_config_default(self, env_var: str) -> Optional[Tuple[str, Any]]:
        """Find a config default value for an env var."""
        # Try direct path mapping from provider registry
        env_mapping = get_provider_registry().get_env_to_settings_mapping()
        if env_var in env_mapping:
            settings_path = env_mapping[env_var]
            value = await self._store.get(settings_path)
            if value:
                return (settings_path, value)

        # Fuzzy match across all config sections
        config = await self._store._get_config_as_dict()
        for section, section_data in config.items():
            if not isinstance(section_data, dict):
                continue
            for key, value in section_data.items():
                if value is None or isinstance(value, dict):
                    continue
                path = f"{section}.{key}"
                if env_var_matches_setting(env_var, path):
                    str_value = str(value) if value is not None else ""
                    if str_value.strip():
                        return (path, value)

        return None

    async def _build_suggestions(
        self,
        env_var_name: str,
        provider_registry=None,
        capabilities: Optional[List[str]] = None,
        cluster_id: Optional[str] = None,
        filter_by_type: bool = False,
        infra_scan_values: Optional[Dict[str, str]] = None,
    ) -> List[SettingSuggestion]:
        """
        Build setting suggestions for an env var.

        Args:
            env_var_name: Environment variable name
            provider_registry: Optional provider registry
            capabilities: Optional capability requirements
            cluster_id: Optional cluster ID for infrastructure scan suggestions
            infra_scan_values: Pre-computed infrastructure scan values (env_var → value)
        """
        suggestions = []
        seen_paths = set()

        expected_type = infer_setting_type(env_var_name)

        config = await self._store._get_config_as_dict()

        # Only scan user-meaningful config sections.
        # Noisy sections (network, environment, infrastructure, services, …) are
        # either redundant with the infra-scan below or irrelevant to the user.
        SCANNABLE_SECTIONS = {'api_keys', 'settings', 'capabilities'}

        for section, section_data in config.items():
            if section not in SCANNABLE_SECTIONS:
                continue
            if not isinstance(section_data, dict):
                continue

            for key, value in section_data.items():
                if value is None or isinstance(value, dict):
                    continue

                path = f"{section}.{key}"
                if path in seen_paths:
                    continue

                str_value = str(value) if value is not None else ""
                has_value = bool(str_value.strip())

                value_type = infer_value_type(str_value) if has_value else 'empty'

                # Name match always wins — e.g. MYCELIA_CLIENT_ID → api_keys.mycelia_client_id
                is_compatible = False
                if env_var_matches_setting(env_var_name, path):
                    is_compatible = True
                # Type compatibility rules
                elif expected_type == 'secret':
                    is_compatible = (value_type == 'secret' or
                                    (value_type == 'empty' and section in ('api_keys', 'security')) or
                                    is_secret_key(path))
                elif expected_type == 'url':
                    is_compatible = (value_type == 'url' or
                                    (value_type == 'empty' and 'url' in key.lower()))
                else:
                    # Generic string vars (e.g., MONGODB_USER) — don't suggest api_keys
                    # entries, those are secrets and should only appear for secret-type vars.
                    is_compatible = (section != 'api_keys' and
                                     value_type in ('string', 'empty', 'bool', 'number'))

                if not is_compatible:
                    continue

                seen_paths.add(path)
                suggestions.append(SettingSuggestion(
                    path=path,
                    label=key.replace("_", " ").title(),
                    has_value=has_value,
                    value=str_value if has_value else None,
                ))

        # Add service URLs if env var is URL type
        if expected_type == 'url':
            try:
                from src.services.docker_manager import get_docker_manager
                from src.config.urls import get_docker_proxy_url

                docker_mgr = get_docker_manager()

                # Get installed services if filtering by type
                installed_services = set()
                if filter_by_type:
                    try:
                        status = await docker_mgr.get_service_status()
                        installed_services = {svc['name'] for svc in status.get('services', []) if svc.get('installed')}
                    except Exception as e:
                        logger.warning(f"Failed to get installed services: {e}")
                        # If we can't get installed services, include all for backward compatibility
                        installed_services = set(docker_mgr.MANAGEABLE_SERVICES.keys())

                # Get all manageable services
                for service_name, service_config in docker_mgr.MANAGEABLE_SERVICES.items():
                    # Skip if filtering and service not installed
                    if filter_by_type and installed_services and service_name not in installed_services:
                        continue

                    # Create a dynamic suggestion path for this service URL
                    suggestion_path = f"service_urls.{service_name}"

                    if suggestion_path in seen_paths:
                        continue

                    seen_paths.add(suggestion_path)

                    # Get service display name
                    display_name = service_config.get('description', service_name.replace('-', ' ').title())

                    # Get Docker proxy URL using shared utility
                    internal_url = get_docker_proxy_url(service_name)

                    suggestions.append(SettingSuggestion(
                        path=suggestion_path,
                        label=f"Service: {display_name}",
                        has_value=True,
                        value=internal_url,
                    ))
            except Exception as e:
                # Don't fail the entire suggestion building if service discovery fails
                from src.utils.logging import get_logger
                logger = get_logger(__name__)
                logger.warning(f"Failed to add service URL suggestions: {e}")

        # Add provider-specific mappings if provided
        if provider_registry and capabilities:
            for capability in capabilities:
                selected_id = await self._store.get(f"selected_providers.{capability}")
                if not selected_id:
                    selected_id = provider_registry.get_default_provider_id(capability, 'cloud')
                if not selected_id:
                    continue

                provider = provider_registry.get_provider(selected_id)
                if not provider:
                    continue

                for env_map in provider.env_maps:
                    if env_map.key == env_var_name and env_map.settings_path:
                        if env_map.settings_path in seen_paths:
                            continue
                        seen_paths.add(env_map.settings_path)

                        value = await self._store.get(env_map.settings_path)
                        str_value = str(value) if value is not None else ""
                        has_value = bool(str_value.strip())

                        suggestions.append(SettingSuggestion(
                            path=env_map.settings_path,
                            label=f"{provider.name}: {env_map.label or env_map.key}",
                            has_value=has_value,
                            value=str_value if has_value else None,
                            capability=capability,
                            provider_name=provider.name,
                        ))

        # Infrastructure suggestions for K8s cluster.
        # Only show exact-match and same-service-prefix vars (e.g. MONGODB_* for MONGODB_USER).
        # "Everything else" (different service) is too noisy and rarely useful.
        if cluster_id and infra_scan_values:
            # Determine same-service prefix (e.g. "MONGODB" for "MONGODB_USER")
            parts = env_var_name.split("_")
            same_prefix = parts[0] if parts else ""

            def _suggestion_sort_key(name: str) -> int:
                if name == env_var_name:
                    return 0  # Exact match first
                if same_prefix and name.startswith(same_prefix):
                    return 1  # Same service prefix second
                return 2      # Everything else — excluded

            for var_name in sorted(infra_scan_values.keys(), key=_suggestion_sort_key):
                if _suggestion_sort_key(var_name) > 1:
                    break  # Sorted, so once we hit unrelated vars we're done
                value = infra_scan_values[var_name]
                if not value:
                    continue
                path = f"infrastructure.overrides.{cluster_id}.{var_name}"
                if path in seen_paths:
                    continue
                seen_paths.add(path)
                suggestions.append(SettingSuggestion(
                    path=path,
                    label=var_name.replace("_", " ").title(),
                    has_value=True,
                    value=str(value),
                ))

        return suggestions

    def _log_resolution_summary(
        self, env_vars: List[str], results: Dict[str, Resolution]
    ) -> None:
        """Log final resolution results."""
        logger.info("[Settings] ========== Final Resolution Summary ==========")
        for env_var in env_vars:
            if env_var in results:
                resolution = results[env_var]
                display_value = resolution.value
                if any(secret in env_var.lower() for secret in ['key', 'secret', 'token', 'password']):
                    display_value = f"****{resolution.value[-4:]}" if resolution.value and len(str(resolution.value)) > 4 else "****"
                logger.info(f"[Resolve] {env_var} -> {display_value} (source: {resolution.source.value})")
            else:
                logger.warning(f"[Resolve] {env_var} -> NOT RESOLVED")

        missing = set(env_vars) - set(results.keys())
        if missing:
            logger.warning(f"[Settings] Failed to resolve {len(missing)} env vars: {missing}")
        logger.info("[Settings] ========================================")


# =============================================================================
# Global Instance
# =============================================================================

_settings: Optional[Settings] = None


def get_settings() -> Settings:
    """Get global Settings instance."""
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings


# Alias for cleaner external use
Suggestion = SettingSuggestion
