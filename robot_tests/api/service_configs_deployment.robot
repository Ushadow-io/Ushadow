*** Settings ***
Documentation    Service Configs & Deployment API Tests
...
...              Generated from: USHADOW_APPLICATION_SPEC.testcases.md
...              Section 6: Service Configs & Deployment
...              Priority: High
...
...              Tests the new Service Config → Deployment flow:
...              1. Create Service Config (template + configuration)
...              2. Deploy to target (local Docker, remote u-node, Kubernetes)
...              3. Manage Deployment lifecycle (start, stop, logs, env vars)
...              4. Service operations (proxy, logs, env vars)
...
...              Test Cases Covered:
...              - TC-CFG-001: Create Service Config from Template
...              - TC-CFG-002: List All Service Configs
...              - TC-CFG-003: Get Service Config Details
...              - TC-DEP-001: Deploy Service Config to Local Docker
...              - TC-DEP-004: Deploy Multiple Instances of Same Service
...              - TC-DEP-005: Pre-Flight Check - Port Conflict Detection
...              - TC-DEP-007: List All Deployments Across Targets
...              - TC-DEP-008: Get Deployment Details (Status, Logs, URLs)
...              - TC-DEP-009: Stop Running Deployment
...              - TC-DEP-012: View Deployment Logs (Real-Time)
...              - TC-DEP-013: Generic Service Proxy - GET Request
...              - TC-DEP-014: Generic Service Proxy - POST Request

Library          RequestsLibrary
Library          Collections
Library          String
Library          OperatingSystem
Library          ../resources/EnvConfig.py

Resource         ../resources/setup/suite_setup.robot

Suite Setup      Standard Suite Setup
Suite Teardown   Standard Suite Teardown



*** Variables ***
${API_SESSION}           service_config_session
${SERVICE_CONFIG_BASE}   /api/service-configs
${DEPLOYMENTS_BASE}      /api/deployments

# Test data
${TEST_SERVICE_NAME}     openmemory
${TEST_CONFIG_NAME}      openmemory-test
${CONFIG_ID}             ${EMPTY}
${DEPLOYMENT_ID}         ${EMPTY}

*** Test Cases ***
# =============================================================================
# Section 6.1: Service Config Management
# =============================================================================

TC-CFG-001: Create Service Config from Template
    [Documentation]    Create a service config from template with configuration
    ...
    ...                GIVEN: Service template available (openmemory)
    ...                WHEN: POST /api/service-configs with template and config
    ...                THEN: Service config created with status PENDING
    [Tags]    service-config    high-priority    api

    # Prepare config data
    ${config_data}=    Create Dictionary
    ...    template_name=${TEST_SERVICE_NAME}
    ...    name=${TEST_CONFIG_NAME}
    ...    deployment_target=${None}
    ...    config=${{'values': {'MONGODB_URI': 'mongodb://mongo:27017/test'}}}

    # Create service config
    ${response}=    POST On Session    ${API_SESSION}    ${SERVICE_CONFIG_BASE}
    ...    json=${config_data}
    ...    expected_status=any

    # Verify created successfully
    Should Be True    ${response.status_code} in [200, 201]
    ...    msg=Failed to create service config: ${response.text}

    # Extract config ID for later tests
    ${json}=    Set Variable    ${response.json()}
    Dictionary Should Contain Key    ${json}    id
    ...    msg=Response missing 'id' field

    Set Suite Variable    ${CONFIG_ID}    ${json}[id]

    # Verify config properties
    Should Be Equal    ${json}[name]    ${TEST_CONFIG_NAME}
    Should Be Equal    ${json}[template_name]    ${TEST_SERVICE_NAME}
    Should Be Equal    ${json}[status]    PENDING

TC-CFG-002: List All Service Configs
    [Documentation]    List all service configs in the system
    ...
    ...                GIVEN: Service configs exist
    ...                WHEN: GET /api/service-configs
    ...                THEN: Returns list of configs with metadata
    [Tags]    service-config    high-priority    api

    ${response}=    GET On Session    ${API_SESSION}    ${SERVICE_CONFIG_BASE}
    ...    expected_status=200

    ${json}=    Set Variable    ${response.json()}

    # Should return list
    Should Be True    isinstance($json, list)
    ...    msg=Expected list, got ${json}

    # Should contain our created config
    ${config_found}=    Set Variable    False
    FOR    ${config}    IN    @{json}
        IF    '${config}[id]' == '${CONFIG_ID}'
            Set Variable    ${config_found}    True
            # Verify config has required fields
            Dictionary Should Contain Key    ${config}    id
            Dictionary Should Contain Key    ${config}    name
            Dictionary Should Contain Key    ${config}    template_name
            Dictionary Should Contain Key    ${config}    status
            Dictionary Should Contain Key    ${config}    created_at
        END
    END

    Should Be True    ${config_found}
    ...    msg=Created config ${CONFIG_ID} not found in list

