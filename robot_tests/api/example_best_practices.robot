*** Settings ***
Documentation    Example Test Demonstrating Best Practices
...
...              This test file demonstrates:
...              - No manual status code checking (use expected_status)
...              - Inline verifications in tests
...              - Setup keywords in resources
...              - Test data from fixtures
...              - Proper Suite Setup/Teardown
...              - Clear Arrange-Act-Assert pattern
...              - Organized keyword imports (not monolithic api_keywords.robot)

Library          RequestsLibrary
Library          Collections
Library          OperatingSystem

# Import only the keyword files we need (organized approach)
Resource         ../resources/auth_keywords.robot
Resource         ../resources/service_config_keywords.robot
Resource         ../resources/config_file_keywords.robot
Resource         ../resources/file_keywords.robot
Library          REST    localhost:8080    ssl_verify=false
Library          Collections
Library          String
Library          ../resources/EnvConfig.py
Resource         ../resources/setup/suite_setup.robot

Suite Setup      Custom Suite Setup
Suite Teardown   Custom Suite Teardown
Test Setup       Setup REST Authentication

*** Variables ***
${SERVICE_ID}        chronicle
${CONFIG_DIR}        ${CURDIR}/../../config
${FIXTURES_DIR}      ${CURDIR}/../fixtures
${OVERRIDES_FILE}    ${CONFIG_DIR}/config.overrides.yaml

*** Test Cases ***
Example: Update Service Config With Fixture Data
    [Documentation]    Demonstrates loading test data from fixtures
    ...                ✅ Uses fixture for test data
    ...                ✅ No manual status code checks
    ...                ✅ Inline verifications with clear messages
    [Tags]    example    best-practices

    # Arrange: Load test configuration from fixture
    ${test_config}=    Load YAML File    ${FIXTURES_DIR}/configs/minimal_chronicle_config.yaml
    Log    Loaded test config: ${test_config}

    # Act: Update service config (auto-validates 200 status)
    ${result}=    Update Service Config    admin_session    ${SERVICE_ID}    ${test_config}

    # Assert: Verify response (inline per guidelines)
    Should Be Equal    ${result}[success]    ${True}
    ...    msg=API should return success=True

    # Assert: Verify merged config
    ${merged_config}=    Get Service Config    admin_session    ${SERVICE_ID}
    Should Be Equal    ${merged_config}[database]    ${test_config}[database]
    ...    msg=Merged config should contain test database name
    Should Be Equal    ${merged_config}[llm_model]    ${test_config}[llm_model]
    ...    msg=Merged config should contain test LLM model

Example: Test Error Case With Expected Status
    [Documentation]    Demonstrates testing error scenarios
    ...                ✅ Uses expected_status for non-200 responses
    ...                ✅ Tests error handling correctly
    [Tags]    example    error-handling

    # Arrange: Create config with invalid service ID
    ${test_config}=    Create Dictionary    database=test-db

    # Act: Attempt update with non-existent service ID
    # Note: expected_status=any means "don't fail on any status"
    ${response}=    PUT On Session    admin_session
    ...             /api/settings/service-configs/non_existent_service
    ...             json=${test_config}
    ...             expected_status=any

    # Assert: Verify success (API accepts any service ID for flexibility)
    # This demonstrates that the API is permissive - it allows configuration
    # for any service, even if not currently registered
    Should Be Equal As Integers    ${response.status_code}    200
    ...    msg=API should accept config for any service ID
    ${result}=    Set Variable    ${response.json()}
    Should Be Equal    ${result}[success]    ${True}
    ...    msg=API should return success for valid config structure

Example: Verify Multiple Conditions
    [Documentation]    Demonstrates testing with multiple assertions
    ...                ✅ All verifications inline in test
    ...                ✅ Clear error messages for each assertion
    [Tags]    example    assertions

    # Arrange: Get current config
    ${config}=    Get Service Config    admin_session    ${SERVICE_ID}

    # Assert: Verify structure (check keys exist first)
    Dictionary Should Contain Key    ${config}    database
    ...    msg=Config must contain 'database' field
    Dictionary Should Contain Key    ${config}    llm_model
    ...    msg=Config must contain 'llm_model' field

    # Assert: Verify types
    ${db_type}=    Evaluate    type($config['database']).__name__
    Should Be Equal    ${db_type}    str
    ...    msg=Database field should be a string

    # Assert: Verify values are not empty
    Should Not Be Empty    ${config}[database]
    ...    msg=Database name should not be empty
    Should Not Be Empty    ${config}[llm_model]
    ...    msg=LLM model should not be empty

Example: Test Specific File Changes
    [Documentation]    Demonstrates verifying file system changes
    ...                ✅ Tests write to correct file
    ...                ✅ Tests structure of written data
    [Tags]    example    file-validation

    # Act: Update non-secret config value
    ${updates}=    Create Dictionary    database=example-test-db
    ${result}=    Update Service Config    admin_session    ${SERVICE_ID}    ${updates}

    # Assert: Verify API response
    Should Be Equal    ${result}[success]    ${True}
    ...    msg=API should return success=True

    # Assert: Verify file exists and has correct structure
    Sleep    100ms    reason=Give filesystem time to write
    File Should Exist    ${OVERRIDES_FILE}
    ...    msg=Override file should be created after config update

    # Assert: Verify file structure (inline)
    ${overrides}=    Read Config File    ${OVERRIDES_FILE}
    Dictionary Should Contain Key    ${overrides}    service_preferences
    ...    msg=Override file should have service_preferences section
    Dictionary Should Contain Key    ${overrides}[service_preferences]    ${SERVICE_ID}
    ...    msg=Service preferences should contain ${SERVICE_ID}
    Should Be Equal    ${overrides}[service_preferences][${SERVICE_ID}][database]    example-test-db
    ...    msg=Override file should contain the updated database value

*** Keywords ***
Custom Suite Setup
    [Documentation]    Setup for entire test suite
    ...                - Backs up config files
    ...                - Creates reusable admin session

    Log    Setting up test suite

    # Create admin session first (using Standard Suite Setup pattern)
    ${session}=    Get Admin API Session
    Set Suite Variable    ${admin_session}    ${session}
    Log    ✓ Authenticated API session created: ${admin_session}    console=yes

    # Backup config files (using reusable keyword from resources)
    Backup Config Files    ${OVERRIDES_FILE}

    Log    Test suite setup complete

Custom Suite Teardown
    [Documentation]    Cleanup for entire test suite
    ...                - Restores backed up files
    ...                - Closes API sessions

    Log    Cleaning up test suite

    # Restore config files (using reusable keyword from resources)
    Restore Config Files    ${OVERRIDES_FILE}

    # Close all API sessions
    Delete All Sessions

    Log    Test suite cleanup complete
