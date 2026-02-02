# Backend Quick Reference for AI Agents

> **MANDATORY**: Read this BEFORE writing any backend code. ~1000 tokens.

## Workflow: Search Before Creating

1. **Check this reference** - Scan available services below
2. **Search for existing code**:
   ```bash
   grep -rn "async def method_name" src/services/
   grep -rn "class ClassName" src/
   ```
3. **Check backend index**: `cat src/backend_index.py`
4. **Read architecture**: `cat src/ARCHITECTURE.md`
5. **Only then create new code** if nothing exists

---

## Available Services

### Resource Managers (External Systems)

| Service | Import From | Purpose | Key Methods |
|---------|-------------|---------|-------------|
| `DockerManager` | `src.services.docker_manager` | Docker container operations | `get_container_status()`, `start_container()`, `stop_container()`, `get_logs()` |
| `KubernetesManager` | `src.services.kubernetes_manager` | Kubernetes deployments | `deploy_service()`, `get_pod_logs()`, `list_deployments()`, `scale_deployment()` |
| `TailscaleManager` | `src.services.tailscale_manager` | Tailscale mesh networking | `get_status()`, `configure_serve()`, `check_authentication()` |
| `UNodeManager` | `src.services.unode_manager` | Distributed cluster nodes | `register_unode()`, `list_unodes()`, `create_join_token()`, `process_heartbeat()` |

### Business Services (Orchestration)

| Service | Import From | Purpose |
|---------|-------------|---------|
| `ServiceOrchestrator` | `src.services.service_orchestrator` | Service lifecycle coordination |
| `DeploymentManager` | `src.services.deployment_manager` | Multi-platform deployment logic |
| `ServiceConfigManager` | `src.services.service_config_manager` | Service configuration CRUD |

### Registries (In-Memory Lookups)

| Registry | Import From | Purpose |
|----------|-------------|---------|
| `ProviderRegistry` | `src.services.provider_registry` | Available service providers |
| `ComposeServiceRegistry` | `src.services.compose_registry` | Docker Compose service catalog |

### Stores (Persistent Data)

| Store | Import From | Purpose |
|-------|-------------|---------|
| `SettingsStore` | `src.config.store` | Application settings (YAML) |
| `SecretStore` | `src.config.secret_store` | Secret management |

### Authentication & Security

| Service/Utility | Import From | Purpose |
|----------------|-------------|---------|
| `get_current_user_hybrid()` | `src.services.keycloak_auth` | FastAPI dependency - validates Keycloak OR legacy tokens |
| `bridge_to_service_token()` | `src.services.token_bridge` | Convert Keycloak token → service token (HS256) |
| `get_auth_secret_key()` | `src.config.secrets` | Get shared AUTH_SECRET_KEY |

**Token Bridge Architecture**:
- **Keycloak tokens**: RS256 (public key validation), issued by Keycloak
- **Service tokens**: HS256 (shared secret), issued by ushadow for Chronicle/Mycelia
- **Automatic bridging**: Proxy (`/api/services/*/proxy/*`) and audio relay (`/ws/audio/relay`) automatically convert Keycloak → service tokens
- **No frontend changes needed**: Frontend sends Keycloak token, backend bridges transparently

### Common Utilities

| Utility | Import From | Purpose |
|---------|-------------|---------|
| `get_settings()` | `src.config.omegaconf_settings` | Get OmegaConf settings instance |
| `get_tailscale_status()` | `src.utils.tailscale_serve` | Tailscale connection status |

---

## Architecture Layers (NEVER VIOLATE)

```
┌─────────────┐
│   Router    │  ← HTTP: Parse requests, call services, return responses
└─────────────┘
      │
      ▼
┌─────────────┐
│   Service   │  ← Business Logic: Orchestrate, coordinate, implement rules
└─────────────┘
      │
      ▼
┌─────────────┐
│ Store/Repo  │  ← Data Access: YAML files, DB, external APIs
└─────────────┘
```

**Rules**:
- Routers: Thin HTTP adapters (max 30 lines per endpoint)
- Services: Business logic, return data (NOT HTTP responses)
- Stores: Data persistence only
- Skip service layer ONLY for trivial CRUD

---

## Common Patterns

### Pattern 1: Router (HTTP Translation Layer)

