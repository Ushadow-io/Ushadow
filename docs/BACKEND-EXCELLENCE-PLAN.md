# Backend Excellence Plan

> A strategy for maintainable, discoverable Python backend code that AI agents can reliably reference and extend.

## Executive Summary

This plan adapts learnings from PR #113 (Frontend Excellence) to create backend-specific patterns that prevent:
1. **Method duplication** - Agents creating new methods when existing ones exist
2. **Misplaced code** - Business logic in routers, HTTP concerns in services
3. **God classes** - Files with 1500+ lines and 30+ methods
4. **Complex nested functions** - Hard-to-test, hard-to-reuse logic buried in private methods

---

## Key Learnings from Frontend Excellence PR #113

### What Worked
1. **Agent Quick Reference** (~800 tokens) - Scannable index of reusable components
2. **UI Contract** - Single source of truth for shared patterns
3. **File Size Limits** - ESLint rules force extraction (600 lines max for pages)
4. **Search-First Workflow** - Mandatory grep before creating new code
5. **Pattern Documentation** - Clear examples of when to use what

### Adapted for Backend
| Frontend Pattern | Backend Equivalent |
|------------------|-------------------|
| AGENT_QUICK_REF.md | BACKEND_QUICK_REF.md |
| ui-contract.ts | service_registry.py |
| HOOK_PATTERNS.md | SERVICE_PATTERNS.md |
| ESLint file limits | Ruff/pylint class complexity limits |
| Component search | Function/method search via grep + index |

---

## Current State Analysis

### Issues Discovered

#### 1. Large Files (Maintenance Burden)
```
unode_manager.py:     67K, 32 methods, 1670 lines
docker_manager.py:    63K, ~40 methods, 1537 lines
kubernetes_manager.py: 61K, ~35 methods, 1505 lines
tailscale.py (router): 54K, 32 endpoints, 1522 lines
```

**Impact**: High token cost to reference, agents can't scan efficiently.

#### 2. Boundary Violations
- **Routers with business logic**: `tailscale.py` has 200+ lines of platform detection logic
- **Services with HTTP concerns**: Some services raise `HTTPException` directly
- **Mixed responsibilities**: `unode_manager.py` handles encryption, Docker, Kubernetes, HTTP probes

#### 3. Method Duplication Patterns
```python
# Found in multiple places:
async def get_status(...)  # deployment_platforms.py x3
async def deploy(...)       # Multiple managers
async def get_logs(...)     # Docker, K8s managers
```

**Cause**: Agents don't know these exist, recreate them.

#### 4. Lack of Discoverable Index
- `__init__.py` files are mostly empty (no exports)
- No central registry of available services/utilities
- Agents must read entire files to find methods

#### 5. Complex Nested Functions
```python
# unode_manager.py example
async def get_join_script(self, token: str) -> str:
    # 260 lines of bash script generation
    # Could be: script_generator.generate_bash_bootstrap(token)
```

---

## Architecture Strengths (Keep These)

✅ **Clear Layer Separation** - ARCHITECTURE.md defines router/service/model boundaries
✅ **Naming Conventions** - Manager/Registry/Store/Resolver patterns documented
✅ **OmegaConf Settings** - Single source of truth for configuration
✅ **Dependency Injection** - FastAPI Depends() used appropriately

**Strategy**: Build on these strengths, don't refactor unnecessarily.

---

## Backend Excellence Strategy

### Phase 1: Discovery & Indexing (Week 1)

#### 1.1 Create Backend Quick Reference

**File**: `ushadow/backend/BACKEND_QUICK_REF.md` (~1000 tokens)

```markdown
# Backend Quick Reference

> Read BEFORE writing any backend code.

## Workflow
1. **Search first**: `grep -rn "async def method_name" src/`
2. **Check registry**: Read `src/service_registry.py`
3. **Check patterns**: Read `docs/SERVICE_PATTERNS.md`
4. **Follow architecture**: Read `src/ARCHITECTURE.md`

## Available Services

### Resource Managers (External Systems)
| Service | Import | Purpose | Key Methods |
|---------|--------|---------|-------------|
| DockerManager | `src.services.docker_manager` | Docker ops | `get_container_status`, `start_container` |
| KubernetesManager | `src.services.kubernetes_manager` | K8s ops | `deploy_service`, `get_pod_logs` |
| TailscaleManager | `src.services.tailscale_manager` | Tailscale ops | `get_status`, `configure_serve` |
| UNodeManager | `src.services.unode_manager` | Cluster nodes | `register_unode`, `list_unodes` |

### Business Services
| Service | Import | Purpose |
|---------|--------|---------|
| ServiceOrchestrator | `src.services.service_orchestrator` | Service lifecycle |
| DeploymentManager | `src.services.deployment_manager` | Multi-platform deploys |

### Utilities
| Util | Import | Purpose |
|------|--------|---------|
| get_settings | `src.config.omegaconf_settings` | Config access |
| get_auth_secret_key | `src.config.secrets` | Secret access |

## Common Patterns

### Error Handling in Routers
```python
from fastapi import HTTPException

