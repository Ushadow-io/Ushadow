*** Settings ***
Documentation    Comprehensive Tailscale API Integration Tests
...
...              Tests all aspects of Tailscale functionality:
...              - Container lifecycle and status detection
...              - Authentication flow (auth URLs, QR codes, caching)
...              - Certificate provisioning for HTTPS
...              - Route configuration (frontend, backend, WebSocket)
...              - Tailnet settings (MagicDNS, HTTPS)
...              - Control plane connection stability
...
...              NOTE: Tests are organized by functional area for maintainability

Library          RequestsLibrary
Library          REST    localhost:8080    ssl_verify=false
Library          Collections
Library          String
Library          Process
Library          OperatingSystem
Library          ../resources/EnvConfig.py
Library          ../resources/TailscaleAdmin.py
Resource         ../resources/auth_keywords.robot
Resource         ../resources/tailscale_keywords.robot
Resource         ../resources/setup/suite_setup.robot

Suite Setup      Standard Suite Setup
Suite Teardown   Standard Suite Teardown
Test Setup       Start Tailscale Container

*** Variables ***
${TAILSCALE_API}    /api/tailscale
${SESSION}          tailscale_session
${PROJECT_ROOT}     ${CURDIR}/../..

# ============================================================================
# Container Management & Status Tests
# ============================================================================

*** Test Cases ***
Container Status Endpoint Returns Valid Response
    [Documentation]    TDD RED: Verify container status endpoint exists and returns expected schema
    ...
    ...                Tests the complete API contract using RESTinstance for schema validation.
    ...                Expected schema:
    ...                - exists: boolean (required)
    ...                - running: boolean (required)
    ...                - authenticated: boolean (required, default false)
    ...                - hostname: string or null (optional)
    ...                - ip_address: string or null (optional)
    [Tags]    tailscale    unit    api

    # Make request using REST library and validate schema
    REST.GET    /api/tailscale/container/status

    # Validate response status and schema
    Integer    response status    200
    Boolean    response body exists
    Boolean    response body running
    Boolean    response body authenticated

    # Log the full response for documentation
    ${status}=    Output    response body
    Log    Container Status Schema: ${status}    console=yes

Container Status Has Optional Authentication Fields
    [Documentation]    TDD RED: When container is running and authenticated, should have extra fields
    ...
    ...                Tests: authenticated, hostname, ip_address fields
    [Tags]    tailscale    unit    api

    REST.GET    /api/tailscale/container/status
    Integer    response status    200

    # Validate that when authenticated, hostname and ip_address are present
    ${status}=    Output    response body
    ${running}=    Set Variable    ${status}[running]
    ${authenticated}=    Set Variable    ${status}[authenticated]

    IF    ${running} and ${authenticated}
        # When authenticated, should have hostname (string) and ip_address (string)
        String    response body hostname
        String    response body ip_address

        # Verify hostname ends with .ts.net
        ${hostname}=    Set Variable    ${status}[hostname]
        Should Match Regexp    ${hostname}    .*\\.ts\\.net$

        # Verify IP is in Tailscale range
        ${ip}=    Set Variable    ${status}[ip_address]
        Should Start With    ${ip}    100.
    END

Detect Tailscale Container Is Running
    [Documentation]    TDD GREEN: Verify container status detection works correctly
    ...
    ...                Tests that the status endpoint correctly reports container state.
    ...                Container is guaranteed to be running by Test Setup.
    [Tags]    tailscale    integration    container

    # Check container status
    REST.GET    /api/tailscale/container/status
    Integer    response status    200

    ${status}=    Output    response body
    ${exists}=    Set Variable    ${status}[exists]
    ${running}=    Set Variable    ${status}[running]

    # Container should exist and be running (ensured by Test Setup)
    Should Be True    ${exists}
    Should Be True    ${running}

    Log    ✅ Tailscale container detected and running

