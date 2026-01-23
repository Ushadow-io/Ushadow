# Ushadow Deployment Architecture

## Overview

Ushadow's deployment architecture enables running services across multiple target types (local Docker, remote unodes, Kubernetes clusters) with unified configuration management and variable resolution.

```
┌─────────────────────────────────────────────────────────────────────┐
│                      DEPLOYMENT ARCHITECTURE                         │
└─────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│                        USER INTERACTION LAYER                         │
│                                                                       │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐     │
│  │ Frontend UI  │──────│  API Routes  │──────│   Settings   │     │
│  │ (Service     │      │ /deployments │      │   API v2     │     │
│  │  Config      │      │ /services    │      │              │     │
│  │  Page)       │      │ /configs     │      │              │     │
│  └──────────────┘      └──────────────┘      └──────────────┘     │
└──────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                       ORCHESTRATION LAYER                             │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              ServiceConfigManager                             │  │
│  │  • Manages ServiceConfig instances (Template + Config +      │  │
│  │    Deployment Target)                                         │  │
│  │  • Stores configs in config/service_configs.yaml             │  │
│  │  • Handles wiring between service capabilities               │  │
│  │  • Stores wiring in config/wiring.yaml                       │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                   │                                   │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              DeploymentManager                                │  │
│  │  • Orchestrates service deployments across all targets       │  │
│  │  • Resolves services using Settings API                      │  │
│  │  • Selects appropriate deployment backend                    │  │
│  │  • Tracks deployment status in MongoDB                       │  │
│  └──────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                      RESOLUTION LAYER                                 │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │   resolve_service_for_deployment(service_id, deploy_target)  │  │
│  │                                                               │  │
│  │   1. Get service from ComposeRegistry                        │  │
│  │   2. Use Settings API to resolve env vars:                   │  │
│  │      • settings.for_deployment(config_id)     [6 layers]     │  │
│  │      • settings.for_deploy_config(target, id) [5 layers]     │  │
│  │      • settings.for_service(service_id)       [4 layers]     │  │
│  │   3. Run `docker-compose config` to resolve ${VAR} syntax   │  │
│  │   4. Return ResolvedServiceDefinition                        │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                       │
│         Settings Resolution Hierarchy (6 layers):                    │
│         ┌──────────────────────────────────────────┐               │
│         │ 6. USER_OVERRIDE (from ServiceConfig)   │ ◄── Highest   │
│         │ 5. DEPLOY_ENV (environment-specific)    │               │
│         │ 4. CAPABILITY (wired providers)         │               │
│         │ 3. ENV_FILE (os.environ)                │               │
│         │ 2. COMPOSE_DEFAULT (compose file)       │               │
│         │ 1. CONFIG_DEFAULT (config.defaults.yaml)│ ◄── Lowest    │
│         └──────────────────────────────────────────┘               │
└──────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                      DEPLOYMENT BACKEND LAYER                         │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │         DeploymentBackend (Abstract Interface)             │    │
│  │  • deploy(unode, resolved_service, deployment_id)          │    │
│  │  • get_status(unode, deployment)                           │    │
│  │  • stop(unode, deployment)                                 │    │
│  │  • remove(unode, deployment)                               │    │
│  │  • get_logs(unode, deployment)                             │    │
│  └────────────────────────────────────────────────────────────┘    │
│                           │                                          │
│          ┌────────────────┴────────────────┐                        │
│          ▼                                  ▼                        │
│  ┌──────────────────┐            ┌──────────────────┐              │
│  │ Docker Backend   │            │  K8s Backend     │              │
│  │ (Docker hosts)   │            │ (K8s clusters)   │              │
│  └──────────────────┘            └──────────────────┘              │
│          │                                  │                        │
│          │                                  │                        │
│    ┌─────┴─────┐                    ┌─────┴─────┐                 │
│    │           │                    │           │                 │
│    ▼           ▼                    ▼           ▼                 │
│  Local      Remote              Generate    Deploy to            │
│  Docker     UNode               K8s YAML    Cluster              │
│  (direct)   Manager API         Manifests                        │
└──────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                      DEPLOYMENT TARGETS                               │
│                                                                       │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐    │
│  │  Local Docker   │  │  Remote UNode   │  │  K8s Cluster    │    │
│  │                 │  │                 │  │                 │    │
│  │  • Same host    │  │  • Via          │  │  • K8s API      │    │
│  │    as backend   │  │    Tailscale    │  │  • Kubeconfig   │    │
│  │  • Direct       │  │  • UNode        │  │  • Namespace    │    │
│  │    Docker API   │  │    Manager      │  │    isolation    │    │
│  │                 │  │    :8444        │  │                 │    │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘    │
│                                                                       │
│  Unified Identifier Format:                                          │
│  {identifier}.{type}.{environment}                                   │
│                                                                       │
│  Examples:                                                            │
│  • ushadow-purple.unode.purple (local leader unode)                 │
│  • worker-01.unode.purple (remote worker unode)                     │
│  • production-cluster.k8s.purple (k8s cluster)                      │
└──────────────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. ServiceConfig Model

**Location**: `src/models/service_config.py`

**Purpose**: Represents a configured instance of a service with deployment information.

```python
ServiceConfig = Template + Config Values + Deployment Target
```

**Key Concepts**:

- **Template**: The "shape" of a service discovered from compose/*.yaml or providers/*.yaml
  - Defines what it `requires` (capabilities like 'llm', 'memory')
  - Defines what it `provides` (e.g., 'memory' capability)
  - Contains `config_schema` for configurable fields

- **ServiceConfig (Instance)**: Template with configuration applied
  - Unique ID (e.g., "openmemory-prod")
  - Config values (API keys, settings)
  - Deployment target (where to run)
  - Status (pending, running, stopped)
  - Outputs (resolved env vars, access URL)

**Model Structure**:
```python
class ServiceConfig(BaseModel):
    id: str                              # Unique instance ID
    template_id: str                     # Reference to template
    name: str                            # Display name
    config: ConfigValues                 # Configuration values
    deployment_target: Optional[str]     # Where to deploy (unode hostname, cluster name, or None=local)
    status: ServiceConfigStatus          # Current state
    outputs: ServiceOutputs              # Resolved values after deployment
    container_id: Optional[str]          # Docker container ID
    deployment_id: Optional[str]         # Deployment record reference