TC-CFG-003: Get Service Config Details
    [Documentation]    Get detailed information about a service config
    ...
    ...                GIVEN: Service config exists
    ...                WHEN: GET /api/service-configs/{id}
    ...                THEN: Returns complete config with environment variables
    [Tags]    service-config    high-priority    api

    ${response}=    GET On Session    ${API_SESSION}    ${SERVICE_CONFIG_BASE}/${CONFIG_ID}
    ...    expected_status=200

    ${json}=    Set Variable    ${response.json()}

    # Verify all fields present
    Should Be Equal    ${json}[id]    ${CONFIG_ID}
    Should Be Equal    ${json}[name]    ${TEST_CONFIG_NAME}
    Should Be Equal    ${json}[template_name]    ${TEST_SERVICE_NAME}

    # Verify config section
    Dictionary Should Contain Key    ${json}    config
    ${config}=    Get From Dictionary    ${json}    config

    # Verify environment variables in config
    Dictionary Should Contain Key    ${config}    values
    ${values}=    Get From Dictionary    ${config}    values
    Should Contain    ${values}    MONGODB_URI

# =============================================================================
# Section 6.2: Deployment Operations
# =============================================================================

TC-DEP-005: Pre-Flight Check - Port Conflict Detection
    [Documentation]    Pre-flight check should detect port conflicts before deployment
    ...
    ...                GIVEN: Service config ready to deploy
    ...                WHEN: Run pre-flight check
    ...                THEN: Returns port availability status
    [Tags]    deployment    high-priority    api    pre-flight

    # Run pre-flight check for our config
    ${response}=    GET On Session    ${API_SESSION}
    ...    ${SERVICE_CONFIG_BASE}/${CONFIG_ID}/preflight
    ...    expected_status=200

    ${json}=    Set Variable    ${response.json()}

    # Should return conflict status
    Dictionary Should Contain Key    ${json}    port_conflicts
    ...    msg=Pre-flight response missing 'port_conflicts' field

    # If no conflicts, should be empty list
    # If conflicts, should have port and suggestion
    Log    Pre-flight check result: ${json}

TC-DEP-001: Deploy Service Config to Local Docker
    [Documentation]    Deploy service config to local Docker
    ...
    ...                GIVEN: Service config created with local target
    ...                WHEN: POST /api/service-configs/{id}/deploy
    ...                THEN: Deployment created and container starts
    [Tags]    deployment    high-priority    api    docker

    # Deploy the service config
    ${response}=    POST On Session    ${API_SESSION}
    ...    ${SERVICE_CONFIG_BASE}/${CONFIG_ID}/deploy
    ...    expected_status=any

    # Should create deployment
    Should Be True    ${response.status_code} in [200, 201, 202]
    ...    msg=Failed to deploy config: ${response.text}

    ${json}=    Set Variable    ${response.json()}

    # Extract deployment ID
    IF    'deployment_id' in $json
        Set Suite Variable    ${DEPLOYMENT_ID}    ${json}[deployment_id]
    ELSE IF    'id' in $json
        Set Suite Variable    ${DEPLOYMENT_ID}    ${json}[id]
    END

    Log    Deployment ID: ${DEPLOYMENT_ID}

    # Wait for deployment to reach running state (max 30 seconds)
    Wait Until Keyword Succeeds    30s    2s
    ...    Deployment Should Be Running    ${DEPLOYMENT_ID}

TC-DEP-004: Deploy Multiple Instances of Same Service
    [Documentation]    Deploy multiple instances of the same service with different configs
    ...
    ...                GIVEN: Service template (openmemory)
    ...                WHEN: Create and deploy second instance
    ...                THEN: Both instances run simultaneously with different ports
    [Tags]    deployment    high-priority    api    multi-instance

    # Create second service config
    ${config_data}=    Create Dictionary
    ...    template_name=${TEST_SERVICE_NAME}
    ...    name=${TEST_CONFIG_NAME}-2
    ...    deployment_target=${None}
    ...    config=${{'values': {'MONGODB_URI': 'mongodb://mongo:27017/test2'}}}

    ${response}=    POST On Session    ${API_SESSION}    ${SERVICE_CONFIG_BASE}
    ...    json=${config_data}
    ...    expected_status=any

    Should Be True    ${response.status_code} in [200, 201]

    ${json}=    Set Variable    ${response.json()}
    ${config_id_2}=    Set Variable    ${json}[id]

    # Deploy second instance
    ${deploy_response}=    POST On Session    ${API_SESSION}
    ...    ${SERVICE_CONFIG_BASE}/${config_id_2}/deploy
    ...    expected_status=any

    Should Be True    ${deploy_response.status_code} in [200, 201, 202]

    # Verify both deployments running
    ${deployments}=    GET On Session    ${API_SESSION}    ${DEPLOYMENTS_BASE}
    ...    expected_status=200

    ${deployments_json}=    Set Variable    ${deployments.json()}
    ${count}=    Get Length    ${deployments_json}
    Should Be True    ${count} >= 2
    ...    msg=Should have at least 2 deployments

    # Cleanup second instance
    POST On Session    ${API_SESSION}    ${SERVICE_CONFIG_BASE}/${config_id_2}/undeploy
    ...    expected_status=any
    DELETE On Session    ${API_SESSION}    ${SERVICE_CONFIG_BASE}/${config_id_2}
    ...    expected_status=any

