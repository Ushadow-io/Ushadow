# Authentication Architecture with Automatic Token Bridging

## Overview

Ushadow uses **hybrid authentication** with automatic token bridging:
- Frontend authenticates via **Keycloak** (OIDC, RS256 tokens)
- Backend services (Chronicle, Mycelia) expect **service tokens** (HS256, signed with shared `AUTH_SECRET_KEY`)
- **Token bridge** automatically converts Keycloak tokens → service tokens

## Why Token Bridging?

**The Problem:**
- Keycloak issues RS256 tokens (validated with public key)
- Chronicle/Mycelia expect HS256 tokens (validated with shared secret)
- These are incompatible formats

**The Solution:**
- Proxy and audio relay endpoints automatically bridge tokens
- Frontend sends Keycloak token in `Authorization: Bearer` header
- Backend validates Keycloak token, generates service token
- Service token is forwarded to Chronicle/Mycelia
- **No frontend changes needed!**

## Architecture Diagram

```
┌──────────────┐
│   Frontend   │
│  (React SPA) │
└──────┬───────┘
       │ 1. Login with Keycloak
       │    (PKCE flow)
       ▼
┌──────────────┐
│   Keycloak   │
│  (Auth IDP)  │
└──────┬───────┘
       │ 2. Returns RS256 access token
       ▼
┌──────────────┐
│   Frontend   │ stores Keycloak token
└──────┬───────┘
       │ 3. API calls with Keycloak token
       │    Authorization: Bearer <keycloak-token>
       ▼
┌───────────────────────────────┐
│   Ushadow Backend             │
│                               │
│  ┌─────────────────────────┐  │
│  │   Token Bridge          │  │ 4. Validate Keycloak token
│  │   (Automatic)           │  │    Extract user info
│  └────────┬────────────────┘  │    Generate service token (HS256)
│           │                   │
│  ┌────────▼────────────────┐  │
│  │  Proxy / Audio Relay    │  │ 5. Forward with service token
│  └────────┬────────────────┘  │    Authorization: Bearer <service-token>
└───────────┼───────────────────┘
            │
            ▼
┌─────────────────────────────┐
│  Chronicle / Mycelia         │  6. Validate service token
│  (HS256 with AUTH_SECRET_KEY)│     Process request
└──────────────────────────────┘
```

## Token Formats

### Keycloak Token (RS256)
```json
{
  "iss": "http://localhost:8081/realms/ushadow",
  "aud": "ushadow-frontend",
  "sub": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "email": "user@example.com",
  "preferred_username": "user",
  "exp": 1738238520
}
```
- **Algorithm**: RS256 (public key cryptography)
- **Validation**: Keycloak's public key from JWKS endpoint
- **Issuer**: Keycloak realm URL
- **Audience**: `ushadow-frontend` (the OIDC client)

### Service Token (HS256)
```json
{
  "iss": "ushadow",
  "aud": ["ushadow", "chronicle"],
  "sub": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "email": "user@example.com",
  "exp": 1738238520
}
```
- **Algorithm**: HS256 (shared secret)
- **Validation**: `AUTH_SECRET_KEY` environment variable
- **Issuer**: `ushadow` (so Chronicle accepts it)
- **Audience**: `["ushadow", "chronicle"]` (multi-service)

## Automatic Bridging Endpoints

### 1. Service Proxy: `/api/services/{name}/proxy/{path}`

**Purpose**: Forward API requests to managed services (Chronicle, Mycelia, etc.)

**Token Bridging**:
- Extracts Keycloak token from `Authorization` header
- Validates and bridges to service token
- Forwards request with service token

**Example**:
```javascript
// Frontend code (NO CHANGES NEEDED)
const response = await fetch('/api/services/chronicle-backend/proxy/api/conversations', {
  headers: {
    'Authorization': `Bearer ${keycloakToken}`  // Keycloak token
  }
})
// Backend automatically bridges to service token before forwarding to Chronicle
```

### 2. Audio Relay: `/ws/audio/relay`

