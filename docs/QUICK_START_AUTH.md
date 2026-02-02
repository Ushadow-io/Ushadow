# Quick Start: Keycloak Authentication

Complete guide to get the Keycloak authentication flow working in 5 minutes.

## Prerequisites

- Docker and Docker Compose installed
- Node.js and npm/yarn installed
- Backend Python dependencies installed

## Step 1: Start Infrastructure (2 min)

```bash
# Start Postgres and Keycloak
docker compose -f compose/docker-compose.infra.yml --profile postgres up -d
docker compose -f compose/docker-compose.infra.yml --profile keycloak up -d

# Wait for services to be healthy (30-60 seconds)
docker compose -f compose/docker-compose.infra.yml ps
```

**Verify**:
- Postgres: `docker exec postgres pg_isready`
- Keycloak: Open http://localhost:8081 (should load)

## Step 2: Configure Keycloak (1 min)

Install Python dependencies and run setup:

```bash
# Install Keycloak SDK
pip install python-keycloak python-dotenv

# Run setup script
python3 scripts/setup_keycloak.py
```

**Expected output**:
```
✅ Realm created
✅ Backend client created
✅ Frontend client created
✅ Keycloak setup complete!
```

**Verify**: Open http://localhost:8081/admin (login: admin/admin)

## Step 3: Configure Frontend (1 min)

Create environment file:

```bash
cd ushadow/frontend

# Copy example file
cp .env.example .env

# Or create manually:
cat > .env << 'EOF'
VITE_KEYCLOAK_URL=http://localhost:8081
VITE_KEYCLOAK_REALM=ushadow
VITE_KEYCLOAK_CLIENT_ID=ushadow-frontend
VITE_BACKEND_URL=http://localhost:8000
EOF
```

Install frontend dependency:

```bash
npm install jwt-decode
# or
yarn add jwt-decode
```

## Step 4: Start Services (1 min)

```bash
# Terminal 1: Backend
cd ushadow/backend
uvicorn main:app --reload

# Terminal 2: Frontend
cd ushadow/frontend
npm run dev
# or
yarn dev
```

## Step 5: Test Authentication Flow (1 min)

1. **Open test page**: http://localhost:3000/auth/test

2. **Click "Login with Keycloak"**
   - Redirects to http://localhost:8081
   - Shows Keycloak login page

3. **Login options**:
   - Click "Register" to create account
   - Or login with test user: `alice@example.com` / `password`

4. **Success!**
   - Redirects back to test page
   - Shows user info and token details

## Troubleshooting

### Keycloak not loading

```bash
# Check logs
docker logs keycloak

# Restart
docker restart keycloak
```

### Frontend can't reach backend

Check CORS settings in `backend/main.py`:
```python
origins = [
    "http://localhost:3000",
    "http://localhost:5173",  # Vite default
]
```

### Token exchange fails

Check backend logs:
```bash
# Should see endpoint registered
INFO: Application startup complete
```

Verify endpoint exists:
```bash
curl http://localhost:8000/docs
# Look for /api/auth/token endpoint
```

### "Module not found" errors

```bash
# Frontend
cd ushadow/frontend
npm install jwt-decode

# Backend
cd ushadow/backend
pip install python-keycloak httpx
```

## What You Just Built

✅ **Infrastructure**: Postgres + Keycloak containers
✅ **Realm Configuration**: `ushadow` realm with clients
✅ **Frontend Integration**: Context provider + routes
✅ **Backend Integration**: Token exchange endpoint
✅ **Test Page**: Working demo at `/auth/test`

## Next Steps

### Option A: Add Social Login (15 min)

Follow `docs/REGISTRATION_AND_SOCIAL_LOGIN.md`:
- Get Google OAuth credentials
- Run `scripts/add_google_oauth.py`
- Test one-click signup

### Option B: Build Voice Sharing (Your Feature!)