```

**Storage**: `config/service_configs.yaml` (persisted to disk, managed by ServiceConfigManager)

### 2. Deployment Backends

**Location**: `src/services/deployment_backends.py`

**Purpose**: Abstract deployment logic for different target types.

**Architecture**:
```python
DeploymentBackend (ABC)
    ├── deploy(unode, resolved_service, deployment_id) -> Deployment
    ├── get_status(unode, deployment) -> DeploymentStatus
    ├── stop(unode, deployment) -> bool
    ├── remove(unode, deployment) -> bool
    └── get_logs(unode, deployment) -> List[str]

Implementations:
    ├── DockerDeploymentBackend
    │   ├── Local Docker (direct API)
    │   └── Remote UNode (via UNode Manager HTTP API :8444)
    └── KubernetesDeploymentBackend
        └── K8s cluster (via kubernetes Python client)
```

**Key Behaviors**:

#### DockerDeploymentBackend
- **Local deployment**: Direct Docker API calls (same host as backend)
- **Remote deployment**: HTTP calls to UNode Manager API on remote host
  - Uses Tailscale IP for connectivity
  - Sends ResolvedServiceDefinition as JSON payload
  - UNode Manager handles container creation

#### KubernetesDeploymentBackend
- Generates K8s manifests (Deployment, Service, ConfigMap)
- Uses kubernetes Python client
- Handles namespace isolation
- Supports health checks, resource limits, ingress

**Backend Selection**:
```python
def get_deployment_backend(unode: UNode, k8s_manager) -> DeploymentBackend:
    if unode.type == UNodeType.KUBERNETES:
        return KubernetesDeploymentBackend(k8s_manager)
    else:
        return DockerDeploymentBackend()
