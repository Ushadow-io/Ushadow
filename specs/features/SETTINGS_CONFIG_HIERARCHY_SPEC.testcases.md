# Test Cases: Settings Configuration Hierarchy

**Source Specification**: `specs/features/SETTINGS_CONFIG_HIERARCHY_SPEC.md`
**Generated**: 2026-01-18
**Status**: ⏳ Pending Review

---

## Test Summary

| Metric | Count |
|--------|-------|
| Total Test Cases | 35 |
| Critical Priority | 12 |
| High Priority | 15 |
| Medium Priority | 8 |
| Unit Tests | 6 |
| Integration Tests | 20 |
| API Tests | 5 |
| E2E Tests | 4 |

### Coverage by Category
| Category | Count |
|----------|-------|
| ✅ Happy Path | 10 |
| ⚠️ Edge Cases | 13 |
| ❌ Negative Tests | 7 |
| 🔄 Integration | 5 |

### Secret Requirements
| Requirement | Count |
|-------------|-------|
| No Secrets Required | 32 |
| Requires Secrets | 3 |

---

## TC-SETTINGS-001: Base Defaults Provide Foundation

**Type**: Integration
**Priority**: Critical
**Requires Secrets**: No

### Description
Verify that config.defaults.yaml provides baseline configuration values when no other configuration sources exist.

### Preconditions
- config.defaults.yaml exists with llm_model = "gpt-4o-mini"
- No config.overrides.yaml exists
- No secrets.yaml exists
- Service is running

### Test Steps
1. Remove config.overrides.yaml if exists
2. Remove secrets.yaml if exists
3. GET /api/settings/service-configs/chronicle
4. Parse response JSON

### Expected Results
- Response status: 200
- Response contains llm_model field
- llm_model value: "gpt-4o-mini"
- Value comes from config.defaults.yaml

### Test Data
```json
{
  "service_id": "chronicle",
  "expected_model": "gpt-4o-mini"
}
```

### Notes
- Tests layer 1 (lowest priority) in isolation
- Related: TC-SETTINGS-005 (complete hierarchy)

---

## TC-SETTINGS-002: Compose Environment Overrides Defaults

**Type**: Integration
**Priority**: Critical
**Requires Secrets**: No
**Status**: ⏳ Implementation Pending

### Description
Verify Docker Compose environment variables override config.defaults.yaml values.

### Preconditions
- config.defaults.yaml has DATABASE = "ushadow"
- docker-compose.yml sets MONGODB_DATABASE = "chronicle_prod"
- Compose layer implemented in SettingsStore
- Service deployed via Docker Compose

### Test Steps
1. Set DATABASE = "ushadow" in config.defaults.yaml
2. Set MONGODB_DATABASE = "chronicle_prod" in docker-compose.yml
3. Deploy service via Docker Compose
4. GET /api/settings/service-configs/chronicle
5. Verify database field

### Expected Results
- Response status: 200
- database field: "chronicle_prod"
- Compose value wins over defaults

### Test Data
```json
{
  "defaults": {"database": "ushadow"},
  "compose_env": {"MONGODB_DATABASE": "chronicle_prod"},
  "expected": "chronicle_prod"
}
```

### Notes
- Tests layer 2 precedence over layer 1
- Requires compose layer implementation
- Related: TC-SETTINGS-003

---

## TC-SETTINGS-003: .env File Overrides Compose Environment

**Type**: Integration
**Priority**: High
**Requires Secrets**: No
**Status**: ⏳ Implementation Pending

### Description
Verify .env file values override Docker Compose environment variables for local development.

### Preconditions
- docker-compose.yml sets PORT = 8000
- .env file sets PORT = 8001
- .env layer implemented in SettingsStore
- Service running in local dev mode

### Test Steps
1. Set PORT = 8000 in docker-compose.yml
2. Set PORT = 8001 in .env file
3. Start service
4. GET /api/settings/service-configs/chronicle
5. Verify port field

### Expected Results
- Response status: 200
- port field: 8001
- .env value wins over compose

### Test Data
```json
{
  "compose": {"PORT": "8000"},
  "env_file": {"PORT": "8001"},
  "expected": 8001
}
```

### Notes
- Tests layer 3 precedence over layer 2
- Requires .env layer implementation
- Related: TC-SETTINGS-004

---

## TC-SETTINGS-004: Provider Suggested Mappings Override .env

**Type**: Integration
**Priority**: High
**Requires Secrets**: No
**Status**: ⏳ Implementation Pending

### Description
Verify provider-intelligent suggestions override .env values when user hasn't explicitly overridden.

### Preconditions
- .env has LLM_MODEL = "gpt-4"
- Provider registry suggests LLM_MODEL = "gpt-4o" for OpenAI
- config.overrides.yaml does NOT contain llm_model
- Provider suggestions layer implemented

### Test Steps
1. Set LLM_MODEL = "gpt-4" in .env
2. Configure provider to suggest llm_model = "gpt-4o"
3. Ensure config.overrides.yaml has no llm_model
4. GET /api/settings/service-configs/chronicle
5. Verify llm_model field