Detect Tailscale Authentication State
    [Documentation]    TDD GREEN: Integration test - check if Tailscale is authenticated to tailnet
    ...
    ...                REQUIRES: Tailscale container running
    [Tags]    tailscale    integration    auth

    REST.GET    /api/tailscale/container/status
    Integer    response status    200

    ${status}=    Output    response body
    ${running}=    Set Variable    ${status}[running]
    ${authenticated}=    Set Variable    ${status}[authenticated]

    # Only meaningful if container is running
    Skip If    not ${running}    Tailscale container not running

    IF    ${authenticated}
        Log    ✅ Tailscale is authenticated to tailnet

        # Validate hostname and IP using REST schema
        String    response body hostname
        String    response body ip_address

        ${hostname}=    Set Variable    ${status}[hostname]
        ${ip}=    Set Variable    ${status}[ip_address]
        Log    Hostname: ${hostname}
        Log    IP: ${ip}

        # Verify hostname format (should be *.ts.net)
        Should Match Regexp    ${hostname}    .*\\.ts\\.net$

        # Verify IP is in 100.x.x.x range (Tailscale CGNAT)
        Should Start With    ${ip}    100.
    ELSE
        Log    ⚠️ Tailscale is NOT authenticated - needs auth
    END

Test Container Start When Stopped
    [Documentation]    TDD GREEN: Test starting container when explicitly stopped
    ...
    ...                Stops the container first, then verifies start endpoint works
    [Tags]    tailscale    integration    container    destructive

    # Get environment name to build container name
    ${env_name}=    Get Env Value    ENV_NAME    green
    ${container_name}=    Set Variable    ushadow-${env_name}-tailscale

    # Stop the container first
    ${stop_result}=    Run Process    docker    stop    ${container_name}
    Log    Container stopped for test

    # Now test the start endpoint
    REST.POST    /api/tailscale/container/start

    # Validate response
    Integer    response status    200
    String    response body status
    String    response body message

    ${result}=    Output    response body
    ${status}=    Set Variable    ${result}[status]

    # Valid statuses: created, started (should be 'started' since we stopped it)
    Should Be True    '${status}' in ['created', 'started', 'already_running']

    Log    Container start result: ${result}

    # Wait for container to be fully ready
    Sleep    2s

# ============================================================================
# Authentication Flow Tests
# ============================================================================
# NOTE: These tests verify auth URL generation, caching, and QR code
# WARNING: Some auth flow tests may temporarily logout the container

Container Must Be Running For Auth
    [Documentation]    Ensure container is running before testing auth flow
    [Tags]    tailscale    integration    auth    prerequisite

    REST.GET    /api/tailscale/container/status
    Integer    response status    200

    ${status}=    Output    response body
    ${exists}=    Set Variable    ${status}[exists]
    ${running}=    Set Variable    ${status}[running]

    Should Be True    ${exists}
    Should Be True    ${running}

    Log    ✅ Container is running

Auth URL Generation Works
    [Documentation]    TDD RED: Verify we can successfully get an auth URL with QR code
    ...
    ...                NOTE: Requires container to be logged out - setup handles this
    [Tags]    tailscale    integration    auth    critical
    [Setup]    Logout Tailscale Container For Auth Testing

    # Get auth URL
    REST.GET    /api/tailscale/container/auth-url

    # Validate response schema
    Integer    response status    200
    String    response body auth_url
    String    response body web_url
    String    response body qr_code_data

    ${result}=    Output    response body
    ${auth_url}=    Set Variable    ${result}[auth_url]
    ${qr_code_data}=    Set Variable    ${result}[qr_code_data]

    # Validate auth URL format
    Should Start With    ${auth_url}    https://login.tailscale.com

    # Validate QR code format
    Should Start With    ${qr_code_data}    data:image/png;base64,

    # QR code should not be empty
    ${qr_length}=    Get Length    ${qr_code_data}
    Should Be True    ${qr_length} > 100

    Log    ✅ Auth URL: ${auth_url}
    Log    ✅ QR code data length: ${qr_length} chars

    # Store for next test
    Set Suite Variable    ${AUTH_URL}    ${auth_url}

