# Keycloak Configuration

This directory contains Keycloak setup and configuration files.

## Quick Start

1. **Start Keycloak**:
   ```bash
   docker compose -f compose/keycloak.yml up -d
   ```

2. **Run setup script** (creates realm, clients, and authorization settings):
   ```bash
   python scripts/setup_keycloak.py
   ```

3. **Access Admin Console**:
   - URL: http://localhost:8080
   - Username: admin
   - Password: admin (change in .env: KEYCLOAK_ADMIN_PASSWORD)

## What Gets Created

### Realm: `ushadow`
- The authentication realm for your organization

### Clients:
- `ushadow-backend` - Backend API client (confidential)
- `ushadow-frontend` - Web UI client (public, PKCE-enabled)
- `chronicle` - Chronicle service client (confidential)

### Authorization Resources (for voice sharing):
- Resource type: `voice-message`
- Scopes: `view`, `share`, `delete`
- Policies: User-based, time-based, owner-based

## Files

- `realm-export.json` - Pre-configured realm (auto-imported on startup)
- `themes/` - Custom login page themes (optional)

## Manual Setup (Alternative)

If you prefer to set up manually instead of using the script:

1. Create realm "ushadow"
2. Create clients (see clients configuration below)
3. Enable authorization services on ushadow-backend client
4. Create resource types and scopes

## Environment Variables

Add to your `.env`:

```bash
# Keycloak
KEYCLOAK_PORT=8080
KEYCLOAK_ADMIN_USER=admin
KEYCLOAK_ADMIN_PASSWORD=changeme  # CHANGE THIS
KEYCLOAK_DB=keycloak
KEYCLOAK_DB_USER=keycloak
KEYCLOAK_DB_PASSWORD=changeme  # CHANGE THIS
KEYCLOAK_HOSTNAME=localhost
```

## Integration

Your backend will validate OIDC tokens from Keycloak:

```python
from fastapi import Depends
from keycloak import KeycloakOpenID

keycloak_openid = KeycloakOpenID(
    server_url="http://keycloak:8080",
    realm_name="ushadow",
    client_id="ushadow-backend",
    client_secret_key="<from-keycloak-admin>"
)

async def get_current_user(token: str = Depends(oauth2_scheme)):
    user_info = keycloak_openid.userinfo(token)
    return user_info
```

## Voice Message Sharing Flow

1. **User uploads voice message**:
   - Backend creates Keycloak resource: `voice-message-{id}`
   - Assigns owner permission automatically

2. **User shares with friend**:
   - Backend creates permission: `{friend-user-id} can view voice-message-{id}`
   - Generates share link with embedded token or permission ID

3. **Friend accesses message**:
   - Frontend requests access with token
   - Backend checks Keycloak authorization
   - Serves file if permitted

4. **User revokes access**:
   - Backend deletes permission in Keycloak
   - Friend can no longer access

## Resources

- [Keycloak Authorization Services](https://www.keycloak.org/docs/latest/authorization_services/)
- [Resource-Based Authorization](https://medium.com/@kasturepadmakar4u/resource-and-scope-based-authorization-in-keycloak-1fdb90408e91)
- [User-Managed Access (UMA)](https://www.keycloak.org/docs/latest/authorization_services/#_service_user_managed_access)
