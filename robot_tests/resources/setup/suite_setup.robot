*** Settings ***
Documentation     Generic suite setup and teardown providing authenticated API session
Library           RequestsLibrary
Library           REST
Resource          ../auth_keywords.robot

*** Keywords ***
Standard Suite Setup
    [Documentation]    Create authenticated API session and set as suite variable
    ...
    ...                This provides a ${SESSION} variable that can be used throughout the suite.
    ...                Tests can add additional setup logic after calling this keyword.
    ...
    ...                Usage:
    ...                Suite Setup    Standard Suite Setup

    # Get authenticated session
    ${session_alias}=    Get Admin API Session
    Set Suite Variable    ${SESSION}    ${session_alias}

    Log    ✓ Authenticated API session created: ${SESSION}    console=yes

Standard Suite Teardown
    [Documentation]    Cleanup API sessions after suite completes
    ...
    ...                This deletes all HTTP sessions created during the test suite.
    ...                Tests can add additional teardown logic before calling this keyword.
    ...
    ...                Usage:
    ...                Suite Teardown    Standard Suite Teardown

    Delete All Sessions
    Log    ✓ All API sessions deleted    console=yes

Setup REST Authentication
    [Documentation]    Configure REST library with JWT authentication token for each test
    ...
    ...                Gets fresh admin JWT token and sets it as authorization header.
    ...                Note: REST library base URL must be set at import time in test file.
    ...                Use as Test Setup to ensure each test has a valid token.

    # Get API URL from environment config
    ${api_url}=    Get Api Url

    # Create temporary session for login
    Create Session    temp_login    ${api_url}    verify=True

    # Login to get JWT token
    ${auth_data}=    Create Dictionary    email=admin@example.com    password=password

    ${response}=    RequestsLibrary.POST On Session    temp_login    /api/auth/login
    ...    json=${auth_data}
    ...    expected_status=200

    ${token}=    Set Variable    ${response.json()}[access_token]

    # Set authorization header for REST library
    Set Headers    {"Authorization": "Bearer ${token}"}

Ensure Tailscale Container Running
    [Documentation]    Ensure Tailscale container is running before each test
    ...
    ...                Checks container status and starts it if not running.
    ...                Use in Test Setup to guarantee container availability.

    # Check if container is running
    REST.GET    /api/tailscale/container/status
    ${status}=    Output    response body
    ${running}=    Set Variable    ${status}[running]

    # Start container if not running
    IF    not ${running}
        Log    Starting Tailscale container for test
        REST.POST    /api/tailscale/container/start
        Sleep    2s    Wait for container to be ready
    END

Start Tailscale Container
    [Documentation]    Start Tailscale container and authenticate for test
    ...
    ...                Combines REST authentication and container startup.
    ...                Use as Test Setup for Tailscale tests.

    Setup REST Authentication
    Ensure Tailscale Container Running
