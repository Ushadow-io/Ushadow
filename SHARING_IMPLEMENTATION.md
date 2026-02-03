# Ushadow Sharing System - Implementation Guide

## Overview

This document describes the conversation sharing system I've implemented for Ushadow, designed to integrate with Keycloak Fine-Grained Authorization (FGA) while remaining functional with the current JWT authentication system.

## 🌐 Architecture: Behind Tailscale + Public Sharing

Since ushadow runs **behind your private Tailscale network**, external users cannot directly access it. The sharing system supports **two modes**:

### Mode 1: Tailscale-Only Sharing
- User sets `tailscale_only=true` on share link
- Friend must join your Tailnet (temporarily or permanently)
- Friend accesses ushadow directly via Tailscale
- Most secure, zero trust

### Mode 2: Public Share Gateway (Recommended)
- User sets `tailscale_only=false` on share link
- Share link points to public gateway: `https://share.yourdomain.com/c/{token}`
- Gateway validates token, proxies ONLY shared resource
- Gateway connects to ushadow via Tailscale (private connection)
- Friend never has direct access to your Tailnet

**Gateway Architecture**:
```
Public Internet
│
├── Friend visits: https://share.yourdomain.com/c/550e8400-...
│
▼
Share Gateway (Public VPS, ~$5/month)
│ - Validates share token
│ - Rate limited (10 req/min per IP)
│ - Audit logging
│ - Only exposes /c/{token} endpoint
│
▼ (via Tailscale)
Your Private Tailnet
├── ushadow backend ← Friend NEVER accesses directly
├── MongoDB
└── Your devices
```

**Gateway Implementation**: See `share-gateway/` directory for complete deployment-ready code.

## What's Been Built

### ✅ Backend (Complete)

**Models** (`ushadow/backend/src/models/share.py`):
- `ShareToken` - Beanie document for MongoDB storage
- `ShareTokenCreate` - API request model
- `ShareTokenResponse` - API response model
- `KeycloakPolicy` - Keycloak-compatible policy structure
- Enums: `ResourceType`, `SharePermission`

**Service** (`ushadow/backend/src/services/share_service.py`):
- `ShareService` - Business logic for share management
- Token creation/validation/revocation
- Audit logging for all access
- Keycloak integration stubs (ready for implementation)

**API Router** (`ushadow/backend/src/routers/share.py`):
- `POST /api/share/create` - Create share token
- `GET /api/share/{token}` - Access shared resource
- `DELETE /api/share/{token}` - Revoke share
- `GET /api/share/resource/{type}/{id}` - List shares for resource
- `GET /api/share/{token}/logs` - View access audit logs
- Convenience endpoints: `/api/share/conversations/{id}`

### ✅ Frontend (Complete)

**Components** (`ushadow/frontend/src/components/`):
- `ShareDialog.tsx` - Full-featured share management UI
  - Create share links with expiration/view limits
  - List existing shares
  - Copy links to clipboard
  - Revoke access with confirmation

**Hooks** (`ushadow/frontend/src/hooks/`):
- `useShare.ts` - Share dialog state management

### 📋 Configuration

**Database**: ShareToken collection added to Beanie initialization in `main.py`:
```python
await init_beanie(database=db, document_models=[User, ShareToken])
```

**Router**: Share router registered in `main.py`:
```python
app.include_router(share.router, tags=["sharing"])
```

---

## 🎯 Key Decision Points (TODO for You)

I've intentionally left several business logic decisions for you to implement. These are marked with `TODO` comments in the code and represent strategic choices that should align with your security and UX requirements.

### 1. Resource Validation (`share_service.py:260-273`)

**Location**: `ShareService._validate_resource_exists()`

**Current State**: Placeholder that skips validation

**Decision Point**: How should we verify that a conversation/memory/resource exists before creating a share link?

```python
async def _validate_resource_exists(
    self,
    resource_type: ResourceType,
    resource_id: str,
):
    """Validate that resource exists and is accessible.

    TODO: Implement resource validation
    - For conversations: Check Chronicle API
    - For memories: Check Mycelia API
    - Raise ValueError if resource doesn't exist
    """
```

**Options**:
1. **Strict**: Call Chronicle/Mycelia API to verify resource exists
2. **Lazy**: Assume resource exists, fail when accessed
3. **Cache-based**: Check local cache/database first

