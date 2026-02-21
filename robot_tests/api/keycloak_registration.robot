
*** Settings ***
Documentation    Keycloak Registration Test
...
...              Tests Keycloak redirect URI registration to diagnose
...              why startup registration fails but wizard succeeds.
...
...              This test calls the same registration function that both
...              startup and the Tailscale wizard use, allowing us to:
...              - Verify credentials are correct
...              - Check if realm is accessible
...              - Identify timing/caching issues

Library          RequestsLibrary
Library          Collections
Library          OperatingSystem

# Import setup resources (handles container management)
Resource         ../resources/setup/suite_setup.robot
Resource         ../resources/auth_keywords.robot

Suite Setup      Keycloak Test Suite Setup
Suite Teardown   Keycloak Test Suite Teardown

*** Variables ***
${FORM_HEADERS}     ${EMPTY}

*** Test Cases ***
Test Keycloak Admin Client Can Authenticate
    [Documentation]    Verify admin client can get token from master realm
    ...                ✅ Tests authentication step
    ...                ✅ Identifies if credentials are wrong
    [Tags]    keycloak    admin    auth

    # This tests the first step: getting admin token
    # If this fails, credentials in secrets.yaml are wrong

    ${token}=    Get Keycloak Admin Token
    Should Not Be Empty    ${token}
    ...    msg=Should receive access token from Keycloak

    Log    ✅ Admin authentication successful

Test Keycloak Admin Token Has Realm Access
    [Documentation]    Verify admin token can access ushadow realm
    ...                ✅ Tests realm permissions
    ...                ✅ Identifies if realm import is incomplete
    [Tags]    keycloak    admin    realm

    # Get admin token first
    ${token}=    Get Keycloak Admin Token

    # Try to access ushadow realm clients
    ${auth_headers}=    Create Dictionary
    ...    Authorization=Bearer ${token}

    ${response}=    GET On Session    keycloak_session
    ...             /admin/realms/ushadow/clients
    ...             params=clientId=ushadow-frontend
    ...             headers=${auth_headers}
    ...             expected_status=any

    # Check if we got access
    Should Be Equal As Integers    ${response.status_code}    200
    ...    msg=Admin token should have access to ushadow realm (if 401, realm import incomplete)

    ${clients}=    Set Variable    ${response.json()}
    ${client_count}=    Get Length    ${clients}
    Should Be True    ${client_count} > 0
    ...    msg=Should find ushadow-frontend client

    Log    ✅ Admin token has ushadow realm access
    Log    Found client: ${clients}[0][clientId]

Test Backend Keycloak Registration Endpoint
    [Documentation]    Test the backend's Keycloak registration function
    ...                ✅ Simulates what startup/wizard calls
    ...                ✅ Shows exactly what fails
    [Tags]    keycloak    backend    registration

    # Create admin API session
    ${admin_session}=    Get Admin API Session

    # Call a Tailscale endpoint that triggers Keycloak registration
    # (This is what the wizard does)
    ${config}=    Create Dictionary
    ...    hostname=green.spangled-kettle.ts.net
    ...    backend_port=8290
    ...    frontend_port=3290

    ${response}=    POST On Session    ${admin_session}
    ...             /api/tailscale/configure-serve
    ...             json=${config}
    ...             expected_status=any

    Log    Response status: ${response.status_code}

    # Get response body
    ${result}=    Set Variable    ${response.json()}
    Log Many    ${result}

    # Check if we got a success response
    Run Keyword If    ${response.status_code} == 200
    ...    Log    ✅ Endpoint returned 200
    ...    ELSE
    ...    Fail    Endpoint returned ${response.status_code}: ${result}

    # Check if response has the expected keys
    ${has_keycloak}=    Run Keyword And Return Status
    ...    Dictionary Should Contain Key    ${result}    keycloak_registered

    Run Keyword If    ${has_keycloak}
    ...    Log    Response has keycloak_registered: ${result}[keycloak_registered]
    ...    ELSE
    ...    Log    ⚠️ Response missing keycloak_registered key. Available keys: ${result.keys()}

    # If keycloak registration data is present, verify it
    Run Keyword If    ${has_keycloak}
    ...    Should Be True    ${result}[keycloak_registered]
    ...    msg=Keycloak registration should succeed (check logs for 401 errors)

Test Direct Keycloak Admin Registration
    [Documentation]    Directly test Keycloak admin API registration
    ...                ✅ Bypasses backend to isolate issue
    ...                ✅ Tests if it's a backend code problem
    [Tags]    keycloak    admin    direct

    # Get admin token
    ${token}=    Get Keycloak Admin Token

    # Try to update client directly
    ${auth_headers}=    Create Dictionary
    ...    Authorization=Bearer ${token}
    ...    Content-Type=application/json

    # First, get the client
    ${response}=    GET On Session    keycloak_session
    ...             /admin/realms/ushadow/clients
    ...             params=clientId=ushadow-frontend
    ...             headers=${auth_headers}
    ...             expected_status=200

    ${clients}=    Set Variable    ${response.json()}
    ${client}=    Set Variable    ${clients}[0]
    ${client_uuid}=    Set Variable    ${client}[id]

    # Update redirect URIs
    ${new_redirect_uris}=    Create List
    ...    ${FRONTEND_URL}/oauth/callback
    Run Keyword If    '${TAILSCALE_URL}' != '${EMPTY}'
    ...    Append To List    ${new_redirect_uris}    ${TAILSCALE_URL}/oauth/callback

    ${update_payload}=    Create Dictionary
    ...    id=${client_uuid}
    ...    clientId=ushadow-frontend
    ...    redirectUris=${new_redirect_uris}

    ${response}=    PUT On Session    keycloak_session
    ...             /admin/realms/ushadow/clients/${client_uuid}
    ...             json=${update_payload}
    ...             headers=${auth_headers}
    ...             expected_status=204

    Log    ✅ Direct Keycloak admin registration successful

*** Keywords ***
Get Keycloak Admin Token
    [Documentation]    Get admin token from Keycloak master realm
    [Arguments]    ${username}=admin    ${password}=admin

    ${response}=    POST On Session    keycloak_session
    ...             /realms/master/protocol/openid-connect/token
    ...             data=grant_type=password&client_id=admin-cli&username=${username}&password=${password}
    ...             expected_status=200
    ...             headers=${FORM_HEADERS}

    ${token_data}=    Set Variable    ${response.json()}
    RETURN    ${token_data}[access_token]

Keycloak Test Suite Setup
    [Documentation]    Setup test environment and Keycloak sessions
    # First, run standard suite setup (starts containers if needed)
    Suite Setup

    # Then setup Keycloak session
    Create Session    keycloak_session    ${KEYCLOAK_URL}    verify=False

    # Create form headers for token requests
    ${headers}=    Create Dictionary
    ...    Content-Type=application/x-www-form-urlencoded
    Set Suite Variable    ${FORM_HEADERS}    ${headers}

    Log    Keycloak test suite initialized

Keycloak Test Suite Teardown
    [Documentation]    Clean up test sessions and environment
    Delete All Sessions
    Suite Teardown
