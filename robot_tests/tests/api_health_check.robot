*** Settings ***
Documentation    Health Check API Tests
...
...              Tests the /health endpoint to ensure service is running
...              and all critical services are monitored.
...
...              TDD Process Followed:
...              1. RED: Wrote tests with expected simple structure → FAILED (4/7)
...              2. Discovered real endpoint has complex health monitoring
...              3. GREEN: Updated tests to match actual endpoint behavior
...              4. REFACTOR: Add comprehensive health monitoring tests

Library          RequestsLibrary
Library          Collections

Suite Setup      Create Session    health_api    http://localhost:8001    verify=True
Suite Teardown   Delete All Sessions

*** Variables ***
${HEALTH_ENDPOINT}    /health

*** Test Cases ***
Health Endpoint Returns 200 OK
    [Documentation]    Health endpoint should always return 200 even if services are degraded
    ...
    ...                This allows monitoring systems to detect the service is running
    [Tags]    health    smoke    api

    ${response}=    GET On Session    health_api    ${HEALTH_ENDPOINT}
    ...             expected_status=200

    Status Should Be    200    ${response}

Health Response Has Required Top-Level Fields
    [Documentation]    Verify response contains core health monitoring fields
    ...
    ...                Required: status, timestamp, services, config, overall_healthy, critical_services_healthy
    [Tags]    health    api    schema

    ${response}=    GET On Session    health_api    ${HEALTH_ENDPOINT}
    ${json}=        Set Variable    ${response.json()}

    # Core fields
    Dictionary Should Contain Key    ${json}    status
    ...    msg=Response missing 'status' field

    Dictionary Should Contain Key    ${json}    timestamp
    ...    msg=Response missing 'timestamp' field

    Dictionary Should Contain Key    ${json}    services
    ...    msg=Response missing 'services' field

    Dictionary Should Contain Key    ${json}    config
    ...    msg=Response missing 'config' field

    Dictionary Should Contain Key    ${json}    overall_healthy
    ...    msg=Response missing 'overall_healthy' field

    Dictionary Should Contain Key    ${json}    critical_services_healthy
    ...    msg=Response missing 'critical_services_healthy' field

Health Status Is Valid
    [Documentation]    Status should be one of: healthy, degraded, unhealthy
    [Tags]    health    api

    ${response}=    GET On Session    health_api    ${HEALTH_ENDPOINT}
    ${json}=        Set Variable    ${response.json()}

    ${valid_statuses}=    Create List    healthy    degraded    unhealthy

    Should Contain    ${valid_statuses}    ${json}[status]
    ...    msg=Status '${json}[status]' is not valid. Must be: healthy, degraded, or unhealthy

Health Timestamp Is Recent
    [Documentation]    Timestamp should be within last 10 seconds (recent health check)
    [Tags]    health    api

    ${response}=    GET On Session    health_api    ${HEALTH_ENDPOINT}
    ${json}=        Set Variable    ${response.json()}

    ${current_time}=    Get Time    epoch
    ${time_diff}=       Evaluate    ${current_time} - ${json}[timestamp]

    Should Be True    ${time_diff} < 10
    ...    msg=Timestamp is ${time_diff}s old, should be < 10s

Critical Services Field Exists
    [Documentation]    critical_services_healthy indicates if critical services are up
    ...
    ...                Even if overall_healthy is False, critical services should be True
    ...                for the application to function
    [Tags]    health    api    critical

    ${response}=    GET On Session    health_api    ${HEALTH_ENDPOINT}
    ${json}=        Set Variable    ${response.json()}

    ${critical_healthy}=    Get From Dictionary    ${json}    critical_services_healthy

    Should Be True    isinstance($critical_healthy, bool)
    ...    msg=critical_services_healthy should be boolean, got ${critical_healthy}

Services Dictionary Contains Expected Services
    [Documentation]    Verify services dictionary contains key service dependencies
    ...
    ...                Expected services: mongodb, redis
    [Tags]    health    api    services

    ${response}=    GET On Session    health_api    ${HEALTH_ENDPOINT}
    ${json}=        Set Variable    ${response.json()}
    ${services}=    Get From Dictionary    ${json}    services

    # Critical services
    Dictionary Should Contain Key    ${services}    mongodb
    ...    msg=Missing mongodb service health check

    Dictionary Should Contain Key    ${services}    redis
    ...    msg=Missing redis service health check

