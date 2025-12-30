# Services Architecture Transition Plan

## Overview

This document outlines the plan to transition from the current services architecture to the new design defined in `SERVICES_ARCHITECTURE.md`.

## Current State

### Files That Exist

```
config/
├── config.defaults.yaml        # App settings (keep, rename to settings.yaml)
├── secrets.yaml                # Secrets (keep)
├── service-templates.yaml      # REMOVE - replaced by per-service files
├── default-services.yaml       # REMOVE - replaced by services.yaml + per-service files
├── services.yaml               # Partially exists (WIP)
└── feature_flags.yaml          # Keep as-is

ushadow/backend/src/
├── models/
│   └── service.py              # UPDATE - simplify models
├── services/
│   ├── service_registry.py     # UPDATE - new file loading logic
│   ├── docker_manager.py       # UPDATE - generate from service definitions
│   ├── deployment_manager.py   # UPDATE - use same service definitions
│   ├── omegaconf_settings.py   # KEEP - settings management
│   └── (deleted: service_manager.py, settings_manager.py)
└── routers/
    ├── services.py             # UPDATE - new API endpoints
    ├── docker.py               # UPDATE - integrate with new system
    └── settings.py             # KEEP - minimal changes
```

### Current Problems

1. `service-templates.yaml` + `default-services.yaml` is redundant split
2. `ServiceConfig` model is complex with unused fields
3. `DockerManager` has hardcoded `MANAGEABLE_SERVICES`
4. `DeploymentManager` uses separate MongoDB models, not aligned with YAML
5. No `env-mappings.yaml` - env var sources scattered across code
6. No clear separation between service definition and deployment config

---

## Target State

### New File Structure

```
config/
├── settings.yaml               # Renamed from config.defaults.yaml
├── secrets.yaml                # Unchanged
├── env-mappings.yaml           # NEW - global env var mappings
├── services.yaml               # NEW - index + defaults
├── services/                   # NEW - one file per service
│   ├── infrastructure/         # System-managed services
│   │   ├── postgres.yaml
│   │   ├── redis.yaml
│   │   ├── qdrant.yaml
│   │   └── mongodb.yaml
│   ├── openmemory.yaml
│   ├── chronicle.yaml
│   ├── openai.yaml
│   ├── ollama.yaml
│   └── deepgram.yaml
├── deployments/                # NEW - deployment configs
│   ├── local.yaml
│   └── production.yaml
├── user-services/              # NEW - user-added (gitignored)
└── generated/                  # NEW - generated artifacts (gitignored)
    ├── docker-compose.yml
    └── *.env
```

---

## Transition Phases

### Phase 1: Foundation (Config Files)

**Goal**: Create new config file structure without breaking existing code.

#### Tasks

1. **Create `config/env-mappings.yaml`**
   ```yaml
   mappings:
     OPENAI_API_KEY: settings.api_keys.openai
     POSTGRES_HOST: settings.infrastructure.postgres.host
     POSTGRES_PASSWORD: secrets.postgres_password
     # ... etc
   ```

2. **Create `config/services.yaml`** (index file)
   ```yaml
   defaults:
     memory: openmemory
     llm: openai
     transcription: deepgram

   service_types:
     memory:
       description: "Memory and knowledge storage"
     llm:
       description: "Language model inference"
     # ... etc
   ```

3. **Create `config/services/` directory structure**
   ```bash
   mkdir -p config/services/infrastructure
   mkdir -p config/deployments
   mkdir -p config/user-services
   mkdir -p config/generated
   echo "*" > config/generated/.gitignore
   echo "*" > config/user-services/.gitignore
   ```

4. **Create infrastructure service definitions**
   - `config/services/infrastructure/postgres.yaml`
   - `config/services/infrastructure/redis.yaml`
   - `config/services/infrastructure/qdrant.yaml`
   - `config/services/infrastructure/mongodb.yaml`

5. **Convert existing services to new format**
   - Extract from `default-services.yaml` → individual files
   - `config/services/openmemory.yaml`
   - `config/services/chronicle.yaml`
   - `config/services/openai.yaml`
   - `config/services/deepgram.yaml`
   - etc.

6. **Create deployment configs**
   - `config/deployments/local.yaml`

7. **Rename `config.defaults.yaml` → `settings.yaml`**
   - Update any code references

#### Deliverables
- [ ] `config/env-mappings.yaml`
- [ ] `config/services.yaml`
- [ ] `config/services/infrastructure/*.yaml` (4 files)
- [ ] `config/services/*.yaml` (existing services converted)
- [ ] `config/deployments/local.yaml`
- [ ] `config/settings.yaml` (renamed)

#### Validation
- All new YAML files pass schema validation
- Existing functionality still works (old code still reads old files)

---

### Phase 2: Models (Backend)

**Goal**: Simplify and align Pydantic models with new schema.

#### Tasks

