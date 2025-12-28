# Services Architecture Design

## Overview

This document defines the architecture for managing services in Ushadow. The design prioritizes:

- **Easy service integration**: Add new services with minimal code changes
- **Portable definitions**: Same service definition works across Docker, Kubernetes, and remote nodes
- **Shared infrastructure**: Common services (postgres, redis) are shared with opt-out
- **Clear separation**: Service definition (what) is separate from deployment config (where/how)
- **Simple user experience**: Users configure via wizard, no Helm/K8s knowledge required

## Design Philosophy

### Why Not Helm?

We considered using Helm charts but decided against it because:

1. **Shared infrastructure**: Helm charts typically bundle their own postgres/redis. We want ONE shared instance.
2. **Complexity barrier**: Helm requires understanding Go templating, K8s manifests, and chart structure.
3. **Multi-target**: Helm is K8s-only. We need Docker Compose for local development.
4. **User experience**: Our target users want "click Install, enter API key, done" - not values.yaml editing.

### Our Approach: Generate Standard Formats

We generate deployment artifacts ourselves:

| Target | What We Generate |
|--------|------------------|
| Docker | `docker-compose.yml` + `.env` files |
| Kubernetes | Deployment, Service, ConfigMap, Secret manifests |
| Remote Node | API payload for u-node manager |

This gives us:
- Control over shared infrastructure
- Consistent env var handling across targets
- Simple service definitions
- No external tooling complexity for users

---

## File Structure

```
config/
├── env-mappings.yaml              # Global env var → settings path mappings
├── settings.yaml                  # Actual settings values
├── secrets.yaml                   # Sensitive values (gitignored)
├── services.yaml                  # Index: defaults, service_types
├── services/                      # Service definitions (one per service)
│   ├── cognee.yaml
│   ├── openmemory.yaml
│   ├── chronicle.yaml
│   ├── openai.yaml
│   ├── ollama.yaml
│   └── deepgram.yaml
├── deployments/                   # Deployment configurations
│   ├── local.yaml                 # Local Docker deployment
│   ├── production.yaml            # Kubernetes production
│   └── user-overrides.yaml        # User customizations (gitignored)
├── user-services/                 # User-added services (gitignored)
│   └── my-custom-service.yaml
├── vendor/                        # Vendored upstream references (optional)
│   └── cognee/
│       ├── docker-compose.yml
│       └── VERSION
└── generated/                     # Generated at deploy time (gitignored)
    ├── docker-compose.yml
    ├── cognee.env
    └── k8s/
        └── cognee-deployment.yaml
```

---

## Core Concepts

### Service Types

High-level categories of services:

| Type | Description | Examples |
|------|-------------|----------|
| `memory` | Memory and knowledge storage | OpenMemory, Cognee, Mem0 |
| `llm` | Language model inference | OpenAI, Anthropic, Ollama |
| `transcription` | Speech to text | Deepgram, Whisper, Mistral |
| `conversation_engine` | Audio processing + analysis | Chronicle |
| `infrastructure` | Supporting services | Postgres, Redis, Qdrant, Neo4j |

### Service Definition vs Deployment Config

| Aspect | Service Definition | Deployment Config |
|--------|-------------------|-------------------|
| **Purpose** | What the service IS | Where/how it RUNS |
| **Location** | `config/services/*.yaml` | `config/deployments/*.yaml` or MongoDB |
| **Contents** | Image, env vars, ports, health | Target, replicas, resources, networking |
| **Portability** | Same across all environments | Environment-specific |
| **Versioned** | Yes (git) | Partially (templates in git, values in DB) |

---

## Schema Definitions

### services.yaml (Index)

```yaml
# config/services.yaml

# Default provider for each service type (used in quickstart wizard)
defaults:
  memory: openmemory
  llm: openai
  transcription: deepgram

# Service type definitions
service_types:
  memory:
    description: "Memory and knowledge storage services"
  llm:
    description: "Language model inference providers"
  transcription:
    description: "Speech to text services"
  conversation_engine:
    description: "Audio processing with AI analysis"
  infrastructure:
    description: "Supporting infrastructure services"
    managed: true  # System-managed, not user-selectable

# Services are auto-discovered from config/services/*.yaml
# User additions from config/user-services/*.yaml
```

