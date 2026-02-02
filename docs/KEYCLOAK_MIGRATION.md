# Keycloak Migration Guide

This guide shows how to migrate from the current custom JWT auth system to Keycloak-based authentication, with minimal disruption to existing users.

## Overview

**Current System**: Custom fastapi-users with JWT tokens, MongoDB user storage
**Target System**: Keycloak OIDC provider with resource-based authorization

**Migration Strategy**: Parallel running → gradual cutover → deprecation

---

## Phase 1: Infrastructure Setup (Day 1)

### 1.1 Add Keycloak Environment Variables

Add to your `.env` file:

```bash
# Keycloak Configuration
KEYCLOAK_PORT=8080
KEYCLOAK_HOSTNAME=localhost
KEYCLOAK_ADMIN_USER=admin
KEYCLOAK_ADMIN_PASSWORD=changeme_in_production
KEYCLOAK_DB=keycloak
KEYCLOAK_DB_USER=keycloak
KEYCLOAK_DB_PASSWORD=changeme_in_production

# Backend integration
KEYCLOAK_URL=http://keycloak:8080
KEYCLOAK_REALM=ushadow
KEYCLOAK_BACKEND_CLIENT_ID=ushadow-backend
KEYCLOAK_BACKEND_CLIENT_SECRET=<generated-by-setup-script>

# Frontend integration
KEYCLOAK_FRONTEND_CLIENT_ID=ushadow-frontend
```

### 1.2 Start Keycloak

```bash
# Start Keycloak service
docker compose -f compose/keycloak.yml up -d

# Wait for healthy status
docker compose -f compose/keycloak.yml ps

# Check logs
docker compose -f compose/keycloak.yml logs -f keycloak
```

### 1.3 Run Setup Script

```bash
# Install dependencies
pip install python-keycloak python-dotenv

# Run automated setup
python scripts/setup_keycloak.py
```

This creates:
- `ushadow` realm
- Client configurations (backend, frontend, chronicle)
- Example users (alice, bob)

### 1.4 Save Client Secrets

The setup script outputs client secrets. Add them to your `.env`:

```bash
KEYCLOAK_BACKEND_SECRET=<secret-from-setup>
KEYCLOAK_CHRONICLE_SECRET=<secret-from-setup>
```

---

## Phase 2: Backend Parallel Auth (Day 2)

### 2.1 Install Python Dependencies

```bash
cd ushadow/backend
pip install python-keycloak
```

### 2.2 Add Dual Auth Validation

Update `src/routers/auth.py` to accept BOTH token types:

```python
from src.services.auth import get_current_user  # Existing
from src.services.keycloak_auth import get_current_user_keycloak  # New

async def get_current_user_hybrid(
    # Try Keycloak first
    keycloak_user: Optional[KeycloakUser] = Depends(get_current_user_keycloak),
    # Fallback to custom JWT
    legacy_user: Optional[User] = Depends(get_current_user),
):
    """Accept both Keycloak and legacy JWT tokens during migration."""
    if keycloak_user:
        return keycloak_user
    if legacy_user:
        return legacy_user
    raise HTTPException(status_code=401, detail="Not authenticated")
```

### 2.3 Update Protected Endpoints

Change from:
```python
@router.get("/me")
async def get_me(user: User = Depends(get_current_user)):
    ...
```

To:
```python
@router.get("/me")
async def get_me(user = Depends(get_current_user_hybrid)):
    ...
```

This allows both old and new tokens to work!

---

## Phase 3: Frontend Migration (Day 3-4)

### 3.1 Install OIDC Client Library

```bash
cd frontend
npm install @react-keycloak/web keycloak-js
```

### 3.2 Create Keycloak Provider

Create `frontend/src/auth/KeycloakProvider.tsx`:

