# Settings Configuration Hierarchy - Test Specification

## Feature Overview

The UShadow settings system supports a hierarchical configuration merge system where multiple sources provide configuration values, with a clear precedence order determining which value wins when the same setting is defined in multiple places.

**Purpose**: Ensure users have flexible configuration options while maintaining predictability - user explicit choices always win.

## Configuration Hierarchy (Precedence Order)

Configuration sources merge in this order (lowest to highest priority):

1. **config.defaults.yaml** - Base defaults shipped with the application
2. **Docker Compose file** - Container environment variables
3. **.env file** - Local development environment overrides
4. **Suggested mappings** - Provider-intelligent defaults (e.g., OpenAI provider suggests gpt-4o)
5. **config.overrides.yaml** - User explicit overrides (HIGHEST PRIORITY)

### Visual Representation

```
┌─────────────────────────────────────┐
│  config.overrides.yaml              │  ← User wins (highest)
├─────────────────────────────────────┤
│  Provider suggested mappings        │  ← Intelligent defaults
├─────────────────────────────────────┤
│  .env file                          │  ← Local dev overrides
├─────────────────────────────────────┤
│  Docker Compose environment         │  ← Container config
├─────────────────────────────────────┤
│  config.defaults.yaml               │  ← Base defaults (lowest)
└─────────────────────────────────────┘
```

## Current Implementation Status

**Currently Implemented (3 layers)**:
- ✅ config.defaults.yaml
- ✅ secrets.yaml (parallel to overrides, for sensitive data)
- ✅ config.overrides.yaml

**Not Yet Implemented**:
- ❌ Docker Compose environment variables
- ❌ .env file integration
- ❌ Provider suggested mappings

## Test Scenarios

### Scenario 1: Base Defaults Provide Foundation
**Goal**: Verify defaults provide baseline configuration

**GIVEN**:
- config.defaults.yaml has llm_model = "gpt-4o-mini"
- No other config files exist

**WHEN**:
- User requests service configuration via API

**THEN**:
- API returns llm_model = "gpt-4o-mini"

**Test Type**: Integration
**Priority**: P1 (Critical)

---

### Scenario 2: Compose Environment Overrides Defaults
**Goal**: Verify Docker Compose env vars override defaults

**GIVEN**:
- config.defaults.yaml has DATABASE = "ushadow"
- docker-compose.yml sets MONGODB_DATABASE = "chronicle_prod"

**WHEN**:
- Service is deployed via Docker Compose

**THEN**:
- Service receives DATABASE = "chronicle_prod" (compose wins)

**Test Type**: Integration
**Priority**: P1 (Critical)
**Status**: ⏳ Pending implementation

---

### Scenario 3: .env File Overrides Compose
**Goal**: Verify .env overrides Docker Compose for local dev

**GIVEN**:
- docker-compose.yml sets PORT = 8000
- .env file sets PORT = 8001

**WHEN**:
- Service starts in local dev environment

**THEN**:
- Service binds to PORT = 8001 (.env wins)

**Test Type**: Integration
**Priority**: P2 (High)
**Status**: ⏳ Pending implementation

---

### Scenario 4: Suggested Mappings Override .env
**Goal**: Verify provider intelligence overrides basic env vars

**GIVEN**:
- .env has LLM_MODEL = "gpt-4"
- Provider registry suggests LLM_MODEL = "gpt-4o" (better for OpenAI)
- User has NOT explicitly set llm_model in overrides

**WHEN**:
- Service configuration is merged

**THEN**:
- Service receives LLM_MODEL = "gpt-4o" (suggestion wins)

**Test Type**: Integration
**Priority**: P2 (High)
**Status**: ⏳ Pending implementation

**Rationale**: Provider knows best model for their service, but user can still override

---

### Scenario 5: User Overrides Beat Everything
**Goal**: Verify user explicit choice is always respected

**GIVEN**:
- config.defaults.yaml has llm_model = "gpt-4o-mini"
- .env has LLM_MODEL = "gpt-4"
- Provider suggests llm_model = "gpt-4o"
- config.overrides.yaml has llm_model = "claude-3-opus-20240229"

