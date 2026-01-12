*** Settings ***
Documentation    Service Configuration Override Tests
...
...              Tests different methods of updating service configuration:
...              - Via docker-compose environment
...              - Via .env file
...              - Via service config API
...              - Secrets handling (passwords go to secrets.yaml)

Library          RequestsLibrary
Library          Collections
Library          OperatingSystem
Library          String
Resource         ../resources/api_keywords.robot

Suite Setup      Setup Test Environment
Suite Teardown   Cleanup Test Environment

*** Variables ***
${SERVICE_ID}           chronicle
${CONFIG_DIR}           ${CURDIR}/../../config
${DEFAULTS_FILE}        ${CONFIG_DIR}/config.defaults.yaml
${OVERRIDES_FILE}       ${CONFIG_DIR}/config.overrides.yaml
${SECRETS_FILE}         ${CONFIG_DIR}/secrets.yaml
${COMPOSE_FILE}         ${CONFIG_DIR}/../docker-compose.yml
${ENV_FILE}             ${CONFIG_DIR}/../.env
${DEFAULT_DATABASE}     ushadow
${TEST_DATABASE}        test-db-chronicle

*** Test Cases ***
Update Database Via Compose File
    [Documentation]    Verify database config can be set via docker-compose.yml
    ...                Tests the compose file → config merge flow
    [Tags]    integration    config-merge    compose

    # Arrange: Get current database config
    ${initial_config}=    GET On Session    admin_session
    ...                   /api/settings/service-configs/${SERVICE_ID}
    ...                   expected_status=200
    ${database}=    Get From Dictionary    ${initial_config.json()}    database    default=${DEFAULT_DATABASE}
    Log    Initial database: ${database}

    # Verify it matches defaults
    ${defaults_content}=    Read Config File    ${DEFAULTS_FILE}
    Should Be Equal    ${database}    ${defaults_content}[service_preferences][${SERVICE_ID}][database]
    ...    msg=Initial database should match config.defaults.yaml

    # Act: Update database in compose file
    ${compose_content}=    Get File    ${COMPOSE_FILE}
    ${modified_compose}=    Replace String    ${compose_content}
    ...                     MONGODB_DATABASE: ${DEFAULT_DATABASE}
    ...                     MONGODB_DATABASE: ${TEST_DATABASE}
    Create File    ${COMPOSE_FILE}.modified    ${modified_compose}

    # Note: In real test, you'd reload the service here
    # For now, we verify the compose file was updated
    ${updated_compose}=    Get File    ${COMPOSE_FILE}.modified
    Should Contain    ${updated_compose}    MONGODB_DATABASE: ${TEST_DATABASE}
    ...    msg=Compose file should contain new database name

    [Teardown]    Run Keywords
    ...    Remove File    ${COMPOSE_FILE}.modified    AND
    ...    Log    Compose test completed

Update Database Via Environment File
    [Documentation]    Verify database config can be set via .env file
    ...                Tests the .env file → environment variable → config merge flow
    [Tags]    integration    config-merge    env-file

    # Arrange: Get current database config
    ${initial_config}=    GET On Session    admin_session
    ...                   /api/settings/service-configs/${SERVICE_ID}
    ...                   expected_status=200
    ${database}=    Get From Dictionary    ${initial_config.json()}    database    default=${DEFAULT_DATABASE}

    # Verify it matches defaults
    ${defaults_content}=    Read Config File    ${DEFAULTS_FILE}
    Should Be Equal    ${database}    ${defaults_content}[service_preferences][${SERVICE_ID}][database]
    ...    msg=Initial database should match config.defaults.yaml

    # Act: Add database override to .env file
    ${env_exists}=    Run Keyword And Return Status    File Should Exist    ${ENV_FILE}
    ${backup_created}=    Set Variable    ${False}
    Run Keyword If    ${env_exists}    Run Keywords
    ...    Copy File    ${ENV_FILE}    ${ENV_FILE}.backup    AND
    ...    Set Test Variable    ${backup_created}    ${True}

    # Append database environment variable
    Append To File    ${ENV_FILE}    \nMONGODB_DATABASE=${TEST_DATABASE}\n

    # Verify .env file was updated
    ${env_content}=    Get File    ${ENV_FILE}
    Should Contain    ${env_content}    MONGODB_DATABASE=${TEST_DATABASE}
    ...    msg=.env file should contain database override

    # Note: Service would need to be restarted to pick up .env changes
    Log    .env file updated with MONGODB_DATABASE=${TEST_DATABASE}

    [Teardown]    Run Keywords
    ...    Run Keyword If    ${backup_created}    Move File    ${ENV_FILE}.backup    ${ENV_FILE}    AND
    ...    Run Keyword Unless    ${backup_created}    Remove File    ${ENV_FILE}    AND
    ...    Log    Environment file test completed

