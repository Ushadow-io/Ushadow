# Unified Configuration Architecture

## New Model: ServiceConfig

### What It Represents
A **service configuration** - a specific configured instance of a template (Provider or ComposeService), ready to be used or deployed.

### Naming Convention
- Model: `ServiceConfig`
- Manager: `ServiceConfigManager`
- API: `/api/svc-configs` (shortened)
- YAML: `service_configs.yaml` (runtime state only)
- Variables: `svc_config_id` or `config_id`

## Architecture Change

### Before (Current - Duplicated Config)

```
SettingsStore (OmegaConf):
  config.defaults.yaml:
    llm:
      openai_model: gpt-4o-mini

  config.overrides.yaml:
    llm:
      openai_model: gpt-4o

Separate instances.yaml:
  instances:
    openai-prod:
      config:  # DUPLICATE!
        model: gpt-4o
        api_key: sk-123
```

### After (Unified in SettingsStore)

```yaml
# config.defaults.yaml (template defaults)
templates:
  openai:
    model: gpt-4o-mini
    base_url: https://api.openai.com/v1

  openmemory-compose:mem0:
    port: 8765
    openai_model: gpt-4o-mini

# config.overrides.yaml (instance-specific config)
service_configs:
  openai-prod:
    api_key: ${api_keys.openai_prod_key}  # Interpolation works!
    model: gpt-4o  # Overrides template default

  openai-dev:
    api_key: ${api_keys.openai_dev_key}
    model: gpt-4o-mini

  mem0-local:
    port: 8766  # Port override for second instance!
    openai_api_key: ${api_keys.openai_api_key}

# service_configs.yaml (runtime state ONLY)
service_configs:
  openai-prod:
    template_id: openai
    config_path: service_configs.openai-prod  # Reference to SettingsStore
    status: configured
    created_at: 2026-01-15T20:19:23Z

  mem0-local:
    template_id: openmemory-compose:mem0
    config_path: service_configs.mem0-local
    deployment_target: local
    status: running
    container_id: abc123def456
    container_name: mem0-abc123de
    deployment_id: abc123de
```

## ServiceConfig Model (New)

```python
class ServiceConfig(BaseModel):
    """
    A configured service ready for use.

    Runtime state only - actual config values live in SettingsStore.
    """
    id: str
    template_id: str  # openai, openmemory-compose:mem0
    name: str
    description: Optional[str]

    # Configuration reference (not the config itself!)
    config_path: str  # Path in SettingsStore: "service_configs.{id}"

    # Deployment
    deployment_target: Optional[str]  # None=local, hostname=unode, "cloud"
    status: ServiceConfigStatus

    # Runtime state (only for deployed services)
    container_id: Optional[str]
    container_name: Optional[str]
    deployment_id: Optional[str]

    # Timestamps
    created_at: datetime
    deployed_at: Optional[datetime]
    updated_at: Optional[datetime]

    # Error tracking
    error: Optional[str]
```

## Status Values

```python
class ServiceConfigStatus(str, Enum):
    # Cloud services
    CONFIGURED = "configured"      # Has valid credentials
    UNCONFIGURED = "unconfigured"  # Missing required config

    # Deployable services
    PENDING = "pending"            # Created but not deployed
    DEPLOYING = "deploying"        # Currently deploying
    RUNNING = "running"            # Running and accessible
    STOPPED = "stopped"            # Stopped gracefully
    ERROR = "error"                # Failed or crashed
```

## Configuration Resolution Order

```
1. Template defaults (config.defaults.yaml → templates.{template_id})
2. Instance overrides (config.overrides.yaml → service_configs.{id})
3. Wired provider values (for capability resolution)
```

All resolved through SettingsStore with OmegaConf interpolation!

## Benefits

### 1. Single Source of Truth
All config values in SettingsStore - no duplication

### 2. OmegaConf Interpolation Everywhere
```yaml
service_configs:
  mem0-prod:
    openai_api_key: ${api_keys.openai_api_key}  # ✅ Works!
    neo4j_password: ${secrets.neo4j_password}    # ✅ Works!
```

### 3. Defaults/Overrides Pattern
Consistent with existing SettingsStore behavior

### 4. Port Overrides Natural
```yaml
service_configs:
  mem0-instance-2:
    port: 8766  # Just another config value!
```

### 5. Per-Instance Configuration
Multiple configs of same template, each with different values

### 6. Secret Management
All secrets in `secrets.yaml`, referenced via interpolation

## API Changes

### Endpoints
```
POST   /api/svc-configs                    Create new service config
GET    /api/svc-configs                    List all service configs
GET    /api/svc-configs/{id}               Get service config details
PATCH  /api/svc-configs/{id}               Update service config
DELETE /api/svc-configs/{id}               Delete service config

POST   /api/svc-configs/{id}/deploy        Deploy/start service
POST   /api/svc-configs/{id}/stop          Stop service
GET    /api/svc-configs/{id}/preflight     Check for port conflicts
POST   /api/svc-configs/{id}/port-override Set port override
```

### Request/Response Models
```python
class ServiceConfigCreate(BaseModel):
    id: str
    template_id: str
    name: str
    config: Dict[str, Any]  # Written to SettingsStore
    deployment_target: Optional[str]

class ServiceConfigUpdate(BaseModel):
    name: Optional[str]
    config: Optional[Dict[str, Any]]  # Merged into SettingsStore
    deployment_target: Optional[str]
```

## Implementation Strategy

### Phase 1: Rename (No Config Move)
1. Rename `Instance` → `ServiceConfig` (keep nested config for now)
2. Rename manager, routes, frontend
3. Test everything still works

### Phase 2: Unify Config (Architecture Change)
1. Add `config_path` field to `ServiceConfig`
2. Read config from SettingsStore instead of nested field
3. Write config updates to SettingsStore
4. Remove nested `config` field
5. Migrate existing data

**Recommendation**: Do Phase 1 first (rename), Phase 2 separately (config unification)

## Migration Path

### Step 1: Add config_path Field (Backwards Compatible)
```python
class ServiceConfig(BaseModel):
    config_path: Optional[str]  # New field
    config: Optional[Dict]       # Keep for backwards compat
```

### Step 2: Dual Write
When creating/updating, write to BOTH locations:
- SettingsStore: `service_configs.{id}.*`
- service_configs.yaml: Keep `config` field

### Step 3: Migrate Data
Script to copy all `config` values to SettingsStore

### Step 4: Dual Read
Prefer SettingsStore, fall back to nested config

### Step 5: Remove Nested Config
Once all data migrated, remove nested field

## Files Affected (Phase 1 - Rename Only)

### Backend
- `models/instance.py` → `models/service_config.py`
- `services/instance_manager.py` → `services/service_config_manager.py`
- `routers/instances.py` → `routers/service_configs.py`
- All references in other services

### Frontend
- `pages/InstancesPage.tsx` → `pages/ServiceConfigsPage.tsx`
- `services/api.ts` - Update types and endpoints
- `components/wiring/*` - Update references

### Config
- `instances.yaml` → `service_configs.yaml`
- `wiring.yaml` - Update field names

## Questions to Resolve

1. **API path**: `/api/svc-configs` or `/api/service-configs`?
   - Recommend: `/api/svc-configs` (shorter)

2. **Config path pattern**: `service_configs.{id}` or `instances.{id}`?
   - Recommend: `service_configs.{id}` (matches new naming)

3. **Do both phases now or separate?**
   - Recommend: Phase 1 (rename) now, Phase 2 (config unification) next

4. **Backwards compatibility**: Keep old endpoints?
   - Recommend: Clean break since still in development
