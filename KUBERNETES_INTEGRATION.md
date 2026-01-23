# Kubernetes Integration - Implementation Summary

## Overview

Complete Kubernetes integration for ushadow, enabling cluster management, infrastructure scanning, and service deployment preparation. The Kubernetes page focuses on **configuration and readiness**, while actual deployment will be handled by a unified deployment UI.

## Architecture Decision

We chose **Direct K8s Interface** approach:
```
Service Deploy Request
    ↓
Unified Deployment API (future)
    ↓
┌───────────────────────────────┐
│ Target Router                 │
│ - Docker → unode-manager      │
│ - K8s → kubernetes_manager    │ ← Direct K8s API
└───────────────────────────────┘
```

**Benefits:**
- Simpler to implement and debug
- K8s-native features (StatefulSets, Operators, CRDs)
- No extra pod to manage
- Can add unode-manager-in-k8s later if needed

## What Was Implemented

### Backend Components

#### 1. Enhanced `kubernetes_manager.py`
**Location:** `ushadow/backend/src/services/kubernetes_manager.py`

**New Methods:**

##### `ensure_namespace_exists(cluster_id, namespace)`
Ensures a namespace exists in the cluster, creating it if necessary.

- **Automatic creation:** Creates namespace if it doesn't exist
- **Idempotent:** No error if namespace already exists
- **Labels:** Adds `app.kubernetes.io/managed-by: ushadow` label
- **Returns:** True if namespace exists or was created successfully

##### `scan_cluster_for_infra_services(cluster_id, namespace)`
Scans a Kubernetes cluster for existing infrastructure services.

- **Looks for:** mongo, redis, postgres, qdrant, neo4j
- **Returns:** Dict with found status, connection endpoints, and service type
- **Caching:** Results are automatically saved to cluster document
- **Handles:** ClusterIP, NodePort, LoadBalancer service types
- **Builds connection strings:**
  - ClusterIP: `{service}.{namespace}.svc.cluster.local:{port}`
  - NodePort: `<node-ip>:{nodePort}`
  - LoadBalancer: `{lb-ip}:{port}`

##### `update_cluster_infra_scan(cluster_id, namespace, scan_results)`
Updates cached infrastructure scan results for a cluster namespace.

- **Persistence:** Stores scan results in cluster's `infra_scans` field
- **Per-namespace caching:** Results keyed by namespace for multi-namespace support
- **Automatic:** Called automatically by scan endpoint
- **Returns:** True if update successful

```python
results = await k8s_manager.scan_cluster_for_infra_services("cluster-123", "ushadow")
# Returns: {
#   "mongo": {
#     "found": True,
#     "endpoints": ["mongo.ushadow.svc.cluster.local:27017"],
#     "type": "mongo",
#     "default_port": 27017
#   },
#   ...
# }
```

##### `get_or_create_envmap(cluster_id, namespace, service_name, env_vars)`
Creates or updates ConfigMap and Secret for service environment variables.

- **Automatic namespace creation:** Creates namespace if it doesn't exist
- **Automatic separation:** Sensitive data → Secret, non-sensitive → ConfigMap
- **Sensitive patterns:** SECRET, KEY, PASSWORD, TOKEN, PASS, CREDENTIALS
- **Base64 encoding:** Automatic for Secret data
- **Idempotent:** Creates or patches if already exists
- **Returns:** Tuple of (configmap_name, secret_name)

```python
configmap, secret = await k8s_manager.get_or_create_envmap(
    "cluster-123",
    "ushadow",
    "my-service",
    {
        "DATABASE_URL": "postgres://...",  # → ConfigMap
        "API_KEY": "secret-key-123",       # → Secret
    }
)
# Returns: ("my-service-config", "my-service-secrets")
```

#### 2. Enhanced `kubernetes.py` Router
**Location:** `ushadow/backend/src/routers/kubernetes.py`

**New Endpoints:**

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/kubernetes/services/available` | GET | Get all services from compose registry |
| `/api/kubernetes/services/infra` | GET | Get infrastructure services only |
| `/api/kubernetes/{cluster_id}/scan-infra` | POST | Scan cluster for existing infrastructure |
| `/api/kubernetes/{cluster_id}/envmap` | POST | Create/update ConfigMaps and Secrets |
| `/api/kubernetes/{cluster_id}/deploy` | POST | Deploy a service to cluster |

**Request/Response Models:**
```python
class ScanInfraRequest(BaseModel):
    namespace: str = "ushadow"