1. **Create new models in `src/models/service_v2.py`** (parallel to existing)
   ```python
   class ServiceDefinition(BaseModel):
       """Service definition from config/services/*.yaml"""
       id: str
       type: str
       name: str
       description: Optional[str]
       containers: List[ContainerDefinition]
       depends_on: Optional[DependsOn]
       ui: Optional[UIMetadata]

   class ContainerDefinition(BaseModel):
       name: str
       image: str
       ports: List[int]
       env: EnvConfig
       health: Optional[HealthCheck]
       volumes: Optional[List[VolumeMount]]

   class EnvConfig(BaseModel):
       required: List[str] = []
       optional: List[str] = []
       overrides: Dict[str, str] = {}
       values: Dict[str, str] = {}

   class DeploymentConfig(BaseModel):
       """Deployment config from config/deployments/*.yaml"""
       target: str  # docker | kubernetes | remote
       services: Dict[str, ServiceDeployment]
   ```

2. **Create `EnvResolver` class**
   ```python
   class EnvResolver:
       """Resolves env vars from mappings + settings + secrets"""
       def __init__(self, mappings, settings, secrets):
           ...

       def resolve_for_service(self, service: ServiceDefinition) -> Dict[str, str]:
           ...

       def validate_required(self, service: ServiceDefinition) -> List[str]:
           """Returns list of missing required env vars"""
           ...
   ```

3. **Update `ServiceRegistry` to load new format**
   - Load from `config/services/*.yaml`
   - Auto-discover files
   - Keep backward compatibility temporarily

#### Deliverables
- [ ] `src/models/service_v2.py`
- [ ] `src/services/env_resolver.py`
- [ ] Updated `src/services/service_registry.py`

#### Validation
- Models can parse all new YAML files
- Unit tests pass

---

### Phase 3: Service Registry (Core Logic)

**Goal**: New ServiceRegistry that reads new file structure.

#### Tasks

1. **Implement new `ServiceRegistry`**
   ```python
   class ServiceRegistry:
       def __init__(self, config_dir: Path):
           self.config_dir = config_dir
           self._services: Dict[str, ServiceDefinition] = {}
           self._infrastructure: Dict[str, ServiceDefinition] = {}

       def load(self):
           """Load all service definitions from config/services/"""
           ...

       def get_service(self, service_id: str) -> ServiceDefinition:
           ...

       def get_services_by_type(self, service_type: str) -> List[ServiceDefinition]:
           ...

       def get_infrastructure(self) -> List[ServiceDefinition]:
           ...

       def get_user_installable(self) -> List[ServiceDefinition]:
           """Services users can enable/disable"""
           ...

       def validate_service(self, service_id: str) -> ValidationResult:
           """Check if service can be activated (required env vars configured)"""
           ...
   ```

2. **Implement `EnvMappingLoader`**
   ```python
   class EnvMappingLoader:
       def __init__(self, config_dir: Path):
           self.mappings = self._load_mappings()

       def get_mapping(self, env_var: str) -> Optional[str]:
           """Get settings path for an env var"""
           ...
   ```

3. **Implement `DeploymentConfigLoader`**
   ```python
   class DeploymentConfigLoader:
       def __init__(self, config_dir: Path):
           ...

       def get_deployment(self, target: str) -> DeploymentConfig:
           ...

       def is_service_enabled(self, service_id: str, target: str) -> bool:
           ...
   ```

#### Deliverables
- [ ] `src/services/service_registry.py` (rewritten)
- [ ] `src/services/env_mapping_loader.py`
- [ ] `src/services/deployment_config.py`

#### Validation
- Can load all services from new file structure
- Can resolve env vars for any service
- Unit tests for registry operations

---

### Phase 4: Docker Generator

**Goal**: Generate docker-compose.yml from service definitions.

#### Tasks

1. **Create `DockerComposeGenerator`**
   ```python
   class DockerComposeGenerator:
       def __init__(self, registry: ServiceRegistry, env_resolver: EnvResolver):
           ...

       def generate(self, enabled_services: List[str]) -> str:
           """Generate docker-compose.yml content"""
           ...

       def generate_env_file(self, service_id: str) -> str:
           """Generate .env file for a service"""
           ...

       def write_all(self, output_dir: Path):
           """Write docker-compose.yml and all .env files"""
           ...
   ```

2. **Update `DockerManager` to use generator**
   - Remove hardcoded `MANAGEABLE_SERVICES`
   - Use `ServiceRegistry` for service info
   - Call generator before `docker compose up`

3. **Handle infrastructure services**
   - Always include postgres, redis, etc. in generated compose
   - Only include user services that are enabled

#### Deliverables
- [ ] `src/services/docker_compose_generator.py`
- [ ] Updated `src/services/docker_manager.py`

#### Validation
- Generated docker-compose.yml is valid
- Services start correctly
- Env vars are correctly resolved

---

### Phase 5: API Updates

**Goal**: Update REST API to use new architecture.

#### Tasks

