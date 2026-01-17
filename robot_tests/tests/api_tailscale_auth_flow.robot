*** Settings ***
Documentation    Tailscale Authentication Flow Backend API Tests
...
...              Tests the backend API's authentication flow endpoints:
...              - GET /api/tailscale/container/auth-url - Get auth URL and QR code
...              - Verify auth URL format and caching
...              - Verify daemon logs contain auth URL
...
...              NOTE: These tests operate on the SHARED green container
...              and temporarily logout/re-auth it. Run with caution in parallel test execution.

Library          RequestsLibrary
Library          String
Library          Process
Library          ../resources/EnvConfig.py
Resource         ../resources/auth_keywords.robot

Suite Setup      Setup Auth Flow Tests
Suite Teardown   Teardown Auth Flow Tests

*** Variables ***
${TAILSCALE_API}    /api/tailscale
${SESSION}          auth_flow_session

*** Test Cases ***
Container Must Be Running For Auth
    [Documentation]    Ensure container is running before testing auth flow
    [Tags]    tailscale    integration    auth    prerequisite

    ${response}=    GET On Session    ${SESSION}    ${TAILSCALE_API}/container/status
    ${json}=    Set Variable    ${response.json()}

    ${exists}=    Get From Dictionary    ${json}    exists
    ${running}=    Get From Dictionary    ${json}    running

    Should Be True    ${exists}
    ...    msg=Tailscale container must exist for auth tests

    Should Be True    ${running}
    ...    msg=Tailscale container must be running for auth tests

    Log    ✅ Container is running

Auth URL Generation Works
    [Documentation]    TDD RED: Verify we can successfully get an auth URL with QR code
    [Tags]    tailscale    integration    auth    critical

    # Try to get auth URL
    ${response}=    GET On Session    ${SESSION}    ${TAILSCALE_API}/container/auth-url
    ...             expected_status=any

    # Log response for debugging
    Log    Status: ${response.status_code}
    Log    Response: ${response.text}

    # Should return 200 OK
    Should Be Equal As Integers    ${response.status_code}    200
    ...    msg=Failed to get auth URL: ${response.text}

    ${json}=    Set Variable    ${response.json()}

    # Verify response structure
    Dictionary Should Contain Key    ${json}    auth_url
    ...    msg=Response missing 'auth_url' field

    Dictionary Should Contain Key    ${json}    web_url
    ...    msg=Response missing 'web_url' field

    Dictionary Should Contain Key    ${json}    qr_code_data
    ...    msg=Response missing 'qr_code_data' field

    ${auth_url}=    Get From Dictionary    ${json}    auth_url
    ${qr_code_data}=    Get From Dictionary    ${json}    qr_code_data

    # Auth URL must be valid Tailscale login URL
    Should Start With    ${auth_url}    https://login.tailscale.com
    ...    msg=Auth URL should be a Tailscale login URL, got: ${auth_url}

    # QR code must be a data URL
    Should Start With    ${qr_code_data}    data:image/png;base64,
    ...    msg=QR code should be a base64 PNG data URL

    # QR code should not be empty
    ${qr_length}=    Get Length    ${qr_code_data}
    Should Be True    ${qr_length} > 100
    ...    msg=QR code data seems too short: ${qr_length} chars

    Log    ✅ Auth URL: ${auth_url}
    Log    ✅ QR code data length: ${qr_length} chars

    # Store for next test
    Set Suite Variable    ${AUTH_URL}    ${auth_url}

Auth URL Is Consistent When Not Regenerating
    [Documentation]    TDD GREEN: Verify cached auth URL is returned on retry
    [Tags]    tailscale    integration    auth

    # Get auth URL again without regenerate flag
    ${response}=    GET On Session    ${SESSION}    ${TAILSCALE_API}/container/auth-url
    ${json}=    Set Variable    ${response.json()}
    ${new_auth_url}=    Get From Dictionary    ${json}    auth_url

    # Should return the same URL (from cache)
    Should Be Equal    ${new_auth_url}    ${AUTH_URL}
    ...    msg=Auth URL should be cached and consistent

    Log    ✅ Auth URL is cached correctly

Regenerate Flag Creates New Auth URL
    [Documentation]    TDD GREEN: Verify regenerate flag creates new URL
    [Tags]    tailscale    integration    auth

    # Get auth URL with regenerate=true
    ${response}=    GET On Session    ${SESSION}    ${TAILSCALE_API}/container/auth-url
    ...             params=regenerate=true
    ${json}=    Set Variable    ${response.json()}
    ${new_auth_url}=    Get From Dictionary    ${json}    auth_url

    # Should be a different URL
    Should Not Be Equal    ${new_auth_url}    ${AUTH_URL}
    ...    msg=Regenerate should create a new auth URL

    Log    ✅ Old URL: ${AUTH_URL}
    Log    ✅ New URL: ${new_auth_url}

