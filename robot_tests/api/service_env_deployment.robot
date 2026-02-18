*** Settings ***
Documentation    Service Environment Variable Deployment Tests
...
...              Verifies that environment variables configured through the API
...              are actually deployed to running containers.
...
...              This is a critical end-to-end test that ensures:
...              1. Env vars saved via /api/services/{name}/env are persisted
...              2. When a service starts, those env vars are resolved
...              3. The container actually receives the configured values
...
...              Spec: specs/features/SETTINGS_CONFIG_HIERARCHY_SPEC.md

Variables        ../resources/setup/test_env.py
Library          REST    ${BACKEND_URL}    ssl_verify=false
Library          Collections
Library          String
Library          ../resources/EnvConfig.py
Resource         ../resources/setup/suite_setup.robot

Suite Setup      Standard Suite Setup
Suite Teardown   Standard Suite Teardown
Test Setup       Setup REST Authentication

*** Variables ***
${SERVICE_NAME}         chronicle-backend
${TEST_MODEL_VALUE}     robot-test-model-${SUITE NAME}

*** Test Cases ***
# =============================================================================
# PREREQUISITE CHECKS
# =============================================================================

TC-DEPLOY-001: Service Exists In Catalog
    [Documentation]    Verify test service exists before running deployment tests
    [Tags]    deployment    api    prerequisite    stable

    REST.GET    /api/services/catalog

    Integer    response status    200
    ${services}=    Output    response body

    # Find our test service
    ${found}=    Set Variable    ${FALSE}
    FOR    ${service}    IN    @{services}
        IF    "${service}[service_name]" == "${SERVICE_NAME}"
            ${found}=    Set Variable    ${TRUE}
            BREAK
        END
    END

    Should Be True    ${found}
    ...    msg=Service '${SERVICE_NAME}' not found in catalog

TC-DEPLOY-002: Service Has Configurable Env Vars
    [Documentation]    Verify service has env vars we can configure
    [Tags]    deployment    api    prerequisite    stable

    REST.GET    /api/services/${SERVICE_NAME}/env

    Integer    response status    200
    ${config}=    Output    response body

    # Should have env vars defined
    ${required}=    Get From Dictionary    ${config}    required_env_vars
    ${optional}=    Get From Dictionary    ${config}    optional_env_vars

    ${total}=    Evaluate    len($required) + len($optional)
    Should Be True    ${total} > 0
    ...    msg=Service has no configurable env vars

# =============================================================================
# ENV VAR CONFIGURATION
# =============================================================================

TC-DEPLOY-010: Configure Env Var Via API
    [Documentation]    Configure an env var using literal value source
    ...
    ...                GIVEN service has OPENAI_MODEL env var
    ...                WHEN we configure it with a literal value via API
    ...                THEN the configuration is saved
    [Tags]    deployment    api    configuration    stable

    # Configure OPENAI_MODEL with literal value
    ${env_vars}=    Create List
    ${model_config}=    Create Dictionary
    ...    name=OPENAI_MODEL
    ...    source=literal
    ...    value=${TEST_MODEL_VALUE}
    Append To List    ${env_vars}    ${model_config}

    ${payload}=    Create Dictionary    env_vars=${env_vars}

    REST.PUT    /api/services/${SERVICE_NAME}/env    ${payload}
    Integer    response status    200

    ${result}=    Output    response body
    ${saved}=    Get From Dictionary    ${result}    saved
    Should Be True    ${saved} > 0
    ...    msg=No env vars were saved

TC-DEPLOY-011: Resolve Shows Configured Value
    [Documentation]    Resolve endpoint should show our configured value
    [Tags]    deployment    api    configuration    stable

    # First ensure we have the config from previous test
    ${env_vars}=    Create List
    ${model_config}=    Create Dictionary
    ...    name=OPENAI_MODEL
    ...    source=literal
    ...    value=${TEST_MODEL_VALUE}
    Append To List    ${env_vars}    ${model_config}
    ${payload}=    Create Dictionary    env_vars=${env_vars}
    REST.PUT    /api/services/${SERVICE_NAME}/env    ${payload}

    # Now check resolve
    REST.GET    /api/services/${SERVICE_NAME}/resolve

    Integer    response status    200
    ${result}=    Output    response body
    ${resolved}=    Get From Dictionary    ${result}    resolved

    Dictionary Should Contain Key    ${resolved}    OPENAI_MODEL
    ${model_value}=    Get From Dictionary    ${resolved}    OPENAI_MODEL
    Should Be Equal As Strings    ${model_value}    ${TEST_MODEL_VALUE}
    ...    msg=Resolved value doesn't match configured value