```

### 3. DeploymentManager

**Location**: `src/services/deployment_manager.py`

**Purpose**: Orchestrates service deployments across all target types.

**Key Responsibilities**:

1. **Service Resolution**: Central function for variable resolution
   ```python
   async def resolve_service_for_deployment(
       service_id: str,
       deploy_target: Optional[str] = None,
       config_id: Optional[str] = None
   ) -> ResolvedServiceDefinition
   ```

   **Resolution Process**:
   - Get service from ComposeRegistry
   - Use Settings API to resolve env vars (6-layer hierarchy)
   - Run `docker-compose config` to resolve ${VAR} syntax in image/ports/volumes
   - Combine Settings-resolved env vars with compose-resolved structure
   - Return `ResolvedServiceDefinition` (no variables, ready for deployment)

2. **Backend Selection**: Choose Docker or K8s backend based on UNode type

3. **Deployment Tracking**: Store Deployment records in MongoDB
   ```python
   class Deployment(BaseModel):
       id: str
       service_id: str
       unode_hostname: str
       status: DeploymentStatus
       container_id: Optional[str]
       backend_type: str              # "docker" or "kubernetes"
       backend_metadata: Dict[str, Any]  # Backend-specific info
       deployed_config: Dict[str, Any]   # Snapshot of config at deploy time
   ```

### 4. ServiceConfigManager

**Location**: `src/services/service_config_manager.py`

**Purpose**: Manages ServiceConfig lifecycle and wiring between capabilities.

**Key Responsibilities**:

1. **CRUD Operations**: Create, read, update, delete ServiceConfig instances

2. **Wiring Management**: Connect service outputs to service inputs
   ```python
   class Wiring(BaseModel):
       source_config_id: str      # Instance providing capability
       source_capability: str     # Capability being provided (e.g., "llm")
       target_config_id: str      # Instance consuming capability
       target_capability: str     # Capability slot being filled
   ```

3. **Configuration Persistence**:
   - Stores ServiceConfigs in `config/service_configs.yaml`
   - Stores Wiring in `config/wiring.yaml`
   - Uses OmegaConf to preserve interpolations (e.g., `${provider.openai-default}`)

4. **Default Providers**: Tracks which instance is default for each capability

### 5. Deployment Targets

**Location**: `src/utils/deployment_targets.py`

**Purpose**: Unified identifier system for deployment targets.

**Format**: `{identifier}.{type}.{environment}`

**Examples**:
- UNode: `ushadow-purple.unode.purple` (local leader)
- UNode: `worker-01.unode.purple` (remote worker)
- K8s: `production-cluster.k8s.purple` (kubernetes cluster)

**Functions**:
```python
def make_deployment_target_id(identifier: str, target_type: Literal["unode", "k8s"]) -> str
def parse_deployment_target_id(target_id: str) -> dict  # Returns: {identifier, type, environment}
def get_environment_name() -> str  # Extracts from ENV_NAME or COMPOSE_PROJECT_NAME
```

**Integration with Models**:
```python
# UNode model
@computed_field
@property
def deployment_target_id(self) -> str:
    return make_deployment_target_id(self.hostname, "unode")

# KubernetesCluster model
@computed_field
@property
def deployment_target_id(self) -> str:
    return make_deployment_target_id(self.name, "k8s")
```

## Deployment Flow

### Complete Deployment Sequence

```
1. User Action (Frontend)
   └─> Click "Deploy to Local/Remote/K8s"

2. Frontend API Call
   └─> POST /api/service_configs/{config_id}/deploy
       Body: { deploy_target: "ushadow-purple.unode.purple" }

3. ServiceConfigManager
   └─> Validate config_id exists
   └─> Update status to "deploying"

