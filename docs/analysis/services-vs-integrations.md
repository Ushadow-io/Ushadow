# Services vs Integrations - Concept Separation

## Overview

Ushadow manages two distinct types of external systems:

1. **Services** - Docker containers you run locally
2. **Integrations** - External APIs/data sources you connect to

These were originally mixed together under "services" but have now been separated for clarity.

---

## Services (Docker Containers)

### Definition
Docker containers managed through Docker Compose files that run as part of your local Ushadow infrastructure.

### Examples
- `chronicle` - Chronicle conversation tracking backend
- `openmemory` - OpenMemory service
- `agent-zero` - Autonomous agent
- `neo4j` - Graph database
- `qdrant` - Vector database

### Characteristics
- ✅ Defined in `compose/*-compose.yaml` files
- ✅ Have Docker images, ports, volumes
- ✅ Require environment variables for configuration
- ✅ Can be started/stopped/restarted via Docker
- ✅ Run on your local machine or in your infrastructure
- ✅ Health checks via Docker

### Models
| Model | Location | Purpose |
|-------|----------|---------|
| `DiscoveredService` | `compose_registry.py` | Service discovered from compose file |
| `ServiceInfo` | `docker_manager.py` | Running container information |
| `ServiceStatus` | `docker_manager.py` | Container status enum |
| `ServiceType` | `docker_manager.py` | Classification (infrastructure/application) |
| `ServiceSummary` | `service_orchestrator.py` | Lightweight service info for lists |
| `DockerDetails` | `service_orchestrator.py` | Full container details |

### Management
```
ComposeServiceRegistry → discovers services from compose files
        ↓
DockerManager → manages container lifecycle
        ↓
ServiceOrchestrator → unified facade
        ↓
/api/services/* → REST API
        ↓
Frontend UI → user interface
```

### Configuration
Services are configured via:
- Compose files: `compose/chronicle-compose.yaml`
- Environment variables: `service_env_config.{service_id}`
- Settings mappings: Point env vars to settings paths
- Port overrides: `services.{name}.ports.{ENV_VAR}`

### Lifecycle
```bash
# List services
GET /api/services/

# Get service details
GET /api/services/chronicle

# Start service
POST /api/services/chronicle/start

# Stop service
POST /api/services/chronicle/stop

# View logs
GET /api/services/chronicle/logs
```

---

## Integrations (External APIs)

### Definition
External services and data sources that Ushadow connects to via APIs or file systems.

### Examples
- `obsidian-vault` - Local Obsidian markdown files
- `notion` - Notion API for databases/pages
- `mem0-cloud` - mem0.ai memory service
- `google-drive` - Google Drive documents
- `openai-api` - OpenAI LLM service

### Characteristics
- ✅ Connect to external systems (cloud APIs, filesystems)
- ✅ Require authentication (API keys, OAuth, etc.)
- ✅ Import/sync data into Ushadow
- ✅ Use adapters to transform external data formats
- ✅ No Docker containers involved
- ✅ Health checks via API requests

### Models
| Model | Location | Purpose |
|-------|----------|---------|
| `IntegrationConfig` | `models/integration.py` | Integration configuration |
| `IntegrationType` | `models/integration.py` | Communication protocol enum |
| `ConnectionConfig` | `models/integration.py` | Connection details + auth |
| `AuthConfig` | `models/integration.py` | Authentication configuration |
| `MemoryMappingConfig` | `models/integration.py` | Data transformation rules |
| `FieldMapping` | `models/integration.py` | Field-level mapping |

### Management (Future)
```
IntegrationConfig → defines how to connect
        ↓
AdapterFactory → creates appropriate adapter
        ↓
MemoryAdapter → fetches and transforms data
        ↓
MemoryService → stores in MongoDB/Qdrant
        ↓
/api/integrations/* → REST API (TODO)
        ↓
Frontend UI → user interface (TODO)
```

### Configuration
Integrations are configured via:
- Config files: `config.overrides.yaml` under `integrations:`
- Templates: `config/integration-templates.yaml`
- Field mappings: Map external fields to internal format
- Auth settings: API keys, tokens, credentials

### Lifecycle (Future)
```bash
# List integrations
GET /api/integrations/

# Create integration
POST /api/integrations/
{
  "integration_id": "obsidian-main",
  "name": "My Obsidian Vault",
  "template": "memory_source",
  "connection_url": "file:///path/to/vault"
}

# Test connection
POST /api/integrations/obsidian-main/test

# Sync data
POST /api/integrations/obsidian-main/sync

# View sync history
GET /api/integrations/obsidian-main/sync-history
```