```tsx
import { ReactKeycloakProvider } from '@react-keycloak/web'
import Keycloak from 'keycloak-js'

const keycloak = new Keycloak({
  url: import.meta.env.VITE_KEYCLOAK_URL || 'http://localhost:8080',
  realm: 'ushadow',
  clientId: 'ushadow-frontend',
})

export function KeycloakProvider({ children }: { children: React.ReactNode }) {
  return (
    <ReactKeycloakProvider
      authClient={keycloak}
      initOptions={{
        onLoad: 'check-sso',
        pkceMethod: 'S256',
      }}
    >
      {children}
    </ReactKeycloakProvider>
  )
}
```

### 3.3 Update Login Flow

Replace custom login with Keycloak:

```tsx
import { useKeycloak } from '@react-keycloak/web'

function LoginPage() {
  const { keycloak } = useKeycloak()

  const handleLogin = () => {
    keycloak.login()
  }

  return <button onClick={handleLogin}>Login with Keycloak</button>
}
```

### 3.4 Update API Calls

Replace custom token with Keycloak token:

```tsx
const { keycloak } = useKeycloak()

const response = await fetch('/api/voice-messages', {
  headers: {
    Authorization: `Bearer ${keycloak.token}`,
  },
})
```

---

## Phase 4: Voice Message Sharing (Day 5)

### 4.1 Implement Resource Registration

When a user uploads a voice message:

```python
from src.services.keycloak_auth import create_voice_message_resource

@router.post("/voice-messages")
async def upload(file: UploadFile, user: KeycloakUser = Depends(...)):
    # Save file
    message_id = save_voice_file(file)

    # Register with Keycloak
    await create_voice_message_resource(
        message_id=message_id,
        owner_user_id=user.sub,
    )

    return {"id": message_id}
```

### 4.2 Implement Sharing

```python
@router.post("/voice-messages/{id}/share")
async def share(id: str, email: str, user: KeycloakUser = Depends(...)):
    # Look up recipient user in Keycloak
    recipient_id = await lookup_user_by_email(email)

    # Grant permission
    await grant_voice_message_access(
        message_id=id,
        user_id=recipient_id,
        scopes=["view"],
    )

    return {"share_link": f"/voice-messages/{id}"}
```

### 4.3 Implement Access Check

```python
@router.get("/voice-messages/{id}")
async def get_message(id: str, user: KeycloakUser = Depends(...)):
    # Check permission
    can_view = await check_voice_message_access(id, user, "view")

    if not can_view:
        raise HTTPException(403, "Access denied")

    # Serve file
    return FileResponse(f"/storage/{id}.webm")
```

---

## Phase 5: Complete Authorization Implementation (Day 6-7)

The TODO items in `src/services/keycloak_auth.py` need to be completed with direct REST API calls to Keycloak's Authorization Services.

### 5.1 Resource Creation

```python
import httpx

async def create_voice_message_resource(message_id: str, owner_user_id: str):
    """Create protected resource in Keycloak."""
    admin = get_keycloak_admin()

    # Get client UUID
    client_uuid = admin.get_client_id("ushadow-backend")

    # Create resource via REST API
    url = f"{admin.server_url}/admin/realms/{admin.realm_name}/clients/{client_uuid}/authz/resource-server/resource"

    async with httpx.AsyncClient() as client:
        response = await client.post(
            url,
            json={
                "name": f"voice-message-{message_id}",
                "type": "voice-message",
                "owner": {"id": owner_user_id},
                "ownerManagedAccess": True,
                "uris": [f"/voice-messages/{message_id}"],
                "scopes": [
                    {"name": "view"},
                    {"name": "share"},
                    {"name": "delete"}
                ]
            },
            headers={"Authorization": f"Bearer {admin.token['access_token']}"}
        )
        response.raise_for_status()
        return response.json()
```

### 5.2 Permission Grant

```python
async def grant_voice_message_access(message_id: str, user_id: str, scopes: list[str]):
    """Grant user permission to access resource."""
    admin = get_keycloak_admin()
    client_uuid = admin.get_client_id("ushadow-backend")

    # Create user-based permission
    url = f"{admin.server_url}/admin/realms/{admin.realm_name}/clients/{client_uuid}/authz/resource-server/permission/scope"

    async with httpx.AsyncClient() as client:
        response = await client.post(
            url,
            json={
                "name": f"voice-{message_id}-user-{user_id}",
                "description": f"Permission for user {user_id} to access voice message {message_id}",
                "scopes": scopes,
                "resources": [f"voice-message-{message_id}"],
                "policies": [f"user-{user_id}-policy"],  # Create this policy first
            },
            headers={"Authorization": f"Bearer {admin.token['access_token']}"}
        )
        response.raise_for_status()
        return True
```

