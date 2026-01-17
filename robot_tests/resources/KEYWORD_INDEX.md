# Keyword Index

Quick reference for finding the right keyword for your test.

## 🔍 How to Use This Index

**Before creating a new keyword:**
1. Search this file for what you need (Ctrl+F / Cmd+F)
2. Check if existing keyword can be reused or extended
3. Only create new keyword if nothing fits

**When adding a new keyword:**
1. Add it to the appropriate resource file
2. Update this index
3. Add clear documentation to the keyword

---

## Authentication (auth_keywords.robot)

| Keyword | Purpose | Example |
|---------|---------|---------|
| `Get Admin API Session` | Create authenticated admin session | `${session}= Get Admin API Session` |

**When to use this file:** Authentication, login, session management

---

## Service Configuration (service_config_keywords.robot)

| Keyword | Purpose | Example |
|---------|---------|---------|
| `Get Service Config` | Retrieve service configuration | `${config}= Get Service Config \| session \| chronicle` |
| `Update Service Config` | Update service configuration | `Update Service Config \| session \| chronicle \| ${updates}` |
| `Delete Service Config Override` | Remove configuration override | `Delete Service Config Override \| session \| chronicle \| database` |

**When to use this file:** Service configuration CRUD operations, config API interactions

---

## Configuration Files (config_file_keywords.robot)

| Keyword | Purpose | Example |
|---------|---------|---------|
| `Read Config File` | Read YAML config (returns None if not found) | `${config}= Read Config File \| ${CONFIG_FILE}` |
| `Load YAML File` | Load YAML (fails if not found) | `${fixture}= Load YAML File \| ${FIXTURES_DIR}/test.yaml` |
| `Write YAML File` | Write data to YAML file | `Write YAML File \| ${OUTPUT} \| ${data}` |
| `Verify Config File Contains` | Verify config has expected values | `Verify Config File Contains \| ${FILE} \| section.path \| ${expected}` |

**When to use this file:** Reading/writing config files, loading test fixtures, verifying file contents

---

## File Management (file_keywords.robot)

| Keyword | Purpose | Example |
|---------|---------|---------|
| `Backup Config Files` | Backup files before tests | `Backup Config Files \| ${FILE1} \| ${FILE2}` |
| `Restore Config Files` | Restore files after tests | `Restore Config Files \| ${FILE1} \| ${FILE2}` |
| `Clean Directory` | Remove files matching pattern | `Clean Directory \| ${DIR} \| *.tmp` |
| `Ensure Directory Exists` | Create directory if needed | `Ensure Directory Exists \| ${OUTPUT_DIR}` |
| `Create Temporary File` | Create temp file with content | `${temp}= Create Temporary File \| content \| .yaml` |

**When to use this file:** File backup/restore, directory management, temp files

---

## Service Management (service_keywords.robot)

| Keyword | Purpose | Example |
|---------|---------|---------|
| `Start Service` | Start a Docker service | `${response}= Start Service \| session \| chronicle` |
| `Stop Service` | Stop a Docker service | `${response}= Stop Service \| session \| chronicle` |
| `Restart Service` | Restart a service | `Restart Service \| session \| chronicle` |
| `Get Service Status` | Get service information | `${info}= Get Service Status \| session \| chronicle` |
| `Get Service Environment Variables` | Get service env vars | `${env}= Get Service Environment Variables \| session \| chronicle` |
| `Wait For Service To Be Ready` | Wait for service to start | `Wait For Service To Be Ready \| session \| chronicle \| timeout=30` |

**When to use this file:** Service lifecycle, service inspection, Docker operations

---

## Quick Lookup by Use Case

### I want to...

**Authenticate:**
- `Get Admin API Session` (auth_keywords.robot)

**Work with service configs:**
- Get config: `Get Service Config` (service_config_keywords.robot)
- Update config: `Update Service Config` (service_config_keywords.robot)
- Delete override: `Delete Service Config Override` (service_config_keywords.robot)

**Read/write files:**
- Read config: `Read Config File` (config_file_keywords.robot)
- Load fixture: `Load YAML File` (config_file_keywords.robot)
- Write YAML: `Write YAML File` (config_file_keywords.robot)
- Verify contents: `Verify Config File Contains` (config_file_keywords.robot)

**Backup/restore:**
- Backup: `Backup Config Files` (file_keywords.robot)
- Restore: `Restore Config Files` (file_keywords.robot)