---

## File Organization

### Services
```
ushadow/backend/src/
├── services/
│   ├── compose_registry.py      # Discover services from compose files
│   ├── docker_manager.py         # Docker container management
│   └── service_orchestrator.py   # Unified service facade
├── routers/
│   └── services.py               # Service API endpoints
└── models/
    └── service.py                # DEPRECATED - re-exports from integration.py
```

### Integrations
```
ushadow/backend/src/
├── models/
│   └── integration.py            # Integration models (NEW)
├── memory/
│   └── adapters/
│       ├── base.py               # Abstract MemoryAdapter
│       ├── factory.py            # Adapter factory
│       ├── rest_adapter.py       # REST API adapter
│       └── obsidian_adapter.py   # Obsidian filesystem adapter (TODO)
├── routers/
│   └── integrations.py           # Integration API (TODO)
└── services/
    └── integration_orchestrator.py  # Integration management (TODO)
```

---

## Quick Reference

### When to Use Services
- ✅ Running a Docker container locally
- ✅ Need to start/stop/restart something
- ✅ Has a Docker image
- ✅ Defined in a compose file
- ✅ Example: "I want to run Chronicle locally"

### When to Use Integrations
- ✅ Connecting to an external API
- ✅ Importing data from another system
- ✅ No Docker container involved
- ✅ Requires API authentication
- ✅ Example: "I want to import my Obsidian notes"

---

## Migration Path

### Current State (✅ Done)
- ✅ Models separated: `integration.py` created
- ✅ `service.py` re-exports for compatibility
- ✅ Memory adapters use integration models
- ✅ Documentation created

### Next Steps (🔨 TODO)
- 🔨 Create `integration_orchestrator.py`
- 🔨 Create `/api/integrations/*` router
- 🔨 Create ObsidianAdapter implementation
- 🔨 Build integration management UI
- 🔨 Update memory adapters imports to use `models/integration.py`
- 🔨 Create integration-templates.yaml
- 🔨 Implement sync scheduler

### Future (📋 Planned)
- 📋 NotionAdapter
- 📋 GoogleDriveAdapter
- 📋 GenericRESTAdapter improvements
- 📋 Bi-directional sync
- 📋 Conflict resolution
- 📋 Real-time sync via webhooks

---

## Examples

### Service Example (Chronicle)
```yaml
# compose/chronicle-compose.yaml
services:
  chronicle-backend:
    image: chronicle-backend:latest
    ports:
      - "${CHRONICLE_PORT:-8080}:8000"
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - DATABASE_URL=mongodb://mongo:27017
```

```bash
# Start the service
POST /api/services/chronicle-backend/start

# Service is now running on localhost:8080
```

### Integration Example (Obsidian)
```yaml
# config.overrides.yaml
integrations:
  obsidian-main:
    name: My Knowledge Base
    template: memory_source
    integration_type: filesystem
    connection:
      url: file:///Users/stu/Documents/Obsidian
    memory_mapping:
      field_mappings:
        - source_field: frontmatter.title
          target_field: title
        - source_field: body
          target_field: content
        - source_field: tags
          target_field: tags
    sync_interval: 21600
```

```bash
# Sync data from Obsidian
POST /api/integrations/obsidian-main/sync

# Data is imported into MongoDB/Qdrant
# No Docker container involved
```

---

## Backward Compatibility

The `models/service.py` file now re-exports from `models/integration.py`:

```python
# Old import (still works)
from src.models.service import ServiceConfig, AuthConfig

# New import (preferred)
from src.models.integration import IntegrationConfig, AuthConfig
```

Aliases maintain compatibility:
- `ServiceConfig` → `IntegrationConfig`
- `ServiceConfigSchema` → `IntegrationConfigSchema`
- `ServiceTemplate` → `IntegrationTemplate`

---

## Summary

| Aspect | Services | Integrations |
|--------|----------|--------------|
| **What** | Docker containers | External APIs/data sources |
| **Where** | Local infrastructure | Cloud or filesystem |
| **How** | Docker Compose | HTTP/REST/Filesystem |
| **Models** | docker_manager.py | models/integration.py |
| **Config** | Compose files + env vars | integration-templates.yaml |
| **API** | /api/services/* | /api/integrations/* (TODO) |
| **Examples** | chronicle, neo4j | Obsidian, Notion, mem0.ai |
| **Status** | ✅ Fully implemented | ⚠️ Partially implemented |