Now that auth works, you can:
1. Create protected voice message endpoints
2. Use `useKeycloakAuth()` to check authentication
3. Share links that redirect unauthenticated users to Keycloak

Example protected component:
```typescript
import { useKeycloakAuth } from '../contexts/KeycloakAuthContext'

function VoiceMessagePlayer({ messageId }: { messageId: string }) {
  const { isAuthenticated, login } = useKeycloakAuth()

  if (!isAuthenticated) {
    return (
      <button onClick={() => login()}>
        Login to Listen
      </button>
    )
  }

  // User is authenticated, show player
  return <AudioPlayer messageId={messageId} />
}
```

### Option C: Customize Theme

Follow `docs/THEMING_GUIDE.md` to:
- Match login page to your brand colors (already done!)
- Add custom logo
- Adjust button styles

## Architecture Overview

```
User clicks share link
    ↓
Frontend checks: isAuthenticated?
    ↓ (no)
Redirect to Keycloak (/realms/ushadow/protocol/openid-connect/auth)
    ↓
User logs in or registers
    ↓
Keycloak redirects back (/auth/callback?code=...)
    ↓
Frontend calls backend (/api/auth/token)
    ↓
Backend exchanges code for tokens (keeps client_secret safe)
    ↓
Frontend stores tokens in sessionStorage
    ↓
User can now access voice message
```

## Important Files

| File | Purpose |
|------|---------|
| `frontend/src/contexts/KeycloakAuthContext.tsx` | Authentication state management |
| `frontend/src/auth/TokenManager.ts` | Token storage and OIDC helpers |
| `frontend/src/auth/OAuthCallback.tsx` | Handles return from Keycloak |
| `backend/src/routers/auth_token.py` | Token exchange endpoint |
| `scripts/setup_keycloak.py` | Initial Keycloak configuration |

## Configuration Reference

### Keycloak URLs

- **Admin Console**: http://localhost:8081/admin
- **Realm Account**: http://localhost:8081/realms/ushadow/account
- **Login Endpoint**: http://localhost:8081/realms/ushadow/protocol/openid-connect/auth
- **Token Endpoint**: http://localhost:8081/realms/ushadow/protocol/openid-connect/token

### Default Credentials

**Keycloak Admin**:
- Username: `admin`
- Password: `admin`

**Test Users** (created by setup script):
- Alice: `alice@example.com` / `password`
- Bob: `bob@example.com` / `password`

### Environment Variables

**Frontend** (`.env`):
```bash
VITE_KEYCLOAK_URL=http://localhost:8081
VITE_KEYCLOAK_REALM=ushadow
VITE_KEYCLOAK_CLIENT_ID=ushadow-frontend
VITE_BACKEND_URL=http://localhost:8000
```

**Backend** (`config/config.defaults.yaml`):
```yaml
keycloak:
  enabled: true
  url: http://keycloak:8080  # Internal Docker network
  public_url: http://localhost:8081
  realm: ushadow
  backend_client_id: ushadow-backend
  frontend_client_id: ushadow-frontend
```

## Common Commands

```bash
# Restart Keycloak
docker restart keycloak

# Check Keycloak logs
docker logs -f keycloak

# Re-run setup (idempotent)
python3 scripts/setup_keycloak.py

# Stop everything
docker compose -f compose/docker-compose.infra.yml down

# Stop and remove data
docker compose -f compose/docker-compose.infra.yml down -v
```

## Success Checklist

- [ ] Keycloak admin console loads (http://localhost:8081/admin)
- [ ] Can login with admin/admin
- [ ] `ushadow` realm exists
- [ ] Frontend test page loads (http://localhost:3000/auth/test)
- [ ] Clicking "Login" redirects to Keycloak
- [ ] Can register new account
- [ ] After login, redirected back to test page
- [ ] User info displayed correctly
- [ ] Token expiry time shown

If all checkboxes pass: **🎉 You're ready to build!**
