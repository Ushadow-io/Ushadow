# Keycloak Login Fixes - Complete Summary

## Issues Fixed

### 1. ✅ Login Page Shows Password Fields
**Problem**: Login page displayed username/password fields, but these were non-functional (Keycloak handles credentials, not the app).

**Solution**: Replaced the entire login form with a single "Sign in with Keycloak" button that clearly indicates users will be redirected to Keycloak for authentication.

**File Changed**: `ushadow/frontend/src/pages/LoginPage.tsx`

**Before**:
```tsx
<input type="email" ... />
<input type="password" ... />
<button>Sign in</button>
```

**After**:
```tsx
<button onClick={handleLogin}>
  <LogIn /> Sign in with Keycloak
</button>
<p>You'll be redirected to Keycloak for secure authentication</p>
```

---

### 2. ✅ OAuth Callback Route Missing
**Problem**: After successful Keycloak login, users were redirected to `/oauth/callback?code=...`, but this route wasn't registered in the app. React Router didn't recognize it, so it redirected to the login page, creating an infinite loop.

**Solution**: Added the OAuth callback route as a public route in App.tsx.

**File Changed**: `ushadow/frontend/src/App.tsx`

**Changes**:
1. Imported OAuthCallback component:
   ```tsx
   import OAuthCallback from './auth/OAuthCallback'
   ```

2. Registered the route:
   ```tsx
   {/* Public Routes */}
   <Route path="/oauth/callback" element={<OAuthCallback />} />
   ```

---

### 3. ✅ Keycloak Disabled in Backend
**Problem**: Keycloak was not enabled in the backend configuration, so:
- Redirect URI auto-registration didn't run
- Keycloak token validation wasn't active
- Backend defaulted to legacy JWT auth

**Solution**: Enabled Keycloak in configuration files.

**Files Changed**:
1. `config/config.defaults.yaml` - Added Keycloak configuration:
   ```yaml
   keycloak:
     enabled: true
     url: http://keycloak:8080  # Internal Docker URL
     public_url: http://localhost:8081  # External browser URL
     realm: ushadow
     backend_client_id: ushadow-backend
     frontend_client_id: ushadow-frontend
     admin_user: admin
   ```

2. `config/SECRETS/secrets.yaml` - Added Keycloak secrets:
   ```yaml
   keycloak:
     admin_password: changeme
     backend_client_secret: ''  # Set after Keycloak setup
   ```

---

## How OAuth Login Works Now

### Flow Diagram

```
User clicks "Sign in with Keycloak"
    ↓
Frontend redirects to Keycloak
    (http://localhost:8081/realms/ushadow/protocol/openid-connect/auth)
    ↓
User enters credentials at Keycloak
    ↓
Keycloak redirects back to /oauth/callback?code=abc123&state=xyz
    ↓
OAuthCallback component intercepts
    ↓
Exchanges authorization code for tokens
    (calls backend /api/auth/token/exchange)
    ↓
Stores tokens in sessionStorage
    ↓
Redirects to original destination (or /)
    ↓
✅ User is logged in!
```

### Security Features

1. **PKCE Flow**: Code Challenge prevents authorization code interception
2. **State Parameter**: CSRF protection via random state token
3. **Session Storage**: Tokens stored in sessionStorage (cleared on tab close)
4. **Automatic Refresh**: Tokens auto-refresh 60 seconds before expiry

---

## Testing the Login Flow

### 1. Start Keycloak
```bash
docker-compose up -d keycloak
```

Wait for Keycloak to be ready (check logs):
```bash
docker-compose logs -f keycloak | grep "started"
```

### 2. Restart Backend
This triggers automatic redirect URI registration:
```bash
docker-compose restart backend
```

Check for successful registration:
```bash
docker-compose logs backend | grep KC-STARTUP
```

You should see:
```
[KC-STARTUP] 🔐 Registering redirect URIs with Keycloak...
[KC-STARTUP] Environment: PORT_OFFSET=10
[KC-STARTUP] ✅ Redirect URIs registered successfully
```

### 3. Test Login
1. Navigate to `http://localhost:3010/login`
2. Click "Sign in with Keycloak"
3. You'll be redirected to Keycloak at `http://localhost:8081`
4. Login with Keycloak credentials (default: admin / changeme)
5. You'll be redirected back to the app and logged in

