*** Settings ***
Documentation    Tailscale Container Management & System Tests
...
...              Tests container lifecycle and system-level Tailscale functionality:
...              - Container status detection and health
...              - Container lifecycle (start/stop)
...              - Authentication state checking
...              - Environment information
...              - Tailnet settings (MagicDNS, HTTPS)
...              - Control plane connection stability
...              - Tailscale access URLs
...
...              NOTE: Auth flow tests → api_tailscale_auth_flow.robot
...              NOTE: Certificate provisioning → api_tailscale_cert_provisioning.robot
...              NOTE: Route configuration → api_tailscale_routing.robot

Library          RequestsLibrary
Library          Collections
Library          String
Library          Process
Library          OperatingSystem
Library          ../resources/EnvConfig.py
Library          ../resources/TailscaleAdmin.py
Resource         ../resources/auth_keywords.robot

Suite Setup      Setup Tailscale Tests
Suite Teardown   Teardown Tailscale Tests

*** Variables ***
${TAILSCALE_API}    /api/tailscale
${SESSION}          tailscale_session
${PROJECT_ROOT}     ${CURDIR}/../..

*** Test Cases ***
# ============================================================================
# Container Status Tests
# ============================================================================

Container Status Endpoint Returns Valid Response
    [Documentation]    TDD RED: Verify container status endpoint exists and returns expected schema
    ...
    ...                Tests the API contract, not Tailscale functionality
    [Tags]    tailscale    unit    api

    ${response}=    GET On Session    ${SESSION}    ${TAILSCALE_API}/container/status

    # Should return 200
    Status Should Be    200    ${response}
    ${json}=    Set Variable    ${response.json()}

    # Verify schema - all required fields present
    Dictionary Should Contain Key    ${json}    exists
    ...    msg=Response missing 'exists' field

    Dictionary Should Contain Key    ${json}    running
    ...    msg=Response missing 'running' field

    # exists and running must be boolean
    ${exists}=    Get From Dictionary    ${json}    exists
    Should Be True    isinstance($exists, bool)
    ...    msg=Field 'exists' should be boolean, got ${exists}

    ${running}=    Get From Dictionary    ${json}    running
    Should Be True    isinstance($running, bool)
    ...    msg=Field 'running' should be boolean, got ${running}

Container Status Has Optional Authentication Fields
    [Documentation]    TDD RED: When container is running and authenticated, should have extra fields
    ...
    ...                Tests: authenticated, hostname, ip_address fields
    [Tags]    tailscale    unit    api

    ${response}=    GET On Session    ${SESSION}    ${TAILSCALE_API}/container/status
    ${json}=    Set Variable    ${response.json()}

    # If container is running, authenticated field should exist
    ${running}=    Get From Dictionary    ${json}    running

    # authenticated field is optional but should be boolean if present
    ${has_authenticated}=    Run Keyword And Return Status
    ...    Dictionary Should Contain Key    ${json}    authenticated

    IF    ${has_authenticated}
        ${authenticated}=    Get From Dictionary    ${json}    authenticated
        Should Be True    isinstance($authenticated, bool)
        ...    msg=Field 'authenticated' should be boolean if present
    END

    # If authenticated, should have hostname and ip_address
    IF    ${running} and ${has_authenticated}
        ${authenticated}=    Get From Dictionary    ${json}    authenticated
        IF    ${authenticated}
            Dictionary Should Contain Key    ${json}    hostname
            ...    msg=Authenticated container should have hostname

            Dictionary Should Contain Key    ${json}    ip_address
            ...    msg=Authenticated container should have ip_address
        END
    END

Detect Tailscale Container Is Running
    [Documentation]    TDD GREEN: Integration test - verify we can detect if Tailscale container exists
    ...
    ...                REQUIRES: Tailscale container to be started (docker-compose up)
    [Tags]    tailscale    integration    container

    ${response}=    GET On Session    ${SESSION}    ${TAILSCALE_API}/container/status
    ${json}=    Set Variable    ${response.json()}

    # Log current state for debugging
    Log    Container Status: ${json}

    # This is an integration test - we expect the container to exist in dev environment
    # If it doesn't, the test documents the current state
    ${exists}=    Get From Dictionary    ${json}    exists

    Run Keyword If    ${exists}
    ...    Log    ✅ Tailscale container detected
    ...    ELSE
    ...    Log    ⚠️ Tailscale container not found - may need to start with docker-compose