# ✅ GOOD - router handles HTTP translation
@router.get("/resource/{id}")
async def get_resource(id: str, service: ServiceClass = Depends(get_service)):
    result = await service.get_resource(id)
    if not result:
        raise HTTPException(status_code=404, detail="Resource not found")
    return result
```

### Service Methods Return Data
```python
# ✅ GOOD - service returns data, no HTTP concerns
class MyService:
    async def get_resource(self, id: str) -> Optional[Resource]:
        # Business logic here
        return resource or None  # Let router decide HTTP status
```

### Dependency Injection
```python
# ✅ GOOD - use FastAPI Depends for services
from fastapi import Depends

def get_my_service() -> MyService:
    return MyService(db=get_db())

@router.get("/")
async def endpoint(service: MyService = Depends(get_my_service)):
    return await service.do_thing()
```

## File Size Limits

- **Routers**: Max 500 lines (thin HTTP adapters)
- **Services**: Max 800 lines (extract to multiple services)
- **Utilities**: Max 300 lines (pure functions only)

If over limit, split by:
- **Routers**: Group related endpoints into separate routers
- **Services**: Extract helper classes or strategy pattern
- **Complex functions**: Move to dedicated modules

## Forbidden Patterns

❌ Business logic in routers (move to services)
❌ `raise HTTPException` in services (return data, let router handle HTTP)
❌ Nested functions >50 lines (extract to methods/functions)
❌ Methods with >5 parameters (use Pydantic models)
❌ Direct DB access in routers (use services)

## Architecture Layers

```
Router → Service → Store/Repo → DB/API
  ↓         ↓          ↓
 HTTP    Business    Data
Layer     Logic     Access
```

Never skip layers unless documented exception.
```

#### 1.2 Create Service Registry

**File**: `ushadow/backend/src/service_registry.py`

```python
"""
Central registry of all available services and their public APIs.

Agents should import this file to discover existing functionality.
"""

from typing import Dict, List, Type

# =============================================================================
# Service Discovery Registry
# =============================================================================

SERVICE_REGISTRY: Dict[str, Dict[str, any]] = {
    "docker": {
        "class": "DockerManager",
        "module": "src.services.docker_manager",
        "methods": [
            "get_container_status",
            "start_container",
            "stop_container",
            "get_logs",
            "inspect_container",
        ],
        "use_when": "Managing Docker containers",
    },
    "kubernetes": {
        "class": "KubernetesManager",
        "module": "src.services.kubernetes_manager",
        "methods": [
            "deploy_service",
            "get_pod_logs",
            "get_deployment_status",
            "scale_deployment",
        ],
        "use_when": "Deploying or managing Kubernetes resources",
    },
    # ... more services
}

# =============================================================================
# Common Utilities Registry
# =============================================================================

UTILITY_REGISTRY: Dict[str, Dict[str, any]] = {
    "settings": {
        "function": "get_settings",
        "module": "src.config.omegaconf_settings",
        "returns": "OmegaConf",
        "use_when": "Reading application configuration",
    },
    "secrets": {
        "function": "get_auth_secret_key",
        "module": "src.config.secrets",
        "returns": "str",
        "use_when": "Accessing secret keys",
    },
    # ... more utilities
}

# =============================================================================
# Method Index (for grep-ability)
# =============================================================================

METHOD_INDEX = """
Common methods available across services:

get_status():
  - services/deployment_platforms.py (DockerPlatform, K8sPlatform, LocalPlatform)
  - services/docker_manager.py
  - services/kubernetes_manager.py

deploy():
  - services/deployment_manager.py
  - services/deployment_platforms.py

get_logs():
  - services/docker_manager.py
  - services/kubernetes_manager.py

Before creating a new method, check if similar functionality exists.
"""
```

