---
name: debug-robot-api
description: This skill should be used when the user asks to "debug robot api tests", "fix a failing api test", "diagnose a robot api test failure", "why is my robot api test failing", or "run api tests and fix them". Drives a fast run-parse-fix cycle for Robot Framework API tests using RequestsLibrary.
---

## Purpose

Drive a fast debug cycle for failing Robot Framework API tests:
**run with debug logging → parse output for HTTP details → identify cause → fix → verify**.

API tests fail at the HTTP layer (status codes, response bodies, auth tokens) — not the DOM. The debug workflow is entirely different from browser tests.

---

## Step 1 — Run with debug logging

```bash
# All API tests with verbose HTTP output
cd robot_tests && pixi run robot --loglevel DEBUG api/

# Single suite (fastest)
cd robot_tests && pixi run robot --loglevel DEBUG api/keycloak_auth.robot

# Single test by name
cd robot_tests && pixi run robot --loglevel DEBUG --test "TC-KC-001*" api/keycloak_auth.robot
```

`--loglevel DEBUG` logs the full request URL, headers, and response body for every HTTP call. Without it, you only see the status code.

---

## Step 2 — Parse the failure output

### output.xml — status codes and response bodies

```bash
# All FAIL lines with surrounding context
python3 -c "
import xml.etree.ElementTree as ET
try:
    tree = ET.parse('robot_tests/output.xml')
    for msg in tree.getroot().iter('msg'):
        if msg.get('level') == 'FAIL' or (msg.text and 'status' in (msg.text or '').lower()):
            print(msg.text[:300])
            print('---')
except: pass
" 2>/dev/null | head -80

# Quick grep for HTTP status codes in output
grep -o 'status.*[0-9]\{3\}\|[0-9]\{3\}.*status\|HTTPError\|ConnectionError\|FAIL' \
    robot_tests/output.xml | sort -u | head -20

# Response body at failure point
grep -o '.\{0,50\}response\|body\|detail.\{0,200\}' robot_tests/output.xml | head -20
```

### log.html — easiest to read

Open in a browser for full formatted output with collapsible sections:
```bash
open robot_tests/log.html
```

### Backend container logs

Often the clearest signal — shows the actual exception or validation error:
```bash
docker logs ushadow-test-backend-test-1 --tail 50

# Follow while running tests
docker logs ushadow-test-backend-test-1 -f
```

---

## Step 3 — Identify the failure pattern

### Pattern A: Connection refused / backend not ready

**Symptom:**
```
ConnectionError: HTTPConnectionPool(host='localhost', port=8200): Max retries exceeded
```

**Cause:** Backend container not running or still starting.

**Diagnosis:**
```bash
# Check container status
docker ps | grep ushadow-test

# Check if backend responds
curl -s http://localhost:8200/health | python3 -m json.tool

# Start containers if needed
cd robot_tests && make start
```

**Fix:** Wait for containers before running. The suite setup handles this — if containers are already running it reuses them. If not, run `make start` first or ensure the suite setup keyword is included.

---

### Pattern B: 401 Unauthorized

**Symptom:**
```
Expected status 200 but got 401
```

**Cause:** Missing auth token, expired token, or wrong client credentials.

**Diagnosis:**
```bash
# Check if token endpoint works
curl -s -X POST http://localhost:8181/realms/ushadow/protocol/openid-connect/token \
  -d "grant_type=password&client_id=ushadow-frontend&username=kctest@example.com&password=TestKeycloak123!" \
  | python3 -m json.tool

# Check if test user exists in Keycloak
TOKEN=$(curl -s -X POST http://localhost:8181/realms/master/protocol/openid-connect/token \
  -d "grant_type=password&client_id=admin-cli&username=admin&password=admin" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8181/admin/realms/ushadow/users?email=kctest@example.com" | python3 -m json.tool
```

**Common fixes:**
- Test user not created → suite setup should call `Ensure Keycloak Test User Exists`
- Wrong client_id in token request → check `KEYCLOAK_CLIENT_ID` in `test_env.py` (should be `ushadow-frontend` or `ushadow-cli`)
- Token expired mid-suite → refresh in suite setup or request a fresh token per test

---

### Pattern C: 403 Forbidden

**Symptom:**
```
Expected status 200 but got 403
```

**Cause:** Token present but insufficient permissions, or using wrong client type.

**Common case — introspection with public client:**
Keycloak's token introspection endpoint (`/protocol/openid-connect/token/introspect`) requires a **confidential client** with client credentials. The `ushadow-frontend` client is public and will get 401/403.

**Fix:**
```robot
# Check status gracefully — skip if introspection not supported
${response}=    POST On Session    ...    expected_status=any
IF    '${response.status_code}' in ['401', '403']
    Skip    Token introspection requires confidential client (public client limitation)
END
Should Be Equal As Integers    ${response.status_code}    200
```

Or use the CLI client (`ushadow-cli`) if it's configured as confidential:
```robot
# Use CLI client for introspection
${token}=    Get Token Via CLI Client
```

