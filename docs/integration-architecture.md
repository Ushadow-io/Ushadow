# Integration Architecture

## Overview

Integrations are instances with additional sync capabilities. They reuse 100% of the instance/wiring infrastructure and add sync-specific operations through the `IntegrationOperations` service.

## High-Level Architecture

```mermaid
graph TB
    subgraph "Frontend (React + TypeScript)"
        UI[InstancesPage UI]
        API[API Client<br/>integrationApi]
    end

    subgraph "Backend API Layer (FastAPI)"
        Router[Instances Router<br/>/api/instances/*]
        Auth[Authentication<br/>Middleware]
    end

    subgraph "Business Logic Layer"
        InstanceMgr[InstanceManager<br/>Unified CRUD]
        IntegrationOps[IntegrationOperations<br/>Sync Logic]
    end

    subgraph "Adapter Layer"
        Factory[AdapterFactory]
        ObsidianAdapter[ObsidianAdapter<br/>Filesystem]
        RESTAdapter[RESTAdapter<br/>HTTP/REST]
        FutureAdapter[NotionAdapter<br/>GraphQL]
    end

    subgraph "Storage Layer"
        YAML[(instances.yaml<br/>State + Config)]
        MemoryDB[(MongoDB<br/>Memory Store)]
        Vault[External Systems<br/>Obsidian/Notion/etc]
    end

    UI -->|HTTP Requests| API
    API -->|POST /test-connection| Router
    API -->|POST /sync| Router
    API -->|POST /sync/enable| Router
    Router --> Auth
    Auth --> InstanceMgr
    Auth --> IntegrationOps

    InstanceMgr <-->|Load/Save| YAML
    IntegrationOps --> InstanceMgr
    IntegrationOps --> Factory

    Factory -->|Creates| ObsidianAdapter
    Factory -->|Creates| RESTAdapter
    Factory -->|Creates| FutureAdapter

    ObsidianAdapter -->|Read Files| Vault
    RESTAdapter -->|HTTP| Vault
    ObsidianAdapter -->|MemoryCreate| MemoryDB

    style IntegrationOps fill:#e1f5ff
    style ObsidianAdapter fill:#fff4e6
    style YAML fill:#f0f0f0
```

## Unified Instance Model

```mermaid
classDiagram
    class Instance {
        +string id
        +string template_id
        +string name
        +InstanceConfig config
        +InstanceStatus status

        // Standard fields (all instances)
        +string deployment_target
        +InstanceOutputs outputs
        +datetime created_at

        // Integration fields (optional, null for non-integrations)
        +IntegrationType integration_type
        +bool sync_enabled
        +int sync_interval
        +datetime last_sync_at
        +string last_sync_status
        +int last_sync_items_count
        +string last_sync_error
        +datetime next_sync_at
    }

    class IntegrationType {
        <<enumeration>>
        FILESYSTEM
        REST
        GRAPHQL
        WEBSOCKET
    }

    Instance --> IntegrationType
```

**Key Insight**: Integration fields are optional. An instance is an integration if `integration_type` is not null.

## Component Interactions

### 1. Creating an Integration Instance

```mermaid
sequenceDiagram
    participant User
    participant UI as InstancesPage
    participant API as Instances Router
    participant IM as InstanceManager
    participant YAML as instances.yaml

    User->>UI: Create "Obsidian Vault"
    UI->>API: POST /api/instances<br/>{template_id: "obsidian", config: {...}}
    API->>IM: create_instance(data)
    IM->>IM: Build Instance with<br/>integration_type="filesystem"
    IM->>YAML: Save instance
    YAML-->>IM: ✓
    IM-->>API: Instance created
    API-->>UI: 201 Created
    UI->>User: Show instance in list
```

### 2. Testing Connection

```mermaid
sequenceDiagram
    participant User
    participant UI as InstancesPage
    participant API as Instances Router
    participant IO as IntegrationOperations
    participant Factory as AdapterFactory
    participant Adapter as ObsidianAdapter
    participant FS as Filesystem

    User->>UI: Click "Test Connection"
    UI->>API: POST /instances/obsidian-1/test-connection
    API->>IO: test_connection("obsidian-1")
    IO->>Factory: create_adapter(instance)
    Factory-->>IO: ObsidianAdapter
    IO->>Adapter: test_connection()
    Adapter->>FS: Check vault path exists
    FS-->>Adapter: ✓ Path valid
    Adapter-->>IO: True
    IO-->>API: {success: true, message: "Connection successful"}
    API-->>UI: 200 OK
    UI->>User: Show success message
```

