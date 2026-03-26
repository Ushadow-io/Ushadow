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

Variables        ../resources/setup/test_env.py
Library          REST    ${BACKEND_URL}    ssl_verify=false
Library          Collections
Library          ../resources/EnvConfig.py
Resource         ../resources/setup/suite_setup.robot
Resource         ../resources/auth_keywords.robot

Suite Setup      Standard Suite Setup
Suite Teardown   Standard Suite Teardown

*** Variables ***
${SERVICE_ID}    chronicle

*** Test Cases ***
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

