# Settings & Configuration System

**Implementation Status**: ✅ Production (January 2026)

This document describes the current settings and configuration system used across the ushadow platform.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [File Structure](#file-structure)
3. [Resolution Hierarchy](#resolution-hierarchy)
4. [API Usage](#api-usage)
5. [Template vs Instance Overrides](#template-vs-instance-overrides)
6. [Mapping Syntax](#mapping-syntax)
7. [Integration Points](#integration-points)

---

## Architecture Overview

The settings system is **stateless** and **file-based**, with no database dependencies. All configuration is stored in YAML files with a clear merge hierarchy.

### Core Components

```
Settings (settings.py)
├── High-level API for resolution
├── for_service()         - Template-level resolution
├── for_deployment()      - Instance-level resolution
└── for_deploy_config()   - Environment-specific resolution

SettingsStore (store.py)
├── Low-level YAML storage
├── File loading & merging
└── OmegaConf management

Secrets (secrets.py)
└── Secret detection & masking
```

---

## File Structure

### Directory Layout

```
config/
├── config.defaults.yaml         # Application defaults (committed)
├── SECRETS/
│   └── secrets.yaml             # API keys, passwords (gitignored)
├── config.overrides.yaml        # Template-level overrides (gitignored)
└── instance-overrides.yaml      # Instance-level overrides (gitignored)
```

### config.defaults.yaml

Application defaults, committed to git. Contains safe default values.

```yaml
settings:
  qdrant_base_url: qdrant
  qdrant_port: "6333"

default_services:
  - chronicle-backend
  - qdrant
```

### secrets.yaml

Sensitive values only, gitignored. Auto-routed by `should_store_in_secrets()`.

```yaml
api_keys:
  openai: sk-prod-...
  anthropic: sk-ant-...

security:
  auth_secret_key: secret-key-here
```

### config.overrides.yaml

Template-level overrides - apply to ALL instances of a service.

```yaml
settings:
  qdrant_base_url: qdrant2

services:
  chronicle-backend:
    QDRANT_BASE_URL: "@settings.qdrant_base_url"  # Mapping reference
    OPENAI_API_KEY: "@settings.api_keys.openai"
    CUSTOM_VALUE: "literal-value-here"             # Direct value
```

### instance-overrides.yaml

Instance-specific overrides - apply to one deployment instance.

```yaml
instances:
  chronicle-backend:prod:
    QDRANT_BASE_URL: qdrant-prod
    OPENAI_API_KEY: "@settings.api_keys.openai_prod"

  chronicle-backend:dev:
    QDRANT_BASE_URL: qdrant-dev
```

---

## Resolution Hierarchy

Settings are resolved through a 6-layer hierarchy (highest priority wins):

```
1. config.defaults.yaml           (lowest priority)
2. Compose file defaults           ${VAR:-default}
3. os.environ (.env file)          Environment variables
4. Capability                      Wired providers
5. Template Override               services.{service_id}
6. Instance Override               instances.{deployment_id}  (highest priority)
```

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

### Resolution Object

Each resolved value includes metadata:

```python
@dataclass
class Resolution:
    value: Optional[str]      # The resolved value
    source: Source            # Where it came from
    path: Optional[str]       # Mapping path if applicable

    @property
    def found(self) -> bool:
        return self.source != Source.NOT_FOUND
```

---

## API Usage

### Import

```python
from src.config import get_settings

settings = get_settings()
```

### For Services (Template-Level)

Get resolutions for a service (all instances share these values):

```python
resolutions = await settings.for_service("chronicle-backend")

# Returns:
# {
#     "QDRANT_BASE_URL": Resolution(
#         value="qdrant2",
#         source=Source.TEMPLATE_OVERRIDE,
#         path="qdrant_base_url"
#     ),
#     "OPENAI_API_KEY": Resolution(
#         value="sk-123...",
#         source=Source.TEMPLATE_OVERRIDE,
#         path="api_keys.openai"
#     )
# }
```

### For Deployments (Instance-Level)

Get resolutions for a specific deployment instance:

```python
resolutions = await settings.for_deployment("chronicle-backend:prod")

# Includes both template AND instance overrides
# Instance overrides take precedence
```

### For Deploy Configs (Environment-Specific)

Get resolutions for deployment to a specific environment:

```python
resolutions = await settings.for_deploy_config("purple", "chronicle-backend")

# Includes environment-specific overrides from deploy_env.{environment}
```

### Direct Setting Access

```python
# Get a single setting value
api_key = await settings.get("api_keys.openai")

# Update settings (auto-routes to secrets.yaml or config.overrides.yaml)
await settings.update({
    "api_keys.openai": "sk-new-key",      # Routes to secrets.yaml
    "qdrant_url": "http://qdrant:6333"    # Routes to config.overrides.yaml
})
```

---

## Template vs Instance Overrides

### Template-Level (services.{service_id})

Applies to **ALL instances** of a service. Stored in `config.overrides.yaml`.

**Use when:**
- All instances should use the same value
- Setting a default for new instances
- Mapping to shared infrastructure

**Example:**
```yaml
services:
  chronicle-backend:
    QDRANT_BASE_URL: "@settings.qdrant_url"  # All instances use same Qdrant
```

### Instance-Level (instances.{deployment_id})

Applies to **ONE specific instance**. Stored in `instance-overrides.yaml`.

**Use when:**
- Production vs dev need different values
- Instance-specific credentials
- Different infrastructure per environment

**Example:**
```yaml
instances:
  chronicle-backend:prod:
    OPENAI_API_KEY: "@settings.api_keys.openai_prod"

  chronicle-backend:dev:
    OPENAI_API_KEY: "@settings.api_keys.openai_dev"
```

### Instance ID Format

Format: `{service_id}:{instance_name}`

Examples:
- `chronicle-backend:prod`
- `chronicle-backend:dev`
- `mem0-compose:mem0-api:staging`

---

## Mapping Syntax

Use `@settings.path` to reference another setting instead of duplicating values.

### Direct Values

```yaml
services:
  my-service:
    PORT: "8080"                    # Literal value
    BASE_URL: "https://api.com"
```

### Mapping References

```yaml
settings:
  qdrant_url: http://qdrant:6333
  api_keys:
    openai: sk-prod-...

services:
  chronicle-backend:
    QDRANT_BASE_URL: "@settings.qdrant_url"
    OPENAI_API_KEY: "@settings.api_keys.openai"
```

### How Mappings Work

1. **Stored**: Raw `@settings.path` string saved to YAML
2. **Loaded**: Settings API detects `@settings.` prefix
3. **Resolved**: Looks up actual value at that path
4. **Tracked**: Resolution includes `path` field for UI display

```python
# In config.overrides.yaml:
services:
  my-service:
    API_KEY: "@settings.api_keys.openai"

# Resolution result:
Resolution(
    value="sk-123...",              # Actual value
    source=Source.TEMPLATE_OVERRIDE,
    path="api_keys.openai"          # Mapping path
)
```

---

## Integration Points

### Service Orchestrator

Service orchestration layer delegates to Settings API:

```python
# ushadow/backend/src/services/service_orchestrator.py

async def get_env_config(self, name: str) -> Dict[str, Any]:
    """Get environment variable configuration with suggestions."""
    service = self._find_service(name)

    # Use Settings API for resolution
    resolutions = await settings.for_service(service.service_id)

    # Build env var config from resolutions
    for ev in service.env_vars:
        resolution = resolutions.get(ev.name)
        # Use resolution.value, resolution.source, resolution.path
```

### Deployment Manager

Deployment manager uses Settings API for all deployment targets:

```python
# ushadow/backend/src/services/deployment_manager.py

async def resolve_service(
    self,
    service_id: str,
    deploy_target: Optional[str] = None,
    config_id: Optional[str] = None
) -> ResolvedServiceDefinition:
    """
    Resolve service definition using Settings API.

    This is the single source of truth for variable resolution.
    """
    from src.config import get_settings
    settings = get_settings()

    # Choose resolution method based on context
    if config_id:
        env_resolutions = await settings.for_deployment(config_id)
    elif deploy_target:
        env_resolutions = await settings.for_deploy_config(deploy_target, service_id)
    else:
        env_resolutions = await settings.for_service(service_id)

    # Extract values from Resolution objects
    container_env = {
        env_var: resolution.value
        for env_var, resolution in env_resolutions.items()
        if resolution.value is not None
    }

    # Use container_env for deployment
```

### Frontend

Frontend converts backend source types for editing:

```typescript
// Convert template_override/instance_override to edit format
let source = envVar.source || 'default'
if (source === 'template_override' || source === 'instance_override') {
  source = envVar.setting_path ? 'setting' : 'literal'
}

// Save includes all configured vars
const envVarConfigs = Object.values(envConfigs).filter((config) => {
  if (config.source === 'new_setting' && config.value) return true
  if (config.source === 'setting' && config.setting_path) return true
  if (config.source === 'literal' && config.value) return true
  return false
})
```

---

## Key Benefits

1. **Stateless**: All config in YAML files, no database needed
2. **Clear Hierarchy**: 6-layer resolution with explicit priorities
3. **Source Tracking**: Know exactly where each value came from
4. **Unified API**: Single Settings class handles all resolution
5. **Simple Syntax**: Direct values or `@settings.path` mappings
6. **Automatic Routing**: Secrets go to secrets.yaml, others to config.overrides.yaml
7. **Deep Merging**: OmegaConf preserves existing keys when updating

---

## Migration Notes

### Old Structure (DEPRECATED - Removed)

```yaml
# ❌ OLD - Do not use
service_env_config:
  chronicle-backend:
    QDRANT_BASE_URL:
      source: setting
      setting_path: settings.qdrant_base_url
```

### New Structure (CURRENT)

```yaml
# ✅ NEW - Current implementation
services:
  chronicle-backend:
    QDRANT_BASE_URL: "@settings.qdrant_base_url"
```

Much simpler! Direct values or mapping references.

---

## Files Reference

### Core Implementation

- `ushadow/backend/src/config/settings.py` - High-level Settings API
- `ushadow/backend/src/config/store.py` - Low-level YAML storage
- `ushadow/backend/src/config/secrets.py` - Secret detection & masking
- `ushadow/backend/src/config/__init__.py` - Public exports

### Integration

- `ushadow/backend/src/services/service_orchestrator.py` - Service management
- `ushadow/backend/src/services/deployment_manager.py` - Deployment resolution

### Frontend

- `ushadow/frontend/src/pages/ServiceConfigsPage.tsx` - Service config UI
- `ushadow/frontend/src/components/EnvVarEditor.tsx` - Env var editing

### Tests

- `ushadow/backend/tests/test_settings.py`
- `ushadow/backend/tests/test_secrets.py`
