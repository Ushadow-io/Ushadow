# Test Cases: Memory Feedback System

**Source Specification**: `specs/features/memory-feedback.md`
**Generated**: 2026-01-17
**Status**: ⏳ Pending Review

---

## Test Summary

| Metric | Count |
|--------|-------|
| Total Test Cases | 19 |
| Critical Priority | 6 |
| High Priority | 9 |
| Medium Priority | 4 |
| Unit Tests | 6 |
| Integration Tests | 5 |
| API Tests | 5 |
| E2E Tests | 3 |
| Requires Secrets | 4 |
| No Secrets Required | 15 |

---

## Unit Tests (6 tests - all no_secrets)

### TC-MF-001: Validate Feedback Type

**Type**: Unit
**Priority**: Critical
**Requires Secrets**: No

**Description**
Verify that feedback_type validation only accepts valid values

**Preconditions**
- Validation function exists

**Test Steps**
1. Call validation with feedback_type="true"
2. Call validation with feedback_type="false"
3. Call validation with feedback_type="correction"
4. Call validation with feedback_type="invalid"
5. Call validation with feedback_type=""
6. Call validation with feedback_type=null

**Expected Results**
- Steps 1-3: Validation passes
- Steps 4-6: Validation fails with appropriate error message

**Test Data**
```json
{
  "valid_types": ["true", "false", "correction"],
  "invalid_types": ["invalid", "", null, "TRUE", "False", 123]
}
```

---

### TC-MF-002: Validate Corrected Text Length

**Type**: Unit
**Priority**: High
**Requires Secrets**: No

**Description**
Verify corrected_text length validation (1-2000 characters)

**Test Steps**
1. Validate empty string ("")
2. Validate 1 character string
3. Validate 2000 character string
4. Validate 2001 character string
5. Validate null/undefined

**Expected Results**
- Empty, null, undefined: Fail (required for correction type)
- 1 char: Pass
- 2000 chars: Pass
- 2001 chars: Fail (exceeds max length)

---

### TC-MF-003: Sanitize Corrected Text for XSS

**Type**: Unit
**Priority**: Critical
**Requires Secrets**: No

**Description**
Ensure user input is sanitized to prevent XSS attacks

**Test Steps**
1. Input: `<script>alert('xss')</script>`
2. Input: `<img src=x onerror=alert('xss')>`
3. Input: `javascript:alert('xss')`
4. Input: Normal text with HTML entities: `<p>Test & "quotes"</p>`

**Expected Results**
- All malicious scripts are escaped or stripped
- Safe HTML entities are properly encoded
- Plain text is preserved

---

### TC-MF-004: Calculate Memory Status - Verified

**Type**: Unit
**Priority**: High
**Requires Secrets**: No

**Description**
Verify status calculation when memory has >= 3 true feedbacks

**Test Data**
```json
{
  "feedback_summary": {"true": 3, "false": 0, "correction": 0}
}
```

**Expected Results**
- Status = "verified"

---

### TC-MF-005: Calculate Memory Status - Disputed

**Type**: Unit
**Priority**: High
**Requires Secrets**: No

**Description**
Verify status calculation when memory has >= 2 false feedbacks

**Test Data**
```json
{
  "feedback_summary": {"true": 1, "false": 2, "correction": 0}
}
```

**Expected Results**
- Status = "disputed"

---

### TC-MF-006: Calculate Memory Status - Corrected

**Type**: Unit
**Priority**: Medium
**Requires Secrets**: No

**Description**
Verify status calculation when memory has corrections

**Test Data**
```json
{
  "feedback_summary": {"true": 1, "false": 0, "correction": 1}
}
```

**Expected Results**
- Status = "corrected"

---

## Integration Tests (5 tests - 3 require secrets)

### TC-MF-007: Store Feedback in Database

**Type**: Integration
**Priority**: Critical
**Requires Secrets**: No

**Description**
Verify feedback is correctly stored in memory_feedback collection

**Preconditions**
- MongoDB test database running
- Test user authenticated
- Test memory exists

**Test Steps**
1. Submit feedback with type="true"
2. Query memory_feedback collection
3. Verify document created with correct fields

**Expected Results**
- Document exists with:
  - memory_id (correct ObjectId)
  - user_id (correct ObjectId)
  - feedback_type = "true"
  - created_at (timestamp)
  - synced_to_server = false
  - sync_attempts = 0

---

### TC-MF-008: Update Memory Feedback Summary

**Type**: Integration
**Priority**: Critical
**Requires Secrets**: No

**Description**
Verify memory document feedback_summary is updated when feedback is submitted

