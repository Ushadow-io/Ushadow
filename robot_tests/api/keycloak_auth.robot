*** Settings ***
Documentation    Keycloak User Authentication Tests
...
...              Tests Keycloak OAuth/OIDC authentication flow:
...              1. User registration sync to Keycloak
...              2. OAuth authorization code flow
...              3. Token exchange
...              4. Token validation and user info
...              5. Token refresh
...
...              Test Cases:
...              - TC-KC-001: Direct grant (password) authentication
...              - TC-KC-002: OAuth authorization code flow (E2E)
...              - TC-KC-003: Validate access token and get user info
...              - TC-KC-004: Introspect access token
...              - TC-KC-005: Refresh access token
...              - TC-KC-006: Logout and revoke tokens

Library          RequestsLibrary
Library          Collections
Library          String
Library          OperatingSystem

# REQUIRED: Import standard test environment setup
# This ensures Docker containers are started and services are ready
Resource         ../resources/setup/suite_setup.robot
Resource         ../resources/auth_keywords.robot

# Import centralized test configuration
Variables        ../resources/setup/test_env.py

Suite Setup      Keycloak Auth Suite Setup
Suite Teardown   Keycloak Auth Suite Teardown

*** Variables ***
# Session names
${API_SESSION}           keycloak_auth_session
${KEYCLOAK_SESSION}      keycloak_session

# API endpoints
${AUTH_BASE}             /api/auth
${KEYCLOAK_ADMIN_BASE}   /api/keycloak

# Test state (populated during test execution)
${TEST_USER_ID}          ${EMPTY}
${KEYCLOAK_USER_ID}      ${EMPTY}

# Constants
@{EMPTY_LIST}            # Empty list for requiredActions

*** Test Cases ***
# =============================================================================
# Section 1: Keycloak Direct Authentication
# =============================================================================
# Note: User registration is handled in suite setup via
# Ensure Keycloak Test User Exists keyword (canonical test pattern)
# =============================================================================

TC-KC-001: Authenticate with Keycloak Direct Grant
    [Documentation]    Test direct grant (password) flow with Keycloak
    ...
    ...                GIVEN: User registered in Keycloak
    ...                WHEN: POST to Keycloak token endpoint with credentials
    ...                THEN: Receives access token and refresh token
    [Tags]    keycloak    auth    direct-grant

    # Direct grant (Resource Owner Password Credentials flow)
    # This requires the client to have "Direct Access Grants" enabled
    # Use ushadow-cli client which has direct grants enabled

    ${token_data}=    Create Dictionary
    ...    grant_type=password
    ...    client_id=${KEYCLOAK_CLI_CLIENT_ID}
    ...    username=${KEYCLOAK_TEST_EMAIL}
    ...    password=${KEYCLOAK_TEST_PASSWORD}

    ${headers}=    Create Dictionary
    ...    Content-Type=application/x-www-form-urlencoded

    ${response}=    POST On Session    ${KEYCLOAK_SESSION}
    ...    /realms/${KEYCLOAK_REALM}/protocol/openid-connect/token
    ...    data=${token_data}
    ...    headers=${headers}
    ...    expected_status=any

    # Should get tokens if direct grant is enabled
    IF    ${response.status_code} == 200
        ${tokens}=    Set Variable    ${response.json()}

        # Verify token response
        Dictionary Should Contain Key    ${tokens}    access_token
        Dictionary Should Contain Key    ${tokens}    refresh_token
        Dictionary Should Contain Key    ${tokens}    token_type
        Dictionary Should Contain Key    ${tokens}    expires_in

        # Store tokens for later tests
        Set Suite Variable    ${ACCESS_TOKEN}    ${tokens}[access_token]
        Set Suite Variable    ${REFRESH_TOKEN}    ${tokens}[refresh_token]

        Log    ✅ Keycloak authentication successful
        Log    Token type: ${tokens}[token_type]
        Log    Expires in: ${tokens}[expires_in] seconds

    ELSE IF    ${response.status_code} == 400
        ${error}=    Set Variable    ${response.json()}
        ${error_desc}=    Get From Dictionary    ${error}    error_description    ${error}[error]

        IF    'Direct access grants' in '${error_desc}' or 'unauthorized_client' in '${error_desc}'
            Skip    Direct grant not enabled on Keycloak client
        ELSE
            Fail    Authentication failed: ${error_desc}
        END

    ELSE IF    ${response.status_code} == 401
        ${error}=    Set Variable    ${response.json()}
        Fail    Invalid credentials: ${error}

    ELSE
        Fail    Unexpected status: ${response.status_code} - ${response.text}
    END