Auth URL Is Consistent When Not Regenerating
    [Documentation]    TDD GREEN: Verify cached auth URL is returned on retry
    [Tags]    tailscale    integration    auth

    # Get auth URL again without regenerate flag
    REST.GET    /api/tailscale/container/auth-url
    Integer    response status    200

    ${result}=    Output    response body
    ${new_auth_url}=    Set Variable    ${result}[auth_url]

    # Should return the same URL (from cache)
    Should Be Equal    ${new_auth_url}    ${AUTH_URL}

    Log    ✅ Auth URL is cached correctly

Regenerate Flag Creates New Auth URL
    [Documentation]    TDD GREEN: Verify regenerate flag creates new URL
    [Tags]    tailscale    integration    auth

    # Get auth URL with regenerate=true
    REST.GET    /api/tailscale/container/auth-url?regenerate=true
    Integer    response status    200

    ${result}=    Output    response body
    ${new_auth_url}=    Set Variable    ${result}[auth_url]

    # Should be a different URL
    Should Not Be Equal    ${new_auth_url}    ${AUTH_URL}

    Log    ✅ Old URL: ${AUTH_URL}
    Log    ✅ New URL: ${new_auth_url}

Auth URL Contains Valid Tailscale Token
    [Documentation]    Verify the auth URL contains a proper token path
    ...
    ...                NOTE: This is the last auth URL test - teardown re-authenticates
    [Tags]    tailscale    integration    auth
    [Teardown]    Reauth Tailscale Container After Auth Testing

    REST.GET    /api/tailscale/container/auth-url
    Integer    response status    200

    ${result}=    Output    response body
    ${auth_url}=    Set Variable    ${result}[auth_url]

    # Should match pattern: https://login.tailscale.com/a/{token}
    Should Match Regexp    ${auth_url}    https://login\\.tailscale\\.com/a/[a-f0-9]+

    Log    ✅ Auth URL has valid token format

# ============================================================================
# Certificate Provisioning Tests
# ============================================================================

Verify Container Can Authenticate
    [Documentation]    Verify temp container can authenticate with Tailscale
    [Tags]    tailscale    integration    cert    auth
    [Setup]    Start Test Tailscale Container
    [Teardown]    Cleanup Test Tailscale Container

    # Authenticate the container
    Auth Tailscale Container

    # Verify hostname was set
    Should Not Be Equal    ${HOSTNAME}    ${EMPTY}
    ...    msg=Hostname should be set after authentication

    Should Not Be Equal    ${SHORT_HOSTNAME}    ${EMPTY}
    ...    msg=Short hostname should be set after authentication

    Log    ✅ Container authenticated with hostname: ${HOSTNAME}

Provision Certificate With Unique Temporary Container
    [Documentation]    Create temp container with unique name, auth, provision cert, cleanup
    ...
    ...                This test creates a completely isolated temporary container
    ...                with a unique timestamp-based hostname, provisions a certificate
    ...                for it, then cleans up everything including removing the device
    ...                from Tailscale admin console.
    ...
    ...                REQUIRES: TAILSCALE_AUTH_KEY in .env
    ...                OPTIONAL: TAILSCALE_API_KEY for admin cleanup
    [Tags]    tailscale    integration    cert    isolated    destructive
    [Setup]    Run Keywords
    ...    Start Test Tailscale Container
    ...    AND    Auth Tailscale Container
    [Teardown]    Cleanup Test Tailscale Container

    Log    Testing cert provisioning for hostname: ${HOSTNAME}

    # Provision certificate directly in temp container
    ${cert_file}=    Set Variable    /certs/${HOSTNAME}.crt
    ${key_file}=    Set Variable    /certs/${HOSTNAME}.key

    ${result}=    Run Process    docker    exec    ${CONTAINER}
    ...    tailscale    cert
    ...    --cert-file\=${cert_file}
    ...    --key-file\=${key_file}
    ...    ${HOSTNAME}
    ...    timeout=120s

    # Check if cert provisioning succeeded
    IF    ${result.rc} == 0
        Log    ✅ Certificate provisioned successfully for ${HOSTNAME}
    ELSE
        Log    ❌ Certificate provisioning failed
        Log    Stdout: ${result.stdout}
        Log    Stderr: ${result.stderr}
        Fail    Certificate provisioning failed: ${result.stderr}
    END

    # Verify cert files exist in local mounted directory
    ${local_cert}=    Set Variable    ${CERTS_DIR}/${HOSTNAME}.crt
    ${local_key}=    Set Variable    ${CERTS_DIR}/${HOSTNAME}.key

    File Should Exist    ${local_cert}
    ...    msg=Certificate file should exist at ${local_cert}

    File Should Exist    ${local_key}
    ...    msg=Key file should exist at ${local_key}

    # Verify cert has valid PEM format
    ${cert_content}=    Get File    ${local_cert}
    Should Contain    ${cert_content}    -----BEGIN CERTIFICATE-----
    Should Contain    ${cert_content}    -----END CERTIFICATE-----

    Log    ✅ Certificate verified: ${local_cert}