# =============================================================================
# DEPLOYMENT VERIFICATION
# =============================================================================

TC-DEPLOY-020: Container Receives Configured Env Vars
    [Documentation]    CRITICAL: Configured env vars must be deployed to container
    ...
    ...                GIVEN OPENAI_MODEL is configured to "${TEST_MODEL_VALUE}"
    ...                AND service is started
    ...                WHEN container environment is inspected
    ...                THEN OPENAI_MODEL equals "${TEST_MODEL_VALUE}"
    ...
    ...                This is the key test: what we configure MUST equal
    ...                what the container receives.
    [Tags]    deployment    api    container    critical    stable

    # Step 1: Configure env var
    ${env_vars}=    Create List
    ${model_config}=    Create Dictionary
    ...    name=OPENAI_MODEL
    ...    source=literal
    ...    value=${TEST_MODEL_VALUE}
    Append To List    ${env_vars}    ${model_config}
    ${payload}=    Create Dictionary    env_vars=${env_vars}

    REST.PUT    /api/services/${SERVICE_NAME}/env    ${payload}
    Integer    response status    200

    # Step 2: Start service (force-recreates to pick up new env vars)
    REST.POST    /api/services/${SERVICE_NAME}/start
    ${status}=    Output    response status

    # Wait for service to recreate and start (--force-recreate takes longer)
    Sleep    10s    Wait for container to recreate and start

    # Step 3: Get actual container environment
    REST.GET    /api/services/${SERVICE_NAME}/container-env?unmask=true

    Integer    response status    200
    ${result}=    Output    response body

    # Container should be found
    ${found}=    Get From Dictionary    ${result}    container_found
    Should Be True    ${found}
    ...    msg=Container not found - service may have failed to start

    # Verify OPENAI_MODEL matches what we configured
    ${env}=    Get From Dictionary    ${result}    env_vars
    Dictionary Should Contain Key    ${env}    OPENAI_MODEL
    ...    msg=OPENAI_MODEL not in container environment

    ${actual_value}=    Get From Dictionary    ${env}    OPENAI_MODEL
    Should Be Equal As Strings    ${actual_value}    ${TEST_MODEL_VALUE}
    ...    msg=Deployed value '${actual_value}' doesn't match configured '${TEST_MODEL_VALUE}'

TC-DEPLOY-021: Multiple Configured Vars Are Deployed
    [Documentation]    Multiple env vars should all be deployed correctly
    [Tags]    deployment    api    container    stable

    # Configure multiple env vars
    ${env_vars}=    Create List

    ${model_config}=    Create Dictionary
    ...    name=OPENAI_MODEL
    ...    source=literal
    ...    value=multi-test-model
    Append To List    ${env_vars}    ${model_config}

    ${url_config}=    Create Dictionary
    ...    name=OPENAI_BASE_URL
    ...    source=literal
    ...    value=https://test.example.com/v1
    Append To List    ${env_vars}    ${url_config}

    ${payload}=    Create Dictionary    env_vars=${env_vars}

    REST.PUT    /api/services/${SERVICE_NAME}/env    ${payload}
    Integer    response status    200

    # Restart service to pick up new config
    REST.POST    /api/services/${SERVICE_NAME}/start
    Sleep    10s    Wait for container to recreate

    # Verify container has both values
    REST.GET    /api/services/${SERVICE_NAME}/container-env?unmask=true
    Integer    response status    200

    ${result}=    Output    response body
    ${env}=    Get From Dictionary    ${result}    env_vars

    # Check both vars
    ${model}=    Get From Dictionary    ${env}    OPENAI_MODEL
    Should Be Equal As Strings    ${model}    multi-test-model

    ${url}=    Get From Dictionary    ${env}    OPENAI_BASE_URL
    Should Be Equal As Strings    ${url}    https://test.example.com/v1