**Trade-offs**:
- Strict validation prevents sharing non-existent resources but adds API latency
- Lazy validation is faster but could create broken share links
- Cache-based is fast but might be stale

**Recommended Implementation**:
```python
# Example for conversations
if resource_type == ResourceType.CONVERSATION:
    response = await httpx.get(
        f"{CHRONICLE_URL}/conversations/{resource_id}",
        headers={"Authorization": f"Bearer {token}"}
    )
    if response.status_code == 404:
        raise ValueError(f"Conversation {resource_id} not found")
```

---

### 2. Authorization Check (`share_service.py:275-291`)

**Location**: `ShareService._validate_user_can_share()`

**Current State**: Allows all authenticated users

**Decision Point**: Who should be allowed to share a resource?

```python
async def _validate_user_can_share(
    self,
    user: User,
    resource_type: ResourceType,
    resource_id: str,
):
    """Validate user has permission to share resource.

    TODO: DECISION POINT - Implement authorization check
    Options:
    1. Strict: Only resource owner can share
    2. Permissive: Anyone with read access can share
    3. Role-based: Only users with "share" permission can share
    """
```

**Options**:
1. **Owner-only**: Only the user who created the resource can share it
2. **Viewer-based**: Anyone who can view the resource can share it
3. **Role-based**: Check Keycloak roles/permissions
4. **Admin-only**: Only superusers can create shares

**Trade-offs**:
- Owner-only is most secure but limits collaboration
- Viewer-based enables viral sharing but may leak sensitive data
- Role-based requires Keycloak integration
- Admin-only prevents user-driven sharing

**Recommended Implementation**:
```python
# Option 1: Owner-only (strictest)
conversation = await get_conversation(resource_id)
if str(conversation.user_id) != str(user.id) and not user.is_superuser:
    raise ValueError("Only the conversation owner can create share links")

# Option 2: Viewer-based (most permissive)
# If user can fetch the resource, they can share it
# (validation happens in _validate_resource_exists)

# Option 3: Role-based (Keycloak)
if not await keycloak.has_permission(user.id, resource_id, "share"):
    raise ValueError("User lacks share permission for this resource")
```

---

### 3. Tailscale Network Validation (`share_service.py:293-308`)

**Location**: `ShareService._validate_tailscale_access()`

**Current State**: Always returns True (allows all)

**Decision Point**: How should we verify requests are from your Tailscale network?

```python
async def _validate_tailscale_access(self, request_ip: Optional[str]) -> bool:
    """Validate request is from Tailscale network.

    TODO: DECISION POINT - Implement Tailscale validation
    Options:
    1. Check IP ranges (Tailscale CGNAT 100.64.0.0/10)
    2. Validate via Tailscale API
    3. Trust X-Forwarded-For from Tailscale reverse proxy
    """
```

**Options**:
1. **IP Range Check**: Verify IP is in Tailscale CGNAT range (100.64.0.0/10)
2. **Tailscale API**: Call Tailscale API to verify device membership
3. **Reverse Proxy Headers**: Trust `X-Tailscale-User` header from Tailscale Serve
4. **Mutual TLS**: Validate client certificates

**Trade-offs**:
- IP range check is fast but can be spoofed if not behind Tailscale
- API validation is authoritative but adds latency
- Header trust is fast but requires secure reverse proxy setup
- mTLS is most secure but complex to set up

**Recommended Implementation**:
```python
# Option 1: IP Range Check (simple, fast)
import ipaddress

if not request_ip:
    return False

ip = ipaddress.ip_address(request_ip)
tailscale_range = ipaddress.ip_network("100.64.0.0/10")
return ip in tailscale_range

# Option 3: Header Trust (requires Tailscale Serve)
def get_tailscale_user(request: Request) -> Optional[str]:
    return request.headers.get("X-Tailscale-User")

if share_token.tailscale_only and not get_tailscale_user(request):
    return False, "Access restricted to Tailscale network"
```

---

### 4. Keycloak FGA Integration (`share_service.py:310-330`)

**Location**: `ShareService._register_with_keycloak()` and `_unregister_from_keycloak()`

**Current State**: Stub methods with debug logging

**Decision Point**: How should share tokens integrate with Keycloak Fine-Grained Authorization?