### 3. Manual Sync Operation

```mermaid
sequenceDiagram
    participant User
    participant UI as InstancesPage
    participant API as Instances Router
    participant IO as IntegrationOperations
    participant Adapter as ObsidianAdapter
    participant FS as Filesystem
    participant IM as InstanceManager
    participant YAML as instances.yaml
    participant DB as Memory DB

    User->>UI: Click "Sync Now"
    UI->>API: POST /instances/obsidian-1/sync
    API->>IO: sync_now("obsidian-1")

    IO->>IM: get_instance("obsidian-1")
    IM-->>IO: Instance

    IO->>IM: Update status to "in_progress"
    IM->>YAML: Save

    IO->>Adapter: fetch_items()
    Adapter->>FS: Read .md files
    Adapter->>Adapter: Parse frontmatter & tags
    FS-->>Adapter: Raw content
    Adapter-->>IO: List[MemoryCreate]

    IO->>DB: Store memories
    DB-->>IO: ✓ Stored

    IO->>IM: Update instance:<br/>- last_sync_at<br/>- last_sync_status="success"<br/>- last_sync_items_count=42<br/>- next_sync_at (if auto-sync)
    IM->>YAML: Save state

    IO-->>API: {success: true, items_synced: 42}
    API-->>UI: 200 OK
    UI->>User: "Synced 42 items"
```

### 4. Enable Auto-Sync

```mermaid
sequenceDiagram
    participant User
    participant UI as InstancesPage
    participant API as Instances Router
    participant IO as IntegrationOperations
    participant IM as InstanceManager
    participant YAML as instances.yaml

    User->>UI: Click "Enable Auto-Sync"
    UI->>API: POST /instances/obsidian-1/sync/enable
    API->>IO: enable_auto_sync("obsidian-1")
    IO->>IM: get_instance("obsidian-1")
    IM-->>IO: Instance

    IO->>IO: Calculate next_sync_at<br/>(last_sync + interval)

    IO->>IM: Update instance:<br/>- sync_enabled=True<br/>- next_sync_at
    IM->>YAML: Save

    IO-->>API: {success: true, message: "Auto-sync enabled"}
    API-->>UI: 200 OK
    UI->>User: Show "Auto-sync enabled"
```

## Adapter Pattern

```mermaid
classDiagram
    class MemoryAdapter {
        <<abstract>>
        +IntegrationConfig config
        +Dict settings
        +test_connection() bool
        +fetch_items() List~MemoryCreate~
        +fetch_item(id) MemoryCreate
    }

    class ObsidianAdapter {
        -Path vault_path
        +test_connection() bool
        +fetch_items() List~MemoryCreate~
        -_parse_markdown(path) Dict
        -_extract_tags(content) List
        -_extract_wiki_links(content) List
    }

    class RESTAdapter {
        -str base_url
        -Dict headers
        +test_connection() bool
        +fetch_items() List~MemoryCreate~
        -_transform_response(data) MemoryCreate
    }

    class AdapterFactory {
        +create_adapter(config) MemoryAdapter
    }

    MemoryAdapter <|-- ObsidianAdapter
    MemoryAdapter <|-- RESTAdapter
    AdapterFactory --> MemoryAdapter
    AdapterFactory --> ObsidianAdapter
    AdapterFactory --> RESTAdapter
```

## Data Flow: Obsidian Vault → Memory Store

```mermaid
flowchart LR
    subgraph "Source: Obsidian Vault"
        V1[note1.md<br/>---<br/>title: My Note<br/>tags: work<br/>---<br/># Content]
        V2[note2.md]
    end

    subgraph "Adapter Layer"
        Parser[Markdown Parser<br/>- YAML frontmatter<br/>- Inline tags #tag<br/>- Wiki links]
    end

    subgraph "Memory Model"
        M1[MemoryCreate<br/>source: obsidian-1<br/>source_id: note1.md<br/>title: My Note<br/>content: # Content<br/>tags: work<br/>metadata: ...]
        M2[MemoryCreate]
    end

    subgraph "Storage"
        DB[(MongoDB<br/>memories collection)]
    end

    V1 --> Parser
    V2 --> Parser
    Parser --> M1
    Parser --> M2
    M1 --> DB
    M2 --> DB

    style Parser fill:#fff4e6
    style M1 fill:#e8f5e9
```

