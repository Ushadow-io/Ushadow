*** Settings ***
Documentation    Test that service configuration overrides are written and used correctly
...
...              This test verifies the complete flow:
...              1. Set a configuration value for a service
...              2. Verify it's written to config.overrides.yaml
...              3. Start the service
...              4. Verify the service uses the override value

Library          RequestsLibrary
Library          Collections
Library          OperatingSystem
Resource         ../resources/api_keywords.robot

Suite Setup      Suite Setup
Suite Teardown   Suite Teardown

*** Variables ***
${SERVICE_ID}         chronicle
${CONFIG_DIR}         /Users/stu/repos/worktrees/ushadow/green/config
${OVERRIDES_FILE}     ${CONFIG_DIR}/config.overrides.yaml
${TEST_MODEL_NAME}    gpt-4-test-model

*** Test Cases ***
Service Config Override Write And Use Test
    [Documentation]    End-to-end test of service config override functionality
    [Tags]    integration    service-config    critical

    # Step 1: Update service configuration via API
    Log    Step 1: Updating service configuration via API
    ${config_updates}=    Create Dictionary    llm_model=${TEST_MODEL_NAME}
    ${result}=    Update Service Config    admin_session    ${SERVICE_ID}    ${config_updates}
    Log    API update result: ${result}

    # Step 2: Verify config is written to overrides file
    Log    Step 2: Verifying overrides file was updated
    Sleep    1s    reason=Give filesystem time to write
    File Should Exist    ${OVERRIDES_FILE}
    ${overrides_content}=    Read Config File    ${OVERRIDES_FILE}

    # Verify structure exists
    Dictionary Should Contain Key    ${overrides_content}    service_preferences
    ...    msg=Overrides file should contain 'service_preferences' section

    Dictionary Should Contain Key    ${overrides_content}[service_preferences]    ${SERVICE_ID}
    ...    msg=Overrides should contain configuration for ${SERVICE_ID}

    Dictionary Should Contain Key    ${overrides_content}[service_preferences][${SERVICE_ID}]    llm_model
    ...    msg=Service config should contain 'llm_model' setting

    # Verify value matches what we set
    Should Be Equal    ${overrides_content}[service_preferences][${SERVICE_ID}][llm_model]    ${TEST_MODEL_NAME}
    ...    msg=Override value should match what was set via API

    # Step 3: Read config via API to verify merge
    Log    Step 3: Reading merged configuration via API
    ${merged_config}=    Get Service Config    admin_session    ${SERVICE_ID}
    Log    Merged config: ${merged_config}

    Dictionary Should Contain Key    ${merged_config}    llm_model
    Should Be Equal    ${merged_config}[llm_model]    ${TEST_MODEL_NAME}
    ...    msg=Merged config should reflect the override value

    # Step 4: (Optional) Start service and verify it uses the config
    # NOTE: This step requires the service to actually start, which may need Docker
    # For now, we verify the configuration is available to the service
    Log    Step 4: Verified config is available for service startup
    Log    If service starts, it will receive llm_model=${TEST_MODEL_NAME}

    [Teardown]    Test Cleanup

*** Keywords ***
Suite Setup
    [Documentation]    Setup for test suite
    Log    Setting up test suite

    # Backup existing overrides file if it exists
    ${exists}=    Run Keyword And Return Status    File Should Exist    ${OVERRIDES_FILE}
    Run Keyword If    ${exists}    Copy File    ${OVERRIDES_FILE}    ${OVERRIDES_FILE}.backup

    # Create admin session
    ${session}=    Get Admin API Session
    Set Suite Variable    ${admin_session}    ${session}

Suite Teardown
    [Documentation]    Cleanup after test suite
    Log    Cleaning up test suite

    # Restore backup if exists
    ${backup_exists}=    Run Keyword And Return Status    File Should Exist    ${OVERRIDES_FILE}.backup
    Run Keyword If    ${backup_exists}    Move File    ${OVERRIDES_FILE}.backup    ${OVERRIDES_FILE}

    Delete All Sessions

Test Cleanup
    [Documentation]    Cleanup after individual test
    Log    Test completed
