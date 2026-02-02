# Testing Keycloak Integration

This guide walks you through testing the complete voice message sharing flow with Keycloak.

## Prerequisites

- Infrastructure running with Keycloak:
  ```bash
  docker compose -f compose/docker-compose.infra.yml --profile postgres up -d
  docker compose -f compose/docker-compose.infra.yml --profile keycloak up -d
  ```
- Setup script completed (`python scripts/setup_keycloak.py`)
- Backend configured with Keycloak enabled

---

## Test 1: Keycloak Health Check (1 minute)

```bash
# Check if Keycloak is running
curl http://localhost:8080/health/ready

# Expected response:
{"status":"UP","checks":[]}

# If not ready, check logs:
docker logs -f ushadow-keycloak
```

**✅ Success criteria**: Returns `{"status":"UP"}`

---

## Test 2: Admin Console Access (2 minutes)

1. Open http://localhost:8080 in browser
2. Click "Administration Console"
3. Login:
   - Username: `admin`
   - Password: (from `config/SECRETS/secrets.yaml`)
4. Should see Keycloak admin dashboard

**✅ Success criteria**: Can access admin console

---

## Test 3: Realm Configuration (3 minutes)

In Keycloak admin console:

1. Click realm dropdown (top left) → Select `ushadow`
2. Navigate to **Clients** (left sidebar)
3. Should see:
   - `ushadow-backend` (Confidential client)
   - `ushadow-frontend` (Public client)
   - `chronicle` (Service account)

4. Click `ushadow-frontend` → **Settings** tab
5. Verify:
   - Client ID: `ushadow-frontend`
   - Access Type: `public`
   - Valid Redirect URIs: `http://localhost:*/*`

**✅ Success criteria**: All clients present and configured

---

## Test 4: Backend Authentication Status (2 minutes)

```bash
# Check auth status endpoint
curl http://localhost:8000/api/auth/status

# Expected response (if keycloak.enabled=true):
{
  "keycloak_enabled": true,
  "legacy_enabled": true,
  "migration_mode": "hybrid"
}

# Expected response (if keycloak.enabled=false):
{
  "keycloak_enabled": false,
  "legacy_enabled": true,
  "migration_mode": "legacy-only"
}
```

**✅ Success criteria**: Returns expected auth status

---

## Test 5: Get OIDC Configuration (2 minutes)

```bash
# Get Keycloak OIDC discovery endpoint
curl http://localhost:8080/realms/ushadow/.well-known/openid-configuration

# Should return large JSON with endpoints:
{
  "issuer": "http://localhost:8080/realms/ushadow",
  "authorization_endpoint": "http://localhost:8080/realms/ushadow/protocol/openid-connect/auth",
  "token_endpoint": "http://localhost:8080/realms/ushadow/protocol/openid-connect/token",
  ...
}
```

**✅ Success criteria**: Returns OIDC configuration

---

## Test 6: Create Test User (5 minutes)

### Option A: Via Admin Console

1. In Keycloak admin console → **Users** (left sidebar)
2. Click **Add user**
3. Fill in:
   - Username: `alice@test.com`
   - Email: `alice@test.com`
   - Email Verified: **ON**
   - First Name: `Alice`
   - Last Name: `Test`
4. Click **Save**
5. Go to **Credentials** tab
6. Set password:
   - Password: `password123`
   - Temporary: **OFF**
7. Click **Set Password**

### Option B: Via API

```bash
# Get admin token first
ADMIN_TOKEN=$(curl -X POST http://localhost:8080/realms/master/protocol/openid-connect/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin" \
  -d "password=admin" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" | jq -r '.access_token')

# Create user
curl -X POST http://localhost:8080/admin/realms/ushadow/users \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "alice@test.com",
    "email": "alice@test.com",
    "enabled": true,
    "emailVerified": true,
    "firstName": "Alice",
    "lastName": "Test",
    "credentials": [{
      "type": "password",
      "value": "password123",
      "temporary": false
    }]
  }'
```

**✅ Success criteria**: User `alice@test.com` created

---

## Test 7: Get Access Token (5 minutes)

```bash
# Login as Alice to get token
TOKEN=$(curl -X POST http://localhost:8080/realms/ushadow/protocol/openid-connect/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=alice@test.com" \
  -d "password=password123" \
  -d "grant_type=password" \
  -d "client_id=ushadow-backend" \
  -d "client_secret=<YOUR_BACKEND_CLIENT_SECRET>" | jq -r '.access_token')

# Verify token is not empty
echo "Token: $TOKEN"

# Decode token to see claims (optional)
echo $TOKEN | cut -d. -f2 | base64 -d 2>/dev/null | jq
```

**✅ Success criteria**: Receives access token

**Note**: Get `client_secret` from setup script output or Keycloak console → Clients → ushadow-backend → Credentials

---

## Test 8: Validate Token with Backend (3 minutes)

```bash
# Call /me endpoint with Keycloak token
curl -X GET http://localhost:8000/api/auth/me \
  -H "Authorization: Bearer $TOKEN"

# Expected response:
{
  "id": "some-uuid",
  "email": "alice@test.com",
  "display_name": "Alice Test",
  "is_active": true,
  "is_superuser": false,
  "auth_provider": "keycloak"
}
```

**✅ Success criteria**: Backend validates Keycloak token and returns user info

