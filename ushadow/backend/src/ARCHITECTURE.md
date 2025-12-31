# Backend Architecture

This document defines the layer responsibilities for the `src/` directory.

## Layer Definitions

### `routers/` - HTTP Transport Layer

**Purpose**: Thin HTTP adapters that translate HTTP requests into service calls.

**Responsibilities**:
- Define FastAPI routes and HTTP methods
- Parse request parameters and body
- Validate request schemas (Pydantic)
- Call services/stores to perform work
- Format and return HTTP responses
- Handle HTTP-specific concerns (status codes, headers)

**Should NOT**:
- Contain business logic
- Access databases or files directly
- Perform complex transformations
- Make decisions about data routing

**Example**: `settings.py` should call `SettingsStore.get()` and return the result, not implement config merging logic.

---

### `services/` - Business Logic Layer

**Purpose**: Orchestrate complex operations, coordinate between stores, and implement business rules.

**Naming Conventions**:
| Suffix | Use When | Example |
|--------|----------|---------|
| `Manager` | Coordinating operations on external resources (Docker, K8s) | `DockerManager`, `KubernetesManager` |
| `Registry` | In-memory lookup/catalog of items loaded from config | `ProviderRegistry`, `ServiceRegistry` |
| `Service` | Business logic that coordinates multiple concerns | `AuthService` |
| `Resolver` | Computing/deriving values from other data | `CapabilityResolver` |

**Responsibilities**:
- Implement business rules and workflows
- Coordinate between multiple stores/registries
- Handle complex operations that span multiple resources
- Manage external service integrations (Docker, K8s)

---

### `models/` - Data Structures

**Purpose**: Define the shape of data used throughout the application.

**Contains**:
- Pydantic models for API request/response validation
- Dataclasses for internal data structures
- Enums for constrained values
- Type definitions

**Should NOT**:
- Contain business logic
- Perform I/O operations
- Have dependencies on services or stores

---

### `config/` - Configuration Layer

**Purpose**: Load, validate, and provide access to application configuration.

**Naming Conventions**:
| Suffix | Use When | Example |
|--------|----------|---------|
| `Store` | Read/write to persistent storage (files, DB) | `SettingsStore` |
| `Settings` | Pydantic settings from environment variables | `InfraSettings` |

**Contains**:
- Settings classes that load from env vars (`InfraSettings`)
- Config stores that load/save YAML files (`SettingsStore`)
- Secret handling utilities
- YAML parsing utilities

---

### `utils/` - Shared Utilities

**Purpose**: Stateless helper functions used across multiple layers.

**Contains**:
- Pure functions with no side effects
- String/data manipulation helpers
- Formatting utilities

**Should NOT**:
- Maintain state
- Perform I/O operations
- Have dependencies on other layers

---

### `middleware/` - HTTP Middleware

**Purpose**: Cross-cutting concerns that apply to all HTTP requests.

**Contains**:
- Authentication/authorization checks
- Request logging
- Error handling
- CORS configuration

---

## Naming Anti-Patterns

### Avoid "Manager" as a Catch-All

"Manager" is often overused because it's vague. Before using it, consider:

| Instead of... | Consider... | When... |
|---------------|-------------|---------|
| `ConfigManager` | `ConfigStore` | It reads/writes to storage |
| `ConfigManager` | `ConfigService` | It has complex business logic |
| `ConfigManager` | `ConfigRegistry` | It's an in-memory lookup |
| `UserManager` | `UserRepository` | It's CRUD on a database |

**Use "Manager" when**: The class truly manages lifecycle of external resources (containers, processes, connections).

---

## Data Flow

```
HTTP Request
    │
    ▼
┌─────────────┐
│   Router    │  ← Thin HTTP adapter
└─────────────┘
    │
    ▼
┌─────────────┐
│   Service   │  ← Business logic (if needed)
└─────────────┘
    │
    ▼
┌─────────────┐
│ Store/Repo  │  ← Persistent storage
└─────────────┘
    │
    ▼
  YAML/DB/API
```

For simple CRUD, routers can call stores directly (skip service layer).
