# Refactoring Plan: Instance → ServiceConfiguration

## Goal
Rename "Instance" to "ServiceConfiguration" to better reflect that this represents a configured service (either cloud credentials or deployable service with config).

## New Naming Convention

| Current | New | Purpose |
|---------|-----|---------|
| `Template` | `Template` | Abstract service or provider definition (keep) |
| `Instance` | `ServiceConfiguration` | Template + Config + DeploymentTarget |
| `InstanceManager` | `ConfigurationManager` | Manages service configurations |
| `InstanceStatus` | `ConfigurationStatus` | Status enum |
| `InstanceConfig` | `ServiceConfig` | Configuration values |
| `InstanceOutputs` | `ConfigurationOutputs` | Runtime outputs |
| `InstanceCreate` | `ConfigurationCreate` | API request model |
| `InstanceUpdate` | `ConfigurationUpdate` | API request model |
| `InstanceSummary` | `ConfigurationSummary` | API response model |
| `instances.yaml` | `configurations.yaml` | YAML storage file |

## Status Values Semantic

### Cloud Providers
- `configured` - Has valid credentials, ready to use
- `unconfigured` - Missing required credentials

### Deployable Services (ComposeService, local providers)
- `pending` - Created but not yet started
- `deploying` - Currently starting
- `running` - Running and accessible
- `stopped` - Stopped gracefully
- `error` - Failed to deploy or crashed

## Files to Update

### Backend Models (Priority 1)

1. **`ushadow/backend/src/models/instance.py`** → Rename to `configuration.py`
   - `Instance` → `ServiceConfiguration`
   - `InstanceStatus` → `ConfigurationStatus`
   - `InstanceConfig` → `ServiceConfig`
   - `InstanceOutputs` → `ConfigurationOutputs`
   - `InstanceCreate` → `ConfigurationCreate`
   - `InstanceUpdate` → `ConfigurationUpdate`
   - `InstanceSummary` → `ConfigurationSummary`
   - `Wiring` stays the same
   - Update all docstrings

2. **`ushadow/backend/src/services/instance_manager.py`** → Rename to `configuration_manager.py`
   - `InstanceManager` → `ConfigurationManager`
   - `_instances` → `_configurations`
   - `instances.yaml` → `configurations.yaml`
   - All method names: `create_instance` → `create_configuration`, etc.
   - Update all docstrings

### Backend Services (Priority 1)

3. **`ushadow/backend/src/services/capability_resolver.py`**
   - Update all references to `Instance` → `ServiceConfiguration`
   - `consumer_instance_id` → `consumer_config_id`
   - `provider_instance` → `provider_config`

4. **`ushadow/backend/src/services/deployment_manager.py`**
   - `instance_id` parameter → `config_id`
   - Update docstrings

5. **`ushadow/backend/src/services/service_orchestrator.py`**
   - `instance_id` parameter → `config_id`

### API Routes (Priority 1)

6. **`ushadow/backend/src/routers/instances.py`** → Rename to `configurations.py`
   - Update all endpoint paths:
     - `/api/instances` → `/api/configurations`
     - `/api/instances/{id}` → `/api/configurations/{id}`
   - Add backwards-compatibility aliases (optional)
   - Update all request/response models
   - Update docstrings

7. **`ushadow/backend/src/main.py`**
   - Update router import and include

### Frontend Types (Priority 2)

8. **`ushadow/frontend/src/services/api.ts`**
   - `Instance` → `ServiceConfiguration`
   - `InstanceSummary` → `ConfigurationSummary`
   - `InstanceCreateRequest` → `ConfigurationCreateRequest`
   - `instancesApi` → `configurationsApi` (or keep as `configurationsApi` but map endpoints)
   - Update endpoint URLs

### Frontend Pages (Priority 2)

9. **`ushadow/frontend/src/pages/InstancesPage.tsx`** → Rename to `ConfigurationsPage.tsx`
   - Update component name
   - Update all variable names
   - Update all API calls
   - Update test IDs

10. **`ushadow/frontend/src/App.tsx`**
    - Update route import and component

11. **`ushadow/frontend/src/components/wiring/WiringBoard.tsx`**
    - Update all references to instances

### Configuration Files (Priority 3)

12. **`config/instances.yaml`** → Rename to `configurations.yaml`
    - Update key: `instances:` → `configurations:`
    - Migrate existing data

13. **`config/wiring.yaml`**
    - Update references if needed

### Documentation (Priority 3)

14. **Update all markdown files**
    - `ARCHITECTURE_OVERVIEW.md`
    - `README.md`
    - Any other docs

## Migration Strategy

### Phase 1: Backend Models (Break nothing)
1. Create new `configuration.py` alongside `instance.py`
2. Copy all classes with new names
3. Add type aliases in `instance.py` for backwards compatibility:
   ```python
   # Backwards compatibility
   Instance = ServiceConfiguration
   InstanceManager = ConfigurationManager
   ```

### Phase 2: Backend Services & Routes (Gradual migration)
1. Update internal services to use new names
2. Keep old API endpoints working with aliases
3. Add deprecation warnings to old endpoints

### Phase 3: Frontend (Coordinated update)
1. Update API client first
2. Update pages and components
3. Test thoroughly

### Phase 4: Cleanup (After testing)
1. Remove backwards compatibility aliases
2. Remove old files
3. Rename YAML files (with data migration)

## Backwards Compatibility Considerations

### Option 1: Hard Break (Fast, risky)
- Rename everything at once
- Update all references in one PR
- Requires coordination with frontend

### Option 2: Soft Transition (Safer, slower)
- Keep old API endpoints working
- Add deprecation warnings
- Gradually migrate frontend
- Remove old code after 1-2 releases

**Recommendation**: Option 2 for production, Option 1 for development branches

## Testing Checklist

- [ ] All backend tests pass
- [ ] All frontend tests pass
- [ ] API endpoints work with new names
- [ ] YAML config loads correctly
- [ ] Create new configuration works
- [ ] Deploy configuration works
- [ ] Stop configuration works
- [ ] Delete configuration works
- [ ] Wiring still works
- [ ] Frontend UI displays correctly
- [ ] No broken imports
- [ ] Documentation updated

## Rollback Plan

If issues arise:
1. Keep old model files as `instance.py`
2. Git revert specific commits
3. Use type aliases to minimize changes

## Estimated Effort

- Backend models: 1-2 hours
- Backend services: 2-3 hours
- API routes: 1-2 hours
- Frontend types: 1 hour
- Frontend pages: 2-3 hours
- Testing: 2-3 hours
- Documentation: 1 hour

**Total: ~12-15 hours**

## Next Steps

1. Get approval on naming convention
2. Choose migration strategy (hard break vs soft transition)
3. Start with backend models (Phase 1)
4. Test each phase before proceeding
5. Update documentation as you go

---

## Questions to Resolve

1. **API endpoint naming**: Keep `/api/instances` with alias or change to `/api/configurations`?
2. **YAML filename**: Migrate `instances.yaml` → `configurations.yaml` now or later?
3. **Variable names**: `config_id` or `configuration_id`?
4. **Backwards compatibility**: How long to keep old names?

## Decision Log

- [x] Use `ServiceConfiguration` instead of `Instance`
- [x] Keep unified model (not splitting cloud/local)
- [ ] API endpoint strategy: TBD
- [ ] Migration timeline: TBD
