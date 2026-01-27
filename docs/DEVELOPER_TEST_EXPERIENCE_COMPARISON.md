## Developer Test Experience Comparison

**Scenario:** A developer wants to add 4 new integration tests without needing to understand all the existing codebase.

**Starting Point:** Plain English test scenarios:
```
Test1: update database via compose
Test2: update database via .env
Test3: update database via service config API
Test4: test secret override via service config API
```

**Goal:** How easy is it for a developer to turn these into working tests?

---

## Key Observations

### Test Discovery & Understanding

#### Robot Framework ✅ WIN
**Finding What You Need:**
- Look in `resources/` folder for reusable keywords
- Read keyword documentation in resource files
- Keywords have descriptive names like `Get Service Config`, `Update Service Config`
- TESTING_GUIDELINES.md explicitly lists resource files by domain

**Example - Finding authentication:**
```robot
# Clear where to look: resources/api_keywords.robot
${session}=    Get Admin API Session
```

#### pytest ❌ HARDER
**Finding What You Need:**
- Must understand pytest fixtures system
- Look in `conftest.py` for fixtures
- Need to understand fixture dependencies
- Less obvious what's available without IDE

**Example - Finding authentication:**
```python
# Need to know about fixtures, conftest.py, and dependency injection
def test_something(client, auth_headers):
    # auth_headers comes from conftest.py
    # But how did I know it exists?
```

**Verdict:** Robot Framework wins for discoverability 🤖

---

### Adding Your First Test

#### Robot Framework

**Step 1:** Start with plain English
```robot
Test Update Database Via Service Config API
    # step 1: get service configuration via API and get database name
    # step 2: verify that it matches that set in config-defaults.yaml
    # step 3: change database name with service config API
    # step 4: read config via API to verify merge
    # step 5: check writes to the overrides file
```

**Step 2:** Check `resources/api_keywords.robot` for existing keywords
```robot
# Found these keywords:
- Get Admin API Session
- Update Service Config
- Get Service Config
- Read Config File
```

**Step 3:** Implement using found keywords + inline assertions
```robot
Test Update Database Via Service Config API
    [Documentation]    Verify database config via API → overrides flow
    [Tags]    integration    config-merge    api

    # Arrange
    ${initial_config}=    GET On Session    admin_session    /api/settings/service-configs/${SERVICE_ID}
    ${database}=    Get From Dictionary    ${initial_config.json()}    database

    # Act
    ${config_updates}=    Create Dictionary    database=${TEST_DATABASE}
    ${response}=    PUT On Session    admin_session    /api/settings/service-configs/${SERVICE_ID}    json=${config_updates}

    # Assert - Inline in test (per guidelines)
    Should Be Equal As Integers    ${response.status_code}    200
    File Should Exist    ${OVERRIDES_FILE}
    ${overrides}=    Read Config File    ${OVERRIDES_FILE}
    Should Be Equal    ${overrides}[service_preferences][${SERVICE_ID}][database]    ${TEST_DATABASE}
```

**Time to working test:** ~15 minutes
- 5 min reading resource files
- 10 min writing test

**Lines of code:** ~25 lines

---

#### pytest

**Step 1:** Start with plain English (same)
```python
def test_update_database_via_service_config_api():
    """
    1. Get initial database config
    2. Verify it matches defaults
    3. Update via API
    4. Verify written to overrides
    """
```

**Step 2:** Need to understand pytest fixtures
- Open `conftest.py` to see available fixtures
- Understand `client`, `auth_headers`, fixture dependencies
- Need to create new fixtures for config files

**Step 3:** Create fixtures (first time cost)
```python
@pytest.fixture
def config_dir():
    return Path(__file__).parent.parent.parent.parent.parent.parent / "config"

@pytest.fixture
def overrides_file(config_dir):
    return config_dir / "config.overrides.yaml"

# ... more fixtures ...
```

**Step 4:** Implement test
```python
def test_update_database_via_service_config_api(
    client: TestClient,
    auth_headers,
    defaults_file,
    overrides_file,
    backup_config_files
):
    # Arrange
    response = client.get(
        f"/api/settings/service-configs/{self.SERVICE_ID}",
        headers=auth_headers
    )
    initial_config = response.json()
    database = initial_config.get("database", self.DEFAULT_DATABASE)

    # Act
    config_updates = {"database": self.TEST_DATABASE}
    response = client.put(
        f"/api/settings/service-configs/{self.SERVICE_ID}",
        json=config_updates,
        headers=auth_headers
    )

    # Assert
    assert response.status_code == 200
    assert overrides_file.exists()

    with open(overrides_file) as f:
        overrides = yaml.safe_load(f)

    assert overrides["service_preferences"][self.SERVICE_ID]["database"] == self.TEST_DATABASE
```