## Key Design Principles

### 1. Zero Duplication
```
┌─────────────────────────────────────┐
│     Instance Infrastructure         │
│  (Used by ALL instance types)       │
│                                     │
│  • InstanceManager (CRUD)           │
│  • instances.yaml (Storage)         │
│  • Wiring system                    │
│  • Templates                        │
│  • Deployment                       │
└─────────────────────────────────────┘
                 ▲
                 │ Reused 100%
                 │
┌─────────────────────────────────────┐
│  Integration Extensions             │
│  (Only for integrations)            │
│                                     │
│  • IntegrationOperations service    │
│  • Adapter pattern                  │
│  • Sync state tracking              │
│  • API endpoints for sync           │
└─────────────────────────────────────┘
```

### 2. Extension Pattern

```
Regular Instance:
{
  "id": "chronicle-1",
  "template_id": "chronicle",
  "status": "running",
  "integration_type": null  ← Not an integration
}

Integration Instance:
{
  "id": "obsidian-1",
  "template_id": "obsidian",
  "status": "n/a",
  "integration_type": "filesystem",  ← IS an integration
  "sync_enabled": true,
  "last_sync_at": "2024-01-09T10:30:00Z",
  "last_sync_status": "success",
  "last_sync_items_count": 42
}
```

### 3. Conditional UI

```typescript
// InstancesPage.tsx - Same component for ALL instances
{expandedInstances.has(instance.id) && details && (
  <>
    {/* Configuration (shown for ALL instances) */}
    <ConfigSection />

    {/* Integration Sync UI (conditional - only for integrations) */}
    {details.integration_type && (
      <IntegrationSyncSection />  ← Only appears if integration_type exists
    )}

    {/* Access URL (shown for ALL instances) */}
    <AccessURLSection />
  </>
)}
```

## File Organization

```
ushadow/
├── backend/src/
│   ├── models/
│   │   ├── instance.py              # Unified Instance model (with optional integration fields)
│   │   └── integration.py           # IntegrationType enum, IntegrationConfig
│   ├── services/
│   │   ├── instance_manager.py      # CRUD for ALL instances
│   │   └── integration_operations.py # Sync logic for integrations ONLY
│   ├── routers/
│   │   └── instances.py             # API endpoints (instance + integration routes)
│   └── memory/adapters/
│       ├── base.py                  # Abstract MemoryAdapter
│       ├── factory.py               # AdapterFactory (type → adapter mapping)
│       └── obsidian_adapter.py      # Obsidian-specific implementation
│
├── frontend/src/
│   ├── services/
│   │   └── api.ts                   # API client (instancesApi + integrationApi)
│   └── pages/
│       └── InstancesPage.tsx        # Unified UI (conditional sync section)
│
└── config/
    ├── instances.yaml               # Single source of truth for ALL instances
    └── providers/integrations/
        └── obsidian.yaml            # Integration template definition
```

## Future: Scheduled Sync (Phase 4)

```mermaid
graph TB
    subgraph "Background Job System (Future)"
        Scheduler[APScheduler]
        Worker[Sync Worker]
    end

    Scheduler -->|Every minute| Worker
    Worker --> IO[IntegrationOperations]
    IO --> IM[InstanceManager]
    IM -->|Find instances where:<br/>- sync_enabled=true<br/>- next_sync_at <= now| YAML
    YAML --> Worker
    Worker -->|sync_now| IO

    style Scheduler fill:#fff4e6
```

## Comparison: Regular Service vs Integration

| Aspect | Regular Service (Chronicle) | Integration (Obsidian) |
|--------|---------------------------|----------------------|
| **Instance Type** | Docker container | Filesystem/API integration |
| **Status** | running/stopped | n/a (cloud/external) |
| **Operations** | Deploy/Undeploy | Test Connection/Sync |
| **State Tracking** | Container ID, deployment status | Sync status, last sync time |
| **UI Controls** | Start/Stop buttons | Test/Sync/Auto-Sync buttons |
| **Storage** | instances.yaml | instances.yaml (same file!) |
| **CRUD** | InstanceManager | InstanceManager (same service!) |

## Summary

**Core Architecture Insight**: Integrations are NOT a parallel system. They are instances with:
1. An optional discriminator field (`integration_type`)
2. Additional state fields for sync tracking
3. An extension service (`IntegrationOperations`) for sync logic
4. Type-specific adapters for data transformation

This design achieves **zero code duplication** while providing full integration capabilities.