### Expected Results
- Response status: 200
- llm_model: "gpt-4o"
- Provider suggestion wins over .env

### Test Data
```json
{
  "env": {"LLM_MODEL": "gpt-4"},
  "provider_suggestion": {"llm_model": "gpt-4o"},
  "expected": "gpt-4o",
  "rationale": "Provider knows best model for their service"
}
```

### Notes
- Tests layer 4 precedence over layer 3
- Requires provider registry implementation
- Related: TC-SETTINGS-005, TC-SETTINGS-006

---

## TC-SETTINGS-005: User Overrides Beat All Other Layers

**Type**: Integration + E2E
**Priority**: Critical
**Requires Secrets**: No

### Description
Verify user explicit overrides in config.overrides.yaml have highest priority and win over ALL other configuration sources.

### Preconditions
- config.defaults.yaml has llm_model = "gpt-4o-mini"
- .env has LLM_MODEL = "gpt-4"
- Provider suggests llm_model = "gpt-4o"
- config.overrides.yaml has llm_model = "claude-3-opus-20240229"
- All 5 layers active

### Test Steps
1. Set llm_model = "gpt-4o-mini" in defaults
2. Set LLM_MODEL = "gpt-4" in .env (when implemented)
3. Configure provider to suggest "gpt-4o" (when implemented)
4. PUT /api/settings/service-configs/chronicle with {"llm_model": "claude-3-opus-20240229"}
5. GET /api/settings/service-configs/chronicle
6. Verify llm_model field

### Expected Results
- PUT response status: 200
- GET response status: 200
- llm_model: "claude-3-opus-20240229"
- User override wins over all 4 lower layers
- Value persisted in config.overrides.yaml

### Test Data
```json
{
  "layer1_defaults": "gpt-4o-mini",
  "layer3_env": "gpt-4",
  "layer4_suggested": "gpt-4o",
  "layer5_user_override": "claude-3-opus-20240229",
  "expected": "claude-3-opus-20240229"
}
```

### Notes
- CRITICAL: User choice must ALWAYS win
- Tests complete 5-layer hierarchy
- Related: All other hierarchy tests

---

## TC-SETTINGS-006: Provider Suggestion Doesn't Override User Choice

**Type**: Integration
**Priority**: Critical
**Requires Secrets**: No
**Status**: ⏳ Implementation Pending

### Description
Verify provider suggestions are ignored when user has explicitly set a value in config.overrides.yaml.

### Preconditions
- Provider suggests llm_model = "gpt-4o"
- config.overrides.yaml has llm_model = "claude-3-opus-20240229"
- Provider suggestions layer implemented

### Test Steps
1. Configure provider to suggest llm_model = "gpt-4o"
2. PUT /api/settings/service-configs/chronicle with {"llm_model": "claude-3-opus-20240229"}
3. GET /api/settings/service-configs/chronicle
4. Verify llm_model field

### Expected Results
- Response status: 200
- llm_model: "claude-3-opus-20240229"
- User choice wins over provider suggestion

### Test Data
```json
{
  "provider_suggestion": "gpt-4o",
  "user_override": "claude-3-opus-20240229",
  "expected": "claude-3-opus-20240229",
  "rationale": "User knows their requirements better than automation"
}
```

### Notes
- Verifies user autonomy
- Provider suggestions are helpful hints, not enforced
- Related: TC-SETTINGS-004, TC-SETTINGS-005

---

## TC-SETTINGS-007: Partial Override Preserves Other Settings

**Type**: Integration
**Priority**: Critical
**Requires Secrets**: No

### Description
Verify updating a single setting doesn't erase or modify other unrelated settings from defaults or other layers.

### Preconditions
- config.defaults.yaml has: {model: "gpt-4o-mini", temp: 0.7, tokens: 2000, db: "ushadow", port: 8000}
- Service is running

### Test Steps
1. GET /api/settings/service-configs/chronicle to capture initial state
2. PUT /api/settings/service-configs/chronicle with {"temperature": 0.5}
3. GET /api/settings/service-configs/chronicle
4. Verify all fields present

### Expected Results
- PUT response status: 200
- GET response contains:
  - llm_model: "gpt-4o-mini" (from defaults, unchanged)
  - temperature: 0.5 (from override, changed)
  - max_tokens: 2000 (from defaults, unchanged)
  - database: "ushadow" (from defaults, unchanged)
  - port: 8000 (from defaults, unchanged)

### Test Data
```json
{
  "initial_defaults": {
    "llm_model": "gpt-4o-mini",
    "temperature": 0.7,
    "max_tokens": 2000,
    "database": "ushadow",
    "port": 8000
  },
  "update": {"temperature": 0.5},
  "expected_final": {
    "llm_model": "gpt-4o-mini",
    "temperature": 0.5,
    "max_tokens": 2000,
    "database": "ushadow",
    "port": 8000
  }
}
```

### Notes
- CRITICAL: Partial updates must not cause data loss
- Tests OmegaConf merge behavior
- Related: TC-SETTINGS-018 (concurrent updates)

---

## TC-SETTINGS-008: Secrets Routed to secrets.yaml

**Type**: Integration
**Priority**: Critical
**Requires Secrets**: No