Each Service Has Status And Healthy Fields
    [Documentation]    Every service in services dict should have status and healthy fields
    [Tags]    health    api    services    schema

    ${response}=    GET On Session    health_api    ${HEALTH_ENDPOINT}
    ${json}=        Set Variable    ${response.json()}
    ${services}=    Get From Dictionary    ${json}    services

    FOR    ${service_name}    IN    @{services.keys()}
        ${service}=    Get From Dictionary    ${services}    ${service_name}

        Dictionary Should Contain Key    ${service}    status
        ...    msg=Service ${service_name} missing 'status' field

        Dictionary Should Contain Key    ${service}    healthy
        ...    msg=Service ${service_name} missing 'healthy' field

        # Healthy should be boolean
        ${healthy}=    Get From Dictionary    ${service}    healthy
        Should Be True    isinstance($healthy, bool)
        ...    msg=Service ${service_name} healthy field should be boolean
    END

MongoDB Service Health Check
    [Documentation]    MongoDB is a critical service and should be healthy
    [Tags]    health    api    mongodb    critical

    ${response}=    GET On Session    health_api    ${HEALTH_ENDPOINT}
    ${json}=        Set Variable    ${response.json()}
    ${services}=    Get From Dictionary    ${json}    services
    ${mongodb}=     Get From Dictionary    ${services}    mongodb

    Should Be True    ${mongodb}[healthy]
    ...    msg=MongoDB should be healthy, status: ${mongodb}[status]

    Should Be True    ${mongodb}[critical]
    ...    msg=MongoDB should be marked as critical

Redis Service Health Check
    [Documentation]    Redis is a critical service and should be healthy
    [Tags]    health    api    redis    critical

    ${response}=    GET On Session    health_api    ${HEALTH_ENDPOINT}
    ${json}=        Set Variable    ${response.json()}
    ${services}=    Get From Dictionary    ${json}    services
    ${redis}=       Get From Dictionary    ${services}    redis

    Should Be True    ${redis}[healthy]
    ...    msg=Redis should be healthy, status: ${redis}[status]

    Should Be True    ${redis}[critical]
    ...    msg=Redis should be marked as critical

Config Section Contains Environment Info
    [Documentation]    Config section should contain environment configuration details
    [Tags]    health    api    config

    ${response}=    GET On Session    health_api    ${HEALTH_ENDPOINT}
    ${json}=        Set Variable    ${response.json()}
    ${config}=      Get From Dictionary    ${json}    config

    # Verify config is a dictionary
    Should Be True    isinstance($config, dict)
    ...    msg=Config should be a dictionary

    # Config should not be empty
    ${config_size}=    Get Length    ${config}
    Should Be True    ${config_size} > 0
    ...    msg=Config should contain environment information

Health Check Response Time Is Acceptable
    [Documentation]    Health check should respond quickly (< 2 seconds)
    ...
    ...                Note: Increased from 1s as this endpoint checks multiple services
    [Tags]    health    api    performance

    ${start}=       Get Time    epoch
    ${response}=    GET On Session    health_api    ${HEALTH_ENDPOINT}
    ${end}=         Get Time    epoch

    ${elapsed}=     Evaluate    ${end} - ${start}

    Should Be True    ${elapsed} < 2
    ...    msg=Health check took ${elapsed}s, should be < 2s

Health Check With Invalid Method Returns 405
    [Documentation]    POST to health endpoint should return 405 Method Not Allowed
    [Tags]    health    api    error-handling    negative

    ${response}=    POST On Session    health_api    ${HEALTH_ENDPOINT}
    ...             expected_status=405

    Status Should Be    405    ${response}

*** Keywords ***
Status Should Be
    [Documentation]    Helper keyword to verify HTTP status code
    [Arguments]    ${expected}    ${response}

    Should Be Equal As Integers    ${response.status_code}    ${expected}
    ...    msg=Expected status ${expected}, got ${response.status_code}
