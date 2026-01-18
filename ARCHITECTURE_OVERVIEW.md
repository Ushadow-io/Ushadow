# Architecture Overview: Services vs Instances vs Deployments

## Core Concepts

### 1. **Service** (Services Page)
**Model**: Managed by `DockerManager.MANAGEABLE_SERVICES` (dynamically built from compose registry)
**Location**: `ushadow/backend/src/services/docker_manager.py`

- Represents a **Docker Compose service** that can be started/stopped
- Lives in docker-compose files (e.g., `compose/openmemory-compose.yaml`)
- Discovered and registered automatically by `ComposeServiceRegistry`
- **Single instance per service** - only one copy can run at a time
- Start/stop controls the actual Docker container directly
- Has port conflict checking with user dialog for port overrides
- Port overrides saved to: `services.{service_name}.ports.{ENV_VAR}`

**UI**: Services Page (`ushadow/frontend/src/pages/ServicesPage.tsx`)
- Shows cards with Start/Stop buttons
- Port conflict flow: preflight check → dialog → port override → retry

**APIs**:
- `POST /api/services/{name}/start` - Start service
- `POST /api/services/{name}/stop` - Stop service
- `GET /api/services/{name}/preflight` - Check for port conflicts
- `POST /api/services/{name}/port-override` - Set port override

**Hook**: `useServiceStart` from `ushadow/frontend/src/hooks/useServiceStart.ts`

---

### 2. **Instance** (Instances Page)
**Model**: `Instance` in `ushadow/backend/src/models/instance.py`
**Manager**: `InstanceManager` in `ushadow/backend/src/services/instance_manager.py`

- Represents a **template + configuration + deployment target**
- Can have **multiple instances** of the same template (e.g., openai-1, openai-2)
- Has lifecycle: PENDING → DEPLOYING → RUNNING → STOPPED → ERROR
- Can be deployed to:
  - Local Docker (deployment_target=None)
  - Remote unode (deployment_target=hostname)
  - Cloud provider (deployment_target="cloud", status="n/a")

**Deployment Types**:
- **Local Docker**: Uses `ServiceOrchestrator` (compose services) or direct Docker
- **Remote unode**: Creates a `Deployment` record, uses `DeploymentManager`
- **Cloud**: No actual deployment, just config storage

**Port Handling**:
- For LOCAL deployments via orchestrator: Has port conflict checking code in `instance_manager.py:551-563`
- For REMOTE deployments: No port conflict checking (just added in `deployment_manager.py:512-547`)
- **Problem**: No user dialog, just logs + auto-remap

**UI**: Instances Page (`ushadow/frontend/src/pages/InstancesPage.tsx`)
- Shows cards with Start/Stop buttons (similar to services)
- Start button calls `handleDeployInstance()`
- Stop button calls `handleUndeployInstance()`
- **No port conflict dialog** - just fails or auto-remaps silently

**APIs**:
- `POST /api/instances` - Create instance
- `POST /api/instances/{id}/deploy` - Deploy/start instance
- `POST /api/instances/{id}/undeploy` - Stop instance
- `DELETE /api/instances/{id}` - Delete instance

---

### 3. **Deployment** (Database Record)
**Model**: `Deployment` in `ushadow/backend/src/models/deployment.py`
**Manager**: `DeploymentManager` in `ushadow/backend/src/services/deployment_manager.py`

- Represents a **service deployed to a specific unode**
- Lower-level runtime record tracking container state
- Created when an instance is deployed to a remote unode
- Stores: container_id, container_name, status, access_url, exposed_port
- Has relationship to Instance: `Instance.deployment_id` → `Deployment.id`
- Also has `Deployment.instance_id` → `Instance.id` (bidirectional)

**Backends**:
- `DockerDeploymentBackend` - Deploys to Docker hosts
- `KubernetesDeploymentBackend` - Deploys to K8s clusters

**Not visible in UI** - only used internally for tracking remote deployments

---

