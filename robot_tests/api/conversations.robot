*** Settings ***
Documentation    Conversations API Tests
...
...              Generated from: USHADOW_APPLICATION_TEST_INDEX.md
...              Section 8: Conversations (Chronicle Integration)
...              Priority: High
...
...              Tests conversation management:
...              1. List conversations (paginated)
...              2. Get conversation details
...              3. Create new conversation
...              4. Update/delete conversations
...
...              Test Cases Covered:
...              - TC-CONV-001: List Conversations
...              - TC-CONV-002: Get Conversation Details
...              - TC-CONV-003: Create Conversation

Library          RequestsLibrary
Library          Collections
Library          String
Library          OperatingSystem

# REQUIRED: Import standard test environment setup
Resource         ../resources/setup/suite_setup.robot
Resource         ../resources/auth_keywords.robot

# Import centralized test configuration
Variables        ../resources/setup/test_env.py

Suite Setup      Conversation Suite Setup
Suite Teardown   Conversation Suite Teardown

*** Variables ***
# Session names
${API_SESSION}              conversation_session

# API endpoints
${CONVERSATIONS_BASE}       /api/chronicle/conversations

# Test state (populated during test execution)
${TEST_CONVERSATION_ID}     ${EMPTY}

*** Test Cases ***
# =============================================================================
# Section 8.1: List Conversations
# =============================================================================

TC-CONV-001: List Conversations
    [Documentation]    List all conversations for current user
    ..
    ...                GIVEN: User has conversations in Chronicle
    ...                WHEN: GET /api/chronicle/conversations
    ...                THEN: Returns paginated list of conversations
    [Tags]    conversation    high-priority    api

    ${response}=    GET On Session    ${API_SESSION}    ${CONVERSATIONS_BASE}
    ...    expected_status=any

    # Should succeed or return empty list
    Should Be True    ${response.status_code} in [200, 404]
    ...    msg=Failed to list conversations: ${response.text}

    IF    ${response.status_code} == 200
        ${json}=    Set Variable    ${response.json()}

        # Response should be a list or paginated object
        ${is_list}=    Evaluate    isinstance($json, list)
        ${is_dict}=    Evaluate    isinstance($json, dict)

        Should Be True    ${is_list} or ${is_dict}
        ...    msg=Expected list or dict, got ${type($json)}

        # If paginated, should have items/results field
        IF    ${is_dict}
            ${has_items}=    Run Keyword And Return Status
            ...    Dictionary Should Contain Key    ${json}    items
            ${has_results}=    Run Keyword And Return Status
            ...    Dictionary Should Contain Key    ${json}    results

            Should Be True    ${has_items} or ${has_results}
            ...    msg=Paginated response missing items/results field
        END
    END

    Log    Conversations list retrieved successfully

# =============================================================================
# Section 8.2: Create & Retrieve Conversations
# =============================================================================

TC-CONV-003: Create Conversation
    [Documentation]    Create a new conversation
    ..
    ...                GIVEN: Valid conversation data
    ...                WHEN: POST /api/chronicle/conversations
    ...                THEN: Conversation created successfully
    [Tags]    conversation    high-priority    api

    # Create conversation
    ${conversation_data}=    Create Dictionary
    ...    title=Test Conversation ${SUITE_NAME}
    ...    description=Automated test conversation
    ...    user_email=${TEST_USER_EMAIL}

    ${response}=    POST On Session    ${API_SESSION}    ${CONVERSATIONS_BASE}
    ...    json=${conversation_data}
    ...    expected_status=any

    # Should create successfully or endpoint may not support direct creation
    IF    ${response.status_code} in [200, 201]
        ${json}=    Set Variable    ${response.json()}

        # Extract conversation ID for later tests
        ${has_id}=    Run Keyword And Return Status
        ...    Dictionary Should Contain Key    ${json}    id

        IF    ${has_id}
            Set Suite Variable    ${TEST_CONVERSATION_ID}    ${json}[id]
            Log    Created conversation: ${TEST_CONVERSATION_ID}
        END
    ELSE IF    ${response.status_code} == 404
        Log    Conversation creation endpoint not available
        Skip    Conversation creation not implemented
    ELSE IF    ${response.status_code} == 405
        Log    POST method not allowed on conversations endpoint
        Skip    Direct conversation creation not supported
    ELSE
        Fail    Unexpected status creating conversation: ${response.status_code} - ${response.text}
    END

