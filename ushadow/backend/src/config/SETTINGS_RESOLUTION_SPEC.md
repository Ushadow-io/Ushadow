# Settings Resolution Specification

## Overview

This document specifies the unified approach for resolving environment variable values across all contexts in ushadow. The goal is a single source of truth that eliminates fragmented resolution logic.

**Implementation Status**: ✅ **IMPLEMENTED** (Jan 2026)

For implementation details, see `/tmp/new_config_structure.md`

---

## Architecture

### Two-Level Override System

1. **Template-Level** (`config.overrides.yaml` → `services.{service_id}`)
   - Applies to ALL instances of a service
   - Example: All Chronicle instances use the same Qdrant instance

2. **Instance-Level** (`instance-overrides.yaml` → `instances.{deployment_id}`)
   - Applies to specific deployment instance
   - Example: Chronicle production uses qdrant-prod, dev uses qdrant-dev

### Mapping Syntax

Use `@settings.path` to reference other settings:

```yaml
# config.overrides.yaml
settings:
  qdrant_url: http://qdrant:6333

services:
  chronicle-backend:
    QDRANT_BASE_URL: "@settings.qdrant_url"  # Mapping reference
    QDRANT_PORT: "6333"                       # Direct value
```

---

## Resolution Priority (Highest Wins)

When resolving an environment variable, sources are checked in this order:

1. **config.defaults.yaml** - Application defaults (lowest priority)
2. **Compose file defaults** - Service-specific defaults from `docker-compose.yaml`
3. **os.environ (.env file)** - Environment variables
4. **Capability** - Wired providers from `wiring.yaml`
5. **Template Override** - `services.{service_id}` in `config.overrides.yaml`
6. **Instance Override** - `instances.{deployment_id}` in `instance-overrides.yaml` (highest priority)

### Source Enum

```python
class Source(str, Enum):
    CONFIG_DEFAULT = "config_default"
    COMPOSE_DEFAULT = "compose_default"
    ENV_FILE = "env_file"
    CAPABILITY = "capability"
    TEMPLATE_OVERRIDE = "template_override"
    INSTANCE_OVERRIDE = "instance_override"
    NOT_FOUND = "not_found"
```

---

## Settings API

The `Settings` class provides the unified interface for all resolution needs:

### For Services (Template-Level)

```python
from src.config import get_settings

settings = get_settings()

# Get resolutions for a service (all instances)
resolutions = await settings.for_service("chronicle-backend")

# resolutions = {
#     "QDRANT_BASE_URL": Resolution(
#         value="qdrant2",
#         source=Source.TEMPLATE_OVERRIDE,
#         found=True,
#         path=None
#     ),
#     ...
# }
```

### For Deployments (Instance-Level)

```python
# Get resolutions for specific deployment instance
resolutions = await settings.for_deployment("chronicle-backend:prod")

# Includes both template and instance overrides
# Instance overrides take precedence
```

### For Deploy Configs (with Environment)

```python
# Get resolutions for deployment config (includes deploy_env layer)
resolutions = await settings.for_deploy_config("purple", "chronicle-backend")

# Includes environment-specific overrides from deploy_env.{environment}
```

### Direct Setting Access

```python
# Get a single setting value
api_key = await settings.get("api_keys.openai")

# Update settings (auto-routes to secrets.yaml or config.overrides.yaml)
await settings.update({
    "api_keys.openai": "sk-new-key",
    "qdrant_url": "http://qdrant-prod:6333"
})
```

---

## File Structure

### config.defaults.yaml
Application defaults - committed to git

```yaml
settings:
  qdrant_base_url: qdrant
  qdrant_port: "6333"

default_services:
  - chronicle-backend
  - qdrant
```

### secrets.yaml (gitignored)
Sensitive values only

```yaml
api_keys:
  openai: sk-prod-...
  anthropic: sk-ant-...

security:
  auth_secret_key: secret-key-here
```

### config.overrides.yaml (gitignored)
Template-level overrides and non-sensitive settings

```yaml
settings:
  qdrant_base_url: qdrant2

services:
  chronicle-backend:
    QDRANT_BASE_URL: "@settings.qdrant_base_url"
    OPENAI_API_KEY: "@settings.api_keys.openai"
    CUSTOM_VALUE: "literal-value-here"
```

### instance-overrides.yaml (gitignored)
Instance-specific overrides

```yaml
instances:
  chronicle-backend:prod:
    QDRANT_BASE_URL: qdrant-prod
    OPENAI_API_KEY: "@settings.api_keys.openai_prod"

  chronicle-backend:dev:
    QDRANT_BASE_URL: qdrant-dev
    OPENAI_API_KEY: "@settings.api_keys.openai_dev"
```

---

## Usage Contexts

### Context A: Service Orchestration
**Caller**: `service_orchestrator.resolve_env_vars()`

```python
# Use Settings API for all resolution
resolutions = await self.settings.for_service(service.service_id)

for ev in service.all_env_vars:
    resolution = resolutions.get(ev.name)
    if resolution and resolution.found:
        resolved[ev.name] = resolution.value
```

### Context B: Docker Deployment
**Caller**: `docker_manager.start_service()`

Uses service_orchestrator which delegates to Settings API.

### Context C: UI Display
**Caller**: Frontend Service Config page

```python
# Get configuration with source tracking
resolutions = await settings.for_service(service_id)

for ev in env_vars:
    resolution = resolutions.get(ev.name)
    # resolution.source tells user WHERE value came from
    # resolution.value is the actual value (masked if sensitive)
```

### Context D: Export (.env Generation)
**Caller**: `service_orchestrator.export_env_vars()`

```python
# Get UNMASKED values for export
resolutions = await settings.for_service(service_id)

env_vars = {
    ev.name: str(resolution.value)
    for ev in service.all_env_vars
    if (resolution := resolutions.get(ev.name)) and resolution.found
}
```

---

## Migration from Old Structure

### Old Format (DEPRECATED)

```yaml
service_env_config:
  chronicle-backend:
    QDRANT_BASE_URL:
      source: setting
      setting_path: settings.qdrant_base_url
```

### New Format

```yaml
services:
  chronicle-backend:
    QDRANT_BASE_URL: "@settings.qdrant_base_url"
```

Much simpler! Direct values or mapping references.

---

## Key Benefits

1. **Stateless**: All config in YAML files, no database needed
2. **Clear Hierarchy**: Template vs instance overrides
3. **Source Tracking**: Know exactly where each value came from
4. **Unified API**: Single Settings class handles all resolution
5. **Simple Syntax**: Direct values or `@settings.path` mappings
6. **Automatic Routing**: Secrets go to secrets.yaml, others to config.overrides.yaml
