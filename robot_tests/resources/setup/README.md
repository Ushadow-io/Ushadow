# Test Suite Setup Resources

Generic, reusable setup and teardown keywords for Robot Framework test suites.

## Quick Start

**IMPORTANT**: Always use Suite Setup/Teardown and Test Setup/Teardown in the `*** Settings ***` header, NOT in individual test cases.

```robot
*** Settings ***
Resource         ../resources/setup/suite_setup.robot

Suite Setup      Standard Suite Setup
Suite Teardown   Standard Suite Teardown
Test Setup       Start Tailscale Container

*** Test Cases ***
My Test
    # Setup already done - just write your test logic
    REST.GET    /api/tailscale/container/status
    Integer    response status    200
```

## Standard Suite Setup/Teardown

Creates an authenticated API session **once per suite** that all tests can reuse.

### What Suite Setup Provides

- Authenticated RequestsLibrary session stored in `${SESSION}` variable
- Session is created ONCE at suite start
- All tests in the suite share this session
- **DO NOT call `Get Admin API Session` in individual tests** - the session already exists!

### Basic Usage with RequestsLibrary

```robot
*** Settings ***
Resource         ../resources/setup/suite_setup.robot

Suite Setup      Standard Suite Setup
Suite Teardown   Standard Suite Teardown

*** Test Cases ***
Test Health Endpoint
    # ${SESSION} already exists from Suite Setup
    ${response}=    GET On Session    ${SESSION}    /api/health
    Should Be Equal As Numbers    ${response.status_code}    200

Test Container Status
    # Reuse the same ${SESSION} - no need to create new session
    ${response}=    GET On Session    ${SESSION}    /api/tailscale/container/status
    Should Be Equal As Numbers    ${response.status_code}    200
```

## Test Setup/Teardown (Per-Test)

Use `Test Setup` and `Test Teardown` in the `*** Settings ***` header to run keywords before/after EVERY test.

### Why Use Test Setup?

- Fresh JWT authentication tokens for each test (prevents expiration issues)
- Guaranteed clean state before each test
- Automatic container startup for Tailscale tests
- Test isolation without manual setup code

### Declaring Test Setup/Teardown

**CORRECT** - In Settings header:
```robot
*** Settings ***
Suite Setup      Standard Suite Setup
Suite Teardown   Standard Suite Teardown
Test Setup       Start Tailscale Container          # Runs before EVERY test
Test Teardown    My Custom Cleanup                  # Runs after EVERY test

*** Test Cases ***
My Test
    # Test Setup already ran - container is running, token is fresh
    REST.GET    /api/tailscale/container/status
```

**INCORRECT** - Don't use `[Setup]` in individual tests (unless you need test-specific setup):
```robot
*** Test Cases ***
My Test
    [Setup]    Start Tailscale Container    # DON'T DO THIS - use Settings header instead
    REST.GET    /api/tailscale/container/status
```

### Per-Test Setup/Teardown

Only use `[Setup]` and `[Teardown]` in individual tests when that specific test needs different setup:

```robot
*** Settings ***
Test Setup    Start Tailscale Container    # Default for all tests

*** Test Cases ***
Most Tests Use Default Setup
    REST.GET    /api/tailscale/container/status
    Integer    response status    200

Test That Needs Special Setup
    [Setup]    Logout Tailscale Container For Auth Testing    # Override default
    [Teardown]    Reauth Tailscale Container After Auth Testing

    # This test needs unauthenticated state
    REST.GET    /api/tailscale/auth-url
    Integer    response status    200
```

## Start Tailscale Container (Recommended for Tailscale Tests)

For tests using RESTinstance library, use `Start Tailscale Container` which provides:
- Fresh JWT authentication token for each test
- Ensures Tailscale container is running
- Automatic container startup if needed

### Usage with REST Library

```robot
*** Settings ***
Library          REST    localhost:8080    ssl_verify=false
Resource         ../resources/setup/suite_setup.robot

Suite Setup      Standard Suite Setup
Suite Teardown   Standard Suite Teardown
Test Setup       Start Tailscale Container    # Fresh token + running container per test

*** Test Cases ***
Container Status Test
    # Fresh token already configured by Test Setup
    # Container guaranteed to be running
    REST.GET    /api/tailscale/container/status
    Integer    response status    200
    Boolean    response body running
    Boolean    response body authenticated
```

## Verifying API Response Structure

### Using RESTinstance for Schema Validation

RESTinstance provides declarative keywords for validating JSON responses:

```robot
*** Test Cases ***
Validate Response Schema
    REST.GET    /api/tailscale/container/status

    # Validate status code
    Integer    response status    200

    # Validate response body fields exist and have correct types
    Boolean    response body exists            # Field is a boolean
    Boolean    response body running
    Boolean    response body authenticated
    String     response body hostname           # Field is a string
    String     response body ip_address

    # Validate nested objects
    REST.GET    /api/tailscale/settings
    Object     response body magic_dns          # Field is an object
    Boolean    response body magic_dns enabled
    String     response body magic_dns suffix

Validate Array Responses
    REST.GET    /api/services

    Integer    response status    200
    Array      response body                    # Response is an array
    Integer    response body 0 id               # First element has 'id' field (integer)
    String     response body 0 name             # First element has 'name' field (string)
```

### Common Validation Keywords