### Description
Verify API keys and other secrets are written to secrets.yaml, not config.overrides.yaml.

### Preconditions
- Service is running
- secrets.yaml exists (or can be created)
- config.overrides.yaml exists

### Test Steps
1. PUT /api/settings/service-configs/chronicle with {"api_key": "sk-proj-test123"}
2. Verify file system writes
3. Read secrets.yaml
4. Read config.overrides.yaml

### Expected Results
- PUT response status: 200
- secrets.yaml contains: api_key = "sk-proj-test123"
- config.overrides.yaml does NOT contain api_key
- Secrets properly isolated

### Test Data
```json
{
  "secret_field": "api_key",
  "secret_value": "sk-proj-test123",
  "expected_file": "secrets.yaml",
  "must_not_be_in": "config.overrides.yaml"
}
```

### Notes
- CRITICAL: Security requirement
- Secrets must never appear in config.overrides.yaml
- secrets.yaml is gitignored
- Related: TC-SETTINGS-009, TC-SETTINGS-027

---

## TC-SETTINGS-009: Non-Secrets Routed to config.overrides.yaml

**Type**: Integration
**Priority**: Critical
**Requires Secrets**: No

### Description
Verify non-secret settings are written to config.overrides.yaml, not secrets.yaml.

### Preconditions
- Service is running
- config.overrides.yaml exists
- secrets.yaml exists

### Test Steps
1. PUT /api/settings/service-configs/chronicle with {"temperature": 0.5}
2. Verify file system writes
3. Read config.overrides.yaml
4. Read secrets.yaml

### Expected Results
- PUT response status: 200
- config.overrides.yaml contains: temperature = 0.5
- secrets.yaml does NOT contain temperature
- Proper file routing

### Test Data
```json
{
  "non_secret_field": "temperature",
  "value": 0.5,
  "expected_file": "config.overrides.yaml",
  "must_not_be_in": "secrets.yaml"
}
```

### Notes
- Verifies correct routing logic
- Non-secrets don't pollute secrets.yaml
- Related: TC-SETTINGS-008

---

## TC-SETTINGS-010: UI Values Match Deployment Values Exactly

**Type**: E2E
**Priority**: Critical
**Requires Secrets**: No

### Description
Verify values shown in UI via API exactly match values that will be deployed to services (zero tolerance for transformation).

### Preconditions
- Service is running
- UI can call API endpoints

### Test Steps
1. PUT /api/settings/service-configs/chronicle with {"llm_model": "gpt-4o"}
2. GET /api/settings/service-configs/chronicle (UI read)
3. Read config.overrides.yaml (deployment source)
4. Compare values

### Expected Results
- UI API returns: llm_model = "gpt-4o"
- config.overrides.yaml contains: llm_model = "gpt-4o"
- Exact string match (not "gpt-4", not "gpt-4-turbo", exactly "gpt-4o")
- NO transformations applied

### Test Data
```json
{
  "set_value": "gpt-4o",
  "ui_reads": "gpt-4o",
  "deployment_gets": "gpt-4o",
  "transformation": "NONE"
}
```

### Notes
- CRITICAL: User trust requirement
- "What you see is what runs"
- Zero tolerance for silent value changes
- Related: TC-SETTINGS-011, TC-SETTINGS-012

---

## TC-SETTINGS-011: String Values Not Transformed

**Type**: API
**Priority**: Critical
**Requires Secrets**: No

### Description
Verify string configuration values are stored and retrieved exactly as entered, with no transformations.

### Preconditions
- Service is running
- API accessible

### Test Steps
1. PUT /api/settings/service-configs/chronicle with {"llm_model": "gpt-4o-test-model-12345"}
2. Wait 100ms
3. GET /api/settings/service-configs/chronicle
4. Extract llm_model from response

### Expected Results
- PUT response status: 200
- GET response status: 200
- llm_model: "gpt-4o-test-model-12345"
- Exact string match (no truncation, no case changes, no substitution)

### Test Data
```json
{
  "test_string": "gpt-4o-test-model-12345",
  "expected": "gpt-4o-test-model-12345",
  "should_not_be": ["gpt-4o", "GPT-4O-TEST-MODEL-12345", "gpt-4o-test..."]
}
```

### Notes
- Tests API round-trip integrity
- Verifies no middleware transformations
- Related: TC-SETTINGS-010, TC-SETTINGS-012

---

## TC-SETTINGS-012: Numeric Precision Maintained

**Type**: Integration
**Priority**: High
**Requires Secrets**: No

### Description
Verify high-precision floating-point numbers maintain precision through store/retrieve cycles.

### Preconditions
- Service is running
- YAML serialization preserves floats

### Test Steps
1. PUT /api/settings/service-configs/chronicle with {"temperature": 0.123456789}
2. Wait 100ms
3. GET /api/settings/service-configs/chronicle (read 1)
4. Wait 100ms
5. GET /api/settings/service-configs/chronicle (read 2)
6. Wait 100ms
7. GET /api/settings/service-configs/chronicle (read 3)

### Expected Results
- All reads return temperature: 0.123456789
- Precision maintained (not rounded to 0.12 or 0.123)
- Tolerance: < 0.000001 for floating-point representation

