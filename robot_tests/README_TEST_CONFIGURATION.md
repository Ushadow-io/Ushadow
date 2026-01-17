# Robot Framework Test Configuration Guide

## How Test Configuration Works

All Robot Framework tests use a **centralized configuration pattern** that reads from your `.env` file. This ensures tests work across different environments without hardcoded values.

## Configuration Library: EnvConfig.py

Located at: `robot_tests/resources/EnvConfig.py`

This library reads your `.env` file and provides these keywords:

| Keyword | Returns | Example |
|---------|---------|---------|
| `Get Api Url` | Full API URL | `http://localhost:8080` |
| `Get Backend Port` | Backend port | `8080` |
| `Get Env Value` | Any env var | `Get Env Value    TAILSCALE_AUTH_KEY` |

## Required Environment Variables

Add these to your `.env` file:

```bash
# Core Configuration
BACKEND_PORT=8080                    # Your backend API port
COMPOSE_PROJECT_NAME=ushadow-green   # Environment name (green, puce, red, etc.)

# Tailscale (for cert provisioning tests)
TAILSCALE_AUTH_KEY=tskey-auth-xxxxx  # Required for automated Tailscale tests
TAILSCALE_API_KEY=tskey-api-xxxxx    # Optional: for admin cleanup
TAILSCALE_TAILNET=your-tailnet.com   # Optional: for admin cleanup

# Authentication (for protected endpoints)
ADMIN_PASSWORD=your-admin-password   # Admin user password
```

## Test Patterns

### Pattern 1: Public Endpoints (No Auth)

Example: Health check, status endpoints

```robot
*** Settings ***
Library          ../resources/EnvConfig.py

Suite Setup      Setup Tests

*** Keywords ***
Setup Tests
    ${api_url}=    Get Api Url
    Create Session    my_session    ${api_url}    verify=True
```

### Pattern 2: Protected Endpoints (With Auth)

Example: User management, service configuration

```robot
*** Settings ***
Library          ../resources/EnvConfig.py
Resource         ../resources/auth_keywords.robot

Suite Setup      Setup Authenticated Tests

*** Keywords ***
Setup Authenticated Tests
    ${session}=    Get Admin API Session
    Set Suite Variable    ${SESSION}    ${session}
```

The `Get Admin API Session` keyword:
- Automatically reads `BACKEND_PORT` from `.env`
- Logs in with admin credentials
- Returns an authenticated session you can reuse

### Pattern 3: Dynamic Environment Values

Example: Tailscale tests, service-specific config

```robot
*** Test Cases ***
My Test
    # Get any value from .env
    ${auth_key}=    Get Env Value    TAILSCALE_AUTH_KEY    ${EMPTY}

    # Skip test if not configured
    Skip If    '${auth_key}' == '${EMPTY}'    TAILSCALE_AUTH_KEY not configured

    # Use the value
    Run Process    docker    run    -e    TS_AUTHKEY=${auth_key}    ...
```

## Test Organization

```
robot_tests/
├── resources/
│   ├── EnvConfig.py           # Reads .env file
│   ├── auth_keywords.robot    # Authentication helpers
│   └── TailscaleAdmin.py      # Tailscale API helpers
└── tests/
    ├── api_health_check.robot      # Public endpoint tests
    ├── api_tailscale_core.robot    # Protected endpoint tests with auth
    └── service_*.robot             # Service-specific tests
```

## Running Tests

### Run All Tests
```bash
robot robot_tests/tests/
```

### Run Specific Test Suite
```bash
robot robot_tests/tests/api_health_check.robot
```

### Run Tests by Tag
```bash
# Run only smoke tests
robot --include smoke robot_tests/tests/

# Run integration tests (requires services running)
robot --include integration robot_tests/tests/

# Skip destructive tests
robot --exclude destructive robot_tests/tests/
```

### Run Tests in Specific Environment

Switch to different worktree, tests automatically pick up that environment's `.env`:

```bash
cd /path/to/puce-environment
robot robot_tests/tests/  # Uses puce's BACKEND_PORT, etc.
```

## Common Test Tags

| Tag | Meaning | Requires |
|-----|---------|----------|
| `smoke` | Quick validation tests | Running backend |
| `integration` | Full integration tests | All services running |
| `destructive` | Modifies/deletes data | Test environment only |
| `skip` | Disabled (WIP or broken) | Nothing (skipped) |
| `auth` | Tests authentication | Valid credentials |
| `critical` | Critical service tests | Service must be healthy |

## Troubleshooting

### "Connection refused" errors
- Check `BACKEND_PORT` in `.env` matches your running backend
- Verify backend is running: `docker ps | grep backend`
- Check backend logs: `docker logs ushadow-green-backend`

### "Unauthorized" or "403" errors
- Check `ADMIN_PASSWORD` is set in `.env`
- Verify credentials match backend configuration
- Check if endpoint requires authentication

### "Service not found" errors
- Verify required services are running (MongoDB, Redis, etc.)
- Check `docker ps` for service status
- Review service health: `curl http://localhost:${BACKEND_PORT}/health`

### Tests skip unexpectedly
- Check for missing environment variables
- Review test documentation for requirements
- Use `-L DEBUG` for detailed logging: `robot -L DEBUG robot_tests/tests/`

## Best Practices

1. **Never hardcode URLs or ports** - Always use `Get Api Url`
2. **Always read from .env** - Use `Get Env Value` for configuration
3. **Document requirements** - Add `[Documentation]` explaining what's needed
4. **Use Skip If** - Gracefully skip when dependencies missing
5. **Tag appropriately** - Use tags so tests can be filtered
6. **Clean up** - Use `[Teardown]` to clean up resources

## Example: Complete Test Suite

```robot
*** Settings ***
Documentation    Example test suite showing best practices
Library          ../resources/EnvConfig.py
Resource         ../resources/auth_keywords.robot

Suite Setup      Setup My Tests
Suite Teardown   Teardown My Tests

*** Variables ***
${SESSION}    my_session

*** Test Cases ***
Public Endpoint Test
    [Documentation]    Tests public endpoint (no auth needed)
    [Tags]    smoke    api

    ${response}=    GET On Session    ${SESSION}    /api/status
    Status Should Be    200    ${response}

Protected Endpoint Test
    [Documentation]    Tests protected endpoint (requires auth)
    [Tags]    integration    auth

    ${auth_session}=    Get Admin API Session
    ${response}=    GET On Session    ${auth_session}    /api/admin/users
    Status Should Be    200    ${response}

Service Specific Test
    [Documentation]    Tests service-specific feature
    [Tags]    integration    service

    ${service_key}=    Get Env Value    SERVICE_API_KEY    ${EMPTY}
    Skip If    '${service_key}' == '${EMPTY}'    SERVICE_API_KEY not configured

    # Use service_key...

*** Keywords ***
Setup My Tests
    ${api_url}=    Get Api Url
    Create Session    ${SESSION}    ${api_url}    verify=True

Teardown My Tests
    Delete All Sessions

Status Should Be
    [Arguments]    ${expected}    ${response}
    Should Be Equal As Integers    ${response.status_code}    ${expected}
```