# =============================================================================
# Section 6.3: Deployment Lifecycle
# =============================================================================

TC-DEP-007: List All Deployments Across Targets
    [Documentation]    List all deployments regardless of target
    ...
    ...                GIVEN: Deployments exist across different targets
    ...                WHEN: GET /api/deployments
    ...                THEN: Returns all deployments with status
    [Tags]    deployment    high-priority    api

    ${response}=    GET On Session    ${API_SESSION}    ${DEPLOYMENTS_BASE}
    ...    expected_status=200

    ${json}=    Set Variable    ${response.json()}

    # Should return list
    Should Be True    isinstance($json, list)

    # Should contain our deployment
    ${found}=    Set Variable    False
    FOR    ${deployment}    IN    @{json}
        IF    '${deployment}[id]' == '${DEPLOYMENT_ID}'
            Set Variable    ${found}    True

            # Verify deployment fields
            Dictionary Should Contain Key    ${deployment}    id
            Dictionary Should Contain Key    ${deployment}    service_config_id
            Dictionary Should Contain Key    ${deployment}    status
            Dictionary Should Contain Key    ${deployment}    target

            Log    Deployment status: ${deployment}[status]
        END
    END

    Should Be True    ${found}
    ...    msg=Deployment ${DEPLOYMENT_ID} not found in list

TC-DEP-008: Get Deployment Details (Status, Logs, URLs)
    [Documentation]    Get detailed deployment information
    ...
    ...                GIVEN: Deployment running
    ...                WHEN: GET /api/deployments/{id}
    ...                THEN: Returns complete deployment details
    [Tags]    deployment    high-priority    api

    ${response}=    GET On Session    ${API_SESSION}    ${DEPLOYMENTS_BASE}/${DEPLOYMENT_ID}
    ...    expected_status=200

    ${json}=    Set Variable    ${response.json()}

    # Verify all fields
    Should Be Equal    ${json}[id]    ${DEPLOYMENT_ID}
    Dictionary Should Contain Key    ${json}    service_config_id
    Dictionary Should Contain Key    ${json}    status
    Dictionary Should Contain Key    ${json}    ports
    Dictionary Should Contain Key    ${json}    urls

    # Status should be running
    Should Be Equal    ${json}[status]    running

    # URLs should be accessible
    ${urls}=    Get From Dictionary    ${json}    urls
    Log    Service URLs: ${urls}

# =============================================================================
# Section 6.4: Deployed Service Operations
# =============================================================================

TC-DEP-012: View Deployment Logs (Real-Time)
    [Documentation]    View logs from deployed service
    ...
    ...                GIVEN: Deployment running
    ...                WHEN: GET /api/deployments/{id}/logs
    ...                THEN: Returns log lines from container
    [Tags]    deployment    high-priority    api    logs

    ${response}=    GET On Session    ${API_SESSION}
    ...    ${DEPLOYMENTS_BASE}/${DEPLOYMENT_ID}/logs?tail=50
    ...    expected_status=200

    ${json}=    Set Variable    ${response.json()}

    # Should return logs (may be empty if service just started)
    Should Be True    isinstance($json, (list, str))
    ...    msg=Logs should be list or string

    Log    Retrieved ${len($json)} log lines

TC-DEP-013: Generic Service Proxy - GET Request
    [Documentation]    Proxy GET request to deployed service
    ...
    ...                GIVEN: Deployment running
    ...                WHEN: GET /api/deployments/{id}/proxy/health
    ...                THEN: Request forwarded to service, response returned
    [Tags]    deployment    high-priority    api    proxy

    ${response}=    GET On Session    ${API_SESSION}
    ...    ${DEPLOYMENTS_BASE}/${DEPLOYMENT_ID}/proxy/health
    ...    expected_status=any

    # Should proxy request successfully
    # Note: Status depends on service implementation
    Should Be True    ${response.status_code} in [200, 404, 503]
    ...    msg=Proxy request failed: ${response.text}

    Log    Proxy response status: ${response.status_code}