| Keyword | Purpose | Example |
|---------|---------|---------|
| `Integer response status 200` | Validate HTTP status | Status must be 200 |
| `Boolean response body running` | Validate boolean field | `running` field is boolean |
| `String response body hostname` | Validate string field | `hostname` field is string |
| `Object response body config` | Validate object field | `config` field is object |
| `Array response body items` | Validate array field | `items` field is array |
| `Null response body error` | Validate null field | `error` field is null |
| `Integer response body count 5` | Validate integer value | `count` equals 5 |

### Accessing Response Data

```robot
*** Test Cases ***
Extract and Use Response Data
    REST.GET    /api/tailscale/container/status

    # Extract response body as dictionary
    ${status}=    Output    response body

    # Use extracted data
    ${running}=    Set Variable    ${status}[running]
    Log    Container running: ${running}

    # Make decisions based on response
    IF    ${running}
        Log    Container is running
    ELSE
        Log    Container is stopped
    END
```

## Available Setup Keywords

### Suite-Level (Run Once Per Suite)

- **Standard Suite Setup**: Creates authenticated RequestsLibrary session (${SESSION}) - runs ONCE at suite start
- **Standard Suite Teardown**: Cleans up all HTTP sessions - runs ONCE at suite end

### Test-Level (Run Before/After Every Test)

- **Setup REST Authentication**: Configures REST library with fresh JWT token
- **Ensure Tailscale Container Running**: Starts Tailscale container if not running
- **Start Tailscale Container**: Combines REST auth + container startup (recommended)

## RequestsLibrary vs RESTinstance

### When to Use RequestsLibrary

- Need to inspect full response object (`${response.status_code}`, `${response.json()}`)
- Complex request manipulation
- Legacy tests already using RequestsLibrary

```robot
*** Test Cases ***
Using RequestsLibrary
    ${response}=    GET On Session    ${SESSION}    /api/health
    Should Be Equal As Numbers    ${response.status_code}    200
    ${data}=    Set Variable    ${response.json()}
    Log    Response: ${data}
```

### When to Use RESTinstance (RECOMMENDED)

- Schema validation (verify field types and structure)
- Declarative assertions (more readable)
- JSON response testing
- Modern API testing patterns

```robot
*** Test Cases ***
Using RESTinstance (Recommended)
    REST.GET    /api/health
    Integer    response status    200
    String     response body status
    Boolean    response body healthy
```

## Best Practices

### 1. Use Setup/Teardown in Settings Header

**DO THIS**:
```robot
*** Settings ***
Suite Setup      Standard Suite Setup
Suite Teardown   Standard Suite Teardown
Test Setup       Start Tailscale Container
```

**NOT THIS**:
```robot
*** Test Cases ***
My Test
    [Setup]    Standard Suite Setup    # Wrong! Suite Setup should be in Settings
    [Teardown]    Standard Suite Teardown
```

### 2. Don't Create Duplicate Sessions

**DO THIS**:
```robot
*** Settings ***
Suite Setup    Standard Suite Setup    # Session created once

*** Test Cases ***
Test One
    # ${SESSION} already exists - just use it
    ${response}=    GET On Session    ${SESSION}    /api/health

Test Two
    # Reuse same ${SESSION} - no need to create new one
    ${response}=    GET On Session    ${SESSION}    /api/status
```

**NOT THIS**:
```robot
*** Test Cases ***
Test One
    ${session}=    Get Admin API Session    # DON'T - session already exists!
    ${response}=    GET On Session    ${session}    /api/health
```

### 3. Use Fresh Tokens for Test Isolation

Use `Test Setup    Start Tailscale Container` to get fresh JWT tokens before each test:

```robot
*** Settings ***
Test Setup    Start Tailscale Container    # Fresh token per test

*** Test Cases ***
Test One
    # Fresh token configured automatically
    REST.GET    /api/tailscale/container/status

Test Two
    # Different fresh token (prevents expiration issues)
    REST.GET    /api/tailscale/settings
```

### 4. Use RESTinstance for Schema Validation

**DO THIS** (declarative, readable):
```robot
*** Test Cases ***
Validate Container Status
    REST.GET    /api/tailscale/container/status
    Integer    response status    200
    Boolean    response body running
    String     response body hostname
```

**NOT THIS** (verbose, manual checks):
```robot
*** Test Cases ***
Validate Container Status
    ${response}=    GET On Session    ${SESSION}    /api/tailscale/container/status
    Should Be Equal As Numbers    ${response.status_code}    200
    ${data}=    Set Variable    ${response.json()}
    Should Be True    isinstance($data['running'], bool)
    Should Be True    isinstance($data['hostname'], str)
```

### 5. Environment-Agnostic Tests

Use `Get Env Value` for dynamic configuration:

```robot
*** Keywords ***
Get Container Name
    ${env_name}=    Get Env Value    ENV_NAME    green
    ${container}=    Set Variable    ushadow-${env_name}-tailscale
    RETURN    ${container}
```

This makes tests portable across environments (green, red, blue, etc.).

## Benefits

- **Fresh tokens per test**: Eliminates token expiration issues
- **Guaranteed container state**: Tests never fail due to stopped container
- **DRY principle**: No repeated setup code in every test
- **Consistency**: All tests use the same authentication pattern
- **Maintainability**: Changes to auth flow only need updating in one place
- **Test isolation**: Each test gets clean authentication state
- **Schema validation**: RESTinstance catches API contract violations automatically
- **Environment portability**: Tests work across multiple worktree environments
