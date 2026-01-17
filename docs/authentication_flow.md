# Authentication Flow Analysis

This document explains how authentication works in Ushadow, focusing on:
1. The generic proxy endpoint authentication
2. QR code authentication for mobile apps

## Summary: Is the Proxy Endpoint Secure?

**Short answer: YES** ✅

The proxy endpoint **intentionally does not enforce authentication** at the proxy level because:
1. It **forwards** authentication headers to backend services
2. Each **backend service validates the JWT** independently
3. This is **defense in depth** - services don't trust the proxy

**Why this design?**
- Services like Chronicle and mem0 may have different auth requirements
- Proxy is transparent - doesn't modify auth flow
- Services can implement their own authorization logic (user-level, role-based, etc.)

---

## Part 1: Generic Proxy Authentication

### The Proxy Endpoint (No Auth Dependency)

**Location:** `ushadow/backend/src/routers/services.py:454`

```python
@router.api_route("/{name}/proxy/{path:path}",
                 methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"])
async def proxy_service_request(
    name: str,
    path: str,
    request: Request,
    orchestrator: ServiceOrchestrator = Depends(get_orchestrator),
):
    # NOTE: No Depends(get_current_user) here!
```

**Why no `Depends(get_current_user)`?**

The proxy is a **transparent pass-through** for authentication. It:
1. Accepts requests with or without Authorization headers
2. Forwards ALL headers (including Authorization) to backend services
3. Lets each service decide if auth is required

### Authentication Flow Through Proxy

```
┌─────────────────────────────────────────────────────────────────────┐
│ 1. Client Request (Mobile/Web)                                      │
│    GET /api/services/chronicle-backend/proxy/api/conversations      │
│    Headers:                                                          │
│      Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...  │
└─────────────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────────┐
│ 2. Generic Proxy (services.py:454)                                  │
│    • Does NOT validate token                                        │
│    • Does NOT check if user is logged in                            │
│    • Forwards Authorization header AS-IS                            │
│                                                                      │
│    Code (line 522-538):                                             │
│    headers = dict(request.headers)  # Copy all headers             │
│    if auth_header:                                                  │
│        logger.info(f"Forwarding auth: {token_preview}")             │
│    else:                                                             │
│        logger.warning(f"No Authorization header")                   │
└─────────────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────────┐
│ 3. Backend Service (Chronicle/mem0/etc)                             │
│    • Receives Authorization header                                  │
│    • VALIDATES JWT token using shared AUTH_SECRET_KEY               │
│    • Decodes token to get user_id and email                         │
│    • Checks token audience (ushadow/chronicle)                      │
│    • Returns 401 if token invalid/expired                           │
│    • Returns 403 if user lacks permission                           │
└─────────────────────────────────────────────────────────────────────┘
```

### How Services Validate Tokens

**Chronicle Backend** (and other services) validate tokens using the **shared AUTH_SECRET_KEY**:

```python
# Each service validates JWT independently
# Example from Chronicle backend:

def validate_token(token: str):
    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,  # Same key as ushadow backend
            algorithms=["HS256"],
            audience=["ushadow", "chronicle"]  # Accept tokens for these services
        )
        user_id = payload.get("sub")
        user_email = payload.get("email")
        return {"user_id": user_id, "email": user_email}
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidAudienceError:
        raise HTTPException(401, "Invalid audience")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")
```

### Why This Design is Secure

**Defense in Depth:**
1. **Proxy doesn't trust clients** - just forwards headers
2. **Services don't trust proxy** - validate tokens themselves
3. **Shared secret** (AUTH_SECRET_KEY) ensures token authenticity
4. **Token expiry** prevents replay attacks (24 hour lifetime)
5. **Audience claims** prevent cross-service token abuse

**Benefits:**
- ✅ **Flexible auth** - Services can implement different authorization policies
- ✅ **Service isolation** - Compromised proxy doesn't compromise services
- ✅ **Transparent** - Proxy doesn't need to know about auth logic
- ✅ **Future-proof** - Can add services with different auth schemes

**Security Properties:**
- ✅ **Authentication** - JWT signature verified by each service
- ✅ **Authorization** - Each service decides what user can access
- ✅ **Confidentiality** - HTTPS encrypts tokens in transit
- ✅ **Integrity** - JWT signature prevents token tampering
- ✅ **Non-repudiation** - Token contains user_id for auditing