### 4. Verify Token Storage
Open browser DevTools → Application → Session Storage → `http://localhost:3010`

You should see:
- `kc_access_token`: JWT access token
- `kc_refresh_token`: Refresh token
- `kc_id_token`: ID token with user info

---

## Troubleshooting

### Redirect URI Error
**Symptom**: "Invalid parameter: redirect_uri" when clicking login

**Cause**: Keycloak client doesn't have the redirect URI whitelisted

**Solution**:
1. Check if auto-registration succeeded:
   ```bash
   docker-compose logs backend | grep KC-STARTUP
   ```

2. If it failed, manually register the URI:
   - Go to Keycloak admin: `http://localhost:8081`
   - Login with admin credentials
   - Navigate to: Clients → ushadow-frontend → Settings
   - Add to "Valid Redirect URIs": `http://localhost:3010/oauth/callback`
   - Click "Save"

### Still Redirects to Login
**Symptom**: After Keycloak login, you're sent back to the login page

**Cause**: OAuth callback route not working

**Check**:
1. Open browser DevTools → Console
2. Look for errors during callback processing
3. Check Network tab for failed API calls to `/api/auth/token/exchange`

**Common Issues**:
- Backend not running
- Keycloak not reachable from backend
- CORS issues (check backend CORS configuration)

### Token Exchange Fails
**Symptom**: Error message on callback page: "Authentication failed"

**Check Backend Logs**:
```bash
docker-compose logs -f backend | grep -i keycloak
```

**Common Causes**:
- Keycloak client secret not configured
- Backend can't reach Keycloak at `http://keycloak:8080`
- PKCE verification failed (check code_verifier in sessionStorage)

---

## Architecture Notes

### Dual Authentication System

The system now supports **both** authentication methods simultaneously:

1. **Keycloak OAuth (Primary)**
   - Modern SSO with federated identity
   - Supports Google, GitHub, etc. (when configured in Keycloak)
   - Used by default for new users

2. **Legacy JWT (Fallback)**
   - Email/password in ushadow database
   - Backward compatible with existing users
   - Used for admin access if Keycloak is down

### Provider Hierarchy

```
App
├─ KeycloakAuthProvider (outer)
│  └─ Provides: isAuthenticated, login, logout (OAuth)
│
└─ AuthProvider (inner)
   └─ Provides: user, token (legacy JWT)
```

LoginPage uses KeycloakAuthProvider exclusively. Protected routes can check either provider.

---

## Next Steps

### 1. Configure Keycloak Client Secret
For production, set a proper client secret:

1. Generate a secret in Keycloak admin console
2. Update `config/SECRETS/secrets.yaml`:
   ```yaml
   keycloak:
     backend_client_secret: 'your-generated-secret'
   ```

### 2. Set Up User Federation
Configure Keycloak to sync with external identity providers:
- Google OAuth
- GitHub OAuth
- Corporate LDAP/AD

### 3. Test Share Feature with Keycloak
Now that login works, test the complete share flow:

1. Login with Keycloak
2. Navigate to a conversation
3. Click "Share" button
4. Create a share link
5. Verify the share URL uses your Tailscale hostname

---

## Files Modified

### Frontend
- ✅ `ushadow/frontend/src/pages/LoginPage.tsx` - Simplified to SSO button only
- ✅ `ushadow/frontend/src/App.tsx` - Added OAuth callback route
- ✅ `ushadow/frontend/package.json` - Added jwt-decode dependency

### Backend Configuration
- ✅ `config/config.defaults.yaml` - Enabled Keycloak
- ✅ `config/SECRETS/secrets.yaml` - Added Keycloak credentials

### Share Feature (from previous work)
- ✅ `ushadow/backend/src/routers/share.py` - Implemented share URL strategy
- ✅ `ushadow/frontend/src/pages/ConversationDetailPage.tsx` - Added share button
- ✅ Complete conversation sharing infrastructure

---

## Summary

**Before**: Login page had non-functional password fields, OAuth callback wasn't registered, and Keycloak was disabled.

**After**: Clean SSO login flow with Keycloak, automatic redirect URI registration, and complete OAuth callback handling.

**Impact**: Users can now successfully log in via Keycloak and access the full share feature with proper authentication!