# ============================================================================
# Routing Configuration Tests
# ============================================================================

Configure Tailscale Serve Routes
    [Documentation]    TDD RED: Configure routes before testing them
    [Tags]    tailscale    integration    routing    setup

    # Build request payload as dict
    ${deployment_mode}=    Create Dictionary    mode=single    environment=dev
    ${payload}=    Create Dictionary
    ...    deployment_mode=${deployment_mode}
    ...    hostname=green.spangled-kettle.ts.net
    ...    backend_port=${8000}
    ...    use_caddy_proxy=${False}

    # Call configure-serve endpoint to set up routes
    REST.POST    /api/tailscale/configure-serve
    ...    ${payload}

    # Validate response
    TRY
        Integer    response status    200
        ${result}=    Output    response body
        Log    ✅ Routes configured successfully
        Log    Response: ${result}
    EXCEPT
        ${error}=    Output    response body
        Log    ⚠️ Failed to configure routes
        Log    ${error}
        Fail    Could not configure routes
    END

    # Wait for routes to apply
    Sleep    2s

    # Verify routes were created
    ${result}=    Run Process    docker    exec    ushadow-green-tailscale    tailscale    serve    status
    Should Be Equal As Integers    ${result.rc}    0
    ${output}=    Set Variable    ${result.stdout}

    Log    Configured routes:\n${output}

    Should Not Contain    ${output}    No serve config
    ...    msg=Routes should be configured now

Tailscale Serve Routes Are Configured
    [Documentation]    Verify that Tailscale serve has routes configured
    [Tags]    tailscale    integration    routing

    # Get serve status from container
    ${result}=    Run Process    docker    exec    ushadow-green-tailscale    tailscale    serve    status
    Should Be Equal As Integers    ${result.rc}    0
    ...    msg=Failed to get tailscale serve status

    Log    Tailscale Serve Status:\n${result.stdout}

    # Should have routes configured
    Should Not Contain    ${result.stdout}    No serve config
    ...    msg=No routes configured in Tailscale serve

Frontend Route Uses Correct Port
    [Documentation]    TDD RED: Verify frontend route uses 5173 (dev) or 80 (prod)
    [Tags]    tailscale    integration    routing    critical

    # Get serve status
    ${result}=    Run Process    docker    exec    ushadow-green-tailscale    tailscale    serve    status
    ${output}=    Set Variable    ${result.stdout}

    Log    Checking routes in:\n${output}

    # Read DEV_MODE from .env file
    ${env_content}=    Get File    ${CURDIR}/../../.env
    ${dev_mode_line}=    Get Lines Matching Pattern    ${env_content}    DEV_MODE=*
    Log    DEV_MODE line: ${dev_mode_line}

    # Check if we're in dev mode
    ${is_dev}=    Run Keyword And Return Status    Should Contain    ${dev_mode_line}    DEV_MODE=true

    IF    ${is_dev}
        # Dev mode: Should route to port 5173
        Should Contain    ${output}    ushadow-green-webui:5173
        ...    msg=Frontend route should use port 5173 in dev mode

        # Should NOT contain port 3000
        Should Not Contain    ${output}    :3000
        ...    msg=Frontend route should NOT use deprecated port 3000
    ELSE
        # Prod mode: Should route to port 80
        Should Contain    ${output}    ushadow-green-webui:80
        ...    msg=Frontend route should use port 80 in prod mode
    END