---

### Phase 2: Code Organization Rules (Week 1-2)

#### 2.1 Add Ruff/Pylint Rules

**File**: `ushadow/backend/pyproject.toml` (add/update)

```toml
[tool.ruff]
line-length = 100
target-version = "py311"

[tool.ruff.lint]
select = [
    "E",   # pycodestyle errors
    "W",   # pycodestyle warnings
    "F",   # pyflakes
    "I",   # isort
    "C90", # mccabe complexity
    "N",   # pep8-naming
]

[tool.ruff.lint.mccabe]
max-complexity = 10  # Force extraction of complex functions

[tool.ruff.lint.pylint]
max-args = 5         # Force use of Pydantic models for many params
max-branches = 12
max-statements = 50

[tool.ruff.lint.per-file-ignores]
"__init__.py" = ["F401"]  # Allow unused imports in __init__

[tool.pylint.main]
max-line-length = 100

[tool.pylint.design]
max-attributes = 10   # Prevent god classes
max-locals = 15
max-returns = 6
max-branches = 12
max-statements = 50

[tool.pylint.format]
max-module-lines = 800  # Force splitting large files
```

#### 2.2 Service Patterns Documentation

**File**: `ushadow/backend/docs/SERVICE_PATTERNS.md`

```markdown
# Service Patterns

## Pattern 1: Resource Manager

Use for external systems (Docker, K8s, Tailscale).

```python
class ResourceManager:
    """Manages lifecycle of external resources."""

    def __init__(self, client: ClientType):
        self.client = client

    async def get_status(self, resource_id: str) -> ResourceStatus:
        """Get resource status. Returns data, no HTTP concerns."""
        pass

    async def create(self, config: ResourceConfig) -> Resource:
        """Create resource. Raises domain exceptions, not HTTP."""
        pass
```

**When to use**: Interfacing with Docker, K8s, external APIs.

## Pattern 2: Business Service

Use for business logic coordination.

```python
class BusinessService:
    """Orchestrates business logic across multiple resources."""

    def __init__(
        self,
        manager1: Manager1 = Depends(get_manager1),
        manager2: Manager2 = Depends(get_manager2),
    ):
        self.manager1 = manager1
        self.manager2 = manager2

    async def execute_workflow(self, input: WorkflowInput) -> WorkflowResult:
        """Execute multi-step workflow."""
        # 1. Validate with manager1
        # 2. Execute with manager2
        # 3. Return result (not HTTP response)
        pass
```

**When to use**: Coordinating multiple managers, business rules.

## Pattern 3: Thin Router

```python
router = APIRouter(prefix="/api/resource", tags=["resource"])

@router.get("/{id}")
async def get_resource(
    id: str,
    service: ResourceService = Depends(get_resource_service),
) -> ResourceResponse:
    """Get resource by ID."""
    resource = await service.get_resource(id)
    if not resource:
        raise HTTPException(status_code=404, detail="Not found")
    return ResourceResponse.from_domain(resource)
```

**Rules**:
- Max 30 lines per endpoint
- No business logic
- Only HTTP translation
- Use Pydantic for validation

## Pattern 4: Extract Complex Logic

### Before (BAD - nested function):
```python
async def get_join_script(self, token: str) -> str:
    # 260 lines of bash script embedded here
    script = """
    #!/bin/bash
    # ...
    """
    return script
```

### After (GOOD - extracted module):
```python
# In src/utils/script_generators.py
def generate_bash_bootstrap(token: str, config: BootstrapConfig) -> str:
    """Generate bootstrap bash script."""
    # Clear, testable, reusable
    pass

# In service:
async def get_join_script(self, token: str) -> str:
    config = self._build_bootstrap_config(token)
    return generate_bash_bootstrap(token, config)
```

## Pattern 5: Shared Utilities

```python
# src/utils/docker_helpers.py
def parse_container_name(name: str) -> Tuple[str, str]:
    """Parse container name into (project, service)."""
    # Pure function, no side effects
    pass

# Used by multiple services
from src.utils.docker_helpers import parse_container_name
```

**When to create utility**:
- Used by 2+ services
- Pure function (no state)
- <100 lines
```

---

### Phase 3: Enforce Exports & Discoverability (Week 2)

