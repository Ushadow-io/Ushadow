# Test Environment Setup

Test environment runs isolated services on different ports to avoid conflicts with development.

**DEFAULT MODE**: Dev mode — keeps containers running for fast iteration (~5s per test run).

## Authentication

Tests authenticate through **Casdoor** using a real password-grant JWT — no local auth bypass.

On suite setup, `resources/setup/init.py` provisions the test Casdoor instance by running
`casdoor-db-setup` and `casdoor-provision` from the ushadow-sdk against `.env.test`.
All Robot Framework tests then obtain a real Casdoor JWT via:

```
POST http://localhost:8282/api/login/oauth/access_token
  grant_type=password, client_id=ushadow, client_secret=test-casdoor-secret
  username=admin, password=ushadow
```

This means every test exercises the full auth flow — JWKS validation, user sync — not a stub.

## Test Modes

| Mode | Command | Use Case | Cleanup |
|------|---------|----------|---------|
| **Dev** (default) | `make test` | Local development | Keeps containers running |
| **Rebuild** | `make test-rebuild` | After code changes | Keeps containers running |
| **Prod** | `make test-prod` | CI/CD pipelines | Full cleanup after tests |

**Dev mode workflow** (recommended):
1. Run `make test` — containers start automatically
2. Run again — instant! (containers reused)
3. Containers stay running between test runs
4. Run `make stop` when done

## Quick Start

### Dev Mode (Default — Fastest)
```bash
cd robot_tests

# Run tests - containers start automatically and stay running
make test

# Run again - instant (containers already up!)
make test

# Run specific suite
robot --outputdir results api/api_settings_hierarchy.robot
```

### After Code Changes
```bash
make test-rebuild
```

### CI/CD Mode (Full Cleanup)
```bash
make test-prod
```

### Manual Container Management
```bash
make start       # Start containers
make test-quick  # Run tests (no container startup)
make stop        # Stop containers
```

## Test Environment Ports

| Service | Dev Port | Test Port | URL |
|---------|----------|-----------|-----|
| Backend | 8000 | **8200** | http://localhost:8200 |
| Casdoor | 8082 | **8282** | http://localhost:8282 |
| MongoDB | 27017 | **27118** | mongodb://localhost:27118 |
| Redis | 6379 | **6480** | redis://localhost:6480 |
| Postgres (Casdoor DB) | 5432 | **5433** | postgres://localhost:5433 |

**Test Credentials:**
- Casdoor built-in admin: `admin` / `123` (Casdoor bootstrap default, set by `CASDOOR_ADMIN_*`)
- App-level admin for ROPC/tests: `admin` / `ushadow` (provisioned by `casdoor-provision`, set by `CASDOOR_APP_ADMIN_*`)

## Running Tests

```bash
# Full test run (starts containers + runs tests)
make test

# Quick test run (assumes containers already running)
make test-quick

# Run specific test file
robot --outputdir results api/api_settings_hierarchy.robot

# Run single test case
robot --test "TC-001*" --outputdir results api/api_settings_hierarchy.robot

# Debug with verbose HTTP logging
robot --loglevel DEBUG --outputdir results api/
```

## Environment Variables

Defined in `.env.test` and `resources/setup/test_env.py`:

```bash
TEST_BACKEND_PORT=8200
TEST_CASDOOR_PORT=8282
TEST_MONGO_PORT=27118
TEST_REDIS_PORT=6480
TEST_POSTGRES_PORT=5433
CASDOOR_CLIENT_ID=ushadow
CASDOOR_CLIENT_SECRET=test-casdoor-secret
```

## Container Management

```bash
make start          # Start test containers (or reuse if healthy)
make stop           # Stop containers
make restart        # Restart containers
make rebuild        # Fresh rebuild with volume cleanup
make status         # Show container status
make logs           # View logs (SERVICE=casdoor-test)
make clean          # Stop containers and remove volumes
```

## Troubleshooting

### Containers Won't Start

```bash
make status          # Check current state
make clean           # Full cleanup
make start           # Start fresh
```

### Tests Can't Connect to Backend

```bash
# Check if backend is healthy
curl http://localhost:8200/health

# Check container logs
make logs SERVICE=backend-test

# Restart containers
make restart
```

### Casdoor Auth Failures

```bash
# Check Casdoor health
curl http://localhost:8282/api/health

# Check Casdoor logs (JWT/JWKS issues)
make logs SERVICE=casdoor-test

# Re-provision test environment (idempotent)
cd robot_tests && python -m ushadow_casdoor.provision --env-file .env.test --config-dir ../config/casdoor
```

### Port Conflicts

```bash
# Find what's using the port
lsof -i :8282

# Change port in .env.test and docker-compose-test.yml if needed
```

## Architecture

```
robot_tests/
├── .env.test                        # Test environment variables
├── docker-compose-test.yml          # Test service definitions
├── Makefile                         # Test commands
├── requirements.txt                 # Python dependencies (inc. ushadow-sdk)
├── api/                             # API test suites
│   ├── api_settings_hierarchy.robot
│   ├── api_settings_deployment.robot
│   ├── service_env_deployment.robot
│   ├── service_configs_deployment.robot
│   └── api_tailscale.robot
└── resources/                       # Reusable keywords and libraries
    ├── auth_keywords.robot          # Authenticated session creation (Casdoor ROPC JWT)
    ├── EnvConfig.py                 # URL helpers
    └── setup/
        ├── init.py                  # Provisions test Casdoor (casdoor-provision via ushadow-sdk)
        ├── suite_setup.robot        # Standard Suite Setup/Teardown
        ├── test_env.py              # Variables file (ports, URLs, credentials)
        └── suppress_warnings.py
```

## Test Isolation

Each test run uses:
- Isolated MongoDB database (`ushadow_test`)
- Separate Casdoor instance on port 8282
- Independent Redis instance on port 6480
- No interference with development environment