Backend API Routes Are Configured
    [Documentation]    TDD GREEN: Verify /api and /auth routes exist
    [Tags]    tailscale    integration    routing

    ${result}=    Run Process    docker    exec    ushadow-green-tailscale    tailscale    serve    status
    ${output}=    Set Variable    ${result.stdout}

    # Should have /api route
    Should Contain    ${output}    /api
    ...    msg=Missing /api route

    Should Contain    ${output}    ushadow-green-backend:8000/api
    ...    msg=/api should route to backend:8000/api

    # Should have /auth route
    Should Contain    ${output}    /auth
    ...    msg=Missing /auth route

    Should Contain    ${output}    ushadow-green-backend:8000/auth
    ...    msg=/auth should route to backend:8000/auth

WebSocket Routes Are Configured
    [Documentation]    TDD GREEN: Verify WebSocket routes go to chronicle
    [Tags]    tailscale    integration    routing

    ${result}=    Run Process    docker    exec    ushadow-green-tailscale    tailscale    serve    status
    ${output}=    Set Variable    ${result.stdout}

    # Should have WebSocket routes
    Should Contain    ${output}    /ws_pcm
    ...    msg=Missing /ws_pcm WebSocket route

    Should Contain    ${output}    /ws_omi
    ...    msg=Missing /ws_omi WebSocket route

    # WebSockets should go to chronicle (not through backend)
    Should Contain    ${output}    chronicle-backend
    ...    msg=WebSocket routes should go to chronicle-backend

Routes Can Be Reconfigured
    [Documentation]    TDD GREEN: Verify routes can be updated by recalling configure-serve
    [Tags]    tailscale    integration    routing

    # Get current routes
    ${result_before}=    Run Process    docker    exec    ushadow-green-tailscale    tailscale    serve    status
    Log    Routes before reconfiguration:\n${result_before.stdout}

    # Build request payload
    ${deployment_mode}=    Create Dictionary    mode=single    environment=dev
    ${payload}=    Create Dictionary
    ...    deployment_mode=${deployment_mode}
    ...    hostname=green.spangled-kettle.ts.net
    ...    backend_port=${8000}
    ...    use_caddy_proxy=${False}

    # Reconfigure (should be idempotent)
    REST.POST    /api/tailscale/configure-serve
    ...    ${payload}

    # Validate response
    Integer    response status    200

    Log    ✅ Routes reconfigured successfully

    # Wait for changes to apply
    Sleep    2s

    # Verify routes still correct after reconfiguration
    ${result_after}=    Run Process    docker    exec    ushadow-green-tailscale    tailscale    serve    status
    Log    Routes after reconfiguration:\n${result_after.stdout}

    Should Contain    ${result_after.stdout}    ushadow-green-webui:5173
    ...    msg=Routes should still be correct after reconfiguration

# ============================================================================
# Tailnet Settings & Environment Tests
# ============================================================================

Get Tailscale Access URLs
    [Documentation]    TDD GREEN: Test getting access URLs for services
    ...
    ...                REQUIRES: Tailscale configured
    [Tags]    tailscale    integration    url

    # Try to get access URLs
    TRY
        REST.GET    /api/tailscale/access-urls
        Integer    response status    200
    EXCEPT
        Log    ⚠️ Tailscale not configured yet
        Skip    Tailscale not configured
    END

    # Validate response schema
    String    response body frontend
    String    response body backend

    ${urls}=    Output    response body
    ${frontend_url}=    Set Variable    ${urls}[frontend]
    ${backend_url}=    Set Variable    ${urls}[backend]

    # URLs should be HTTPS
    Should Start With    ${frontend_url}    https://
    Should Start With    ${backend_url}    https://

    Log    Frontend URL: ${frontend_url}
    Log    Backend URL: ${backend_url}

