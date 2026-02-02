# Keycloak Login & Registration Integration

## Overview

Ushadow now uses Keycloak for authentication, with automatic redirect URI registration for multi-environment support.

```
User Flow:
1. Visit http://localhost:3010/login
2. Click "Sign In" → Redirects to Keycloak (localhost:8081)
3. Click "Create Account" → Redirects to Keycloak registration
4. After auth → Redirects back to Ushadow dashboard
5. Token bridge converts Keycloak token → service token automatically
```

## Key Features

### 1. Keycloak-Hosted Authentication
- **Login**: Full-page redirect to YOUR Keycloak container (localhost:8081)
- **Registration**: Keycloak's built-in registration with email verification
- **Password Reset**: Keycloak handles forgotten passwords
- **Account Management**: Users can update profile, change password, etc.

### 2. Automatic Redirect URI Registration
Each Ushadow environment (worktree) registers its redirect URI on backend startup:
- `ushadow` (PORT_OFFSET=10): http://localhost:3010/auth/callback
- `ushadow-orange` (PORT_OFFSET=20): http://localhost:3020/auth/callback
- `ushadow-yellow` (PORT_OFFSET=30): http://localhost:3030/auth/callback

**How it works:**
- Backend calls Keycloak Admin API on startup
- Merges new URIs with existing ones (doesn't break other environments)
- Logs: Check backend logs for `[KC-ADMIN]` messages

### 3. User Name Collection
Keycloak registration form collects:
- **Email** (required, unique)
- **First Name** (required)
- **Last Name** (required)
- **Password** (with strength requirements)

User's full name is included in OIDC token as `name` claim:
```json
{
  "sub": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "email": "user@example.com",
  "name": "Alice Smith",
  "given_name": "Alice",
  "family_name": "Smith"
}
```

### 4. Transparent Token Bridging
After Keycloak authentication:
- Frontend stores Keycloak token in sessionStorage
- All API calls use Keycloak token in Authorization header
- Backend automatically bridges Keycloak → service token
- Chronicle/Mycelia receive service tokens (they don't need updates)

## User Experience

### Login Page (http://localhost:3010/login)

**UI Components:**
- **Sign In** button (green, primary action)
  - Redirects to Keycloak login
  - Remembers intended destination

- **Create Account** button (purple, secondary)
  - Redirects to Keycloak registration
  - Collects: email, first name, last name, password

- **Info Box:**
  - "Enterprise-grade security with Keycloak"
  - "Works across all Ushadow environments"
  - "Password reset and account management included"

### Keycloak Pages (http://localhost:8081)

**Login Page:**
```
┌─────────────────────────────────────┐
│  Keycloak (your branding can go here)│
│                                     │
│  Sign in to your account            │
│                                     │
│  Email: [________________]          │
│  Password: [________________]       │
│                                     │
│  [Sign In]                          │
│                                     │
│  Register | Forgot password?        │
└─────────────────────────────────────┘
```

**Registration Page:**
```
┌─────────────────────────────────────┐
│  Register                           │
│                                     │
│  Email: [________________]          │
│  First name: [________________]     │
│  Last name: [________________]      │
│  Password: [________________]       │
│  Confirm password: [________]       │
│                                     │
│  [Register]                         │
│                                     │
│  ← Back to login                    │
└─────────────────────────────────────┘
```

## Configuration

### Environment Variables

**Backend (.env or docker-compose):**
```bash
# Keycloak connection (internal Docker network)
KEYCLOAK_URL=http://keycloak:8080
KEYCLOAK_EXTERNAL_URL=http://localhost:8081  # External browser access
KEYCLOAK_REALM=ushadow
KEYCLOAK_FRONTEND_CLIENT_ID=ushadow-frontend

# Admin credentials (for Admin API)
KEYCLOAK_ADMIN_USER=admin
KEYCLOAK_ADMIN_PASSWORD=admin

# Port offset for multi-environment
PORT_OFFSET=10  # Frontend port = 3000 + PORT_OFFSET = 3010
```

**Frontend (.env or Vite config):**
```bash
VITE_KEYCLOAK_URL=http://localhost:8081
VITE_KEYCLOAK_REALM=ushadow
VITE_KEYCLOAK_CLIENT_ID=ushadow-frontend
VITE_BACKEND_URL=http://localhost:8010
```

### Keycloak Client Configuration

The `ushadow-frontend` client in Keycloak should have:

**Settings:**
- Client ID: `ushadow-frontend`
- Client authentication: OFF (public client, PKCE only)
- Standard flow: ENABLED
- Direct access grants: DISABLED
- Root URL: `http://localhost:3000`
- Valid redirect URIs:
  - `http://localhost:*/auth/callback` (wildcard for all ports)
  - Specific URIs added by backend startup (3010, 3020, etc.)
- Web origins: `+` (all redirect URIs)

**Advanced:**
- PKCE: S256 required
- Consent required: OFF

## Multi-Environment Support

### Problem
Each worktree runs on different port:
- `ushadow`: 3010
- `ushadow-orange`: 3020
- `ushadow-yellow`: 3030

Keycloak's Valid Redirect URIs must include all active ports.

### Solution
Backend automatically registers its redirect URI on startup:

**File:** `ushadow/backend/src/services/keycloak_admin.py`

**Function:** `register_current_environment_redirect_uri()`

**Called from:** `ushadow/backend/main.py` (lifespan startup)

**What it does:**
1. Calculates frontend port from `PORT_OFFSET`
2. Builds redirect URI: `http://localhost:{port}/auth/callback`
3. Authenticates to Keycloak Admin API
4. Gets current client configuration
5. Merges new URI with existing URIs (doesn't overwrite)
6. Updates client configuration

**Logs:**
```
[KC-ADMIN] Registering redirect URIs for environment:
[KC-ADMIN]   - http://localhost:3010/auth/callback
[KC-ADMIN]   - http://127.0.0.1:3010/auth/callback
[KC-ADMIN] ✓ Authenticated as Keycloak admin
[KC-ADMIN] Merging redirect URIs: 4 existing + 2 new = 4 total
[KC-ADMIN] ✓ Updated redirect URIs for client 'ushadow-frontend'
[KC-ADMIN]   - http://localhost:*/auth/callback
[KC-ADMIN]   - http://localhost:3010/auth/callback
[KC-ADMIN]   - http://127.0.0.1:3010/auth/callback
[KC-ADMIN] ✓ Successfully registered redirect URIs for port 3010
```

## Testing

### 1. Test Login Flow

```bash
# 1. Visit login page
open http://localhost:3010/login

# 2. Click "Sign In"
# → Redirects to http://localhost:8081/realms/ushadow/protocol/openid-connect/auth...

# 3. Enter credentials (if you have a user)
# → Redirects back to http://localhost:3010/auth/callback?code=...

# 4. Should land on dashboard
# → URL: http://localhost:3010/
```

### 2. Test Registration Flow

```bash
# 1. Visit login page
open http://localhost:3010/login

# 2. Click "Create Account"
# → Redirects to http://localhost:8081/realms/ushadow/protocol/openid-connect/registrations...

# 3. Fill registration form:
#    - Email: test@example.com
#    - First name: Test
#    - Last name: User
#    - Password: Test1234 (or stronger)

# 4. Click "Register"
# → Redirects back to http://localhost:3010/auth/callback?code=...

# 5. Should land on dashboard
# → URL: http://localhost:3010/
```

### 3. Test Token Bridge

```bash
# After logging in via Keycloak:

# Check token in browser console:
sessionStorage.getItem('kc_access_token')
# Should show JWT token

# Make API call (token bridge should work automatically):
fetch('/api/services/chronicle-backend/proxy/api/conversations', {
  headers: {
    'Authorization': `Bearer ${sessionStorage.getItem('kc_access_token')}`
  }
})

# Check backend logs for token bridge:
docker logs ushadow-backend --tail 100 | grep TOKEN-BRIDGE
# Should show: "[TOKEN-BRIDGE] ✓ Bridged Keycloak token for user@example.com → service token"
```

### 4. Test Multi-Environment

```bash
# Start second environment on port 3020:
cd ushadow-orange
docker compose up -d

# Backend should register port 3020:
docker logs ushadow-orange-backend | grep KC-ADMIN
# Should show: "[KC-ADMIN] ✓ Successfully registered redirect URIs for port 3020"

# Login via second environment:
open http://localhost:3020/login
# Should work without any manual Keycloak configuration
```

## Troubleshooting

### "Invalid redirect_uri" Error

**Symptom:** After login, Keycloak shows error: "Invalid parameter: redirect_uri"

**Cause:** Redirect URI not registered in Keycloak client

**Fix:**
1. Check backend logs for KC-ADMIN registration:
   ```bash
   docker logs ushadow-backend | grep KC-ADMIN
   ```
2. If registration failed, check:
   - Keycloak is running: `docker ps | grep keycloak`
   - Admin credentials correct: `KEYCLOAK_ADMIN_USER` / `KEYCLOAK_ADMIN_PASSWORD`
   - Keycloak URL accessible from backend: `http://keycloak:8080`

3. Manual fix (if needed):
   - Open Keycloak Admin Console: http://localhost:8081/admin
   - Navigate to: ushadow realm → Clients → ushadow-frontend
   - Add redirect URI: `http://localhost:3010/auth/callback`
   - Save

### Login Redirects But Not Authenticated

**Symptom:** After Keycloak login, redirects to Ushadow but still shows login page

**Cause:** OAuth callback not processing token correctly

**Debug:**
1. Check browser console for errors
2. Check sessionStorage:
   ```javascript
   console.log({
     access_token: sessionStorage.getItem('kc_access_token'),
     refresh_token: sessionStorage.getItem('kc_refresh_token'),
     id_token: sessionStorage.getItem('kc_id_token')
   })
   ```
3. Check backend logs for token exchange:
   ```bash
   docker logs ushadow-backend | grep "TOKEN-EXCHANGE\|KC-AUTH"
   ```

### User Name Not Showing

**Symptom:** User authenticated but name is missing or shows as "undefined"

**Cause:** Keycloak token missing `name` claim

**Fix:**
1. Check token contents:
   ```javascript
   // In browser console:
   const token = sessionStorage.getItem('kc_access_token')
   const payload = JSON.parse(atob(token.split('.')[1]))
   console.log(payload)
   ```
2. If missing `name`, check Keycloak user profile:
   - Open: http://localhost:8081/admin
   - Navigate to: ushadow realm → Users → [your user]
   - Ensure First Name and Last Name are set
3. Re-login to get fresh token with updated claims

### Port Already Registered

**Symptom:** Backend logs show: "Merging redirect URIs: 4 existing + 2 new = 4 total"

**Cause:** This is NORMAL! Backend merges URIs, doesn't duplicate

**No action needed:** The merge logic prevents duplicates automatically

## Customization

### Branding Keycloak Login Pages

Keycloak themes are fully customizable. To brand the login/registration pages:

1. **Create theme directory:**
   ```bash
   mkdir -p keycloak-themes/ushadow-theme
   cd keycloak-themes/ushadow-theme
   ```

2. **Theme structure:**
   ```
   ushadow-theme/
   ├── theme.properties
   ├── login/
   │   ├── resources/
   │   │   ├── css/
   │   │   │   └── custom.css
   │   │   └── img/
   │   │       └── logo.png
   │   └── messages/
   │       └── messages_en.properties
   ```

3. **Mount theme in docker-compose:**
   ```yaml
   keycloak:
     volumes:
       - ./keycloak-themes:/opt/keycloak/themes
   ```

4. **Activate theme in Keycloak Admin:**
   - Navigate to: Realm Settings → Themes
   - Login Theme: ushadow-theme
   - Save

### Adding Custom Registration Fields

To collect additional fields during registration:

1. **Add user attributes in Keycloak:**
   - Navigate to: Realm Settings → User Profile
   - Add attribute (e.g., "company", "phone")
   - Set: Required, displayed during registration

2. **Access in token:**
   - Navigate to: Clients → ushadow-frontend → Client scopes
   - Add mapper: Type = User Attribute
   - Map attribute to token claim

3. **Use in frontend:**
   ```typescript
   const userInfo = useKeycloakAuth().userInfo
   console.log(userInfo.company, userInfo.phone)
   ```

## Security Considerations

### Production Checklist

- [ ] Change Keycloak admin password (`KEYCLOAK_ADMIN_PASSWORD`)
- [ ] Enable HTTPS for Keycloak (`KC_HOSTNAME_STRICT_HTTPS=true`)
- [ ] Use strong `AUTH_SECRET_KEY` (32+ random characters)
- [ ] Enable JWT signature verification in `keycloak_auth.py`
- [ ] Configure email server for password reset
- [ ] Set up rate limiting for login attempts
- [ ] Enable audit logging in Keycloak
- [ ] Regular Keycloak updates for security patches

### PKCE Security

Frontend uses PKCE (Proof Key for Code Exchange) for secure public client auth:
- Code verifier generated in browser
- Code challenge (SHA-256) sent to Keycloak
- Prevents authorization code interception attacks
- No client secret needed in frontend (public client)

## Related Files

**Backend:**
- `ushadow/backend/src/services/keycloak_admin.py` - Admin API client
- `ushadow/backend/src/services/keycloak_auth.py` - Token validation
- `ushadow/backend/src/services/token_bridge.py` - Keycloak → service token conversion
- `ushadow/backend/main.py` - Startup registration call
- `ushadow/backend/docs/AUTH_ARCHITECTURE.md` - Token bridge architecture

**Frontend:**
- `ushadow/frontend/src/pages/LoginPage.tsx` - Login/registration page
- `ushadow/frontend/src/contexts/KeycloakAuthContext.tsx` - Auth state management
- `ushadow/frontend/src/auth/TokenManager.ts` - Token storage & PKCE
- `ushadow/frontend/src/auth/OAuthCallback.tsx` - OAuth callback handler
- `ushadow/frontend/src/components/auth/ProtectedRoute.tsx` - Route protection

**Configuration:**
- `compose/docker-compose.infra.yml` - Keycloak service definition
- `.env` - Environment variables