**Time to working test:** ~30 minutes (first time)
- 10 min understanding fixtures
- 10 min creating fixtures
- 10 min writing test

**Subsequent tests:** ~10 minutes (fixtures already exist)

**Lines of code:** ~35 lines (test) + ~30 lines (fixtures, one-time)

**Verdict:** Robot Framework wins for first test 🤖, pytest wins for subsequent tests 🐍

---

## Side-by-Side: Adding Test from Scratch

### Robot Framework

```robot
*** Test Cases ***
Test Update Database Via Service Config API
    [Documentation]    Database config via API → overrides flow
    [Tags]    integration    api

    # Arrange: Get initial config
    ${initial}=    GET On Session    admin_session
    ...            /api/settings/service-configs/${SERVICE_ID}
    Should Be Equal As Integers    ${initial.status_code}    200
    ${database}=    Get From Dictionary    ${initial.json()}    database

    # Act: Update via API
    ${updates}=    Create Dictionary    database=${TEST_DATABASE}
    ${response}=    PUT On Session    admin_session
    ...             /api/settings/service-configs/${SERVICE_ID}
    ...             json=${updates}
    Should Be Equal As Integers    ${response.status_code}    200

    # Assert: Verify in overrides file
    File Should Exist    ${OVERRIDES_FILE}
    ${overrides}=    Read Config File    ${OVERRIDES_FILE}
    Should Be Equal    ${overrides}[service_preferences][${SERVICE_ID}][database]
    ...                ${TEST_DATABASE}
    ...                msg=Override file should contain new database
```

**Pros:**
- ✅ Clear structure (Arrange-Act-Assert visible)
- ✅ Readable without understanding framework internals
- ✅ Uses existing `Read Config File` keyword from resources
- ✅ Assertions inline (per guidelines)
- ✅ Can copy-paste and modify for similar tests
- ✅ No need to understand fixtures

**Cons:**
- ❌ Verbose syntax (`${var}`, `...` for line continuation)
- ❌ Dictionary access awkward: `${dict}[key1][key2]`
- ❌ Need to know Robot Framework assertion keywords

---

### pytest

```python
def test_update_database_via_service_config_api(
    client, auth_headers, overrides_file, backup_config_files
):
    """Database config via API → overrides flow"""

    # Arrange: Get initial config
    response = client.get(
        "/api/settings/service-configs/chronicle",
        headers=auth_headers
    )
    assert response.status_code == 200
    database = response.json()["database"]

    # Act: Update via API
    updates = {"database": "test-db"}
    response = client.put(
        "/api/settings/service-configs/chronicle",
        json=updates,
        headers=auth_headers
    )
    assert response.status_code == 200

    # Assert: Verify in overrides file
    assert overrides_file.exists()

    with open(overrides_file) as f:
        overrides = yaml.safe_load(f)

    assert overrides["service_preferences"]["chronicle"]["database"] == "test-db"
```

**Pros:**
- ✅ Native Python (familiar to developers)
- ✅ IDE autocomplete works
- ✅ Fixtures handle setup/teardown automatically
- ✅ Can use debugger (breakpoints)
- ✅ More concise for Python developers

**Cons:**
- ❌ **Must understand fixtures** - where do `client`, `auth_headers` come from?
- ❌ **Must create fixtures first** - `overrides_file`, `backup_config_files`
- ❌ **Hidden magic** - fixtures, dependency injection not obvious
- ❌ **Can't copy-paste as easily** - need to understand fixture dependencies

---

## Critical Difference: The "Just Add a Test" Experience

### Robot Framework: Low Friction ✅

**Developer thinks:** "I need to test updating database config"

**Developer does:**
1. ✅ Opens `service_config_scenarios.robot`
2. ✅ Copies similar test as template
3. ✅ Modifies test name and steps
4. ✅ Checks `resources/api_keywords.robot` for available keywords
5. ✅ Writes inline assertions (per guidelines)
6. ✅ Runs test: `robot robot_tests/tests/service_config_scenarios.robot`

**Barriers encountered:** None - just needs to learn Robot syntax

**Total time:** 10-15 minutes

---

### pytest: Higher Initial Friction ❌