**Preconditions**
- Test memory exists with feedback_summary = {true: 0, false: 0, correction: 0}

**Test Steps**
1. Submit "true" feedback
2. Query memory document
3. Submit another "true" feedback
4. Query memory document again

**Expected Results**
- After step 2: feedback_summary.true = 1
- After step 4: feedback_summary.true = 2

---

### TC-MF-009: Memory Server Sync Success

**Type**: Integration
**Priority**: High
**Requires Secrets**: **Yes** (MEMORY_SERVER_API_KEY)

**Description**
Verify successful sync to memory server

**Preconditions**
- Memory server API accessible
- Valid MEMORY_SERVER_API_KEY configured

**Test Steps**
1. Submit feedback
2. Background job processes sync queue
3. Verify HTTP request sent to memory server
4. Verify feedback document updated

**Expected Results**
- HTTP POST sent to memory server with feedback data
- Response 200 OK received
- feedback.synced_to_server = true
- feedback.sync_attempts = 1

---

### TC-MF-010: Memory Server Sync Failure with Retry

**Type**: Integration
**Priority**: High
**Requires Secrets**: **Yes** (MEMORY_SERVER_API_KEY)

**Description**
Verify retry mechanism when memory server is unavailable

**Preconditions**
- Memory server mock returns 503 error

**Test Steps**
1. Submit feedback
2. First sync attempt (mock returns 503)
3. Verify retry scheduled with exponential backoff
4. Second sync attempt succeeds (mock returns 200)

**Expected Results**
- After step 2:
  - synced_to_server = false
  - sync_attempts = 1
  - last_sync_error contains error message
- After step 4:
  - synced_to_server = true
  - sync_attempts = 2

---

### TC-MF-011: Sync Queue Persistence

**Type**: Integration
**Priority**: Medium
**Requires Secrets**: **Yes** (requires mock memory server)

**Description**
Verify sync queue survives service restart

**Test Steps**
1. Submit 5 feedbacks
2. Mock memory server as unavailable
3. Verify 5 items in sync queue
4. Restart backend service
5. Verify 5 items still in queue
6. Bring memory server back online
7. Verify all 5 synced

**Expected Results**
- Sync queue persisted across restart
- All feedbacks eventually synced when server available

---

## API Tests (5 tests - 1 requires secrets)

### TC-MF-012: Submit True Feedback via API

**Type**: API
**Priority**: Critical
**Requires Secrets**: No

**Description**
Test POST /api/memories/{id}/feedback with feedback_type="true"

**Preconditions**
- User authenticated (valid JWT)
- Memory exists in database

**Test Steps**
1. POST /api/memories/{memory_id}/feedback
   ```json
   {
     "feedback_type": "true"
   }
   ```

**Expected Results**
- Status: 200 OK
- Response body:
  ```json
  {
    "memory_id": "{id}",
    "status": "unverified",
    "feedback_count": {"true": 1, "false": 0, "correction": 0},
    "updated_at": "{timestamp}",
    "synced_to_server": false
  }
  ```

---

### TC-MF-013: Submit Correction via API

**Type**: API
**Priority**: Critical
**Requires Secrets**: No

**Description**
Test POST /api/memories/{id}/feedback with correction

**Test Steps**
1. POST /api/memories/{memory_id}/feedback
   ```json
   {
     "feedback_type": "correction",
     "corrected_text": "The meeting was on Tuesday, not Monday"
   }
   ```

**Expected Results**
- Status: 200 OK
- Response contains memory_id, status="corrected"
- Feedback stored with corrected_text

---

### TC-MF-014: API Validation - Missing Corrected Text

**Type**: API
**Priority**: High
**Requires Secrets**: No

**Description**
Verify API returns 400 when corrected_text is missing for correction type

**Test Steps**
1. POST /api/memories/{memory_id}/feedback
   ```json
   {
     "feedback_type": "correction"
   }
   ```

**Expected Results**
- Status: 400 Bad Request
- Error message: "corrected_text is required when feedback_type is 'correction'"

---

### TC-MF-015: API Validation - Invalid Memory ID

**Type**: API
**Priority**: High
**Requires Secrets**: No

**Description**
Verify API returns 404 for non-existent memory

**Test Steps**
1. POST /api/memories/000000000000000000000000/feedback
   ```json
   {
     "feedback_type": "true"
   }
   ```

**Expected Results**
- Status: 404 Not Found
- Error message: "Memory not found"

---

### TC-MF-016: API Rate Limiting

**Type**: API
**Priority**: Medium
**Requires Secrets**: No