**Purpose**: WebSocket relay for Wyoming protocol audio (mobile → Chronicle/Mycelia)

**Token Bridging**:
- Extracts Keycloak token from query parameter `?token=`
- Validates and bridges to service token
- Forwards WebSocket connections with service token

**Example**:
```javascript
// Frontend code (NO CHANGES NEEDED)
const ws = new WebSocket(
  `/ws/audio/relay?token=${keycloakToken}&destinations=${JSON.stringify([
    { name: 'chronicle', url: 'ws://chronicle:8000/ws?codec=pcm' }
  ])}`
)
// Backend automatically bridges token before connecting to Chronicle
```

## Manual Token Bridge (Optional)

### Endpoint: `POST /api/auth/token/service-token`

**Purpose**: Manually exchange Keycloak token for service token

**When to use**:
- Custom integrations not using proxy/audio relay
- Debug/testing
- Generating service tokens for other purposes

**Example**:
```bash
curl -X POST http://localhost:8010/api/auth/token/service-token \\
  -H "Authorization: Bearer <keycloak-token>" \\
  -H "Content-Type: application/json" \\
  -d '{"audiences": ["ushadow", "chronicle"]}'
```

**Response**:
```json
{
  "service_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

**Note**: This endpoint is **OPTIONAL** now that proxy and audio relay bridge automatically.

## Testing

### Test Token Bridge

```bash
# Get Keycloak token (via frontend login or direct OIDC flow)
KEYCLOAK_TOKEN="<your-keycloak-token>"

# Test bridge endpoint
curl -H "Authorization: Bearer $KEYCLOAK_TOKEN" \\
  http://localhost:8010/api/auth/bridge-test
```

**Expected response**:
```json
{
  "success": true,
  "message": "Token bridge is working!",
  "user": {
    "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "email": "user@example.com",
    "name": "Test User",
    "username": "user"
  },
  "auth_type": "keycloak",
  "info": {
    "proxy_auto_bridge": "✓ Enabled",
    "audio_relay_auto_bridge": "✓ Enabled",
    "manual_bridge": "Available at POST /api/auth/token/service-token"
  }
}
```

## Shared AUTH_SECRET_KEY

**Multi-Environment Setup**:
- All environments (ushadow, ushadow-orange, etc.) share the **same** `AUTH_SECRET_KEY`
- Service tokens work across all environments
- No per-environment token exchange needed

**Configuration**:
```yaml
# config/SECRETS/secrets.yaml
auth:
  secret_key: "your-shared-secret-key-here"
```

**Why this works**:
- Service tokens are signed with the shared key
- Chronicle in any environment can validate the token
- Audio relay can forward the same token to multiple environments

## Implementation Details

### Token Bridge Utility

**File**: `ushadow/backend/src/services/token_bridge.py`

**Key Functions**:
```python
# Extract token from request (header or query param)
token = extract_token_from_request(request)

# Bridge Keycloak token to service token
service_token = await bridge_to_service_token(
    token,
    audiences=["ushadow", "chronicle"]
)

# Check if token is from Keycloak
is_keycloak = is_keycloak_token(token)
```

### Validation Flow

1. **Extract token** from `Authorization: Bearer <token>` or `?token=<token>`
2. **Try Keycloak validation**:
   - Decode JWT (RS256)
   - Validate issuer (Keycloak realm URL)
   - Check expiration
   - Extract user info (sub, email, name)
3. **If Keycloak token valid**:
   - Generate service token with `generate_jwt_for_service()`
   - Sign with `AUTH_SECRET_KEY` (HS256)
   - Include issuer="ushadow", audiences=["ushadow", "chronicle"]
4. **If not Keycloak token**:
   - Pass through unchanged (might be service token already)
   - Let downstream service validate

### Hybrid Authentication Dependency

**File**: `ushadow/backend/src/services/keycloak_auth.py`

**FastAPI dependency** that accepts either token type:
```python
from src.services.keycloak_auth import get_current_user_hybrid

