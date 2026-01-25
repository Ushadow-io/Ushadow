# Testing Guidelines

## Robot Framework Best Practices

### 1. Automatic Status Code Validation

**❌ Don't do this:**
```robot
${response}=    GET On Session    admin_session    /api/endpoint
Should Be Equal As Integers    ${response.status_code}    200
```

**✅ Do this:**
```robot
${response}=    GET On Session    admin_session    /api/endpoint
...             expected_status=200
```

**Why:** RequestsLibrary will automatically fail the test if status doesn't match. Only explicitly check status codes when testing error cases.

**For non-200 expected responses:**
```robot
# Testing a 404 scenario
${response}=    GET On Session    admin_session    /api/nonexistent
...             expected_status=404

# Testing multiple acceptable statuses
${response}=    GET On Session    admin_session    /api/endpoint
...             expected_status=any    # Accepts any status, then check manually
Should Be True    ${response.status_code} in [200, 201, 202]
```

---

### 2. Keyword Organization and Discovery

**CRITICAL:** Always check for existing keywords before creating new ones!

#### ✅ Finding Existing Keywords

**Before creating any keyword:**

1. **Search the keyword index** (fastest method)
   ```bash
   # Open and search KEYWORD_INDEX.md
   open robot_tests/resources/KEYWORD_INDEX.md
   # or use the search script
   ./robot_tests/find_keyword.sh config
   ```

2. **Use the find_keyword.sh script**
   ```bash
   cd robot_tests
   ./find_keyword.sh "service"     # Find service-related keywords
   ./find_keyword.sh "Get"         # Find all getter keywords
   ./find_keyword.sh "backup"      # Find backup keywords
   ```

3. **Search resource files directly**
   ```bash
   grep -r "Get Service" robot_tests/resources/*.robot
   ```

#### ✅ Resource File Organization

Keywords are organized by purpose, not by "type of thing":

```
robot_tests/resources/
├── auth_keywords.robot              # Authentication, sessions
├── service_config_keywords.robot    # Service config API operations
├── config_file_keywords.robot       # Config file read/write/verify
├── file_keywords.robot              # File backup/restore, temp files
├── service_keywords.robot           # Service lifecycle, Docker ops
└── KEYWORD_INDEX.md                 # Complete keyword reference
```

**Choosing the right file:**

| If your keyword... | Put it in... |
|-------------------|--------------|
| Authenticates or manages sessions | `auth_keywords.robot` |
| Calls service config API endpoints | `service_config_keywords.robot` |
| Reads/writes/parses config files | `config_file_keywords.robot` |
| Manages file system operations | `file_keywords.robot` |
| Manages Docker services | `service_keywords.robot` |

**❌ DON'T** create one giant "api_keywords.robot" with everything
**✅ DO** organize keywords by functional area

#### ✅ When to Create New Keywords

Create a new keyword when:
- You can't find an existing keyword that does what you need
- You're using the same 3+ line pattern in multiple tests
- The operation is a clear candidate for reuse

**❌ DON'T** create a keyword for:
- One-time operations specific to a single test
- Simple operations that are clearer inline
- Wrapping a single library call with no added value

#### ✅ Workflow for Adding Keywords

1. **Search first**
   ```bash
   ./robot_tests/find_keyword.sh "what I need"
   ```

2. **Found existing keyword?**
   - Use it as-is, or
   - Extend it if it's almost what you need, or
   - Create new keyword if it's fundamentally different

3. **Choose correct resource file**
   - Use the table above
   - Look at existing keywords in that file
   - When in doubt, ask!

4. **Document thoroughly**
   ```robot
   *** Keywords ***
   My New Keyword
       [Documentation]    One-line description
       ...
       ...                Longer description with:
       ...                - What it does
       ...                - When to use it
       ...                - Important behavior notes
       ...
       ...                Arguments:
       ...                - arg1: Description
       ...                - arg2: Description
       ...
       ...                Returns: Description
       ...
       ...                Example:
       ...                | ${result}= | My New Keyword | arg1 | arg2 |
       [Arguments]    ${arg1}    ${arg2}
       # Implementation...
       [Return]    ${result}
   ```

