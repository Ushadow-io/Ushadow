# uShadow Architecture vs Full-Stack Block Design: Parallel Analysis

## Summary

uShadow is the working prototype that the Full-Stack Block Architecture spec aims to
generalize. The codebase has organically built the **runtime** half of the block system
(capability-based composition, provider abstraction, dynamic wiring, container
orchestration) but has not yet formalized the **packaging** half (self-contained block
units, typed I/O schemas, version contracts, cross-team registry).

---

## Parallel Mapping

### 1. Manifest / Contract

| Block Spec | uShadow Equivalent |
|---|---|
| `manifest.yaml` per block | `x-ushadow` in compose files + `config/capabilities.yaml` + `config/providers/*.yaml` |
| `inputs` / `outputs` | `requires`, `optional`, `provides` in `x-ushadow` metadata |
| `exposes` | `exposes` array with type, path, port, protocol metadata |
| `requires` (infra) | `infra_services` in `x-ushadow` namespace |

**Example** (`compose/chronicle-compose.yaml`):
```yaml
x-ushadow:
  chronicle-backend:
    requires: [llm, transcription]
    optional: [memory]
    exposes:
      - name: audio_intake
        type: audio
        path: /ws
        port: 8000
        metadata:
          protocol: wyoming
          formats: [pcm, opus]
```

**Difference**: The block spec uses a single manifest per block. uShadow distributes
the contract across three layers: compose metadata (service needs), capabilities file
(interface shape), and provider YAML (implementations). This three-layer split is more
flexible but harder for external teams to reason about in isolation.

### 2. Block = Compose Service + Frontend

| Block Spec | uShadow Equivalent |
|---|---|
| `recording-block/frontend/` | Host app pages (`ChroniclePage.tsx`) + standalone WebUI container |
| `recording-block/backend/` | Compose service containers (`chronicle-backend`, `chronicle-workers`) |
| `@blocks/recording` npm import | Direct component imports in host app |

**Gap**: In the block spec, frontend is packaged inside the block (`@blocks/recording`).
In uShadow, each service has two frontend surfaces: a standalone container UI
(e.g., `chronicle-webui`) and integration pages in the host app
(`ushadow/frontend/src/pages/ChroniclePage.tsx`). There is no `@blocks/*` npm
package system.

### 3. Contract Enforcement

| Block Spec | uShadow Equivalent |
|---|---|
| Schema validation at wire time | `CapabilityResolver` + `ProviderRegistry` |
| `transcript.v1` schema matching | Implicit via env var injection and HTTP endpoint conventions |

**How it works in uShadow**:
1. `ProviderRegistry` (`provider_registry.py`) loads `config/providers/*.yaml`, indexes by capability
2. `CapabilityResolver` (`capability_resolver.py`) reads a service's `requires`, looks up wired provider, resolves credentials, produces env var dict
3. `wiring.yaml` binds source providers to target services explicitly

**Gap**: This is runtime contract enforcement via environment variables. There is no
schema-level validation (e.g., verifying that a transcription provider's output format
matches what the consuming service expects at deploy time).

### 4. Block Runtime / Discovery

| Block Spec | uShadow Equivalent |
|---|---|
| Block discovery mechanism | `ComposeRegistry` scans `compose/*.yaml`, parses `x-ushadow` |
| Redis Streams universal bus | Mixed: REST for request-response, WebSocket for audio, Redis for job queues |
| Service mesh / sidecar | Docker shared network (`ushadow-network`), container-name DNS |

**Key detail**: `compose_registry.py` uses compose files as the source of truth for
service discovery. Services find each other by container name on the shared Docker
network (e.g., `http://mem0:8765`). No service mesh or message broker for primary flows.

### 5. Block Registry

| Block Spec | uShadow Equivalent |
|---|---|
| Private npm + container registry | `compose/` directory + `ghcr.io/ushadow-io/*` images |
| Block versioning | Container image tags (mostly `latest`) |
| Dependency resolution | `infra_services` + capability `requires` |

**Gap**: No formal block registry exists. Adding a new service means dropping a compose
file into `compose/`. No version negotiation or contract compatibility checking.

### 6. Configuration

| Block Spec | uShadow Equivalent |
|---|---|
| Env vars / Consul / manifest config | Layered: `config.defaults.yaml` -> `providers/*.yaml` -> `wiring.yaml` -> MongoDB settings -> `CapabilityResolver` env injection |

uShadow's configuration system is more sophisticated than what the block spec proposes.
It is a full dependency injection system for containerized services with multi-source
credential resolution.

### 7. Infrastructure Platform

| Block Spec | uShadow Equivalent |
|---|---|
| `requires: [redis-stream, storage]` | `infra_services: ["qdrant", "neo4j"]` in `x-ushadow` |
| Shared infra | `compose/docker-compose.infra.yml` with profiles (mongo, redis, qdrant, postgres, neo4j, keycloak) |

Clean 1:1 mapping. Services declare infrastructure dependencies, platform provides them.

---

## What uShadow Has That Blocks Don't Yet Specify

1. **Multi-node deployment**: Tailscale networking + `unode_manager.py` for deploying services to remote nodes
2. **Kubernetes integration**: `kubernetes_manager.py` for K8s deployment alongside Docker
3. **Wiring UI**: Frontend `CapabilitySelector` and `wiring/` components for visual provider binding
4. **Feature flags**: `feature_flags.yaml` for progressive rollout
5. **Auth/sharing**: Keycloak SSO + `ShareToken` model with fine-grained permissions

## What the Block Spec Adds That uShadow Lacks

1. **Typed I/O schemas**: `transcript.v1` format contracts with explicit versioning
2. **Packaged frontend**: `@blocks/*` npm imports instead of host-app-embedded pages
3. **Single manifest**: Unified `manifest.yaml` vs distributed contract across 3+ files
4. **Cross-team publishing**: Registry model where Chronicle/Mycelia teams publish independently
5. **Version negotiation**: Breaking change handling at the contract boundary

---

## Path from uShadow to Generalized Blocks

1. **Promote `x-ushadow` to standalone manifest**: Extract from compose files into per-block `manifest.yaml` with the full contract (inputs, outputs, schemas, frontend exports)
2. **Package frontend as npm modules**: Move host-app integration pages into block packages as `@blocks/{name}` exports
3. **Add schema validation**: Define typed schemas for block I/O (e.g., `transcript.v1.json`) and validate at wiring time in `CapabilityResolver`
4. **Formalize block registry**: Private npm scope + container registry with version pinning
5. **Keep the runtime**: Docker Compose + shared networks + `CapabilityResolver` is already the right deployment model