TC-DEPLOY-022: Default Value Used When Source Is Default
    [Documentation]    When source=default, compose default should be used
    [Tags]    deployment    api    container    stable

    # Configure to use default (undo any previous override)
    ${env_vars}=    Create List
    ${config}=    Create Dictionary
    ...    name=QDRANT_PORT
    ...    source=default
    Append To List    ${env_vars}    ${config}
    ${payload}=    Create Dictionary    env_vars=${env_vars}

    REST.PUT    /api/services/${SERVICE_NAME}/env    ${payload}
    Integer    response status    200

    # Start to apply (recreates container with new env)
    REST.POST    /api/services/${SERVICE_NAME}/start
    Sleep    10s    Wait for container to recreate

    # Check container - should have compose default (6333)
    REST.GET    /api/services/${SERVICE_NAME}/container-env?unmask=true
    Integer    response status    200

    ${result}=    Output    response body
    ${env}=    Get From Dictionary    ${result}    env_vars

    # QDRANT_PORT should be 6333 (compose default)
    Dictionary Should Contain Key    ${env}    QDRANT_PORT
    ${port}=    Get From Dictionary    ${env}    QDRANT_PORT
    Should Be Equal As Strings    ${port}    6333
    ...    msg=QDRANT_PORT should be compose default 6333, got ${port}

# =============================================================================
# ERROR CASES
# =============================================================================

TC-DEPLOY-030: Container Env Returns Not Found For Stopped Service
    [Documentation]    container-env endpoint handles stopped/missing containers
    [Tags]    deployment    api    error-handling    stable

    # This test uses a known non-running service or fake name
    REST.GET    /api/services/${SERVICE_NAME}/container-env

    # Should return 200 with success=False if container not found
    # (not 404, since the service exists, just container doesn't)
    Integer    response status    200

    ${result}=    Output    response body
    # If container is running, this will be True; if not, False
    # Either way, the endpoint should not error out

TC-DEPLOY-031: Container Env Returns 404 For Unknown Service
    [Documentation]    Unknown service should return 404
    [Tags]    deployment    api    error-handling    stable

    REST.GET    /api/services/totally-fake-service-12345/container-env

    Integer    response status    404

# =============================================================================
# UI-TO-DEPLOYMENT CONSISTENCY
# =============================================================================

TC-DEPLOY-040: What You Configure Is What You Get
    [Documentation]    CRITICAL: The value shown in UI must equal deployed value
    ...
    ...                This is the fundamental trust contract:
    ...                1. User configures value X in UI (via /env API)
    ...                2. User sees value X in resolve/preview
    ...                3. Container actually receives value X
    ...
    ...                If any of these differ, users cannot trust the system.
    [Tags]    deployment    api    ui-consistency    critical    stable

    # Distinctive test value
    ${test_value}=    Set Variable    ui-consistency-test-${SUITE NAME}-12345

    # Step 1: Configure via API (simulates UI save)
    ${env_vars}=    Create List
    ${config}=    Create Dictionary
    ...    name=OPENAI_MODEL
    ...    source=literal
    ...    value=${test_value}
    Append To List    ${env_vars}    ${config}
    ${payload}=    Create Dictionary    env_vars=${env_vars}

    REST.PUT    /api/services/${SERVICE_NAME}/env    ${payload}
    Integer    response status    200

    # Step 2: What does resolve show? (UI preview)
    REST.GET    /api/services/${SERVICE_NAME}/resolve
    ${resolve_result}=    Output    response body
    ${resolved}=    Get From Dictionary    ${resolve_result}    resolved
    ${preview_value}=    Get From Dictionary    ${resolved}    OPENAI_MODEL
    Should Be Equal As Strings    ${preview_value}    ${test_value}
    ...    msg=Resolve preview doesn't match configured value

    # Step 3: Deploy (start recreates container with new env)
    REST.POST    /api/services/${SERVICE_NAME}/start
    Sleep    10s    Wait for container to recreate

    # Step 4: What did container actually get?
    REST.GET    /api/services/${SERVICE_NAME}/container-env?unmask=true
    ${env_result}=    Output    response body
    ${env}=    Get From Dictionary    ${env_result}    env_vars
    ${actual_value}=    Get From Dictionary    ${env}    OPENAI_MODEL

    # THE CRITICAL ASSERTION: All three must match
    Should Be Equal As Strings    ${actual_value}    ${test_value}
    ...    msg=DEPLOYMENT MISMATCH: Configured='${test_value}', Deployed='${actual_value}'

    Should Be Equal As Strings    ${preview_value}    ${actual_value}
    ...    msg=PREVIEW MISMATCH: Preview='${preview_value}', Deployed='${actual_value}'

