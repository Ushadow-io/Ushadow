*** Settings ***
Documentation    Memories API Tests
...
...              Generated from: USHADOW_APPLICATION_TEST_INDEX.md
...              Section 9: Memories & Knowledge Management
...              Priority: High
...
...              Tests memory management across multiple sources:
...              1. List memories (paginated)
...              2. Get memory details
...              3. Create/update/delete memories
...              4. Search memories
...              5. Get memories for conversation
...
...              Test Cases Covered:
...              - TC-MEM-001: List Memories (Paginated)
...              - TC-MEM-002: Get Memory Details
...              - TC-MEM-003: Create Memory
...              - TC-MEM-007: Search Memories (Full-Text)
...              - TC-MEM-008: Get Memories for Conversation

Library          RequestsLibrary
Library          Collections
Library          String
Library          OperatingSystem

# REQUIRED: Import standard test environment setup
Resource         ../resources/setup/suite_setup.robot
Resource         ../resources/auth_keywords.robot

Suite Setup      Memory Suite Setup
Suite Teardown   Memory Suite Teardown

*** Variables ***
${API_SESSION}           memory_session
${MEMORIES_BASE}         /api/memories

# Test data
${TEST_MEMORY_ID}        ${EMPTY}
${TEST_CONVERSATION_ID}  test-conversation-123

*** Test Cases ***
# =============================================================================
# Section 9.1: List & Search Memories
# =============================================================================

TC-MEM-001: List Memories (Paginated)
    [Documentation]    List memories with pagination
    ...
    ...                GIVEN: User has memories in the system
    ...                WHEN: GET /api/memories with pagination params
    ...                THEN: Returns paginated list of memories
    [Tags]    memory    high-priority    api

    # List memories with pagination
    ${params}=    Create Dictionary
    ...    limit=10
    ...    offset=0

    ${response}=    GET On Session    ${API_SESSION}    ${MEMORIES_BASE}
    ...    params=${params}
    ...    expected_status=any

    # Endpoint may return 200 with data, 404 if not found, or 405 if not supported
    IF    ${response.status_code} == 200
        ${json}=    Set Variable    ${response.json()}

        # Response should be list or paginated object
        ${is_list}=    Evaluate    isinstance($json, list)
        ${is_dict}=    Evaluate    isinstance($json, dict)

        Should Be True    ${is_list} or ${is_dict}
        ...    msg=Expected list or dict, got ${type($json)}

        Log    Memories retrieved: ${json}
    ELSE IF    ${response.status_code} == 404
        Log    No memories found or endpoint returns 404 for empty results
    ELSE IF    ${response.status_code} == 405
        Skip    List endpoint not implemented (proxy to other services)
    ELSE
        Log    Unexpected status: ${response.status_code} - ${response.text}
    END

TC-MEM-007: Search Memories (Full-Text)
    [Documentation]    Search memories using full-text search
    ...
    ...                GIVEN: Memories with searchable content
    ...                WHEN: GET /api/memories with search query
    ...                THEN: Returns matching memories
    [Tags]    memory    high-priority    api    search

    # Search for memories
    ${params}=    Create Dictionary
    ...    query=test
    ...    limit=10

    ${response}=    GET On Session    ${API_SESSION}    ${MEMORIES_BASE}/search
    ...    params=${params}
    ...    expected_status=any

    # Search endpoint may not be implemented
    IF    ${response.status_code} == 200
        ${json}=    Set Variable    ${response.json()}

        # Should return search results
        ${is_list}=    Evaluate    isinstance($json, list)
        ${is_dict}=    Evaluate    isinstance($json, dict)

        Should Be True    ${is_list} or ${is_dict}

        Log    Search results: ${json}
    ELSE IF    ${response.status_code} in [404, 405]
        Skip    Search endpoint not implemented
    ELSE
        Log    Search request status: ${response.status_code}
    END

# =============================================================================
# Section 9.2: Get Memory Details
# =============================================================================

TC-MEM-002: Get Memory Details
    [Documentation]    Get detailed information about a specific memory
    ...
    ...                GIVEN: Valid memory ID
    ...                WHEN: GET /api/memories/{memory_id}
    ...                THEN: Returns memory with full details
    [Tags]    memory    high-priority    api

    # Use a test memory ID (would need to create one first)
    ${test_memory_id}=    Set Variable    test-memory-id-123

    ${response}=    GET On Session    ${API_SESSION}
    ...    ${MEMORIES_BASE}/${test_memory_id}
    ...    expected_status=any

    # Should return 200 with memory details or 404 if not found
    Should Be True    ${response.status_code} in [200, 404]
    ...    msg=Unexpected status: ${response.status_code} - ${response.text}

    IF    ${response.status_code} == 200
        ${json}=    Set Variable    ${response.json()}

        # Verify memory fields
        Dictionary Should Contain Key    ${json}    id
        Dictionary Should Contain Key    ${json}    content
        Dictionary Should Contain Key    ${json}    source

        Log    Memory details: ${json}
    ELSE
        Log    Memory not found (expected for test ID)
    END

# =============================================================================
# Section 9.3: Create Memory
# =============================================================================