### Test Data
```json
{
  "precise_value": 0.123456789,
  "tolerance": 0.000001,
  "should_not_be": [0.12, 0.123, 0.1235]
}
```

### Notes
- Tests YAML serialization quality
- Multiple reads verify persistence
- Related: TC-SETTINGS-010

---

## TC-SETTINGS-013: User Override Persists Across Multiple Reads

**Type**: Integration
**Priority**: High
**Requires Secrets**: No

### Description
Verify user overrides don't revert to defaults or get clobbered by background processes.

### Preconditions
- Service is running
- config.defaults.yaml has temperature = 0.7

### Test Steps
1. PUT /api/settings/service-configs/chronicle with {"temperature": 0.5}
2. Wait 100ms
3. GET /api/settings/service-configs/chronicle (read 1)
4. Wait 100ms
5. GET /api/settings/service-configs/chronicle (read 2)
6. Wait 100ms
7. GET /api/settings/service-configs/chronicle (read 3)

### Expected Results
- All 3 reads return temperature: 0.5
- Override value persists
- Default value (0.7) never appears

### Test Data
```json
{
  "default_value": 0.7,
  "override_value": 0.5,
  "expected_all_reads": 0.5
}
```

### Notes
- Tests override persistence
- Verifies no cache invalidation bugs
- Related: TC-SETTINGS-007, TC-SETTINGS-020

---

## TC-SETTINGS-014: Database URL Not Transformed

**Type**: API
**Priority**: High
**Requires Secrets**: No

### Description
Verify database URLs and connection strings are stored exactly as entered with no URL rewriting or substitution.

### Preconditions
- Service is running
- API accessible

### Test Steps
1. PUT /api/settings/service-configs/chronicle with {"database_url": "mongodb://test-server:27017/test_db_12345"}
2. Wait 100ms
3. GET /api/settings/service-configs/chronicle

### Expected Results
- Response status: 200
- database_url: "mongodb://test-server:27017/test_db_12345"
- No host substitution
- No port changes
- No database name changes

### Test Data
```json
{
  "original_url": "mongodb://test-server:27017/test_db_12345",
  "expected": "mongodb://test-server:27017/test_db_12345",
  "should_not_be": [
    "mongodb://localhost:27017/test_db_12345",
    "mongodb://test-server:27017/ushadow"
  ]
}
```

### Notes
- Connection strings are critical
- No intelligent URL rewriting
- Related: TC-SETTINGS-010

---

## TC-SETTINGS-015: Missing Config Files Handled Gracefully

**Type**: Integration
**Priority**: High
**Requires Secrets**: No

### Description
Verify system doesn't crash when expected config files are missing.

### Preconditions
- Test environment
- Ability to remove config files

### Test Steps
1. Remove config.overrides.yaml
2. Remove secrets.yaml
3. Keep only config.defaults.yaml
4. GET /api/settings/service-configs/chronicle

### Expected Results
- Response status: 200
- Response contains defaults only
- No 500 errors
- No crashes
- Graceful degradation

### Test Data
```json
{
  "existing_files": ["config.defaults.yaml"],
  "missing_files": ["config.overrides.yaml", "secrets.yaml"],
  "expected_behavior": "Returns defaults, no crash"
}
```

### Notes
- Edge case: new installations
- Tests error handling
- Related: TC-SETTINGS-016

---

## TC-SETTINGS-016: Malformed YAML Logged and Skipped

**Type**: Integration
**Priority**: Medium
**Requires Secrets**: No

### Description
Verify malformed YAML in a config layer is logged and skipped without crashing the system.

### Preconditions
- Test environment
- Can write malformed YAML
- Logging enabled

### Test Steps
1. Write invalid YAML to config.overrides.yaml: "invalid: yaml: syntax: [unclosed"
2. GET /api/settings/service-configs/chronicle
3. Check application logs

### Expected Results
- Response status: 200 (or appropriate error)
- Error logged about malformed YAML
- Malformed layer skipped
- Merge continues with other layers
- No system crash

### Test Data
```yaml
# Malformed YAML
invalid: yaml: syntax: [unclosed
```

### Notes
- Tests robustness
- Prevents production crashes
- Related: TC-SETTINGS-015

---

## TC-SETTINGS-017: Empty Config Layer Skipped

**Type**: Integration
**Priority**: Medium
**Requires Secrets**: No

### Description
Verify empty or null config layers are gracefully skipped during merge.

### Preconditions
- Test environment
- Can create empty files

### Test Steps
1. Create empty config.overrides.yaml (0 bytes or null YAML)
2. Ensure config.defaults.yaml has content
3. GET /api/settings/service-configs/chronicle

### Expected Results
- Response status: 200
- Response contains defaults
- Empty layer skipped without error
- Merge succeeds

### Test Data
```yaml
# config.overrides.yaml is either:
# Option 1: Empty file (0 bytes)
# Option 2: null
# Option 3: {}
```

### Notes
- Tests merge robustness
- Common scenario: fresh override file
- Related: TC-SETTINGS-015

---

## TC-SETTINGS-018: Concurrent Updates Don't Corrupt Config

