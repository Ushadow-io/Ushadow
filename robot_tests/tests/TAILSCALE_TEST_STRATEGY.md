# Tailscale Test Strategy

## Overview

This document explains the testing strategy for Tailscale API endpoints, including what can be tested directly vs what requires stubs/mocks.

---

## Test Categories

### ✅ **Unit Tests** - API Contract Tests (No Tailscale Required)

These tests verify the **API interface** without needing a real Tailscale connection:

| Test | What It Verifies | Can Run Without Tailscale? |
|------|------------------|---------------------------|
| Container status endpoint exists | Returns 200, has correct JSON schema | ✅ Yes |
| Response has required fields | `exists`, `running`, `authenticated` fields present | ✅ Yes |
| Fields have correct types | Boolean fields are booleans | ✅ Yes |
| Error handling | Returns appropriate error codes | ✅ Yes |
| Environment info endpoint | Returns environment name, container names | ✅ Yes |

**Tag:** `unit`

**Run with:** `robot --include unit robot_tests/tests/api_tailscale_core.robot`

---

### 🔄 **Integration Tests** - Require Real Tailscale

These tests require a running Tailscale container:

| Test | What It Verifies | Requires |
|------|------------------|----------|
| Detect container is running | Container exists and is running | Tailscale container started |
| Detect authentication state | Tailscale is authenticated to tailnet | Tailscale authenticated |
| Get auth URL | Can retrieve Tailscale login URL | Tailscale container running |
| Start container | Can create/start Tailscale container | Docker daemon |
| Get tailnet settings | MagicDNS, HTTPS settings | Tailscale authenticated |
| Get access URLs | Returns correct Tailscale URLs | Tailscale configured |

**Tag:** `integration`

**Run with:** `robot --include integration robot_tests/tests/api_tailscale_core.robot`

**Requirements:**
- Docker daemon running
- Tailscale container: `docker-compose up tailscale`
- Optional: Tailscale authenticated for full tests

---

### ⚠️ **Destructive Tests** - Modify State

These tests change Tailscale state (de-auth, delete container):

| Test | What It Does | Caution |
|------|--------------|---------|
| Clear authentication | Logs out, deletes container & volume | ⚠️ Breaks Tailscale connection |

**Tag:** `destructive`

**Run with:** `robot --include destructive robot_tests/tests/api_tailscale_core.robot`

**⚠️ WARNING:** Only run in test environment! Will disconnect Tailscale.

---

### 🚫 **Skipped Tests** - Need Special Setup

These tests are skipped by default because they require specific tailnet configuration:

| Test | Why Skipped | Requirements |
|------|-------------|--------------|
| Provision certificate | Requires HTTPS enabled on tailnet | Tailnet with HTTPS cert support |

**Tag:** `skip`

**To enable:** Remove `skip` tag and ensure tailnet has HTTPS enabled

---

## Test Execution Guide

### 1. **Quick API Contract Check** (No Tailscale needed)

```bash
# Test API endpoints return correct structure
robot --include unit robot_tests/tests/api_tailscale_core.robot
```

**Expected:** All tests pass (verify API contract)

---

### 2. **Full Integration Tests** (Requires Tailscale)

```bash
# Start Tailscale container first
docker-compose up -d tailscale

# Run integration tests
robot --include integration robot_tests/tests/api_tailscale_core.robot
```

**Expected:**
- Tests pass if Tailscale is running
- Some may skip if not authenticated (documented in test output)

---

### 3. **All Tests (Except Destructive)**

```bash
# Run all safe tests
robot --exclude destructive --exclude skip robot_tests/tests/api_tailscale_core.robot
```

---

### 4. **Test Authentication Flow** (Destructive)

```bash
# ⚠️ This will de-auth and delete container!
robot --include destructive robot_tests/tests/api_tailscale_core.robot
```

**After running:** Tailscale will need to be re-authenticated

---

## Setting Up Test Tailnet

### Option 1: Use Existing Dev Tailnet ✅ **Recommended**

Use your personal/dev Tailscale account:

1. Start Tailscale container:
   ```bash
   docker-compose up -d tailscale
   ```

2. Get auth URL:
   ```bash
   curl http://localhost:8001/api/tailscale/container/auth-url | jq -r .auth_url
   ```

3. Open URL in browser and authenticate

4. Run tests:
   ```bash
   robot robot_tests/tests/api_tailscale_core.robot
   ```

**Pros:**
- ✅ Real Tailscale functionality
- ✅ Tests actual authentication flow
- ✅ Can test certificate generation

**Cons:**
- ⚠️ Requires manual auth step
- ⚠️ Adds machine to your tailnet
- ⚠️ Can't run in CI without headless auth

---

### Option 2: Create Dedicated Test Tailnet 🎯 **Best for CI**

Create a separate Tailscale account for testing:

1. Create test Tailscale account at https://login.tailscale.com
2. Enable MagicDNS and HTTPS in settings
3. Generate auth key for CI: https://login.tailscale.com/admin/settings/keys
4. Use auth key in tests:
   ```bash
   export TAILSCALE_AUTHKEY="tskey-auth-xxxx"
   ```