```python
async def _register_with_keycloak(self, share_token: ShareToken):
    """Register share token with Keycloak FGA.

    TODO: Implement Keycloak FGA registration
    This should:
    1. Create Keycloak resource for the shared item
    2. Create Keycloak authorization policies
    3. Store keycloak_policy_id and keycloak_resource_id on share_token
    """
```

**Implementation Steps**:
1. Create Keycloak resource:
   ```python
   resource = await keycloak.create_resource(
       name=f"{share_token.resource_type}:{share_token.resource_id}",
       type=share_token.resource_type,
       owner=str(share_token.created_by)
   )
   share_token.keycloak_resource_id = resource["_id"]
   ```

2. Create authorization policies:
   ```python
   for policy in share_token.policies:
       kc_policy = await keycloak.create_policy(
           name=f"share-{share_token.token}",
           resources=[resource["_id"]],
           scopes=[policy.action],
           logic="POSITIVE",
           decision_strategy="UNANIMOUS"
       )
       share_token.keycloak_policy_id = kc_policy["id"]
   ```

3. Grant permissions to anonymous users (if `require_auth=False`):
   ```python
   if not share_token.require_auth:
       await keycloak.create_permission(
           name=f"anon-access-{share_token.token}",
           policy=kc_policy["id"],
           resources=[resource["_id"]],
           decision_strategy="AFFIRMATIVE"
       )
   ```

**Libraries to Consider**:
- `python-keycloak` - Official Python client
- `httpx` - Direct REST API calls to Keycloak

---

### 5. Base URL Configuration (`share.py:32` and `share_service.py:26`)

**Location**: `get_share_service()` in `share.py`

**Current State**: Hardcoded to `http://localhost:3000`

**Decision Point**: How should the frontend URL be configured?

```python
def get_share_service(db: AsyncIOMotorDatabase = Depends(get_database)) -> ShareService:
    # TODO: Get base_url from settings
    base_url = "http://localhost:3000"
    return ShareService(db=db, base_url=base_url)
```

**Options**:
1. **Environment Variable**: `FRONTEND_URL` in `.env`
2. **Settings File**: Add to `config/config.defaults.yaml`
3. **Auto-detect**: Use request.base_url from FastAPI
4. **Per-environment**: Different URLs for dev/prod

**Recommended Implementation**:
```python
from src.config.omegaconf_settings import get_settings

async def get_share_service(
    db: AsyncIOMotorDatabase = Depends(get_database)
) -> ShareService:
    settings = get_settings()
    base_url = await settings.get(
        "network.frontend_url",
        default="http://localhost:3000"
    )
    return ShareService(db=db, base_url=base_url)
```

---

## 📚 Usage Examples

### Creating a Share Link (Frontend)

```tsx
import ShareDialog from '@/components/ShareDialog'
import { useShare } from '@/hooks/useShare'
import { Share2 } from 'lucide-react'

function ConversationView({ conversationId }: { conversationId: string }) {
  const shareProps = useShare({
    resourceType: 'conversation',
    resourceId: conversationId
  })

  return (
    <div>
      <button
        onClick={shareProps.openShareDialog}
        data-testid="conversation-share-button"
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded"
      >
        <Share2 className="w-4 h-4" />
        Share
      </button>

      <ShareDialog
        isOpen={shareProps.isShareDialogOpen}
        onClose={shareProps.closeShareDialog}
        resourceType={shareProps.resourceType}
        resourceId={shareProps.resourceId}
      />
    </div>
  )
}
```

### Accessing a Shared Resource (API)

```bash
# Public access (no auth required)
curl https://ushadow.example.com/api/share/550e8400-e29b-41d4-a716-446655440000

# Response
{
  "share_token": {
    "token": "550e8400-e29b-41d4-a716-446655440000",
    "share_url": "https://ushadow.example.com/share/550e8400-...",
    "permissions": ["read"],
    "expires_at": "2026-02-08T14:35:00Z",
    "view_count": 1
  },
  "resource": {
    "type": "conversation",
    "id": "conv_123",
    "data": "Placeholder for conversation:conv_123"
  }
}
```

### Revoking a Share Link