### env-mappings.yaml (Global Mappings)

```yaml
# config/env-mappings.yaml
# Maps environment variable names to settings/secrets paths
# Services can override these mappings when needed

mappings:
  # API Keys
  OPENAI_API_KEY: settings.api_keys.openai
  ANTHROPIC_API_KEY: settings.api_keys.anthropic
  DEEPGRAM_API_KEY: settings.api_keys.deepgram
  MISTRAL_API_KEY: settings.api_keys.mistral

  # Postgres
  POSTGRES_HOST: settings.infrastructure.postgres.host
  POSTGRES_PORT: settings.infrastructure.postgres.port
  POSTGRES_USER: settings.infrastructure.postgres.user
  POSTGRES_PASSWORD: secrets.postgres_password
  POSTGRES_DB: settings.infrastructure.postgres.database
  DATABASE_URL: settings.infrastructure.postgres.url

  # Redis
  REDIS_URL: settings.infrastructure.redis.url
  REDIS_HOST: settings.infrastructure.redis.host
  REDIS_PORT: settings.infrastructure.redis.port

  # Qdrant
  QDRANT_HOST: settings.infrastructure.qdrant.host
  QDRANT_PORT: settings.infrastructure.qdrant.port

  # Neo4j
  NEO4J_URI: settings.infrastructure.neo4j.uri
  NEO4J_USER: settings.infrastructure.neo4j.user
  NEO4J_PASSWORD: secrets.neo4j_password

  # Common
  LOG_LEVEL: settings.log_level
  NODE_ENV: settings.environment
```

### Service Definition Schema

```yaml
# config/services/{service-id}.yaml

# ============================================================================
# IDENTITY
# ============================================================================
id: cognee                              # Unique identifier (lowercase, hyphens)
type: memory                            # Service type (from service_types)
name: "Cognee"                          # Display name
description: "Open-source RAG framework with knowledge graphs"
version: ">=0.1.19"                     # Version constraint
source: https://github.com/topoteretes/cognee  # Upstream repository

# ============================================================================
# CONTAINER DEFINITION(S)
# ============================================================================
containers:
  - name: api                           # Container name within service
    image: topoteretes/cognee:${version}

    ports:
      - container: 8000                 # Port inside container
        protocol: http                  # http | tcp | udp

    # -------------------------------------------------------------------------
    # Environment Variables
    # -------------------------------------------------------------------------
    env:
      # Required: Service cannot start without these
      required:
        - OPENAI_API_KEY                # Resolved from env-mappings.yaml
        - POSTGRES_HOST
        - POSTGRES_PASSWORD

      # Optional: Falls back to default or skipped if not configured
      optional:
        - REDIS_URL
        - NEO4J_URI
        - LOG_LEVEL

      # Overrides: This service maps these env vars differently than global
      overrides:
        LLM_API_KEY: settings.api_keys.openai    # Use OpenAI key for LLM_API_KEY
        API_KEY: settings.api_keys.cognee        # Generic API_KEY = Cognee's key

      # Values: Literal values (not resolved from settings)
      values:
        COGNEE_ENV: production
        GRAPH_ENABLED: "true"

    # -------------------------------------------------------------------------
    # Health Check
    # -------------------------------------------------------------------------
    health:
      http_get: /health                 # Endpoint to check
      port: 8000                        # Port to check on
      interval: 30s                     # Time between checks
      timeout: 10s                      # Request timeout
      retries: 3                        # Failures before unhealthy

    # -------------------------------------------------------------------------
    # Volumes (optional)
    # -------------------------------------------------------------------------
    volumes:
      - name: data
        path: /app/data
        persistent: true                # Survives container restart

# ============================================================================
# DEPENDENCIES
# ============================================================================
depends_on:
  required:
    - postgres                          # Must be running
  optional:
    - redis                             # Enhanced performance if available
    - neo4j                             # Required if GRAPH_ENABLED=true

# ============================================================================
# UI METADATA
# ============================================================================
ui:
  icon: brain                           # Icon identifier
  category: memory                      # UI grouping
  wizard_order: 2                       # Order in quickstart wizard (if default)
  tags: ["rag", "knowledge-graph", "local"]

  # Links shown in UI
  links:
    docs: https://docs.cognee.dev
    github: https://github.com/topoteretes/cognee
```

