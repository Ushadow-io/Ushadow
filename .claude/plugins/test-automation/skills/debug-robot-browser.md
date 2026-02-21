---
name: debug-robot-browser
description: This skill should be used when the user asks to "debug robot browser tests", "fix a failing browser test", "diagnose a robot test failure", "why is my robot test failing", or "run browser tests and fix them". Drives a fast run-parse-fix cycle for Robot Framework browser tests (RF Browser / Playwright wrapper).
---

## Purpose

Drive a fast debug cycle for failing Robot Framework browser tests:
**run with short timeout → parse failure output → identify cause → fix → verify**.

Always prefer the reduced-timeout run for diagnosis. The default 15 s timeout means a single failing test wastes 15 s; 5 s surfaces the same failure 3× faster.

---

## Step 1 — Run with reduced timeout

```bash
# All browser tests (fastest diagnosis)
cd robot_tests && pixi run robot -v HEADLESS:true -v TIMEOUT:5s browser/

# Single test by name pattern (even faster)
cd robot_tests && pixi run robot -v HEADLESS:true -v TIMEOUT:5s --test "TC-BR-KC-002*" browser/
```

| Variable | Diagnosis | Normal CI |
|----------|-----------|-----------|
| `TIMEOUT` | `5s` | `15s` (default in robot file) |
| `HEADLESS` | `true` | `true` |

Do **not** edit the robot file to change the timeout — pass it via `-v`.

---

## Step 2 — Parse the failure output

After the run, three files contain everything needed:

### output.xml — what failed and where

```bash
# Failing URL at the moment of failure
grep -o '.\{0,80\}Failed at URL.\{0,120\}' robot_tests/output.xml

# Expected selector that timed out
grep -o 'waiting for locator.*visible' robot_tests/output.xml | sort -u

# Full test status summary
grep 'status status=' robot_tests/output.xml | grep FAIL
```

### playwright-log.txt — page source at failure time

The log contains the full page HTML right after every screenshot. Extract it:

```bash
# All Keycloak element IDs and classes (kc-*)
grep -o 'kc-[a-zA-Z-]*' robot_tests/playwright-log.txt | sort -u

# All data-testid values present on the page
grep -o 'data-testid="[^"]*"' robot_tests/playwright-log.txt | sort -u

# Full page source blob (first 4000 chars)
grep -o '"msg":"<!DOCTYPE html>[^"]*"' robot_tests/playwright-log.txt | head -c 4000

# URL the browser was at when it failed
grep 'Failed at URL\|navigate\|goto' robot_tests/playwright-log.txt | grep localhost | tail -20
```

### browser/screenshot/ — visual snapshot at failure

```bash
ls -lt robot_tests/browser/screenshot/*.png | head -5
# Open the most recent: open robot_tests/browser/screenshot/<name>-failure.png
```

---

## Step 3 — Identify the failure pattern

### Pattern A: "Invalid parameter: redirect_uri" on Keycloak page

**Symptom:** Browser lands on Keycloak "We are sorry..." page with `redirect_uri` error instead of the login form.

**Cause:** Race condition — the app's `SettingsContext` fetches the Keycloak URL from the backend (`/api/settings/config`, ~250 ms). If the login button is clicked before settings load, `keycloakConfig.url` is still the default `http://localhost:8081` (main env Keycloak). The OAuth request goes to the wrong Keycloak, which rejects the redirect URI.

**Diagnosis:** Two Keycloak containers run simultaneously:
- `localhost:8081` — main dev environment (wrong for tests)
- `localhost:8181` — test environment (correct)

**Fix:** Add `Wait For Load State    networkidle` before clicking the login button. This waits until all in-flight network requests (including the settings API) settle.

```robot
Navigate To Login And Wait For Settings
    [Documentation]    Navigate to /login and wait for settings API before clicking.
    New Page    ${WEB_URL}/login
    Wait For Elements State    css=[data-testid="login-button-keycloak"]    visible    timeout=${TIMEOUT}
    Wait For Load State    networkidle    timeout=${TIMEOUT}
    Click    css=[data-testid="login-button-keycloak"]
```

Use this keyword instead of inline `New Page` + `Click` sequences.

---

### Pattern B: Wrong selector for Keycloak error message

**Symptom:** `waiting for locator('id=kc-error-message') to be visible` times out after submitting bad credentials.

**Cause:** Keycloak 26 (PatternFly v5) moved the error from `<div id="kc-error-message">` to `<span class="kc-feedback-text">`.

