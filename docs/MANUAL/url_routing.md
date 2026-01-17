# URL Routing Architecture

This document explains how requests flow from clients (mobile/web) to services in the Ushadow ecosystem.

## Table of Contents

- [Overview: Three-Layer Architecture](#overview-three-layer-architecture)
- [Layer 0: UNode Discovery](#layer-0-unode-discovery)
- [Layer 1: Tailscale Serve](#layer-1-tailscale-serve)
- [Layer 2: Generic Proxy](#layer-2-generic-proxy)
- [REST APIs vs WebSockets](#rest-apis-vs-websockets)
- [Complete Request Flow Examples](#complete-request-flow-examples)
- [Adding a New Service](#adding-a-new-service)
- [Port Resolution](#port-resolution)
- [Legacy Patterns Being Phased Out](#legacy-patterns-being-phased-out)

---

## Overview: Three-Layer Architecture

Ushadow uses a three-layer routing architecture where each layer serves a distinct purpose:

```
┌─────────────────────────────────────────────────────────────────┐
│ Layer 0: UNode Discovery                                        │
│ Purpose: Client finds which backend to connect to               │
│ Result: https://red.spangled-kettle.ts.net                      │
└─────────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│ Layer 1: Tailscale Serve                                        │
│ Purpose: External HTTPS → Internal Docker containers            │
│ Result: https://red.ts.net/api/* → http://backend:8000/api/*    │
└─────────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│ Layer 2: Generic Proxy                                          │
│ Purpose: Backend → Service containers with unified auth         │
│ Result: /api/services/mem0/proxy/* → http://mem0:8765/*         │
└─────────────────────────────────────────────────────────────────┘
```

**All three layers are necessary** - each solves a different problem.

---

## Layer 0: UNode Discovery

### Purpose
Mobile/desktop clients need to discover which backend to connect to. You may have multiple environments running:
- Development: `red.spangled-kettle.ts.net`
- Production: `blue.spangled-kettle.ts.net`
- Personal: `pink.spangled-kettle.ts.net`

Each environment has different services and capabilities.

### How It Works

**Mobile app stores discovered UNodes:**
```typescript
interface StoredUNode {
  id: string;
  hostname: string;
  apiUrl: string;  // "https://red.spangled-kettle.ts.net"
  tailscaleIp: string;
  authToken?: string;
}
```

**Discovery methods:**
1. **QR Code Scan** - Scan QR code from web UI, get instant credentials
2. **Tailscale Network Scan** - Scan local Tailscale network for leaders
3. **Manual Entry** - Enter hostname/IP directly

**Files involved:**
- `mobile/app/hooks/useTailscaleDiscovery.ts` - Discovery logic
- `mobile/app/utils/unodeStorage.ts` - Persistent storage
- `mobile/app/components/LeaderDiscovery.tsx` - UI component

### Result
Client knows: "I should make requests to `https://red.spangled-kettle.ts.net`"

---

## Layer 1: Tailscale Serve

### Purpose
Route external HTTPS requests from the internet into internal Docker containers.

### Why Needed
Without Tailscale Serve:
- ❌ Each service needs its own exposed port (8080, 8765, 8082...)
- ❌ No TLS/HTTPS by default
- ❌ Clients need to know all service ports
- ❌ Complex firewall rules

With Tailscale Serve:
- ✅ Single HTTPS endpoint (`https://red.spangled-kettle.ts.net`)
- ✅ Automatic TLS certificates from Tailscale
- ✅ Simple path-based routing
- ✅ WebSocket support

### Configuration

**Base routes configured by `configure_base_routes()`:**

```python
# ushadow/backend/src/services/tailscale_serve.py:297

# REST API routes (proxied through backend)
/api/*     → http://ushadow-red-backend:8000/api/*
/auth/*    → http://ushadow-red-backend:8000/auth/*

# WebSocket routes (direct to Chronicle for low latency)
/ws_pcm    → http://ushadow-red-chronicle-backend:8000/ws_pcm
/ws_omi    → http://ushadow-red-chronicle-backend:8000/ws_omi

# Frontend SPA (catches all other routes)
/*         → http://ushadow-red-webui:80/*
```

### How Routes Work

**Tailscale Serve strips the path prefix** when routing, so we include it in the target:

```bash
# Command executed:
tailscale serve https /api http://ushadow-red-backend:8000/api

# Request: https://red.ts.net/api/services/mem0/proxy/health
# Forwarded to: http://ushadow-red-backend:8000/api/services/mem0/proxy/health
#                                            ^^^^
#                                            Path preserved in target
```

### WebSocket Special Handling

WebSockets go **directly** to Chronicle, skipping the backend proxy:

```
Mobile → wss://red.ts.net/ws_pcm → Chronicle (1 hop)
```

**Not:**
```
Mobile → wss://red.ts.net/api/services/chronicle/proxy/ws_pcm → Backend → Chronicle (2 hops)
```

**Reason:** Real-time audio streaming needs minimal latency.

### Files Involved
- `ushadow/backend/src/services/tailscale_serve.py` - Route management
- `ushadow/backend/src/routers/tailscale.py` - API endpoints for wizard

---

## Layer 2: Generic Proxy

### Purpose
Route REST API requests from backend to individual service containers with:
- **Unified Authentication** - Forward JWT tokens automatically
- **No CORS Issues** - All requests from same origin
- **Service Discovery** - No hardcoded ports in client code
- **Centralized Logging** - Monitor all service requests
- **Port Resolution** - Reads correct internal ports from compose files

### How It Works

**Generic proxy endpoint:**
```python
# ushadow/backend/src/routers/services.py:454

@router.api_route("/{name}/proxy/{path:path}",
                 methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"])
async def proxy_service_request(name: str, path: str, request: Request):
    # 1. Get service ports from compose file
    ports = docker_mgr.get_service_ports(name)
    internal_port = ports[0]["container_port"]  # e.g., 8765 for mem0

    # 2. Build internal URL (Docker network DNS)
    container_name = f"{COMPOSE_PROJECT_NAME}-{name}"
    target_url = f"http://{container_name}:{internal_port}/{path}"

    # 3. Forward request with authentication
    response = await httpx.post(target_url,
                               headers=request.headers,  # JWT forwarded
                               content=body)

    return response
```

**URL pattern:**
```
/api/services/{service-name}/proxy/{service-path}
              ↑                      ↑
              Service to route to    Path on that service
```

**Example:**
```
GET /api/services/mem0/proxy/api/v1/memories
    Routes to: http://ushadow-red-mem0:8765/api/v1/memories
```

### Why Not Just Call Services Directly?

Without the proxy:

```typescript
// ❌ Client would need to know all service ports
const mem0Response = await fetch('https://red.ts.net:8765/api/v1/memories', {
  headers: { Authorization: `Bearer ${token}` }
});

const chronicleResponse = await fetch('https://red.ts.net:8082/api/conversations', {
  headers: { Authorization: `Bearer ${token}` }
});

// Issues:
// - CORS preflight on every service
// - Port numbers exposed to clients
// - Each service must handle auth independently
// - No central logging
```

With the proxy:

```typescript
// ✅ Unified routing through backend
const mem0Response = await fetch(
  'https://red.ts.net/api/services/mem0/proxy/api/v1/memories',
  { headers: { Authorization: `Bearer ${token}` } }
);

const chronicleResponse = await fetch(
  'https://red.ts.net/api/services/chronicle-backend/proxy/api/conversations',
  { headers: { Authorization: `Bearer ${token}` } }
);

// Benefits:
// - Same origin, no CORS
// - No port numbers needed
// - Backend handles auth forwarding
// - All requests logged centrally
```

### Supported Methods
- GET, POST, PUT, DELETE, PATCH, OPTIONS ✅
- WebSocket upgrade ❌ (see next section)

---

## REST APIs vs WebSockets

### Why WebSockets Need Direct Routes

The generic proxy **only supports REST APIs**, not WebSocket connections.

#### WebSocket Requirements

WebSocket upgrade handshake:
```
GET /ws_pcm HTTP/1.1
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
Sec-WebSocket-Version: 13
```

To proxy WebSockets, the backend would need to:
1. Detect WebSocket upgrade requests
2. Forward the upgrade handshake
3. Keep the connection open bidirectionally
4. Stream binary audio data in both directions
5. Handle connection lifecycle for both ends

**This is complex!** Much simpler to route WebSockets directly.

#### Latency Matters

**Direct routing (current):**
```
Mobile → Tailscale Serve → Chronicle
        (1 hop)
```

**Through proxy:**
```
Mobile → Tailscale Serve → Backend → Chronicle
        (2 hops)
```

For real-time audio streaming, every millisecond matters. Adding an extra hop increases latency and could cause audio jitter.

### Routing Decision Tree

```
Is it a REST API call (GET/POST/PUT/DELETE)?
├─ Yes → Use generic proxy: /api/services/{name}/proxy/*
│        Benefits: Auth, logging, discovery, CORS handling
│
└─ No → Is it a WebSocket?
    └─ Yes → Use direct Tailscale route: /ws_pcm, /ws_omi
             Benefits: Low latency, native WebSocket support
```

---

## Complete Request Flow Examples

### Example 1: Fetch Memories (REST API)

**Mobile app code:**
```typescript
// mobile/app/services/memoriesApi.ts

const apiUrl = `${unode.apiUrl}/api/services/mem0/proxy`;
const response = await fetch(`${apiUrl}/api/v1/memories/filter`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ user_id: 'user@example.com', page: 1, size: 100 })
});
```

**Request flow:**
```
┌─────────────────────────────────────────────────────────────────────────┐
│ 1. Mobile App (Layer 0 - UNode Discovery)                              │
│    POST https://red.spangled-kettle.ts.net/api/services/mem0/proxy/... │
│    Headers: Authorization: Bearer eyJhbG...                             │
└─────────────────────────────────────────────────────────────────────────┘
                                   ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ 2. Tailscale Serve (Layer 1 - External → Internal)                     │
│    Route: /api/* → http://ushadow-red-backend:8000/api/*               │
│    Result: POST http://ushadow-red-backend:8000/api/services/mem0/...  │
└─────────────────────────────────────────────────────────────────────────┘
                                   ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ 3. Generic Proxy (Layer 2 - Backend → Service)                         │
│    services.py:proxy_service_request()                                 │
│    • Parse: name="mem0", path="api/v1/memories/filter"                 │
│    • Get ports from compose file: container_port=8765                  │
│    • Build: http://ushadow-red-mem0:8765/api/v1/memories/filter        │
│    • Forward: Authorization header + POST body                         │
└─────────────────────────────────────────────────────────────────────────┘
                                   ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ 4. mem0 Service Container                                              │
│    Receives: POST /api/v1/memories/filter                              │
│    Validates JWT, queries Qdrant vector DB                             │
│    Responds: { items: [...], total: 42, page: 1 }                      │
└─────────────────────────────────────────────────────────────────────────┘
```

**Backend logs:**
```
INFO: Proxying POST /api/services/mem0/proxy/api/v1/memories/filter
      -> http://ushadow-red-mem0:8765/api/v1/memories/filter
INFO: [PROXY] Forwarding auth: Bearer eyJhbG...
INFO: [PROXY] mem0 response: 200
```

### Example 2: WebSocket Audio Streaming

**Mobile app code:**
```typescript
// mobile/app/components/streaming/UnifiedStreamingPage.tsx

const wsUrl = `wss://red.spangled-kettle.ts.net/ws_pcm?token=${token}`;
const websocket = new WebSocket(wsUrl);

websocket.onopen = () => {
  // Start streaming PCM audio
  websocket.send(audioBuffer);
};
```

**Request flow:**
```
┌─────────────────────────────────────────────────────────────────────────┐
│ 1. Mobile App (Layer 0 - UNode Discovery)                              │
│    WSS wss://red.spangled-kettle.ts.net/ws_pcm?token=...               │
└─────────────────────────────────────────────────────────────────────────┘
                                   ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ 2. Tailscale Serve (Layer 1 - External → Internal)                     │
│    Direct route: /ws_pcm → http://ushadow-red-chronicle-backend:8000   │
│    Result: WebSocket connection to Chronicle                           │
│    (NO Layer 2 - skips backend proxy for low latency!)                 │
└─────────────────────────────────────────────────────────────────────────┘
                                   ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ 3. Chronicle Backend Container                                         │
│    WebSocket endpoint: /ws_pcm                                          │
│    Validates token, starts transcription job                           │
│    Streams back transcription results in real-time                     │
└─────────────────────────────────────────────────────────────────────────┘
```

**Key difference:** WebSocket skips Layer 2 (generic proxy) for minimal latency.

---

## Adding a New Service

To add a new service with automatic routing:

### 1. Create Compose File

**`compose/myservice-compose.yaml`:**
```yaml
x-ushadow:
  myservice:
    display_name: "My Service"
    description: "What this service does"
    requires: [llm]  # Capabilities needed
    provides: myservice  # Optional: capability this implements

services:
  myservice:
    image: ghcr.io/myorg/myservice:latest
    container_name: ${COMPOSE_PROJECT_NAME:-ushadow}-myservice
    ports:
      - "${MYSERVICE_PORT:-9000}:8080"
    #      ^^^^^^^^^^^^^^^^^^^^^^  ^^^^^
    #      External (env var)      Internal port
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    networks:
      - infra-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3

networks:
  infra-network:
    name: infra-network
    external: true
```

**Key requirements:**
- `container_name`: Must be `${COMPOSE_PROJECT_NAME}-{service-name}` for DNS
- `ports`: Format is `"${ENV_VAR:-default}:internal_port"`
- `networks`: Must include `infra-network` for Docker DNS
- Port syntax: The internal port (after `:`) is what the service listens on

### 2. Client API Setup

**Mobile: `mobile/app/services/myserviceApi.ts`:**
```typescript
import { getAuthToken, getApiUrl } from '../utils/authStorage';
import { getActiveUnode } from '../utils/unodeStorage';

async function getMyServiceApiUrl(): Promise<string> {
  const activeUnode = await getActiveUnode();

  // Uses generic proxy pattern - works for ANY service
  if (activeUnode?.apiUrl) {
    return `${activeUnode.apiUrl}/api/services/myservice/proxy`;
  }

  const storedUrl = await getApiUrl();
  if (storedUrl) {
    return `${storedUrl}/api/services/myservice/proxy`;
  }

  return 'https://default.ts.net/api/services/myservice/proxy';
}

async function apiRequest(endpoint: string, options = {}) {
  const apiUrl = await getMyServiceApiUrl();
  const token = await getAuthToken();

  const url = `${apiUrl}${endpoint}`;

  return fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
}

export async function getMyData() {
  return apiRequest('/api/data');
  // Routes to: http://ushadow-red-myservice:8080/api/data
}
```

### 3. That's It!

**Routing works automatically:**
- ✅ Service discovered from compose file
- ✅ Ports parsed (external: 9000, internal: 8080)
- ✅ Generic proxy routes requests to `http://ushadow-red-myservice:8080`
- ✅ Tailscale Serve already routes `/api/*` to backend
- ✅ No code changes needed in backend
- ✅ Clients use same `/api/services/{name}/proxy/*` pattern

**Complete URL:**
```
https://red.spangled-kettle.ts.net/api/services/myservice/proxy/api/data
        ↓                          ↓                              ↓
    Tailscale hostname     Generic proxy pattern        Service endpoint
```

---

## Port Resolution

### How Ports Are Parsed

**Compose file:**
```yaml
services:
  mem0:
    ports:
      - "${OPENMEMORY_PORT:-8765}:8765"
    #      ^^^^^^^^^^^^^^^^^^^^  ^^^^^
    #      host (external)       container (internal)
```

**Parsing flow:**
```
compose/openmemory-compose.yaml
  └─> ComposeParser._parse_ports()
        └─> Extracts: {host: "${OPENMEMORY_PORT:-8765}", container: "8765"}
            └─> docker_manager.get_service_ports()
                  └─> Resolves: {
                        port: 8765,              # External (host)
                        container_port: 8765,    # Internal (container)
                        env_var: "OPENMEMORY_PORT",
                        default_port: 8765
                      }
                      └─> services.py:492 proxy_service_request()
                            internal_port = ports[0]["container_port"]  # 8765
                            └─> Routes to: http://ushadow-red-mem0:8765
```

**Why both ports matter:**
- **External port (`port`)**: What users connect to on host machine
  - Example: `localhost:8765` on your development machine
  - Used for direct access outside Docker network

- **Internal port (`container_port`)**: What container listens on
  - Example: Container listens on `8765` inside Docker network
  - Used by backend proxy to route requests
  - **This is what was broken** before the fix (was defaulting to 8000)

### Port Override

Users can override ports via settings:

```python
# Backend API
PUT /api/services/mem0/port-override
{
  "env_var": "OPENMEMORY_PORT",
  "port": 9876
}

# Saves to: services.mem0.ports.OPENMEMORY_PORT = 9876
# Next service start uses port 9876 externally
# Internal port stays 8765 (from compose file)
```

---

## Legacy Patterns Being Phased Out

### chronicleApiUrl (DEPRECATED)

**OLD way:**
```typescript
interface StoredUNode {
  apiUrl: string;              // "https://red.ts.net"
  chronicleApiUrl?: string;    // "https://red.ts.net/chronicle" ❌ LEGACY
}
```

This was used when Chronicle had its own base route (`/chronicle/*`).

**NEW way (use generic proxy):**
```typescript
// chronicleApi.ts:90
const chronicleUrl = `${activeUnode.apiUrl}/api/services/chronicle-backend/proxy`;
// Uses: https://red.ts.net/api/services/chronicle-backend/proxy
```

**Why changed:**
- Unified auth through backend
- Consistent with all other services
- Easier to add new services
- Central logging

**Migration:** Remove `chronicleApiUrl` from UNode storage. The mobile app already has fallback logic that uses the generic proxy pattern if `chronicleApiUrl` is not set.

### Direct Service Routes

**OLD way:**
```python
# Tailscale Serve had specific routes for each service
/chronicle/*    → http://chronicle-backend:8000/chronicle/*
/memories/*     → http://mem0:8765/memories/*
/obsidian/*     → http://obsidian-adapter:9000/obsidian/*
```

**NEW way:**
```python
# Single generic proxy in backend handles all services
/api/services/chronicle-backend/proxy/*  → http://chronicle-backend:8000/*
/api/services/mem0/proxy/*               → http://mem0:8765/*
/api/services/obsidian/proxy/*           → http://obsidian:9000/*

# Only WebSockets still use direct routes (for latency)
/ws_pcm         → http://chronicle-backend:8000/ws_pcm
/ws_omi         → http://chronicle-backend:8000/ws_omi
```

---

## Summary

### Three Layers, Three Purposes

| Layer | Purpose | Why Needed |
|-------|---------|------------|
| **UNode Discovery** | Client finds backend | Multiple environments, different machines |
| **Tailscale Serve** | External → Internal | Single HTTPS endpoint, TLS, WebSocket support |
| **Generic Proxy** | Backend → Services | Unified auth, no CORS, service discovery, logging |

### Routing Rules

**REST APIs:**
```
Use: /api/services/{service-name}/proxy/{endpoint}
Benefits: Auth, logging, service discovery, CORS handling
```

**WebSockets:**
```
Use: Direct Tailscale routes (/ws_pcm, /ws_omi)
Benefits: Low latency, native WebSocket support
```

### Adding New Services

1. Create compose file with proper port mapping
2. Use generic proxy pattern in client: `/api/services/{name}/proxy/*`
3. That's it! No backend code changes needed.

### Files to Know

**Backend:**
- `ushadow/backend/src/routers/services.py:454` - Generic proxy implementation
- `ushadow/backend/src/services/tailscale_serve.py:297` - Base route configuration
- `ushadow/backend/src/services/docker_manager.py:722` - Port resolution
- `ushadow/backend/src/config/yaml_parser.py:516` - Compose port parsing

**Mobile:**
- `mobile/app/services/memoriesApi.ts` - Example service API (mem0)
- `mobile/app/services/chronicleApi.ts` - Example service API (Chronicle)
- `mobile/app/hooks/useTailscaleDiscovery.ts` - UNode discovery
- `mobile/app/utils/unodeStorage.ts` - UNode persistence

**Frontend:**
- `frontend/src/services/api.ts` - Unified API client with proxy patterns
