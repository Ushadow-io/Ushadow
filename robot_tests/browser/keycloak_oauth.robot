*** Settings ***
Documentation    Keycloak OAuth Authorization Code Flow Tests
...
...              Tests the full OAuth 2.0 authorization code flow via browser:
...              1. App login page shows Keycloak sign-in button
...              2. Clicking it redirects to Keycloak login page
...              3. User logs in on Keycloak
...              4. Keycloak redirects to /oauth/callback
...              5. App exchanges code for tokens and shows dashboard
...
...              Uses Robot Framework Browser library (Playwright wrapper)

Library          Browser
Library          RequestsLibrary
Resource         ../resources/setup/suite_setup.robot

Suite Setup      Browser OAuth Suite Setup
Suite Teardown   Browser OAuth Suite Teardown

*** Variables ***
${BROWSER}               chromium
${HEADLESS}              ${FALSE}
${TIMEOUT}               15s
# Dev mode: pauses Playwright Inspector on failure so you can inspect the live DOM
# Run with: robot -v DEV_MODE:true browser/keycloak_oauth.robot
# Or:       pixi run test-robot-browser-dev
${DEV_MODE}              ${FALSE}

*** Test Cases ***
# =============================================================================
# Section 1: OAuth Authorization Code Flow
# =============================================================================

TC-BR-KC-001: Login via Keycloak OAuth Flow
    [Documentation]    Complete OAuth authorization code flow via browser
    ...
    ...                GIVEN: App login page shows Keycloak sign-in button
    ...                WHEN: User clicks sign-in and authenticates on Keycloak
    ...                THEN: Redirected back to app dashboard
    [Tags]    browser    keycloak    oauth    auth-code
    [Setup]    Fresh Browser Context
    [Teardown]    Test Teardown

    Navigate To Login And Wait For Settings

    Wait For Elements State    id=username    visible    timeout=${TIMEOUT}
    Fill Text    id=username    ${KEYCLOAK_TEST_EMAIL}
    Fill Text    id=password    ${KEYCLOAK_TEST_PASSWORD}
    Click    id=kc-login

    Wait For Elements State    css=[data-testid="layout-container"]    visible    timeout=${TIMEOUT}

    Log    ✅ OAuth login flow completed successfully

TC-BR-KC-002: Invalid Credentials Show Keycloak Error
    [Documentation]    Wrong password shows error on Keycloak login page
    ...
    ...                GIVEN: App login page is shown
    ...                WHEN: User enters wrong credentials on Keycloak
    ...                THEN: Keycloak shows error message
    [Tags]    browser    keycloak    oauth    negative
    [Setup]    Fresh Browser Context
    [Teardown]    Test Teardown

    Navigate To Login And Wait For Settings

    Wait For Elements State    id=username    visible    timeout=${TIMEOUT}
    Fill Text    id=username    invalid@example.com
    Fill Text    id=password    wrongpassword
    Click    id=kc-login

    Wait For Elements State    css=.kc-feedback-text    visible    timeout=${TIMEOUT}

    Log    ✅ Invalid credentials correctly rejected by Keycloak

TC-BR-KC-003: Logout Clears Session
    [Documentation]    Logout invalidates session and returns to login page
    ...
    ...                GIVEN: User is logged in
    ...                WHEN: User clicks logout
    ...                THEN: Returned to login page, session cleared
    [Tags]    browser    keycloak    logout
    [Setup]    Fresh Browser Context
    [Teardown]    Test Teardown

    Navigate To Login And Wait For Settings

    Wait For Elements State    id=username    visible    timeout=${TIMEOUT}
    Fill Text    id=username    ${KEYCLOAK_TEST_EMAIL}
    Fill Text    id=password    ${KEYCLOAK_TEST_PASSWORD}
    Click    id=kc-login

    Wait For Elements State    css=[data-testid="layout-container"]    visible    timeout=${TIMEOUT}

    Click    css=[data-testid="user-menu-btn"]
    Click    css=[data-testid="logout-btn"]

    Wait For Elements State    css=[data-testid="login-page"]    visible    timeout=${TIMEOUT}

    Log    ✅ Logout successful, returned to login page