class CreateEnvmapRequest(BaseModel):
    service_name: str
    namespace: str = "ushadow"
    env_vars: Dict[str, str]

class DeployServiceRequest(BaseModel):
    service_id: str
    namespace: str = "ushadow"
    k8s_spec: Optional[KubernetesDeploymentSpec] = None
```

#### 3. Fixed `deployment_manager.py`
**Location:** `ushadow/backend/src/services/deployment_manager.py`

**Issue:** MongoDB index conflict when upgrading from old version
**Solution:** Graceful handling of IndexKeySpecsConflict errors

```python
# Detects conflicting index specs
# Drops old index
# Creates new index
# Continues initialization
```

### Frontend Components

#### 4. Enhanced `KubernetesClustersPage.tsx`
**Location:** `ushadow/frontend/src/pages/KubernetesClustersPage.tsx`

**New Features:**

##### Infrastructure Scanning
- **"Scan Infrastructure" button** on each cluster card
- **Disabled** when cluster status is not "connected"
- **Loading state** with spinner during scan
- **Results modal** showing found/not-found services
- **Connection endpoints** displayed for discovered infrastructure
- **Persistent results** stored per cluster

##### UI Improvements
- Changed default namespace to `ushadow` (recommended)
- Infrastructure status badge on cluster cards
- View scan results button for rescanned clusters
- Beautiful scan results modal with color-coded services
- Help text explaining next steps

**Test IDs:**
- `kubernetes-page`
- `scan-infra-{clusterId}`
- `view-scan-results-{clusterId}`
- `infra-scan-results-modal`
- `close-scan-results`
- `remove-cluster-{clusterId}`

#### 5. Enhanced `api.ts`
**Location:** `ushadow/frontend/src/services/api.ts`

**New API Methods:**
```typescript
export const kubernetesApi = {
  // Existing methods
  addCluster, listClusters, getCluster, removeCluster,

  // New methods
  getAvailableServices: () => api.get('/api/kubernetes/services/available'),
  getInfraServices: () => api.get('/api/kubernetes/services/infra'),
  scanInfraServices: (clusterId, namespace = 'ushadow') =>
    api.post(`/api/kubernetes/${clusterId}/scan-infra`, { namespace }),
  createEnvmap: (clusterId, data) =>
    api.post(`/api/kubernetes/${clusterId}/envmap`, data),
  deployService: (clusterId, data) =>
    api.post(`/api/kubernetes/${clusterId}/deploy`, data),
}
```

### Deployment Tools

#### 6. `deploy.sh` Script
**Location:** `./deploy.sh`

**Features:**
- Automated kompose conversion of Docker Compose → K8s manifests
- Handles infrastructure and application services separately
- Generates ConfigMaps, Secrets, Deployments, Services
- Creates production-ready examples and tweaking guides
- Colorized output with progress indicators

**Usage:**
```bash
./deploy.sh

# Generates:
# k8s/
# ├── namespace.yaml
# ├── configmap.yaml
# ├── secret.yaml
# ├── kustomization.yaml
# ├── infra/           # MongoDB, Redis, Qdrant, Postgres
# ├── base/            # Backend, Frontend
# └── tweaks/          # Production examples and guides
```

#### 7. `scripts/k8s-helpers.sh`
**Location:** `./scripts/k8s-helpers.sh`

**Helper Commands:**
```bash
./scripts/k8s-helpers.sh deploy-infra      # Deploy infrastructure only
./scripts/k8s-helpers.sh deploy-app        # Deploy application only
./scripts/k8s-helpers.sh deploy-all        # Deploy everything
./scripts/k8s-helpers.sh status            # Get cluster status
./scripts/k8s-helpers.sh logs <service>    # Tail service logs
./scripts/k8s-helpers.sh restart <service> # Restart a service
./scripts/k8s-helpers.sh scale <svc> <n>   # Scale replicas
./scripts/k8s-helpers.sh port-forward <svc> <port> # Local access
./scripts/k8s-helpers.sh exec <svc> <cmd>  # Run command in pod
```

## User Workflow

### 1. Add Cluster
```
1. Click "Add Cluster"
2. Upload kubeconfig or paste YAML
3. Specify cluster name and namespace (default: ushadow)
4. System validates connectivity
5. Cluster appears in list with status
```

### 2. Scan Infrastructure
```
1. Click "Scan Infrastructure" on cluster card
2. System scans namespace for infrastructure services
3. Results modal shows:
   - Found services (with connection endpoints)
   - Not found services
   - Next steps guidance