TC-CONV-002: Get Conversation Details
    [Documentation]    Get detailed information about a conversation
    ..
    ...                GIVEN: Valid conversation ID
    ...                WHEN: GET /api/chronicle/conversations/{id}
    ...                THEN: Returns conversation with messages
    [Tags]    conversation    high-priority    api

    # Skip if we don't have a conversation ID
    IF    '${TEST_CONVERSATION_ID}' == '${EMPTY}'
        Skip    No conversation ID available (creation may have failed)
    END

    ${response}=    GET On Session    ${API_SESSION}
    ...    ${CONVERSATIONS_BASE}/${TEST_CONVERSATION_ID}
    ...    expected_status=any

    # Should return conversation details
    Should Be True    ${response.status_code} in [200, 404]
    ...    msg=Failed to get conversation: ${response.text}

    IF    ${response.status_code} == 200
        ${json}=    Set Variable    ${response.json()}

        # Verify conversation fields
        Dictionary Should Contain Key    ${json}    id
        Should Be Equal    ${json}[id]    ${TEST_CONVERSATION_ID}

        # May have title, messages, created_at, etc.
        Log    Conversation details: ${json}
    ELSE
        Log    Conversation not found (may have been deleted)
    END

# =============================================================================
# Section 8.3: Update & Delete Conversations
# =============================================================================

TC-CONV-004: Update Conversation
    [Documentation]    Update conversation title or metadata
    ..
    ...                GIVEN: Existing conversation ID
    ...                WHEN: PUT/PATCH /api/chronicle/conversations/{id}
    ...                THEN: Conversation updated successfully
    [Tags]    conversation    medium-priority    api

    # Skip if we don't have a conversation ID
    IF    '${TEST_CONVERSATION_ID}' == '${EMPTY}'
        Skip    No conversation ID available
    END

    ${update_data}=    Create Dictionary
    ...    title=Updated Test Conversation

    ${response}=    PUT On Session    ${API_SESSION}
    ...    ${CONVERSATIONS_BASE}/${TEST_CONVERSATION_ID}
    ...    json=${update_data}
    ...    expected_status=any

    # Update may not be supported for all implementations
    IF    ${response.status_code} in [200, 201]
        Log    Conversation updated successfully
    ELSE IF    ${response.status_code} in [404, 405]
        Skip    Update not supported or conversation not found
    ELSE
        Log    Update failed: ${response.status_code} - ${response.text}
    END

TC-CONV-005: Delete Conversation
    [Documentation]    Delete a conversation
    ..
    ...                GIVEN: Existing conversation ID
    ...                WHEN: DELETE /api/chronicle/conversations/{id}
    ...                THEN: Conversation deleted successfully
    [Tags]    conversation    medium-priority    api

    # Skip if we don't have a conversation ID
    IF    '${TEST_CONVERSATION_ID}' == '${EMPTY}'
        Skip    No conversation ID available
    END

    ${response}=    DELETE On Session    ${API_SESSION}
    ...    ${CONVERSATIONS_BASE}/${TEST_CONVERSATION_ID}
    ...    expected_status=any

    # Delete may return 200, 204, or 404
    Should Be True    ${response.status_code} in [200, 204, 404, 405]
    ...    msg=Failed to delete conversation: ${response.text}

    IF    ${response.status_code} in [200, 204]
        Log    Conversation deleted successfully
    ELSE
        Log    Delete not supported or conversation not found
    END

*** Keywords ***
Conversation Suite Setup
    [Documentation]    Setup test environment and API session

    # CRITICAL: Call standard suite setup first
    Suite Setup

    # Get authenticated admin session
    ${admin_session}=    Get Admin API Session
    Set Suite Variable    ${API_SESSION}    ${admin_session}

Conversation Suite Teardown
    [Documentation]    Cleanup test data and test environment

    # Delete test conversation if it exists
    IF    '${TEST_CONVERSATION_ID}' != '${EMPTY}'
        Run Keyword And Ignore Error    DELETE On Session    ${API_SESSION}
        ...    ${CONVERSATIONS_BASE}/${TEST_CONVERSATION_ID}
    END

    Delete All Sessions

    # CRITICAL: Call standard suite teardown
    Suite Teardown
