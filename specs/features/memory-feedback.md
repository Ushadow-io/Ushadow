# Example: Memory Feedback Feature

This document demonstrates the test automation workflow using a real feature.

## Feature Request

**User Request**: "We want to be able to easily and quickly indicate if a memory is true, false or almost (where it can be corrected). The updated info will make it's way to the memory server where the facts can get updated."

## Step 1: Run `/spec` Command

The spec-agent would analyze this request and create a structured specification.

Let me simulate what the spec-agent would produce:

---

# Feature Specification: Memory Feedback System

**Created**: 2026-01-17
**Status**: 📝 Draft
**Priority**: High
**Target Release**: v0.2.0

---

## Overview

Users need a way to provide quick feedback on memories (facts) stored in the system, indicating whether they are correct, incorrect, or need correction. This feedback will be propagated to the memory server to improve fact accuracy over time.

---

## User Stories

### Primary User Story

**As a** user reviewing AI-generated memories
**I want** to quickly mark memories as true, false, or needing correction
**So that** the system learns and improves its fact accuracy over time

### Additional User Stories

1. **As a** user, **I want** to provide corrected information when a memory is almost correct, **so that** the system has the accurate version
2. **As a** developer, **I want** feedback to propagate to the memory server automatically, **so that** the knowledge base stays up-to-date

---

## Functional Requirements

### FR-001: Memory Feedback UI

**Priority**: Must Have
**Description**: Provide UI controls to mark a memory as true, false, or "almost" (needs correction)

**Acceptance Criteria**:
- [ ] Each memory display has three action buttons: True, False, Almost
- [ ] Clicking True marks memory as verified
- [ ] Clicking False marks memory as incorrect
- [ ] Clicking Almost opens correction interface
- [ ] Actions have visual feedback (confirmation, loading state)
- [ ] Actions are accessible (keyboard shortcuts optional)

**Dependencies**:
- Memory display component exists

### FR-002: Correction Input

**Priority**: Must Have
**Description**: When user selects "Almost", provide interface to input corrected information

**Acceptance Criteria**:
- [ ] Modal/inline editor appears when "Almost" is clicked
- [ ] Shows original memory text
- [ ] Provides text field for corrected version
- [ ] Has submit and cancel buttons
- [ ] Validates that correction is not empty
- [ ] Shows feedback on successful submission

**Dependencies**:
- FR-001

### FR-003: Feedback API Endpoint

**Priority**: Must Have
**Description**: Backend API to receive and process memory feedback

**Acceptance Criteria**:
- [ ] POST /api/memories/{memory_id}/feedback endpoint exists
- [ ] Accepts feedback type: "true", "false", "correction"
- [ ] Accepts optional corrected_text for "correction" type
- [ ] Validates memory_id exists
- [ ] Requires authentication
- [ ] Returns 200 on success with updated memory status
- [ ] Returns 400 for invalid input
- [ ] Returns 404 if memory doesn't exist

**Dependencies**:
- Memory storage/database

### FR-004: Memory Server Integration

**Priority**: Must Have
**Description**: Propagate feedback to memory server for fact updates

**Acceptance Criteria**:
- [ ] API endpoint sends feedback to memory server via HTTP/gRPC
- [ ] Handles memory server connection failures gracefully
- [ ] Retries failed updates with exponential backoff
- [ ] Logs all feedback attempts
- [ ] Updates local memory status regardless of memory server status
- [ ] Queues feedback if memory server is unavailable

**Dependencies**:
- Memory server API available
- FR-003

### FR-005: Feedback History

**Priority**: Should Have
**Description**: Track feedback history for each memory

**Acceptance Criteria**:
- [ ] Store timestamp of each feedback action
- [ ] Store user who provided feedback
- [ ] Store feedback type and correction text
- [ ] Allow retrieval of feedback history per memory
- [ ] Show feedback count in memory display (e.g., "Verified by 3 users")

**Dependencies**:
- Database schema for feedback history

---

## Non-Functional Requirements

### NFR-001: Response Time

**Category**: Performance
**Description**: Feedback submission should feel instant

**Acceptance Criteria**:
- [ ] API responds within 200ms for 95% of requests
- [ ] UI shows loading state if response takes >500ms
- [ ] Background sync to memory server doesn't block user

### NFR-002: Reliability

**Category**: Reliability
**Description**: Feedback should never be lost, even if memory server is down

**Acceptance Criteria**:
- [ ] Feedback is persisted locally before sending to memory server
- [ ] Failed transmissions are retried automatically
- [ ] Admin dashboard shows failed sync queue

### NFR-003: Security

**Category**: Security
**Description**: Only authenticated users can provide feedback

**Acceptance Criteria**:
- [ ] All feedback endpoints require valid JWT token
- [ ] Rate limiting: max 100 feedback actions per user per hour
- [ ] Input sanitization on corrected text

---

## User Interface / API Design

### Endpoints

```http
POST /api/memories/{memory_id}/feedback
Authorization: Bearer {jwt_token}

Request:
{
  "feedback_type": "true" | "false" | "correction",
  "corrected_text": "string (required if feedback_type=correction)"
}

Response (200 OK):
{
  "memory_id": "string",
  "status": "verified" | "disputed" | "corrected",
  "updated_at": "timestamp",
  "synced_to_server": boolean
}

Error Responses:
- 400 Bad Request: Invalid feedback_type or missing corrected_text
- 401 Unauthorized: Missing or invalid token
- 404 Not Found: Memory doesn't exist
- 429 Too Many Requests: Rate limit exceeded
```