# =============================================================================
# Section 2: OAuth Authorization Code Flow
# =============================================================================

TC-KC-002: OAuth Authorization Code Flow (Simulation)
    [Documentation]    OAuth flow requires browser automation
    ...
    ...                GIVEN: Keycloak client configured for auth code flow
    ...                WHEN: User initiates OAuth flow in browser
    ...                THEN: Can complete login and exchange code for tokens
    ...
    ...                ✅ Browser Test: robot_tests/browser/keycloak_oauth.robot
    ...                Run: robot browser/keycloak_oauth.robot
    [Tags]    keycloak    oauth    auth-code    e2e

    # OAuth flow requires actual browser interaction
    # See: robot_tests/browser/keycloak_oauth.robot for full implementation

    Log    OAuth Authorization Code Flow is tested in Browser suite
    Log    Test file: robot_tests/browser/keycloak_oauth.robot
    Log    Run: robot browser/keycloak_oauth.robot
    Skip    OAuth flow requires browser automation (use browser/keycloak_oauth.robot)

# =============================================================================
# Section 3: Token Validation
# =============================================================================

TC-KC-003: Validate Access Token and Get User Info
    [Documentation]    Validate access token and retrieve user information
    ...
    ...                GIVEN: Valid access token
    ...                WHEN: GET /realms/{realm}/protocol/openid-connect/userinfo
    ...                THEN: Returns user information
    [Tags]    keycloak    token    userinfo

    # Skip if no access token
    ${has_token}=    Run Keyword And Return Status
    ...    Variable Should Exist    ${ACCESS_TOKEN}

    IF    not ${has_token}
        Skip    No access token available (direct grant may be disabled)
    END

    # Get user info using access token
    ${headers}=    Create Dictionary
    ...    Authorization=Bearer ${ACCESS_TOKEN}

    ${response}=    GET On Session    ${KEYCLOAK_SESSION}
    ...    /realms/${KEYCLOAK_REALM}/protocol/openid-connect/userinfo
    ...    headers=${headers}
    ...    expected_status=any

    Should Be Equal As Integers    ${response.status_code}    200
    ...    msg=Failed to get user info: ${response.text}

    ${userinfo}=    Set Variable    ${response.json()}

    # Verify user info
    Dictionary Should Contain Key    ${userinfo}    sub
    Dictionary Should Contain Key    ${userinfo}    email
    Dictionary Should Contain Key    ${userinfo}    preferred_username

    Should Be Equal    ${userinfo}[email]    ${KEYCLOAK_TEST_EMAIL}
    ...    msg=Email in userinfo should match test user

    Log    ✅ Token validated successfully
    Log    User ID (sub): ${userinfo}[sub]
    Log    Email: ${userinfo}[email]

# =============================================================================
# Section 4: Token Introspection
# =============================================================================

TC-KC-004: Introspect Access Token
    [Documentation]    Introspect token to verify it's valid and get metadata
    ...
    ...                GIVEN: Valid access token
    ...                WHEN: POST to token introspection endpoint with client auth
    ...                THEN: Returns token is active and metadata
    ...
    ...                ℹ️ Token Introspection (RFC 7662):
    ...                - Validates tokens without exposing client secrets
    ...                - Returns metadata: active status, expiry, scopes, subject
    ...                - Requires client authentication (confidential clients)
    ...                - Used by resource servers to validate tokens
    [Tags]    keycloak    token    introspection

    # Skip if no access token
    ${has_token}=    Run Keyword And Return Status
    ...    Variable Should Exist    ${ACCESS_TOKEN}

    IF    not ${has_token}
        Skip    No access token available
    END

    # Token introspection requires client authentication
    # For public clients (like ushadow-cli), introspection may not be available
    # Try introspection with client_id (public client)
    ${introspect_data}=    Create Dictionary
    ...    token=${ACCESS_TOKEN}
    ...    client_id=${KEYCLOAK_CLI_CLIENT_ID}

    ${headers}=    Create Dictionary
    ...    Content-Type=application/x-www-form-urlencoded

    ${response}=    POST On Session    ${KEYCLOAK_SESSION}
    ...    /realms/${KEYCLOAK_REALM}/protocol/openid-connect/token/introspect
    ...    data=${introspect_data}
    ...    headers=${headers}
    ...    expected_status=any

    # Public clients may not have introspection enabled
    IF    ${response.status_code} == 200
        ${introspection}=    Set Variable    ${response.json()}

        # Verify token is active
        Dictionary Should Contain Key    ${introspection}    active
        Should Be True    ${introspection}[active]
        ...    msg=Token should be active

        Log    ✅ Token introspection successful
        Log    Token active: ${introspection}[active]

        # Log additional metadata if present
        ${has_exp}=    Run Keyword And Return Status
        ...    Dictionary Should Contain Key    ${introspection}    exp
        IF    ${has_exp}
            Log    Token expires at: ${introspection}[exp]
        END

    ELSE IF    ${response.status_code} == 401
        Skip    Token introspection requires client authentication (confidential client)

    ELSE IF    ${response.status_code} == 403
        Skip    Client not authorized for token introspection

    ELSE
        Fail    Unexpected introspection response: ${response.status_code} - ${response.text}
    END

