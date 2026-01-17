# Robot Framework Tests

Quick start guide for writing and running tests.

## 🚀 Quick Start

### 1. Find Existing Keywords (Always Search First!)

```bash
./find_keyword.sh "what you need"
```

**Example:**
```bash
./find_keyword.sh "service"     # Find service keywords
./find_keyword.sh "config"      # Find config keywords
./find_keyword.sh "backup"      # Find backup keywords
```

### 2. Write Your Test

```robot
*** Settings ***
Documentation    My test

# Import only what you need
Resource    resources/auth_keywords.robot
Resource    resources/service_config_keywords.robot

*** Test Cases ***
Test Config Update
    # Authenticate
    ${session}=    Get Admin API Session

    # Update (auto-validates 200 - no manual status check needed!)
    ${updates}=    Create Dictionary    database=test-db
    Update Service Config    ${session}    chronicle    ${updates}

    # Verify (inline with clear message)
    ${config}=    Get Service Config    ${session}    chronicle
    Should Be Equal    ${config}[database]    test-db
    ...    msg=Config should have new database value
```

### 3. Run Your Test

```bash
# Run all tests
robot tests/

# Run specific test
robot tests/my_test.robot

# Run tests with tag
robot --include critical tests/
```

---

## 📁 Project Structure

```
robot_tests/
├── README.md                    # ← You are here (start here!)
├── find_keyword.sh              # ← Search for keywords
├── fixtures/                    # Test data
│   ├── configs/                 # Service config fixtures
│   └── responses/               # Mock API responses
├── resources/                   # Reusable keywords
│   ├── KEYWORD_INDEX.md         # ← All keywords reference
│   ├── auth_keywords.robot      # Authentication
│   ├── service_config_keywords.robot  # Service config API
│   ├── config_file_keywords.robot     # Config files
│   ├── file_keywords.robot      # File management
│   └── service_keywords.robot   # Service lifecycle
└── tests/                       # Test files
    ├── example_best_practices.robot  # ← Copy this template
    └── service_config_scenarios.robot
```

---

## 🔍 Finding Keywords

### Method 1: Search Tool (Fastest)

```bash
./find_keyword.sh "service config"
```

### Method 2: Keyword Index

```bash
cat resources/KEYWORD_INDEX.md
```

### Method 3: Browse Resource Files

```bash
ls resources/*.robot
cat resources/service_config_keywords.robot
```

---

## ✅ Best Practices

### DO's

✅ **Use `expected_status` (no manual status checks)**
```robot
${response}=    GET On Session    session    /api/endpoint
...             expected_status=200
```

✅ **Import only what you need**
```robot
Resource    resources/auth_keywords.robot
Resource    resources/service_config_keywords.robot
```

✅ **Search before creating keywords**
```bash
./find_keyword.sh "what I need"
```

✅ **Verify inline in tests (with clear messages)**
```robot
Should Be Equal    ${actual}    ${expected}
...    msg=Clear description of what should be true
```

✅ **Use test fixtures for data**
```robot
${config}=    Load YAML File    ${FIXTURES_DIR}/configs/test_config.yaml
```

### DON'Ts

❌ **Don't manually check status codes**
```robot
# Bad - redundant!
${response}=    GET On Session    session    /api/endpoint
Should Be Equal As Integers    ${response.status_code}    200
```

❌ **Don't import everything**
```robot
# Bad - imports all keywords
Resource    resources/api_keywords.robot  # DEPRECATED
```

❌ **Don't create keywords without searching**
```robot
# Bad - might already exist!
# Always run ./find_keyword.sh first
```

❌ **Don't hide verifications in keywords**
```robot
# Bad - what does this check?
Verify Config Is Correct    ${config}

# Good - clear inline verification
Should Be Equal    ${config}[database]    test-db
...    msg=Database should match expected value
```

---

## 📖 Common Patterns

### Pattern: Test with Authentication

```robot
*** Settings ***
Resource    resources/auth_keywords.robot
Resource    resources/service_config_keywords.robot

*** Test Cases ***
My Test
    ${session}=    Get Admin API Session
    ${config}=     Get Service Config    ${session}    chronicle
    Should Be Equal    ${config}[database]    ushadow
```

### Pattern: Test with Fixtures

```robot
*** Variables ***
${FIXTURES_DIR}    ${CURDIR}/fixtures

*** Test Cases ***
Test With Fixture Data
    ${test_data}=    Load YAML File    ${FIXTURES_DIR}/configs/minimal_config.yaml
    Update Service Config    ${session}    chronicle    ${test_data}
```

### Pattern: Test with File Verification

```robot
*** Test Cases ***
Test Config Written To File
    ${updates}=    Create Dictionary    database=test-db
    Update Service Config    ${session}    chronicle    ${updates}

    Sleep    100ms    # Give file time to write
    ${config}=    Read Config File    ${CONFIG_FILE}
    Should Be Equal    ${config}[service_preferences][chronicle][database]    test-db
```