5. **Update KEYWORD_INDEX.md**
   - Add to appropriate section
   - Include example usage

---

### 3. When to Use Keywords in Test File vs Resource File

#### ✅ Keywords in Resource Files (`resources/*.robot`)

**Purpose:** Reusable actions that multiple tests need

**Examples:**
- API authentication setup
- Common API calls (GET/POST/PUT/DELETE patterns)
- File operations (read config, backup files)
- Service startup/shutdown
- Database setup/teardown

```robot
*** Keywords ***
Get Admin API Session
    [Documentation]    Create authenticated session for admin user
    [Return]    ${session}

Update Service Config
    [Documentation]    Update config for any service
    [Arguments]    ${session}    ${service_id}    ${config_dict}
    [Return]    ${response.json()}

Read Config File
    [Documentation]    Read and parse YAML config file
    [Arguments]    ${file_path}
    [Return]    ${parsed_config}
```

#### ✅ Keywords in Test File (`tests/*.robot`)

**Purpose:** Test-specific logic used only in that test file

**Examples:**
- Complex test setup that's unique to one test suite
- Test-specific teardown logic
- Helper keywords that combine multiple actions for THIS test only

```robot
*** Keywords ***
Setup Database Migration Test Environment
    [Documentation]    Complex setup only needed for migration tests
    Backup All Config Files
    Create Test Database Schema
    Load Fixture Data    ${TEST_DATA_DIR}/migration_fixtures.yaml

Verify Complete Service Configuration
    [Documentation]    Multi-step verification specific to this test suite
    [Arguments]    ${service_id}    ${expected_config}
    ${merged}=    Get Service Config    admin_session    ${service_id}
    Dictionaries Should Be Equal    ${merged}    ${expected_config}
    ${file_config}=    Read Config File    ${OVERRIDES_FILE}
    Dictionary Should Contain Sub Dictionary    ${file_config}    ${expected_config}
```

#### 🎯 Rule of Thumb

| Location | When to Use |
|----------|-------------|
| **Resource file** | Used by 2+ test files, OR obvious candidate for reuse |
| **Test file** | Used by only this test file, AND unlikely to be reused |

**When in doubt:** Start in test file. Move to resource file when you need it elsewhere.

---

### 4. Handling Test Data and Mocks

#### ✅ Test Data Strategy

**For Integration Tests (Robot Framework):**

1. **Real backend with test database** (Preferred)
   - Run actual backend service
   - Use separate test database
   - Clean state before each test suite

2. **Test data in YAML files**
   ```
   robot_tests/
   ├── fixtures/
   │   ├── valid_service_configs.yaml
   │   ├── invalid_configs.yaml
   │   └── user_test_data.yaml
   ```

3. **Load data in test setup**
   ```robot
   *** Keywords ***
   Load Test Configuration
       [Arguments]    ${fixture_name}
       ${data}=    Load YAML File    ${FIXTURES_DIR}/${fixture_name}.yaml
       [Return]    ${data}
   ```

#### ✅ Mocking Strategies by Test Type

**Integration Tests (Robot Framework):**
- ✅ Mock external services (LLM APIs, third-party APIs)
- ✅ Use test doubles for expensive operations
- ❌ Don't mock your own API endpoints
- ❌ Don't mock database (use real test database)

```robot
*** Keywords ***
Setup LLM API Mock
    [Documentation]    Mock external OpenAI API for testing
    Start Mock Server    http://localhost:8889
    Configure Mock Endpoint    POST    /v1/chat/completions
    ...    response_body=${VALID_LLM_RESPONSE}
    ...    status_code=200
```

**Unit Tests (pytest):**
- ✅ Mock all external dependencies
- ✅ Mock database connections
- ✅ Mock file system operations
- ✅ Use dependency injection

