# Service Integration Checklist for AI Agents

## CRITICAL: Read This Before Adding Service Endpoints

This document explains the ushadow service integration architecture and provides a checklist for AI agents working on service integrations.

## The Generic Proxy Architecture

**ushadow uses a generic proxy pattern - you should NEVER add custom service endpoints.**

### How It Works

1. **Generic Proxy Endpoint**: `/api/services/{service-name}/proxy/{path:path}`
   - Automatically forwards ALL HTTP requests to any managed service
   - Handles authentication (JWT forwarding)
   - Provides service discovery (no hardcoded ports)
   - Eliminates CORS issues

2. **Connection Info Endpoint**: `/api/services/{service-name}/connection-info`
   - Returns `proxy_url` for REST APIs
   - Returns `direct_url` for WebSocket/streaming
   - Returns `port` for local development

### Example: Adding Chronicle Support

❌ **WRONG - Adding custom endpoints**:
```python
# DON'T DO THIS!
@router.get("/api/chronicle/conversations")
async def get_conversations():
    # Custom proxy implementation
    pass

@router.get("/api/chronicle/conversations/{id}")
async def get_conversation(id: str):
    # Another custom proxy
    pass
```

✅ **RIGHT - Use generic proxy**:
```typescript
// Frontend just uses the generic proxy
const info = await getConnectionInfo('chronicle-backend')
const proxyUrl = info.proxy_url  // '/api/services/chronicle-backend/proxy'

// All Chronicle endpoints work automatically
axios.get(`${proxyUrl}/api/conversations`)           // ✓ Works
axios.get(`${proxyUrl}/api/conversations/123`)       // ✓ Works
axios.post(`${proxyUrl}/api/conversations/123/...`)  // ✓ Works
```

## Pre-Integration Checklist

Before adding ANY service integration code, complete these steps:

### 1. Check Existing Swagger Docs

```bash
# Get ushadow backend OpenAPI spec
curl -s http://localhost:${BACKEND_PORT}/openapi.json | jq '.paths | keys'

# Look for existing endpoints that might be duplicates
# Search for patterns like:
#   /api/services/{name}/proxy/{path}  ← Generic proxy (exists!)
#   /api/{service-name}/*              ← Potential duplicates (avoid!)
```

### 2. Verify Service Has Swagger Docs

```bash
# Most services expose swagger at /docs
# Check the service's port from connection-info
curl -s http://localhost:${BACKEND_PORT}/api/services/${SERVICE_NAME}/connection-info | jq .port

# View service swagger
# http://localhost:${SERVICE_PORT}/docs
```

### 3. Test Generic Proxy First

```bash
# Get the proxy URL
PROXY_URL="/api/services/${SERVICE_NAME}/proxy"

# Test if generic proxy already works
curl "http://localhost:${BACKEND_PORT}${PROXY_URL}/health"
curl "http://localhost:${BACKEND_PORT}${PROXY_URL}/api/some-endpoint"
```

## When Custom Endpoints Are Acceptable

There are RARE cases where custom endpoints are needed:

1. **Transformation Layer**: Service returns data that needs transformation before frontend can use it
2. **Aggregation**: Combining data from multiple services
3. **Complex Auth Logic**: Service requires special auth handling beyond JWT forwarding
4. **Legacy Compatibility**: Maintaining backward compatibility during migration

**If you think you need custom endpoints, document WHY in the router file.**

## Frontend Integration Pattern

### Correct Pattern for New Services

```typescript
// 1. Create API client file (e.g., services/myServiceApi.ts)
interface ConnectionInfo {
  service: string
  proxy_url: string    // For REST APIs
  direct_url: string   // For WebSocket/streaming
  port: number
  available: boolean
}

let connectionCache: ConnectionInfo | null = null

export async function getMyServiceConnection(): Promise<ConnectionInfo> {
  if (connectionCache) return connectionCache

  const response = await api.get('/api/services/my-service/connection-info')
  connectionCache = response.data
  return connectionCache
}

export const myServiceApi = {
  async getItems() {
    const { proxy_url } = await getMyServiceConnection()
    return api.get(`${proxy_url}/api/items`)
  },

  async getItem(id: string) {
    const { proxy_url } = await getMyServiceConnection()
    return api.get(`${proxy_url}/api/items/${id}`)
  },

  // WebSocket example
  async connectWebSocket() {
    const { direct_url } = await getMyServiceConnection()
    const wsUrl = direct_url.replace('https:', 'wss:').replace('http:', 'ws:')
    return new WebSocket(`${wsUrl}/ws`)
  }
}
```

## Debugging Integration Issues

### Issue: "Service endpoints don't work"

1. **Check if service is running**:
   ```bash
   curl http://localhost:${BACKEND_PORT}/api/services/${SERVICE_NAME}/status
   ```

2. **Verify docker network connectivity**:
   ```bash
   # Check if backend can reach service container
   docker exec -it ${PROJECT_NAME}-backend curl http://${SERVICE_NAME}:8000/health
   ```

3. **Check generic proxy**:
   ```bash
   # Test with a simple endpoint
   curl http://localhost:${BACKEND_PORT}/api/services/${SERVICE_NAME}/proxy/health
   ```

4. **Review proxy logs**:
   ```bash
   docker logs ${PROJECT_NAME}-backend | grep "proxy"
   ```

### Issue: "Frontend can't fetch data"

1. **Verify connection-info endpoint**:
   ```bash
   curl http://localhost:${BACKEND_PORT}/api/services/${SERVICE_NAME}/connection-info | jq
   ```

2. **Check browser console** for CORS errors

3. **Verify JWT token** is being sent in Authorization header

## Service Swagger Documentation

Every service card now has an "API" button that opens `/docs` for running services.

To test your service's swagger docs:
```bash
# Get service port
PORT=$(curl -s http://localhost:${BACKEND_PORT}/api/services/${SERVICE_NAME}/connection-info | jq -r .port)

# Open swagger UI
open "http://localhost:${PORT}/docs"
```

## Summary: The Golden Rule

**Before adding ANY service integration code:**

1. ✅ Check swagger docs at `http://localhost:${BACKEND_PORT}/docs`
2. ✅ Look for `/api/services/{name}/proxy` endpoint
3. ✅ Test if generic proxy already works for your use case
4. ✅ Only add custom endpoints if you have a documented reason

**Remember**: The generic proxy already exists and handles 99% of service integration needs!

## Files to Check Before Making Changes

- `/ushadow/backend/src/routers/services.py` - Generic proxy implementation
- `/ushadow/backend/src/routers/{service}.py` - Check for existing custom endpoints
- `/ushadow/frontend/src/services/api.ts` - Generic API client
- `/ushadow/frontend/src/services/{service}Api.ts` - Service-specific API clients
- `http://localhost:${BACKEND_PORT}/docs` - Current API endpoints

## Questions?

If you're unsure whether to add custom endpoints:
1. Test the generic proxy first
2. Document your use case
3. Consider if transformation/aggregation can be done in the frontend
4. Ask for review if still uncertain