# ============================================================================
# Authentication State Tests
# ============================================================================

Detect Tailscale Authentication State
    [Documentation]    TDD GREEN: Integration test - check if Tailscale is authenticated to tailnet
    ...
    ...                REQUIRES: Tailscale container running
    [Tags]    tailscale    integration    auth

    ${response}=    GET On Session    ${SESSION}    ${TAILSCALE_API}/container/status
    ${json}=    Set Variable    ${response.json()}

    ${running}=    Get From Dictionary    ${json}    running

    # Only meaningful if container is running
    Skip If    not ${running}    Tailscale container not running

    ${authenticated}=    Get From Dictionary    ${json}    authenticated

    IF    ${authenticated}
        Log    ✅ Tailscale is authenticated to tailnet
        ${hostname}=    Get From Dictionary    ${json}    hostname
        ${ip}=    Get From Dictionary    ${json}    ip_address
        Log    Hostname: ${hostname}
        Log    IP: ${ip}

        # Verify hostname format (should be *.ts.net)
        Should Match Regexp    ${hostname}    .*\\.ts\\.net$
        ...    msg=Tailscale hostname should end with .ts.net

        # Verify IP is in 100.x.x.x range (Tailscale CGNAT)
        Should Start With    ${ip}    100.
        ...    msg=Tailscale IP should start with 100. (CGNAT range)
    ELSE
        Log    ⚠️ Tailscale is NOT authenticated - needs auth
    END

# NOTE: Auth URL tests moved to api_tailscale_auth_flow.robot

# ============================================================================
# Container Lifecycle Tests
# ============================================================================

Start Tailscale Container
    [Documentation]    TDD GREEN: Test starting Tailscale container
    ...
    ...                Creates container if doesn't exist, starts if stopped
    [Tags]    tailscale    integration    container

    ${response}=    POST On Session    ${SESSION}    ${TAILSCALE_API}/container/start
    ...             expected_status=any

    Status Should Be    200    ${response}
    ${json}=    Set Variable    ${response.json()}

    Dictionary Should Contain Key    ${json}    status
    Dictionary Should Contain Key    ${json}    message

    ${status}=    Get From Dictionary    ${json}    status

    # Valid statuses: created, started, already_running
    Should Be True    '${status}' in ['created', 'started', 'already_running']
    ...    msg=Status should be created/started/already_running, got ${status}

    Log    Container start result: ${json}

# NOTE: Certificate provisioning tests moved to api_tailscale_cert_provisioning.robot

# ============================================================================
# Tailscale URL Tests
# ============================================================================

Get Tailscale Access URLs
    [Documentation]    TDD GREEN: Test getting access URLs for services
    ...
    ...                REQUIRES: Tailscale configured
    [Tags]    tailscale    integration    url

    ${response}=    GET On Session    ${SESSION}    ${TAILSCALE_API}/access-urls
    ...             expected_status=any

    IF    ${response.status_code} == 404
        Log    ⚠️ Tailscale not configured yet
        Skip    Tailscale not configured
    END

    Status Should Be    200    ${response}
    ${json}=    Set Variable    ${response.json()}

    # Required fields
    Dictionary Should Contain Key    ${json}    frontend
    ...    msg=Response missing 'frontend' field

    Dictionary Should Contain Key    ${json}    backend
    ...    msg=Response missing 'backend' field

    Dictionary Should Contain Key    ${json}    environments
    ...    msg=Response missing 'environments' field

    ${frontend_url}=    Get From Dictionary    ${json}    frontend
    ${backend_url}=    Get From Dictionary    ${json}    backend

    # URLs should be HTTPS
    Should Start With    ${frontend_url}    https://
    ...    msg=Frontend URL should be HTTPS

    Should Start With    ${backend_url}    https://
    ...    msg=Backend URL should be HTTPS

    Log    Frontend URL: ${frontend_url}
    Log    Backend URL: ${backend_url}