4. Results persist and show badge on cluster card
```

### 3. Use or Deploy Decision
After scanning, you can:
- **Use existing infrastructure:** Configure services to point to discovered endpoints
- **Deploy new infrastructure:** Use unified deployment UI (to be built)

## Configuration & Setup

### Prerequisites
```bash
# macOS
brew install kompose

# Linux
curl -L https://github.com/kubernetes/kompose/releases/download/v1.34.0/kompose-linux-amd64 -o kompose
chmod +x kompose
sudo mv kompose /usr/local/bin/

# Windows
choco install kubernetes-kompose
```

### Backend Dependencies
Already included in `pyproject.toml`:
```toml
dependencies = [
    "kubernetes>=31.0.0",
    ...
]
```

Install with:
```bash
cd ushadow/backend
uv sync
```

### Generate Manifests
```bash
./deploy.sh
```

### Deploy to Kubernetes
```bash
# Using kustomize (recommended)
kubectl apply -k k8s/

# Or step-by-step
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/infra/
kubectl apply -f k8s/base/
```

## API Examples

### Scan Cluster for Infrastructure
```bash
curl -X POST http://localhost:8000/api/kubernetes/{cluster_id}/scan-infra \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"namespace": "ushadow"}'
```

**Response:**
```json
{
  "cluster_id": "abc123",
  "namespace": "ushadow",
  "infra_services": {
    "mongo": {
      "found": true,
      "endpoints": ["mongo.ushadow.svc.cluster.local:27017"],
      "type": "mongo",
      "default_port": 27017
    },
    "redis": {
      "found": true,
      "endpoints": ["redis.ushadow.svc.cluster.local:6379"],
      "type": "redis",
      "default_port": 6379
    },
    "postgres": {
      "found": false,
      "endpoints": [],
      "type": "postgres",
      "default_port": 5432
    }
  }
}
```

### Create Environment Map
```bash
curl -X POST http://localhost:8000/api/kubernetes/{cluster_id}/envmap \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "service_name": "my-service",
    "namespace": "ushadow",
    "env_vars": {
      "DATABASE_URL": "postgres://...",
      "API_KEY": "secret-key-123"
    }
  }'
```

**Response:**
```json
{
  "success": true,
  "configmap": "my-service-config",
  "secret": "my-service-secrets",
  "namespace": "ushadow"
}
```

### Deploy Service
```bash
curl -X POST http://localhost:8000/api/kubernetes/{cluster_id}/deploy \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "service_id": "parakeet-compose:parakeet",
    "namespace": "ushadow"
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Deployed to ushadow/parakeet",
  "service_id": "parakeet-compose:parakeet",
  "namespace": "ushadow"
}
```

## Next Steps

### Unified Deployment UI (To Be Implemented)
The Kubernetes integration is ready for the unified deployment UI, which will:

1. **Select Deployment Target:** Docker or Kubernetes
2. **Choose Service:** From compose registry
3. **Configure Environment:** Map env vars to settings or K8s discovered services
4. **Deploy:** Execute deployment with progress tracking

**Separation of Concerns:**
- **Kubernetes Page:** Cluster configuration, infrastructure readiness
- **Deployment UI:** Unified interface for deploying to Docker or K8s

## Troubleshooting

### Index Conflict Error
**Error:** `IndexKeySpecsConflict: An existing index has the same name as the requested index`

**Solution:** Fixed in `deployment_manager.py` - automatically drops and recreates conflicting indexes.

### Kubernetes Package Not Found
**Error:** `ModuleNotFoundError: No module named 'kubernetes'`

**Solution:**
```bash
cd ushadow/backend
uv sync
```

### Kompose Not Found
**Solution:**
```bash
brew install kompose  # macOS
# or see Prerequisites section above
```

### Cluster Connection Failed
**Check:**
1. Kubeconfig is valid: `kubectl cluster-info`
2. Network connectivity to cluster
3. Correct namespace exists: `kubectl get namespaces`
4. RBAC permissions for service account

## Files Created/Modified

### Created
- ✅ `deploy.sh` - Kompose conversion script
- ✅ `scripts/k8s-helpers.sh` - K8s helper commands
- ✅ `KUBERNETES.md` - Kubernetes documentation
- ✅ `KUBERNETES_INTEGRATION.md` - This file

### Modified Backend
- ✅ `ushadow/backend/src/services/kubernetes_manager.py` - Added scanning and envmap methods
- ✅ `ushadow/backend/src/routers/kubernetes.py` - Added new API endpoints
- ✅ `ushadow/backend/src/services/deployment_manager.py` - Fixed index conflict

### Modified Frontend
- ✅ `ushadow/frontend/src/pages/KubernetesClustersPage.tsx` - Added scanning UI
- ✅ `ushadow/frontend/src/services/api.ts` - Added new API methods

## Testing

### Manual Testing Checklist
- [ ] Add a Kubernetes cluster via UI
- [ ] Scan infrastructure on connected cluster
- [ ] View scan results modal
- [ ] Verify found services show connection endpoints
- [ ] Remove cluster and verify scan results are cleared
- [ ] Generate manifests with `./deploy.sh`
- [ ] Deploy infrastructure to K8s cluster
- [ ] Rescan and verify services are found

### API Testing
```bash
# Test scan endpoint
curl -X POST http://localhost:8000/api/kubernetes/{cluster_id}/scan-infra \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"namespace": "ushadow"}'