# =============================================================================
# Section 5: Token Refresh
# =============================================================================

TC-KC-005: Refresh Access Token
    [Documentation]    Use refresh token to get new access token
    ...
    ...                GIVEN: Valid refresh token
    ...                WHEN: POST to token endpoint with refresh grant
    ...                THEN: Receives new access token
    [Tags]    keycloak    token    refresh

    # Skip if no refresh token
    ${has_refresh}=    Run Keyword And Return Status
    ...    Variable Should Exist    ${REFRESH_TOKEN}

    IF    not ${has_refresh}
        Skip    No refresh token available
    END

    # Refresh token
    ${refresh_data}=    Create Dictionary
    ...    grant_type=refresh_token
    ...    client_id=${KEYCLOAK_CLI_CLIENT_ID}
    ...    refresh_token=${REFRESH_TOKEN}

    ${headers}=    Create Dictionary
    ...    Content-Type=application/x-www-form-urlencoded

    ${response}=    POST On Session    ${KEYCLOAK_SESSION}
    ...    /realms/${KEYCLOAK_REALM}/protocol/openid-connect/token
    ...    data=${refresh_data}
    ...    headers=${headers}
    ...    expected_status=200

    ${new_tokens}=    Set Variable    ${response.json()}

    # Verify new tokens
    Dictionary Should Contain Key    ${new_tokens}    access_token
    Dictionary Should Contain Key    ${new_tokens}    refresh_token

    # New access token should be different
    Should Not Be Equal    ${new_tokens}[access_token]    ${ACCESS_TOKEN}
    ...    msg=New access token should be different from old one

    Log    ✅ Token refresh successful
    Log    New access token received

# =============================================================================
# Section 6: Logout
# =============================================================================

TC-KC-006: Logout and Revoke Tokens
    [Documentation]    Logout user and revoke tokens
    ...
    ...                GIVEN: Valid refresh token
    ...                WHEN: POST to logout endpoint
    ...                THEN: Tokens are revoked
    [Tags]    keycloak    logout

    # Skip if no refresh token
    ${has_refresh}=    Run Keyword And Return Status
    ...    Variable Should Exist    ${REFRESH_TOKEN}

    IF    not ${has_refresh}
        Skip    No refresh token available
    END

    # Logout (revoke tokens)
    ${logout_data}=    Create Dictionary
    ...    client_id=${KEYCLOAK_CLI_CLIENT_ID}
    ...    refresh_token=${REFRESH_TOKEN}

    ${headers}=    Create Dictionary
    ...    Content-Type=application/x-www-form-urlencoded

    ${response}=    POST On Session    ${KEYCLOAK_SESSION}
    ...    /realms/${KEYCLOAK_REALM}/protocol/openid-connect/logout
    ...    data=${logout_data}
    ...    headers=${headers}
    ...    expected_status=204

    Log    ✅ Logout successful

    # Verify token is now invalid
    ${userinfo_response}=    GET On Session    ${KEYCLOAK_SESSION}
    ...    /realms/${KEYCLOAK_REALM}/protocol/openid-connect/userinfo
    ...    headers=${{ {'Authorization': 'Bearer ${ACCESS_TOKEN}'} }}
    ...    expected_status=any

    Should Be Equal As Integers    ${userinfo_response.status_code}    401
    ...    msg=Token should be invalid after logout

    Log    ✅ Token successfully revoked

*** Keywords ***
Keycloak Auth Suite Setup
    [Documentation]    Setup test environment and Keycloak sessions

    # CRITICAL: Call standard suite setup first
    # This starts Docker containers and ensures services are ready
    Suite Setup

    # Get authenticated admin session (from auth_keywords.robot)
    ${admin_session}=    Get Admin API Session
    Set Suite Variable    ${API_SESSION}    ${admin_session}

    # Create Keycloak session (using URL from test_env.py)
    Create Session    ${KEYCLOAK_SESSION}    ${KEYCLOAK_URL}    verify=False

    # Ensure test user exists in Keycloak (canonical test requirement)
    Ensure Keycloak Test User Exists

    # Log test configuration
    Log    ✅ Keycloak auth tests initialized
    Log    Keycloak URL: ${KEYCLOAK_URL}
    Log    Realm: ${KEYCLOAK_REALM}
    Log    Client ID: ${KEYCLOAK_CLIENT_ID}
    Log    Test User: ${KEYCLOAK_TEST_EMAIL}