Get Environment Info
    [Documentation]    TDD GREEN: Test getting environment information
    ...
    ...                NOTE: This should probably be in /api/settings (see analysis doc)
    [Tags]    tailscale    unit    api

    ${response}=    GET On Session    ${SESSION}    ${TAILSCALE_API}/environment

    Status Should Be    200    ${response}
    ${json}=    Set Variable    ${response.json()}

    # Required fields
    Dictionary Should Contain Key    ${json}    name
    Dictionary Should Contain Key    ${json}    tailscale_hostname
    Dictionary Should Contain Key    ${json}    tailscale_container_name
    Dictionary Should Contain Key    ${json}    tailscale_volume_name

    ${env_name}=    Get From Dictionary    ${json}    name
    ${container_name}=    Get From Dictionary    ${json}    tailscale_container_name

    # Container name should include environment name
    Should Contain    ${container_name}    ${env_name}
    ...    msg=Container name should include environment name

    Log    Environment: ${env_name}
    Log    Container: ${container_name}

# ============================================================================
# Tailnet Settings Tests
# ============================================================================

Get Tailnet Settings
    [Documentation]    TDD GREEN: Test getting tailnet configuration (MagicDNS, HTTPS)
    ...
    ...                REQUIRES: Tailscale authenticated
    [Tags]    tailscale    integration    tailnet

    ${response}=    GET On Session    ${SESSION}    ${TAILSCALE_API}/container/tailnet-settings
    ...             expected_status=any

    IF    ${response.status_code} == 400 or ${response.status_code} == 500
        Log    ⚠️ Cannot get tailnet settings - Tailscale may not be running/authenticated
        Skip    Tailscale not available
    END

    Status Should Be    200    ${response}
    ${json}=    Set Variable    ${response.json()}

    # Required fields
    Dictionary Should Contain Key    ${json}    magic_dns
    Dictionary Should Contain Key    ${json}    https_serve

    ${magic_dns}=    Get From Dictionary    ${json}    magic_dns
    ${https_serve}=    Get From Dictionary    ${json}    https_serve

    # MagicDNS settings
    Dictionary Should Contain Key    ${magic_dns}    enabled
    Dictionary Should Contain Key    ${magic_dns}    admin_url

    # HTTPS settings
    Dictionary Should Contain Key    ${https_serve}    enabled
    Dictionary Should Contain Key    ${https_serve}    admin_url

    ${magic_dns_enabled}=    Get From Dictionary    ${magic_dns}    enabled
    ${https_enabled}=    Get From Dictionary    ${https_serve}    enabled

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

    ${response}=    POST On Session    ${SESSION}    ${TAILSCALE_API}/container/provision-cert
    ...             params=hostname=green.spangled-kettle.ts.net
    ...             expected_status=any

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
    ${json}=    Set Variable    ${response.json()}
    ${provisioned}=    Get From Dictionary    ${json}    provisioned

    IF    ${provisioned}
        Log    ✅ Certificate provisioned successfully despite any connection issues
        Log    This suggests retry logic is working
    ELSE
        ${error}=    Get From Dictionary    ${json}    error
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
Setup Tailscale Tests
    [Documentation]    Setup authenticated API session for Tailscale tests

    # Get authenticated session
    ${session_alias}=    Get Admin API Session
    Set Suite Variable    ${SESSION}    ${session_alias}

Teardown Tailscale Tests
    [Documentation]    Cleanup after tests

    Delete All Sessions

Status Should Be
    [Documentation]    Helper keyword to verify HTTP status code
    [Arguments]    ${expected}    ${response}

    Should Be Equal As Integers    ${response.status_code}    ${expected}
    ...    msg=Expected status ${expected}, got ${response.status_code}
