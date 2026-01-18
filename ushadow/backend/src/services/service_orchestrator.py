"""
Service Orchestrator - Unified facade for service management.

This is the single entry point for all service operations, combining:
- ComposeServiceRegistry: Service discovery from compose files
- DockerManager: Container lifecycle management
- SettingsStore: Configuration and state persistence

Routers should use this layer instead of calling underlying managers directly.
"""

import logging
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional

from src.services.compose_registry import (
    get_compose_registry,
    ComposeServiceRegistry,
    DiscoveredService,
    EnvVarConfig,
)
from src.services.docker_manager import (
    get_docker_manager,
    DockerManager,
    ServiceInfo,
    ServiceStatus as DockerServiceStatus,
    ServiceType,
    ServiceEndpoint,
)
from src.config.omegaconf_settings import (
    get_settings_store,
    SettingsStore,
)
from src.services.provider_registry import get_provider_registry

logger = logging.getLogger(__name__)


# =============================================================================
# Well-known env var to settings path mappings
# =============================================================================
# These env vars are automatically resolved from settings if not configured
WELL_KNOWN_ENV_MAPPINGS = {
    "AUTH_SECRET_KEY": "security.auth_secret_key",
    "ADMIN_PASSWORD": "security.admin_password",
    "USER": "auth.admin_email",  # For OpenMemory backend
}


# =============================================================================
# Response Models (dataclasses for internal use, converted to dict for API)
# =============================================================================

@dataclass
class ServiceSummary:
    """Lightweight service info for lists."""
    service_id: str
    service_name: str
    description: Optional[str]
    compose_file: str
    image: Optional[str]
    enabled: bool
    installed: bool
    needs_setup: bool
    status: str
    health: Optional[str]
    requires: List[str] = field(default_factory=list)
    depends_on: List[str] = field(default_factory=list)
    ports: List[Dict[str, Any]] = field(default_factory=list)
    profiles: List[str] = field(default_factory=list)
    required_env_count: int = 0
    optional_env_count: int = 0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "service_id": self.service_id,
            "service_name": self.service_name,
            "description": self.description,
            "compose_file": self.compose_file,
            "image": self.image,
            "enabled": self.enabled,
            "installed": self.installed,
            "needs_setup": self.needs_setup,
            "status": self.status,
            "health": self.health,
            "requires": self.requires,
            "depends_on": self.depends_on,
            "ports": self.ports,
            "profiles": self.profiles,
            "required_env_count": self.required_env_count,
            "optional_env_count": self.optional_env_count,
        }


@dataclass
class DockerDetails:
    """Docker container information."""
    container_id: Optional[str]
    status: str
    image: Optional[str]
    created: Optional[str]
    ports: Dict[str, str]
    health: Optional[str]
    endpoints: List[Dict[str, Any]]
    service_type: str
    description: Optional[str]
    error: Optional[str]
    metadata: Optional[Dict[str, Any]]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "container_id": self.container_id,
            "status": self.status,
            "image": self.image,
            "created": self.created,
            "ports": self.ports,
            "health": self.health,
            "endpoints": self.endpoints,
            "service_type": self.service_type,
            "description": self.description,
            "error": self.error,
            "metadata": self.metadata,
        }


@dataclass
class ActionResult:
    """Result of start/stop/restart actions."""
    success: bool
    message: str

    def to_dict(self) -> Dict[str, Any]:
        return {"success": self.success, "message": self.message}


@dataclass
class LogResult:
    """Result of log retrieval."""
    success: bool
    logs: str

    def to_dict(self) -> Dict[str, Any]:
        return {"success": self.success, "logs": self.logs}


# =============================================================================
# Service Orchestrator
# =============================================================================