#### 3.1 Populate __init__.py Files

**Pattern**: Each `__init__.py` exports public API

```python
# src/services/__init__.py
"""
Service layer public API.

Import services from here to ensure consistent interface.
"""

from src.services.docker_manager import DockerManager, get_docker_manager
from src.services.kubernetes_manager import KubernetesManager, get_kubernetes_manager
from src.services.unode_manager import UNodeManager, get_unode_manager
from src.services.service_orchestrator import ServiceOrchestrator, get_service_orchestrator

__all__ = [
    "DockerManager",
    "get_docker_manager",
    "KubernetesManager",
    "get_kubernetes_manager",
    "UNodeManager",
    "get_unode_manager",
    "ServiceOrchestrator",
    "get_service_orchestrator",
]
```

**Benefits**:
1. Agents can `cat src/services/__init__.py` to see available services
2. Single import path: `from src.services import DockerManager`
3. Forces API thinking (what should be public?)

#### 3.2 Method Discovery Script

**File**: `scripts/list_methods.py`

```python
#!/usr/bin/env python3
"""
List all public methods across services for agent discovery.

Usage:
    python scripts/list_methods.py services
    python scripts/list_methods.py utils
"""
import ast
import sys
from pathlib import Path

def extract_methods(file_path: Path) -> list[str]:
    """Extract public method names from Python file."""
    with open(file_path) as f:
        tree = ast.parse(f.read())

    methods = []
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef):
            if not node.name.startswith("_"):  # Public only
                methods.append(node.name)
    return methods

def main(layer: str):
    base = Path("src") / layer
    for py_file in base.rglob("*.py"):
        if py_file.name == "__init__.py":
            continue
        methods = extract_methods(py_file)
        if methods:
            print(f"\n{py_file.relative_to('src')}:")
            for method in sorted(methods):
                print(f"  - {method}")

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "services")
```

---

### Phase 4: Refactoring Guidance (Week 3-4)

#### 4.1 Split Large Files

**Priority Files to Split** (over 1000 lines):

1. **unode_manager.py (1670 lines)** → Split into:
   - `unode_manager.py` - Core CRUD (300 lines)
   - `unode_cluster_ops.py` - Cluster operations (400 lines)
   - `unode_discovery.py` - Tailscale peer discovery (300 lines)
   - `unode_bootstrap.py` - Script generation (400 lines)

2. **docker_manager.py (1537 lines)** → Split into:
   - `docker_manager.py` - Container lifecycle (500 lines)
   - `docker_compose_manager.py` - Compose operations (400 lines)
   - `docker_network_manager.py` - Network management (300 lines)

3. **tailscale.py router (1522 lines)** → Split into:
   - `tailscale_setup.py` - Setup wizard endpoints
   - `tailscale_status.py` - Status/info endpoints
   - `tailscale_config.py` - Configuration endpoints

**Splitting Strategy**:
```python
# Before: One god class
class DockerManager:
    # 40 methods, 1500 lines

# After: Composed services
class DockerManager:
    """Coordinates Docker operations."""
    def __init__(self):
        self.containers = ContainerManager()
        self.networks = NetworkManager()
        self.compose = ComposeManager()

class ContainerManager:
    """Manages individual containers."""
    # 15 focused methods, 400 lines

class NetworkManager:
    """Manages Docker networks."""
    # 10 focused methods, 300 lines
```

#### 4.2 Extract Nested Logic

**Target**: Functions with >100 lines or >3 levels of nesting

```python
# Before: Embedded in service
async def get_join_script(self, token: str) -> str:
    # 260 lines of script generation
    pass

# After: Extracted utility
# src/utils/bootstrap_scripts.py
class BootstrapScriptGenerator:
    """Generates bootstrap scripts for node joining."""

    def generate_bash(self, config: BootstrapConfig) -> str:
        """Generate bash bootstrap script."""
        # Testable, reusable, clear purpose
        pass

    def generate_powershell(self, config: BootstrapConfig) -> str:
        """Generate PowerShell bootstrap script."""
        pass
```

---

### Phase 5: Agent Workflow Integration (Week 2)

#### 5.1 Update CLAUDE.md

**Add Backend Section**:

```markdown
## Backend Development Workflow

### BEFORE writing ANY backend code:

#### Step 1: Read Quick Reference
Read `ushadow/backend/BACKEND_QUICK_REF.md` (~1000 tokens)

#### Step 2: Search for Existing Code
```bash
# Search for existing methods
grep -rn "async def method_name" src/services/
grep -rn "def function_name" src/utils/