**Type**: Integration
**Priority**: High
**Requires Secrets**: No

### Description
Verify concurrent API updates don't cause race conditions or corrupt configuration files.

### Preconditions
- Service is running
- Multiple API clients can connect

### Test Steps
1. Client A: PUT /api/settings/service-configs/chronicle with {"temperature": 0.5}
2. Client B: PUT /api/settings/service-configs/chronicle with {"max_tokens": 4000} (simultaneously)
3. Wait for both to complete
4. GET /api/settings/service-configs/chronicle

### Expected Results
- Both PUTs succeed (200)
- Final config contains both updates:
  - temperature: 0.5
  - max_tokens: 4000
- No data loss
- No file corruption

### Test Data
```json
{
  "client_a_update": {"temperature": 0.5},
  "client_b_update": {"max_tokens": 4000},
  "expected_final": {
    "temperature": 0.5,
    "max_tokens": 4000
  }
}
```

### Notes
- Tests concurrency handling
- May require file locking
- Related: TC-SETTINGS-007

---

## TC-SETTINGS-019: Type Coercion Across Layers

**Type**: Integration
**Priority**: Medium
**Requires Secrets**: No

### Description
Verify type coercion handles different representations of the same value across layers (e.g., string "0.8" in .env vs float 0.8 in YAML).

### Preconditions
- .env layer implemented
- Type coercion logic in SettingsStore

### Test Steps
1. Set temperature: 0.7 (float) in config.defaults.yaml
2. Set TEMPERATURE="0.8" (string) in .env
3. Set temperature: 0.5 (float) in config.overrides.yaml
4. GET /api/settings/service-configs/chronicle

### Expected Results
- Response status: 200
- temperature: 0.5 (float type)
- Proper type coercion from string to float
- User override wins with correct type

### Test Data
```json
{
  "defaults": 0.7,
  "env_string": "0.8",
  "override": 0.5,
  "expected_value": 0.5,
  "expected_type": "float"
}
```

### Notes
- Tests cross-format compatibility
- .env values are always strings
- Related: TC-SETTINGS-003

---

## TC-SETTINGS-020: Cache Invalidation After Update

**Type**: Integration
**Priority**: High
**Requires Secrets**: No

### Description
Verify configuration cache is properly invalidated after updates, ensuring fresh reads return new values.

### Preconditions
- SettingsStore uses caching
- Service is running

### Test Steps
1. GET /api/settings/service-configs/chronicle (initial read, populates cache)
2. PUT /api/settings/service-configs/chronicle with {"temperature": 0.999}
3. GET /api/settings/service-configs/chronicle (should read fresh, not cached)

### Expected Results
- Second GET returns temperature: 0.999
- Cache invalidated by PUT
- No stale data returned

### Test Data
```json
{
  "initial_value": 0.7,
  "updated_value": 0.999,
  "expected_after_update": 0.999
}
```

### Notes
- Tests cache coherency
- Related: TC-SETTINGS-013
- Critical for UI responsiveness

---

## TC-SETTINGS-021: Environment Variable Interpolation

**Type**: Integration
**Priority**: High
**Requires Secrets**: No

### Description
Verify OmegaConf environment variable interpolation (${oc.env:VAR}) works correctly in config files.

### Preconditions
- OmegaConf interpolation enabled
- Environment variable set: DATABASE_URL="mongodb://prod:27017/db"

### Test Steps
1. Set environment variable: DATABASE_URL="mongodb://prod:27017/db"
2. Write config.overrides.yaml: `database_url: "${oc.env:DATABASE_URL}"`
3. GET /api/settings/service-configs/chronicle

### Expected Results
- Response status: 200
- database_url: "mongodb://prod:27017/db"
- Variable properly expanded
- No ${} syntax in output

### Test Data
```json
{
  "env_var": "DATABASE_URL=mongodb://prod:27017/db",
  "config_value": "${oc.env:DATABASE_URL}",
  "expected_output": "mongodb://prod:27017/db"
}
```

### Notes
- Tests OmegaConf feature
- Useful for containerized deployments
- Related: TC-SETTINGS-002, TC-SETTINGS-003

---

## TC-SETTINGS-022: Array Merge Behavior

**Type**: Integration
**Priority**: Medium
**Requires Secrets**: No

### Description
Verify behavior when merging array values across layers (append vs replace).

### Preconditions
- Service supports array configs
- OmegaConf merge strategy configured

### Test Steps
1. Set allowed_models: ["gpt-4o-mini", "gpt-4"] in defaults
2. Set allowed_models: ["claude-3-opus"] in overrides
3. GET /api/settings/service-configs/chronicle

### Expected Results
- Response status: 200
- Behavior depends on merge strategy:
  - Replace: allowed_models = ["claude-3-opus"]
  - Append: allowed_models = ["gpt-4o-mini", "gpt-4", "claude-3-opus"]
- Document which strategy is used

### Test Data
```json
{
  "defaults": ["gpt-4o-mini", "gpt-4"],
  "override": ["claude-3-opus"],
  "expected_replace": ["claude-3-opus"],
  "expected_append": ["gpt-4o-mini", "gpt-4", "claude-3-opus"]
}
```