@router.get("/protected")
async def protected_endpoint(
    current_user: dict = Depends(get_current_user_hybrid)
):
    # current_user contains validated user info
    # Works with both Keycloak and legacy tokens
    return {"user": current_user}
```

## Frontend Integration

### No Changes Needed!

Frontend continues to:
1. Authenticate with Keycloak (PKCE flow)
2. Store Keycloak access token
3. Send Keycloak token in all API calls
4. Backend handles bridging transparently

### Example Frontend Code

```javascript
// 1. Login with Keycloak
await keycloakAuth.login()
const keycloakToken = keycloakAuth.getAccessToken()

// 2. Use Keycloak token for API calls (automatic bridging)
const conversations = await fetch('/api/services/chronicle-backend/proxy/api/conversations', {
  headers: { 'Authorization': `Bearer ${keycloakToken}` }
})

// 3. Use Keycloak token for WebSocket (automatic bridging)
const ws = new WebSocket(
  `/ws/audio/relay?token=${keycloakToken}&destinations=[...]`
)
```

## Benefits

✅ **Zero frontend changes** - Frontend uses Keycloak tokens everywhere
✅ **No Chronicle/Mycelia updates** - They continue using service tokens
✅ **Transparent bridging** - Backend handles conversion automatically
✅ **Shared secret works** - Same AUTH_SECRET_KEY across environments
✅ **Backward compatible** - Legacy service tokens still work
✅ **Secure** - Keycloak tokens never reach Chronicle/Mycelia
✅ **Simple** - No manual token exchange needed

## Security Notes

**Current Implementation (Development)**:
- Keycloak token validation with `verify_signature=False`
- ⚠️ **TODO**: Enable signature verification in production
- Fetch Keycloak public keys from JWKS endpoint
- Validate issuer, audience, and signature

**Production Checklist**:
- [ ] Enable JWT signature verification
- [ ] Fetch and cache Keycloak public keys
- [ ] Validate token audience claim
- [ ] Add rate limiting to token bridge
- [ ] Monitor for token abuse
- [ ] Rotate AUTH_SECRET_KEY periodically

## Troubleshooting

### Token Bridge Not Working

**Symptoms**: 401 Unauthorized when calling Chronicle via proxy

**Debug Steps**:
```bash
# 1. Test Keycloak token validation
curl -H "Authorization: Bearer <token>" \\
  http://localhost:8010/api/auth/bridge-test

# 2. Check backend logs for token bridge messages
docker logs ushadow-backend --tail 100 | grep TOKEN-BRIDGE

# 3. Verify AUTH_SECRET_KEY is set
docker exec ushadow-backend env | grep AUTH_SECRET_KEY
```

**Common Issues**:
- Expired Keycloak token → Refresh token
- Missing AUTH_SECRET_KEY → Set in secrets.yaml
- Wrong issuer in token → Check KEYCLOAK_EXTERNAL_URL env var

### Chronicle Rejects Service Token

**Symptoms**: Chronicle returns 401 even with service token

**Debug Steps**:
```bash
# Check Chronicle's AUTH_SECRET_KEY matches
docker exec <chronicle-container> env | grep AUTH_SECRET_KEY

# Compare with ushadow backend
docker exec ushadow-backend env | grep AUTH_SECRET_KEY
```

**Fix**: Ensure all services share the same AUTH_SECRET_KEY.

## Related Files

- `ushadow/backend/src/services/token_bridge.py` - Token conversion utility
- `ushadow/backend/src/services/keycloak_auth.py` - Keycloak token validation
- `ushadow/backend/src/services/auth.py` - Service token generation
- `ushadow/backend/src/routers/auth_token.py` - Token exchange endpoints
- `ushadow/backend/src/routers/services.py` - Proxy with auto-bridging
- `ushadow/backend/src/routers/audio_relay.py` - Audio relay with auto-bridging
- `ushadow/backend/docs/AUTH_ARCHITECTURE.md` - This document