## Current Problems

### 1. **Duplicate Port Conflict Logic**
- Services page: Full preflight + dialog + port override flow
- Instances page (local): Port conflict check + auto-remap to settings (no dialog)
- Instances page (remote): Port conflict check + auto-remap to resolved_service.ports (no dialog)
- **Different implementations** in 3 places!

### 2. **No User Confirmation for Instances**
Services ask user: "Port 8765 is in use, switch to 8766?"
Instances: Just auto-remap (or fail silently before my changes)

### 3. **Port Override Storage Inconsistency**
- Services: `services.{name}.ports.{ENV_VAR}` (service-level, shared)
- Instances (local): Also `services.{name}.ports.{ENV_VAR}` (conflicts with other instances!)
- Instances (remote): Only in `resolved_service.ports` (temporary, not persisted)

### 4. **Instance Config Not Used for Ports**
Instances have a `config` field but ports aren't stored there per-instance

---

## Proposed Unified Architecture

### Goal: Reuse `useServiceStart` Pattern for Instances

### Backend Changes

#### 1. Add Preflight Check for Instances
```python
# /api/instances/{id}/preflight
# Returns same format as services preflight
{
  "can_start": false,
  "port_conflicts": [
    {
      "port": 8765,
      "env_var": "MEM0_PORT",
      "used_by": "Docker: mem0-abc123",
      "suggested_port": 8766
    }
  ]
}
```

#### 2. Add Port Override for Instances
```python
# /api/instances/{id}/port-override
# Sets port in instance.config (per-instance, not service-level)
instance.config.values["MEM0_PORT"] = 8766
save_instances()
```

#### 3. Update Deploy Flow
```python
async def deploy_instance(instance_id):
    # 1. Check ports using existing check_port_conflicts()
    conflicts = docker_mgr.check_port_conflicts(service_name)

    # 2. If conflicts, return 409 with conflict info
    # (Let frontend handle it)

    # 3. Apply instance.config port overrides to env vars
    # before starting container
```

### Frontend Changes

#### 1. Create `useInstanceDeploy` Hook
Similar to `useServiceStart` but for instances:
```typescript
export function useInstanceDeploy(
  onSuccess?: (instanceId: string) => void,
  onError?: (instanceId: string) => void
) {
  // Call preflight check
  // Show port conflict dialog if needed
  // Call port override API
  // Retry deploy
}
```

#### 2. Update InstancesPage
```typescript
// Replace handleDeployInstance with:
const instanceDeploy = useInstanceDeploy(...)
onClick={() => instanceDeploy.startInstance(instance.id)}

// Render port conflict dialog
<PortConflictDialog
  isOpen={instanceDeploy.portConflictDialog.isOpen}
  conflicts={instanceDeploy.portConflictDialog.conflicts}
  onResolve={instanceDeploy.resolvePortConflict}
  onDismiss={instanceDeploy.dismissPortConflict}
/>
```

---

## Code Reuse Plan

### ✅ Already Shared
- `check_port_conflicts()` in `docker_manager.py`
- `PortConflictDialog` component (can reuse for instances)

### ❌ Currently Duplicated
- Port conflict checking logic (3 implementations)
- Preflight check flow (services only)
- Port override storage (inconsistent)

### 🎯 Should Be Shared
- Preflight check pattern (services + instances)
- Port conflict resolution dialog (same UI)
- Port override API pattern (adapt for instance config)

---

## Next Steps

1. **Add instance preflight endpoint** (`/api/instances/{id}/preflight`)
2. **Add instance port override endpoint** (`/api/instances/{id}/port-override`)
3. **Remove auto-remap logic** from deployment_manager.py (let frontend handle)
4. **Create useInstanceDeploy hook** (mirror useServiceStart)
5. **Add PortConflictDialog to InstancesPage**
6. **Store port overrides in instance.config** (not service-level settings)

This unifies the UX while respecting the difference that instances are per-config vs services are singleton.