# Test envmap endpoint
curl -X POST http://localhost:8000/api/kubernetes/{cluster_id}/envmap \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "service_name": "test",
    "namespace": "ushadow",
    "env_vars": {"TEST_VAR": "value"}
  }'
```

## Recent Fixes and Improvements

### Label Sanitization (Issue #2)
**Problem:** Kubernetes labels must match regex `(([A-Za-z0-9][-A-Za-z0-9_.]*)?[A-Za-z0-9])?` - colons are invalid.
Service IDs like `openmemory-compose:mem0-ui` were causing deployment failures.

**Solution:**
- Added label sanitization in `compile_service_to_k8s()`
- Converts `service_id` to `safe_service_id` by replacing `:` and `/` with `-`
- Example: `openmemory-compose:mem0-ui` → `openmemory-compose-mem0-ui`

### Infrastructure Scan Caching (Issue #1)
**Problem:** Infrastructure scan results weren't retained, requiring re-scanning each time.

**Solution:**
- Added `infra_scans` field to `KubernetesCluster` model
- Results cached per namespace: `infra_scans: {namespace: scan_results}`
- Scan endpoint now persists results automatically via `update_cluster_infra_scan()`
- Frontend can retrieve cached results from cluster document

### Automatic Namespace Creation
**Enhancement:** Both `get_or_create_envmap()` and `deploy_to_kubernetes()` now automatically create namespaces if they don't exist.

### Port Parsing Robustness
**Fix:** Added defensive handling for None/invalid port values to prevent deployment errors.

### Image Variable Resolution (Issue #3)
**Problem:** Docker Compose image names with environment variables like `${VAR:-default}` weren't being resolved, causing K8s deployment failures.

**Solution:**
- Added `_resolve_image_variables()` method to resolve Docker Compose variable syntax
- Handles `${VAR}`, `${VAR:-default}`, and `${VAR-default}` patterns
- Looks up variables in: environment dict → OS environment → default value
- Example: `ghcr.io/ushadow-io/u-mem0-ui:${OPENMEMORY_IMAGE_TAG:-latest}` → `ghcr.io/ushadow-io/u-mem0-ui:latest`

### Manifest Storage and Debugging
**Enhancement:** Generated K8s manifests are now saved for debugging.

**Features:**
- Manifests saved to `/tmp/k8s-manifests/{cluster_id}/{namespace}/`
- Each manifest saved as YAML: `{service-name}-{manifest-type}.yaml`
- Logged at INFO level for tracking
- Logged at DEBUG level with full YAML content
- Helps troubleshooting deployment issues

**Location:** Inside backend container at `/tmp/k8s-manifests/`

### Port Parsing Fix (Issue #4)
**Problem:** UI containers were getting default port 8000 instead of their actual container port (e.g., 3000).

**Root Cause:** Key mismatch - compose parser returns ports as `{"host": "3002", "container": "3000"}` but kubernetes deployment code was looking for `{"published": ..., "target": ...}`.

**Solution:**
- Updated port extraction in kubernetes router to check both key formats
- Now correctly extracts container port from parsed compose data
- Example: `"${OPENMEMORY_UI_PORT:-3002}:3000"` → correctly parsed as container port 3000

### Health Check Configuration (Issue #5)
**Problem:** Liveness/readiness probes were hardcoded to `/health` endpoint, causing failures for frontend apps that don't have health endpoints.

**Solution:**
- Added `health_check_path` field to `KubernetesDeploymentSpec`
- Health checks are now **disabled by default** (`health_check_path = None`)
- Can be enabled by setting `health_check_path` in deployment spec
- Example: Set `health_check_path = "/health"` for backend services that support it

**Default Behavior:**
- Frontend apps: No health checks (default)
- Backend apps: Can enable via deployment UI or API

### Port Variable Resolution (Issue #6)
**Problem:** Port definitions with variables like `${OPENMEMORY_UI_PORT:-3002}:3000` weren't being resolved, causing parsing errors: `invalid literal for int() with base 10: '-3002}:3000'`

**Solution:**
- Added `resolve_port_var()` helper function in kubernetes router
- Resolves variables in port strings before passing to kubernetes_manager
- Lookup order: service env_config → OS environment → default value
- Example: `${OPENMEMORY_UI_PORT:-3002}:3000` → `3002:3000` → container port 3000

### Enhanced Deployment Logging (Issue #7)
**Problem:** Deployments returning 200 OK but unclear what resources were created or if deployment actually succeeded.

**Solution:**
- Added detailed logging at deployment start showing service name, image, and ports
- Enhanced success message to list all created resources
- Added detailed error logging with response body and stack traces
- Manifests saved to `/tmp/k8s-manifests/{cluster_id}/{namespace}/` for inspection

**Log Examples:**
```
Starting deployment of mem0-ui to cluster abc123, namespace ushadow
Service definition: image=ghcr.io/ushadow-io/u-mem0-ui:latest, ports=['3000']
Successfully deployed mem0-ui to ushadow. Resources: ConfigMap/mem0-ui-config, Deployment/mem0-ui, Service/mem0-ui
```

### Catch-All Exception Handler (Issue #8)
**Problem:** 500 errors weren't showing actual error details in logs - only "Internal Server Error" with no stack trace or error message.

**Root Cause:** Exception handlers only caught specific types (database, network, HTTP exceptions) but not general Python exceptions.

**Solution:**
- Added catch-all `@app.exception_handler(Exception)` to middleware
- Logs full error message and stack trace for all unhandled exceptions
- Returns structured JSON response with error details
- Example response:
  ```json
  {
    "detail": "invalid literal for int() with base 10: '-3002}:3000'",
    "error_type": "ValueError",
    "error_category": "internal_error"
  }
  ```

**Log Example:**
```
ERROR: Unhandled exception in POST /api/kubernetes/abc123/deploy: ValueError: invalid literal for int() with base 10: '-3002}:3000'
ERROR: Stack trace:
Traceback (most recent call last):
  ...full stack trace...
