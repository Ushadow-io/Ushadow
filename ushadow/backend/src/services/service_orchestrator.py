"""
Service Orchestrator - Unified facade for service management.

This is the single entry point for all service operations, combining:
- ComposeServiceRegistry: Service discovery from compose files
- DockerManager: Container lifecycle management
- Settings: Configuration and state persistence

Routers should use this layer instead of calling underlying managers directly.
"""

import logging
import os
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional, TYPE_CHECKING

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
from src.services.provider_registry import get_provider_registry

# Lazy imports to avoid circular dependency
if TYPE_CHECKING:
    from src.config import Settings

logger = logging.getLogger(__name__)


# =============================================================================
# Well-known env var to settings path mappings
# =============================================================================
# These env vars are automatically resolved from settings if not configured
WELL_KNOWN_ENV_MAPPINGS = {
    "AUTH_SECRET_KEY": "security.auth_secret_key",
    "ADMIN_PASSWORD": "security.admin_password",
    "USER": "auth.admin_email",  # For OpenMemory backend
    "MYCELIA_SECRET_KEY": "security.auth_secret_key",  # Mycelia JWT signing
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
    wizard: Optional[str] = None  # ID of setup wizard if available

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
            "wizard": self.wizard,
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
    ├── installed   → (default_services + installed_services) - removed_services
    │                 default_services: from config.defaults.yaml (list)
    │                 installed_services: user-added services (list)
    │                 removed_services: removed from defaults (list)
    └── enabled     → NOT in disabled_services list (default: enabled)

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
        self._settings: Optional['Settings'] = None

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
    def settings(self) -> 'Settings':
        if self._settings is None:
            from src.config import get_settings
            self._settings = get_settings()
        return self._settings

    # =========================================================================
    # Discovery Methods
    # =========================================================================

    def _is_service_visible_in_environment(self, service: DiscoveredService) -> bool:
        """
        Check if a service should be visible in the current environment.

        Logic:
        - If service.environments is empty: visible in ALL environments
        - If service.environments has values: only visible if current ENV_NAME is in the list

        Examples:
        - environments: [] -> visible everywhere (default)
        - environments: ["blue"] -> only visible in "blue" env
        - environments: ["orange", "blue"] -> visible in both
        """
        import os

        # If no environments specified, service is visible everywhere
        if not service.environments:
            return True

        # Get current environment name
        current_env = os.getenv("ENV_NAME", "default")

        # Service is only visible if current env is in its list
        return current_env in service.environments

    async def list_installed_services(self) -> List[Dict[str, Any]]:
        """Get all installed services with basic info and status."""
        installed_names, removed_names = await self._get_installed_service_names()
        all_services = self.compose_registry.get_services()

        # Filter by environment and installation status
        installed_services = [
            s for s in all_services
            if self._service_matches_installed(s, installed_names, removed_names)
            and self._is_service_visible_in_environment(s)
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
            # Filter by environment
            if not self._is_service_visible_in_environment(service):
                continue

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

        disabled_services = await self.settings.get("disabled_services") or []
        enabled = service.service_name not in disabled_services

        return {
            "service_id": service.service_id,
            "service_name": service.service_name,
            "enabled": enabled,
        }

    async def set_enabled_state(self, name: str, enabled: bool) -> Optional[Dict[str, Any]]:
        """Enable or disable a service."""
        service = self._find_service(name)
        if not service:
            return None

        disabled_services = await self.settings.get("disabled_services") or []

        if enabled:
            # Remove from disabled list if present
            if service.service_name in disabled_services:
                disabled_services.remove(service.service_name)
        else:
            # Add to disabled list if not present
            if service.service_name not in disabled_services:
                disabled_services.append(service.service_name)

        await self.settings.update({
            "disabled_services": disabled_services
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

        # Get template-level env config from new structure: services.{service_id}
        env_config = await self.settings.get(f"services.{service.service_id}") or {}

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

    async def get_env_config(self, name: str, deploy_target: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Get environment variable configuration with suggestions.

        Uses the new entity-based Settings API (v2) for resolution.

        Args:
            name: Service name
            deploy_target: Optional deployment target (unode hostname or cluster ID)
                          to include deploy_env layer in resolution
        """
        service = self._find_service(name)
        if not service:
            return None

        schema = service.get_env_schema()
        from src.config import get_settings
        settings_v2 = get_settings()

        # Get resolutions using new entity-based API
        # Use for_deploy_config if deploy_target is provided (includes deploy_env layer)
        if deploy_target:
            # Extract environment from deployment_target_id (e.g., "ushadow-purple.unode.purple" -> "purple")
            from src.utils.deployment_targets import parse_deployment_target_id
            try:
                parsed = parse_deployment_target_id(deploy_target)
                environment = parsed["environment"]
            except ValueError:
                # Fallback for backward compatibility if not in new format
                environment = deploy_target

            resolutions = await settings_v2.for_deploy_config(environment, service.service_id)
        else:
            resolutions = await settings_v2.for_service(service.service_id)

        # Build env var config from schema + resolutions + suggestions
        async def build_env_var_info(ev: EnvVarConfig, is_required: bool) -> Dict[str, Any]:
            """Build single env var info from schema and resolution."""
            from src.config import Source

            resolution = resolutions.get(ev.name)
            suggestions = await settings_v2.get_suggestions(ev.name)

            # Map Source enum to string for API response
            source = resolution.source.value if resolution else "default"
            resolved_value = resolution.value if resolution and resolution.found else None

            # Determine if this came from a setting path
            setting_path = resolution.path if resolution else None

            # Handle locked values (from capabilities/providers)
            is_locked = source == Source.CAPABILITY.value if resolution else False
            provider_name = None
            if is_locked and setting_path:
                # Extract provider from capability path if available
                parts = setting_path.split('.')
                if len(parts) >= 2:
                    provider_name = parts[1] if parts[0] == 'capabilities' else None

            return {
                "name": ev.name,
                "is_required": is_required,
                "source": source,
                "setting_path": setting_path,
                "resolved_value": resolved_value,
                "suggestions": [s.to_dict() for s in suggestions],
                "locked": is_locked,
                "provider_name": provider_name,
            }

        required_vars = [
            await build_env_var_info(ev, is_required=True)
            for ev in schema.required_env_vars
        ]
        optional_vars = [
            await build_env_var_info(ev, is_required=False)
            for ev in schema.optional_env_vars
        ]

        return {
            "service_id": service.service_id,
            "service_name": schema.service_name,
            "compose_file": schema.compose_file,
            "requires": schema.requires,
            "required_env_vars": required_vars,
            "optional_env_vars": optional_vars,
        }

    async def update_env_config(self, name: str, env_vars: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        """Save environment variable configuration to services.{service_id} in config.overrides.yaml."""
        service = self._find_service(name)
        if not service:
            return None

        # Process env vars - convert to new simple format
        new_settings_to_create = {}
        template_overrides = {}

        for ev in env_vars:
            ev_name = ev.get("name")
            source = ev.get("source")
            value = ev.get("value", "")

            # Skip masked values - they indicate the frontend is passing back masked secrets
            if value and isinstance(value, str) and (value.startswith("***") or value.startswith("•••")):
                logger.debug(f"Skipping masked value for {ev_name}")
                continue

            if source == "new_setting" and ev.get("new_setting_path") and value:
                # Create the setting and reference it
                new_settings_to_create[ev["new_setting_path"]] = value
                template_overrides[ev_name] = f"@settings.{ev['new_setting_path']}"

            elif source == "setting" and ev.get("setting_path"):
                # Reference existing setting using @settings.path syntax
                # IMPORTANT: Ignore the value field - only use the setting_path
                template_overrides[ev_name] = f"@settings.{ev['setting_path']}"

            elif source == "literal" and value:
                # Store literal value directly
                template_overrides[ev_name] = value

            # else: source == "default" or empty - don't save anything (use compose default)

        # Create new settings if any
        if new_settings_to_create:
            await self.settings.update(new_settings_to_create)
            logger.info(f"Created {len(new_settings_to_create)} new settings")

        # Save to new structure: services.{service_id}
        # OmegaConf.merge in store will preserve existing keys not in this update
        if template_overrides:
            await self.settings.update({
                f"services.{service.service_id}": template_overrides
            })
            logger.info(f"Saved {len(template_overrides)} template overrides for {service.service_id}")

        return {
            "service_id": service.service_id,
            "saved": len(template_overrides),
            "new_settings_created": len(new_settings_to_create),
            "message": f"Environment configuration saved for {service.service_name}"
        }

    async def resolve_env_vars(self, name: str) -> Optional[Dict[str, Any]]:
        """Resolve env vars to actual values for runtime using Settings API."""
        service = self._find_service(name)
        if not service:
            return None

        # Use Settings API to get all resolutions
        resolutions = await self.settings.for_service(service.service_id)

        resolved = {}
        missing = []

        for ev in service.all_env_vars:
            resolution = resolutions.get(ev.name)

            if resolution and resolution.found:
                # Mask sensitive values for display
                resolved[ev.name] = self._mask_sensitive(ev.name, resolution.value)
            else:
                # Not resolved
                if ev.is_required:
                    missing.append(f"{ev.name} (not configured)")

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

        # Use Settings API to get all resolutions (unmasked)
        resolutions = await self.settings.for_service(service.service_id)

        env_vars = {}
        missing = []

        for ev in service.all_env_vars:
            resolution = resolutions.get(ev.name)

            if resolution and resolution.found:
                # Export actual unmasked value
                env_vars[ev.name] = str(resolution.value)
            else:
                # Not resolved
                if ev.is_required:
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

        # Get current lists
        installed_services = await self.settings.get("installed_services") or []
        removed_services = await self.settings.get("removed_services") or []

        # Add to installed if not already there
        if service_name not in installed_services:
            installed_services.append(service_name)

        # Remove from removed list if present
        if service_name in removed_services:
            removed_services.remove(service_name)

        # Update settings
        await self.settings.update({
            "installed_services": installed_services,
            "removed_services": removed_services,
        })

        logger.info(f"Installed service: {service_name}")

        # Run setup script if declared in x-ushadow
        setup_output = {}
        if service.setup_script:
            setup_output = await self._run_setup_script(service)

        return {
            "service_id": service.service_id,
            "service_name": service_name,
            "installed": True,
            "message": f"Service '{service_name}' has been installed",
            "setup": setup_output,
        }

    async def _run_setup_script(self, service: DiscoveredService) -> Dict[str, Any]:
        """Run a service's x-ushadow setup script and save KEY=VALUE output to settings.

        The script path is resolved relative to the compose file's directory.
        Each KEY=VALUE line in stdout is saved as api_keys.{key.lower()} in settings.

        Returns dict with 'saved' (list of setting paths written) and optional 'error'.
        """
        import subprocess
        import sys
        from pathlib import Path

        script_path = Path(service.setup_script)
        if not script_path.is_absolute():
            script_path = service.compose_file.parent / script_path

        if not script_path.exists():
            logger.warning("[SETUP] Script not found: %s", script_path)
            return {"error": f"Setup script not found: {script_path}"}

        try:
            result = subprocess.run(
                [sys.executable, str(script_path)],
                capture_output=True, text=True, timeout=60
            )
            if result.returncode != 0:
                logger.error("[SETUP] Script failed (%s): %s", service.service_name, result.stderr)
                return {"error": result.stderr.strip()}

            updates = {}
            for line in result.stdout.splitlines():
                if "=" in line:
                    key, _, value = line.partition("=")
                    updates[f"api_keys.{key.strip().lower()}"] = value.strip()

            if updates:
                await self.settings.update(updates)
                logger.info("[SETUP] %s: saved %s", service.service_name, list(updates.keys()))

            return {"saved": list(updates.keys())}
        except Exception as e:
            logger.error("[SETUP] Script error (%s): %s", service.service_name, e)
            return {"error": str(e)}

    async def uninstall_service(self, name: str) -> Optional[Dict[str, Any]]:
        """Uninstall a service (remove from installed list)."""
        service = self._find_service(name)
        if not service:
            return None

        service_name = service.service_name

        # Get current lists
        default_services = await self.settings.get("default_services") or []
        installed_services = await self.settings.get("installed_services") or []
        removed_services = await self.settings.get("removed_services") or []

        # If it's a default service, add to removed list
        if service_name in default_services:
            if service_name not in removed_services:
                removed_services.append(service_name)

        # Remove from user-installed list if present
        if service_name in installed_services:
            installed_services.remove(service_name)

        # Update settings
        await self.settings.update({
            "installed_services": installed_services,
            "removed_services": removed_services,
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
        """Get sets of installed and removed service names.

        Final = (default_services + installed_services) - removed_services
        """
        default_services = await self.settings.get("default_services") or []
        user_installed = await self.settings.get("installed_services") or []
        removed_services = await self.settings.get("removed_services") or []

        # Build final installed set
        installed = set(default_services) | set(user_installed)
        removed = set(removed_services)
        installed -= removed

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
        disabled_services = await self.settings.get("disabled_services") or []
        enabled = service.service_name not in disabled_services

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
            wizard=service.wizard,
        )

    async def _check_needs_setup(self, service: DiscoveredService) -> bool:
        """Check if a service needs setup (missing required env vars).

        Uses the entity-based Settings API to check if values can be resolved
        from any source (service config, capabilities, providers, or settings).
        """
        required_without_defaults = [
            ev for ev in service.required_env_vars
            if ev.is_required and not ev.has_default
        ]

        if not required_without_defaults:
            return False

        # Use the Settings API resolution to check if values are available
        from src.config import get_settings
        settings_v2 = get_settings()
        resolutions = await settings_v2.for_service(service.service_id)

        for ev in required_without_defaults:
            resolution = resolutions.get(ev.name)

            # Check if value can be resolved from any source
            if not resolution or not resolution.found:
                # Also check well-known mappings as fallback
                if ev.name in WELL_KNOWN_ENV_MAPPINGS:
                    settings_path = WELL_KNOWN_ENV_MAPPINGS[ev.name]
                    value = await self.settings.get(settings_path)
                    if not value:
                        return True
                else:
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