```http
GET /api/memories/{memory_id}/feedback-history
Authorization: Bearer {jwt_token}

Response (200 OK):
{
  "memory_id": "string",
  "feedback_count": {
    "true": 5,
    "false": 1,
    "correction": 2
  },
  "history": [
    {
      "user_id": "string",
      "feedback_type": "true",
      "timestamp": "timestamp"
    }
  ]
}
```

### UI Components

**MemoryFeedbackButtons Component**:
- Three icon buttons: ✓ (True), ✗ (False), ✏ (Almost)
- Hover states showing tooltips
- Active state when feedback given
- data-testid: `memory-feedback-true`, `memory-feedback-false`, `memory-feedback-almost`

**CorrectionModal Component**:
- Modal dialog with original text display
- Textarea for corrected version
- Submit and Cancel buttons
- data-testid: `correction-modal`, `correction-text-field`, `correction-submit`

**User Flow**:
1. User views memory in UI
2. User clicks True/False/Almost button
3. If Almost:
   a. Correction modal appears
   b. User enters corrected text
   c. User clicks Submit
4. System shows success confirmation
5. Background: API sends feedback to backend
6. Background: Backend syncs to memory server

---

## Data Model

### New Entity: MemoryFeedback

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | ObjectId | Yes | Unique identifier |
| memory_id | ObjectId | Yes | Reference to memory |
| user_id | ObjectId | Yes | User who gave feedback |
| feedback_type | enum | Yes | "true", "false", "correction" |
| corrected_text | string | No | Only for correction type |
| created_at | timestamp | Yes | When feedback was given |
| synced_to_server | boolean | Yes | Whether sent to memory server |
| sync_attempts | number | Yes | Number of sync retries |
| last_sync_error | string | No | Error message if sync failed |

**Indexes**:
- memory_id: Query feedback for specific memory
- user_id + created_at: User activity tracking
- synced_to_server: Find pending syncs

### Modified Entity: Memory

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| status | enum | Yes | "unverified", "verified", "disputed", "corrected" |
| verification_count | number | Yes | Number of "true" feedbacks |
| dispute_count | number | Yes | Number of "false" feedbacks |
| last_updated | timestamp | Yes | Last feedback timestamp |

---

## Business Logic

### Validation Rules

1. **feedback_type**: Must be one of: "true", "false", "correction"
2. **corrected_text**: Required when feedback_type="correction", max 1000 characters
3. **memory_id**: Must exist in database
4. **Rate limiting**: Max 100 feedback actions per user per hour

### Status Calculation

```python
def calculate_memory_status(memory):
    if memory.verification_count >= 3:
        return "verified"
    elif memory.dispute_count >= 2:
        return "disputed"
    elif memory.has_corrections:
        return "corrected"
    else:
        return "unverified"
```

---

## Integration Points

### External Services

| Service | Purpose | Authentication | Requires Secrets? |
|---------|---------|----------------|-------------------|
| Memory Server | Fact storage and updates | API Key | Yes |

### Internal Services

| Service | Purpose |
|---------|---------|
| Auth Service | User authentication |
| Database (MongoDB) | Store feedback and memories |

---

## Security Considerations

### Authentication/Authorization

- [x] Who can access: Authenticated users only
- [x] What permissions: Any authenticated user can provide feedback
- [x] How verified: JWT token validation

### Data Protection

- [x] Sensitive data: User feedback, corrected memories
- [x] Protection: Standard HTTPS, JWT authentication
- [x] Compliance: User feedback is considered user-generated content

### Input Validation

- [x] Corrected text sanitized to prevent XSS
- [x] Memory ID validated to prevent injection
- [x] Rate limiting prevents abuse

---

## Error Handling

### Expected Error Scenarios

| Scenario | Error Code | Message | User Action |
|----------|------------|---------|-------------|
| Invalid memory_id | 404 | "Memory not found" | Check memory exists |
| Missing corrected_text | 400 | "Correction text required" | Provide text |
| Rate limit exceeded | 429 | "Too many requests, try again later" | Wait before retrying |
| Memory server down | 200* | "Feedback saved, will sync when server available" | None (transparent) |

*Note: User-facing success even if memory server sync fails (queued for retry)

---

## Testing Considerations

### Test Data Requirements

- Sample memories with different statuses
- Multiple users for concurrent feedback testing
- Mock memory server API responses

### Test Environment

- Backend API server running
- MongoDB instance
- Mock memory server (for integration tests)
- Frontend UI (for E2E tests)

---

## Open Questions

1. Should users be able to see who verified/disputed a memory?
2. What happens if multiple users provide conflicting corrections?
3. Should there be a review/approval process for corrections before syncing?
4. How should we handle feedback on already-deleted memories?

---

## Out of Scope

- Memory server implementation (assumes it exists)
- Admin interface for reviewing disputed memories
- Batch feedback operations
- Undo feedback functionality

---

## References

- Memory Server API Documentation: (to be linked)
- Authentication System: `docs/AUTH.md`

---

## Approval

- [ ] Product Owner
- [ ] Tech Lead
- [ ] QA Lead

**Approved By**: _______________
**Date**: _______________