```

### Multiple Ports Support (Issue #9)
**Problem:** Services with multiple ports caused deployment failure: `Duplicate value: "http"` in port names.

**Root Cause:** All container ports were being named "http", violating Kubernetes' requirement for unique port names within a container.

**Solution:**
- Refactored port parsing to support multiple ports
- Generate unique port names: `http`, `http-2`, `http-3`, etc.
- Create Service ports for each container port
- Each port gets a unique name and correct targetPort mapping

**Example:**
```yaml
# Service with multiple ports
ports:
  - name: http          # Port 3000
    containerPort: 3000
  - name: http-2        # Port 8080
    containerPort: 8080
```

**Kubernetes Service:**
```yaml
ports:
  - port: 3000
    targetPort: http
    name: http
  - port: 8080
    targetPort: http-2
    name: http-2
```

## Production Recommendations

Before deploying to production:

1. **Review generated manifests** in `k8s/tweaks/README.md`
2. **Convert databases to StatefulSets** (see examples in `k8s/tweaks/`)
3. **Add PersistentVolumeClaims** for data persistence
4. **Configure Ingress** for external access
5. **Set resource limits** (CPU/memory) on all pods
6. **Add NetworkPolicies** for security
7. **Use external secret management** (Sealed Secrets, External Secrets Operator)
8. **Set up monitoring and alerting** (Prometheus, Grafana)

## Additional Resources

- [Kompose Documentation](https://kompose.io/)
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Kubernetes Python Client](https://github.com/kubernetes-client/python)
- [Kustomize Documentation](https://kustomize.io/)
