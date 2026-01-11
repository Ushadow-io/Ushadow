# Service Integration Guide

## Overview

Ushadow provides a **generic two-tier architecture** for integrating any microservice. This allows developers to easily add menu items and features that connect to new services without hardcoding URLs or ports.

## Two-Tier Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  CONTROL PLANE (REST APIs)                                   │
│  Frontend → Ushadow Backend Proxy → Service                  │
│                                                               │
│  Use for: Menu items, CRUD, configuration, status            │
│  Benefits: Unified auth, no CORS, centralized logging        │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  DATA PLANE (Real-time Streaming)                            │
│  Frontend → Service (Direct Connection)                      │
│                                                               │
│  Use for: WebSocket, SSE, audio streaming (ws_pcm)           │
│  Benefits: Low latency, no proxy bottleneck                  │
└──────────────────────────────────────────────────────────────┘
```

---

## Quick Start: Adding a New Service

### 1. Add Service to Docker Compose

```yaml
# docker-compose.yml or docker-compose.services.yml
services:
  my-new-service:
    image: my-service:latest
    container_name: my-new-service
    ports:
      - "${MY_SERVICE_PORT:-9000}:8000"  # external:internal
    networks:
      - ushadow-network
    environment:
      - AUTH_SECRET_KEY=${AUTH_SECRET_KEY}  # Share auth with ushadow
```

**Port Convention:**
- Internal port: Usually `8000` (inside container)
- External port: Configurable via env var (default in compose)
- User can override via Settings or `.env` file

### 2. Get Connection Info (Frontend)

```typescript
// Fetch connection information
const info = await api.get('/api/services/my-new-service/connection-info')

/* Response:
{
  "service": "my-new-service",
  "proxy_url": "/api/services/my-new-service/proxy",
  "direct_url": "http://localhost:9000",
  "port": 9000,
  "available": true,
  "usage": {
    "rest_api": "Use proxy_url: axios.get('/api/services/my-new-service/proxy/api/endpoint')",
    "websocket": "Use direct_url: new WebSocket('ws://localhost:9000/ws')",
    "streaming": "Use direct_url: EventSource('http://localhost:9000/stream')"
  }
}
*/
```

### 3. Use Proxy for REST APIs (Control Plane)

```typescript
// frontend/src/services/myServiceApi.ts
import { api } from './api'  // Ushadow's authenticated axios instance

export const myServiceApi = {
  // ✅ CORRECT - Use proxy for REST APIs
  async getData() {
    const response = await api.get('/api/services/my-new-service/proxy/api/data')
    return response.data
  },

  async createItem(item: any) {
    const response = await api.post('/api/services/my-new-service/proxy/api/items', item)
    return response.data
  },

  async updateStatus(id: string, status: string) {
    const response = await api.put(
      `/api/services/my-new-service/proxy/api/items/${id}`,
      { status }
    )
    return response.data
  }
}
```

**How it works:**
```
Frontend Request:
  axios.get('/api/services/my-new-service/proxy/api/data')
    ↓
Ushadow Backend (proxy_service_request):
  Forwards to http://my-new-service:8000/api/data
    ↓
Service responds
    ↓
Proxy returns response to frontend
```

### 4. Use Direct Connection for Streaming (Data Plane)

```typescript
// frontend/src/services/myServiceStreaming.ts
import { api } from './api'

export class MyServiceStreaming {
  private ws: WebSocket | null = null
  private directUrl: string | null = null

  async connect() {
    // Get direct URL from connection-info
    const info = await api.get('/api/services/my-new-service/connection-info')
    this.directUrl = info.data.direct_url

    // ✅ CORRECT - Use direct URL for WebSocket
    this.ws = new WebSocket(`ws://localhost:${info.data.port}/ws`)

    this.ws.onmessage = (event) => {
      // Handle real-time data
      console.log('Received:', event.data)
    }

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error)
    }
  }

  disconnect() {
    this.ws?.close()
  }
}
```

---

## Complete Example: Chronicle Integration

### Backend (Already Done)

Chronicle is configured in `docker-compose.services.yml`:

```yaml
services:
  chronicle-backend:
    ports:
      - "${CHRONICLE_PORT:-8080}:8000"
    networks:
      - ushadow-network
```

### Frontend Setup

```typescript
// 1. Get connection info
const info = await api.get('/api/services/chronicle-backend/connection-info')

// 2. Control plane - REST APIs (proxied)
const chronicleRestApi = {
  // ✅ Use proxy_url for CRUD operations
  getConversations: () =>
    api.get(`${info.proxy_url}/api/conversations`),

  getConversation: (id: string) =>
    api.get(`${info.proxy_url}/api/conversations/${id}`),

  deleteConversation: (id: string) =>
    api.delete(`${info.proxy_url}/api/conversations/${id}`),
}

// 3. Data plane - WebSocket streaming (direct)
class ChronicleStreaming {
  private ws: WebSocket

  constructor(port: number) {
    // ✅ Use direct_url for WebSocket streaming
    this.ws = new WebSocket(`ws://localhost:${port}/ws_pcm`)
  }

  sendAudio(data: ArrayBuffer) {
    this.ws.send(data)
  }
}
```

---

## Adding a Menu Item

### 1. Add to Frontend Navigation

```typescript
// frontend/src/components/layout/Sidebar.tsx
const menuItems = [
  // ... existing items
  {
    name: 'My Service',
    path: '/my-service',
    icon: <MyServiceIcon />,
  },
]
```

### 2. Create Page Component

```typescript
// frontend/src/pages/MyServicePage.tsx
import { useState, useEffect } from 'react'
import { api } from '../services/api'
import { myServiceApi } from '../services/myServiceApi'