### Notes
- Design decision: replace vs append
- Document in spec
- Related: TC-SETTINGS-007

---

## TC-SETTINGS-023: Unicode in Configuration Values

**Type**: Integration
**Priority**: Medium
**Requires Secrets**: No

### Description
Verify unicode characters in configuration values are properly handled (internationalization support).

### Preconditions
- Service is running
- YAML supports UTF-8

### Test Steps
1. PUT /api/settings/service-configs/chronicle with {"service_name": "测试服务"}
2. GET /api/settings/service-configs/chronicle

### Expected Results
- Response status: 200
- service_name: "测试服务"
- Unicode properly preserved
- No encoding corruption

### Test Data
```json
{
  "test_values": [
    "测试服务",
    "Тестовый сервис",
    "🤖 AI Service",
    "Café ñoño"
  ],
  "expected": "Exact match for all"
}
```

### Notes
- Tests i18n support
- Important for global users
- Related: TC-SETTINGS-011

---

## TC-SETTINGS-024: Config Merge Performance Under 100ms

**Type**: Performance
**Priority**: High
**Requires Secrets**: No

### Description
Verify configuration merge completes in under 100ms for typical config sizes.

### Preconditions
- Service is running
- All 5 layers populated with realistic config

### Test Steps
1. Populate all layers with realistic configs (50-100 settings each)
2. Measure time: start = now()
3. GET /api/settings/service-configs/chronicle
4. Measure time: end = now()
5. Calculate duration_ms = (end - start) * 1000

### Expected Results
- Response status: 200
- duration_ms < 100
- Config merge is performant

### Test Data
```json
{
  "max_allowed_ms": 100,
  "config_size_per_layer": 75,
  "total_settings": 375
}
```

### Notes
- Non-functional requirement
- Important for UI responsiveness
- May need optimization if fails

---

## TC-SETTINGS-025: API Returns Masked Secrets

**Type**: API
**Priority**: Critical
**Requires Secrets**: Yes

### Description
Verify API returns masked values for secrets, not plaintext.

### Preconditions
- secrets.yaml contains api_key = "sk-proj-real-secret-12345"
- Secret masking implemented

### Test Steps
1. Write secrets.yaml with api_key = "sk-proj-real-secret-12345"
2. GET /api/settings/service-configs/chronicle
3. Extract api_key from response

### Expected Results
- Response status: 200
- api_key is masked (e.g., "sk-...2345" or "••••••")
- NOT plaintext "sk-proj-real-secret-12345"

### Test Data
```json
{
  "actual_secret": "sk-proj-real-secret-12345",
  "masked_patterns": [
    "sk-...2345",
    "••••••",
    "***"
  ],
  "must_not_be": "sk-proj-real-secret-12345"
}
```

### Notes
- CRITICAL: Security requirement
- UI must show masked values
- Deployment gets unmasked
- Related: TC-SETTINGS-026

---

## TC-SETTINGS-026: Deployment Uses Unmasked Secrets

**Type**: Integration
**Priority**: Critical
**Requires Secrets**: Yes

### Description
Verify services deployed with configuration receive actual unmasked secret values.

### Preconditions
- secrets.yaml contains api_key = "sk-proj-real-secret-12345"
- Service can be deployed with config

### Test Steps
1. Write secrets.yaml with api_key = "sk-proj-real-secret-12345"
2. Deploy service (or simulate deployment config read)
3. Verify service receives actual secret

### Expected Results
- Service receives api_key = "sk-proj-real-secret-12345"
- NOT masked value
- Service can authenticate with external API

### Test Data
```json
{
  "secret_in_file": "sk-proj-real-secret-12345",
  "ui_sees": "sk-...2345",
  "service_receives": "sk-proj-real-secret-12345"
}
```

### Notes
- CRITICAL: Services need real secrets
- UI shows masked, deployment uses unmasked
- Related: TC-SETTINGS-025

---

## TC-SETTINGS-027: Secrets File Permissions Are Restrictive

**Type**: Integration
**Priority**: High
**Requires Secrets**: No

### Description
Verify secrets.yaml file has restrictive permissions (600 or 640) to prevent unauthorized access.

### Preconditions
- secrets.yaml exists
- Running on Unix-like system

### Test Steps
1. Create or update secrets.yaml
2. Check file permissions: `stat -c %a secrets.yaml`

### Expected Results
- File permissions: 600 (rw-------) or 640 (rw-r-----)
- Not world-readable (no 644 or 777)

### Test Data
```bash
# Expected
-rw-------  1 user  group  secrets.yaml  # 600
-rw-r-----  1 user  group  secrets.yaml  # 640

# NOT acceptable
-rw-r--r--  1 user  group  secrets.yaml  # 644
-rwxrwxrwx  1 user  group  secrets.yaml  # 777
```

### Notes
- Security hardening
- Prevents accidental exposure
- Related: TC-SETTINGS-008

---

## TC-SETTINGS-028: Secrets Never Logged

**Type**: Integration
**Priority**: Critical
**Requires Secrets**: Yes

### Description
Verify secret values never appear in application logs.