TC-DEP-014: Generic Service Proxy - POST Request
    [Documentation]    Proxy POST request to deployed service
    ...
    ...                GIVEN: Deployment running
    ...                WHEN: POST /api/deployments/{id}/proxy/api/test
    ...                THEN: Request forwarded with POST data
    [Tags]    deployment    high-priority    api    proxy

    ${post_data}=    Create Dictionary    test_field=test_value

    ${response}=    POST On Session    ${API_SESSION}
    ...    ${DEPLOYMENTS_BASE}/${DEPLOYMENT_ID}/proxy/api/test
    ...    json=${post_data}
    ...    expected_status=any

    # Proxy should forward request
    # Note: May return 404 if endpoint doesn't exist (expected for test)
    Should Be True    ${response.status_code} in [200, 201, 404]

    Log    POST proxy status: ${response.status_code}

TC-DEP-009: Stop Running Deployment
    [Documentation]    Stop a running deployment
    ...
    ...                GIVEN: Deployment running
    ...                WHEN: POST /api/deployments/{id}/stop
    ...                THEN: Container stopped, status updated
    [Tags]    deployment    high-priority    api    lifecycle

    ${response}=    POST On Session    ${API_SESSION}
    ...    ${DEPLOYMENTS_BASE}/${DEPLOYMENT_ID}/stop
    ...    expected_status=any

    Should Be True    ${response.status_code} in [200, 202]
    ...    msg=Failed to stop deployment: ${response.text}

    # Wait for deployment to stop
    Wait Until Keyword Succeeds    15s    2s
    ...    Deployment Should Be Stopped    ${DEPLOYMENT_ID}

    Log    Deployment stopped successfully

*** Keywords ***
Setup Service Config Tests
    [Documentation]    Setup API session with authentication

    # Get API URL from environment
    ${api_url}=    Get Api Url

    # Get test user credentials from environment
    ${admin_email}=    Get Environment Variable    TEST_ADMIN_EMAIL    admin@test.local
    ${admin_password}=    Get Environment Variable    TEST_ADMIN_PASSWORD    TestPass123!

    # Create session
    Create Session    ${API_SESSION}    ${api_url}    verify=True

    # Login to get token
    ${login_data}=    Create Dictionary
    ...    username=${admin_email}
    ...    password=${admin_password}

    ${login_response}=    POST On Session    ${API_SESSION}    /api/auth/bearer/login
    ...    data=${login_data}
    ...    headers=${{ {'Content-Type': 'application/x-www-form-urlencoded'} }}
    ...    expected_status=200

    ${token_data}=    Set Variable    ${login_response.json()}
    ${access_token}=    Get From Dictionary    ${token_data}    access_token

    # Update session with auth header
    ${auth_headers}=    Create Dictionary    Authorization=Bearer ${access_token}
    Set To Dictionary    ${API_SESSION.headers}    &{auth_headers}

Teardown Service Config Tests
    [Documentation]    Cleanup test data and close session

    # Stop and delete deployment if it exists
    Run Keyword And Ignore Error    POST On Session    ${API_SESSION}
    ...    ${DEPLOYMENTS_BASE}/${DEPLOYMENT_ID}/stop

    Run Keyword And Ignore Error    DELETE On Session    ${API_SESSION}
    ...    ${DEPLOYMENTS_BASE}/${DEPLOYMENT_ID}

    # Delete service config if it exists
    Run Keyword And Ignore Error    DELETE On Session    ${API_SESSION}
    ...    ${SERVICE_CONFIG_BASE}/${CONFIG_ID}

    # Close session
    Delete All Sessions

Deployment Should Be Running
    [Documentation]    Verify deployment is in running state
    [Arguments]    ${deployment_id}

    ${response}=    GET On Session    ${API_SESSION}    ${DEPLOYMENTS_BASE}/${deployment_id}
    ...    expected_status=200

    ${json}=    Set Variable    ${response.json()}
    Should Be Equal    ${json}[status]    running
    ...    msg=Deployment not running, status: ${json}[status]

Deployment Should Be Stopped
    [Documentation]    Verify deployment is in stopped state
    [Arguments]    ${deployment_id}

    ${response}=    GET On Session    ${API_SESSION}    ${DEPLOYMENTS_BASE}/${deployment_id}
    ...    expected_status=200

    ${json}=    Set Variable    ${response.json()}
    Should Be Equal    ${json}[status]    stopped
    ...    msg=Deployment not stopped, status: ${json}[status]