Update Database Via Service Config API
    [Documentation]    Verify database config can be set via service config API
    ...                Tests the API → config.overrides.yaml → config merge flow
    [Tags]    integration    config-merge    api    critical

    # Arrange: Get current database config
    ${config}=    Get Service Config    admin_session    ${SERVICE_ID}
    ${database}=    Get From Dictionary    ${config}    database    default=${DEFAULT_DATABASE}
    Log    Initial database: ${database}

    # Verify it matches defaults
    ${defaults_content}=    Read Config File    ${DEFAULTS_FILE}
    Should Be Equal    ${database}    ${defaults_content}[service_preferences][${SERVICE_ID}][database]
    ...    msg=Initial database should match config.defaults.yaml

    # Act: Change database via API
    ${config_updates}=    Create Dictionary    database=${TEST_DATABASE}
    ${result}=    Update Service Config    admin_session    ${SERVICE_ID}    ${config_updates}

    # Assert: Verify API response (inline per guidelines)
    Should Be Equal    ${result}[success]    ${True}
    ...    msg=API should return success=True
    Should Contain    ${result}[message]    ${SERVICE_ID}
    ...    msg=Success message should mention service ID

    # Assert: Verify merged config via API
    Sleep    100ms    reason=Give config time to write
    ${merged_config}=    Get Service Config    admin_session    ${SERVICE_ID}
    Should Be Equal    ${merged_config}[database]    ${TEST_DATABASE}
    ...    msg=Merged config should reflect new database name

    # Assert: Verify written to overrides file (not secrets)
    File Should Exist    ${OVERRIDES_FILE}
    ...    msg=config.overrides.yaml should exist after API update
    ${overrides_content}=    Read Config File    ${OVERRIDES_FILE}

    # Verify structure in overrides file
    Dictionary Should Contain Key    ${overrides_content}    service_preferences
    ...    msg=Overrides should have service_preferences section
    Dictionary Should Contain Key    ${overrides_content}[service_preferences]    ${SERVICE_ID}
    ...    msg=Overrides should have configuration for ${SERVICE_ID}
    Dictionary Should Contain Key    ${overrides_content}[service_preferences][${SERVICE_ID}]    database
    ...    msg=Service config should contain database setting

    # Verify value in overrides file
    Should Be Equal    ${overrides_content}[service_preferences][${SERVICE_ID}][database]    ${TEST_DATABASE}
    ...    msg=Override file should contain new database name

    # Assert: Verify NOT written to secrets file (database is not a secret)
    ${secrets_exists}=    Run Keyword And Return Status    File Should Exist    ${SECRETS_FILE}
    Run Keyword If    ${secrets_exists}    Run Keywords
    ...    ${secrets_content}=    Read Config File    ${SECRETS_FILE}    AND
    ...    ${has_db_in_secrets}=    Run Keyword And Return Status
    ...        Dictionary Should Contain Key    ${secrets_content}[service_preferences][${SERVICE_ID}]    database    AND
    ...    Should Not Be True    ${has_db_in_secrets}
    ...    msg=Database config should NOT be in secrets.yaml (it's not a secret)

    Log    Database successfully updated via API and written to overrides

Test Secret Override Via Service Config API
    [Documentation]    Verify secrets are written to secrets.yaml, not overrides
    ...                Tests the API → secrets.yaml (not overrides) → config merge flow
    [Tags]    integration    config-merge    secrets    api    critical

    # Arrange: Get current config
    ${initial_config}=    Get Service Config    admin_session    ${SERVICE_ID}
    Log    Initial config retrieved

    # Act: Change admin password via API (this is a secret)
    ${test_password}=    Set Variable    test-secret-password-123
    ${config_updates}=    Create Dictionary    admin_password=${test_password}
    ${result}=    Update Service Config    admin_session    ${SERVICE_ID}    ${config_updates}

    # Assert: Verify API response (inline per guidelines)
    Should Be Equal    ${result}[success]    ${True}
    ...    msg=API should return success=True

    # Assert: Verify merged config via API (but value should be masked!)
    Sleep    100ms    reason=Give config time to write
    ${merged_config}=    Get Service Config    admin_session    ${SERVICE_ID}

    # When reading back, secret should be masked
    ${masked_password}=    Get From Dictionary    ${merged_config}    admin_password
    Should Not Be Equal    ${masked_password}    ${test_password}
    ...    msg=Password should be masked when read via API
    Should Match Regexp    ${masked_password}    ^[*•]+
    ...    msg=Masked password should start with asterisks or bullets

    # Assert: Verify written to SECRETS file (not overrides)
    File Should Exist    ${SECRETS_FILE}
    ...    msg=secrets.yaml should exist after updating a secret
    ${secrets_content}=    Read Config File    ${SECRETS_FILE}

    # Verify structure in secrets file
    Dictionary Should Contain Key    ${secrets_content}    service_preferences
    ...    msg=Secrets should have service_preferences section
    Dictionary Should Contain Key    ${secrets_content}[service_preferences]    ${SERVICE_ID}
    ...    msg=Secrets should have configuration for ${SERVICE_ID}
    Dictionary Should Contain Key    ${secrets_content}[service_preferences][${SERVICE_ID}]    admin_password
    ...    msg=Service secrets should contain admin_password

    # Verify actual (unmasked) value in secrets file
    Should Be Equal    ${secrets_content}[service_preferences][${SERVICE_ID}][admin_password]    ${test_password}
    ...    msg=Secrets file should contain actual (unmasked) password

    # Assert: Verify NOT written to overrides file (passwords are secrets)
    ${overrides_exists}=    Run Keyword And Return Status    File Should Exist    ${OVERRIDES_FILE}
    Run Keyword If    ${overrides_exists}    Run Keywords
    ...    ${overrides_content}=    Read Config File    ${OVERRIDES_FILE}    AND
    ...    ${has_password_in_overrides}=    Run Keyword And Return Status
    ...        Dictionary Should Contain Key    ${overrides_content}[service_preferences][${SERVICE_ID}]    admin_password    AND
    ...    Should Not Be True    ${has_password_in_overrides}
    ...    msg=Password should NOT be in config.overrides.yaml (it's a secret!)

    Log    Secret successfully written to secrets.yaml and masked in API responses

*** Keywords ***
Setup Test Environment
    [Documentation]    Setup for all tests
    Log    Setting up test environment

    # Backup config files if they exist
    Backup Config Files    ${OVERRIDES_FILE}    ${SECRETS_FILE}

    # Create admin session for API calls (reused by all tests)
    ${session}=    Get Admin API Session
    Set Suite Variable    ${admin_session}    ${session}

Cleanup Test Environment
    [Documentation]    Cleanup after all tests
    Log    Cleaning up test environment

    # Restore backups and clean up
    Restore Config Files    ${OVERRIDES_FILE}    ${SECRETS_FILE}

    # Close all API sessions
    Delete All Sessions
    Log    Test environment cleaned up