**WHEN**:
- User requests configuration
- Service is deployed

**THEN**:
- API returns llm_model = "claude-3-opus-20240229"
- Service receives llm_model = "claude-3-opus-20240229"
- User's explicit choice wins over ALL other sources

**Test Type**: Integration + E2E
**Priority**: P0 (Critical - Must Never Fail)

---

### Scenario 6: Partial Override Preservation
**Goal**: Verify changing one setting doesn't erase others

**GIVEN**:
- config.defaults.yaml has: {model: "gpt-4o-mini", temp: 0.7, tokens: 2000, db: "ushadow", port: 8000}
- config.overrides.yaml has: {temp: 0.5}

**WHEN**:
- Configuration is merged

**THEN**:
- Final config has:
  - model: "gpt-4o-mini" (from defaults)
  - temp: 0.5 (from override)
  - tokens: 2000 (from defaults)
  - db: "ushadow" (from defaults)
  - port: 8000 (from defaults)

**Test Type**: Integration
**Priority**: P1 (Critical)

---

### Scenario 7: Secrets Routing
**Goal**: Verify secrets go to secrets.yaml, non-secrets to overrides

**GIVEN**:
- User updates api_key = "sk-proj-abc123" via API
- User updates temperature = 0.5 via API

**WHEN**:
- Settings are persisted to disk

**THEN**:
- secrets.yaml contains: {api_key: "sk-proj-abc123"}
- config.overrides.yaml contains: {temperature: 0.5}
- api_key NOT in config.overrides.yaml
- temperature NOT in secrets.yaml

**Test Type**: Integration
**Priority**: P1 (Critical - security)

---

### Scenario 8: UI-to-Deployment Value Consistency
**Goal**: Verify UI values exactly match deployment values

**GIVEN**:
- User sets llm_model = "gpt-4o" via UI/API

**WHEN**:
- User reads config back via UI/API
- Service is deployed with this config

**THEN**:
- UI shows: "gpt-4o"
- API returns: "gpt-4o"
- Service receives: "gpt-4o"
- NO transformations (not "claude-3", not "gpt-4-turbo", exactly "gpt-4o")

**Test Type**: E2E
**Priority**: P0 (Critical - user trust)

---

### Scenario 9: Numeric Precision Maintained
**Goal**: Verify high-precision numbers aren't rounded

**GIVEN**:
- User sets temperature = 0.123456789

**WHEN**:
- Value is stored and retrieved multiple times

**THEN**:
- All reads return 0.123456789 (precision maintained)
- NOT rounded to 0.12 or 0.123

**Test Type**: Integration
**Priority**: P2 (High)

---

### Scenario 10: Environment Variable Interpolation
**Goal**: Verify ${VAR} syntax works in config files

**GIVEN**:
- Environment has DATABASE_URL = "mongodb://prod:27017/db"
- config.overrides.yaml has: database_url: "${oc.env:DATABASE_URL}"

**WHEN**:
- Configuration is loaded

**THEN**:
- Service receives database_url = "mongodb://prod:27017/db"
- Variable is properly expanded

**Test Type**: Integration
**Priority**: P2 (High)

---

## Test Implementation Plan

### Phase 1: Verify Current 3-Layer System ✅
**Status**: COMPLETE

Tests created:
- ✅ pytest: `test_settings_api_and_deployment.py`
- ✅ Robot: `api_settings_deployment.robot`
- ✅ All 9 Robot tests passing

Verified:
- defaults → secrets → overrides precedence
- UI-to-deployment consistency
- Partial override preservation
- API endpoints functionality

### Phase 2: Add Compose Environment Support
**Status**: TODO

Implementation needed:
1. Add compose file parsing in SettingsStore
2. Extract environment variables from services
3. Insert compose layer between defaults and secrets
4. Write tests for compose override scenarios

Test files:
- pytest: `test_compose_environment_override.py`
- Robot: `api_compose_config.robot`

### Phase 3: Add .env File Support
**Status**: TODO

Implementation needed:
1. Parse .env file in config directory
2. Load environment variables
3. Insert .env layer after compose
4. Write tests for .env override scenarios

