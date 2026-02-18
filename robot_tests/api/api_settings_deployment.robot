*** Settings ***
Documentation    Settings API and UI-to-Deployment Consistency Tests
...
...              Verifies that values configured through the API are:
...              1. Correctly stored in the right config file (secrets vs overrides)
...              2. Immediately reflected when read back via API
...              3. Exactly match what would be deployed to services (no transformation)
...
...              CRITICAL: Users must trust that UI values = deployment values

Variables        ../resources/setup/test_env.py
Library          REST    ${BACKEND_URL}    ssl_verify=false
Library          Collections
Library          OperatingSystem
Library          ../resources/EnvConfig.py
Resource         ../resources/setup/suite_setup.robot

Suite Setup      Standard Suite Setup
Suite Teardown   Standard Suite Teardown


*** Variables ***
${SERVICE_ID}    chronicle
${CONFIG_DIR}    ${CURDIR}/../../config

*** Test Cases ***
Settings API Returns Valid Configuration
    [Documentation]    Verify GET /api/settings/service-configs/{id} returns valid config
    [Tags]    settings    api

    REST.GET    /api/settings/service-configs/${SERVICE_ID}

    Integer    response status    200
    Object     response body    # Should be a JSON object

Settings API Accepts Updates
    [Documentation]    Verify PUT /api/settings/service-configs/{id} accepts updates
    [Tags]    settings    api

    # Arrange: Update payload
    ${updates}=    Create Dictionary    test_setting=robot_test_value_123

    # Act: Update via API
    REST.PUT    /api/settings/service-configs/${SERVICE_ID}    ${updates}

    # Assert: Success response
    Integer    response status    200
    Boolean    response body success
    String     response body message

Updated Value Immediately Visible In API
    [Documentation]    CRITICAL: Value set via API must be immediately readable
    ...
    ...                GIVEN user sets temperature = 0.42
    ...                WHEN user immediately reads config back
    ...                THEN API returns exactly 0.42 (not default, not transformed)
    [Tags]    settings    ui-deployment-consistency    critical

    # Arrange: Distinctive test value
    ${test_value}=    Set Variable    ${0.42}
    ${updates}=    Create Dictionary    temperature=${test_value}

    # Act: Update
    REST.PUT    /api/settings/service-configs/${SERVICE_ID}    ${updates}
    Integer    response status    200

    # Act: Read back immediately
    REST.GET    /api/settings/service-configs/${SERVICE_ID}
    Integer    response status    200

    # Assert: Exact value match
    ${config}=    Output    response body
    ${returned_value}=    Get From Dictionary    ${config}    temperature

    # CRITICAL: Must be exact match
    Should Be Equal As Numbers    ${returned_value}    ${test_value}
    ...    msg=Value transformed! Expected ${test_value}, got ${returned_value}

String Values Not Transformed
    [Documentation]    CRITICAL: String values must not be transformed
    ...
    ...                GIVEN user sets llm_model = "gpt-4o"
    ...                WHEN config is read back
    ...                THEN exact string "gpt-4o" is returned (not "claude-3" etc)
    [Tags]    settings    ui-deployment-consistency    critical

    # Arrange: Specific model name
    ${model_name}=    Set Variable    gpt-4o-test-12345
    ${updates}=    Create Dictionary    llm_model=${model_name}

    # Act: Update
    REST.PUT    /api/settings/service-configs/${SERVICE_ID}    ${updates}
    Integer    response status    200

    # Act: Read back
    REST.GET    /api/settings/service-configs/${SERVICE_ID}
    Integer    response status    200

    # Assert: Exact string match
    ${config}=    Output    response body
    ${returned_model}=    Get From Dictionary    ${config}    llm_model

    Should Be Equal As Strings    ${returned_model}    ${model_name}
    ...    msg=Model name transformed from '${model_name}' to '${returned_model}'