### Deployment Config Schema

```yaml
# config/deployments/local.yaml

# Global target for this deployment config
target: docker                          # docker | kubernetes | remote

# Docker-specific global settings
docker:
  network: ushadow-net
  compose_project: ushadow

# Per-service deployment settings
services:
  cognee:
    enabled: true

    # Resource limits
    resources:
      memory: 2Gi
      cpu: "1"

    # Port mapping (host:container) - overrides service definition
    ports:
      8000: 8100                        # Expose container:8000 on host:8100

    # Docker-specific overrides
    docker:
      restart: unless-stopped
      extra_hosts:
        - "host.docker.internal:host-gateway"

  chronicle:
    enabled: true

  openmemory:
    enabled: false                      # Disabled - user chose cognee instead
```

```yaml
# config/deployments/production.yaml

target: kubernetes

kubernetes:
  namespace: ushadow
  storage_class: fast-ssd
  image_pull_secrets:
    - ghcr-secret

services:
  cognee:
    enabled: true
    replicas: 3

    resources:
      requests:
        memory: 1Gi
        cpu: "500m"
      limits:
        memory: 4Gi
        cpu: "2"

    ingress:
      enabled: true
      host: cognee.ushadow.io
      tls: true

    # Kubernetes-specific
    kubernetes:
      service_account: cognee-sa
      pod_annotations:
        prometheus.io/scrape: "true"
```

---

## Environment Variable Resolution

### Resolution Order

For each env var a service needs:

```
1. Service's env.values (literal)
   └─▶ Found? Use literal value

2. Service's env.overrides
   └─▶ Found? Resolve from specified path

3. Global env-mappings.yaml
   └─▶ Found? Resolve from global path

4. Error: No mapping for env var
```

### Path Resolution

Paths use prefixes to indicate the source:

| Prefix | Source | Example |
|--------|--------|---------|
| `settings.` | settings.yaml or MongoDB | `settings.api_keys.openai` |
| `secrets.` | secrets.yaml or secrets store | `secrets.postgres_password` |
| `config.` | User's service-specific config | `config.graph_enabled` |

### Required vs Optional

| Type | Behavior |
|------|----------|
| `required` | Service cannot activate if any are missing/empty |
| `optional` | Uses default if available, skipped if not configured |

---

## Validation Flow

```
User clicks "Activate Service"
         │
         ▼
┌─────────────────────────────────────────────┐
│ 1. Check env.required                       │
│    - Resolve each from mappings             │
│    - All have non-empty values?             │
│    └─▶ No: Return missing fields for UI     │
└─────────────────────────────────────────────┘
         │ Yes
         ▼
┌─────────────────────────────────────────────┐
│ 2. Check depends_on.required                │
│    - Are required services running?         │
│    └─▶ No: Return "Start X first"           │
└─────────────────────────────────────────────┘
         │ Yes
         ▼
┌─────────────────────────────────────────────┐
│ 3. Resolve all env vars                     │
│    - Required (validated above)             │
│    - Optional (use defaults if missing)     │
│    - Overrides                              │
│    - Values (literals)                      │
└─────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────┐
│ 4. Generate deployment artifacts            │
│    - Docker: .env file + compose entry      │
│    - K8s: ConfigMap + Secret + Deployment   │
│    - Remote: API payload for u-node         │
└─────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────┐
│ 5. Deploy to target                         │
└─────────────────────────────────────────────┘
```

---

## API Design

### Service Catalog

```
GET /api/services/catalog
```

Returns all available services from `config/services/*.yaml`:

```json
{
  "services": [
    {
      "id": "cognee",
      "type": "memory",
      "name": "Cognee",
      "description": "Open-source RAG framework with knowledge graphs",
      "is_default": false,
      "status": "available"
    }
  ]
}
```

### Service Status

```
GET /api/services/{service_id}/status
```

Returns activation readiness:

```json
{
  "service_id": "cognee",
  "can_activate": false,
  "status": "missing_config",
  "missing_required": [
    {
      "env_var": "OPENAI_API_KEY",
      "settings_path": "settings.api_keys.openai",
      "label": "OpenAI API Key",
      "link": "https://platform.openai.com/api-keys"
    }
  ],
  "optional_missing": ["NEO4J_URI"],
  "dependencies": {
    "postgres": "running",
    "redis": "not_configured"
  }
}
```

