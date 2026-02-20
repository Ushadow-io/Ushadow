# Test Environment Setup

Test environment runs isolated services on different ports to avoid conflicts with development.

**DEFAULT MODE**: Dev mode - keeps containers running for fast iteration (~5s per test run).

## Test Modes

| Mode | Command | Use Case | Cleanup |
|------|---------|----------|---------|
| **Dev** (default) | `make test` | Local development | Keeps containers running |
| **Rebuild** | `make test-rebuild` | After code changes | Keeps containers running |
| **Prod** | `make test-prod` | CI/CD pipelines | Full cleanup after tests |

**Dev mode workflow** (recommended):
1. Run `make test` - containers start automatically
2. Run again - instant! (containers reused)
3. Containers stay running between test runs
4. Run `make stop` when done (end of day)

## Quick Start

### Dev Mode (Default - Fastest)
```bash
cd robot_tests

# Run tests - containers start automatically and stay running
make test

# Run again - instant (containers already up!)
make test

# Run specific suite
make test-keycloak
```

### After Code Changes
```bash
# Rebuild containers and run tests
make test-rebuild
```

### CI/CD Mode (Full Cleanup)
```bash
# Fresh environment with full cleanup after
make test-prod
```

### Manual Container Management
```bash
# Start containers manually
make start

# Run tests (fast - no container startup)
make test-quick

# Stop containers (saves logs)
make stop
```

## Test Environment Ports

The test environment uses **different ports** from development:

| Service | Dev Port | Test Port | URL |
|---------|----------|-----------|-----|
| Keycloak | 8081 | **8181** | http://localhost:8181 |
| MongoDB | 27017 | **27118** | mongodb://localhost:27118 |
| Redis | 6379 | **6480** | redis://localhost:6480 |
| Postgres (Keycloak DB) | 5432 | **5433** | postgres://localhost:5433 |

**Test Credentials:**
- Keycloak Admin: `admin` / `admin`

## Running Tests

### From Command Line

```bash
# Full test run (starts containers + runs tests)
make test

# Quick test run (assumes containers already running)
make test-quick

# Run specific test file
robot --outputdir results api/keycloak_registration.robot
```

### From VSCode

**Prerequisites:**
1. **Install Extension**: "Robot Framework Language Server"
2. **Start Containers Once**: Run in terminal: `cd robot_tests && make start`
   - Containers stay running in background
   - Only need to start once per session
   - Or run VSCode task: Cmd+Shift+P → "Tasks: Run Task" → "Start Robot Test Containers"

**Running Tests:**
1. **Open Test File**: Open any `.robot` file in `robot_tests/api/`
2. **Run Test**: Click "Run Test" codelens above test case or press F5
3. **View Results**: Check terminal for test output

**VSCode Run Configurations:**
- "Robot: Run Current Test" - Runs the entire test file
- "Robot: Run Current Test Case" - Runs selected test case only
- "Robot: Run All Keycloak Tests" - Runs all Keycloak tests

**Development Workflow:**
1. Start containers once: `cd robot_tests && make start`
2. Edit tests in VSCode
3. Run tests with F5 or codelens (instant - no container restart)
4. Repeat steps 2-3 as needed
5. Stop containers when done: `cd robot_tests && make stop`

## Environment Variables

Test environment variables are defined in `.env.test`:

```bash
TEST_KEYCLOAK_PORT=8181    # Test Keycloak port
BACKEND_PORT=8290          # Backend API port (production instance)
TEST_MONGO_PORT=27118      # Test MongoDB port
TEST_REDIS_PORT=6480       # Test Redis port
```

These are automatically loaded by:
- `make` commands (via export in Makefile)
- VSCode launch configurations (via `env` in launch.json)
- Test scripts (via `source` in setup scripts)

## Container Management

```bash
make start          # Start test containers (or reuse if healthy)
make stop           # Stop containers (saves logs)
make restart        # Restart containers
make rebuild        # Fresh rebuild with volume cleanup
make status         # Show container status
make logs           # View logs (SERVICE=keycloak-test)
make clean          # Stop containers and remove volumes
```

**Logs are automatically saved** when stopping containers to `logs/YYYY-MM-DD_HH-MM-SS/`.

## Troubleshooting

### Containers Won't Start

```bash
make status          # Check current state
make clean           # Full cleanup
make start           # Start fresh
```

### Tests Can't Connect to Keycloak

```bash
# Check if Keycloak is running and healthy
curl http://localhost:8181/realms/master

# Check container logs
make logs SERVICE=keycloak-test

# Restart containers
make restart
```

### Port Conflicts

If ports are already in use:

```bash
# Find what's using the port
lsof -i :8181

# Stop the conflicting service or change TEST_KEYCLOAK_PORT in .env.test
```

### VSCode Tests Not Running

1. Check Robot Framework extension is installed
2. Verify `.vscode/settings.json` has `robot.variables` configured
3. Check test containers are running: `make status`
4. View test output in VSCode terminal

## Development Workflow

**Recommended workflow for iterating on tests:**

1. Start containers once: `make start`
2. Edit test files in VSCode
3. Run tests from VSCode (F5 or codelens)
4. View results in VSCode terminal
5. Keep containers running between test runs
6. Only rebuild when needed: `make rebuild`

**For CI/CD:**

```bash
# Clean run (suitable for CI)
make clean
make test
```

## Test Isolation

Each test run uses:
- ✅ Isolated test database (`test_db` in MongoDB)
- ✅ Separate Keycloak instance with test realm
- ✅ Independent Redis instance
- ✅ No interference with development environment

## Architecture

```
robot_tests/
├── .env.test                    # Test environment variables
├── docker-compose-test.yml      # Test service definitions
├── setup-test-containers.sh     # Container startup script
├── teardown-test-containers.sh  # Container cleanup script
├── Makefile                     # Test commands
├── api/                         # API test suites
│   └── keycloak_registration.robot
└── resources/                   # Reusable keywords
    └── auth_keywords.robot
```

Tests automatically use test environment via:
1. Environment variables in `.env.test`
2. Robot Framework variables (e.g., `${KEYCLOAK_PORT}`)
3. Default values that prefer test ports

## Next Steps

- [ ] Add test backend container to `docker-compose-test.yml`
- [ ] Create more test suites in `api/`
- [ ] Add mobile tests in `mobile/`
- [ ] Add feature tests in `features/`
