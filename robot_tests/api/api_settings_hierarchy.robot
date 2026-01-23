*** Settings ***
Documentation    Settings Configuration Hierarchy API Tests
...
...              Tests the API behavior for the configuration hierarchy:
...
...              IMPLEMENTED LAYERS (tested):
...              1. config.defaults.yaml (lowest priority)
...              2. config.overrides.yaml (highest priority - user wins)
...
...              FUTURE LAYERS (TDD tests - expected to fail):
...              - Docker Compose environment
...              - .env file
...              - Provider suggested mappings
...
...              Spec: specs/features/SETTINGS_CONFIG_HIERARCHY_SPEC.md

Library          REST    localhost:8080    ssl_verify=false
Library          Collections
Library          ../resources/EnvConfig.py
Resource         ../resources/setup/suite_setup.robot

Suite Setup      Standard Suite Setup
Suite Teardown   Standard Suite Teardown

*** Variables ***
${SERVICE_ID}    chronicle

*** Test Cases ***
# =============================================================================
# LAYER 1: Defaults Foundation
# =============================================================================

TC-HIER-001: Defaults Provide Baseline Values
    [Documentation]    config.defaults.yaml provides baseline when no overrides exist
    ...
    ...                GIVEN only defaults exist (no overrides)
    ...                WHEN service config is requested
    ...                THEN default values are returned
    [Tags]    hierarchy    api    layer-defaults    stable

    # Get service config
    REST.GET    /api/settings/service-configs/${SERVICE_ID}
    Integer    response status    200

    # Should return a config object
    Object     response body

TC-HIER-002: Defaults Contain Expected Structure
    [Documentation]    Default config should have expected service settings structure
    [Tags]    hierarchy    api    layer-defaults    stable

    REST.GET    /api/settings/service-configs/${SERVICE_ID}
    Integer    response status    200

    # Config should be a dictionary (may be empty if no defaults)
    ${config}=    Output    response body
    Should Be True    isinstance($config, dict)
    ...    msg=Config should be a dictionary

# =============================================================================
# LAYER 5: User Overrides (Highest Priority)
# =============================================================================

TC-HIER-010: User Override Beats Defaults
    [Documentation]    User-set values in config.overrides.yaml beat defaults
    ...
    ...                GIVEN defaults have llm_model = "default-model"
    ...                WHEN user sets llm_model = "user-chosen-model" via API
    ...                THEN reading config returns "user-chosen-model"
    [Tags]    hierarchy    api    layer-overrides    critical    stable

    # Set user override
    ${user_model}=    Set Variable    user-chosen-model-${SUITE NAME}
    ${updates}=    Create Dictionary    llm_model=${user_model}

    REST.PUT    /api/settings/service-configs/${SERVICE_ID}    ${updates}
    Integer    response status    200

    # Read back
    Sleep    0.1s
    REST.GET    /api/settings/service-configs/${SERVICE_ID}
    Integer    response status    200

    # User value should win
    ${config}=    Output    response body
    ${returned}=    Get From Dictionary    ${config}    llm_model
    Should Be Equal As Strings    ${returned}    ${user_model}
    ...    msg=User override not applied. Expected '${user_model}', got '${returned}'

TC-HIER-011: Multiple User Overrides Coexist
    [Documentation]    User can override multiple settings independently
    [Tags]    hierarchy    api    layer-overrides    stable

    # Set multiple overrides
    ${updates}=    Create Dictionary
    ...    llm_model=override-model-a
    ...    temperature=${0.7}
    ...    max_tokens=${2048}

    REST.PUT    /api/settings/service-configs/${SERVICE_ID}    ${updates}
    Integer    response status    200

    # All should be returned
    Sleep    0.1s
    REST.GET    /api/settings/service-configs/${SERVICE_ID}
    ${config}=    Output    response body

    Should Be Equal As Strings    ${config}[llm_model]    override-model-a
    Should Be Equal As Numbers    ${config}[temperature]    ${0.7}
    Should Be Equal As Numbers    ${config}[max_tokens]    ${2048}

TC-HIER-012: User Override Persists Across Reads
    [Documentation]    User overrides don't revert to defaults on subsequent reads
    [Tags]    hierarchy    api    layer-overrides    stable

    # Set override
    ${override_value}=    Set Variable    persistent-model-test
    ${updates}=    Create Dictionary    llm_model=${override_value}

    REST.PUT    /api/settings/service-configs/${SERVICE_ID}    ${updates}
    Integer    response status    200

    # Read multiple times
    Sleep    0.1s
    FOR    ${i}    IN RANGE    1    4
        REST.GET    /api/settings/service-configs/${SERVICE_ID}
        ${config}=    Output    response body
        Should Be Equal As Strings    ${config}[llm_model]    ${override_value}
        ...    msg=Read ${i}: Override reverted to default
        Sleep    0.05s
    END