### 5.3 Permission Check

```python
async def check_voice_message_access(message_id: str, user: KeycloakUser, scope: str):
    """Check if user has permission to access resource."""
    keycloak = get_keycloak_openid()

    # Request RPT (Requesting Party Token) with permissions
    try:
        token = keycloak.token(
            grant_type="urn:ietf:params:oauth:grant-type:uma-ticket",
            audience="ushadow-backend",
            permission=f"voice-message-{message_id}#{scope}",
        )
        return True  # Token granted = has permission
    except Exception:
        return False  # Token denied = no permission
```

---

## Phase 6: User Migration (Day 8)

### 6.1 Sync Existing Users to Keycloak

Create a migration script:

```python
# scripts/migrate_users_to_keycloak.py

from src.models.user import User
from keycloak import KeycloakAdmin

async def migrate_users():
    admin = get_keycloak_admin()

    # Get all users from MongoDB
    users = await User.find_all().to_list()

    for user in users:
        try:
            # Create in Keycloak
            admin.create_user({
                "username": user.email,
                "email": user.email,
                "firstName": user.display_name,
                "enabled": user.is_active,
                "emailVerified": user.is_verified,
                # Don't migrate password - users will reset
            })

            print(f"✅ Migrated {user.email}")
        except Exception as e:
            print(f"❌ Failed to migrate {user.email}: {e}")
```

### 6.2 Send Password Reset Emails

```python
# After migration, trigger password reset for all users
for user in users:
    admin.send_update_account(
        user_id=keycloak_user_id,
        payload=["UPDATE_PASSWORD"]
    )
```

---

## Phase 7: Deprecate Legacy Auth (Day 9-10)

### 7.1 Monitor Token Usage

Add logging to track which auth method is used:

```python
async def get_current_user_hybrid(...):
    if keycloak_user:
        logger.info(f"Auth via Keycloak: {keycloak_user.email}")
        return keycloak_user
    if legacy_user:
        logger.warning(f"Auth via legacy JWT: {legacy_user.email}")
        return legacy_user
```

### 7.2 Remove Legacy Code

Once all clients use Keycloak (monitor logs):

1. Remove `get_current_user` dependency
2. Remove `fastapi-users` routes from `auth.py`
3. Remove JWT generation code
4. Update all `Depends(get_current_user_hybrid)` → `Depends(get_current_user_keycloak)`

---

## Testing Checklist

- [ ] Keycloak admin console accessible
- [ ] Can create user via admin UI
- [ ] Can login with Keycloak from frontend
- [ ] Backend validates Keycloak tokens
- [ ] Can upload voice message (creates resource)
- [ ] Can share voice message (grants permission)
- [ ] Shared user can access message
- [ ] Owner can revoke access
- [ ] Revoked user gets 403 on access
- [ ] Legacy JWT still works during migration
- [ ] Chronicle service can authenticate

---

## Rollback Plan

If issues arise, you can rollback by:

1. Remove Keycloak dependency injection from endpoints
2. Switch back to `Depends(get_current_user)` everywhere
3. Stop Keycloak container

Your legacy auth remains intact throughout migration!

---

## Resources

- [Keycloak Authorization Services](https://www.keycloak.org/docs/latest/authorization_services/)
- [Resource-Based Authorization Guide](https://medium.com/@kasturepadmakar4u/resource-and-scope-based-authorization-in-keycloak-1fdb90408e91)
- [User-Managed Access (UMA)](https://www.keycloak.org/docs/latest/authorization_services/#_service_user_managed_access)
- [FastAPI + Keycloak Example](https://github.com/code-specialist/fastapi-keycloak)