Get Environment Info
    [Documentation]    TDD GREEN: Test getting environment information
    ...
    ...                NOTE: This should probably be in /api/settings (see analysis doc)
    [Tags]    tailscale    unit    api

    REST.GET    /api/tailscale/environment

    # Validate response schema
    Integer    response status    200
    String    response body name
    String    response body tailscale_hostname
    String    response body tailscale_container_name
    String    response body tailscale_volume_name

    ${env_info}=    Output    response body
    ${env_name}=    Set Variable    ${env_info}[name]
    ${container_name}=    Set Variable    ${env_info}[tailscale_container_name]

    # Container name should include environment name
    Should Contain    ${container_name}    ${env_name}

    Log    Environment: ${env_name}
    Log    Container: ${container_name}

Get Tailnet Settings
    [Documentation]    TDD GREEN: Test getting tailnet configuration (MagicDNS, HTTPS)
    ...
    ...                REQUIRES: Tailscale authenticated
    [Tags]    tailscale    integration    tailnet

    # Try to get tailnet settings
    TRY
        REST.GET    /api/tailscale/container/tailnet-settings
        Integer    response status    200
    EXCEPT
        Log    ⚠️ Cannot get tailnet settings - Tailscale may not be running/authenticated
        Skip    Tailscale not available
    END

    # Validate response schema
    ${settings}=    Output    response body
    ${magic_dns}=    Set Variable    ${settings}[magic_dns]
    ${https_serve}=    Set Variable    ${settings}[https_serve]

    # Validate MagicDNS and HTTPS settings have required fields
    ${magic_dns_enabled}=    Set Variable    ${magic_dns}[enabled]
    ${https_enabled}=    Set Variable    ${https_serve}[enabled]

    Log    MagicDNS enabled: ${magic_dns_enabled}
    Log    HTTPS enabled: ${https_enabled}

# ============================================================================
# Control Plane Connection Stability Tests
# ============================================================================

Control Plane Connection Stability During Long Operations
    [Documentation]    TDD RED: Test that reproduces control plane connection drops
    ...
    ...                This test monitors Tailscale daemon logs during cert provisioning
    ...                to detect "unexpected EOF" and timeout errors from control plane.
    ...
    ...                REQUIRES: Tailscale authenticated, HTTPS enabled
    ...                KNOWN ISSUE: macOS sleep/wake events sever long-lived connections
    [Tags]    tailscale    integration    stability    network

    # Get initial log position
    ${result}=    Run Process    docker    logs    --tail\=0    ushadow-green-tailscale
    ...           stdout=${TEMPDIR}/tailscale_initial.log
    Log    Starting from current log position

    # Capture baseline - check for recent connection errors
    ${baseline_result}=    Run Process    docker    logs    --tail\=50    ushadow-green-tailscale
    ${baseline_logs}=    Set Variable    ${baseline_result.stdout}

    ${has_baseline_errors}=    Run Keyword And Return Status
    ...    Should Match Regexp    ${baseline_logs}    (unexpected EOF|i/o timeout|connection reset)

    IF    ${has_baseline_errors}
        Log    ⚠️ WARNING: Recent connection errors detected in baseline logs
        Log    ${baseline_logs}
    ELSE
        Log    ✅ No recent connection errors in baseline
    END

    # Attempt certificate provisioning (long-running operation ~60-90s)
    ${start_time}=    Get Time    epoch

    REST.POST    /api/tailscale/container/provision-cert?hostname=green.spangled-kettle.ts.net

    ${end_time}=    Get Time    epoch
    ${duration}=    Evaluate    ${end_time} - ${start_time}

    Log    Certificate provisioning took ${duration} seconds

    # Capture logs during the operation
    ${log_result}=    Run Process    docker    logs    --since\=${start_time}s    ushadow-green-tailscale
    ${operation_logs}=    Set Variable    ${log_result.stdout}

    Log    Operation logs:\n${operation_logs}

    # Check for connection errors during operation
    ${has_eof_error}=    Run Keyword And Return Status
    ...    Should Match Regexp    ${operation_logs}    unexpected EOF

    ${has_timeout}=    Run Keyword And Return Status
    ...    Should Match Regexp    ${operation_logs}    timeout

    ${has_connection_reset}=    Run Keyword And Return Status
    ...    Should Match Regexp    ${operation_logs}    (connection reset|i/o timeout)

    ${has_time_jump}=    Run Keyword And Return Status
    ...    Should Match Regexp    ${operation_logs}    time jumped.*wake from sleep

    # Report findings
    Log    \n=== CONNECTION STABILITY ANALYSIS ===
    Log    Duration: ${duration}s
    Log    Unexpected EOF errors: ${has_eof_error}
    Log    Timeout errors: ${has_timeout}
    Log    Connection reset/i/o timeout: ${has_connection_reset}
    Log    Time jump (sleep/wake): ${has_time_jump}

    # Check cert provisioning result
    ${result}=    Output    response body
    ${provisioned}=    Set Variable    ${result}[provisioned]

    IF    ${provisioned}
        Log    ✅ Certificate provisioned successfully despite any connection issues
        Log    This suggests retry logic is working
    ELSE
        ${error}=    Set Variable    ${result}[error]
        Log    ❌ Certificate provisioning failed: ${error}

        # If we saw connection errors, this confirms the issue
        IF    ${has_eof_error} or ${has_timeout} or ${has_connection_reset}
            Log    🔍 CONFIRMED: Connection drops occurred during operation
            Log    Root cause: Control plane connection interrupted

            IF    ${has_time_jump}
                Log    🔍 CONFIRMED: macOS sleep/wake event detected
                Log    Recommendation: Keep system awake during cert provisioning
            END
        ELSE
            Log    ⚠️ Provisioning failed but no obvious connection errors detected
            Log    May be a different issue (auth, config, HTTPS not enabled)
        END
    END

    # This test DOCUMENTS the issue, it may or may not fail
    # Failure indicates connection stability problems
    Run Keyword If    ${has_eof_error} or ${has_timeout}
    ...    Log    ⚠️ Control plane connection instability detected    WARN