**Developer thinks:** "I need to test updating database config"

**Developer does:**
1. Opens `test_service_config_scenarios.py`
2. Tries to copy similar test as template
3. ❌ **BLOCKED:** "What is `backup_config_files`? Where is it defined?"
4. Opens `conftest.py` to find fixtures
5. ❌ **CONFUSED:** "There's no `backup_config_files` here, where is it?"
6. Searches codebase, finds it's in the test file itself
7. ❌ **REALIZATION:** "I need to create my own fixtures"
8. Creates fixtures for config files
9. Understands fixture dependency chain
10. Writes test
11. Runs test: `pytest tests/integration/test_service_config_scenarios.py`

**Barriers encountered:**
- Understanding fixtures
- Creating fixtures
- Understanding fixture dependencies
- Non-obvious where things are defined

**Total time (first time):** 30-40 minutes
**Total time (subsequent):** 10-15 minutes (once fixtures exist)

---

## Guideline Adherence

### Robot Framework: Follows TESTING_GUIDELINES.md ✅

**✅ Verifications inline in tests:**
```robot
Should Be Equal    ${database}    ${TEST_DATABASE}
...    msg=Merged config should reflect new database name
```

**✅ Setup keywords in resources:**
```robot
${session}=    Get Admin API Session    # From api_keywords.robot
```

**✅ Readable by domain experts:**
```robot
Test Update Database Via Service Config API
    ${database}=    Get Service Config    admin_session    chronicle
    Should Be Equal    ${database}[name]    test-db
```

**✅ Descriptive assertion messages:**
```robot
Should Be Equal    ${result}[success]    ${True}
...    msg=API should return success=True
```

**✅ Arrange-Act-Assert visible:**
```robot
# Arrange: Get initial config
${initial}=    GET On Session    admin_session    /api/config

# Act: Update config
${response}=    PUT On Session    admin_session    /api/config

# Assert: Verify change
Should Be Equal As Integers    ${response.status_code}    200
```

---

### pytest: Partially Follows Guidelines

**✅ Assertions inline:**
```python
assert response.status_code == 200
assert overrides_file.exists()
```

**❌ Setup is "hidden" in fixtures:**
```python
def test_something(client, auth_headers, backup_config_files):
    # Where do these come from? Not obvious!
```

**⚠️ Readable by Python developers only:**
```python
def test_update_database_via_service_config_api(
    client, auth_headers, overrides_file, backup_config_files
):
    # Readable IF you understand pytest fixtures
    # Not readable to non-Python developers
```

**✅ Descriptive messages:**
```python
assert result["success"] is True, "API should return success=True"
```

**✅ Arrange-Act-Assert visible:**
```python
# Arrange
response = client.get("/api/config", headers=auth_headers)

# Act
response = client.put("/api/config", json=updates, headers=auth_headers)

# Assert
assert response.status_code == 200
```

---

## Documentation & Onboarding

### Robot Framework ✅

**For new team member:**

1. Read `TESTING_GUIDELINES.md` (5 min)
2. Read `robot_tests/resources/api_keywords.robot` (10 min)
3. Look at existing test as example (5 min)
4. Write first test (15 min)

**Total onboarding:** ~35 minutes

**Resources needed:**
- ✅ TESTING_GUIDELINES.md
- ✅ Resource files (self-documenting with docstrings)
- ✅ Existing tests as examples

---

### pytest ❌

**For new team member:**

1. Read pytest documentation (30 min)
2. Understand pytest fixtures (30 min)
3. Read `conftest.py` to understand available fixtures (15 min)
4. Understand FastAPI TestClient (15 min)
5. Look at existing test (10 min)
6. Understand fixture dependencies (15 min)
7. Write first test (20 min)

**Total onboarding:** ~2 hours 15 minutes

**Resources needed:**
- ✅ pytest docs (external)
- ✅ FastAPI testing docs (external)
- ⚠️ conftest.py (requires understanding fixtures)
- ⚠️ Existing tests (but fixtures not obvious)
- ❌ **Missing:** Clear guide for adding tests

---

## Comparison Summary