5. Auto-authenticate in tests:
   ```bash
   docker exec ushadow-tailscale tailscale up --authkey=$TAILSCALE_AUTHKEY
   ```

**Pros:**
- ✅ Dedicated test environment
- ✅ Can run in CI
- ✅ Doesn't pollute personal tailnet

**Cons:**
- Requires separate Tailscale account
- Auth keys expire and need rotation

---

### Option 3: Mock Tailscale Responses 🔧 **For Pure Unit Tests**

Use a mock HTTP server to simulate Tailscale responses:

```python
# tests/mocks/tailscale_mock.py
from flask import Flask, jsonify

app = Flask(__name__)

@app.route('/tailscale/status')
def status():
    return jsonify({
        "BackendState": "Running",
        "Self": {
            "DNSName": "test-machine.tail12345.ts.net",
            "TailscaleIPs": ["100.64.1.2"]
        }
    })
```

**Pros:**
- ✅ Fast tests
- ✅ No external dependencies
- ✅ Runs in CI without setup

**Cons:**
- ❌ Doesn't test real Tailscale
- ❌ Mock can drift from real API
- ❌ More maintenance

---

## What Each Test Requires

### Container Status (`/api/tailscale/container/status`)

**Can test without Tailscale:**
- ✅ Endpoint exists
- ✅ Returns correct JSON schema
- ✅ Field types are correct

**Requires Tailscale:**
- Container exists: true/false
- Container running: true/false
- Authentication state
- Hostname and IP (when authenticated)

**Test approach:** Run both unit (schema) and integration (actual state) tests

---

### Get Auth URL (`/api/tailscale/container/auth-url`)

**Can test without Tailscale:**
- ✅ Endpoint exists
- ✅ Returns JSON with `auth_url`, `web_url`, `qr_code_data`

**Requires Tailscale:**
- Auth URL is valid Tailscale login link
- QR code contains auth URL

**Test approach:**
- Unit test verifies response structure
- Integration test verifies URL format

---

### Clear Auth (`/api/tailscale/container/clear-auth`)

**Can test without Tailscale:**
- ✅ Endpoint exists
- ✅ Returns success/error status

**Requires Tailscale:**
- Actually logs out from Tailscale
- Removes container
- Deletes volume

**Test approach:**
- **Unit test:** Response structure
- **Integration test:** Verify container is gone after
- **⚠️ Destructive:** Will break Tailscale connection

---

### Provision Certificate (`/api/tailscale/container/provision-cert`)

**Can test without Tailscale:**
- ✅ Endpoint exists
- ✅ Returns `provisioned: true/false`

**Requires Tailscale + Tailnet HTTPS:**
- Tailscale authenticated
- Tailnet has HTTPS enabled
- Can generate real cert

**Test approach:**
- Unit test: Response schema
- **Skip integration by default** (requires special tailnet setup)
- Can enable with `--include cert` if tailnet supports HTTPS

---

### Get Access URLs (`/api/tailscale/access-urls`)

**Can test without Tailscale:**
- ✅ Endpoint exists
- ✅ Returns frontend/backend URLs
- ✅ URLs are HTTPS

**Requires Tailscale:**
- URLs contain actual Tailscale hostname
- URLs are reachable

**Test approach:**
- Unit test: Response structure and URL format
- Integration test: Verify hostname matches container status

---

### Tailnet Settings (`/api/tailscale/container/tailnet-settings`)

**Can test without Tailscale:**
- ✅ Endpoint exists
- ✅ Returns magic_dns and https_serve objects

**Requires Tailscale:**
- MagicDNS enabled/disabled state
- HTTPS enabled/disabled state

**Test approach:**
- Unit test: Response schema
- Integration test: Actual tailnet configuration

---

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Tailscale API Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Start services
        run: docker-compose up -d mongo redis backend

      - name: Run unit tests
        run: |
          robot --include unit \
                --outputdir test-results \
                robot_tests/tests/api_tailscale_core.robot

      - name: Start Tailscale (optional)
        if: env.TAILSCALE_AUTHKEY
        run: |
          docker-compose up -d tailscale
          docker exec ushadow-tailscale tailscale up --authkey=${{ secrets.TAILSCALE_AUTHKEY }}

      - name: Run integration tests (if Tailscale available)
        if: env.TAILSCALE_AUTHKEY
        run: |
          robot --include integration \
                --outputdir test-results \
                robot_tests/tests/api_tailscale_core.robot

      - name: Upload test results
        uses: actions/upload-artifact@v3
        with:
          name: robot-results
          path: test-results/
```

---

## Summary

| Test Type | Run Without Tailscale | Run in CI | Requires Setup |
|-----------|----------------------|-----------|----------------|
| **Unit Tests** | ✅ Yes | ✅ Yes | None |
| **Integration Tests** | ❌ No | ⚠️ With auth key | Tailscale running |
| **Destructive Tests** | ❌ No | ❌ Not recommended | Test environment only |
| **Certificate Tests** | ❌ No | ❌ No | HTTPS-enabled tailnet |

**Recommendation:**
1. Always run unit tests in CI
2. Run integration tests locally during development
3. Run integration tests in CI only if you have test tailnet + auth key
4. Never run destructive tests in CI
5. Skip certificate tests unless you have HTTPS-enabled test tailnet