*** Keywords ***
Navigate To Login And Wait For Settings
    [Documentation]    Navigate to the login page and wait for the settings API response
    ...                before clicking the Keycloak button.
    ...
    ...                Race condition: the app's SettingsContext fetches the Keycloak URL from
    ...                the backend (~250ms). If the login button is clicked before settings load,
    ...                the OAuth flow uses the default Keycloak URL (localhost:8081 = main env)
    ...                instead of the test Keycloak URL (localhost:8181).
    ...                Wait For Network Idle ensures the settings API call completes first.
    New Page    ${WEB_URL}/login
    Wait For Elements State    css=[data-testid="login-button-keycloak"]    visible    timeout=${TIMEOUT}
    Wait For Load State    networkidle    timeout=${TIMEOUT}
    Click    css=[data-testid="login-button-keycloak"]

Browser OAuth Suite Setup
    [Documentation]    Setup Browser library and test environment

    # Start backend + keycloak + frontend containers
    Suite Setup

    # Wait for frontend (not checked by default suite setup)
    Log To Console    → Checking Frontend (${WEB_URL})...
    Wait Until Keyword Succeeds    60s    5s    Check Frontend Ready
    Log To Console    ✓ Frontend ready

    # Initialize RF Browser (Playwright) - context opened per-test via Fresh Browser Context
    New Browser    ${BROWSER}    headless=${HEADLESS}

    Log    ✅ Browser OAuth tests initialized
    Log    Frontend URL: ${WEB_URL}
    Log    Keycloak URL: ${KEYCLOAK_URL}

Test Teardown
    [Documentation]    Shared teardown for all browser tests.
    ...                On failure: logs current URL + page HTML so you can see what was rendered.
    ...                On failure + DEV_MODE=true: pauses Playwright Inspector for live DOM inspection.
    ...                Always: closes the browser context so the next test starts clean.
    Run Keyword If Test Failed    Dump Page State
    Close Context

Dump Page State
    [Documentation]    Log current URL and page source on failure.
    ...                In DEV_MODE: keeps the browser open for 10 minutes so you can
    ...                inspect the live DOM and DevTools before the context closes.
    ...                Press Ctrl+C to abort early.
    ${url}=    Get Url
    Log To Console    ❌ Failed at URL: ${url}
    Log    ❌ Failed at URL: ${url}
    ${source}=    Get Page Source
    Log    Page HTML:\n${source}
    Take Screenshot    filename=${TEST_NAME}-failure
    IF    $DEV_MODE
        Log To Console    \n🔍 DEV_MODE ON — browser is paused for DOM inspection
        Log To Console       URL: ${url}
        Log To Console       Open DevTools in the browser window now
        Log To Console       Sleeping 10min — press Ctrl+C to abort early
        Sleep    600s
    END

Fresh Browser Context
    [Documentation]    Open a clean browser context with no cookies or session storage.
    ...                Each test gets an isolated context so login state never leaks between tests.
    ...                In DEV_MODE, registers Dump Page State as the run-on-failure hook so the
    ...                browser pauses immediately when any Browser keyword fails.
    IF    $DEV_MODE
        Register Keyword To Run On Failure    Dump Page State    scope=Test
    END
    New Context    viewport={'width': 1280, 'height': 720}

Check Frontend Ready
    [Documentation]    Check if the frontend Vite dev server is responding
    Create Session    frontend_check    ${WEB_URL}    verify=False    timeout=5
    ${response}=    GET On Session    frontend_check    /    expected_status=any
    Delete All Sessions
    Should Be Equal As Integers    ${response.status_code}    200

Browser OAuth Suite Teardown
    [Documentation]    Close browser and cleanup

    Close Browser

    Suite Teardown
