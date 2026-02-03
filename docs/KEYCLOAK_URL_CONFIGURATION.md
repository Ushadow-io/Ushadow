# Keycloak URL Configuration

This guide explains how to configure Keycloak to accept OAuth redirects from different URLs (localhost ports, Tailscale domains, production domains, etc.).

## 🎯 Three Configuration Methods

### **Option 1: Manual Configuration** (Quick Testing)

Best for: Quick testing, single environment

1. Access Keycloak Admin Console:
   ```bash
   open http://localhost:8081
   ```

2. Login with admin credentials from `.env`:
   - Username: `KEYCLOAK_ADMIN` (default: `admin`)
   - Password: `KEYCLOAK_ADMIN_PASSWORD` (default: `admin`)

3. Navigate to **Clients** → **ushadow-frontend** → **Settings**

4. Add redirect URIs to **Valid redirect URIs**:
   ```
   http://localhost:3000/oauth/callback
   http://localhost:3010/oauth/callback
   http://localhost:3020/oauth/callback
   https://*.ts.net/oauth/callback
   https://yourdomain.com/oauth/callback
   ```

5. Add post-logout URIs to **Valid post logout redirect URIs**:
   ```
   http://localhost:3000/*
   http://localhost:3010/*
   http://localhost:3020/*
   https://*.ts.net/*
   https://yourdomain.com/*
   ```

6. Click **Save**

**Pros**: Immediate, no code changes
**Cons**: Manual, lost on container restart, doesn't scale

---

### **Option 2: Automatic Registration** (Recommended) ✅

Best for: Multi-worktree development, dynamic environments

The backend automatically registers its redirect URIs on startup using the Keycloak Admin API.

#### How It Works

1. **Automatic on Backend Startup**: When the backend starts, it:
   - Detects the current `PORT_OFFSET` environment variable
   - Calculates the frontend port (3000 + PORT_OFFSET)
   - Registers `http://localhost:{port}/oauth/callback` with Keycloak
   - Also registers Tailscale hostname if `TAILSCALE_HOSTNAME` is set

2. **Environment Variables**:
   ```bash
   # In your .env file
   PORT_OFFSET=10              # Frontend runs on 3010
   TAILSCALE_HOSTNAME=myapp.ts.net  # Optional: Tailscale domain
   FRONTEND_URL=https://app.example.com  # Optional: Custom domain
   KEYCLOAK_AUTO_REGISTER=true  # Enable auto-registration (default)
   ```

3. **Multi-Worktree Example**:
   ```bash
   # Worktree 1: ushadow (PORT_OFFSET=10)
   # → Registers http://localhost:3010/oauth/callback

   # Worktree 2: ushadow-orange (PORT_OFFSET=20)
   # → Registers http://localhost:3020/oauth/callback

   # Each environment auto-registers its own URIs!
   ```

#### Manual Script Registration

You can also manually register URIs using the included script:

```bash
# Register a specific redirect URI
python scripts/register_keycloak_redirects.py http://localhost:3010/oauth/callback

# Register Tailscale domain
python scripts/register_keycloak_redirects.py https://myapp.ts.net/oauth/callback

# Register production domain
python scripts/register_keycloak_redirects.py https://app.example.com/oauth/callback
```

**Pros**: Automatic, scales to any number of environments, persists across container restarts
**Cons**: Requires backend to be running, needs Keycloak admin credentials

---

### **Option 3: API-Based Configuration** (For Advanced Use Cases)

Best for: Production deployments, infrastructure-as-code

Use the Keycloak Admin API endpoints directly:

```bash
# Get current client configuration
curl http://localhost:8000/api/keycloak/clients/ushadow-frontend/config

# Enable PKCE for the client (security best practice)
curl -X POST http://localhost:8000/api/keycloak/clients/ushadow-frontend/enable-pkce
```

You can also use the `KeycloakAdminClient` service in Python:

```python
from src.services.keycloak_admin import get_keycloak_admin

admin_client = get_keycloak_admin()

# Add redirect URIs
await admin_client.update_client_redirect_uris(
    client_id="ushadow-frontend",
    redirect_uris=[
        "http://localhost:3010/oauth/callback",
        "https://app.example.com/oauth/callback"
    ],
    merge=True  # Merge with existing URIs
)

# Add post-logout redirect URIs
await admin_client.update_post_logout_redirect_uris(
    client_id="ushadow-frontend",
    post_logout_redirect_uris=[
        "http://localhost:3010",
        "https://app.example.com"
    ],
    merge=True
)
```

**Pros**: Programmatic, can be integrated into deployment pipelines
**Cons**: Requires code, more complex

---

## 🔧 Configuration Reference

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT_OFFSET` | `10` | Port offset for frontend (3000 + offset) |
| `FRONTEND_URL` | - | Custom frontend URL for production |
| `TAILSCALE_HOSTNAME` | - | Tailscale hostname (e.g., `myapp.ts.net`) |
| `KEYCLOAK_AUTO_REGISTER` | `true` | Enable automatic redirect URI registration |
| `KEYCLOAK_URL` | `http://localhost:8081` | Keycloak URL (internal) |
| `KEYCLOAK_ADMIN` | `admin` | Keycloak admin username |
| `KEYCLOAK_ADMIN_PASSWORD` | `admin` | Keycloak admin password |

### Redirect URI Patterns

| Pattern | Purpose | Example |
|---------|---------|---------|
| `http://localhost:{port}/oauth/callback` | Local development | `http://localhost:3010/oauth/callback` |
| `https://*.ts.net/oauth/callback` | Tailscale domains (wildcard) | `https://myapp.ts.net/oauth/callback` |
| `https://yourdomain.com/oauth/callback` | Production domain | `https://app.example.com/oauth/callback` |

### Post-Logout Redirect URI Patterns

| Pattern | Purpose | Example |
|---------|---------|---------|
| `http://localhost:{port}/*` | Local development | `http://localhost:3010/` |
| `https://*.ts.net/*` | Tailscale domains (wildcard) | `https://myapp.ts.net/` |
| `https://yourdomain.com/*` | Production domain | `https://app.example.com/` |

---

## 🚨 Troubleshooting

### "Invalid redirect_uri" Error

**Cause**: The redirect URI is not registered in Keycloak

**Solutions**:
1. Check backend logs for auto-registration status
2. Manually add the URI using Option 1 (Admin Console)
3. Run the registration script: `python scripts/register_keycloak_redirects.py <uri>`
4. Verify `KEYCLOAK_AUTO_REGISTER=true` in your `.env`

### Auto-Registration Not Working

**Check**:
1. Keycloak is running: `docker ps | grep keycloak`
2. Admin credentials are correct in `.env`
3. Backend logs show registration attempt
4. Keycloak is accessible from backend: `docker exec -it ushadow-backend curl http://keycloak:8080`

**Workaround**: Use manual registration (Option 1) while debugging

### Multi-Worktree Conflicts

**Issue**: Multiple worktrees trying to register URIs simultaneously

**Solution**: Auto-registration merges URIs by default, so this should not cause conflicts. Each worktree adds its own URI to the shared list.

---

## 📚 Related Documentation

- [Keycloak OAuth Implementation](./KEYCLOAK_OAUTH.md) (TODO)
- [Multi-Worktree Setup](./MULTI_WORKTREE.md) (TODO)
- [Keycloak Admin API](https://www.keycloak.org/docs-api/latest/rest-api/)