### Activate Service

```
POST /api/services/{service_id}/activate
```

```json
{
  "target": "docker",
  "config_overrides": {
    "LOG_LEVEL": "DEBUG"
  }
}
```

### User's Installed Services

```
GET /api/services/installed
```

Returns services the user has activated:

```json
{
  "services": [
    {
      "service_id": "openmemory",
      "type": "memory",
      "status": "running",
      "target": "docker",
      "activated_at": "2024-01-15T10:00:00Z"
    }
  ]
}
```

---

## Deployment Targets

### Docker (Local)

1. Load service definition
2. Resolve all env vars
3. Generate `config/generated/{service}.env`
4. Generate/update `config/generated/docker-compose.yml`
5. Run `docker compose up -d {service}`

### Kubernetes

1. Load service definition
2. Resolve all env vars
3. Generate ConfigMap for non-sensitive vars
4. Generate Secret for sensitive vars
5. Generate Deployment manifest
6. Generate Service manifest
7. Generate Ingress (if configured)
8. Apply via `kubectl apply`

### Remote Node (u-node)

1. Load service definition
2. Resolve all env vars
3. Send deploy command to u-node manager via HTTP:
   ```json
   {
     "container_name": "cognee-abc123",
     "image": "topoteretes/cognee:0.1.19",
     "env": {"OPENAI_API_KEY": "sk-...", ...},
     "ports": {"8000": 8000},
     "health_check": "/health"
   }
   ```

---

## Adding a New Service

### Example: Adding Cognee

1. **Create service definition**:
   ```bash
   touch config/services/cognee.yaml
   ```

2. **Define the service** (see schema above)

3. **Optionally vendor upstream files** (for reference):
   ```bash
   mkdir -p config/vendor/cognee
   curl -o config/vendor/cognee/docker-compose.yml \
     https://raw.githubusercontent.com/topoteretes/cognee/v0.1.19/docker-compose.yml
   echo "0.1.19" > config/vendor/cognee/VERSION
   ```

4. **Add any new settings paths** to `env-mappings.yaml` if needed:
   ```yaml
   mappings:
     COGNEE_API_KEY: settings.api_keys.cognee
   ```

5. **Test**:
   ```bash
   ushadow service validate cognee
   ushadow service activate cognee --target docker
   ```

### No Code Changes Required

The service registry auto-discovers services from `config/services/*.yaml`. No Python code changes needed unless the service requires custom business logic.

---

## Migration from Current Architecture

### Files to Remove

- `config/service-templates.yaml` - replaced by per-service definitions
- `config/default-services.yaml` - replaced by `services.yaml` + individual files
- `ushadow/backend/src/services/service_manager.py` - already deleted
- `ushadow/backend/src/services/settings_manager.py` - already deleted

### Files to Create

- `config/env-mappings.yaml`
- `config/services.yaml`
- `config/services/*.yaml` (one per service)
- `config/deployments/local.yaml`
- `config/deployments/production.yaml`

### Code to Update

- `ServiceRegistry` - load from new file structure
- `DockerManager` - generate compose from service definitions
- `DeploymentManager` - use same service definitions for remote deployment

---

## Future Enhancements

### Service Marketplace

Remote catalog of available services:

```yaml
# Fetched from https://ushadow.io/service-catalog.yaml
catalog:
  - id: cognee
    version: "0.1.19"
    definition_url: https://ushadow.io/services/cognee.yaml
    verified: true
```

User installs:
```bash
ushadow service install cognee
```

### Conditional Dependencies

```yaml
depends_on:
  optional:
    - service: neo4j
      condition: env.GRAPH_ENABLED == "true"
```

### Multi-Container Services

Already supported via `containers` array:

```yaml
containers:
  - name: api
    image: myservice-api:latest
  - name: worker
    image: myservice-worker:latest
```

---

## Shared Infrastructure

### Concept

