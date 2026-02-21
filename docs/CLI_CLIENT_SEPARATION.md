# CLI Client Separation - Implementation Summary

## Overview

We've separated CLI authentication from the web UI by creating a dedicated `ushadow-cli` Keycloak client. This follows OAuth2 best practices and improves security.

## Changes Made

### 1. Keycloak Realm Configuration

**File:** `config/keycloak/realm-export.json`

Added new client:
```json
{
  "clientId": "ushadow-cli",
  "name": "Ushadow CLI",
  "description": "Ushadow command-line tools (ush)",
  "directAccessGrantsEnabled": true,
  "standardFlowEnabled": false,
  ...
}
```

**Key differences from `ushadow-frontend`:**

| Feature | ushadow-frontend | ushadow-cli |
|---------|------------------|-------------|
| **Purpose** | Web UI | CLI tools (ush) |
| **Direct Access Grants** | ❌ Disabled | ✅ Enabled |
| **Standard Flow (OAuth)** | ✅ Enabled | ❌ Disabled |
| **Redirect URIs** | Required | Not needed |
| **PKCE** | Enabled | Not needed |

### 2. Backend Configuration

**File:** `config/config.defaults.yaml`

Added CLI client ID configuration:
```yaml
keycloak:
  frontend_client_id: ushadow-frontend  # Web UI
  cli_client_id: ushadow-cli            # CLI tools
```

### 3. Client Code

**File:** `ushadow/client/auth.py`

Changed from:
```python
"client_id": "ushadow-frontend",
```

To:
```python
"client_id": "ushadow-cli",  # Dedicated CLI client
```

### 4. Scripts Updated

All scripts now reference `ushadow-cli`:

- ✅ `scripts/fix-ush-auth.py` - Creates/enables CLI client
- ✅ `scripts/diagnose-ush-auth.sh` - Tests CLI client auth
- ✅ `scripts/enable-keycloak-cli-auth.sh` - Enables direct grants for CLI
- ✅ `scripts/create-cli-client.py` - **NEW** - Creates CLI client in existing Keycloak

### 5. Documentation

**File:** `docs/USH_AUTH_TROUBLESHOOTING.md`

Updated all references from `ushadow-frontend` to `ushadow-cli`.

## Security Benefits

### Before (Single Client)

```
ushadow-frontend
├─ Web UI uses it ✓
├─ CLI uses it ✓
└─ Direct Access Grants enabled for BOTH ⚠️
    └─ Security concern: Web UI doesn't need this capability
```

**Risk:** If someone compromises the web UI, they could potentially use the client ID with Direct Access Grants to collect credentials.

### After (Separate Clients)

```
ushadow-frontend                ushadow-cli
├─ Web UI only                 ├─ CLI tools only
├─ OAuth Code Flow ✓           ├─ Direct Access Grants ✓
└─ Direct Grants: OFF ✓        └─ OAuth Flow: OFF ✓

Each client has only the permissions it needs!
```

**Benefits:**
- ✅ Principle of least privilege
- ✅ Clear separation of concerns
- ✅ Better audit trail (know which client was used)
- ✅ Can disable CLI without affecting web UI
- ✅ Follows OAuth2 best practices

## Migration Steps

### For New Installations

No action needed! The new client is in `realm-export.json` and will be created automatically when Keycloak starts.

### For Existing Keycloak Instances

Run this script to create the new client:

```bash
python scripts/create-cli-client.py
```

This will:
1. Check if `ushadow-cli` client exists
2. Create it if missing
3. Enable Direct Access Grants
4. Test the configuration

## Testing

After migration, test that `ush` works:

```bash
# Test authentication
./ush whoami --verbose

# Should show:
# 🔐 Attempting Keycloak authentication: http://localhost:8081/...
#    User: admin@example.com, Realm: ushadow
# ✅ Login successful (Keycloak)
```

## Rollback (If Needed)

If you need to rollback to the old single-client approach:

1. Edit `ushadow/client/auth.py`:
   ```python
   "client_id": "ushadow-frontend",
   ```

2. Enable Direct Access Grants for `ushadow-frontend` in Keycloak Admin Console

3. Test with `./ush whoami --verbose`

## Architecture Diagram

```
┌─────────────────┐          ┌──────────────────┐
│   Web Browser   │          │   ush CLI Tool   │
└────────┬────────┘          └────────┬─────────┘
         │                            │
         │ OAuth Code Flow            │ Direct Grant
         │ (PKCE)                     │ (Password)
         ▼                            ▼
    ┌────────────────────────────────────┐
    │         Keycloak Server            │
    │                                    │
    │  ┌──────────────┐  ┌────────────┐ │
    │  │  ushadow-    │  │  ushadow-  │ │
    │  │  frontend    │  │  cli       │ │
    │  │              │  │            │ │
    │  │ Direct Grant │  │ Direct     │ │
    │  │ ❌ Disabled  │  │ Grant      │ │
    │  │              │  │ ✅ Enabled │ │
    │  └──────────────┘  └────────────┘ │
    └────────────────────────────────────┘
         │                            │
         └────────────┬───────────────┘
                      ▼
              ┌───────────────┐
              │ ushadow realm │
              │    (users)    │
              └───────────────┘
```

## Files Changed

- `config/keycloak/realm-export.json` - Added ushadow-cli client
- `config/keycloak/realms/ushadow-realm.json` - Synced with realm-export
- `config/config.defaults.yaml` - Added cli_client_id config
- `ushadow/client/auth.py` - Changed client_id to ushadow-cli
- `scripts/fix-ush-auth.py` - Updated to use ushadow-cli
- `scripts/diagnose-ush-auth.sh` - Updated to test ushadow-cli
- `scripts/enable-keycloak-cli-auth.sh` - Updated to enable ushadow-cli
- `scripts/create-cli-client.py` - **NEW** script
- `docs/USH_AUTH_TROUBLESHOOTING.md` - Updated documentation

## Next Steps

1. **Restart Keycloak** (if running) to pick up new realm config:
   ```bash
   docker-compose restart keycloak
   ```

2. **OR** Create the client manually:
   ```bash
   python scripts/create-cli-client.py
   ```

3. **Test authentication:**
   ```bash
   ./ush whoami --verbose
   ```

4. **Verify separation:**
   - Web UI should still use ushadow-frontend (check browser dev tools)
   - CLI should use ushadow-cli (check verbose output)

## FAQ

**Q: Why not just enable Direct Grants for ushadow-frontend?**
A: Security best practice is to give each client only the permissions it needs. The web UI doesn't need Direct Grants, so it shouldn't have it enabled.

**Q: Will this break existing installations?**
A: For new Keycloak instances, no. For existing instances, run `python scripts/create-cli-client.py` to add the new client.

**Q: Can I still use the web UI?**
A: Yes! The web UI is unchanged and continues using ushadow-frontend with the standard OAuth Code Flow.

**Q: What if I have multiple CLI tools?**
A: They can all use the same `ushadow-cli` client. It's designed for any first-party CLI tool.
