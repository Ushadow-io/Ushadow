# Deployment Platform Refactoring

## Summary

Refactored the deployment architecture to properly separate **data** (DeployTarget) from **implementation** (DeployPlatform), eliminating the confusion between backends and targets.

## Key Changes

### 1. Terminology Update

**Before**:
- `DeploymentBackend` - Confusing name (backend vs target)
- `get_deployment_backend(unode, k8s_manager)` - Takes UNode as parameter

**After**:
- `DeployPlatform` - Clear distinction (platform = implementation type)
- `DeployTarget` - New model representing specific deployment destination
- `get_deploy_platform(target)` - Takes DeployTarget as parameter

### 2. New Model: DeployTarget

**Location**: `src/models/deploy_target.py`

**Purpose**: Represents a SPECIFIC deployment destination (the "WHERE")

```python
class DeployTarget(BaseModel):
    id: str  # "anubis.k8s.purple"
    type: Literal["docker", "k8s"]
    metadata: Dict[str, Any]  # UNode or KubernetesCluster data

    @classmethod
    async def from_id(cls, target_id: str) -> "DeployTarget":
        """Factory to create DeployTarget from ID string."""
```

**Benefits**:
- Clear data model (Pydantic)
- Can be cached
- Contains all target information in one place
- Works with existing `deployment_target_id` format

### 3. Refactored Platform Classes

**Location**: `src/services/deployment_platforms.py` (renamed from `deployment_backends.py`)

**Changes**:
```python
# BEFORE
class DeploymentBackend(ABC):
    async def deploy(self, unode: UNode, resolved_service, deployment_id):
        pass

# AFTER
class DeployPlatform(ABC):
    async def deploy(self, target: DeployTarget, resolved_service, deployment_id):
        pass

    async def get_infrastructure(self, target: DeployTarget):
        """NEW: Get infrastructure scan (K8s only)"""
        pass
```

**Implementations**:
- `DockerDeployPlatform` - For local/remote Docker hosts
- `KubernetesDeployPlatform` - For K8s clusters

**Key Improvement**: Platforms are now **stateless** and operate on DeployTarget instances

### 4. Updated Factory Function

**Before**:
```python
def get_deployment_backend(unode: UNode, k8s_manager) -> DeploymentBackend:
    if unode.type == UNodeType.KUBERNETES:
        return KubernetesDeploymentBackend(k8s_manager)
    else:
        return DockerDeploymentBackend()
```

**After**:
```python
def get_deploy_platform(target: DeployTarget, k8s_manager=None) -> DeployPlatform:
    if target.type == "k8s":
        if not k8s_manager:
            k8s_manager = get_kubernetes_manager()
        return KubernetesDeployPlatform(k8s_manager)
    else:
        return DockerDeployPlatform()
```

### 5. Updated DeploymentManager

**Before**:
```python
# Get UNode
unode = await unode_manager.get_unode(hostname)

# Get backend (passing unode each time)
backend = get_deployment_backend(unode, k8s_manager)

# Deploy (unode passed again)
deployment = await backend.deploy(unode=unode, resolved_service, deployment_id)
```

**After**:
```python
# Get UNode
unode = await unode_manager.get_unode(hostname)

# Create target from unode
target = DeployTarget(
    id=unode.deployment_target_id,
    type="k8s" if unode.type == UNodeType.KUBERNETES else "docker",
    metadata=unode.model_dump()
)

# Get platform for this target type
platform = get_deploy_platform(target)

# Deploy (target passed once, contains all info)
deployment = await platform.deploy(target=target, resolved_service, deployment_id)
```

**Updated in 4 locations**:
1. `deploy_to_unode()` - Main deployment method
2. `stop_deployment()` - Stop running deployment
3. `remove_deployment()` - Remove deployment completely
4. `get_deployment_logs()` - Fetch logs

## Architecture Benefits

### Clear Separation of Concerns

```
┌──────────────────────────────────────────┐
│           DeployTarget (Data)            │
│                                          │
│  • id: "anubis.k8s.purple"              │
│  • type: "k8s"                          │
│  • metadata: {...}                       │
│                                          │
│  This is the "WHERE"                     │
└──────────────────────────────────────────┘
                   ↓
┌──────────────────────────────────────────┐
│      DeployPlatform (Implementation)     │
│                                          │
│  • DockerDeployPlatform                 │
│  • KubernetesDeployPlatform             │
│                                          │
│  This is the "HOW"                       │
└──────────────────────────────────────────┘
```

### Consistency with Existing Patterns

This pattern matches how other parts of the codebase work:
- **Settings API**: `SettingsStore` (data) vs `Settings` (implementation)
- **Models**: `UNode` (data) vs `UNodeManager` (operations)
- **Compose**: `DiscoveredService` (data) vs `ComposeRegistry` (operations)

### Benefits

1. **Clearer Naming**: "Platform" clearly means implementation type, not instance
2. **Stateless Platforms**: Can be singletons, no per-target state
3. **Data/Behavior Separation**: DeployTarget = data, DeployPlatform = behavior
4. **Testability**: Easy to mock targets and platforms separately
5. **Caching**: Can cache DeployTarget instances
6. **Future-Proof**: Easy to add new platform types (ECS, Azure, etc.)

## Migration Path

### For New Code

```python
# Create target
target = await DeployTarget.from_id("anubis.k8s.purple")

# Get platform
platform = get_deploy_platform(target)

# Use platform
deployment = await platform.deploy(target, resolved_service, deployment_id)
infrastructure = await platform.get_infrastructure(target)
```

### For Existing Code with UNode

```python
# If you already have a UNode object
unode = await unode_manager.get_unode(hostname)

# Create target from unode
target = DeployTarget(
    id=unode.deployment_target_id,
    type="k8s" if unode.type == UNodeType.KUBERNETES else "docker",
    metadata=unode.model_dump()
)

# Then use as above
platform = get_deploy_platform(target)
```

## Files Changed

### New Files
- `src/models/deploy_target.py` - New DeployTarget model

### Renamed Files
- `src/services/deployment_backends.py` → `src/services/deployment_platforms.py`

### Modified Files
- `src/services/deployment_manager.py` - Updated to use DeployTarget + DeployPlatform
- `src/routers/deployments.py` - Updated imports (will need further updates for unified endpoint)

### Files Using Old Pattern (TODO)
- Other files importing `deployment_backends` will need updates when they're modified

## Next Steps

1. **Update `/api/deployments/prepare` endpoint** - Use DeployTarget.from_id()
2. **Add convenience methods to DeployTarget** - Optional: target.deploy(), target.get_infrastructure()
3. **Update frontend** - Use unified `/api/deployments/prepare` endpoint
4. **Add caching** - Cache DeployTarget instances by ID
5. **Documentation** - Update architecture diagrams

## Backward Compatibility

- UNode and KubernetesCluster models unchanged
- `deployment_target_id` computed field still works
- Deployment records still reference `unode_hostname`
- No database migrations needed

## Testing Notes

- Backend starts successfully without errors
- All existing deployments continue to work
- Platform methods signature change is internal only
- Frontend API unchanged (uses same deployment endpoints)
