*** Settings ***
Documentation    Tailscale Routing Configuration Tests
...
...              Tests that Tailscale serve routes are configured correctly:
...              - Frontend route uses correct port (5173 for dev, 80 for prod)
...              - Backend API routes are configured
...              - WebSocket routes are configured

Library          RequestsLibrary
Library          Collections
Library          String
Library          Process
Library          OperatingSystem
Library          ../resources/EnvConfig.py
Resource         ../resources/auth_keywords.robot

Suite Setup      Setup Routing Tests
Suite Teardown   Delete All Sessions

*** Variables ***
${TAILSCALE_API}    /api/tailscale
${SESSION}          routing_session

*** Test Cases ***
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
    ${response}=    POST On Session    ${SESSION}    ${TAILSCALE_API}/configure-serve
    ...             json=${payload}
    ...             expected_status=any

    IF    ${response.status_code} == 200
        Log    ✅ Routes configured successfully
        ${json}=    Set Variable    ${response.json()}
        Log    Response: ${json}
    ELSE
        Log    ⚠️ Failed to configure routes: ${response.status_code}
        Log    ${response.text}
        Fail    Could not configure routes: ${response.text}
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
    ${response}=    POST On Session    ${SESSION}    ${TAILSCALE_API}/configure-serve
    ...             json=${payload}
    ...             expected_status=any

    Should Be Equal As Integers    ${response.status_code}    200
    ...    msg=Reconfiguration should succeed: ${response.text}

    Log    ✅ Routes reconfigured successfully

    # Wait for changes to apply
    Sleep    2s

    # Verify routes still correct after reconfiguration
    ${result_after}=    Run Process    docker    exec    ushadow-green-tailscale    tailscale    serve    status
    Log    Routes after reconfiguration:\n${result_after.stdout}

    Should Contain    ${result_after.stdout}    ushadow-green-webui:5173
    ...    msg=Routes should still be correct after reconfiguration

*** Keywords ***
Setup Routing Tests
    [Documentation]    Setup authenticated API session

    # Get authenticated session
    ${session_alias}=    Get Admin API Session
    Set Suite Variable    ${SESSION}    ${session_alias}