**Diagnosis:**
```bash
grep -o 'kc-[a-zA-Z-]*' robot_tests/playwright-log.txt | sort -u
# Look for: kc-feedback-text
```

**Fix:**
```robot
# WRONG (Keycloak ≤25)
Wait For Elements State    id=kc-error-message    visible    timeout=${TIMEOUT}

# CORRECT (Keycloak 26+)
Wait For Elements State    css=.kc-feedback-text    visible    timeout=${TIMEOUT}
```

---

### Pattern C: Post-login lands on unexpected page

**Symptom:** Login succeeds but `css=[data-testid="dashboard-page"]` or `css=[data-testid="cluster-page"]` not found.

**Cause:** The app redirects to `/cluster` (or wherever `from` points), not `/dashboard`.

**Fix:** Use `css=[data-testid="layout-container"]` — this element is always present in `Layout.tsx` when the user is authenticated, regardless of which sub-page loads.

```robot
# WRONG — page-specific
Wait For Elements State    css=[data-testid="dashboard-page"]    visible    timeout=${TIMEOUT}

# CORRECT — layout-level, always present when logged in
Wait For Elements State    css=[data-testid="layout-container"]    visible    timeout=${TIMEOUT}
```

---

### Pattern D: Session state leaking between tests

**Symptom:** Second test auto-logs in without showing the Keycloak login form (`id=username` never appears).

**Cause:** Shared browser context carries cookies/localStorage from the previous test.

**Fix:** Use `New Context` per test via a `[Setup]` keyword. Never reuse contexts between tests.

```robot
Fresh Browser Context
    [Documentation]    Open a clean isolated context — no shared cookies or storage.
    IF    $DEV_MODE
        Register Keyword To Run On Failure    Dump Page State    scope=Test
    END
    New Context    viewport={'width': 1280, 'height': 720}

# In each test:
[Setup]    Fresh Browser Context
[Teardown]    Test Teardown

Test Teardown
    Run Keyword If Test Failed    Dump Page State
    Close Context
```

---

### Pattern E: `id=username` not visible — already at error page

**Symptom:** Waiting for `id=username` times out. Page source shows an error page rather than the login form.

**Diagnosis:**
```bash
# Check what page the browser actually landed on
grep -o '"msg":"<!DOCTYPE html>.*<title>[^<]*' robot_tests/playwright-log.txt | head -c 500

# Common causes:
# - "We are sorry" → redirect_uri problem (Pattern A)
# - "Session expired" → Keycloak auth session timed out
# - Connection refused → wrong Keycloak port
```

---

## Step 4 — Fix and verify

Edit the robot file with the fix identified above, then re-run with the same short timeout:

```bash
cd robot_tests && pixi run robot -v HEADLESS:true -v TIMEOUT:5s browser/
```

Expected output when all pass:
```
TC-BR-KC-001: Login via Keycloak OAuth Flow                | PASS |
TC-BR-KC-002: Invalid Credentials Show Keycloak Error      | PASS |
TC-BR-KC-003: Logout Clears Session                        | PASS |
3 tests, 3 passed, 0 failed
```

---

## DEV_MODE — live DOM inspection on failure

When the cause is not clear from logs alone, run with `DEV_MODE=true` to keep the browser open on failure (10-minute pause, press Ctrl-C to abort early):

```bash
cd robot_tests && pixi run robot -v DEV_MODE:true -v TIMEOUT:5s browser/
# Or use the pixi alias:
cd robot_tests && pixi run test-robot-browser-dev
```

The browser window stays open. Open DevTools to inspect the live DOM, check the network tab for failed requests, and read the console for JS errors.

---

## Environment quick reference

| Service | Test env URL | Main env URL |
|---------|-------------|-------------|
| Keycloak | `http://localhost:8181` | `http://localhost:8081` ← wrong in tests |
| Backend | `http://localhost:8200` | varies |
| Frontend | `http://localhost:3001` | varies |

If tests reach `localhost:8081` instead of `localhost:8181` it is Pattern A (settings race condition).

---

## Key files

| File | Purpose |
|------|---------|
| `robot_tests/browser/keycloak_oauth.robot` | Browser test suite |
| `robot_tests/resources/setup/suite_setup.robot` | Suite setup / teardown |
| `robot_tests/resources/setup/test_env.py` | Env vars (URLs, credentials) |
| `robot_tests/output.xml` | Last run results |
| `robot_tests/playwright-log.txt` | Raw Playwright log with page source |
| `robot_tests/browser/screenshot/` | Failure screenshots |