### Pattern: Suite Setup with Backup/Restore

```robot
*** Settings ***
Resource    resources/auth_keywords.robot
Resource    resources/file_keywords.robot

Suite Setup      Suite Setup
Suite Teardown   Suite Teardown

*** Keywords ***
Suite Setup
    Backup Config Files    ${OVERRIDES_FILE}    ${SECRETS_FILE}
    ${session}=    Get Admin API Session
    Set Suite Variable    ${admin_session}    ${session}

Suite Teardown
    Restore Config Files    ${OVERRIDES_FILE}    ${SECRETS_FILE}
    Delete All Sessions
```

---

## 🎯 Keyword Organization

Keywords are organized by purpose:

| File | Purpose | When to Use |
|------|---------|-------------|
| `auth_keywords.robot` | Authentication, sessions | Need to authenticate |
| `service_config_keywords.robot` | Service config API | Get/update service configs |
| `config_file_keywords.robot` | Config file operations | Read/write YAML files |
| `file_keywords.robot` | File management | Backup/restore files |
| `service_keywords.robot` | Service lifecycle | Start/stop/check services |

**See:** `resources/KEYWORD_INDEX.md` for complete list of all keywords

---

## ➕ Adding New Keywords

### Workflow

1. **Search first** (required!)
   ```bash
   ./find_keyword.sh "what I need"
   ```

2. **Choose correct file**
   - Authentication → `auth_keywords.robot`
   - Service config API → `service_config_keywords.robot`
   - Config files → `config_file_keywords.robot`
   - File operations → `file_keywords.robot`
   - Service management → `service_keywords.robot`

3. **Add with documentation**
   ```robot
   *** Keywords ***
   My New Keyword
       [Documentation]    Clear description
       ...                Arguments: arg1, arg2
       ...                Returns: result
       ...                Example: | ${r}= | My New Keyword | a | b |
       [Arguments]    ${arg1}    ${arg2}
       # Implementation
       [Return]    ${result}
   ```

4. **Update KEYWORD_INDEX.md**

---

## 🏃 Running Tests

```bash
# Run all tests
robot tests/

# Run specific file
robot tests/service_config_scenarios.robot

# Run specific test
robot --test "Test Update Via API" tests/service_config_scenarios.robot

# Run by tag
robot --include critical tests/
robot --include integration tests/

# Generate report in custom location
robot --outputdir results/ tests/

# Run with custom variables
robot --variable API_URL:http://localhost:8001 tests/
```

---

## 🐛 Debugging

### Add Logging

```robot
Log    Current value: ${variable}
Log Many    ${dict}
Log To Console    Debug message
```

### Run Single Test

```robot
robot --test "My Specific Test" tests/my_test.robot
```

### Dry Run (Check Syntax)

```bash
robot --dryrun tests/
```

---

## 📚 Documentation

### In This Directory

| Document | Purpose |
|----------|---------|
| `README.md` | This file - start here |
| `find_keyword.sh` | Search for keywords |
| `resources/KEYWORD_INDEX.md` | All keywords reference |
| `tests/example_best_practices.robot` | Template to copy |

### Full Guidelines

| Document | Purpose |
|----------|---------|
| `../docs/TESTING_GUIDELINES.md` | Complete best practices |
| `../docs/KEYWORD_ORGANIZATION.md` | Keyword organization guide |

---

## ❓ FAQ

**Q: How do I find if a keyword exists?**
```bash
./find_keyword.sh "keyword name"
```

**Q: Where do I put test-specific keywords?**
In the test file itself, in a `*** Keywords ***` section. Only move to resources when 2+ tests need it.

**Q: Do I need to check status codes?**
No! Use `expected_status=200` parameter. RequestsLibrary auto-validates.

**Q: Which resource file should I import?**
Only import what your test needs. Check `resources/KEYWORD_INDEX.md` to see what's in each file.

**Q: Can I still use api_keywords.robot?**
Yes for backward compatibility, but new tests should import specific files.

---

## 🎯 Quick Tips

1. **Always search for keywords first** - `./find_keyword.sh`
2. **No manual status checks** - use `expected_status`
3. **Verify inline in tests** - clear error messages
4. **Import only what you need** - specific resource files
5. **Use fixtures for test data** - `fixtures/` directory
6. **Copy from examples** - `tests/example_best_practices.robot`

---

## 🔗 Quick Links

- [All Keywords](resources/KEYWORD_INDEX.md) - Complete keyword reference
- [Example Test](tests/example_best_practices.robot) - Template to copy
- [Full Guidelines](../docs/TESTING_GUIDELINES.md) - Complete best practices
- [Keyword Organization](../docs/KEYWORD_ORGANIZATION.md) - Detailed guide
