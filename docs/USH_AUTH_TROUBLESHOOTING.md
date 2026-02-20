# ush CLI Authentication Troubleshooting

The `ush` CLI tool provides command-line access to the ushadow backend API with automatic authentication.

## Quick Fix

If `ush` authentication isn't working, run:

```bash
python scripts/fix-ush-auth.py
```

This script will:
1. ✓ Create/update the admin user in Keycloak
2. ✓ Ensure credentials match between Keycloak and secrets.yaml
3. ✓ Enable Direct Access Grants for CLI authentication
4. ✓ Test the authentication flow

## How ush Authentication Works

`ush` tries two authentication methods in order:

1. **Keycloak Direct Grant** (preferred):
   - Fetches Keycloak config from `/api/keycloak/config`
   - Authenticates via OAuth2 Resource Owner Password Credentials flow
   - Requires Direct Access Grants enabled on `ushadow-cli` client

2. **Legacy JWT** (fallback):
   - Posts credentials to `/api/auth/jwt/login`
   - Uses legacy fastapi-users JWT authentication

## Requirements for Keycloak Auth

For Keycloak authentication to work:

### 1. Keycloak must be enabled
Check `config/config.defaults.yaml`:
```yaml
keycloak:
  enabled: true
```

### 2. Keycloak must be running
```bash
docker-compose up -d keycloak
# Verify: curl http://localhost:8081/realms/ushadow
```

### 3. Admin user must exist in Keycloak
The user configured in `config/SECRETS/secrets.yaml` must exist in Keycloak with the same password:

```yaml
admin:
  email: admin@example.com
  password: your_password
```

### 4. Direct Access Grants must be enabled
The `ushadow-cli` client in Keycloak must have "Direct Access Grants Enabled" turned on.

## Diagnostics

To diagnose authentication issues:

```bash
./scripts/diagnose-ush-auth.sh
```

This will check:
- ✓ Backend connectivity
- ✓ Keycloak configuration
- ✓ Keycloak accessibility
- ✓ Credentials configuration
- ✓ Direct Access Grants capability
- ✓ ush CLI authentication

## Manual Setup

If the automated fix doesn't work, manually configure:

### Enable Direct Access Grants in Keycloak Admin Console:
1. Go to: http://localhost:8081/admin
2. Login as admin (default: admin/admin)
3. Select realm: **ushadow**
4. Go to: **Clients** → **ushadow-cli** → **Settings**
5. **Capability config** section:
   - Enable: **Direct access grants**
6. Click: **Save**

### Create admin user in Keycloak:
1. Go to: **Users** → **Add user**
2. Set:
   - Username: admin@example.com
   - Email: admin@example.com
   - Email verified: ON
   - Enabled: ON
3. Click: **Create**
4. Go to: **Credentials** tab
5. Click: **Set password**
6. Set password matching secrets.yaml
7. Temporary: **OFF**
8. Click: **Save**

## Verbose Mode

For detailed error messages:

```bash
./ush health --verbose
./ush whoami --verbose
```

This will show:
- 🔐 Authentication attempts
- ⚠️  Keycloak errors with details
- ✅ Success/failure for each method

## Credential Resolution

`ush` looks for credentials in this order:

1. `config/SECRETS/secrets.yaml` → `admin.email` and `admin.password`
2. `.env` file → `ADMIN_EMAIL` and `ADMIN_PASSWORD`
3. Environment variables → `ADMIN_EMAIL` and `ADMIN_PASSWORD`
4. Defaults → `admin@example.com` + empty password

Make sure credentials are set in at least one location.

## Common Errors

### "unauthorized_client" error
```
⚠️ Keycloak auth failed (400): unauthorized_client
```

**Fix**: Direct Access Grants is not enabled for ushadow-cli client.
```bash
python scripts/fix-ush-auth.py
```

### "invalid_grant" error
```
⚠️ Keycloak auth failed (401): Invalid user credentials
```

**Fix**: Password doesn't match or user doesn't exist in Keycloak.
```bash
python scripts/fix-ush-auth.py
```

### "Keycloak not available" error
```
⚠️ Keycloak not available: ConnectionError
```

**Fix**: Keycloak is not running.
```bash
docker-compose up -d keycloak
```

### "Backend unreachable" error
```
❌ Backend unreachable: [Errno 61] Connection refused
```

**Fix**: Backend is not running.
```bash
cd ushadow/backend && pixi run dev
```

## Testing

Test authentication explicitly:

```bash
# Test health endpoint (no auth required)
./ush health

# Test authenticated endpoint
./ush whoami

# Test service operations (requires auth)
./ush services list
./ush services start chronicle
```

## Scripts Reference

| Script | Purpose |
|--------|---------|
| `scripts/fix-ush-auth.py` | **One-command fix** - Creates user, enables direct grants, tests auth |
| `scripts/diagnose-ush-auth.sh` | **Diagnostic tool** - Checks all auth requirements |
| `scripts/enable-keycloak-cli-auth.sh` | **Legacy** - Only enables direct grants (doesn't create user) |

## Architecture

```
ush CLI
  │
  ├─> UshadowClient.from_env()
  │     └─> Loads credentials from secrets.yaml/.env
  │
  ├─> _ensure_authenticated()
  │     │
  │     ├─> _try_keycloak_direct_grant()
  │     │     ├─> GET /api/keycloak/config
  │     │     └─> POST {keycloak_url}/realms/{realm}/protocol/openid-connect/token
  │     │           grant_type=password, client_id=ushadow-cli
  │     │
  │     └─> Fallback: POST /api/auth/jwt/login
  │           (legacy fastapi-users JWT)
  │
  └─> API request with Bearer token
```

## Related Files

- **Client**: `ushadow/client/auth.py` - Authentication client used by ush
- **CLI**: `ush` - Main CLI tool
- **Keycloak Config**: `ushadow/backend/src/config/keycloak_settings.py`
- **Auth Router**: `ushadow/backend/src/routers/auth.py`
- **Keycloak Admin**: `ushadow/backend/src/routers/keycloak_admin.py`
