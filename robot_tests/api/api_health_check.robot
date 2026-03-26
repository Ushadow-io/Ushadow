*** Settings ***
Documentation    Health Check API Tests
...
...              Three tests covering the full environment signal:
...              1. Backend Smoke — /health returns 200 and MongoDB/Redis are healthy
...              2. Casdoor Reachable — auth service is up (backend /health doesn't check this)
...              3. Response Schema — field types and per-service structure

Library          RequestsLibrary
Library          Collections

Resource         ../resources/setup/suite_setup.robot

Suite Setup      Run Keywords
...              Standard Suite Setup    AND
...              Create Session    ${SESSION}          ${BACKEND_URL}    verify=True     timeout=10    AND
...              Create Session    ${CASDOOR_SESSION}  ${CASDOOR_URL}    verify=False    timeout=10
Suite Teardown   Standard Suite Teardown

*** Variables ***
${HEALTH_ENDPOINT}      /health
${SESSION}              health_session
${CASDOOR_SESSION}      casdoor_health_session
@{VALID_STATUSES}       healthy    degraded    unhealthy

*** Test Cases ***
Backend Health - Critical Services Up
    [Documentation]    Core health signal: backend is up and MongoDB/Redis are healthy.
    ...
    ...                GIVEN: Test containers are running
    ...                WHEN: GET /health
    ...                THEN: 200 OK and critical_services_healthy=True
    ...
    ...                Fail here means MongoDB or Redis is down — environment not usable.
    [Tags]    health    smoke    api    quick

    ${response}=    GET On Session    ${SESSION}    ${HEALTH_ENDPOINT}
    ...             expected_status=200

    ${json}=    Set Variable    ${response.json()}

    # MongoDB and Redis must be healthy for the environment to be usable
    Should Be True    ${json}[critical_services_healthy]
    ...    msg=Critical services not healthy: ${json}[services]

Casdoor Health - Auth Service Reachable
    [Documentation]    Verify the Casdoor auth service is up and responding.
    ...
    ...                GIVEN: Casdoor container is running (${CASDOOR_URL})
    ...                WHEN: GET /api/health on Casdoor
    ...                THEN: 200 OK with status "ok"
    ...
    ...                The backend /health endpoint does NOT check Casdoor.
    ...                Without Casdoor, login is broken even if backend reports healthy.
    [Tags]    health    smoke    api    quick    casdoor

    # Casdoor exposes its own health endpoint
    ${response}=    GET On Session    ${CASDOOR_SESSION}    /api/health
    ...             expected_status=200

    ${json}=    Set Variable    ${response.json()}

    Should Be Equal As Strings    ${json}[status]    ok
    ...    msg=Casdoor health check failed: ${json}

Backend Health - Response Schema
    [Documentation]    Validate health response structure, field types, and per-service fields.
    ...
    ...                GIVEN: Health endpoint reachable
    ...                WHEN: GET /health
    ...                THEN: All required fields present with correct types
    ...
    ...                Checks: required top-level fields, valid status enum, recent timestamp,
    ...                non-empty config section, and status/healthy fields on every service.
    [Tags]    health    api    schema

    ${response}=    GET On Session    ${SESSION}    ${HEALTH_ENDPOINT}
    ${json}=        Set Variable    ${response.json()}

    # All required top-level fields must be present
    FOR    ${field}    IN    status    timestamp    services    config    overall_healthy    critical_services_healthy
        Dictionary Should Contain Key    ${json}    ${field}
        ...    msg=Response missing '${field}' field
    END

    # Status must be a known value
    Should Contain    ${VALID_STATUSES}    ${json}[status]
    ...    msg=Status '${json}[status]' not valid — expected one of: ${VALID_STATUSES}

    # Timestamp must be recent (generated at request time, not stale)
    ${now}=         Get Time    epoch
    ${age}=         Evaluate    ${now} - ${json}[timestamp]
    Should Be True    ${age} < 10
    ...    msg=Timestamp is ${age}s old — should be < 10s (is health check caching?)

    # Config section must not be empty
    ${config_size}=    Get Length    ${json}[config]
    Should Be True    ${config_size} > 0
    ...    msg=Config section is empty — expected environment info

    # Every service entry must have status (str) and healthy (bool)
    ${services}=    Get From Dictionary    ${json}    services
    FOR    ${name}    IN    @{services.keys()}
        ${svc}=    Get From Dictionary    ${services}    ${name}
        Dictionary Should Contain Key    ${svc}    status
        ...    msg=Service '${name}' missing 'status' field
        Dictionary Should Contain Key    ${svc}    healthy
        ...    msg=Service '${name}' missing 'healthy' field
        Should Be True    isinstance($svc['healthy'], bool)
        ...    msg=Service '${name}' healthy field should be bool, got: ${svc}[healthy]
    END