```python
from fastapi import APIRouter, HTTPException, Depends
from src.services.my_service import MyService, get_my_service

router = APIRouter(prefix="/api/resource", tags=["resource"])

@router.get("/{id}")
async def get_resource(
    id: str,
    service: MyService = Depends(get_my_service),
) -> ResourceResponse:
    """Get resource by ID.

    Thin adapter: parse HTTP → call service → return HTTP response.
    """
    resource = await service.get_resource(id)
    if not resource:
        raise HTTPException(status_code=404, detail="Resource not found")
    return ResourceResponse.from_domain(resource)
```

**Router Rules**:
- ✅ Parse request params/body
- ✅ Call service methods
- ✅ Raise `HTTPException` for errors
- ✅ Return Pydantic models
- ❌ NO business logic
- ❌ NO direct DB/file access
- ❌ NO complex transformations (>10 lines)

### Pattern 2: Service (Business Logic Layer)

```python
class MyService:
    """Business logic for resource management."""

    def __init__(self, store: ResourceStore):
        self.store = store

    async def get_resource(self, id: str) -> Optional[Resource]:
        """
        Get resource by ID.

        Returns:
            Resource if found, None otherwise.
            Does NOT raise HTTPException - let router handle HTTP.
        """
        return await self.store.get(id)

    async def create_resource(self, data: ResourceCreate) -> Resource:
        """
        Create resource with business validation.

        Raises:
            ValueError: If validation fails (domain exception, not HTTP)
        """
        # Business rules here
        if await self._name_exists(data.name):
            raise ValueError(f"Resource '{data.name}' already exists")

        return await self.store.create(data)
```

**Service Rules**:
- ✅ Implement business logic
- ✅ Coordinate multiple stores/managers
- ✅ Return domain objects
- ✅ Raise domain exceptions (`ValueError`, `RuntimeError`)
- ❌ NO `raise HTTPException`
- ❌ NO HTTP status codes
- ❌ NO request/response parsing

### Pattern 3: Dependency Injection

```python
from fastapi import Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

# Dependency provider
def get_my_service(db: AsyncIOMotorDatabase = Depends(get_database)) -> MyService:
    """Provide MyService instance with dependencies."""
    return MyService(store=MyStore(db))

# Usage in router
@router.get("/")
async def endpoint(
    service: MyService = Depends(get_my_service),
    current_user: User = Depends(get_current_user),
):
    return await service.list_resources(user=current_user)
```

**Benefits**:
- Testable (inject mocks)
- Reusable across endpoints
- Clear dependencies

### Pattern 4: Pydantic Models for Complex Params

```python
from pydantic import BaseModel, Field

# ❌ BAD - too many parameters
async def create_thing(
    name: str,
    description: str,
    tags: list[str],
    enabled: bool,
    config: dict,
    metadata: dict,
):
    pass

# ✅ GOOD - use Pydantic model
class ThingCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: str = ""
    tags: list[str] = []
    enabled: bool = True
    config: dict = {}
    metadata: dict = {}

async def create_thing(data: ThingCreate):
    pass
```

### Pattern 5: Error Handling

```python
# In service
async def get_resource(self, id: str) -> Optional[Resource]:
    """Return None if not found - let router decide HTTP status."""
    return await self.store.get(id)

# In router
@router.get("/{id}")
async def get_resource(id: str, service: MyService = Depends(get_service)):
    resource = await service.get_resource(id)
    if not resource:
        raise HTTPException(status_code=404, detail=f"Resource {id} not found")
    return resource
```

**Pattern**: Services return data/None, routers translate to HTTP.

---

## File Size Limits

**Enforced by Ruff** (see `pyproject.toml`):

| File Type | Max Lines | When Over Limit |
|-----------|-----------|-----------------|
| Routers | 500 | Split by resource domain |
| Services | 800 | Extract helper services/utilities |
| Utils | 300 | Split into focused modules |
| Models | 400 | Split by domain area |

**Complexity Limits**:
- Max function complexity: 10 (McCabe)
- Max function parameters: 5 (use Pydantic models)
- Max nested levels: 3

---

## Common Method Names (Check Before Creating)

Before creating these methods, search if they exist:

```bash
# Status checks
grep -rn "async def get_status" src/

# Deployment operations
grep -rn "async def deploy" src/

# Log retrieval
grep -rn "async def get_logs" src/

# List operations
grep -rn "async def list_" src/
```

**Found in multiple services**:
- `get_status()` - DockerManager, KubernetesManager, DeploymentPlatforms
- `deploy()` - DeploymentManager, DeploymentPlatforms
- `get_logs()` - DockerManager, KubernetesManager
- `list_*()` - Most managers

**If exists**: Reuse or extend, don't recreate.

---

