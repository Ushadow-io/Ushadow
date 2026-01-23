# Settings API Specification (v2)

## Overview

Entity-based settings resolution. Each entity type (service, deploy config, deployment) has its own view of settings.

---

## Core API: 7 Methods

```python
from dataclasses import dataclass
from typing import Optional, List, Dict, Any
from enum import Enum

class Source(Enum):
    """Resolution sources, lowest to highest priority."""
    CONFIG_DEFAULT = "config_default"    # 1. config.defaults.yaml
    COMPOSE_DEFAULT = "compose_default"  # 2. Default in compose file
    ENV_FILE = "env_file"                # 3. .env file (os.environ)
    CAPABILITY = "capability"            # 4. Wired provider/capability
    DEPLOY_ENV = "deploy_env"            # 5. Environment-specific override
    USER_OVERRIDE = "user_override"      # 6. Explicit user configuration
    NOT_FOUND = "not_found"

@dataclass
class Resolution:
    value: Optional[str]
    source: Source
    path: Optional[str] = None  # settings path if source=CONFIG_DEFAULT

    @property
    def found(self) -> bool:
        return self.source != Source.NOT_FOUND


class Settings:
    """
    Entity-based settings resolution.

    Each method returns settings for a specific entity type,
    applying the appropriate layers of the hierarchy.
    """

    # -------------------------------------------------------------------------
    # Entity-Level Resolution
    # -------------------------------------------------------------------------

    async def for_service(self, service_id: str) -> Dict[str, Resolution]:
        """
        Get settings for a service template.

        Layers: config_default → compose_default → env_file → capability

        Use case: Service configuration page
        """

    async def for_deploy_config(
        self,
        deploy_target: str,
        service_id: str
    ) -> Dict[str, Resolution]:
        """
        Get settings preview for a deployment target.

        Layers: config_default → compose_default → env_file → capability → deploy_env

        Use case: Deployment preview modal (shows what will change)
        """

    async def for_deployment(self, deployment_id: str) -> Dict[str, Resolution]:
        """
        Get settings for a running deployment instance.

        Layers: ALL (full hierarchy including user_override)

        Use case: Deployed instance detail page
        """

    # -------------------------------------------------------------------------
    # Suggestions (for UI dropdowns)
    # -------------------------------------------------------------------------

    async def get_suggestions(self, env_var: str) -> List[Suggestion]:
        """
        Get possible settings that could fill this env var.
        Used for dropdown menus in the UI.
        """

    # -------------------------------------------------------------------------
    # Direct path access (for module init and internal use)
    # -------------------------------------------------------------------------

    async def get(self, path: str, default: Any = None) -> Any:
        """Get a value by settings path."""

    def get_sync(self, path: str, default: Any = None) -> Any:
        """Sync version for module-level initialization."""

    # -------------------------------------------------------------------------
    # Mutations
    # -------------------------------------------------------------------------

    async def set(self, path: str, value: Any) -> None:
        """Set a setting value (auto-routes to secrets/overrides)."""

    async def delete(self, path: str) -> bool:
        """Delete a setting override. Returns True if existed."""
```

---

## Resolution Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│ 6. USER_OVERRIDE (highest priority)                             │
│    Explicit user configuration                                  │
├─────────────────────────────────────────────────────────────────┤
│ 5. DEPLOY_ENV                                                   │
│    Environment-specific override (production, staging, etc.)    │
├─────────────────────────────────────────────────────────────────┤
│ 4. CAPABILITY                                                   │
│    Value from wired provider (e.g., OpenAI API key)             │
├─────────────────────────────────────────────────────────────────┤
│ 3. ENV_FILE                                                     │
│    .env file (loaded into os.environ)                           │
├─────────────────────────────────────────────────────────────────┤
│ 2. COMPOSE_DEFAULT                                              │
│    Default in compose file (${VAR:-default})                    │
├─────────────────────────────────────────────────────────────────┤
│ 1. CONFIG_DEFAULT (lowest priority)                             │
│    config.defaults.yaml                                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Entity Types and Their Layers

| Entity | Method | Layers Applied |
|--------|--------|----------------|
| Service template | `for_service(service_id)` | 1-4 |
| Deploy config | `for_deploy_config(target, service_id)` | 1-5 |
| Deployment instance | `for_deployment(deployment_id)` | 1-6 (all) |

---

## Usage Examples

```python
from src.config import get_settings

settings = get_settings()

# Service page - show what the service needs
results = await settings.for_service("chronicle-compose:chronicle-backend")
# => {
#   "MONGODB_DATABASE": Resolution(value="ushadow_purple", source=Source.ENV_FILE),
#   "OPENAI_API_KEY": Resolution(value="sk-...", source=Source.CAPABILITY),
# }

# Deploy modal - preview what will apply at this target
service_settings = await settings.for_service("chronicle-compose:chronicle-backend")
deploy_settings = await settings.for_deploy_config("production", "chronicle-compose:chronicle-backend")
# Compare to show what changes

# Deployment detail - actual running values
results = await settings.for_deployment("chronicle:prod-instance")
# Includes user overrides
```

---

## API Endpoints

```
GET /api/services/{service_id}/settings
  → calls settings.for_service(service_id)
  Response: { "OPENAI_API_KEY": { "value": "sk-...", "source": "capability" }, ... }

GET /api/deploy-config/{target}/services/{service_id}/settings
  → calls settings.for_deploy_config(target, service_id)

GET /api/deployments/{deployment_id}/settings
  → calls settings.for_deployment(deployment_id)

GET /api/settings/suggestions/{env_var}
  → calls settings.get_suggestions(env_var)
  Response: [{ "path": "...", "label": "...", "has_value": true }]

GET /api/settings/{path}
  → calls settings.get(path)

PUT /api/settings/{path}
  Request: { "value": "new-value" }
  → calls settings.set(path, value)

DELETE /api/settings/{path}
  → calls settings.delete(path)
```

---

## What This Replaces

| Old Method | New |
|------------|-----|
| `build_env_var_config(env_vars, saved_config, requires, ...)` | `for_service()` / `for_deployment()` |
| `get_by_env_var(name)` | `for_service(service_id)[env_var].value` |
| `find_setting_for_env_var(name)` | `for_service(service_id)[env_var]` |
| `has_value_for_env_var(name)` | `for_service(service_id)[env_var].found` |
| `resolve_env_value(...)` | `for_deployment(deployment_id)[env_var].value` |
| `get_suggestions_for_env_var(name)` | `get_suggestions(name)` |

---

## Summary

**7 methods total:**

| Method | Purpose |
|--------|---------|
| `for_service(service_id)` | Settings at service level |
| `for_deploy_config(target, service_id)` | Settings preview for deployment target |
| `for_deployment(deployment_id)` | Settings for running instance |
| `get_suggestions(env_var)` | Dropdown options for UI |
| `get(path)` / `get_sync(path)` | Direct path access |
| `set(path, value)` | Set a value |
| `delete(path)` | Remove an override |