| Criterion | Robot Framework | pytest | Winner |
|-----------|-----------------|--------|--------|
| **Finding existing keywords/fixtures** | 9/10 | 6/10 | 🤖 Robot |
| **Understanding test structure** | 9/10 | 5/10 | 🤖 Robot |
| **Adding first test** | 8/10 | 4/10 | 🤖 Robot |
| **Adding subsequent tests** | 8/10 | 8/10 | 🤝 Tie |
| **Copying existing tests** | 9/10 | 6/10 | 🤖 Robot |
| **Understanding dependencies** | 9/10 | 4/10 | 🤖 Robot |
| **Debugging** | 5/10 | 10/10 | 🐍 pytest |
| **IDE support** | 6/10 | 10/10 | 🐍 pytest |
| **Onboarding time** | 35 min | 2h 15min | 🤖 Robot |
| **Following guidelines** | 10/10 | 7/10 | 🤖 Robot |

**Overall for "ease of adding tests":** **Robot Framework wins 7-2-1**

---

## The Hidden Complexity Problem

### pytest's Fixture System

**Looks simple:**
```python
def test_something(client, auth_headers, overrides_file):
    # Test code
```

**Actually requires understanding:**
1. What is a fixture?
2. Where are fixtures defined?
3. How does dependency injection work?
4. What fixtures are available?
5. How to create new fixtures?
6. Fixture scope (function/class/module/session)
7. Fixture dependencies
8. Fixture order of execution

**This is an 8-layer mental model** before you can add a test.

---

### Robot Framework's Keyword System

**Looks simple:**
```robot
Test Something
    ${session}=    Get Admin API Session
    ${config}=     Get Service Config    ${session}    chronicle
```

**Actually requires understanding:**
1. Keywords exist in resource files
2. Resource files are imported in *** Settings ***
3. Keywords can be reused

**This is a 3-layer mental model.**

---

## Real Developer Quotes (Simulated)

### Robot Framework

> "I looked at an existing test, copied it, changed a few things, and it worked.
> The resource files made it clear what keywords I could use." - Junior Dev

> "The syntax is weird with `${variables}` but once you get used to it,
> it's actually really clear what's happening." - Mid Dev

> "I like that verifications are right there in the test. I don't have to
> hunt for fixture definitions." - Senior Dev

---

### pytest

> "I spent 30 minutes trying to figure out where `backup_config_files`
> comes from before realizing it's a fixture I need to create myself." - Junior Dev

> "The fixture system is powerful once you understand it, but the learning
> curve is steep. I keep forgetting what fixtures are available." - Mid Dev

> "I love pytest's debugging, but for new team members, the fixture magic
> makes it harder to onboard." - Senior Dev

---

## Recommendations

### Use Robot Framework When:

1. ✅ **Team has varying skill levels** - Junior devs, QA without heavy Python experience
2. ✅ **Ease of adding tests is priority** - Want to maximize velocity
3. ✅ **Tests are documentation** - Stakeholders read tests
4. ✅ **Following TESTING_GUIDELINES.md** - Guidelines favor inline verifications
5. ✅ **Minimal onboarding time** - Need people productive quickly

### Use pytest When:

1. ✅ **All devs are experienced Python developers**
2. ✅ **Debugging speed critical** - Complex tests needing breakpoints
3. ✅ **IDE integration important** - Need autocomplete, refactoring
4. ✅ **Unit testing focus** - More unit than integration tests
5. ✅ **Once fixtures are established** - Subsequent tests become easy

---

## Hybrid Approach?

**Best of both worlds:**

1. **Robot Framework** for integration/E2E tests
   - Easy to add
   - Readable
   - Follows guidelines

2. **pytest** for unit tests
   - Fast
   - Python-native
   - Good for testing internal functions

**Example:**
```
tests/
├── integration/          # Robot Framework
│   ├── service_config_scenarios.robot
│   └── resources/
└── unit/                 # pytest
    ├── test_auth_service.py
    └── test_docker_manager.py
```

---

## Final Verdict for Ushadow

**For your stated goal:**
> "The goal is that devs should easily be able to add new tests
> without having to trawl through the code itself."

**Winner: Robot Framework 🤖**

**Reasons:**
1. ✅ Lower barrier to entry
2. ✅ Faster onboarding (35 min vs 2h 15min)
3. ✅ Easier to find what you need (resource files)
4. ✅ Clearer test structure (inline verifications)
5. ✅ Better adherence to TESTING_GUIDELINES.md
6. ✅ No "hidden magic" (fixtures, dependency injection)
7. ✅ Copy-paste friendly

**BUT:** If your team is all senior Python developers who will take time
to set up comprehensive fixtures, pytest becomes competitive for subsequent tests.

**Recommended approach:**
- Start with Robot Framework for integration tests
- Use pytest for unit tests where debugging/speed matter
- Evaluate after 1-2 sprints which feels better for your team