```typescript
// From ShareDialog component
const revokeShareMutation = useMutation({
  mutationFn: async (token: string) => {
    const response = await fetch(`/api/share/${token}`, {
      method: 'DELETE',
      credentials: 'include',
    })
    if (!response.ok) throw new Error('Failed to revoke')
  }
})

await revokeShareMutation.mutateAsync(shareToken)
```

---

## 🔐 Security Features

### Built-in Protections

1. **Expiration**: Tokens can have TTL (expires_at)
2. **View Limits**: Tokens can have max_views
3. **Authentication**: `require_auth` flag enforces login
4. **Network Restriction**: `tailscale_only` limits to your private network
5. **Email Allowlist**: `allowed_emails` restricts to specific users
6. **Audit Logging**: Every access is logged with timestamp, user/IP, and metadata

### Audit Trail Example

```json
{
  "timestamp": "2026-02-01T15:30:00Z",
  "user_identifier": "friend@example.com",
  "action": "view",
  "view_count": 3,
  "metadata": {
    "ip": "100.64.0.5",
    "user_agent": "Mozilla/5.0..."
  }
}
```

---

## 🧪 Testing

### Manual Testing Checklist

- [ ] Create share link with expiration
- [ ] Create share link with view limit
- [ ] Create Tailscale-only share
- [ ] Create auth-required share
- [ ] Copy share link to clipboard
- [ ] Access share link (anonymous)
- [ ] Access share link (authenticated)
- [ ] Revoke share link
- [ ] View audit logs
- [ ] Share link expires correctly
- [ ] View limit enforced

### API Testing

```bash
# 1. Create share token
curl -X POST http://localhost:8080/api/share/create \
  -H "Content-Type: application/json" \
  -H "Cookie: ushadow_auth=YOUR_TOKEN" \
  -d '{
    "resource_type": "conversation",
    "resource_id": "test_conv_123",
    "permissions": ["read"],
    "expires_in_days": 7,
    "require_auth": false,
    "tailscale_only": false
  }'

# 2. Access share token (public)
curl http://localhost:8080/api/share/SHARE_TOKEN_UUID

# 3. List shares for resource
curl http://localhost:8080/api/share/resource/conversation/test_conv_123 \
  -H "Cookie: ushadow_auth=YOUR_TOKEN"

# 4. Revoke share
curl -X DELETE http://localhost:8080/api/share/SHARE_TOKEN_UUID \
  -H "Cookie: ushadow_auth=YOUR_TOKEN"
```

---

## 📋 Next Steps

1. **Implement Decision Points** (above)
   - Resource validation
   - Authorization checks
   - Tailscale validation
   - Keycloak integration
   - Base URL configuration

2. **Update Chronicle Integration**
   - Modify conversation routes to support share token access
   - See section below for guidance

3. **Frontend Integration**
   - Add share button to Chronicle conversation UI
   - Import and use ShareDialog component

4. **Production Configuration**
   - Set `FRONTEND_URL` environment variable
   - Configure Keycloak if using FGA
   - Set up Tailscale Serve if using network restriction

---

## 🔧 Chronicle Integration Guide

To allow shared conversations to be accessed via share tokens, you'll need to modify the Chronicle conversation routes.

**File**: `chronicle/backends/advanced/src/advanced_omi_backend/routers/modules/conversation_routes.py`

**Current State**:
```python
@router.get("/conversations/{conversation_id}")
async def get_conversation(
    conversation_id: str,
    current_user: User = Depends(current_active_user)
):
    # Check ownership
    if not current_user.is_superuser and conversation.user_id != str(current_user.id):
        raise HTTPException(403)
```

**Required Changes**:

1. Add optional share token parameter:
```python
from typing import Optional, Union
from fastapi import Query

@router.get("/conversations/{conversation_id}")
async def get_conversation(
    conversation_id: str,
    share_token: Optional[str] = Query(None),  # Add this
    current_user: Optional[User] = Depends(get_optional_current_user),  # Make optional
):
```