Test files:
- pytest: `test_env_file_override.py`
- Robot: `api_env_config.robot`

### Phase 4: Add Provider Suggested Mappings
**Status**: TODO

Implementation needed:
1. Provider registry suggests optimal config
2. Query provider for suggestions based on selected provider
3. Insert suggested mappings layer after .env
4. Write tests for suggestion scenarios

Test files:
- pytest: `test_provider_suggestions.py`
- Robot: `api_provider_suggestions.robot`

### Phase 5: End-to-End Integration Tests
**Status**: TODO

Full chain tests:
- All 5 layers setting different values
- User override wins
- Partial updates across all layers
- Complete UI → API → Deploy → Verify flow

## Test Coverage Goals

| Layer | Unit Tests | Integration Tests | E2E Tests |
|-------|-----------|-------------------|-----------|
| defaults | ✅ 100% | ✅ 100% | ✅ 100% |
| secrets | ✅ 100% | ✅ 100% | ✅ 100% |
| overrides | ✅ 100% | ✅ 100% | ✅ 100% |
| compose | ❌ 0% | ❌ 0% | ❌ 0% |
| .env | ❌ 0% | ❌ 0% | ❌ 0% |
| suggested | ❌ 0% | ❌ 0% | ❌ 0% |

**Overall Coverage Target**: 80% minimum for each layer

## Acceptance Criteria

For the complete feature to be considered done:

1. ✅ All 5 configuration layers implemented
2. ✅ Precedence order strictly enforced (no exceptions)
3. ✅ User overrides ALWAYS win (never silently ignored)
4. ✅ UI values exactly match deployment values (zero tolerance for transformation)
5. ✅ Partial updates work correctly (no data loss)
6. ✅ Secrets properly isolated in secrets.yaml
7. ✅ All tests passing (pytest + Robot Framework)
8. ✅ Documentation updated with examples
9. ✅ Performance acceptable (merge < 100ms)

## Edge Cases to Test

1. **Missing config files** - graceful degradation
2. **Malformed YAML** - error handling without crash
3. **Circular variable references** - detection and error
4. **Very large config files** - performance testing
5. **Concurrent updates** - race condition testing
6. **Cache invalidation** - ensure fresh reads after updates
7. **Type mismatches** - string vs number handling
8. **Unicode in values** - internationalization support
9. **Empty values vs null vs missing** - semantic differences
10. **Array merging** - append vs replace behavior

## Non-Functional Requirements

### Performance
- Config merge: < 100ms for typical config
- API response time: < 200ms
- File I/O: < 50ms per file

### Security
- Secrets never logged
- Secrets never in git (secrets.yaml gitignored)
- Masked in API responses (• or ***)
- Proper file permissions (600 for secrets)

### Usability
- Clear error messages
- Validation before save
- Preview before deploy
- Rollback capability

## Related Documentation

- `/docs/SERVICE-INTEGRATION-CHECKLIST.md` - Service configuration guidelines
- `ushadow/backend/src/config/omegaconf_settings.py` - SettingsStore implementation
- `ushadow/backend/src/routers/settings.py` - API endpoints
- `robot_tests/tests/api_settings_deployment.robot` - E2E tests
- `ushadow/backend/tests/integration/test_settings_api_and_deployment.py` - Integration tests

## Questions for Product/Engineering

1. **Compose precedence**: Should compose ALWAYS override defaults, or only for explicitly set env vars?
2. **Suggested mappings**: Should suggestions apply globally or per-service?
3. **.env location**: Root .env, config/.env, or both?
4. **Backward compatibility**: How to handle existing deployments when adding new layers?
5. **UI indication**: Should UI show which layer a value comes from?
6. **Reset behavior**: Should "reset to defaults" clear ALL overrides or just config.overrides.yaml?

## Success Metrics

- **Zero config-related deployment failures** in production
- **< 5 minutes** average time for user to understand hierarchy
- **95% user confidence** in "what I set is what runs"
- **Zero silent value transformations** reported
- **100% test coverage** on critical paths (user override, UI-deployment consistency)