---

## Test 9: Voice Message Upload (10 minutes)

This test simulates the complete sharing flow.

### Step 1: Create test audio file

```bash
# Create a simple test audio file (1 second of silence)
ffmpeg -f lavfi -i anullsrc=r=44100:cl=mono -t 1 -acodec libopus test_voice.opus
```

### Step 2: Upload voice message

```bash
# Upload as Alice
curl -X POST http://localhost:8000/api/voice-messages \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test_voice.opus" \
  -F "title=Test Message" \
  -F "description=Testing voice sharing"

# Expected response:
{
  "id": "msg-20260201-120000",
  "owner_id": "alice-uuid",
  "title": "Test Message",
  "message": "Voice message uploaded successfully"
}
```

**✅ Success criteria**: Message uploaded, returns message ID

---

## Test 10: Share Message (5 minutes)

```bash
# Alice shares with bob@gmail.com
MESSAGE_ID="msg-20260201-120000"  # From previous step

curl -X POST http://localhost:8000/api/voice-messages/$MESSAGE_ID/share \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "bob@gmail.com",
    "scopes": ["view"]
  }'

# Expected response:
{
  "share_link": "http://localhost:8000/voice-messages/msg-20260201-120000",
  "recipient_email": "bob@gmail.com",
  "scopes": ["view"]
}
```

**✅ Success criteria**: Share created, returns share link

---

## Test 11: Access as Guest (10 minutes)

Simulates Bob (who doesn't have account) accessing Alice's message.

### Step 1: Create Bob's account (guest)

```bash
# Bob creates account by logging in with Google (or email/password)
# For testing, create via admin console or API (same as Test 6)

# Create bob@gmail.com user
# Set password: password123
```

### Step 2: Bob gets token

```bash
BOB_TOKEN=$(curl -X POST http://localhost:8080/realms/ushadow/protocol/openid-connect/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=bob@gmail.com" \
  -d "password=password123" \
  -d "grant_type=password" \
  -d "client_id=ushadow-backend" \
  -d "client_secret=<YOUR_BACKEND_CLIENT_SECRET>" | jq -r '.access_token')
```

### Step 3: Bob accesses message

```bash
# Bob tries to access Alice's message
curl -X GET http://localhost:8000/api/voice-messages/$MESSAGE_ID \
  -H "Authorization: Bearer $BOB_TOKEN"

# Expected response (if permission granted):
{
  "id": "msg-20260201-120000",
  "owner_id": "alice-uuid",
  "title": "Test Message",
  "can_view": true,
  "can_share": false,
  "can_delete": false
}

# Or (if permission not granted):
{
  "detail": "You don't have permission to access this message"
}
```

**✅ Success criteria**: Bob can access (if shared) or gets 403 (if not shared)

---

## Test 12: Revoke Access (5 minutes)

```bash
# Alice revokes Bob's access
curl -X DELETE http://localhost:8000/api/voice-messages/$MESSAGE_ID/shares/bob-uuid \
  -H "Authorization: Bearer $TOKEN"

# Expected response:
{
  "message": "Access revoked successfully"
}

# Bob tries again - should fail
curl -X GET http://localhost:8000/api/voice-messages/$MESSAGE_ID \
  -H "Authorization: Bearer $BOB_TOKEN"

# Expected response:
{
  "detail": "You don't have permission to access this message"
}
```

**✅ Success criteria**: Bob immediately loses access after revocation

---

## Troubleshooting

### Token expired error

```bash
# Tokens expire after 24 hours (configurable)
# Get a fresh token:
TOKEN=$(curl -X POST http://localhost:8080/realms/ushadow/protocol/openid-connect/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=alice@test.com" \
  -d "password=password123" \
  -d "grant_type=password" \
  -d "client_id=ushadow-backend" \
  -d "client_secret=<SECRET>" | jq -r '.access_token')
```

### Invalid client secret

```bash
# Get secret from Keycloak admin console:
# Clients → ushadow-backend → Credentials → Secret

# Or regenerate:
# Credentials → Regenerate Secret
```

### Permission not working

```bash
# Check if UMA is enabled on backend client:
# Clients → ushadow-backend → Settings
# Authorization Enabled: ON
```

---

## Success! 🎉

If all tests pass, you have:
- ✅ Keycloak running and configured
- ✅ OIDC authentication working
- ✅ Token validation in backend
- ✅ Voice message upload/sharing
- ✅ Permission grants/revocations

**Next steps**:
1. Configure Google OAuth for social login
2. Update frontend to use OIDC flow
3. Test with real voice messages
4. Deploy to production

---

## Quick Reference

| What | Command |
|------|---------|
| Start Postgres | `docker compose -f compose/docker-compose.infra.yml --profile postgres up -d` |
| Start Keycloak | `docker compose -f compose/docker-compose.infra.yml --profile keycloak up -d` |
| Start All Infra | `docker compose -f compose/docker-compose.infra.yml --profile infra --profile postgres up -d` |
| Admin console | http://localhost:8081 |
| Health check | `curl http://localhost:8081/health/ready` |
| Get token | `curl -X POST http://localhost:8081/realms/ushadow/protocol/openid-connect/token ...` |
| Test backend | `curl -X GET http://localhost:8000/api/auth/me -H "Authorization: Bearer $TOKEN"` |