## Configuration Access

```python
# ✅ GOOD - use OmegaConf settings
from src.config.omegaconf_settings import get_settings

settings = get_settings()
port = settings.get("network.backend_port", default=8000)

# ✅ GOOD - async context
port = await settings.get_async("network.backend_port", default=8000)

# ❌ BAD - don't access env vars directly
import os
port = os.getenv("BACKEND_PORT")  # Use OmegaConf instead
```

**Pattern**: All config via `get_settings()` for consistency.

---

## Forbidden Patterns

### ❌ Business Logic in Routers

```python
# BAD - router has business logic
@router.post("/")
async def create_service(data: ServiceCreate):
    # Validation logic
    if await check_name_exists(data.name):
        raise HTTPException(400, "Name exists")
    # Creation logic
    service = Service(**data.dict())
    await db.services.insert_one(service.dict())
    return service
```

### ✅ Extract to Service

```python
# GOOD - service has business logic
class ServiceManager:
    async def create_service(self, data: ServiceCreate) -> Service:
        if await self._name_exists(data.name):
            raise ValueError("Name exists")
        return await self.store.create(data)

# Router stays thin
@router.post("/")
async def create_service(
    data: ServiceCreate,
    manager: ServiceManager = Depends(get_service_manager),
):
    try:
        service = await manager.create_service(data)
        return service
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
```

### ❌ HTTPException in Services

```python
# BAD - service raises HTTP exception
class MyService:
    async def get_thing(self, id: str):
        if not found:
            raise HTTPException(status_code=404)
```

### ✅ Return Data, Raise Domain Exceptions

```python
# GOOD - service returns data or raises domain exception
class MyService:
    async def get_thing(self, id: str) -> Optional[Thing]:
        return await self.store.get(id)  # None if not found

    async def delete_thing(self, id: str):
        if not await self.exists(id):
            raise ValueError(f"Thing {id} not found")  # Domain exception
```

### ❌ Nested Functions >50 Lines

```python
# BAD - embedded logic
async def process_request(self, data):
    # 200 lines of nested logic
    def helper1():
        # ...
    def helper2():
        # ...
```

### ✅ Extract to Methods/Utilities

```python
# GOOD - extracted, testable
async def process_request(self, data):
    validated = self._validate(data)
    transformed = self._transform(validated)
    return await self._save(transformed)

def _validate(self, data): ...
def _transform(self, data): ...
async def _save(self, data): ...
```

---

## Testing Patterns

```python
# Test services, not routers
async def test_service_get_resource():
    service = MyService(store=MockStore())
    result = await service.get_resource("id")
    assert result.id == "id"

# Test routers via TestClient (integration)
def test_router_get_resource(client: TestClient):
    response = client.get("/api/resource/id")
    assert response.status_code == 200
```

**Pattern**: Unit test services, integration test routers.

---

## Checklist Before Creating New Code

- [ ] Searched for existing implementation: `grep -rn "method_name" src/`
- [ ] Checked backend index: `cat src/backend_index.py`
- [ ] Read ARCHITECTURE.md to confirm layer placement
- [ ] Following naming convention (Manager/Registry/Store/Service)
- [ ] Using dependency injection via `Depends()`
- [ ] Router stays thin (<30 lines per endpoint)
- [ ] Service returns data, not HTTP responses
- [ ] Using Pydantic models for complex params
- [ ] File will stay under size limits (router 500, service 800, util 300)

---

## Quick Reference Card

```
┌─────────────────────────────────────────────────┐
│ LAYER         │ WHAT IT DOES                    │
├─────────────────────────────────────────────────┤
│ Router        │ HTTP ↔ Service (thin adapter)  │
│ Service       │ Business logic, orchestration   │
│ Store         │ Data persistence (YAML/DB/API)  │
│ Util          │ Pure functions, no state        │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ WHEN TO       │ CREATE                          │
├─────────────────────────────────────────────────┤
│ External API  │ Manager (DockerManager)         │
│ Business rule │ Service (OrderService)          │
│ Data access   │ Store (SettingsStore)           │
│ In-memory map │ Registry (ProviderRegistry)     │
│ Pure function │ Utility (parse_container_name)  │
└─────────────────────────────────────────────────┘
```

---

## Need Help?

1. **Architecture questions**: Read `src/ARCHITECTURE.md`
2. **Pattern examples**: Read `docs/SERVICE_PATTERNS.md`
3. **Full strategy**: Read `docs/BACKEND-EXCELLENCE-PLAN.md`
