*** Settings ***
Documentation    Memory Feedback API Tests
...              Generated from: specs/features/memory-feedback.testcases.md
...
...              Test Cases Covered:
...              - TC-MF-012: Submit True Feedback via API
...              - TC-MF-013: Submit Correction via API
...              - TC-MF-014: API Validation - Missing Corrected Text
...              - TC-MF-015: API Validation - Invalid Memory ID

Library          RequestsLibrary
Library          Collections
Library          String

Suite Setup      Create Session    api    ${BACKEND_URL}    verify=False
Suite Teardown   Delete All Sessions

*** Variables ***
${BACKEND_URL}        http://localhost:8000
${VALID_MEMORY_ID}    507f1f77bcf86cd799439011
${INVALID_MEMORY_ID}  000000000000000000000000
${AUTH_TOKEN}         Bearer test_jwt_token_here


*** Test Cases ***
TC-MF-012: Submit True Feedback via API
    [Documentation]    Test POST /api/memories/{id}/feedback with feedback_type="true"
    [Tags]    api    no_secrets    critical

    # Given: Valid authentication and memory ID
    ${headers}=    Create Dictionary
    ...    Authorization=${AUTH_TOKEN}
    ...    Content-Type=application/json

    ${payload}=    Create Dictionary
    ...    feedback_type=true

    # When: Submit feedback
    ${response}=    POST On Session    api
    ...    /api/memories/${VALID_MEMORY_ID}/feedback
    ...    json=${payload}
    ...    headers=${headers}
    ...    expected_status=200

    # Then: Verify response
    Should Be Equal As Strings    ${response.status_code}    200
    Dictionary Should Contain Key    ${response.json()}    memory_id
    Dictionary Should Contain Key    ${response.json()}    status
    Dictionary Should Contain Key    ${response.json()}    feedback_count
    Should Be Equal    ${response.json()}[feedback_count][true]    ${1}


TC-MF-013: Submit Correction via API
    [Documentation]    Test POST /api/memories/{id}/feedback with correction
    [Tags]    api    no_secrets    critical

    # Given: Correction payload
    ${headers}=    Create Dictionary
    ...    Authorization=${AUTH_TOKEN}
    ...    Content-Type=application/json

    ${payload}=    Create Dictionary
    ...    feedback_type=correction
    ...    corrected_text=The meeting was on Tuesday, not Monday

    # When: Submit correction
    ${response}=    POST On Session    api
    ...    /api/memories/${VALID_MEMORY_ID}/feedback
    ...    json=${payload}
    ...    headers=${headers}
    ...    expected_status=200

    # Then: Verify response shows corrected status
    Should Be Equal    ${response.json()}[status]    corrected
    Dictionary Should Contain Key    ${response.json()}    feedback_count


TC-MF-014: API Validation - Missing Corrected Text
    [Documentation]    Verify API returns 400 when corrected_text is missing
    [Tags]    api    no_secrets    negative

    # Given: Correction without corrected_text
    ${headers}=    Create Dictionary
    ...    Authorization=${AUTH_TOKEN}
    ...    Content-Type=application/json

    ${payload}=    Create Dictionary
    ...    feedback_type=correction

    # When/Then: Request should fail with 400
    ${response}=    POST On Session    api
    ...    /api/memories/${VALID_MEMORY_ID}/feedback
    ...    json=${payload}
    ...    headers=${headers}
    ...    expected_status=400

    # Verify error message
    Should Contain    ${response.json()}[error]    corrected_text is required


TC-MF-015: API Validation - Invalid Memory ID
    [Documentation]    Verify API returns 404 for non-existent memory
    [Tags]    api    no_secrets    negative

    # Given: Non-existent memory ID
    ${headers}=    Create Dictionary
    ...    Authorization=${AUTH_TOKEN}
    ...    Content-Type=application/json

    ${payload}=    Create Dictionary
    ...    feedback_type=true

    # When/Then: Request should fail with 404
    ${response}=    POST On Session    api
    ...    /api/memories/${INVALID_MEMORY_ID}/feedback
    ...    json=${payload}
    ...    headers=${headers}
    ...    expected_status=404

    # Verify error message
    Should Contain    ${response.json()}[error]    Memory not found