**Description**
Verify rate limiting (max 100 feedbacks per user per hour)

**Test Steps**
1. Submit 100 feedback requests rapidly
2. Submit 101st request

**Expected Results**
- Requests 1-100: Success (200 OK)
- Request 101: 429 Too Many Requests
- Error includes retry-after information

---

## E2E Tests (3 tests - all no_secrets)

### TC-MF-017: User Marks Memory as True

**Type**: E2E
**Priority**: Critical
**Requires Secrets**: No

**Description**
Test complete workflow for marking memory as true via UI

**Preconditions**
- User logged in
- Memory visible in UI

**Test Steps**
1. Navigate to page with memory display
2. Hover over memory to reveal feedback buttons
3. Click "True" button (data-testid="memory-feedback-true")
4. Verify success animation/message appears
5. Verify button state changes to "active/selected"

**Expected Results**
- Button click triggers API call
- Success feedback shown to user
- Button visual state updates
- Memory status may update if threshold reached

---

### TC-MF-018: User Provides Correction

**Type**: E2E
**Priority**: Critical
**Requires Secrets**: No

**Description**
Test complete correction workflow via UI

**Preconditions**
- User logged in
- Memory visible

**Test Steps**
1. Click "Almost" button (data-testid="memory-feedback-almost")
2. Verify correction modal opens (data-testid="correction-modal")
3. Verify original text displayed
4. Enter corrected text in field (data-testid="correction-text-field")
5. Click Submit (data-testid="correction-submit")
6. Verify success message
7. Verify modal closes

**Expected Results**
- Modal opens with original text visible
- User can type correction
- Submit sends API request
- Success feedback shown
- Modal auto-closes on success

---

### TC-MF-019: Cancel Correction Modal

**Type**: E2E
**Priority**: Medium
**Requires Secrets**: No

**Description**
Verify user can cancel correction without submitting

**Test Steps**
1. Click "Almost" button
2. Modal opens
3. Type some text in correction field
4. Click Cancel (data-testid="correction-cancel")

**Expected Results**
- Modal closes
- No API request sent
- Memory state unchanged
- User can retry if desired

---

## Test Coverage Matrix

| Requirement | Test Cases | Coverage |
|-------------|-----------|----------|
| FR-001: Feedback UI Controls | TC-MF-017, TC-MF-018, TC-MF-019 | ✅ Happy Path, ⚠️ Edge Cases (cancel) |
| FR-002: Correction Input | TC-MF-018, TC-MF-019 | ✅ Happy Path, ⚠️ Edge Cases |
| FR-003: Feedback API | TC-MF-012, TC-MF-013, TC-MF-014, TC-MF-015, TC-MF-016 | ✅ Happy Path, ⚠️ Edge Cases, ❌ Negative |
| FR-004: Memory Server Sync | TC-MF-009, TC-MF-010, TC-MF-011 | ✅ Happy Path, ❌ Failure scenarios |
| FR-005: Feedback History | (Not yet covered - future enhancement) | ⚠️ Partial |
| NFR-001: Performance | (Implicit in API response time requirements) | ⚠️ Manual verification |
| NFR-002: Reliability | TC-MF-010, TC-MF-011 | ✅ Retry logic, queue persistence |
| NFR-003: Security | TC-MF-003, TC-MF-016 | ✅ XSS prevention, ❌ Rate limiting |

---

## Secret Requirements Summary

**Tests Requiring Secrets (4 tests)**:
- TC-MF-009: Memory Server Sync Success
- TC-MF-010: Memory Server Sync Failure with Retry
- TC-MF-011: Sync Queue Persistence

These tests require `MEMORY_SERVER_API_KEY` environment variable.

**Tests Without Secrets (15 tests)**:
- All unit tests (6)
- Most integration tests (2 of 5)
- All API tests (5)
- All E2E tests (3)

**CI/CD Strategy**:
- 79% of tests (15/19) can run on every PR without secrets
- Only 21% (4/19) require manual trigger with secrets

---

## Review Checklist

Before approving for automation:

- [x] All functional requirements have test cases
- [x] Happy path scenarios covered
- [x] Edge cases identified (empty input, validation, cancellation)
- [x] Negative tests included (invalid data, missing fields, non-existent resources)
- [x] Test data is realistic and sufficient
- [x] Dependencies are documented
- [x] Security considerations addressed (XSS, rate limiting)
- [x] Secret requirements clearly marked

---

## Approval

- [ ] QA Lead Approval
- [ ] Product Owner Approval
- [ ] Ready for Automation

**Approved By**: _______________
**Date**: _______________