### Special Case: Audio/Media Requests

**Problem:** HTML5 `<audio>` and `<video>` tags can't send custom headers

**Solution:** Extract token from query parameter

```python
# services.py:502-507
query_params = dict(request.query_params)
extracted_token = None
if ('audio' in path or 'media' in path) and 'token' in query_params:
    extracted_token = query_params.pop('token')
    logger.info(f"[PROXY] Extracted token from query param for audio request")

# Add to Authorization header for service
if extracted_token and not headers.get("authorization"):
    headers["authorization"] = f"Bearer {extracted_token}"
```

**Flow:**
```
Mobile: GET /api/services/chronicle/proxy/api/audio/123?token=eyJ...
         ↓
Proxy:  Remove token from query, add to Authorization header
         ↓
Service: GET /api/audio/123
         Headers: Authorization: Bearer eyJ...
```

---

## Part 2: QR Code Authentication Flow

### QR Code Generation

**Endpoint:** `/api/tailscale/mobile/connect-qr`

**Location:** `ushadow/backend/src/routers/tailscale.py:652`

```python
@router.get("/mobile/connect-qr", response_model=MobileConnectionQR)
async def get_mobile_connection_qr(
    current_user: User = Depends(get_current_user)  # ← Auth REQUIRED here
) -> MobileConnectionQR:
```

**Authentication Required:** ✅ YES - User must be logged into web UI

### Step-by-Step QR Code Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ Step 1: User Logs into Web UI                                       │
│    • User visits https://red.spangled-kettle.ts.net                 │
│    • Enters email/password                                           │
│    • Backend creates session cookie + JWT token                     │
│    • User is now authenticated in browser                           │
└─────────────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────────┐
│ Step 2: Web UI Requests QR Code                                     │
│    GET /api/tailscale/mobile/connect-qr                             │
│    Cookies: ushadow_auth=<session_cookie>                           │
│                                                                      │
│    • FastAPI validates session cookie                               │
│    • get_current_user dependency extracts User from token           │
│    • current_user.id and current_user.email available               │
└─────────────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────────┐
│ Step 3: Backend Generates Auth Token for Mobile                     │
│    Code (tailscale.py:724-728):                                     │
│                                                                      │
│    auth_token = generate_jwt_for_service(                           │
│        user_id=str(current_user.id),      # "507f1f77bcf86cd..."   │
│        user_email=current_user.email,     # "user@example.com"     │
│        audiences=["ushadow", "chronicle"] # Valid for both services │
│    )                                                                 │
│                                                                      │
│    Token payload:                                                    │
│    {                                                                 │
│        "sub": "507f1f77bcf86cd799439011",  # User ID                │
│        "email": "user@example.com",                                 │
│        "aud": ["ushadow", "chronicle"],    # Audience claims        │
│        "iss": "ushadow",                   # Issuer                 │
│        "exp": 1705244400,                  # Expires in 24 hours    │
│        "iat": 1705158000                   # Issued at timestamp    │
│    }                                                                 │
│                                                                      │
│    Signed with: AUTH_SECRET_KEY (shared across all services)        │
└─────────────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────────┐
│ Step 4: Backend Creates QR Code Data                                │
│    Code (tailscale.py:731-739):                                     │
│                                                                      │
│    connection_data = {                                               │
│        "type": "ushadow-connect",                                   │
│        "v": 3,                            # Version 3 includes auth  │
│        "hostname": "red.spangled-kettle.ts.net",                    │
│        "ip": "100.64.1.23",               # Tailscale IP            │
│        "port": 8000,                                                 │
│        "api_url": "https://red.spangled-kettle.ts.net/api/...",    │
│        "auth_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."     │
│    }                                                                 │
│                                                                      │
│    • Generate QR code image from JSON                               │
│    • Return as base64 data URL                                      │
└─────────────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────────┐
│ Step 5: Mobile App Scans QR Code                                    │
│    Location: mobile/app/components/QRScanner.tsx                    │
│                                                                      │
│    • Camera scans QR code                                            │
│    • Parses JSON from QR data                                       │
│    • Extracts auth_token, api_url, hostname, ip                    │
│    • Validates QR version and type                                  │
└─────────────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────────┐
│ Step 6: Mobile App Stores Credentials                               │
│    Location: mobile/app/utils/unodeStorage.ts                       │
│                                                                      │
│    await saveUnode({                                                 │
│        id: generateId(),                                             │
│        hostname: "red.spangled-kettle.ts.net",                      │
│        apiUrl: "https://red.spangled-kettle.ts.net",                │
│        tailscaleIp: "100.64.1.23",                                  │
│        authToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",        │
│        status: "online"                                              │
│    })                                                                │
│                                                                      │
│    • Stored in AsyncStorage (encrypted on device)                   │
│    • Associated with UNode (environment)                            │
└─────────────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────────┐
│ Step 7: Mobile App Makes Authenticated Requests                     │
│    Location: mobile/app/services/chronicleApi.ts:126                │
│                                                                      │
│    const token = await getToken()  // Gets authToken from storage   │
│    const url = `${apiUrl}/api/services/chronicle/proxy/...`         │
│                                                                      │
│    fetch(url, {                                                      │
│        headers: {                                                    │
│            Authorization: `Bearer ${token}`                          │
│        }                                                             │
│    })                                                                │
│                                                                      │
│    • Token valid for 24 hours                                       │
│    • Mobile makes requests without login screen                     │
│    • Services validate token on each request                        │
└─────────────────────────────────────────────────────────────────────┘
```

### Security Properties of QR Code Auth

**Strengths:**
1. ✅ **User consent** - Must be logged into web UI to generate QR
2. ✅ **Short-lived** - Token expires in 24 hours (JWT_LIFETIME_SECONDS)
3. ✅ **Scoped** - Token only valid for ushadow and chronicle audiences
4. ✅ **Device-specific** - Each scan creates separate session on mobile
5. ✅ **Revocable** - Can logout/regenerate tokens
6. ✅ **Encrypted transit** - HTTPS for API, local storage on device
7. ✅ **Same user identity** - Mobile uses same user_id as web session

**Risks (Mitigated):**
1. ⚠️ **QR visible to cameras** - Mitigated by 24h expiry + physical security
2. ⚠️ **Token in QR screenshot** - Mitigated by expiry + user education
3. ⚠️ **Device theft** - Mitigated by device encryption + remote logout capability

### Token Lifecycle

```
Generation (Web UI)
    ↓