Ensure Keycloak Test User Exists
    [Documentation]    Ensure test user exists in Keycloak (canonical test requirement)
    ...
    ...                Uses Keycloak Admin REST API to create user if needed.
    ...                This makes each test canonical - no dependency on other tests.

    # Get admin token for Keycloak Admin REST API
    ${admin_token_data}=    Create Dictionary
    ...    grant_type=password
    ...    client_id=admin-cli
    ...    username=${KEYCLOAK_ADMIN_USER}
    ...    password=${KEYCLOAK_ADMIN_PASSWORD}

    ${headers}=    Create Dictionary
    ...    Content-Type=application/x-www-form-urlencoded

    ${token_response}=    POST On Session    ${KEYCLOAK_SESSION}
    ...    /realms/master/protocol/openid-connect/token
    ...    data=${admin_token_data}
    ...    headers=${headers}
    ...    expected_status=200

    ${admin_token}=    Set Variable    ${token_response.json()}[access_token]

    # Check if user exists
    ${auth_headers}=    Create Dictionary
    ...    Authorization=Bearer ${admin_token}
    ...    Content-Type=application/json

    ${params}=    Create Dictionary
    ...    username=${KEYCLOAK_TEST_EMAIL}
    ...    exact=true

    ${users_response}=    GET On Session    ${KEYCLOAK_SESSION}
    ...    /admin/realms/${KEYCLOAK_REALM}/users
    ...    params=${params}
    ...    headers=${auth_headers}
    ...    expected_status=200

    ${users}=    Set Variable    ${users_response.json()}
    ${user_exists}=    Evaluate    len(${users}) > 0

    IF    not ${user_exists}
        # Create user with credentials and full profile in one step
        ${credential}=    Create Dictionary
        ...    type=password
        ...    value=${KEYCLOAK_TEST_PASSWORD}
        ...    temporary=${False}

        ${credentials}=    Create List    ${credential}

        ${user_data}=    Create Dictionary
        ...    username=${KEYCLOAK_TEST_EMAIL}
        ...    email=${KEYCLOAK_TEST_EMAIL}
        ...    firstName=Keycloak
        ...    lastName=TestUser
        ...    enabled=${True}
        ...    emailVerified=${True}
        ...    credentials=${credentials}
        ...    requiredActions=${EMPTY_LIST}

        ${create_response}=    POST On Session    ${KEYCLOAK_SESSION}
        ...    /admin/realms/${KEYCLOAK_REALM}/users
        ...    json=${user_data}
        ...    headers=${auth_headers}
        ...    expected_status=201

        # Get user ID from Location header
        ${location}=    Get From Dictionary    ${create_response.headers}    Location
        ${user_id}=    Evaluate    '${location}'.split('/')[-1]
        Log    Created Keycloak user: ${user_id}
    ELSE
        ${user_id}=    Set Variable    ${users}[0][id]
        Log    Keycloak user already exists: ${user_id}

        # Ensure existing user has complete profile
        ${update_data}=    Create Dictionary
        ...    firstName=Keycloak
        ...    lastName=TestUser
        ...    emailVerified=${True}
        ...    enabled=${True}
        ...    requiredActions=${EMPTY_LIST}

        ${update_response}=    PUT On Session    ${KEYCLOAK_SESSION}
        ...    /admin/realms/${KEYCLOAK_REALM}/users/${user_id}
        ...    json=${update_data}
        ...    headers=${auth_headers}
        ...    expected_status=204

        # Reset password for existing user
        ${password_data}=    Create Dictionary
        ...    type=password
        ...    value=${KEYCLOAK_TEST_PASSWORD}
        ...    temporary=${False}

        ${pwd_response}=    PUT On Session    ${KEYCLOAK_SESSION}
        ...    /admin/realms/${KEYCLOAK_REALM}/users/${user_id}/reset-password
        ...    json=${password_data}
        ...    headers=${auth_headers}
        ...    expected_status=204
    END

    Log    ✅ Keycloak test user ready: ${KEYCLOAK_TEST_EMAIL}

Keycloak Auth Suite Teardown
    [Documentation]    Cleanup sessions and test environment

    # Cleanup test user if needed
    # (would require admin API access)

    Delete All Sessions
    Log    Keycloak auth sessions cleaned up

    # CRITICAL: Call standard suite teardown
    # This stops Docker containers if they were started
    Suite Teardown