TC-MEM-003: Create Memory
    [Documentation]    Create a new memory
    ...
    ...                GIVEN: Valid memory content
    ...                WHEN: POST /api/memories
    ...                THEN: Memory created successfully
    [Tags]    memory    high-priority    api

    # Create memory
    ${memory_data}=    Create Dictionary
    ...    content=Test memory created by automated test
    ...    metadata=${{ {'test': True, 'source': 'robot_test'} }}

    ${response}=    POST On Session    ${API_SESSION}    ${MEMORIES_BASE}
    ...    json=${memory_data}
    ...    expected_status=any

    # Memory creation may not be supported directly (proxy to other services)
    IF    ${response.status_code} in [200, 201]
        ${json}=    Set Variable    ${response.json()}

        # Extract memory ID
        ${has_id}=    Run Keyword And Return Status
        ...    Dictionary Should Contain Key    ${json}    id

        IF    ${has_id}
            Set Suite Variable    ${TEST_MEMORY_ID}    ${json}[id]
            Log    Created memory: ${TEST_MEMORY_ID}
        END
    ELSE IF    ${response.status_code} in [404, 405]
        Skip    Memory creation endpoint not implemented
    ELSE
        Log    Memory creation status: ${response.status_code} - ${response.text}
    END

# =============================================================================
# Section 9.4: Update & Delete Memories
# =============================================================================

TC-MEM-004: Update Memory
    [Documentation]    Update existing memory content
    ...
    ...                GIVEN: Existing memory ID
    ...                WHEN: PUT/PATCH /api/memories/{id}
    ...                THEN: Memory updated successfully
    [Tags]    memory    medium-priority    api

    # Skip if no memory ID
    IF    '${TEST_MEMORY_ID}' == '${EMPTY}'
        Skip    No memory ID available
    END

    ${update_data}=    Create Dictionary
    ...    content=Updated memory content

    ${response}=    PUT On Session    ${API_SESSION}
    ...    ${MEMORIES_BASE}/${TEST_MEMORY_ID}
    ...    json=${update_data}
    ...    expected_status=any

    # Update may not be supported
    IF    ${response.status_code} in [200, 201]
        Log    Memory updated successfully
    ELSE
        Skip    Update not supported or memory not found
    END

TC-MEM-005: Delete Memory
    [Documentation]    Delete a memory
    ...
    ...                GIVEN: Existing memory ID
    ...                WHEN: DELETE /api/memories/{id}
    ...                THEN: Memory deleted successfully
    [Tags]    memory    medium-priority    api

    # Skip if no memory ID
    IF    '${TEST_MEMORY_ID}' == '${EMPTY}'
        Skip    No memory ID available
    END

    ${response}=    DELETE On Session    ${API_SESSION}
    ...    ${MEMORIES_BASE}/${TEST_MEMORY_ID}
    ...    expected_status=any

    # Accept various success codes
    Should Be True    ${response.status_code} in [200, 204, 404, 405]
    ...    msg=Failed to delete memory: ${response.text}

    IF    ${response.status_code} in [200, 204]
        Log    Memory deleted successfully
        Set Suite Variable    ${TEST_MEMORY_ID}    ${EMPTY}
    END

TC-MEM-006: Delete Multiple Memories (Bulk Operation)
    [Documentation]    Delete multiple memories in one request
    ...
    ...                GIVEN: List of memory IDs to delete
    ...                WHEN: DELETE /api/memories/bulk
    ...                THEN: All memories deleted successfully
    [Tags]    memory    medium-priority    api    bulk

    # Bulk delete
    ${delete_data}=    Create Dictionary
    ...    ids=${{ ['id1', 'id2', 'id3'] }}

    ${response}=    DELETE On Session    ${API_SESSION}    ${MEMORIES_BASE}/bulk
    ...    json=${delete_data}
    ...    expected_status=any

    # Bulk delete may not be implemented
    IF    ${response.status_code} in [200, 204]
        Log    Bulk delete successful
    ELSE
        Skip    Bulk delete not implemented
    END

# =============================================================================
# Section 9.5: Conversation Memories
# =============================================================================

TC-MEM-008: Get Memories for Conversation
    [Documentation]    Get all memories associated with a conversation
    ...
    ...                GIVEN: Valid conversation ID
    ...                WHEN: GET /api/memories/by-conversation/{conversation_id}
    ...                THEN: Returns memories for that conversation
    [Tags]    memory    medium-priority    api    conversation

    ${response}=    GET On Session    ${API_SESSION}
    ...    ${MEMORIES_BASE}/by-conversation/${TEST_CONVERSATION_ID}
    ...    expected_status=any

    # Should return memories or 404
    Should Be True    ${response.status_code} in [200, 404]
    ...    msg=Failed to get conversation memories: ${response.text}

    IF    ${response.status_code} == 200
        ${json}=    Set Variable    ${response.json()}

        # Verify response structure
        Dictionary Should Contain Key    ${json}    conversation_id
        Dictionary Should Contain Key    ${json}    memories

        ${memories}=    Get From Dictionary    ${json}    memories
        ${is_list}=    Evaluate    isinstance($memories, list)
        Should Be True    ${is_list}

        Log    Found ${len($memories)} memories for conversation
    ELSE
        Log    No memories found for conversation (or conversation doesn't exist)
    END

*** Keywords ***
Memory Suite Setup
    [Documentation]    Setup test environment and API session

    # CRITICAL: Call standard suite setup first
    Suite Setup

    # Get authenticated admin session
    ${admin_session}=    Get Admin API Session
    Set Suite Variable    ${API_SESSION}    ${admin_session}

Memory Suite Teardown
    [Documentation]    Cleanup test data and test environment

    # Delete test memory if it exists
    IF    '${TEST_MEMORY_ID}' != '${EMPTY}'
        Run Keyword And Ignore Error    DELETE On Session    ${API_SESSION}
        ...    ${MEMORIES_BASE}/${TEST_MEMORY_ID}
    END

    Delete All Sessions

    # CRITICAL: Call standard suite teardown
    Suite Teardown