```python
@pytest.fixture
def mock_openai_client():
    """Mock OpenAI client for unit tests."""
    with patch('openai.ChatCompletion.create') as mock:
        mock.return_value = {
            "choices": [{"message": {"content": "test response"}}]
        }
        yield mock

def test_llm_service_chat(mock_openai_client):
    """Unit test with mocked LLM API."""
    result = llm_service.chat("test prompt")
    assert result == "test response"
    mock_openai_client.assert_called_once()
```

#### ✅ Test Data Organization

```
robot_tests/
├── fixtures/
│   ├── configs/
│   │   ├── valid_chronicle_config.yaml
│   │   ├── minimal_service_config.yaml
│   │   └── full_service_config.yaml
│   ├── responses/
│   │   ├── llm_response_success.json
│   │   └── llm_response_error.json
│   └── users/
│       ├── admin_user.yaml
│       └── regular_user.yaml
├── resources/
│   ├── api_keywords.robot
│   ├── config_keywords.robot
│   └── test_data_keywords.robot  # Keywords for loading fixtures
└── tests/
    └── *.robot
```

#### ✅ Loading Test Data in Tests

```robot
*** Settings ***
Variables    ../fixtures/configs/valid_chronicle_config.yaml    # Static variables

*** Test Cases ***
Test With Fixture Data
    [Documentation]    Example of loading test data

    # Load fixture dynamically
    ${test_config}=    Load YAML File    ${FIXTURES_DIR}/configs/minimal_service_config.yaml

    # Use the data
    ${response}=    Update Service Config    admin_session    chronicle    ${test_config}
    ...             expected_status=200
```

#### ✅ Environment-Specific Configuration

```robot
*** Variables ***
# Override these with --variable flags
${API_URL}              http://localhost:8001
${TEST_DATABASE}        ushadow_test
${USE_MOCK_LLM}         ${True}
${FIXTURES_DIR}         ${CURDIR}/../fixtures

*** Keywords ***
Setup Test Environment
    [Documentation]    Configure test environment based on variables

    Run Keyword If    ${USE_MOCK_LLM}    Setup LLM API Mock
    ...    ELSE    Log    Using real LLM API (expensive!)

    Set Suite Variable    ${DB_NAME}    ${TEST_DATABASE}
```

**Run with different configs:**
```bash
# Local development - use mocks
robot --variable USE_MOCK_LLM:True tests/

# CI/CD - real services
robot --variable USE_MOCK_LLM:False --variable API_URL:http://backend:8001 tests/

# Specific test database
robot --variable TEST_DATABASE:ushadow_ci_test tests/
```

---

### 5. Test Isolation Best Practices

#### ✅ Suite-Level Setup/Teardown

**Use for:** Expensive operations needed by all tests in suite

```robot
*** Settings ***
Suite Setup      Suite Setup
Suite Teardown   Suite Teardown

*** Keywords ***
Suite Setup
    [Documentation]    Run once before all tests in suite

    # Backup config files
    Backup Config Files

    # Create authenticated session (reuse across tests)
    ${session}=    Get Admin API Session
    Set Suite Variable    ${admin_session}    ${session}

    # Start mock services if needed
    Run Keyword If    ${USE_MOCK_LLM}    Setup LLM API Mock

Suite Teardown
    [Documentation]    Run once after all tests in suite

    # Restore config files
    Restore Config Files

    # Clean up sessions
    Delete All Sessions

    # Stop mock services
    Run Keyword If    ${USE_MOCK_LLM}    Stop Mock Server
```

#### ✅ Test-Level Setup/Teardown

**Use for:** Ensuring clean state for each individual test

```robot
*** Test Cases ***
Test Database Update Via API
    [Documentation]    Individual test with its own cleanup
    [Setup]    Test Setup
    [Teardown]    Test Teardown

    # Test steps here...

*** Keywords ***
Test Setup
    [Documentation]    Run before each test
    Log    Starting test: ${TEST_NAME}

    # Verify clean state
    Should Not Exist    ${OVERRIDES_FILE}
    Should Not Exist    ${SECRETS_FILE}

Test Teardown
    [Documentation]    Run after each test (even if test fails)
    Log    Completed test: ${TEST_NAME}

    # Clean up test-specific changes
    Remove Test Config Files
    Reset Database State
```