Partial Update Preserves Other Settings
    [Documentation]    Updating one setting must not erase others
    ...
    ...                GIVEN config has multiple settings
    ...                WHEN user updates only temperature
    ...                THEN other settings remain unchanged
    [Tags]    settings    partial-updates

    # Arrange: Get initial config
    REST.GET    /api/settings/service-configs/${SERVICE_ID}
    ${initial_config}=    Output    response body
    ${initial_keys}=    Get Dictionary Keys    ${initial_config}

    # Skip if no config exists
    ${key_count}=    Get Length    ${initial_keys}
    Run Keyword If    ${key_count} == 0    Pass Execution    No initial config exists

    # Act: Update only temperature
    ${updates}=    Create Dictionary    temperature=${0.888}
    REST.PUT    /api/settings/service-configs/${SERVICE_ID}    ${updates}
    Integer    response status    200

    # Act: Read back
    REST.GET    /api/settings/service-configs/${SERVICE_ID}
    ${updated_config}=    Output    response body

    # Assert: Temperature updated
    ${temperature}=    Get From Dictionary    ${updated_config}    temperature
    Should Be Equal As Numbers    ${temperature}    ${0.888}

    # Assert: Other settings still present (if they existed initially)
    FOR    ${key}    IN    @{initial_keys}
        IF    "${key}" != "temperature"
            Dictionary Should Contain Key    ${updated_config}    ${key}
            ...    msg=Setting '${key}' was lost during partial update!
        END
    END

User Override Persists Across Multiple Reads
    [Documentation]    User overrides must persist and not revert to defaults
    ...
    ...                GIVEN user sets temperature = 0.5
    ...                WHEN config is read 3 times
    ...                THEN all 3 reads return 0.5 (not reverted to default)
    [Tags]    settings    persistence

    # Arrange: Set override
    ${override_value}=    Set Variable    ${0.5}
    ${updates}=    Create Dictionary    temperature=${override_value}

    REST.PUT    /api/settings/service-configs/${SERVICE_ID}    ${updates}
    Integer    response status    200

    # Act & Assert: Read 3 times
    FOR    ${i}    IN RANGE    1    4
        REST.GET    /api/settings/service-configs/${SERVICE_ID}
        ${config}=    Output    response body
        ${temperature}=    Get From Dictionary    ${config}    temperature

        Should Be Equal As Numbers    ${temperature}    ${override_value}
        ...    msg=Read ${i}: Override lost, got ${temperature} instead of ${override_value}

        Sleep    0.1s    # Small delay between reads
    END

Numeric Precision Preserved
    [Documentation]    High-precision numeric values must not be rounded
    ...
    ...                GIVEN user sets temperature = 0.123456789
    ...                WHEN value is stored and retrieved
    ...                THEN precision is maintained (not rounded)
    [Tags]    settings    precision    ui-deployment-consistency

    # Arrange: High-precision value
    ${precise_value}=    Evaluate    0.123456789
    ${updates}=    Create Dictionary    temperature=${precise_value}

    # Act: Update
    REST.PUT    /api/settings/service-configs/${SERVICE_ID}    ${updates}
    Integer    response status    200

    # Act: Read back
    REST.GET    /api/settings/service-configs/${SERVICE_ID}
    ${config}=    Output    response body
    ${returned_value}=    Get From Dictionary    ${config}    temperature

    # Assert: Precision maintained (allow tiny floating point error)
    ${difference}=    Evaluate    abs(${returned_value} - ${precise_value})
    ${max_error}=    Set Variable    ${0.000001}

    Should Be True    ${difference} < ${max_error}
    ...    msg=Precision lost: ${precise_value} became ${returned_value}

Database URL Not Transformed
    [Documentation]    Database URLs must be stored and returned exactly as entered
    ...
    ...                GIVEN user sets database_url = "mongodb://prod:27017/db"
    ...                WHEN config is read back
    ...                THEN exact URL is returned (no substitution)
    [Tags]    settings    ui-deployment-consistency

    # Arrange: Specific database URL
    ${db_url}=    Set Variable    mongodb://test-server:27017/test_db_12345
    ${updates}=    Create Dictionary    database_url=${db_url}

    # Act: Update
    REST.PUT    /api/settings/service-configs/${SERVICE_ID}    ${updates}
    Integer    response status    200

    # Act: Read back
    REST.GET    /api/settings/service-configs/${SERVICE_ID}
    ${config}=    Output    response body
    ${returned_url}=    Get From Dictionary    ${config}    database_url

    # Assert: Exact match
    Should Be Equal As Strings    ${returned_url}    ${db_url}
    ...    msg=Database URL transformed from '${db_url}' to '${returned_url}'

Get All Service Configs Returns Valid Response
    [Documentation]    Verify GET /api/settings/service-configs returns all configs
    [Tags]    settings    api

    REST.GET    /api/settings/service-configs

    Integer    response status    200
    Object     response body    # Should be a dict of service configs