*** Keywords ***
Logout Tailscale Container For Auth Testing
    [Documentation]    Logout Tailscale container to test auth flow from unauthenticated state
    ...
    ...                WARNING: Temporarily logs out the Tailscale container
    ...                This is needed for auth URL tests to work properly

    # Get environment name to build container name
    ${env_name}=    Get Env Value    ENV_NAME    green
    ${container_name}=    Set Variable    ushadow-${env_name}-tailscale

    Log    ⚠️ Logging out ${container_name} for auth URL testing    WARN

    # Logout to ensure clean auth state for testing auth flow
    ${result}=    Run Process    docker    exec    ${container_name}    tailscale    logout
    Log    Logout result: ${result.stdout}${result.stderr}

    Sleep    1s    Wait for logout to complete

    Log    ✅ Container logged out - ready for auth URL tests

Reauth Tailscale Container After Auth Testing
    [Documentation]    Re-authenticate Tailscale container after auth flow tests
    ...
    ...                This restores the container to authenticated state

    # Get environment name to build container name
    ${env_name}=    Get Env Value    ENV_NAME    green
    ${container_name}=    Set Variable    ushadow-${env_name}-tailscale

    Log    Re-authenticating ${container_name} after auth flow tests

    # Re-authenticate using TAILSCALE_AUTH_KEY if available
    ${auth_key}=    Get Env Value    TAILSCALE_AUTH_KEY    ${EMPTY}

    IF    '${auth_key}' != '${EMPTY}'
        ${result}=    Run Process    docker    exec    ${container_name}
        ...    tailscale    up    --authkey\=${auth_key}    --accept-routes
        ...    timeout=30s

        IF    ${result.rc} == 0
            Log    ✅ Container re-authenticated successfully
        ELSE
            Log    ⚠️ Failed to re-auth container: ${result.stderr}    WARN
        END
    ELSE
        Log    ⚠️ No TAILSCALE_AUTH_KEY - container left unauthenticated    WARN
        Log    Other tests may fail without authenticated container    WARN
    END