class ServiceOrchestrator:
    """
    Unified service orchestration layer.

    Combines compose registry, docker manager, and settings into
    a cohesive API for service management.

    State Model
    ===========
    Service state is derived at runtime from multiple sources, NOT stored in a database.
    This is intentional: Docker is the authoritative source for container state.

    DISCOVERY STATE (from compose/*.yaml files)
    ├── discovered  → Service definition found in compose/ directory
    └── not_found   → No compose file defines this service

    INSTALLATION STATE (from config files)
    ├── installed   → In default_services (config.defaults.yaml)
    │                 OR installed_services.{name}.added=true (config.overrides.yaml)
    ├── uninstalled → In installed_services.{name}.removed=true
    └── enabled     → installed_services.{name}.enabled (default: true)

    CONFIGURATION STATE (computed at runtime)
    ├── needs_setup → Has required env vars without values or defaults
    └── configured  → All required env vars are satisfied

    DOCKER STATE (from Docker API - container.status)
    ├── not_found   → No container exists
    ├── created     → Container exists but never started
    ├── running     → Container is running
    ├── stopped     → Container was stopped (exited)
    ├── restarting  → Container is restarting
    └── error/dead  → Container in error state

    HEALTH STATE (from Docker healthcheck)
    └── healthy | unhealthy | starting | none

    Config File Structure
    =====================
    config.defaults.yaml    → All defaults (services, providers, settings)
    secrets.yaml            → API keys, passwords (gitignored)
    config.overrides.yaml   → User modifications (gitignored)

    Why No Database?
    ================
    - Docker IS the authoritative state - no sync issues
    - Config files are version-controllable
    - No DB dependency for core service operations
    - State never drifts from reality (Docker API never lies)
    """

    def __init__(self):
        self._compose_registry: Optional[ComposeServiceRegistry] = None
        self._docker_manager: Optional[DockerManager] = None
        self._settings: Optional[SettingsStore] = None

    @property
    def compose_registry(self) -> ComposeServiceRegistry:
        if self._compose_registry is None:
            self._compose_registry = get_compose_registry()
        return self._compose_registry

    @property
    def docker_manager(self) -> DockerManager:
        if self._docker_manager is None:
            self._docker_manager = get_docker_manager()
        return self._docker_manager

    @property
    def settings(self) -> SettingsStore:
        if self._settings is None:
            self._settings = get_settings_store()
        return self._settings

    # =========================================================================
    # Discovery Methods
    # =========================================================================

    async def list_installed_services(self) -> List[Dict[str, Any]]:
        """Get all installed services with basic info and status."""
        installed_names, removed_names = await self._get_installed_service_names()
        all_services = self.compose_registry.get_services()

        installed_services = [
            s for s in all_services
            if self._service_matches_installed(s, installed_names, removed_names)
        ]

        return [
            (await self._build_service_summary(s, installed=True)).to_dict()
            for s in installed_services
        ]

    async def list_catalog(self) -> List[Dict[str, Any]]:
        """Get all available services (installed + uninstalled)."""
        installed_names, removed_names = await self._get_installed_service_names()
        all_services = self.compose_registry.get_services()

        results = []
        for service in all_services:
            is_installed = self._service_matches_installed(service, installed_names, removed_names)
            summary = await self._build_service_summary(service, installed=is_installed)
            results.append(summary.to_dict())

        return results

    async def get_service(self, name: str, include_env: bool = False) -> Optional[Dict[str, Any]]:
        """Get full details for a single service by name."""
        service = self._find_service(name)
        if not service:
            return None

        installed_names, removed_names = await self._get_installed_service_names()
        is_installed = self._service_matches_installed(service, installed_names, removed_names)

        summary = await self._build_service_summary(service, installed=is_installed)
        result = summary.to_dict()

        if include_env:
            result["required_env_vars"] = [
                {
                    "name": ev.name,
                    "has_default": ev.has_default,
                    "default_value": ev.default_value,
                    "is_required": ev.is_required,
                }
                for ev in service.required_env_vars
            ]
            result["optional_env_vars"] = [
                {
                    "name": ev.name,
                    "has_default": ev.has_default,
                    "default_value": ev.default_value,
                    "is_required": ev.is_required,
                }
                for ev in service.optional_env_vars
            ]

        return result

    async def get_services_by_capability(self, capability: str) -> List[Dict[str, Any]]:
        """Get services requiring a specific capability."""
        services = self.compose_registry.get_services_requiring(capability)
        installed_names, removed_names = await self._get_installed_service_names()

        return [
            (await self._build_service_summary(
                s,
                installed=self._service_matches_installed(s, installed_names, removed_names)
            )).to_dict()
            for s in services
        ]

    # =========================================================================
    # Status Methods
    # =========================================================================

    def get_docker_status(self) -> Dict[str, Any]:
        """Check Docker daemon availability."""
        available = self.docker_manager.is_available()
        return {
            "available": available,
            "message": "Docker is available" if available else "Docker is not available"
        }

    async def get_all_statuses(self) -> Dict[str, Dict[str, Any]]:
        """Get lightweight status for all services (for polling)."""
        services = self.docker_manager.list_services(user_controllable_only=False)
        return {
            service.name: {
                "status": service.status.value,
                "health": service.health,
            }
            for service in services
        }

    async def get_service_status(self, name: str) -> Optional[Dict[str, Any]]:
        """Get status for a single service."""
        service_info = self.docker_manager.get_service_info(name)
        if service_info.error == "Service not found":
            return None
        return {
            "status": service_info.status.value,
            "health": service_info.health,
        }

    async def get_docker_details(self, name: str) -> Optional[DockerDetails]:
        """Get Docker container details for a service."""
        service_info = self.docker_manager.get_service_info(name)
        if service_info.error == "Service not found":
            return None

        return DockerDetails(
            container_id=service_info.container_id,
            status=service_info.status.value,
            image=service_info.image,
            created=service_info.created.isoformat() if service_info.created else None,
            ports=service_info.ports,
            health=service_info.health,
            endpoints=[
                {
                    "url": ep.url,
                    "integration_type": ep.integration_type.value if hasattr(ep.integration_type, 'value') else str(ep.integration_type),
                    "health_check_path": ep.health_check_path,
                    "requires_auth": ep.requires_auth,
                    "auth_type": ep.auth_type,
                }
                for ep in service_info.endpoints
            ],
            service_type=service_info.service_type.value if hasattr(service_info.service_type, 'value') else str(service_info.service_type),
            description=service_info.description,
            error=service_info.error,
            metadata=service_info.metadata,
        )

    # =========================================================================
    # Lifecycle Methods
    # =========================================================================

    async def start_service(self, name: str, config_id: Optional[str] = None) -> ActionResult:
        """Start a service container."""
        success, message = await self.docker_manager.start_service(name, config_id)
        return ActionResult(success=success, message=message)

    def stop_service(self, name: str) -> ActionResult:
        """Stop a service container."""
        success, message = self.docker_manager.stop_service(name)
        return ActionResult(success=success, message=message)

    def restart_service(self, name: str) -> ActionResult:
        """Restart a service container."""
        success, message = self.docker_manager.restart_service(name)
        return ActionResult(success=success, message=message)

    def get_service_logs(self, name: str, tail: int = 100) -> LogResult:
        """Get service container logs."""
        success, logs = self.docker_manager.get_service_logs(name, tail=tail)
        return LogResult(success=success, logs=logs)

    # =========================================================================
    # Configuration Methods
    # =========================================================================

    async def get_enabled_state(self, name: str) -> Optional[Dict[str, Any]]:
        """Get enabled/disabled state."""
        service = self._find_service(name)
        if not service:
            return None

        enabled = await self.settings.get(f"installed_services.{service.service_name}.enabled")
        return {
            "service_id": service.service_id,
            "service_name": service.service_name,
            "enabled": enabled if enabled is not None else True,
        }

    async def set_enabled_state(self, name: str, enabled: bool) -> Optional[Dict[str, Any]]:
        """Enable or disable a service."""
        service = self._find_service(name)
        if not service:
            return None

        await self.settings.update({
            f"installed_services.{service.service_name}.enabled": enabled
        })

        action = "enabled" if enabled else "disabled"
        logger.info(f"Service {service.service_name} {action}")

        return {
            "service_id": service.service_id,
            "service_name": service.service_name,
            "enabled": enabled,
            "message": f"Service '{service.service_name}' {action}"
        }

    async def get_service_config(self, name: str) -> Optional[Dict[str, Any]]:
        """Get full service configuration (env + preferences + state)."""
        service = self._find_service(name)
        if not service:
            return None

        # Get enabled state
        enabled = await self.settings.get(f"installed_services.{service.service_name}.enabled")

        # Get env config
        config_key = f"service_env_config.{service.service_id.replace(':', '_')}"
        env_config = await self.settings.get(config_key) or {}

        # Get service preferences
        prefs_key = f"service_preferences.{service.service_name}"
        preferences = await self.settings.get(prefs_key) or {}

        return {
            "service_id": service.service_id,
            "service_name": service.service_name,
            "enabled": enabled if enabled is not None else True,
            "env_config": dict(env_config) if hasattr(env_config, 'items') else env_config,
            "preferences": dict(preferences) if hasattr(preferences, 'items') else preferences,
        }

    async def get_env_config(self, name: str) -> Optional[Dict[str, Any]]:
        """Get environment variable configuration with suggestions."""
        service = self._find_service(name)
        if not service:
            return None

        provider_registry = get_provider_registry()
        schema = service.get_env_schema()

        # Load saved configuration
        config_key = f"service_env_config.{service.service_id.replace(':', '_')}"
        saved_config = await self.settings.get(config_key) or {}

        # Delegate to settings store for env var resolution
        required_vars = await self.settings.build_env_var_config(
            schema.required_env_vars, saved_config, schema.requires, provider_registry, is_required=True
        )
        optional_vars = await self.settings.build_env_var_config(
            schema.optional_env_vars, saved_config, schema.requires, provider_registry, is_required=False
        )

        return {
            "service_id": service.service_id,
            "service_name": schema.service_name,
            "compose_file": schema.compose_file,
            "requires": schema.requires,
            "required_env_vars": required_vars,
            "optional_env_vars": optional_vars,
        }

    async def update_env_config(self, name: str, env_vars: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        """Save environment variable configuration."""
        service = self._find_service(name)
        if not service:
            return None

        # Process env vars - handle new_setting by creating settings first
        new_settings_to_create = {}
        env_config = {}

        for ev in env_vars:
            ev_name = ev.get("name")
            source = ev.get("source")

            if source == "new_setting" and ev.get("new_setting_path") and ev.get("value"):
                new_settings_to_create[ev["new_setting_path"]] = ev["value"]
                env_config[ev_name] = {
                    "source": "setting",
                    "setting_path": ev["new_setting_path"],
                }
            else:
                env_config[ev_name] = {
                    "source": source,
                    "setting_path": ev.get("setting_path"),
                    "value": ev.get("value"),
                }

        # Create new settings if any
        if new_settings_to_create:
            await self.settings.update(new_settings_to_create)
            logger.info(f"Created {len(new_settings_to_create)} new settings")

        # Save env config mapping
        service_key = service.service_id.replace(':', '_')
        await self.settings.update({
            "service_env_config": {
                service_key: env_config
            }
        })

        logger.info(f"Saved env config for {service.service_id}: {len(env_config)} vars")

        return {
            "service_id": service.service_id,
            "saved": len(env_config),
            "new_settings_created": len(new_settings_to_create),
            "message": f"Environment configuration saved for {service.service_name}"
        }

    async def resolve_env_vars(self, name: str) -> Optional[Dict[str, Any]]:
        """Resolve env vars to actual values for runtime."""
        service = self._find_service(name)
        if not service:
            return None

        config_key = f"service_env_config.{service.service_id.replace(':', '_')}"
        saved_config = await self.settings.get(config_key) or {}

        resolved = {}
        missing = []

        for ev in service.all_env_vars:
            config = saved_config.get(ev.name, {})
            if hasattr(config, 'items'):
                config = dict(config)
            source = config.get("source", "default")

            if source == "setting":
                setting_path = config.get("setting_path")
                if setting_path:
                    value = await self.settings.get(setting_path)
                    if value:
                        resolved[ev.name] = self._mask_sensitive(ev.name, str(value))
                    elif ev.is_required:
                        missing.append(f"{ev.name} (setting '{setting_path}' is empty)")

            elif source == "literal":
                value = config.get("value")
                if value:
                    resolved[ev.name] = self._mask_sensitive(ev.name, value)
                elif ev.is_required:
                    missing.append(f"{ev.name} (no value provided)")

            elif source == "default":
                if ev.has_default:
                    resolved[ev.name] = f"(default: {ev.default_value})"
                elif ev.name in WELL_KNOWN_ENV_MAPPINGS:
                    # Auto-resolve well-known env vars from settings
                    settings_path = WELL_KNOWN_ENV_MAPPINGS[ev.name]
                    value = await self.settings.get(settings_path)
                    if value:
                        resolved[ev.name] = self._mask_sensitive(ev.name, str(value))
                    elif ev.is_required:
                        missing.append(f"{ev.name} (setting '{settings_path}' is empty)")
                elif ev.is_required:
                    missing.append(f"{ev.name} (no default, not configured)")

        return {
            "service_id": service.service_id,
            "ready": len(missing) == 0,
            "resolved": resolved,
            "missing": missing,
            "compose_file": str(service.compose_file),
        }

    async def export_env_vars(self, name: str, format: str = "env") -> Optional[Dict[str, Any]]:
        """Export env vars with actual unmasked values for local development.

        Args:
            name: Service name
            format: Output format - "env" for .env file format, "dict" for raw dict

        Returns:
            Dict with env_content (formatted string) and env_vars (dict)
        """
        service = self._find_service(name)
        if not service:
            return None

        config_key = f"service_env_config.{service.service_id.replace(':', '_')}"
        saved_config = await self.settings.get(config_key) or {}

        env_vars = {}
        missing = []

        for ev in service.all_env_vars:
            config = saved_config.get(ev.name, {})
            if hasattr(config, 'items'):
                config = dict(config)
            source = config.get("source", "default")

            value = None

            if source == "setting":
                setting_path = config.get("setting_path")
                if setting_path:
                    value = await self.settings.get(setting_path)

            elif source == "literal":
                value = config.get("value")

            elif source == "default":
                if ev.has_default:
                    value = ev.default_value
                elif ev.name in WELL_KNOWN_ENV_MAPPINGS:
                    settings_path = WELL_KNOWN_ENV_MAPPINGS[ev.name]
                    value = await self.settings.get(settings_path)

            if value is not None:
                env_vars[ev.name] = str(value)
            elif ev.is_required:
                missing.append(ev.name)

        # Format as .env file content
        env_lines = [f"{k}={v}" for k, v in sorted(env_vars.items())]
        env_content = "\n".join(env_lines)

        return {
            "service_id": service.service_id,
            "ready": len(missing) == 0,
            "missing": missing,
            "env_vars": env_vars,
            "env_content": env_content,
            "compose_file": str(service.compose_file),
        }

    # =========================================================================
    # Installation Methods
    # =========================================================================

    async def install_service(self, name: str) -> Optional[Dict[str, Any]]:
        """Install a service (add to installed list)."""
        service = self._find_service(name)
        if not service:
            return None

        service_name = service.service_name
        await self.settings.update({
            "installed_services": {
                service_name: {
                    "added": True,
                    "removed": False,
                }
            }
        })

        logger.info(f"Installed service: {service_name}")

        return {
            "service_id": service.service_id,
            "service_name": service_name,
            "installed": True,
            "message": f"Service '{service_name}' has been installed"
        }

    async def uninstall_service(self, name: str) -> Optional[Dict[str, Any]]:
        """Uninstall a service (remove from installed list)."""
        service = self._find_service(name)
        if not service:
            return None

        service_name = service.service_name
        await self.settings.update({
            "installed_services": {
                service_name: {
                    "added": False,
                    "removed": True,
                }
            }
        })

        logger.info(f"Uninstalled service: {service_name}")

        return {
            "service_id": service.service_id,
            "service_name": service_name,
            "installed": False,
            "message": f"Service '{service_name}' has been uninstalled"
        }

    async def register_dynamic_service(self, config: Dict[str, Any]) -> ActionResult:
        """Register a dynamic service at runtime."""
        service_name = config.get("service_name")
        if not service_name:
            return ActionResult(success=False, message="service_name is required")

        # Convert endpoint dicts to ServiceEndpoint objects
        endpoints = []
        for ep in config.get("endpoints", []):
            from src.services.docker_manager import IntegrationType
            endpoints.append(ServiceEndpoint(
                url=ep.get("url", ""),
                integration_type=IntegrationType(ep.get("integration_type", "rest")),
                health_check_path=ep.get("health_check_path"),
                requires_auth=ep.get("requires_auth", False),
                auth_type=ep.get("auth_type"),
            ))

        service_config = {
            "description": config.get("description", ""),
            "service_type": config.get("service_type", ServiceType.APPLICATION),
            "endpoints": endpoints,
            "user_controllable": config.get("user_controllable", True),
            "compose_file": config.get("compose_file"),
            "metadata": config.get("metadata", {}),
        }

        success, message = self.docker_manager.add_dynamic_service(service_name, service_config)
        return ActionResult(success=success, message=message)

    # =========================================================================
    # Internal Helper Methods
    # =========================================================================

    def _find_service(self, name: str) -> Optional[DiscoveredService]:
        """Find a service by name or service_id."""
        # Try by name first (most common)
        service = self.compose_registry.get_service_by_name(name)
        if service:
            return service

        # Try by service_id
        service = self.compose_registry.get_service(name)
        return service

    async def _get_installed_service_names(self) -> tuple[set, set]:
        """Get sets of installed and removed service names."""
        default_services = await self.settings.get("default_services") or []
        installed = set(default_services)
        removed = set()

        user_installed = await self.settings.get("installed_services") or {}

        for service_name, state in user_installed.items():
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

    def _service_matches_installed(self, service: DiscoveredService, installed_names: set, removed_names: set) -> bool:
        """Check if a service matches any of the installed service names."""
        if service.service_name in removed_names:
            return False

        if service.service_name in installed_names:
            return True

        compose_base = service.compose_file.stem.replace('-compose', '')
        if compose_base in installed_names:
            return True

        return False

    async def _build_service_summary(self, service: DiscoveredService, installed: bool) -> ServiceSummary:
        """Build a ServiceSummary from a DiscoveredService."""
        # Get enabled state
        enabled = await self.settings.get(f"installed_services.{service.service_name}.enabled")
        if enabled is None:
            enabled = True

        # Get docker status
        docker_info = self.docker_manager.get_service_info(service.service_name)
        status = docker_info.status.value if docker_info else "unknown"
        health = docker_info.health if docker_info else None

        # Check if needs setup
        needs_setup = await self._check_needs_setup(service)

        # Get resolved ports (with overrides applied)
        resolved_ports = self.docker_manager.get_service_ports(service.service_name)
        # Convert to the expected format with actual port values
        ports_with_actual = []
        for rp in resolved_ports:
            ports_with_actual.append({
                "host": str(rp["port"]),  # The actual port to use
                "container": rp.get("container_port"),
                "env_var": rp.get("env_var"),
                "default_port": rp.get("default_port"),
            })

        return ServiceSummary(
            service_id=service.service_id,
            service_name=service.service_name,
            description=service.description,
            compose_file=str(service.compose_file),
            image=service.image,
            enabled=enabled,
            installed=installed,
            needs_setup=needs_setup,
            status=status,
            health=health,
            requires=service.requires,
            depends_on=service.depends_on,
            ports=ports_with_actual,
            profiles=service.profiles,
            required_env_count=len(service.required_env_vars),
            optional_env_count=len(service.optional_env_vars),
        )

    async def _check_needs_setup(self, service: DiscoveredService) -> bool:
        """Check if a service needs setup (missing required env vars)."""
        required_without_defaults = [
            ev for ev in service.required_env_vars
            if ev.is_required and not ev.has_default
        ]

        if not required_without_defaults:
            return False

        config_key = f"service_env_config.{service.service_id.replace(':', '_')}"
        saved_config = await self.settings.get(config_key) or {}

        for ev in required_without_defaults:
            saved = saved_config.get(ev.name, {})
            if hasattr(saved, 'items'):
                saved = dict(saved)

            if saved.get("source") == "setting" and saved.get("setting_path"):
                value = await self.settings.get(saved["setting_path"])
                if not value:
                    return True
            elif saved.get("source") == "literal" and saved.get("value"):
                continue
            else:
                has_value = await self.settings.has_value_for_env_var(ev.name)
                if not has_value:
                    return True

        return False

    def _mask_sensitive(self, name: str, value: str) -> str:
        """Mask sensitive values in output."""
        if any(keyword in name.upper() for keyword in ["KEY", "SECRET", "PASSWORD", "TOKEN"]):
            if len(value) > 4:
                return f"***{value[-4:]}"
            return "****"
        return value


# =============================================================================
# Singleton ServiceConfig
# =============================================================================

_orchestrator: Optional[ServiceOrchestrator] = None


def get_service_orchestrator() -> ServiceOrchestrator:
    """Get the singleton ServiceOrchestrator instance."""
    global _orchestrator
    if _orchestrator is None:
        _orchestrator = ServiceOrchestrator()
    return _orchestrator