export default function MyServicePage() {
  const [data, setData] = useState([])
  const [connectionInfo, setConnectionInfo] = useState(null)

  useEffect(() => {
    // Get connection info
    api.get('/api/services/my-new-service/connection-info')
      .then(res => setConnectionInfo(res.data))
      .catch(err => console.error('Service unavailable:', err))

    // Load data via proxy
    myServiceApi.getData()
      .then(setData)
      .catch(err => console.error('Failed to load data:', err))
  }, [])

  return (
    <div>
      <h1>My Service</h1>
      {/* Use data from proxied API */}
      {data.map(item => <div key={item.id}>{item.name}</div>)}
    </div>
  )
}
```

### 3. Add Route

```typescript
// frontend/src/App.tsx
import MyServicePage from './pages/MyServicePage'

<Routes>
  {/* ... existing routes */}
  <Route path="/my-service" element={<MyServicePage />} />
</Routes>
```

---

## Best Practices

### ✅ DO

1. **Use proxy for REST APIs**
   ```typescript
   api.get('/api/services/my-service/proxy/api/endpoint')
   ```

2. **Use direct connection for WebSocket/streaming**
   ```typescript
   new WebSocket(`ws://localhost:${port}/ws`)
   ```

3. **Get connection info once, cache it**
   ```typescript
   const info = await api.get('/api/services/my-service/connection-info')
   localStorage.setItem('my-service-port', info.data.port)
   ```

4. **Handle service unavailability**
   ```typescript
   if (!info.data.available) {
     return <ServiceUnavailableCard serviceName="My Service" />
   }
   ```

5. **Share AUTH_SECRET_KEY for unified auth**
   ```yaml
   environment:
     - AUTH_SECRET_KEY=${AUTH_SECRET_KEY}
   ```

### ❌ DON'T

1. **Don't hardcode ports**
   ```typescript
   // ❌ BAD
   const url = 'http://localhost:8080'

   // ✅ GOOD
   const info = await api.get('/api/services/chronicle/connection-info')
   const url = info.data.direct_url
   ```

2. **Don't use direct URLs for REST APIs**
   ```typescript
   // ❌ BAD - Creates CORS issues, separate auth
   axios.get('http://localhost:8080/api/data')

   // ✅ GOOD - Proxied through ushadow
   api.get('/api/services/my-service/proxy/api/data')
   ```

3. **Don't use proxy for WebSocket**
   ```typescript
   // ❌ BAD - Proxy doesn't support WebSocket
   new WebSocket('ws://localhost:8050/api/services/my-service/proxy/ws')

   // ✅ GOOD - Direct connection
   new WebSocket(`ws://localhost:${port}/ws`)
   ```

4. **Don't use localhost in backend code**
   ```python
   # ❌ BAD - Won't work from container
   CHRONICLE_URL = "http://localhost:8080"

   # ✅ GOOD - Use Docker network
   CHRONICLE_URL = "http://chronicle-backend:8000"
   ```

---

## Port Configuration

### User Can Override Ports

Users can override service ports in three ways:

#### 1. Environment Variable (.env file)

```bash
# .env
CHRONICLE_PORT=8082
MY_SERVICE_PORT=9001
```

#### 2. Settings UI

```
Settings → Services → Chronicle → Port Override → 8082
```

#### 3. connection-info Respects Overrides

```typescript
// Frontend automatically gets the correct port
const info = await api.get('/api/services/chronicle-backend/connection-info')
console.log(info.data.port)  // 8082 (user's override)
```

---

## Authentication

Services can share authentication with ushadow by using the same `AUTH_SECRET_KEY`:

```yaml
# docker-compose.yml
services:
  backend:
    environment:
      - AUTH_SECRET_KEY=${AUTH_SECRET_KEY}

  my-service:
    environment:
      - AUTH_SECRET_KEY=${AUTH_SECRET_KEY}  # ← Same key
```

Then the JWT token works for both:

```typescript
// Frontend sends same token to both ushadow and your service
const token = localStorage.getItem('token')

// Works for ushadow
api.get('/api/users/me', { headers: { Authorization: `Bearer ${token}` } })

// Works for your service (via proxy)
api.get('/api/services/my-service/proxy/api/me')
```

---

## Debugging

### Check if Service is Running

```typescript
const info = await api.get('/api/services/my-service/connection-info')
if (!info.data.available) {
  console.error('Service is not running or not healthy')
}
```

### Test Direct Connection

```bash
# Check if service is reachable
curl http://localhost:9000/health
```

### Test Proxy Connection

```bash
# Check if proxy works
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8050/api/services/my-service/proxy/health
```

### View Docker Network

```bash
# See all services on Docker network
docker network inspect ushadow-network
```

### View Port Mappings

```bash
# See all port mappings
docker ps --format "table {{.Names}}\t{{.Ports}}"
```

---

## Summary

### For Any New Service:

1. **Add to docker-compose** with port mapping
2. **Use `/api/services/{name}/connection-info`** to get URLs
3. **Use `proxy_url`** for REST APIs (control plane)
4. **Use `direct_url`** for WebSocket/streaming (data plane)
5. **Add menu item** and page component
6. **Done!** No hardcoding, works with any port configuration

This pattern makes it **trivial to add new services** - just compose file + menu item, and you're done!
