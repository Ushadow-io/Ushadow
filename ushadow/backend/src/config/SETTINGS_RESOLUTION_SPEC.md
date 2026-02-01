# Settings Resolution Specification

## Overview

This document specifies the unified approach for resolving environment variable values across all contexts in ushadow. The goal is a single source of truth that eliminates fragmented resolution logic.

---

## Sources of Settings (Priority Order)

Values can come from multiple sources. When resolving, we check in this order:

### 1. ServiceConfig Instance Overrides (Highest Priority)
- **Location**: MongoDB `service_configs` collection, `config.values` field
- **Scope**: Per-deployment instance (e.g., "my-chronicle-prod" vs "my-chronicle-dev")
- **Use case**: User wants different API keys for different deployments of same service
- **Example**: `{"OPENAI_API_KEY": {"_from_setting": "api_keys.openai_prod"}}`

### 2. Service-Specific Saved Config
- **Location**: OmegaConf `service_env_config.<service_id>`
- **Scope**: Per-service (applies to all instances of that service)
- **Use case**: User configured how to resolve env vars via UI
- **Example**: `source: "setting", setting_path: "api_keys.openai_api_key"`

### 3. Well-Known Mappings
- **Location**: Hardcoded mapping (should be single location)
- **Scope**: Global - applies to any service using these env var names
- **Use case**: Standard env vars that always map to same settings path
- **Examples**:
  ```
  AUTH_SECRET_KEY -> security.auth_secret_key
  ADMIN_PASSWORD -> security.admin_password
  MONGODB_URI -> infrastructure.mongodb_uri
  REDIS_URL -> infrastructure.redis_url
  ```

### 4. Capability/Provider Resolution
- **Location**: `wiring.yaml` + `capabilities.yaml` + provider configs
- **Scope**: Per-capability (e.g., "llm", "transcription", "memory")
- **Use case**: Service declares it needs "llm" capability, wiring says use "openai" provider
- **Example**: Service needs `LLM_API_KEY`, wiring maps llm->openai, provider config says `api_keys.openai_api_key`

### 5. OmegaConf Settings (Direct)
- **Location**: `secrets.yaml`, `overrides.yaml`, `defaults.yaml`
- **Scope**: Global settings store
- **Use case**: Direct path lookup when setting_path is explicitly configured
- **Priority within OmegaConf**: overrides.yaml > secrets.yaml > defaults.yaml

### 6. OS Environment Variables
- **Location**: `os.environ` (from shell, .env file, Docker/K8s env)
- **Scope**: Process environment
- **Use case**: Fallback for values not in settings store, or bootstrap values

### 7. Compose File Defaults (Lowest Priority)
- **Location**: Compose YAML `${VAR:-default}` syntax
- **Scope**: Per-service definition
- **Use case**: Sensible defaults when nothing else is configured
- **Example**: `REDIS_URL=${REDIS_URL:-redis://localhost:6379}`

---

## Contexts (Who Needs Settings)

### Context A: Local Docker Deployment
- **Caller**: `docker_manager.start_service()`
- **Needs**: Full env dict to pass to `docker compose up`
- **Special considerations**:
  - Values go to subprocess env for compose variable substitution
  - Also injected directly into container

### Context B: Kubernetes Deployment
- **Caller**: `kubernetes_manager.deploy_to_kubernetes()`
- **Needs**: Full env dict to create ConfigMap and Secret
- **Special considerations**:
  - Sensitive values (matching patterns) go to K8s Secret
  - Non-sensitive values go to K8s ConfigMap
  - Must resolve ALL values before generating manifests

### Context C: UI Display (Service Config Page)
- **Caller**: `service_orchestrator.get_env_config()`, settings API
- **Needs**: List of env vars with current values (masked), sources, suggestions
- **Special considerations**:
  - Must show WHERE value came from (for debugging)
  - Must mask sensitive values
  - Must show suggestions for unconfigured vars

### Context D: Validation (Pre-Deploy Check)
- **Caller**: `service_orchestrator.check_env_config()`
- **Needs**: Boolean ready/not-ready, list of missing required vars
- **Special considerations**:
  - Don't need actual values, just need to know if they exist
  - Must distinguish required vs optional

### Context E: Self-Configuration (ushadow Backend)
- **Caller**: `main.py` lifespan, auth module, etc.
- **Needs**: Individual setting values for backend's own operation
- **Special considerations**:
  - Happens at startup before async context available
  - Need sync access methods
  - Bootstrap problem: need AUTH_SECRET_KEY to decrypt other secrets

### Context F: Export (.env Generation)
- **Caller**: `service_orchestrator.export_env_vars()`
- **Needs**: Full env dict with UNMASKED values
- **Special considerations**:
  - User explicitly requested export
  - Values must be unmasked for actual use

---

## Proposed Unified Interface

```python
class SettingsResolver:
    """Single source of truth for resolving env var values."""

    async def resolve_env_var(
        self,
        env_name: str,
        service_id: Optional[str] = None,
        config_id: Optional[str] = None,  # ServiceConfig instance
        include_source: bool = False
    ) -> Union[str, Tuple[str, str, str], None]:
        """
        Resolve a single env var to its value.

        Args:
            env_name: Environment variable name (e.g., "OPENAI_API_KEY")
            service_id: Service requesting (for service-specific config)
            config_id: ServiceConfig instance (for instance overrides)
            include_source: If True, return (value, source_type, source_path)

        Returns:
            Resolved value, or tuple with source info, or None
        """
        pass

    async def resolve_for_service(
        self,
        service_id: str,
        config_id: Optional[str] = None,
        env_var_names: Optional[List[str]] = None
    ) -> Dict[str, str]:
        """
        Resolve all env vars for a service deployment.

        Args:
            service_id: Service to resolve for
            config_id: Optional instance for overrides
            env_var_names: Specific vars to resolve (or all if None)

        Returns:
            Dict of env_name -> resolved_value (only non-empty values)
        """
        pass

    async def check_readiness(
        self,
        service_id: str,
        config_id: Optional[str] = None
    ) -> Tuple[bool, List[str]]:
        """
        Check if service has all required env vars configured.

        Returns:
            (is_ready, list_of_missing_required_vars)
        """
        pass
```

---

## Current Problems

1. **WELL_KNOWN_ENV_MAPPINGS duplicated** in:
   - `service_orchestrator.py`
   - `omegaconf_settings.py` (just added)

2. **Resolution logic duplicated** in:
   - `docker_manager._build_env_vars_from_compose_config()`
   - `docker_manager._build_env_vars_for_service()`
   - `service_orchestrator.check_env_config()`
   - `service_orchestrator.export_env_vars()`
   - `capability_resolver.resolve_for_service()`
   - `omegaconf_settings.resolve_env_value()`

3. **Inconsistent behavior**: Different contexts may resolve same env var differently

4. **Hard to debug**: User can't easily see why a value resolved a certain way

---

## Migration Path

1. Create `SettingsResolver` class in `src/config/settings_resolver.py`
2. Consolidate all WELL_KNOWN_ENV_MAPPINGS into one location
3. Implement unified resolution with source tracking
4. Update `docker_manager` to use `SettingsResolver.resolve_for_service()`
5. Update `kubernetes_manager` to use same
6. Update `service_orchestrator` UI methods to use same
7. Remove duplicated resolution logic from individual modules
8. Add debug endpoint to show resolution chain for any env var