---

### Pattern D: 404 Not Found

**Symptom:**
```
Expected status 200 but got 404
```

**Cause:** Endpoint path is wrong, or the route doesn't exist.

**Diagnosis:**
```bash
# Check what routes are registered on the backend
curl -s http://localhost:8200/openapi.json | python3 -c "
import sys, json
spec = json.load(sys.stdin)
for path in sorted(spec.get('paths', {}).keys()):
    print(path)
" | grep -i auth

# Or view Swagger UI
open http://localhost:8200/docs
```

**Fix:** Correct the endpoint path in the robot file. Check the backend's router to confirm the exact path.

---

### Pattern E: Response body mismatch

**Symptom:**
```
'expected_field' != 'actual_field'
Should Be Equal As Strings    FAIL
```

**Cause:** The response JSON structure changed, or the test is checking the wrong key.

**Diagnosis:**
```bash
# Make the call manually and inspect the actual response
curl -s -X POST http://localhost:8200/api/auth/token \
  -H "Content-Type: application/json" \
  -d '{"code":"test","code_verifier":"test","redirect_uri":"http://localhost:3001/oauth/callback"}' \
  | python3 -m json.tool
```

Check the actual field names in the response vs what the test asserts. Common mismatches:
- `access_token` vs `token`
- `user_id` vs `id`
- Nested vs flat structure (`user.email` vs `email`)

---

### Pattern F: Suite setup failure

**Symptom:** Tests show as `NOT RUN` or the suite itself fails before any tests execute.

**Diagnosis:**
```bash
# Check the first FAIL message
grep -m5 'FAIL\|ERROR' robot_tests/output.xml

# Check container health
docker ps --format "table {{.Names}}\t{{.Status}}" | grep ushadow-test
```

**Common causes:**
- MongoDB not cleared (`✓ MongoDB test database cleared` should appear in console)
- Keycloak not reachable at `http://localhost:8181`
- Backend health check failing at `http://localhost:8200/health`

---

## Step 4 — Common fixes reference

### Auth keywords (from `resources/auth_keywords.robot`)

```robot
# Get a token for the test user
${TOKEN}=    Get Keycloak Token    ${KEYCLOAK_TEST_EMAIL}    ${KEYCLOAK_TEST_PASSWORD}

# Ensure the test user exists (idempotent — safe to call in setup)
Ensure Keycloak Test User Exists

# Create auth header dict
${HEADERS}=    Create Dictionary    Authorization=Bearer ${TOKEN}
```

### Session management

```robot
# Create a session pointing at the backend
Create Session    api    ${BACKEND_URL}    headers=${HEADERS}

# Make a call
${resp}=    GET On Session    api    /api/auth/me    expected_status=200

# Log full response for debugging
Log    Response: ${resp.status_code} ${resp.text}
```

### Graceful skip vs fail

```robot
# Skip if feature not available (e.g. confidential client not configured)
${resp}=    POST On Session    api    ${ENDPOINT}    expected_status=any
Skip If    '${resp.status_code}' == '501'    Feature not implemented

# Assert with helpful message
Should Be Equal As Integers    ${resp.status_code}    200
...    Expected 200 but got ${resp.status_code}: ${resp.text}
```

---

## Step 5 — Fix and verify

```bash
# Re-run with debug logging to confirm fix
cd robot_tests && pixi run robot --loglevel DEBUG api/keycloak_auth.robot
```

Expected output when passing:
```
TC-KC-001: Authenticate with Keycloak Direct Grant   | PASS |
TC-KC-002: OAuth Authorization Code Flow (skip)      | SKIP |
TC-KC-003: Validate Access Token                     | PASS |
TC-KC-004: Introspect Access Token (skip)            | SKIP |
TC-KC-005: Refresh Access Token                      | PASS |
TC-KC-006: Logout and Revoke Tokens                  | PASS |
6 tests, 4 passed, 0 failed, 2 skipped
```

---

## Environment quick reference

| Service | Port | URL |
|---------|------|-----|
| Backend | 8200 | `http://localhost:8200` |
| Keycloak (test) | 8181 | `http://localhost:8181` |
| MongoDB (test) | 27118 | `mongodb://localhost:27118` |
| Redis (test) | 6480 | `redis://localhost:6480` |

Keycloak admin: `admin` / `admin`
Test user: `kctest@example.com` / `TestKeycloak123!`
Realm: `ushadow`
Frontend client: `ushadow-frontend` (public)
CLI client: `ushadow-cli` (confidential, for direct grant)

## Key files

| File | Purpose |
|------|---------|
| `robot_tests/api/keycloak_auth.robot` | Keycloak auth test suite |
| `robot_tests/resources/auth_keywords.robot` | Shared auth keywords |
| `robot_tests/resources/setup/test_env.py` | URLs, ports, credentials |
| `robot_tests/resources/setup/suite_setup.robot` | Container start/stop |
| `robot_tests/output.xml` | Last run results |
| `robot_tests/log.html` | Human-readable log (open in browser) |