4. DeploymentManager.resolve_service_for_deployment()
   ├─> Get service from ComposeRegistry
   ├─> Settings API resolution:
   │   └─> settings.for_deployment(config_id)
   │       ├─> Layer 1: CONFIG_DEFAULT
   │       ├─> Layer 2: COMPOSE_DEFAULT
   │       ├─> Layer 3: ENV_FILE
   │       ├─> Layer 4: CAPABILITY (from wiring)
   │       ├─> Layer 5: DEPLOY_ENV (deploy_target-specific)
   │       └─> Layer 6: USER_OVERRIDE (from ServiceConfig)
   ├─> Run `docker-compose config` with resolved env
   │   └─> Resolves ${VAR} syntax in image/ports/volumes
   └─> Return ResolvedServiceDefinition

5. Backend Selection
   └─> get_deployment_backend(unode, k8s_manager)
       ├─> If unode.type == KUBERNETES → KubernetesDeploymentBackend
       └─> Else → DockerDeploymentBackend

6. Backend Deployment

   DockerDeploymentBackend:
   ├─> If local: Direct Docker API
   │   └─> docker_client.containers.run(...)
   └─> If remote: HTTP to UNode Manager
       └─> POST http://{tailscale_ip}:8444/api/deploy

   KubernetesDeploymentBackend:
   ├─> Generate K8s manifests
   │   ├─> Deployment (pods, replicas, image)
   │   ├─> Service (networking, ports)
   │   └─> ConfigMap (environment variables)
   └─> Apply to cluster via kubernetes client

7. Track Deployment
   └─> Create Deployment record in MongoDB
       └─> Contains: status, container_id, backend_type, backend_metadata

8. Update ServiceConfig
   └─> Set status = "running"
   └─> Store container_id / deployment_id
   └─> Save to config/service_configs.yaml

9. Frontend Update
   └─> Poll deployment status
   └─> Show container logs
   └─> Display access URL
```

## Settings API Integration

### Resolution Methods

The Settings API provides three methods for different contexts:

```python
# 1. Service-level (4 layers) - Used when no deployment context
await settings.for_service(service_id: str)
# Returns: CONFIG_DEFAULT → COMPOSE_DEFAULT → ENV_FILE → CAPABILITY

# 2. Deploy config (5 layers) - Used when preparing deployment
await settings.for_deploy_config(deploy_target: str, service_id: str)
# Returns: CONFIG_DEFAULT → COMPOSE_DEFAULT → ENV_FILE → CAPABILITY → DEPLOY_ENV

# 3. Full deployment (6 layers) - Used when deploying ServiceConfig
await settings.for_deployment(config_id: str)
# Returns: All 6 layers including USER_OVERRIDE
```

### Resolution Priority (Lowest to Highest)

1. **CONFIG_DEFAULT**: Global defaults from `config/config.defaults.yaml`
2. **COMPOSE_DEFAULT**: Service defaults from docker-compose file
3. **ENV_FILE**: Environment variables from `.env` or `os.environ`
4. **CAPABILITY**: Values from wired providers (e.g., OpenAI API key from openai-default)
5. **DEPLOY_ENV**: Environment-specific overrides (e.g., purple vs production)
6. **USER_OVERRIDE**: User-specified values in ServiceConfig

## UNode Architecture

**UNode**: Unified Node - represents any deployment target

```python
class UNodeType(str, Enum):
    DOCKER = "docker"          # Traditional Docker host
    KUBERNETES = "kubernetes"  # Kubernetes cluster

class UNode(BaseModel):
    hostname: str              # Unique identifier
    type: UNodeType           # Docker or K8s
    role: UNodeRole           # Leader, Standby, Worker
    tailscale_ip: str         # For remote connectivity
    capabilities: Dict        # What this node can run
    deployment_target_id: str # Computed: {hostname}.{type}.{environment}