Auth URL Contains Valid Tailscale Token
    [Documentation]    Verify the auth URL contains a proper token path
    [Tags]    tailscale    integration    auth

    ${response}=    GET On Session    ${SESSION}    ${TAILSCALE_API}/container/auth-url
    ${json}=    Set Variable    ${response.json()}
    ${auth_url}=    Get From Dictionary    ${json}    auth_url

    # Should match pattern: https://login.tailscale.com/a/{token}
    Should Match Regexp    ${auth_url}    https://login\\.tailscale\\.com/a/[a-f0-9]+
    ...    msg=Auth URL should match pattern: https://login.tailscale.com/a/{token}

    Log    ✅ Auth URL has valid token format

Container Status Shows Not Authenticated Initially
    [Documentation]    Verify container status shows authenticated=false before auth
    [Tags]    tailscale    integration    auth

    ${response}=    GET On Session    ${SESSION}    ${TAILSCALE_API}/container/status
    ${json}=    Set Variable    ${response.json()}

    ${running}=    Get From Dictionary    ${json}    running
    Skip If    not ${running}    Container not running

    # Check authenticated field
    ${has_authenticated}=    Run Keyword And Return Status
    ...    Dictionary Should Contain Key    ${json}    authenticated

    IF    ${has_authenticated}
        ${authenticated}=    Get From Dictionary    ${json}    authenticated
        Should Not Be True    ${authenticated}
        ...    msg=Container should not be authenticated yet (test runs after logout)
    END

    Log    ✅ Container correctly shows as not authenticated

Daemon Logs Show Auth URL
    [Documentation]    Verify daemon logs contain the auth URL after requesting it
    [Tags]    tailscale    integration    auth    debug

    # Request auth URL
    ${response}=    GET On Session    ${SESSION}    ${TAILSCALE_API}/container/auth-url
    ...             params=regenerate=true

    # Wait a moment for logs to flush
    Sleep    1s

    # Check daemon logs
    ${result}=    Run Process    docker    logs    --tail    100    ushadow-green-tailscale
    ${logs}=    Set Variable    ${result.stdout}${result.stderr}

    Log    Recent daemon logs:\n${logs}

    # Should contain AuthURL in logs
    Should Contain    ${logs}    AuthURL is https://login.tailscale.com
    ...    msg=Daemon logs should show the auth URL

    Log    ✅ Auth URL visible in daemon logs

*** Keywords ***
Setup Auth Flow Tests
    [Documentation]    Setup authenticated API session and prepare green container for auth flow testing
    ...
    ...                NOTE: Logs out green container to test auth flow from unauthenticated state

    # Get authenticated session
    ${session_alias}=    Get Admin API Session
    Set Suite Variable    ${SESSION}    ${session_alias}

    # Ensure container is running
    ${start_response}=    POST On Session    ${session_alias}    ${TAILSCALE_API}/container/start
    ...                   expected_status=any

    Sleep    2s    Wait for container to be ready

    # Logout to ensure clean auth state for testing auth flow
    # This allows us to test the auth flow from an unauthenticated state
    ${result}=    Run Process    docker    exec    ushadow-green-tailscale    tailscale    logout
    Log    Logout result: ${result.stdout}${result.stderr}

    Sleep    1s    Wait for logout to complete

Teardown Auth Flow Tests
    [Documentation]    Cleanup and optionally re-authenticate green container
    ...
    ...                NOTE: Consider re-authenticating if other tests depend on auth state

    # Re-authenticate the green container if TAILSCALE_AUTH_KEY is available
    ${auth_key}=    Get Env Value    TAILSCALE_AUTH_KEY    ${EMPTY}

    IF    '${auth_key}' != '${EMPTY}'
        Log    Re-authenticating green container after auth flow tests
        ${result}=    Run Process    docker    exec    ushadow-green-tailscale
        ...    tailscale    up    --authkey\=${auth_key}    --accept-routes
        ...    timeout=30s

        IF    ${result.rc} == 0
            Log    ✅ Green container re-authenticated successfully
        ELSE
            Log    ⚠️ Failed to re-auth green container: ${result.stderr}    WARN
        END
    ELSE
        Log    ⚠️ No TAILSCALE_AUTH_KEY - green container left unauthenticated    WARN
    END

    Delete All Sessions
