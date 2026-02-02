# User Registration and Social Login Setup

Keycloak is already configured to allow user registration. This guide shows how registration works and how to add social login for the Model A (guest accounts) architecture.

## Registration Status: Already Enabled ✅

The `setup_keycloak.py` script already configured:

```yaml
registrationAllowed: True          # Users can self-register
registrationEmailAsUsername: True  # Email is the username
resetPasswordAllowed: True         # Password reset enabled
loginWithEmailAllowed: True        # Can login with email
```

## How Registration Works Now

### Option 1: Standard Email/Password Registration (Current)

When users visit the Keycloak login page:

1. **Access Login Page**: User clicks share link → redirected to Keycloak
2. **Click "Register"**: Link appears at bottom of login form
3. **Fill Registration Form**: Email, first name, last name, password
4. **Auto-Login**: After registration, immediately logged in
5. **Access Resource**: Redirected back to voice message

**Try it now**:
```bash
# Visit the Keycloak registration page directly
open http://localhost:8081/realms/ushadow/protocol/openid-connect/registrations?client_id=ushadow-frontend&redirect_uri=http://localhost:3000&response_type=code&scope=openid
```

### Option 2: Social Login Registration (Recommended for Model A)

For your use case (Bob accessing Alice's shared voice message), social login is better because:
- **No password to remember** - Bob uses existing Google/GitHub account
- **Faster signup** - One click vs filling form
- **Better UX** - Familiar flow
- **More secure** - No password to leak

## Setting Up Social Login

You have several social provider options. I recommend starting with **Google** as it's most common.

### Google OAuth Setup (Recommended First)

#### Step 1: Create Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing: "Ushadow Auth"
3. Enable Google+ API (required for social login)
4. Navigate to **APIs & Services** → **Credentials**
5. Click **Create Credentials** → **OAuth 2.0 Client ID**
6. Application type: **Web application**
7. Configure:
   - **Name**: Ushadow Keycloak
   - **Authorized redirect URIs**:
     ```
     http://localhost:8081/realms/ushadow/broker/google/endpoint
     ```
8. Click **Create**
9. Copy the **Client ID** and **Client Secret**

**Important**: The redirect URI MUST match exactly:
```
http://localhost:8081/realms/ushadow/broker/google/endpoint
                       ^^^^^^^^        ^^^^^^
                       Your port      Identity provider ID
```

#### Step 2: Configure Keycloak Identity Provider

**Option A: Via Admin Console (5 minutes)**

1. Open Keycloak Admin Console: http://localhost:8081/admin
2. Login: admin / admin
3. Select **ushadow** realm (dropdown at top)
4. Navigate to **Identity Providers** (left sidebar)
5. Click **Add provider** → Select **Google**
6. Configure:
   - **Alias**: `google` (must match redirect URI)
   - **Client ID**: [paste from Google Console]
   - **Client Secret**: [paste from Google Console]
   - **Default Scopes**: `openid profile email`
   - **Store Tokens**: ON (optional - allows accessing Google APIs later)
   - **Trust Email**: ON (email from Google is verified)
   - **First Login Flow**: `first broker login` (auto-creates user account)
7. Click **Save**

**Option B: Via Script (Automated)**

Create `scripts/add_google_oauth.py`:

```python
from keycloak import KeycloakAdmin
import os

KEYCLOAK_URL = os.getenv("KEYCLOAK_URL", "http://localhost:8081")
ADMIN_USER = os.getenv("KEYCLOAK_ADMIN_USER", "admin")
ADMIN_PASSWORD = os.getenv("KEYCLOAK_ADMIN_PASSWORD", "admin")
REALM_NAME = "ushadow"

# Get from Google Cloud Console
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")

def setup_google_provider():
    admin = KeycloakAdmin(
        server_url=KEYCLOAK_URL,
        username=ADMIN_USER,
        password=ADMIN_PASSWORD,
        realm_name="master",
        verify=True
    )
    admin.realm_name = REALM_NAME

    provider_config = {
        "alias": "google",
        "providerId": "google",
        "enabled": True,
        "updateProfileFirstLoginMode": "on",
        "trustEmail": True,
        "storeToken": True,
        "addReadTokenRoleOnCreate": False,
        "authenticateByDefault": False,
        "linkOnly": False,
        "firstBrokerLoginFlowAlias": "first broker login",
        "config": {
            "clientId": GOOGLE_CLIENT_ID,
            "clientSecret": GOOGLE_CLIENT_SECRET,
            "defaultScope": "openid profile email",
            "syncMode": "IMPORT"
        }
    }

    try:
        admin.create_identity_provider(provider_config)
        print("✅ Google OAuth provider added!")
    except Exception as e:
        print(f"⚠️  Provider might already exist: {e}")

if __name__ == "__main__":
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        print("❌ Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables")
        exit(1)
    setup_google_provider()
```

Run it:
```bash
export GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
export GOOGLE_CLIENT_SECRET="your-client-secret"
python scripts/add_google_oauth.py
```

#### Step 3: Test Social Login

1. Visit login page: http://localhost:8081/realms/ushadow/account
2. You should now see **"Sign in with Google"** button
3. Click it → redirected to Google
4. Choose Google account → redirected back to Keycloak
5. New user account auto-created with Google email

### GitHub OAuth Setup (Alternative)

Good option if your users are developers.

#### GitHub Setup:

1. Go to https://github.com/settings/developers
2. Click **New OAuth App**
3. Configure:
   - **Application name**: Ushadow
   - **Homepage URL**: http://localhost:8081
   - **Authorization callback URL**:
     ```
     http://localhost:8081/realms/ushadow/broker/github/endpoint
     ```
4. Copy **Client ID** and **Client Secret**

#### Keycloak Configuration:

Same as Google, but:
- Provider: **GitHub**
- Alias: `github`
- Default Scopes: `user:email`

### Other Providers

Keycloak supports many identity providers out of the box:
- Microsoft (Azure AD)
- Facebook
- Twitter
- LinkedIn
- Apple
- Generic OIDC (any OAuth2/OIDC provider)
- SAML providers (enterprise SSO)

## User Experience Flow

### With Social Login Enabled

**Scenario**: Alice shares voice message with Bob (who has no account)

1. **Bob clicks share link**: `https://ushadow.example.com/share/msg-123`
2. **Redirect to Keycloak**: Login page shows:
   ```
   ┌─────────────────────────────┐
   │     Sign in to Ushadow      │
   ├─────────────────────────────┤
   │  ┌────────────────────────┐ │
   │  │ 🔵 Sign in with Google │ │
   │  └────────────────────────┘ │
   │  ┌────────────────────────┐ │
   │  │ 😺 Sign in with GitHub │ │
   │  └────────────────────────┘ │
   │                             │
   │  ─────── or ───────         │
   │                             │
   │  Email: ________________    │
   │  Password: _____________    │
   │  [ Login ]                  │
   │                             │
   │  Don't have an account?     │
   │  Register                   │
   └─────────────────────────────┘
   ```
3. **Bob clicks "Sign in with Google"**
4. **Google login**: Bob selects Google account (already logged in)
5. **Auto-account creation**: Keycloak creates Bob's account
6. **Redirect back**: Bob lands at `/share/msg-123` with valid token
7. **Access granted**: Backend validates token, checks permissions, serves audio

**Total clicks for Bob**: 2 (share link + Google button)

### Without Social Login (Email/Password)

Same flow, but Bob must:
1. Click "Register"
2. Fill form (email, name, password)
3. Click "Register" button
4. Redirected to voice message

**Total clicks for Bob**: 4-5 (more friction)

## Frontend Integration

Your frontend needs to handle the OIDC redirect flow. Here's the complete user journey:

### Authentication State Management

The frontend needs to:
1. **Detect unauthenticated state** when accessing protected resource
2. **Redirect to Keycloak** login page with proper parameters
3. **Handle redirect back** after login/registration
4. **Store access token** in session/localStorage
5. **Include token** in API requests

### Example: Sharing Flow Implementation

Create `frontend/src/auth/ProtectedShare.tsx`:

```typescript
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

interface ShareParams {
  shareId: string;
}

export default function ProtectedShare() {
  const { shareId } = useParams<ShareParams>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuthAndLoadMessage();
  }, [shareId]);

  async function checkAuthAndLoadMessage() {
    // TODO: Implement token check
    // TODO: If no token, redirect to Keycloak
    // TODO: If token exists, fetch message

    // This is where YOU decide the authentication strategy:
    // - Where to store tokens (localStorage vs sessionStorage)?
    // - How long should sessions last?
    // - Should tokens auto-refresh?

    // See IMPLEMENTATION_DECISIONS.md for guidance
  }

  // Rest of component...
}
```

I've prepared the structure, but the **token storage and session management** is a design decision that affects security vs UX. See the next section.

## Implementation Decisions You Need to Make

I've set up the infrastructure, but there are key decisions that shape how this feature works:

### Decision 1: Token Storage Strategy

**Location**: `frontend/src/auth/ProtectedShare.tsx`

**Question**: Where should access tokens be stored?

**Options**:

A. **sessionStorage** (stricter security)
   - Tokens cleared when tab closes
   - More secure (no XSS across tabs)
   - User must re-login for each share link in new tab

B. **localStorage** (better UX)
   - Tokens persist across tabs
   - Easier UX (login once, access all shares)
   - More XSS attack surface

C. **Memory only** (strictest)
   - Token only in component state
   - Lost on page refresh
   - User must re-login on refresh

**My recommendation**: Start with sessionStorage (A) for security, then add "Remember me" option for localStorage (B).

### Decision 2: Token Refresh Strategy

**Location**: `frontend/src/auth/TokenManager.ts`

**Question**: How should token expiration be handled?

**Options**:

A. **Auto-refresh** (seamless UX)
   - Silent refresh before token expires
   - User stays logged in
   - More complex implementation

B. **Re-login on expiration** (simpler)
   - Redirect to Keycloak when expired
   - Simple to implement
   - User might lose state

**My recommendation**: B for MVP, then add A later.

### Decision 3: Registration Flow Customization

**Question**: Should you customize the registration form?

**Options**:

A. **Use Keycloak hosted page** (Current setup)
   - ✅ Zero frontend work
   - ✅ Social login integrated
   - ✅ Password reset, email verification included
   - ❌ Can't customize fields
   - ❌ Different domain (localhost:8081 vs localhost:3000)

B. **Build custom registration form**
   - ✅ Full control over fields and styling
   - ✅ Same domain as app
   - ❌ Must implement form validation
   - ❌ Must handle social login buttons manually
   - ❌ Must implement password reset flow

**My recommendation**: A (Keycloak hosted) for MVP. You can customize Keycloak's theme later if needed.

## Testing the Complete Flow

Once you implement the frontend (or if you want to test manually):

### Test 1: Standard Registration

```bash
# 1. Start the flow
curl -i http://localhost:8000/api/voices/share/msg-123

# Expected: 401 Unauthorized with WWW-Authenticate header

# 2. Visit login page in browser
open "http://localhost:8081/realms/ushadow/protocol/openid-connect/auth?client_id=ushadow-frontend&redirect_uri=http://localhost:3000/share/msg-123&response_type=code&scope=openid"

# 3. Click "Register"
# 4. Fill form and submit
# 5. Should redirect to http://localhost:3000/share/msg-123?code=...
```

### Test 2: Social Login (after Google setup)

Same as above, but click "Sign in with Google" instead of "Register".

### Test 3: Existing User Login

Same flow, but user clicks "Login" and enters credentials.

## Production Considerations

### Email Verification

Currently disabled (`verifyEmail: False`). For production:

1. Configure SMTP in Keycloak:
   - Admin Console → Realm Settings → Email
   - Add SMTP server details

2. Enable verification:
   ```python
   # In setup_keycloak.py
   "verifyEmail": True,
   ```

3. Users must verify email before accessing shared content

### Domain Configuration

For production (e.g., `auth.ushadow.com`):

```yaml
# In docker-compose.infra.yml
environment:
  KC_HOSTNAME: auth.ushadow.com
  KC_HOSTNAME_STRICT_HTTPS: true
  KC_PROXY: edge  # Behind nginx/traefik
```

Update Google OAuth redirect URI:
```
https://auth.ushadow.com/realms/ushadow/broker/google/endpoint
```

### Custom Branding

Customize Keycloak's login/registration pages:

1. Create theme in `config/keycloak/themes/ushadow/`
2. Add logo, colors, custom CSS
3. Set as default theme in realm settings

## Next Steps

1. ✅ Registration enabled (already done)
2. ⏳ **Choose social provider** (Google recommended)
3. ⏳ **Set up OAuth credentials** (5 min)
4. ⏳ **Configure identity provider** in Keycloak (5 min)
5. ⏳ **Implement frontend OIDC flow** (see NEXT_STEPS.md)
6. ⏳ **Test complete sharing flow**

The infrastructure is ready - you just need to add the OAuth credentials and implement the frontend redirect handling.