1. **Update `/api/services` router**
   ```python
   @router.get("/catalog")
   async def get_catalog():
       """List all available services from registry"""

   @router.get("/{service_id}/status")
   async def get_service_status(service_id: str):
       """Check if service can be activated (required config present)"""

   @router.post("/{service_id}/activate")
   async def activate_service(service_id: str, target: str = "docker"):
       """Enable and start a service"""

   @router.post("/{service_id}/deactivate")
   async def deactivate_service(service_id: str):
       """Stop and disable a service"""

   @router.get("/installed")
   async def get_installed_services():
       """List user's installed/enabled services"""
   ```

2. **Update `/api/docker` router**
   - Integrate with new `DockerManager`
   - Use service definitions for info

3. **Add validation endpoint**
   ```python
   @router.get("/{service_id}/validate")
   async def validate_service(service_id: str):
       """Return missing required config for a service"""
   ```

#### Deliverables
- [ ] Updated `src/routers/services.py`
- [ ] Updated `src/routers/docker.py`

#### Validation
- API returns correct service catalog
- Activation validates required env vars
- Frontend can use new endpoints

---

### Phase 6: Frontend Updates

**Goal**: Update frontend to use new API.

#### Tasks

1. **Update Services page**
   - Fetch from `/api/services/catalog`
   - Show activation status per service
   - Show missing required fields

2. **Update Quickstart wizard**
   - Use service definitions for form fields
   - Validate required fields before proceeding

3. **Add service detail view**
   - Show service status, logs, config
   - Allow enable/disable

#### Deliverables
- [ ] Updated `ServicesPage.tsx`
- [ ] Updated wizard components
- [ ] New service detail component

---

### Phase 7: Cleanup

**Goal**: Remove deprecated code and files.

#### Tasks

1. **Remove old config files**
   ```bash
   rm config/service-templates.yaml
   rm config/default-services.yaml
   ```

2. **Remove old models**
   - Remove `ServiceTemplate`, `ServiceTemplateModeConfig` from `service.py`
   - Keep only what's needed

3. **Remove old code paths**
   - Any code that reads old file formats
   - Backward compatibility shims

4. **Update documentation**
   - README
   - API docs

#### Deliverables
- [ ] Old files removed
- [ ] Models cleaned up
- [ ] No deprecated code paths
- [ ] Documentation updated

---

## Implementation Order

```
Phase 1: Foundation ──────────────────────────────────────┐
   (Config files - can do now, no code changes)           │
                                                          │
Phase 2: Models ──────────────────────────────────────────┤
   (New Pydantic models - parallel to existing)           │
                                                          │
Phase 3: Service Registry ────────────────────────────────┤
   (Core logic - can coexist with old registry)           │
                                                          ├──▶ Can deploy incrementally
Phase 4: Docker Generator ────────────────────────────────┤     and test each phase
   (Generate compose - replaces hardcoded approach)       │
                                                          │
Phase 5: API Updates ─────────────────────────────────────┤
   (REST endpoints - new endpoints alongside old)         │
                                                          │
Phase 6: Frontend Updates ────────────────────────────────┤
   (UI changes - after API is ready)                      │
                                                          │
Phase 7: Cleanup ─────────────────────────────────────────┘
   (Remove old code - only after everything works)
```

---

## Estimated Effort

| Phase | Effort | Dependencies |
|-------|--------|--------------|
| Phase 1: Foundation | 2-3 hours | None |
| Phase 2: Models | 2-3 hours | Phase 1 |
| Phase 3: Service Registry | 4-6 hours | Phase 2 |
| Phase 4: Docker Generator | 4-6 hours | Phase 3 |
| Phase 5: API Updates | 3-4 hours | Phase 4 |
| Phase 6: Frontend Updates | 4-6 hours | Phase 5 |
| Phase 7: Cleanup | 1-2 hours | Phase 6 |

**Total: ~20-30 hours**

---

## Risk Mitigation

### Backward Compatibility

During transition, keep both old and new code paths:

```python
class ServiceRegistry:
    def get_service(self, service_id: str):
        # Try new format first
        if service := self._load_from_new_format(service_id):
            return service
        # Fall back to old format
        return self._load_from_old_format(service_id)
```

### Rollback Plan

Each phase can be rolled back independently:
- Phase 1: Delete new config files
- Phase 2-4: Revert code changes, old code still works
- Phase 5: Old API endpoints still exist
- Phase 6: Frontend can use old endpoints

### Testing Strategy

1. **Unit tests** for each new component
2. **Integration tests** for end-to-end flows
3. **Manual testing** before removing old code
4. **Feature flag** to switch between old/new (optional)

---

## Success Criteria

- [ ] All services defined in individual YAML files
- [ ] Env vars resolved from central `env-mappings.yaml`
- [ ] Docker Compose generated from service definitions
- [ ] Services can be activated/deactivated via API
- [ ] Frontend shows service catalog with status
- [ ] No hardcoded service lists in code
- [ ] Old config files removed
- [ ] Documentation updated

---

## Next Steps

1. Review this plan
2. Start with Phase 1 (config files) - can be done immediately
3. Proceed phase by phase, testing each before moving on
