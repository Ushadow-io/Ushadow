# Ushadow Robot Framework Tests Makefile
# =====================================
#
# Quick Start:
#   make start          # Start test containers
#   make test           # Run all tests
#   make stop           # Stop test containers
#
# Full Test Run:
#   make test           # Start containers + run tests (recommended)

.PHONY: start stop restart rebuild status logs test test-quick test-keycloak lint clean help

# Default target
help:
	@echo "Ushadow Robot Framework Tests"
	@echo "============================="
	@echo ""
	@echo "Container Management:"
	@echo "  make start          Start test containers (or reuse if healthy)"
	@echo "  make stop           Stop containers (saves logs)"
	@echo "  make restart        Restart containers"
	@echo "  make rebuild        Fresh rebuild with volume cleanup"
	@echo "  make status         Show container status"
	@echo "  make logs           View logs (SERVICE=keycloak-test)"
	@echo ""
	@echo "Test Execution:"
	@echo "  make test           Start containers + run all tests"
	@echo "  make test-quick     Run tests (assumes containers running)"
	@echo "  make test-keycloak  Run only Keycloak tests"
	@echo ""
	@echo "Code Quality:"
	@echo "  make lint           Verify tests follow standard setup pattern"
	@echo ""
	@echo "Cleanup:"
	@echo "  make clean          Stop containers and remove volumes"
	@echo ""
	@echo "Test Environment Ports:"
	@echo "  Backend:  http://localhost:8200"
	@echo "  Keycloak: http://localhost:8181 (admin/admin)"
	@echo "  MongoDB:  localhost:27118"
	@echo "  Redis:    localhost:6480"

# Container Management
start:
	@echo "Starting all test containers (including any newly added services)..."
	@docker compose -f docker-compose-test.yml up -d
	@echo ""
	@echo "✓ Test containers started:"
	@docker compose -f docker-compose-test.yml ps --format "  - {{.Service}}: {{.State}}"

stop:
	@echo "Stopping test containers..."
	@docker compose -f docker-compose-test.yml down
	@echo "✓ Containers stopped"

restart: stop start

rebuild:
	@echo "Rebuilding test containers..."
	@docker compose -f docker-compose-test.yml down -v
	@docker compose -f docker-compose-test.yml up -d --build
	@echo "✓ Containers rebuilt"

status:
	@docker compose -f docker-compose-test.yml ps

logs:
	@docker compose -f docker-compose-test.yml logs $(SERVICE)

# Test Execution
test: test-dev

test-dev:
	@echo "Running tests in DEV mode (keeps containers running)..."
	@robot --outputdir results api/

test-rebuild:
	@echo "Running tests with REBUILD (fresh container build)..."
	@REBUILD=true robot --outputdir results api/

test-prod:
	@echo "Running tests in PROD mode (full cleanup)..."
	@TEST_MODE=prod robot --outputdir results api/

test-quick:
	@echo "Running Robot Framework tests (requires containers already running)..."
	@export $$(cat .env.test | grep -v '^#' | xargs) && robot --outputdir results api/

test-keycloak:
	@echo "Running Keycloak tests..."
	@robot --outputdir results api/keycloak_registration.robot

# Linting
lint:
	@echo "Linting Robot Framework tests..."
	@./lint_robot_tests.sh

# Cleanup
clean:
	@docker compose -f docker-compose-test.yml down -v
	@echo "Test containers and volumes removed"