### Preconditions
- Logging enabled
- secrets.yaml contains api_key
- Can trigger operations that might log config

### Test Steps
1. Write secrets.yaml with api_key = "sk-proj-test-secret"
2. Perform operations: load config, update config, deploy service
3. Search application logs for "sk-proj-test-secret"

### Expected Results
- Secret value NOT found in any logs
- Logs may show "api_key: ••••••" (masked)
- NO plaintext secrets in logs

### Test Data
```json
{
  "secret_value": "sk-proj-test-secret",
  "should_not_appear_in_logs": true,
  "acceptable_log_entry": "api_key: ••••••"
}
```

### Notes
- CRITICAL: Security requirement
- Prevents secret leakage
- Related: TC-SETTINGS-025, TC-SETTINGS-026

---

## TC-SETTINGS-029: Empty Value vs Null vs Missing Field

**Type**: Integration
**Priority**: Medium
**Requires Secrets**: No

### Description
Verify semantic differences between empty string "", null, and missing fields are preserved.

### Preconditions
- Service is running
- YAML distinguishes null vs empty

### Test Steps
1. PUT with {"field_a": "", "field_b": null}
2. Don't set field_c at all
3. GET and inspect response

### Expected Results
- field_a: "" (empty string)
- field_b: null (explicitly null)
- field_c: missing (not in response) or default value

### Test Data
```json
{
  "field_a": "",
  "field_b": null,
  "field_c": "missing",
  "semantics": "Different meanings preserved"
}
```

### Notes
- Tests data model integrity
- Important for optional fields
- Related: TC-SETTINGS-017

---

## TC-SETTINGS-030: Removing Override Reveals Layer Below

**Type**: Integration
**Priority**: Medium
**Requires Secrets**: No
**Status**: ⏳ Implementation Pending

### Description
Verify removing a value from config.overrides.yaml reveals the value from the next lower layer.

### Preconditions
- .env has LLM_MODEL = "gpt-4"
- config.overrides.yaml has llm_model = "claude-3-opus"

### Test Steps
1. GET /api/settings/service-configs/chronicle (should return "claude-3-opus")
2. Remove llm_model from config.overrides.yaml
3. GET /api/settings/service-configs/chronicle (should return "gpt-4" from .env)

### Expected Results
- First GET: llm_model = "claude-3-opus"
- After removal: llm_model = "gpt-4"
- Layer hierarchy is dynamic, not static

### Test Data
```json
{
  "env_layer": "gpt-4",
  "override_layer": "claude-3-opus",
  "first_get": "claude-3-opus",
  "after_removal": "gpt-4"
}
```

### Notes
- Tests hierarchy dynamism
- Important for "reset to default" UX
- Related: TC-SETTINGS-031

---

## TC-SETTINGS-031: Reset to Defaults Clears All Overrides

**Type**: API
**Priority**: Medium
**Requires Secrets**: No

### Description
Verify "reset to defaults" operation clears config.overrides.yaml and reveals base defaults.

### Preconditions
- Service is running
- config.overrides.yaml has multiple settings
- Reset endpoint implemented (or manual clear)

### Test Steps
1. PUT multiple settings to config.overrides.yaml
2. GET /api/settings/service-configs/chronicle (verify overrides active)
3. DELETE /api/settings/service-configs/chronicle (or clear overrides file)
4. GET /api/settings/service-configs/chronicle

### Expected Results
- After DELETE: all settings revert to defaults
- config.overrides.yaml empty or removed
- No user overrides remain

### Test Data
```json
{
  "overrides_before": {
    "temperature": 0.5,
    "llm_model": "claude-3-opus"
  },
  "defaults": {
    "temperature": 0.7,
    "llm_model": "gpt-4o-mini"
  },
  "after_reset": {
    "temperature": 0.7,
    "llm_model": "gpt-4o-mini"
  }
}
```

### Notes
- UX: "Factory reset" for settings
- Related: TC-SETTINGS-030

---

## TC-SETTINGS-032: Circular Variable References Detected

**Type**: Integration
**Priority**: Low
**Requires Secrets**: No

### Description
Verify circular variable references are detected and handled with clear error.

### Preconditions
- OmegaConf interpolation enabled
- Can write config with circular refs

### Test Steps
1. Write config with circular refs:
   ```yaml
   var_a: "${var_b}"
   var_b: "${var_a}"
   ```
2. GET /api/settings/service-configs/chronicle

### Expected Results
- Error response with clear message about circular reference
- System doesn't hang or crash
- Error logged

### Test Data
```yaml
# Circular reference
var_a: "${var_b}"
var_b: "${var_a}"
```

### Notes
- Edge case
- OmegaConf should detect this
- Related: TC-SETTINGS-021

---

## TC-SETTINGS-033: Large Config Files Performance

**Type**: Performance
**Priority**: Low
**Requires Secrets**: No

### Description
Verify system handles large config files (1000+ settings) without performance degradation.

### Preconditions
- Can create large config files
- Performance monitoring enabled

### Test Steps
1. Create config.defaults.yaml with 1000 settings
2. Create config.overrides.yaml with 500 settings
3. Measure GET /api/settings/service-configs/chronicle response time