# Check service registry
cat src/service_registry.py

# List available services
cat src/services/__init__.py
```

#### Step 3: Check Architecture
- Read `src/ARCHITECTURE.md` for layer rules
- Read `docs/SERVICE_PATTERNS.md` for patterns

#### Step 4: Follow Patterns
- **Routers**: Thin HTTP adapters (max 30 lines per endpoint)
- **Services**: Business logic, return data (not HTTP responses)
- **Utils**: Pure functions, stateless

### File Size Limits (Ruff enforced)
- **Routers**: Max 500 lines → Split by resource domain
- **Services**: Max 800 lines → Extract helper services
- **Utils**: Max 300 lines → Split into focused modules

### What NOT to Do
- ❌ Business logic in routers → Move to services
- ❌ HTTP exceptions in services → Return data, let router handle
- ❌ Direct DB access in routers → Use services
- ❌ Nested functions >50 lines → Extract to methods/utils
- ❌ Methods with >5 params → Use Pydantic models
```

---

## Implementation Roadmap

### Week 1: Foundation
- [ ] Create `BACKEND_QUICK_REF.md`
- [ ] Create `service_registry.py`
- [ ] Create `SERVICE_PATTERNS.md`
- [ ] Add Ruff configuration
- [ ] Populate `services/__init__.py`, `utils/__init__.py`

### Week 2: Enforcement
- [ ] Update CLAUDE.md with backend workflow
- [ ] Add pre-commit hook for Ruff checks
- [ ] Create method discovery script
- [ ] Document splitting strategy

### Week 3-4: Refactoring (As Needed)
- [ ] Split `unode_manager.py` if agents struggle
- [ ] Extract bootstrap script generation
- [ ] Split large routers if endpoints grow

### Ongoing: Monitoring
- Track agent behavior:
  - Are they finding existing methods?
  - Are new PRs following patterns?
  - Are file sizes staying under limits?

---

## Success Metrics

### Before
- Largest file: 1670 lines, 32 methods
- Duplicate method names: 15+
- Routers with business logic: 3+
- Time to find existing method: High (must read entire files)

### After (Targets)
- Largest file: <800 lines
- Method discovery: <30 seconds (grep + registry)
- Code reuse: 80%+ of PRs extend existing vs creating new
- Router size: 95% under 500 lines
- Layer violations: <5% of PRs

---

## Quick Wins (Implement Today)

1. **Create `BACKEND_QUICK_REF.md`** - 1 hour
2. **Create `service_registry.py`** - 1 hour
3. **Add Ruff config** - 30 min
4. **Populate `services/__init__.py`** - 30 min
5. **Update CLAUDE.md** - 30 min

**Total**: 3.5 hours for immediate 50%+ discoverability improvement.

---

## Appendix: Anti-Patterns Detected

### 1. God Classes
```python
# unode_manager.py - Does too much
class UNodeManager:
    # Encryption
    # Docker operations
    # Kubernetes operations
    # HTTP probes
    # Script generation
    # Token management
    # Heartbeat processing
```

**Fix**: Compose smaller, focused services.

### 2. Routers with Business Logic
```python
# tailscale.py - 200+ lines of platform detection
@router.get("/platform")
async def get_platform():
    # Complex detection logic here
    # Should be in service layer
```

**Fix**: Extract to `PlatformDetectionService`.

### 3. Services Raising HTTP Exceptions
```python
# Some services do this (antipattern)
async def get_thing(self, id: str):
    if not found:
        raise HTTPException(status_code=404)
```

**Fix**: Return `None` or raise domain exception, let router handle HTTP.

### 4. Duplicate Logic
```python
# Multiple places
async def get_status():
    # Similar implementations in 3+ files
```

**Fix**: Create shared `StatusProvider` protocol.

---

## Notes on Minimal Refactoring

**Philosophy**: Don't refactor working code just to match new patterns.

**When to refactor**:
- Agent creates duplicate because can't find existing
- File grows past 1000 lines
- Complex function causes bugs
- New feature needs the extraction anyway

**When NOT to refactor**:
- Code works fine
- Agents can find it with new registry
- Low change frequency

**Goal**: Enable agents to discover and extend, not perfect the codebase.
