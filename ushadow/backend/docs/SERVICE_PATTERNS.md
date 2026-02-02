# Service Patterns

> Common implementation patterns for backend services in Ushadow.

This document provides concrete, copy-paste examples for common service patterns. Read this when implementing new services or extending existing ones.

---

## Table of Contents

1. [Resource Manager Pattern](#resource-manager-pattern)
2. [Business Service Pattern](#business-service-pattern)
3. [Thin Router Pattern](#thin-router-pattern)
4. [Dependency Injection Pattern](#dependency-injection-pattern)
5. [Error Handling Patterns](#error-handling-patterns)
6. [Extract Complex Logic](#extract-complex-logic)
7. [Shared Utilities](#shared-utilities)

---

## Resource Manager Pattern

**Use when**: Interfacing with external systems (Docker, Kubernetes, databases, APIs).

### Example: Docker/K8s Manager

```python
from typing import Optional
import asyncio

class ResourceManager:
    """
    Manages lifecycle of external resources.

    Responsibilities:
    - Connect to external system
    - Perform CRUD operations
    - Return domain objects (not HTTP responses)
    - Raise domain exceptions (not HTTPException)
    """

    def __init__(self, client: ExternalClient):
        """
        Initialize with dependency injection.

        Args:
            client: External system client (Docker, K8s, etc.)
        """
        self.client = client
        self._initialized = False

    async def initialize(self) -> bool:
        """
        Initialize connection to external system.

        Returns:
            True if initialization successful, False otherwise.
        """
        try:
            await self.client.connect()
            self._initialized = True
            return True
        except Exception as e:
            logger.error(f"Failed to initialize: {e}")
            return False

    async def get_resource(self, resource_id: str) -> Optional[Resource]:
        """
        Get resource by ID.

        Args:
            resource_id: Unique resource identifier

        Returns:
            Resource if found, None otherwise (NOT HTTPException).
        """
        if not self._initialized:
            raise RuntimeError("Manager not initialized")

        try:
            return await self.client.get(resource_id)
        except ResourceNotFoundError:
            return None  # Let router decide HTTP status
        except Exception as e:
            # Log and re-raise domain exception
            logger.error(f"Error fetching resource {resource_id}: {e}")
            raise RuntimeError(f"Failed to fetch resource: {e}") from e

    async def create_resource(self, config: ResourceConfig) -> Resource:
        """
        Create new resource.

        Args:
            config: Resource configuration

        Returns:
            Created resource

        Raises:
            ValueError: If validation fails (domain exception)
            RuntimeError: If creation fails
        """
        # Validation (business rules)
        if not config.name:
            raise ValueError("Resource name is required")

        # Call external system
        try:
            return await self.client.create(config)
        except Exception as e:
            logger.error(f"Failed to create resource: {e}")
            raise RuntimeError(f"Resource creation failed: {e}") from e
```

**Key Points**:
- ✅ Returns data objects, not HTTP responses
- ✅ Raises domain exceptions (`ValueError`, `RuntimeError`), not `HTTPException`
- ✅ Uses dependency injection for external clients
- ✅ Logs errors before raising
- ❌ No HTTP status codes
- ❌ No direct request/response handling

---

## Business Service Pattern

**Use when**: Coordinating multiple managers, implementing business logic, orchestrating workflows.

### Example: Multi-Manager Orchestration

```python
from typing import Optional
from fastapi import Depends

class BusinessService:
    """
    Orchestrates business logic across multiple resource managers.

    Responsibilities:
    - Implement business rules
    - Coordinate multiple managers
    - Handle transactions/rollbacks
    - Return business domain objects
    """

    def __init__(
        self,
        docker_mgr: DockerManager = Depends(get_docker_manager),
        k8s_mgr: KubernetesManager = Depends(get_kubernetes_manager),
        config_mgr: ServiceConfigManager = Depends(get_service_config_manager),
    ):
        """Use FastAPI Depends for all dependencies."""
        self.docker_mgr = docker_mgr
        self.k8s_mgr = k8s_mgr
        self.config_mgr = config_mgr

    async def deploy_service(
        self,
        service_name: str,
        target_platform: str,
    ) -> DeploymentResult:
        """
        Deploy service to target platform.

        Business logic:
        1. Validate service configuration
        2. Choose deployment platform
        3. Execute deployment
        4. Update status

        Args:
            service_name: Name of service to deploy
            target_platform: "docker" or "k8s"

        Returns:
            DeploymentResult with status and details

        Raises:
            ValueError: If validation fails
            RuntimeError: If deployment fails
        """
        # Step 1: Business validation
        config = await self.config_mgr.get_service_config(service_name)
        if not config:
            raise ValueError(f"Service '{service_name}' not found")

        if not config.is_deployable:
            raise ValueError(f"Service '{service_name}' is not deployable")

        # Step 2: Choose platform (business logic)
        if target_platform == "docker":
            manager = self.docker_mgr
        elif target_platform == "k8s":
            manager = self.k8s_mgr
        else:
            raise ValueError(f"Unknown platform: {target_platform}")

        # Step 3: Execute with error handling
        try:
            result = await manager.deploy_service(config)

            # Step 4: Update business state
            await self.config_mgr.update_deployment_status(
                service_name, "deployed"
            )

            return result

        except Exception as e:
            # Rollback if needed (business logic)
            await self.config_mgr.update_deployment_status(
                service_name, "failed"
            )
            raise RuntimeError(f"Deployment failed: {e}") from e
```

**Key Points**:
- ✅ Coordinates multiple managers
- ✅ Implements business rules and validation
- ✅ Handles rollbacks/transactions
- ✅ Uses dependency injection
- ❌ No HTTP concerns
- ❌ No direct request parsing

---

## Thin Router Pattern

**Use when**: Creating HTTP API endpoints.

### Example: Clean Router Implementation

```python
from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel
from typing import List, Optional

router = APIRouter(prefix="/api/resources", tags=["resources"])

class ResourceResponse(BaseModel):
    """Response model for resource endpoints."""
    id: str
    name: str
    status: str

class ResourceCreate(BaseModel):
    """Request model for creating resources."""
    name: str
    config: dict = {}

@router.get("/{resource_id}", response_model=ResourceResponse)
async def get_resource(
    resource_id: str,
    service: BusinessService = Depends(get_business_service),
) -> ResourceResponse:
    """
    Get resource by ID.

    Thin adapter:
    1. Parse path parameter (FastAPI does this)
    2. Call service method
    3. Translate domain exception to HTTP exception
    4. Return Pydantic response model
    """
    try:
        resource = await service.get_resource(resource_id)

        if not resource:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Resource {resource_id} not found"
            )

        return ResourceResponse(
            id=resource.id,
            name=resource.name,
            status=resource.status,
        )

    except ValueError as e:
        # Domain validation error → 400 Bad Request
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except RuntimeError as e:
        # Service error → 500 Internal Server Error
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch resource"
        )

@router.post("/", response_model=ResourceResponse, status_code=201)
async def create_resource(
    data: ResourceCreate,
    service: BusinessService = Depends(get_business_service),
) -> ResourceResponse:
    """
    Create new resource.

    Max ~30 lines per endpoint.
    """
    try:
        resource = await service.create_resource(data)

        return ResourceResponse(
            id=resource.id,
            name=resource.name,
            status=resource.status,
        )

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
```

**Router Rules**:
- ✅ Max 30 lines per endpoint
- ✅ Parse request → call service → return response
- ✅ Raise `HTTPException` for errors
- ✅ Use Pydantic models for validation
- ✅ Use `Depends()` for services
- ❌ NO business logic
- ❌ NO direct DB/external API calls
- ❌ NO complex transformations

---

## Dependency Injection Pattern

**Use when**: Sharing state, testing, or managing service lifecycles.

### Example: FastAPI Dependency Injection

```python
from fastapi import Depends
from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import AsyncGenerator

# =============================================================================
# Database Dependency
# =============================================================================

async def get_database() -> AsyncIOMotorDatabase:
    """
    Provide database connection.

    FastAPI will manage the lifecycle.
    """
    from src.config.database import get_db
    return get_db()

# =============================================================================
# Service Dependencies
# =============================================================================

def get_docker_manager() -> DockerManager:
    """Provide DockerManager singleton."""
    # Singleton pattern - reuse same instance
    return DockerManager.instance()

async def get_kubernetes_manager(
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> KubernetesManager:
    """Provide KubernetesManager with database dependency."""
    manager = KubernetesManager(db)
    await manager.initialize()
    return manager

def get_business_service(
    docker_mgr: DockerManager = Depends(get_docker_manager),
    k8s_mgr: KubernetesManager = Depends(get_kubernetes_manager),
) -> BusinessService:
    """Provide BusinessService with all dependencies."""
    return BusinessService(
        docker_mgr=docker_mgr,
        k8s_mgr=k8s_mgr,
    )

# =============================================================================
# Usage in Routers
# =============================================================================

@router.get("/")
async def list_resources(
    service: BusinessService = Depends(get_business_service),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """FastAPI injects dependencies automatically."""
    resources = await service.list_resources()
    return resources
```

**Benefits**:
- Testable (inject mocks)
- Reusable across endpoints
- Clear dependency graph
- Lifecycle management

---

## Error Handling Patterns

### Pattern: Service Returns Data, Router Handles HTTP

```python
# ❌ BAD - Service raises HTTP exception
class MyService:
    async def get_thing(self, id: str):
        thing = await self.store.get(id)
        if not thing:
            raise HTTPException(status_code=404)  # WRONG!
        return thing

# ✅ GOOD - Service returns data/None
class MyService:
    async def get_thing(self, id: str) -> Optional[Thing]:
        """Return None if not found, let router decide HTTP status."""
        return await self.store.get(id)

# Router translates to HTTP
@router.get("/{id}")
async def get_thing(id: str, service: MyService = Depends(get_service)):
    thing = await service.get_thing(id)
    if not thing:
        raise HTTPException(status_code=404, detail=f"Thing {id} not found")
    return thing
```

### Pattern: Domain Exceptions

```python
# Service raises domain exceptions
class MyService:
    async def create_thing(self, data: ThingCreate) -> Thing:
        # Business validation
        if await self._name_exists(data.name):
            raise ValueError(f"Thing '{data.name}' already exists")

        # Resource limits
        if await self._count() >= MAX_THINGS:
            raise RuntimeError("Maximum things limit reached")

        return await self.store.create(data)

# Router maps to HTTP statuses
@router.post("/")
async def create_thing(
    data: ThingCreate,
    service: MyService = Depends(get_service),
):
    try:
        thing = await service.create_thing(data)
        return thing
    except ValueError as e:
        # Validation error → 400
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        # Business rule violation → 409 or 500
        raise HTTPException(status_code=409, detail=str(e))
```

---

## Extract Complex Logic

**When**: Function has >100 lines, >3 nesting levels, or is hard to test.

### Before (BAD - Embedded Logic)

```python
class UNodeManager:
    async def get_join_script(self, token: str) -> str:
        """260 lines of bash script generation embedded here."""
        # Validation
        if not token:
            raise ValueError("Token required")

        # Get config
        config = await self.get_config()

        # Generate script (200+ lines inline)
        script = f"""#!/bin/bash
        set -e

        # ... 200 lines of bash ...
        """

        return script
```

### After (GOOD - Extracted Utility)

```python
# src/utils/bootstrap_scripts.py
class BootstrapScriptGenerator:
    """
    Generates bootstrap scripts for node joining.

    Separated for:
    - Testability (can unit test script generation)
    - Reusability (PowerShell, Bash, etc.)
    - Clarity (focused responsibility)
    """

    def generate_bash(self, config: BootstrapConfig) -> str:
        """Generate bash bootstrap script."""
        return self._render_template("bash_bootstrap.sh.j2", config)

    def generate_powershell(self, config: BootstrapConfig) -> str:
        """Generate PowerShell bootstrap script."""
        return self._render_template("powershell_bootstrap.ps1.j2", config)

    def _render_template(self, template_name: str, config: BootstrapConfig) -> str:
        """Render script from template."""
        # Template rendering logic here
        pass

# In service (now clean):
class UNodeManager:
    def __init__(self):
        self.script_generator = BootstrapScriptGenerator()

    async def get_join_script(self, token: str) -> str:
        """Generate join script. Delegates to utility."""
        # Validation
        if not token:
            raise ValueError("Token required")

        # Get config
        config = await self._build_bootstrap_config(token)

        # Generate (delegated to utility)
        return self.script_generator.generate_bash(config)
```

---

## Shared Utilities

**When**: Logic used by 2+ services, pure function with no state.

### Example: Docker Helpers

```python
# src/utils/docker_helpers.py

def parse_container_name(name: str) -> tuple[str, str]:
    """
    Parse container name into (project, service).

    Pure function - no side effects, easily testable.

    Args:
        name: Container name like "myproject_redis_1"

    Returns:
        Tuple of (project_name, service_name)

    Example:
        >>> parse_container_name("ushadow_redis_1")
        ('ushadow', 'redis')
    """
    parts = name.split("_")
    if len(parts) < 2:
        return ("", name)
    return (parts[0], parts[1])

def is_healthy_status(status: str) -> bool:
    """Check if container status indicates healthy state."""
    return status.lower() in ("running", "healthy", "up")

# Used by multiple services
from src.utils.docker_helpers import parse_container_name, is_healthy_status

class DockerManager:
    async def list_services(self):
        containers = await self.client.list()
        return [
            {
                "project": parse_container_name(c.name)[0],
                "service": parse_container_name(c.name)[1],
                "healthy": is_healthy_status(c.status),
            }
            for c in containers
        ]
```

**Utility Rules**:
- ✅ Pure functions (no state)
- ✅ Max 100 lines per file
- ✅ Well-documented with examples
- ✅ Unit tested
- ❌ No database/API calls
- ❌ No complex state management

---

## Quick Decision Tree

```
Need to create backend code?
│
├─ Interfacing with external system (Docker, K8s, DB)?
│  └─ → Use RESOURCE MANAGER pattern
│
├─ Coordinating multiple managers, business rules?
│  └─ → Use BUSINESS SERVICE pattern
│
├─ Creating HTTP endpoint?
│  └─ → Use THIN ROUTER pattern
│
├─ Logic used by 2+ services, pure function?
│  └─ → Create UTILITY in src/utils/
│
└─ Complex function >100 lines?
   └─ → EXTRACT to method/utility
```

---

## Anti-Patterns to Avoid

### ❌ God Service (Too Many Responsibilities)

```python
# BAD - UNodeManager does too much
class UNodeManager:
    # Node management
    # Encryption
    # Docker operations
    # Kubernetes operations
    # HTTP health probes
    # Script generation
```

**Fix**: Split into focused services via composition.

### ❌ Business Logic in Router

```python
# BAD
@router.post("/deploy")
async def deploy_service(data: DeployData):
    # 50 lines of deployment logic here
    if complex_validation:
        # more logic
    result = await deploy()
    return result
```

**Fix**: Move to service layer.

### ❌ Methods with Too Many Parameters

```python
# BAD
async def create_service(
    name: str,
    image: str,
    ports: list,
    env: dict,
    volumes: dict,
    networks: list,
    labels: dict,
):
    pass
```

**Fix**: Use Pydantic model.

```python
# GOOD
class ServiceCreate(BaseModel):
    name: str
    image: str
    ports: list[int] = []
    env: dict[str, str] = {}
    volumes: dict[str, str] = {}

async def create_service(config: ServiceCreate):
    pass
```

---

## Summary

| Pattern | When to Use | Max Lines |
|---------|-------------|-----------|
| Resource Manager | External systems | 800 |
| Business Service | Orchestration | 800 |
| Thin Router | HTTP endpoints | 500 (30/endpoint) |
| Utility | Pure functions | 300 |
| Extraction | >100 lines or >3 nesting | N/A |

**Remember**: Search first (`grep`, `backend_index.py`), then create.