2. Add share token validation:
```python
# If share token provided, validate it
if share_token:
    share_service = ShareService(db=db, base_url=BASE_URL)
    is_valid, token_obj, reason = await share_service.validate_share_access(
        token=share_token,
        user_email=current_user.email if current_user else None,
        request_ip=request.client.host if request.client else None
    )

    if not is_valid:
        raise HTTPException(403, detail=reason)

    # Verify token is for this conversation
    if token_obj.resource_id != conversation_id:
        raise HTTPException(403, detail="Share token not valid for this conversation")

    # Record access
    user_identifier = current_user.email if current_user else request.client.host
    await share_service.record_share_access(
        share_token=token_obj,
        user_identifier=user_identifier,
        action="view",
        metadata={"user_agent": request.headers.get("user-agent")}
    )

    # Skip ownership check - share token grants access
else:
    # Original ownership check
    if not current_user:
        raise HTTPException(401, detail="Authentication required")

    if not current_user.is_superuser and conversation.user_id != str(current_user.id):
        raise HTTPException(403, detail="Access denied")
```

---

## 📊 Database Schema

### ShareToken Collection

```python
{
  "_id": ObjectId("..."),
  "token": "550e8400-e29b-41d4-a716-446655440000",  # UUID, indexed
  "resource_type": "conversation",                    # Indexed
  "resource_id": "conv_123",                          # Indexed
  "created_by": ObjectId("..."),                      # User who created
  "policies": [
    {
      "resource": "conversation:conv_123",
      "action": "read",
      "effect": "allow"
    }
  ],
  "permissions": ["read"],
  "require_auth": false,
  "tailscale_only": false,
  "allowed_emails": [],
  "expires_at": ISODate("2026-02-08T14:35:00Z"),
  "max_views": null,
  "view_count": 5,
  "last_accessed_at": ISODate("2026-02-01T15:30:00Z"),
  "last_accessed_by": "friend@example.com",
  "access_log": [
    {
      "timestamp": ISODate("2026-02-01T15:30:00Z"),
      "user_identifier": "friend@example.com",
      "action": "view",
      "view_count": 5,
      "metadata": {
        "ip": "100.64.0.5",
        "user_agent": "Mozilla/5.0..."
      }
    }
  ],
  "keycloak_policy_id": null,
  "keycloak_resource_id": null,
  "created_at": ISODate("2026-02-01T14:35:00Z"),
  "updated_at": ISODate("2026-02-01T15:30:00Z")
}
```

### Indexes

- `token` (unique)
- `resource_type`
- `resource_id`
- `created_by`
- `expires_at`
- Compound: `(resource_type, resource_id)`

---

## 🎓 Architecture Decisions

### Why Keycloak-Compatible from Day One?

The share token system uses `KeycloakPolicy` structures even though Keycloak isn't integrated yet because:

1. **Future-proof**: When Keycloak FGA is added, migration is trivial
2. **Standards-based**: Follows OAuth2/UMA patterns
3. **Mycelia-compatible**: Matches existing policy structure in Mycelia
4. **Flexible**: Supports both simple permissions and complex policies

### Why Separate from User Authentication?

Share tokens are independent of the user auth system because:

1. **Anonymous sharing**: Users without accounts can access shares
2. **Revocation**: Revoking a share doesn't affect user permissions
3. **Audit trail**: Clear separation between user actions and share access
4. **Expiration**: Shares can expire independently of user sessions

---

## 🐛 Troubleshooting

### "Database not initialized" Error

**Cause**: FastAPI app.state.db not set

**Fix**: Ensure `main.py` lifespan sets `app.state.db = db`

### Share Links Not Working

**Cause**: Router not registered

**Fix**: Verify `app.include_router(share.router)` in `main.py`

### "Share token not found"

**Cause**: Token not in database or expired

**Debug**:
```python
# In MongoDB shell
db.share_tokens.find({ token: "YOUR_TOKEN_UUID" })

# Check expiration
db.share_tokens.find({
  token: "YOUR_TOKEN_UUID",
  expires_at: { $gt: new Date() }
})
```

### Frontend Can't Fetch Shares

**Cause**: CORS or auth cookies

**Fix**: Check middleware setup in `main.py`:
```python
# CORS must allow credentials
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["http://localhost:3000"],
)
```

---

## 📝 Summary

You now have a complete sharing system with:
- ✅ Backend models, service, and API
- ✅ Frontend UI and hooks
- ✅ Audit logging
- ✅ Keycloak-ready architecture
- 📋 Clear decision points for customization

The system is ready to use once you implement the 5 decision points marked with TODO comments. Start with resource validation and authorization, then add Tailscale/Keycloak integration as needed for your security requirements.