### Expected Results
- Response time < 200ms
- No memory issues
- System stable

### Test Data
```json
{
  "defaults_count": 1000,
  "overrides_count": 500,
  "max_response_ms": 200
}
```

### Notes
- Stress test
- Unlikely in production
- Related: TC-SETTINGS-024

---

## TC-SETTINGS-034: Compose Preserves Non-Overridden Defaults

**Type**: Integration
**Priority**: High
**Requires Secrets**: No
**Status**: ⏳ Implementation Pending

### Description
Verify Docker Compose only overrides explicitly set environment variables, not all defaults.

### Preconditions
- config.defaults.yaml has: {model: "gpt-4o", temp: 0.7, db: "ushadow"}
- docker-compose.yml only sets: DATABASE = "chronicle_prod"

### Test Steps
1. Set defaults as above
2. Set compose to only override database
3. GET /api/settings/service-configs/chronicle

### Expected Results
- Response contains:
  - llm_model: "gpt-4o" (from defaults)
  - temperature: 0.7 (from defaults)
  - database: "chronicle_prod" (from compose)

### Test Data
```json
{
  "defaults": {
    "llm_model": "gpt-4o",
    "temperature": 0.7,
    "database": "ushadow"
  },
  "compose_overrides": {
    "database": "chronicle_prod"
  },
  "expected": {
    "llm_model": "gpt-4o",
    "temperature": 0.7,
    "database": "chronicle_prod"
  }
}
```

### Notes
- Compose should be surgical, not wholesale
- Related: TC-SETTINGS-002, TC-SETTINGS-007

---

## TC-SETTINGS-035: API Rejects Invalid Setting Names

**Type**: API
**Priority**: Medium
**Requires Secrets**: No

### Description
Verify API rejects updates with unknown or invalid setting names.

### Preconditions
- Service schema defines valid settings
- Validation enabled

### Test Steps
1. PUT /api/settings/service-configs/chronicle with {"invalid_field_xyz": "value"}
2. Check response

### Expected Results
- Response status: 400 Bad Request
- Error message indicates unknown field
- No settings changed

### Test Data
```json
{
  "invalid_update": {"invalid_field_xyz": "value"},
  "expected_status": 400,
  "expected_error": "Unknown setting: invalid_field_xyz"
}
```

### Notes
- Input validation
- Prevents typos
- Helps with debugging

---

## Test Coverage Matrix

| Requirement | Test Cases | Coverage |
|-------------|-----------|----------|
| Layer 1: Defaults | TC-001 | ✅ Happy Path |
| Layer 2: Compose | TC-002, TC-034 | ✅ Happy Path, ⚠️ Edge Cases |
| Layer 3: .env | TC-003 | ✅ Happy Path |
| Layer 4: Suggested | TC-004, TC-006 | ✅ Happy Path, ❌ Negative |
| Layer 5: User Override | TC-005, TC-007, TC-013, TC-030, TC-031 | ✅ Happy Path, ⚠️ Edge Cases |
| Secrets Routing | TC-008, TC-009, TC-025, TC-026, TC-027, TC-028 | ✅ Happy Path, 🔒 Security |
| UI-Deployment Consistency | TC-010, TC-011, TC-012, TC-014 | ✅ Happy Path, ⚠️ Precision |
| Partial Updates | TC-007, TC-018 | ✅ Happy Path, 🔄 Concurrency |
| Error Handling | TC-015, TC-016, TC-017, TC-032, TC-035 | ❌ Negative Tests |
| Type Handling | TC-019, TC-023, TC-029 | ⚠️ Edge Cases |
| Performance | TC-020, TC-024, TC-033 | ⚡ Performance |
| Variable Interpolation | TC-021 | ✅ Happy Path |
| Array Merging | TC-022 | ⚠️ Edge Cases |

---

## Review Checklist

Before approving for automation:

- [x] All functional requirements have test cases
- [x] Happy path scenarios covered (10 tests)
- [x] Edge cases identified (13 tests)
- [x] Negative tests included (7 tests)
- [x] Test data is realistic and sufficient
- [x] Dependencies are documented
- [x] Security considerations addressed (6 security tests)
- [x] Performance tests included (3 tests)
- [ ] All tests executable (some pending implementation)

---

## Implementation Notes

### Tests Ready to Run Immediately
- TC-001, TC-005, TC-007, TC-008, TC-009, TC-010, TC-011, TC-012, TC-013, TC-014, TC-015, TC-020, TC-024

### Tests Pending Feature Implementation
- TC-002 (Compose layer)
- TC-003 (.env layer)
- TC-004, TC-006 (Provider suggestions)
- TC-030 (Dynamic layer reveal)
- TC-034 (Compose partial override)

### Tests Requiring Additional Infrastructure
- TC-016 (Logging validation)
- TC-018 (Concurrency framework)
- TC-025, TC-026, TC-028 (Actual secrets)
- TC-033 (Large config generation)

---

## Approval

- [ ] QA Lead Approval
- [ ] Product Owner Approval
- [ ] Ready for Automation

**Approved By**: _______________
**Date**: _______________