[ 24 hours lifetime ]
    ↓
Expiry (Automatic)
```

**When token expires:**
- Mobile app gets 401 Unauthorized
- `chronicleApi.ts:151-158` catches 401 and clears invalid token
- User must scan new QR code to re-authenticate

---

## Part 3: Authentication Decision Matrix

### When is Authentication Required?

| Endpoint Pattern | Auth Required? | Validation Location | Notes |
|-----------------|----------------|---------------------|-------|
| `/api/auth/login` | ❌ No | N/A | Public endpoint |
| `/api/auth/register` | ❌ No | N/A | Public endpoint |
| `/api/auth/me` | ✅ Yes | ushadow backend | `Depends(get_current_user)` |
| `/api/tailscale/mobile/connect-qr` | ✅ Yes | ushadow backend | Must be logged in to generate QR |
| `/api/services/{name}/proxy/*` | ❌ No | Backend service | Proxy forwards, service validates |
| `/api/services/{name}/status` | ✅ Yes | ushadow backend | Management endpoints require auth |
| `/api/services/{name}/start` | ✅ Yes | ushadow backend | Management endpoints require auth |
| Chronicle `/api/conversations` | ✅ Yes | Chronicle backend | Validates JWT from proxy |
| mem0 `/api/v1/memories` | ✅ Yes | mem0 backend | Validates JWT from proxy |

### Why Management Endpoints Require Auth

**Example:** `services.py:621`

```python
@router.post("/{name}/start", response_model=ActionResponse)
async def start_service(
    name: str,
    orchestrator: ServiceOrchestrator = Depends(get_orchestrator),
    current_user: User = Depends(get_current_user)  # ← Auth REQUIRED
) -> ActionResponse:
```

**Reason:** Starting/stopping services is a **privileged operation** that affects the entire system. Only authenticated users should control infrastructure.

---

## Part 4: Token Validation Deep Dive

### How Services Validate JWT Tokens

**Shared Configuration:**

```python
# ushadow/backend/src/services/auth.py:38
SECRET_KEY = config.get_sync("security.auth_secret_key")

# All services must use the SAME secret key
# Set in config/SECRETS/secrets.yaml:
# security:
#   auth_secret_key: "<random-256-bit-key>"
```

**Validation Process:**

```python
# ushadow/backend/src/services/auth.py:163-210
class MultiAudienceJWTStrategy(BaseJWTStrategy):
    async def read_token(self, token: Optional[str], user_manager: BaseUserManager):
        if token is None:
            return None

        try:
            # Step 1: Decode with signature verification
            data = jwt.decode(
                token,
                self.decode_key,           # AUTH_SECRET_KEY
                algorithms=[self.algorithm], # HS256
                audience=["ushadow", "chronicle"],  # Accept either audience
                options={"verify_aud": True}
            )

            # Step 2: Extract user_id from "sub" claim
            user_id = data.get("sub")
            if user_id is None:
                return None

            # Step 3: Load user from database
            parsed_id = user_manager.parse_id(user_id)
            return await user_manager.get(parsed_id)

        except jwt.exceptions.ExpiredSignatureError:
            # Token expired (24 hours)
            logger.warning("Token expired")
            return None

        except jwt.exceptions.InvalidAudienceError:
            # Token not intended for this service
            logger.warning("Invalid audience")
            return None

        except jwt.exceptions.InvalidSignatureError:
            # Token tampered with
            logger.warning("Invalid signature")
            return None
```

### Multi-Service Token Design

**Why audience claims?**

```python
# Token generated for mobile app includes BOTH services:
audiences=["ushadow", "chronicle"]

# This means:
# ✅ Token works for ushadow backend API
# ✅ Token works for Chronicle backend API
# ❌ Token would NOT work for a service expecting audience "other-service"
```

**Security benefit:** Prevents token abuse across unrelated services.

---

## Part 5: Recommendations

### Current Security Posture: ✅ GOOD

The current design is secure because:
1. Services validate tokens independently
2. Shared secret prevents forgery
3. Audience claims prevent cross-service abuse
4. Token expiry limits damage from theft
5. HTTPS encrypts tokens in transit

### Potential Improvements (Optional)

#### 1. Add Optional Authentication to Proxy

**Current:** Proxy accepts all requests, services validate

**Enhanced:** Proxy validates token AND forwards to services

```python
@router.api_route("/{name}/proxy/{path:path}", ...)
async def proxy_service_request(
    name: str,
    path: str,
    request: Request,
    current_user: User = Depends(get_optional_current_user),  # ← Optional auth
):
    # Log if authenticated
    if current_user:
        logger.info(f"[PROXY] Request from user {current_user.email}")
    else:
        logger.info(f"[PROXY] Unauthenticated request")

    # Still forward Authorization header to service
    # Service makes final decision
```

**Benefit:** Better logging/monitoring without breaking flexibility

#### 2. Rate Limiting Per User

```python
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

@router.api_route("/{name}/proxy/{path:path}")
@limiter.limit("100/minute")  # Per IP address
async def proxy_service_request(...):
```

**Benefit:** Prevents abuse even with valid tokens

#### 3. Token Refresh Mechanism

**Current:** 24-hour tokens, must re-scan QR after expiry

**Enhanced:** Short-lived access tokens + long-lived refresh tokens

```python
# Access token: 1 hour
# Refresh token: 30 days
# Mobile can refresh without QR scan
```

**Benefit:** Better UX without compromising security

---

## Conclusion

**Is the proxy endpoint secure?** ✅ **YES**

The design follows **defense in depth** principles:
- Proxy doesn't enforce auth (transparency)
- Services validate tokens (isolation)
- Shared secret ensures authenticity (cryptography)
- Audience claims prevent abuse (authorization)
- Token expiry limits exposure (temporal security)

**Is QR code auth secure?** ✅ **YES**

The QR code flow is secure because:
- Requires authenticated web session
- Generates proper JWT tokens
- 24-hour expiry limits exposure
- Services validate independently
- Uses HTTPS for all requests

**Key Insight:** Security is **distributed** across layers. No single point of failure.