TC-HIER-013: Partial Override Preserves Other Settings
    [Documentation]    Updating one setting doesn't erase others
    [Tags]    hierarchy    api    layer-overrides    critical    stable

    # Set initial values
    ${initial}=    Create Dictionary
    ...    setting_a=value_a
    ...    setting_b=value_b
    ...    setting_c=value_c

    REST.PUT    /api/settings/service-configs/${SERVICE_ID}    ${initial}
    Integer    response status    200

    # Update only setting_a
    ${partial}=    Create Dictionary    setting_a=updated_a
    REST.PUT    /api/settings/service-configs/${SERVICE_ID}    ${partial}
    Integer    response status    200

    # Other settings should remain
    Sleep    0.1s
    REST.GET    /api/settings/service-configs/${SERVICE_ID}
    ${config}=    Output    response body

    Should Be Equal As Strings    ${config}[setting_a]    updated_a
    Should Be Equal As Strings    ${config}[setting_b]    value_b
    ...    msg=setting_b was lost during partial update
    Should Be Equal As Strings    ${config}[setting_c]    value_c
    ...    msg=setting_c was lost during partial update

# =============================================================================
# HIERARCHY PRECEDENCE CHAIN
# =============================================================================

TC-HIER-020: Full Precedence Chain - User Wins Over Defaults
    [Documentation]    Test the complete precedence: defaults < user overrides
    ...
    ...                This tests the currently implemented layers.
    ...                User overrides should always beat defaults.
    [Tags]    hierarchy    api    precedence    critical    stable

    # Set a distinctive override
    ${user_value}=    Set Variable    user-explicit-choice-${SUITE NAME}
    ${updates}=    Create Dictionary    llm_model=${user_value}

    REST.PUT    /api/settings/service-configs/${SERVICE_ID}    ${updates}
    Integer    response status    200

    # Verify user value is returned
    Sleep    0.1s
    REST.GET    /api/settings/service-configs/${SERVICE_ID}
    ${config}=    Output    response body

    Should Be Equal As Strings    ${config}[llm_model]    ${user_value}
    ...    msg=User override did not beat defaults

# =============================================================================
# CACHE BEHAVIOR
# =============================================================================

TC-HIER-030: Cache Invalidates After Override Update
    [Documentation]    Writing new override should invalidate any cached values
    [Tags]    hierarchy    api    cache    stable

    # First read (may populate cache)
    REST.GET    /api/settings/service-configs/${SERVICE_ID}
    ${original}=    Output    response body

    # Update with distinctive value
    ${new_value}=    Set Variable    cache-test-${SUITE NAME}-new
    ${updates}=    Create Dictionary    cache_test_key=${new_value}
    REST.PUT    /api/settings/service-configs/${SERVICE_ID}    ${updates}
    Integer    response status    200

    # Read should get fresh data, not cached
    Sleep    0.1s
    REST.GET    /api/settings/service-configs/${SERVICE_ID}
    ${config}=    Output    response body

    Should Be Equal As Strings    ${config}[cache_test_key]    ${new_value}
    ...    msg=Cache was not invalidated after update

# =============================================================================
# ERROR HANDLING
# =============================================================================

TC-HIER-040: Invalid Service ID Returns Appropriate Error
    [Documentation]    Requesting config for non-existent service handles gracefully
    [Tags]    hierarchy    api    error-handling    stable

    REST.GET    /api/settings/service-configs/nonexistent-service-12345

    # Should return 404 or empty config (not crash)
    ${status}=    Output    response status
    Should Be True    ${status} == 200 or ${status} == 404
    ...    msg=Unexpected status ${status} for non-existent service

# =============================================================================
# TDD TESTS - Future Layers (Expected to fail until implemented)
# =============================================================================

TC-HIER-100: [TDD] Compose Environment Overrides Defaults
    [Documentation]    FUTURE: Docker Compose env vars should override defaults
    ...
    ...                NOT YET IMPLEMENTED - Test documents expected behavior
    [Tags]    hierarchy    api    layer-compose    tdd
    [Setup]    Skip    Layer 2 (Compose environment) not yet implemented

    # When implemented, this should verify:
    # - MONGODB_DATABASE in docker-compose.yml overrides config.defaults.yaml
    Fail    TDD placeholder - Compose env layer not implemented

TC-HIER-101: [TDD] Env File Overrides Compose
    [Documentation]    FUTURE: .env file should override Docker Compose
    ...
    ...                NOT YET IMPLEMENTED - Test documents expected behavior
    [Tags]    hierarchy    api    layer-env-file    tdd
    [Setup]    Skip    Layer 3 (.env file) not yet implemented

    Fail    TDD placeholder - .env file layer not implemented

TC-HIER-102: [TDD] Provider Suggestions Override Env File
    [Documentation]    FUTURE: Provider-suggested defaults should override .env
    ...
    ...                NOT YET IMPLEMENTED - Test documents expected behavior
    [Tags]    hierarchy    api    layer-provider    tdd
    [Setup]    Skip    Layer 4 (Provider suggestions) not yet implemented

    Fail    TDD placeholder - Provider suggestions layer not implemented

TC-HIER-103: [TDD] User Overrides Beat Provider Suggestions
    [Documentation]    FUTURE: User explicit overrides should beat provider suggestions
    ...
    ...                NOT YET IMPLEMENTED - Test documents expected behavior
    [Tags]    hierarchy    api    layer-overrides    layer-provider    tdd
    [Setup]    Skip    Layer 4 (Provider suggestions) not yet implemented

    Fail    TDD placeholder - Full hierarchy not implemented