**Manage services:**
- Start: `Start Service` (service_keywords.robot)
- Stop: `Stop Service` (service_keywords.robot)
- Restart: `Restart Service` (service_keywords.robot)
- Check status: `Get Service Status` (service_keywords.robot)
- Wait for ready: `Wait For Service To Be Ready` (service_keywords.robot)

---

## Keyword Naming Conventions

Follow these patterns when creating new keywords:

| Pattern | Purpose | Examples |
|---------|---------|----------|
| `Get <Thing>` | Retrieve data | `Get Service Config`, `Get Service Status` |
| `Create <Thing>` | Create new resource | `Create User`, `Create API Key` |
| `Update <Thing>` | Modify existing resource | `Update Service Config` |
| `Delete <Thing>` | Remove resource | `Delete Service Config Override` |
| `Start/Stop/Restart <Thing>` | Lifecycle operations | `Start Service`, `Restart Service` |
| `Verify <Thing>` | Assertions/validation | `Verify Config File Contains` |
| `Wait For <Condition>` | Polling/waiting | `Wait For Service To Be Ready` |
| `Backup/Restore <Thing>` | State management | `Backup Config Files` |

---

## Resource File Organization

```
robot_tests/resources/
├── auth_keywords.robot              # Authentication, sessions
├── service_config_keywords.robot    # Service configuration API
├── config_file_keywords.robot       # Config file read/write/verify
├── file_keywords.robot              # File management, backup/restore
├── service_keywords.robot           # Service lifecycle, Docker ops
└── KEYWORD_INDEX.md                 # This file
```

### Choosing the Right File

| If your keyword... | Put it in... |
|-------------------|--------------|
| Authenticates or manages sessions | `auth_keywords.robot` |
| Calls service config API endpoints | `service_config_keywords.robot` |
| Reads/writes/parses config files | `config_file_keywords.robot` |
| Manages file system (backup, temp files) | `file_keywords.robot` |
| Manages Docker services | `service_keywords.robot` |

**Rule of thumb:** If you're not sure, search this index for similar operations!

---

## Searching for Existing Keywords

### Method 1: Search this file
```bash
# Search for keywords related to "config"
grep -i "config" robot_tests/resources/KEYWORD_INDEX.md
```

### Method 2: Search all keyword files
```bash
# Find all keywords in resource files
grep "^\[Documentation\]" robot_tests/resources/*.robot -B1
```

### Method 3: Use robot built-in
```bash
# List all keywords from a resource file
robot --doc robot_tests/resources/service_config_keywords.robot
```

### Method 4: IDE/Editor search
- VSCode: Cmd+Shift+F / Ctrl+Shift+F
- Search in: `robot_tests/resources/`
- Search term: Your use case (e.g., "config", "backup", "service")

---

## Adding New Keywords

### 1. Check if keyword exists
Search this index and resource files.

### 2. Choose the right file
Use the organization table above.

### 3. Create keyword with documentation
```robot
*** Keywords ***
My New Keyword
    [Documentation]    Clear one-line description
    ...
    ...                Longer description explaining:
    ...                - What it does
    ...                - When to use it
    ...                - Important behavior
    ...
    ...                Arguments:
    ...                - arg1: Description
    ...                - arg2: Description
    ...
    ...                Returns: What it returns
    ...
    ...                Example:
    ...                | ${result}= | My New Keyword | arg1 | arg2 |

    [Arguments]    ${arg1}    ${arg2}

    # Implementation...

    [Return]    ${result}
```

### 4. Update this index
Add your keyword to the appropriate section with:
- Keyword name
- Brief purpose
- Example usage

### 5. Run documentation check
```bash
# Verify your keyword is documented
robot --dryrun robot_tests/tests/*.robot
```

---

## Common Mistakes

| ❌ Don't | ✅ Do | Why |
|---------|-------|-----|
| Create duplicate keywords | Search index first | Avoid duplication |
| Put everything in one file | Organize by purpose | Easy to find |
| Skip documentation | Document thoroughly | Others need to understand |
| Use vague names | Use clear action verbs | Immediately clear what it does |
| Create single-use keywords | Keep specific logic in tests | Keywords should be reusable |

---

## Need Help?

1. **Can't find the right keyword?**
   - Search this file
   - Check similar test files for patterns
   - Ask in team chat

2. **Not sure which file to use?**
   - Look at the "When to use this file" descriptions
   - Check existing keywords in each file
   - When in doubt, ask!

3. **Want to refactor keywords?**
   - Discuss with team first
   - Check test impact (what breaks?)
   - Update this index after changes
