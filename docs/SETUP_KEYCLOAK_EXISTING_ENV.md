# Setup Keycloak for Existing Environment

Your environment is already running! Here's how to finish the Keycloak setup.

## Current Status

✅ **Infrastructure**: Keycloak (8081), Postgres (5432), Redis, Mongo all running
✅ **Backend**: ushadow-backend running on port 8000
✅ **Frontend**: ushadow-webui running on port 3000
✅ **Code**: All auth components integrated

## What's Left (5 minutes)

### Step 1: Install Dependencies (1 min)

The backend needs `python-keycloak`. It's already in `pyproject.toml`:

```bash
cd ushadow/backend
uv pip install python-keycloak
```

### Step 2: Run Keycloak Setup (2 min)

This creates the realm, clients, and test users:

```bash
cd ../..  # Back to project root
python3 scripts/setup_keycloak.py
```

**Expected output**:
```
📦 Creating realm 'ushadow'...
✅ Realm created
🔐 Creating backend client...
✅ Backend client created
🌐 Creating frontend client...
✅ Frontend client created
```

### Step 3: Add Frontend Environment Variables (30 sec)

The frontend needs to know where Keycloak is:

```bash
cd ushadow/frontend

# Create .env file
cat > .env << 'EOF'
VITE_KEYCLOAK_URL=http://localhost:8081
VITE_KEYCLOAK_REALM=ushadow
VITE_KEYCLOAK_CLIENT_ID=ushadow-frontend
VITE_BACKEND_URL=http://localhost:8000
EOF
```

### Step 4: Install Frontend Dependency (30 sec)

```bash
npm install jwt-decode
# or if using yarn:
# yarn add jwt-decode
```

### Step 5: Restart Frontend (1 min)

For the .env changes to take effect:

```bash
docker restart ushadow-webui

# Or if running locally:
# npm run dev
```

## Test the Auth Flow

Visit the test page:
```bash
open http://localhost:3000/auth/test
```

**What you should see**:
1. Test page loads with "Login with Keycloak" button
2. Click button → redirects to http://localhost:8081
3. Keycloak login page appears
4. Can register new account or use test user: `alice@example.com` / `password`
5. After login → redirects back to test page
6. Shows your user info and token details

## Troubleshooting

### Keycloak not healthy

```bash
docker logs keycloak --tail 50

# Restart if needed
docker restart keycloak
```

### Frontend can't reach backend

Check the backend logs:
```bash
docker logs ushadow-backend --tail 50
```

The `/api/auth/token` endpoint should be registered. Verify:
```bash
curl http://localhost:8000/docs | grep "/api/auth/token"
```

### "Module not found: jwt-decode"

```bash
cd ushadow/frontend
docker exec ushadow-webui npm install jwt-decode
docker restart ushadow-webui
```

### Backend missing python-keycloak

```bash
cd ushadow/backend
docker exec ushadow-backend pip install python-keycloak
docker restart ushadow-backend
```

## Environment Setup (For setup/run.py)

The setup script now automatically:
- Generates Keycloak secrets in `config/secrets.yaml`
- Shares them across all environments (one Keycloak instance)
- Skips regeneration if secrets already exist

Secrets are already generated when you run:
```bash
python setup/run.py
```

## What About the Theme?

The custom theme (green/purple matching your design) is created but not applied yet. Two options:

**Option A**: Apply via setup script (requires python-keycloak - already done in Step 2):
```bash
python3 scripts/setup_keycloak.py
```

The theme will be set to `ushadow` automatically.

**Option B**: Apply manually:
1. Go to http://localhost:8081/admin (login: admin/admin)
2. Select `ushadow` realm (dropdown at top)
3. Realm Settings → Themes tab
4. Login Theme: `ushadow`
5. Save

## Next Steps

Once auth is working:

### 1. Add Social Login (Optional, 15 min)

```bash
# Get Google OAuth credentials
# https://console.cloud.google.com/

export GOOGLE_CLIENT_ID="your-id.apps.googleusercontent.com"
export GOOGLE_CLIENT_SECRET="your-secret"
python3 scripts/add_google_oauth.py
```

### 2. Build Voice Sharing

Use the auth in your components:

```typescript
import { useKeycloakAuth } from '../contexts/KeycloakAuthContext'

function VoiceShare({ messageId }: { messageId: string }) {
  const { isAuthenticated, login } = useKeycloakAuth()

  if (!isAuthenticated) {
    return <button onClick={() => login()}>Login to Listen</button>
  }

  return <AudioPlayer messageId={messageId} />
}
```

## Architecture Notes

### Shared Keycloak

All environments (port 8000, 8200, 8333, etc.) share ONE Keycloak instance:
- Keycloak: localhost:8081
- All backends trust the same realm
- Users authenticated once can access all environments

This is intentional - you don't want separate auth per environment.

### Secrets Location

Keycloak secrets are in `config/secrets.yaml`:
```yaml
keycloak:
  admin_password: "..." # Auto-generated
  backend_client_secret: "..." # For confidential backend client
  chronicle_client_secret: "..." # For chronicle service
```

These are shared across environments and generated once.

### Legacy Auth Still Works

The existing email/password auth (`AuthContext`) continues working:
- New Keycloak auth is additive
- Use `useAuth()` for legacy (app internal users)
- Use `useKeycloakAuth()` for federated (external users, voice sharing)

## Quick Reference

| Service | URL | Status |
|---------|-----|--------|
| Frontend | http://localhost:3000 | Running ✅ |
| Backend | http://localhost:8000 | Running ✅ |
| Keycloak | http://localhost:8081 | Running ✅ |
| Test Page | http://localhost:3000/auth/test | Ready 🎯 |
| Keycloak Admin | http://localhost:8081/admin | admin/admin |

## Files Modified

- ✅ `ushadow/backend/pyproject.toml` - Added python-keycloak
- ✅ `ushadow/backend/src/routers/auth_token.py` - Token exchange endpoint
- ✅ `ushadow/backend/main.py` - Router registered
- ✅ `ushadow/frontend/src/App.tsx` - Added KeycloakAuthProvider and routes
- ✅ `ushadow/frontend/src/contexts/KeycloakAuthContext.tsx` - Auth state
- ✅ `ushadow/frontend/src/auth/*` - Token management
- ✅ `ushadow/frontend/src/pages/KeycloakTestPage.tsx` - Test UI
- ✅ `setup/setup_utils.py` - Keycloak secret generation
- ✅ `setup/run.py` - Auto-generates secrets on startup

Your auth system is ready to test! 🎉