---

### 6. Assertion Best Practices

#### ✅ Use Built-in Expected Status

```robot
# ✅ Good - automatic validation
GET On Session    admin_session    /api/endpoint    expected_status=200

# ❌ Bad - manual validation
${response}=    GET On Session    admin_session    /api/endpoint
Should Be Equal As Integers    ${response.status_code}    200
```

#### ✅ Inline Verifications in Tests

**Per original TESTING_GUIDELINES.md:** Verifications MUST be inline in tests, not abstracted to keywords.

```robot
# ✅ Good - verification inline in test
${config}=    Get Service Config    admin_session    chronicle
Should Be Equal    ${config}[database]    test-db
...    msg=Database should match updated value

# ❌ Bad - verification hidden in keyword
Verify Database Config    chronicle    test-db
```

#### ✅ Descriptive Error Messages

```robot
# ✅ Good - clear failure message
Should Be Equal    ${actual}    ${expected}
...    msg=Database name should be '${expected}' but got '${actual}'

# ❌ Bad - generic message
Should Be Equal    ${actual}    ${expected}
```

#### ✅ Structured Data Assertions

```robot
# For dictionaries - check structure first
Dictionary Should Contain Key    ${config}    service_preferences
...    msg=Config should have 'service_preferences' section

Dictionary Should Contain Key    ${config}[service_preferences]    chronicle
...    msg=Config should have 'chronicle' service configuration

# Then check values
Should Be Equal    ${config}[service_preferences][chronicle][database]    test-db
...    msg=Chronicle database should be 'test-db'
```

---

## Summary: Quick Reference

| Practice | Do This | Not This |
|----------|---------|----------|
| **Status codes** | Use `expected_status=200` | Check `status_code` manually |
| **Resource keywords** | Reusable actions (2+ files) | Everything |
| **Test keywords** | Test-specific logic | Never use test-level keywords |
| **Test data** | Load from fixtures/*.yaml | Hardcode in tests |
| **Mocking** | External APIs only (integration) | Mock your own API |
| **Assertions** | Inline in tests with clear messages | Abstract to keywords |
| **Setup** | Suite setup for expensive ops | Test setup for everything |
| **Teardown** | Always restore clean state | Hope for the best |

---

## Example: Well-Structured Test

```robot
*** Settings ***
Documentation    Service Configuration Tests - Following Best Practices
Library          RequestsLibrary
Resource         ../resources/api_keywords.robot
Variables        ../fixtures/configs/chronicle_defaults.yaml

Suite Setup      Suite Setup
Suite Teardown   Suite Teardown

*** Variables ***
${SERVICE_ID}        chronicle
${FIXTURES_DIR}      ${CURDIR}/../fixtures

*** Test Cases ***
Update Database Via Service Config API
    [Documentation]    Verify database config can be set via API
    [Tags]    integration    config    api

    # Arrange: Load test data
    ${test_config}=    Create Dictionary    database=test-db-new

    # Act: Update via API (auto-validates 200 status)
    Update Service Config    admin_session    ${SERVICE_ID}    ${test_config}

    # Assert: Verify written to overrides file
    File Should Exist    ${OVERRIDES_FILE}
    ${overrides}=    Read Config File    ${OVERRIDES_FILE}

    Should Be Equal    ${overrides}[service_preferences][${SERVICE_ID}][database]    test-db-new
    ...    msg=Override file should contain new database name

*** Keywords ***
Suite Setup
    Backup Config Files
    ${session}=    Get Admin API Session
    Set Suite Variable    ${admin_session}    ${session}

Suite Teardown
    Restore Config Files
    Delete All Sessions
```

This structure is:
- ✅ Readable by non-programmers
- ✅ No redundant status checks
- ✅ Clear separation of reusable vs test-specific keywords
- ✅ Proper test isolation
- ✅ Inline verifications with clear messages