```

**Special UNodes**:
- **Leader**: The control plane (ushadow-purple) - runs backend, manages cluster
- **Worker**: Remote Docker hosts running UNode Manager
- **K8s Cluster**: Represented as a special UNode with type=KUBERNETES

## Key Design Principles

### 1. Separation of Concerns

- **ServiceConfig**: Configuration + Deployment Target (WHAT and WHERE)
- **DeploymentManager**: Orchestration logic (HOW)
- **DeploymentBackend**: Target-specific implementation (EXECUTION)
- **Settings API**: Variable resolution (VALUES)

### 2. Backend Abstraction

All deployment targets implement the same interface:
```python
deploy(unode, resolved_service, deployment_id) -> Deployment
```

This allows adding new backends (e.g., AWS ECS, Azure Container Instances) without changing orchestration logic.

### 3. Unified Resolution

Single function `resolve_service_for_deployment()` handles all variable resolution, ensuring consistency across all deployment types.

### 4. Deployment Target Unification

All targets use the same identifier format: `{identifier}.{type}.{environment}`

This enables:
- Consistent API parameters
- Easy target type detection
- Environment isolation

### 5. Configuration Persistence

- **ServiceConfig**: Stored in YAML for user visibility and git-trackable
- **Deployment**: Stored in MongoDB for runtime state
- **Wiring**: Stored in YAML for relationship tracking

## Data Flow Example

### Deploying Chronicle to K8s

```
1. User clicks "Deploy to K8s" for chronicle-compose:chronicle-backend
   deploy_target = "production-cluster.k8s.purple"
   config_id = "chronicle-prod"

2. ServiceConfigManager.deploy(config_id, deploy_target)
   └─> Parse deployment_target_id
       identifier = "production-cluster"
       type = "k8s"
       environment = "purple"

3. DeploymentManager.resolve_service_for_deployment()
   ├─> Get service from ComposeRegistry
   │   service_id = "chronicle-compose:chronicle-backend"
   │   compose_file = "/compose/chronicle-compose.yaml"
   │
   ├─> Settings.for_deployment("chronicle-prod")
   │   ├─> Layer 1: OPENAI_API_KEY from config.defaults.yaml
   │   ├─> Layer 2: (none for this var)
   │   ├─> Layer 3: (none for this var)
   │   ├─> Layer 4: OPENAI_API_KEY="sk-..." from wired openai-default
   │   ├─> Layer 5: MONGODB_URI="mongodb.prod.svc..." from deploy_env.purple
   │   └─> Layer 6: CUSTOM_VAR="override" from ServiceConfig.config
   │
   └─> docker-compose config
       ├─> Resolves image: ghcr.io/ushadow-io/chronicle:${VERSION} → ghcr.io/ushadow-io/chronicle:latest
       ├─> Resolves ports: "${BACKEND_PORT}:8000" → "8080:8000"
       └─> Returns full compose structure

4. Get UNode for "production-cluster"
   ├─> Parse deployment_target_id
   ├─> Query KubernetesManager for cluster with name="production-cluster"
   └─> Return KubernetesCluster as UNode (type=KUBERNETES)

5. Select Backend
   └─> get_deployment_backend(unode, k8s_manager)
       └─> Returns KubernetesDeploymentBackend

6. Deploy
   ├─> KubernetesDeploymentBackend.deploy()
   │   ├─> Generate K8s manifests
   │   │   ├─> Deployment: replicas=2, image=ghcr.io/.../chronicle:latest
   │   │   ├─> Service: type=ClusterIP, port=8080→8000
   │   │   └─> ConfigMap: env vars from resolved settings
   │   └─> Apply to cluster
   │
   └─> Return Deployment object
       status = RUNNING
       backend_type = "kubernetes"
       backend_metadata = {
         cluster_id: "production-cluster",
         namespace: "default",
         deployment_name: "chronicle-backend-abc123"
       }

7. Save State
   ├─> MongoDB: Insert Deployment record
   └─> YAML: Update ServiceConfig.status = "running"
```

## Future Enhancements

1. **Multi-cluster Deployments**: Deploy same service to multiple clusters
2. **Canary Deployments**: Gradual rollout with traffic splitting
3. **Auto-scaling**: Scale based on metrics
4. **Cost Optimization**: Choose cheapest available target
5. **Rollback**: Revert to previous deployment
6. **Health Monitoring**: Automatic restart on failure