Infrastructure services (postgres, redis, qdrant, neo4j) are managed centrally. User services connect to these shared instances rather than spinning up their own.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        SHARED INFRASTRUCTURE                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Infrastructure Services (managed by us, always running)                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │  postgres   │  │   redis     │  │   qdrant    │  │   neo4j     │         │
│  │  :5432      │  │   :6379     │  │   :6333     │  │   :7687     │         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘         │
│         │                │                │                │                 │
│         └────────────────┴────────────────┴────────────────┘                 │
│                                   │                                          │
│                          ushadow-network                                     │
│                                   │                                          │
│         ┌────────────────┬────────┴───────┬────────────────┐                │
│         │                │                │                │                │
│  ┌──────┴──────┐  ┌──────┴──────┐  ┌──────┴──────┐  ┌──────┴──────┐        │
│  │   cognee    │  │  chronicle  │  │ openmemory  │  │   ollama    │        │
│  │             │  │             │  │             │  │             │        │
│  │ POSTGRES_   │  │ POSTGRES_   │  │ POSTGRES_   │  │             │        │
│  │ HOST=       │  │ HOST=       │  │ HOST=       │  │             │        │
│  │ "postgres"  │  │ "postgres"  │  │ "postgres"  │  │             │        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
│                                                                              │
│  All services connect to SAME postgres via Docker/K8s network               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Infrastructure Service Definition

```yaml
# config/services/infrastructure/postgres.yaml

id: postgres
type: infrastructure
name: "PostgreSQL"
managed: true          # System-managed, always runs, user doesn't toggle

containers:
  - name: db
    image: postgres:16-alpine
    ports: [5432]

    env:
      required:
        - POSTGRES_PASSWORD

      values:
        POSTGRES_USER: ushadow
        POSTGRES_DB: ushadow

    volumes:
      - name: pgdata
        path: /var/lib/postgresql/data
        persistent: true

    health:
      tcp: 5432
```

### Settings for Shared Infrastructure

```yaml
# config/settings.yaml

infrastructure:
  postgres:
    host: postgres              # Container/service name on network
    port: 5432
    user: ushadow
    database: ushadow
    url: "postgresql://ushadow:${secrets.postgres_password}@postgres:5432/ushadow"

  redis:
    host: redis
    port: 6379
    url: "redis://redis:6379"

  qdrant:
    host: qdrant
    port: 6333

  neo4j:
    host: neo4j
    port: 7687
    uri: "bolt://neo4j:7687"
```

### Opt-Out for Self-Managed Infrastructure

If a user wants to use their own external postgres:

```yaml
# config/deployments/user-overrides.yaml

infrastructure:
  postgres:
    managed: false                    # Don't run our postgres container
    host: my-rds-instance.aws.com     # Use external instead
    port: 5432
    user: myuser
    # Password still comes from secrets
```

---

## Appendix: Example Services

### Cloud LLM (OpenAI)

```yaml
id: openai
type: llm
name: "OpenAI"
description: "OpenAI GPT models"
source: https://platform.openai.com

# No containers - cloud service
cloud:
  base_url: https://api.openai.com/v1

  env:
    required:
      - OPENAI_API_KEY

ui:
  icon: openai
  tags: ["llm", "cloud", "gpt"]
```

### Local LLM (Ollama)

```yaml
id: ollama
type: llm
name: "Ollama"
description: "Local LLM server"
source: https://ollama.ai

containers:
  - name: server
    image: ollama/ollama:latest
    ports:
      - container: 11434
        protocol: http

    env:
      optional:
        - LOG_LEVEL

      values:
        OLLAMA_HOST: "0.0.0.0"

    health:
      http_get: /api/tags
      port: 11434

    volumes:
      - name: models
        path: /root/.ollama
        persistent: true

ui:
  icon: ollama
  tags: ["llm", "local", "private"]
```

### Infrastructure (Postgres)

```yaml
id: postgres
type: infrastructure
name: "PostgreSQL"
description: "Relational database"
managed: true  # System-managed, not user-selectable

containers:
  - name: db
    image: postgres:16-alpine
    ports:
      - container: 5432
        protocol: tcp

    env:
      required:
        - POSTGRES_PASSWORD

      values:
        POSTGRES_USER: ushadow
        POSTGRES_DB: ushadow

    health:
      tcp: 5432

    volumes:
      - name: data
        path: /var/lib/postgresql/data
        persistent: true
```
