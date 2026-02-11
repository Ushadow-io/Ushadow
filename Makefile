# ushadow Makefile
# Quick commands for development and deployment
# All compose operations delegate to setup/run.py for single source of truth

.PHONY: help up down restart logs build clean test test-integration test-tdd test-all \
        test-robot test-robot-api test-robot-features test-robot-quick test-robot-critical test-report \
        go install status health dev prod \
        svc-list svc-restart svc-start svc-stop svc-status \
        chronicle-env-export chronicle-build-local chronicle-up-local chronicle-down-local chronicle-dev \
        ushadow-push ushadow-push-local chronicle-push mycelia-push openmemory-push \
        release env-sync env-sync-apply env-info

# Read .env for display purposes only (actual logic is in run.py)
-include .env

# Default target
help:
	@echo "ushadow - AI Orchestration Platform"
	@echo ""
	@echo "Available commands:"
	@echo "  make go           - Quick start (infrastructure + ushadow)"
	@echo "  make dev          - Development mode (Vite HMR + backend)"
	@echo "  make prod         - Production mode (optimized nginx build)"
	@echo "  make up           - Start ushadow application"
	@echo "  make down         - Stop ushadow application"
	@echo "  make restart      - Restart ushadow application"
	@echo "  make logs         - View application logs"
	@echo "  make logs-f       - Follow application logs"
	@echo "  make build        - Rebuild containers (uses DEV_MODE from .env)"
	@echo "  make build-with-tailscale - Build with Tailscale socket (Linux only)"
	@echo "  make clean        - Stop everything and remove volumes"
	@echo "  make status       - Show running containers"
	@echo "  make health       - Check service health"
	@echo ""
	@echo "Infrastructure commands:"
	@echo "  make infra-up     - Start infrastructure (MongoDB, Redis, Qdrant)"
	@echo "  make infra-down   - Stop infrastructure"
	@echo "  make chronicle-up - Start Chronicle backend"
	@echo "  make chronicle-down - Stop Chronicle backend"
	@echo ""
	@echo "Chronicle local development:"
	@echo "  make chronicle-env-export   - Export env vars to .env.chronicle"
	@echo "  make chronicle-build-local  - Build Chronicle from local source"
	@echo "  make chronicle-up-local     - Run Chronicle with local build"
	@echo "  make chronicle-down-local   - Stop local Chronicle"
	@echo "  make chronicle-dev          - Build + run (full dev cycle)"
	@echo ""
	@echo "Build & Push:"
	@echo "  make ushadow-push [TAG=latest]            - Build and push ushadow to ghcr.io"
	@echo "  K8S_REGISTRY=host:port make ushadow-push-local - Build and push ushadow to local K8s registry"
	@echo "  make chronicle-push [TAG=latest]          - Build and push Chronicle to ghcr.io"
	@echo "  make mycelia-push [TAG=latest]            - Build and push Mycelia to ghcr.io"
	@echo "  make openmemory-push [TAG=latest]         - Build and push OpenMemory to ghcr.io"
	@echo ""
	@echo "Service management:"
	@echo "  make rebuild <service>  - Rebuild service from compose/<service>-compose.yml"
	@echo "                            (e.g., make rebuild mycelia, make rebuild chronicle)"
	@echo "  make svc-list           - List all services and their status"
	@echo "  make restart-<service>  - Restart a service (e.g., make restart-chronicle)"
	@echo "  make svc-start SVC=x    - Start a service"
	@echo "  make svc-stop SVC=x     - Stop a service"
	@echo ""
	@echo "Testing commands (Pyramid approach):"
	@echo "  Backend (pytest):"
	@echo "    make test             - Fast unit tests (~seconds)"
	@echo "    make test-integration - Integration tests (need services running)"
	@echo "    make test-all         - All backend tests (unit + integration)"
	@echo "    make test-tdd         - TDD tests (expected failures)"
	@echo "  Robot Framework (API/E2E):"
	@echo "    make test-robot-quick    - Quick smoke tests (~30s)"
	@echo "    make test-robot-critical - Critical path tests only"
	@echo "    make test-robot-api      - All API integration tests"
	@echo "    make test-robot-features - Feature-level tests"
	@echo "    make test-robot          - All Robot tests (full suite)"
	@echo "    make test-report         - View last test report in browser"
	@echo ""
	@echo "Development commands:"
	@echo "  make install      - Install Python dependencies"
	@echo "  make lint         - Run linters"
	@echo "  make format       - Format code"
	@echo ""
	@echo "Environment commands:"
	@echo "  make env-info     - Show current environment info"
	@echo "  make env-sync     - Check for missing variables from .env.example"
	@echo "  make env-sync-apply - Add missing variables to .env"
	@echo ""
	@echo "Cleanup commands:"
	@echo "  make clean-logs   - Remove log files"
	@echo "  make clean-cache  - Remove Python cache files"
	@echo "  make reset        - Full reset (stop all, remove volumes, clean)"
	@echo "  make reset-tailscale - Reset Tailscale (container, state, certs)"
	@echo ""
	@echo "Keycloak realm management:"
	@echo "  make keycloak-delete-realm - Delete the ushadow realm"
	@echo "  make keycloak-create-realm - Create realm from realm-export.json"
	@echo "  make keycloak-reset-realm  - Delete and recreate realm"
	@echo "  make keycloak-fresh-start  - Complete fresh setup (stop, clear DB, restart, import)"
	@echo ""
	@echo "Launcher release:"
	@echo "  make release VERSION=x.y.z [PLATFORMS=all] [DRAFT=true]"
	@echo "                    - Build, commit, and trigger GitHub release workflow"

# Quick start - runs go.sh
go:
	@./go.sh

# Development mode - Vite dev server + backend in Docker
dev:
	@./start-dev.sh --quick --dev --no-admin

# Production mode - Optimized build with nginx
prod:
	@echo "🚀 Starting ushadow in production mode..."
	@docker network create ushadow-network 2>/dev/null || true
	@docker compose -f compose/docker-compose.yml -f compose/docker-compose.prod.yml up -d --build
	@echo "✅ ushadow running in production mode"
	@echo ""
	@echo "Access at: http://localhost:$${WEBUI_PORT:-3000}"

# Application commands - delegate to run.py (reads DEV_MODE from .env)
up:
	@python3 setup/run.py --up

down:
	@python3 setup/run.py --down

restart:
	@python3 setup/run.py --restart

build:
	@python3 setup/run.py --build

logs:
	@docker compose -f docker-compose.yml logs --tail=100

logs-f:
	@docker compose -f docker-compose.yml logs -f

build-with-tailscale:
	@echo "🔨 Building with Tailscale socket support (Linux only)..."
	@echo "⚠️  This requires Tailscale to be running on your Linux host"
	@python3 setup/run.py --build
	@echo "Note: Tailscale socket mount requires manual compose override"

reset-tailscale:
	@./setup/reset-tailscale.sh

# Infrastructure commands
# Note: Services use profiles, so we must specify --profile to include them
INFRA_COMPOSE := docker compose -f compose/docker-compose.infra.yml -p infra --profile infra --profile memory

infra-up:
	@echo "🏗️  Starting infrastructure..."
	@docker network create infra-network 2>/dev/null || true
	@$(INFRA_COMPOSE) up -d
	@echo "✅ Infrastructure started"

infra-down:
	$(INFRA_COMPOSE) down

infra-logs:
	$(INFRA_COMPOSE) logs -f

# Chronicle commands
chronicle-up:
	@echo "📚 Starting Chronicle..."
	@docker network create ushadow-network 2>/dev/null || true
	@docker compose -f deployment/docker-compose.chronicle.yml up -d
	@echo "✅ Chronicle started"

chronicle-down:
	docker compose -f deployment/docker-compose.chronicle.yml down

chronicle-logs:
	docker compose -f deployment/docker-compose.chronicle.yml logs -f

# Chronicle local development
# Export env vars from ushadow's config for local Chronicle builds
chronicle-env-export:
	@echo "📦 Exporting Chronicle env vars..."
	@python3 scripts/ushadow_client.py service env-export chronicle-backend -o .env.chronicle
	@echo "✅ Env vars exported to .env.chronicle"

# Build Chronicle from local source
chronicle-build-local:
	@echo "🔨 Building Chronicle from local source..."
	@docker build -t chronicle-backend-local:latest chronicle/backends/advanced
	@docker tag chronicle-backend-local:latest ghcr.io/ushadow-io/chronicle-backend:local
	@echo "✅ Built and tagged as ghcr.io/ushadow-io/chronicle-backend:local"

# Run Chronicle with local build using exported env vars
chronicle-up-local: chronicle-env-export
	@echo "🚀 Starting Chronicle with local build..."
	@docker network create infra-network 2>/dev/null || true
	@export $$(grep -v '^#' .env.chronicle | xargs) && \
		docker run -d --rm \
			--name ushadow-chronicle-backend-local \
			--network infra-network \
			-p $${CHRONICLE_PORT:-8080}:8000 \
			--env-file .env.chronicle \
			-e PROJECT_ROOT=$(PWD) \
			-v $(PWD)/config/config.yml:/app/config.yml:ro \
			ghcr.io/ushadow-io/chronicle-backend:local
	@echo "✅ Chronicle running locally on port $${CHRONICLE_PORT:-8080}"

# Stop local Chronicle
chronicle-down-local:
	@echo "🛑 Stopping local Chronicle..."
	@docker stop ushadow-chronicle-backend-local 2>/dev/null || true
	@echo "✅ Chronicle stopped"

# Full local development cycle: build and run
chronicle-dev: chronicle-build-local chronicle-up-local
	@echo "🎉 Chronicle dev environment ready"

# =============================================================================
# Build & Push to GHCR
# =============================================================================
# Build and push multi-arch images to GitHub Container Registry
# Requires: docker login ghcr.io -u USERNAME --password-stdin

# ushadow - Build and push backend + frontend to ghcr.io
ushadow-push:
	@./scripts/build-push-images.sh ushadow $(TAG)

# ushadow - Build and push to local K8s registry
# Set K8S_REGISTRY environment variable to your registry (e.g., localhost:32000, registry.local:5000)
ushadow-push-local:
	@if [ -z "$(K8S_REGISTRY)" ]; then \
		echo "❌ Error: K8S_REGISTRY not set"; \
		echo ""; \
		echo "Usage: K8S_REGISTRY=localhost:32000 make ushadow-push-local"; \
		echo ""; \
		echo "Example registries:"; \
		echo "  - localhost:32000 (microk8s)"; \
		echo "  - registry.local:5000 (custom registry)"; \
		exit 1; \
	fi
	@echo "🏗️  Building for $(K8S_REGISTRY) (amd64)..."
	@docker build --platform linux/amd64 -t $(K8S_REGISTRY)/ushadow-backend:latest ushadow/backend/
	@docker build --platform linux/amd64 -t $(K8S_REGISTRY)/ushadow-frontend:latest ushadow/frontend/
	@echo "📤 Pushing to $(K8S_REGISTRY)..."
	@docker push $(K8S_REGISTRY)/ushadow-backend:latest
	@docker push $(K8S_REGISTRY)/ushadow-frontend:latest
	@echo "✅ Images pushed to $(K8S_REGISTRY)"
	@echo ""
	@echo "To update K8s deployments:"
	@echo "  kubectl delete pod -n ushadow -l app.kubernetes.io/name=ushadow-backend"
	@echo "  kubectl delete pod -n ushadow -l app.kubernetes.io/name=ushadow-frontend"

# Chronicle - Build and push backend + webui
chronicle-push:
	@./scripts/build-push-images.sh chronicle $(TAG)

# Mycelia - Build and push backend
mycelia-push:
	@./scripts/build-push-images.sh mycelia $(TAG)

# OpenMemory - Build and push server
openmemory-push:
	@./scripts/build-push-images.sh openmemory $(TAG)

# =============================================================================
# Service Management (via ushadow API)
# =============================================================================
# These commands use the ushadow API to manage services, ensuring env vars
# are properly resolved and injected by the ushadow backend.

svc-list:
	@python3 scripts/ushadow_client.py service list

svc-restart:
	@if [ -z "$(SVC)" ]; then echo "Usage: make svc-restart SVC=<service-name>"; exit 1; fi
	@python3 scripts/ushadow_client.py service restart $(SVC)

svc-start:
	@if [ -z "$(SVC)" ]; then echo "Usage: make svc-start SVC=<service-name>"; exit 1; fi
	@python3 scripts/ushadow_client.py service start $(SVC)

svc-stop:
	@if [ -z "$(SVC)" ]; then echo "Usage: make svc-stop SVC=<service-name>"; exit 1; fi
	@python3 scripts/ushadow_client.py service stop $(SVC)

svc-status:
	@if [ -z "$(SVC)" ]; then echo "Usage: make svc-status SVC=<service-name>"; exit 1; fi
	@python3 scripts/ushadow_client.py service status $(SVC)

# Generic service restart pattern: make restart-<service>
# e.g., make restart-chronicle, make restart-speaker
restart-%:
	@python3 scripts/ushadow_client.py service restart $*

# =============================================================================
# Service Rebuild Command
# =============================================================================
# Rebuild service image: make rebuild <service>
# Usage: make rebuild mycelia, make rebuild chronicle
# Only builds the image, does not stop or start containers
# Assumes compose file exists at: compose/<service>-compose.yml or .yaml

rebuild:
	@if [ -z "$(filter-out $@,$(MAKECMDGOALS))" ]; then \
		echo "Usage: make rebuild <service>"; \
		echo "Example: make rebuild mycelia"; \
		exit 1; \
	fi
	@SERVICE=$(filter-out $@,$(MAKECMDGOALS)); \
	if [ -f compose/$$SERVICE-compose.yml ]; then \
		echo "🔨 Building $$SERVICE..."; \
		docker compose -f compose/$$SERVICE-compose.yml build && \
		echo "✅ $$SERVICE image built (use 'docker compose -f compose/$$SERVICE-compose.yml up -d' to start)"; \
	elif [ -f compose/$$SERVICE-compose.yaml ]; then \
		echo "🔨 Building $$SERVICE..."; \
		docker compose -f compose/$$SERVICE-compose.yaml build && \
		echo "✅ $$SERVICE image built (use 'docker compose -f compose/$$SERVICE-compose.yaml up -d' to start)"; \
	else \
		echo "❌ Compose file not found: compose/$$SERVICE-compose.yml or compose/$$SERVICE-compose.yaml"; \
		echo "Available services:"; \
		ls compose/*-compose.y*l 2>/dev/null | xargs -n1 basename | sed 's/-compose\.y.*$$//' | sed 's/^/  - /'; \
		exit 1; \
	fi

# Allow service name to be passed as argument without error
%:
	@:

# Status and health
status:
	@echo "=== Docker Containers ==="
	@docker ps --filter "name=ushadow" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || true
	@docker ps --filter "name=chronicle" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || true
	@docker ps --filter "name=mongo" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || true
	@docker ps --filter "name=redis" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || true
	@docker ps --filter "name=qdrant" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || true

health:
	@echo "=== Health Checks ==="
	@echo -n "ushadow Backend: "
	@curl -s http://localhost:$${BACKEND_PORT:-8000}/health | grep -q "healthy" && echo "✅ Healthy" || echo "❌ Unhealthy"
	@echo -n "Chronicle: "
	@curl -s http://localhost:8000/health | grep -q "ok" && echo "✅ Healthy" || echo "❌ Unhealthy"
	@echo -n "MongoDB: "
	@docker exec mongo mongosh --quiet --eval "db.adminCommand('ping').ok" 2>/dev/null | grep -q "1" && echo "✅ Healthy" || echo "❌ Unhealthy"
	@echo -n "Redis: "
	@docker exec redis redis-cli ping 2>/dev/null | grep -q "PONG" && echo "✅ Healthy" || echo "❌ Healthy"

# Development commands
install:
	@echo "📦 Installing dependencies..."
	@cd ushadow/backend && \
		if [ ! -d .venv ]; then uv venv --python 3.12; fi && \
		uv pip install -e ".[dev]" --python .venv/bin/python && \
		uv pip install -r ../../robot_tests/requirements.txt --python .venv/bin/python
	cd ushadow/frontend && npm install
	@echo "✅ Dependencies installed"

# =============================================================================
# Backend Tests (pytest) - Test Pyramid Base
# =============================================================================

# Fast unit tests only (no services needed) - should complete in seconds
test:
	@echo "🧪 Running unit tests..."
	@cd ushadow/backend && .venv/bin/pytest -m "unit and not tdd" -q --tb=short

# Integration tests (need MongoDB, Redis running)
test-integration:
	@echo "🧪 Running integration tests..."
	@cd ushadow/backend && .venv/bin/pytest -m "integration and not tdd" -v --tb=short

# TDD tests (expected to fail - for tracking progress)
test-tdd:
	@echo "🧪 Running TDD tests (expected failures)..."
	@cd ushadow/backend && .venv/bin/pytest -m "tdd" -v

# All backend tests (unit + integration, excludes TDD)
test-all:
	@echo "🧪 Running all backend tests..."
	@cd ushadow/backend && .venv/bin/pytest -m "not tdd" -v --tb=short

# =============================================================================
# Robot Framework Tests (API/E2E) - Test Pyramid Top
# =============================================================================

# Quick smoke tests - health checks and critical paths (~30 seconds)
test-robot-quick:
	@echo "🤖 Running quick smoke tests..."
	@cd ushadow/backend && source .venv/bin/activate && \
		robot --outputdir ../../robot_results \
		      --include quick \
		      ../../robot_tests/api/api_health_check.robot \
		      ../../robot_tests/api/service_config_scenarios.robot

# Critical path tests only - must-pass scenarios
test-robot-critical:
	@echo "🤖 Running critical path tests..."
	@cd ushadow/backend && source .venv/bin/activate && \
		robot --outputdir ../../robot_results \
		      --include critical \
		      ../../robot_tests/api/

# All API integration tests
test-robot-api:
	@echo "🤖 Running all API tests..."
	@cd ushadow/backend && source .venv/bin/activate && \
		robot --outputdir ../../robot_results \
		      --exclude wip \
		      ../../robot_tests/api/

# Feature-level tests (memory feedback, etc.)
test-robot-features:
	@echo "🤖 Running feature tests..."
	@cd ushadow/backend && source .venv/bin/activate && \
		robot --outputdir ../../robot_results \
		      --exclude wip \
		      ../../robot_tests/features/

# All Robot tests (full suite) - may take several minutes
test-robot:
	@echo "🤖 Running full Robot test suite..."
	@cd ushadow/backend && source .venv/bin/activate && \
		robot --outputdir ../../robot_results \
		      --exclude wip \
		      ../../robot_tests/

# View last test report in browser
test-report:
	@echo "📊 Opening test report..."
	@open robot_results/report.html 2>/dev/null || xdg-open robot_results/report.html 2>/dev/null || echo "Report at: robot_results/report.html"

lint:
	cd ushadow/backend && ruff check .
	cd ushadow/frontend && npm run lint

format:
	cd ushadow/backend && ruff format .
	cd ushadow/frontend && npm run format

# Cleanup commands
clean:
	docker compose -f compose/docker-compose.yml down -v
	docker compose -f deployment/docker-compose.chronicle.yml down -v
	docker compose -f compose/docker-compose.infra.yml down -v

clean-logs:
	find . -name "*.log" -type f -delete

clean-cache:
	find . -type d -name "__pycache__" -exec rm -rf {} +
	find . -type d -name ".pytest_cache" -exec rm -rf {} +
	find . -type d -name ".ruff_cache" -exec rm -rf {} +

reset: clean clean-logs clean-cache
	@echo "🧹 Full reset complete"

# Database commands
db-shell:
	docker exec -it mongo mongosh ushadow

db-backup:
	@mkdir -p backups
	docker exec mongo mongodump --db=ushadow --out=/tmp/backup
	docker cp mongo:/tmp/backup ./backups/backup-$(shell date +%Y%m%d-%H%M%S)
	@echo "✅ Database backed up to ./backups/"

db-restore:
	@echo "⚠️  This will restore the database. Are you sure? [y/N]"
	@read -r response; \
	if [ "$$response" = "y" ]; then \
		docker exec mongo mongorestore --db=ushadow /tmp/backup/ushadow; \
		echo "✅ Database restored"; \
	fi

# Network commands
network-create:
	docker network create ushadow-network 2>/dev/null || true

network-remove:
	docker network rm ushadow-network 2>/dev/null || true

# Show environment info
env-info:
	@echo "=== Environment Information ==="
	@echo "ENV_NAME: $${ENV_NAME:-ushadow}"
	@echo "BACKEND_PORT: $${BACKEND_PORT:-8000}"
	@echo "WEBUI_PORT: $${WEBUI_PORT:-3000}"
	@echo "CHRONICLE_PORT: $${CHRONICLE_PORT:-8000}"
	@echo "MONGODB_DATABASE: $${MONGODB_DATABASE:-ushadow}"

# Sync .env with .env.example (show missing variables)
env-sync:
	@uv run scripts/sync-env.py

# Sync .env with .env.example (apply missing variables)
env-sync-apply:
	@uv run scripts/sync-env.py --apply

# Launcher release - triggers GitHub Actions workflow
# Usage: make release VERSION=0.4.2 [PLATFORMS=macos] [DRAFT=true] [RELEASE_NAME="Bug Fixes"]
release:
	@if [ -z "$(VERSION)" ]; then \
		echo "Error: VERSION is required"; \
		echo "Usage: make release VERSION=0.4.2 [PLATFORMS=macos,windows,linux] [DRAFT=true] [RELEASE_NAME='Bug Fixes']"; \
		exit 1; \
	fi
	@echo "🚀 Triggering launcher release workflow..."
	@echo "   Version: $(VERSION)"
	@echo "   Platforms: $${PLATFORMS:-all}"
	@echo "   Draft: $${DRAFT:-false}"
	@echo "   Release Name: $${RELEASE_NAME:-v$(VERSION)}"
	@echo ""
	@echo "📦 Building frontend dist..."
	@cd ushadow/launcher && npm run build
	@echo "✅ Frontend built"
	@echo ""
	@echo "🔄 Committing dist folder (required for GitHub Actions)..."
	@git add -f ushadow/launcher/dist
	@git commit -m "chore(launcher): build dist for release v$(VERSION)" || true
	@git push origin HEAD
	@echo ""
	@echo "🎬 Triggering GitHub Actions workflow..."
	@gh workflow run launcher-release.yml \
		-f version=$(VERSION) \
		-f platforms=$${PLATFORMS:-all} \
		-f draft=$${DRAFT:-false} \
		$${RELEASE_NAME:+-f release_name="$$RELEASE_NAME"}
	@echo ""
	@echo "✅ Release workflow triggered!"
	@echo "   View progress: gh run list --workflow=launcher-release.yml"
	@echo "   Or visit: https://github.com/$$(git config --get remote.origin.url | sed 's/.*github.com[:/]\(.*\)\.git/\1/')/actions"

# Keycloak realm management
keycloak-delete-realm:
	@echo "🗑️  Deleting Keycloak realm 'ushadow'..."
	@docker exec keycloak /opt/keycloak/bin/kcadm.sh config credentials \
		--server http://localhost:8080 \
		--realm master \
		--user admin \
		--password admin > /dev/null 2>&1 || \
		(echo "⚠️  Keycloak not running" && exit 1)
	@docker exec keycloak /opt/keycloak/bin/kcadm.sh delete realms/ushadow 2>/dev/null || \
		(echo "⚠️  Realm doesn't exist" && exit 1)
	@echo "✅ Realm deleted"

keycloak-create-realm:
	@echo "📦 Creating Keycloak realm 'ushadow' from realm-export.json..."
	@if [ ! -f config/keycloak/realm-export.json ]; then \
		echo "❌ Error: config/keycloak/realm-export.json not found"; \
		exit 1; \
	fi
	@docker cp config/keycloak/realm-export.json keycloak:/tmp/realm-import.json
	@docker exec keycloak /opt/keycloak/bin/kcadm.sh config credentials \
		--server http://localhost:8080 \
		--realm master \
		--user admin \
		--password admin
	@docker exec keycloak /opt/keycloak/bin/kcadm.sh create realms \
		-f /tmp/realm-import.json
	@echo "✅ Realm created and configured"

keycloak-reset-realm: keycloak-delete-realm keycloak-create-realm
	@echo "✅ Realm reset complete"

keycloak-fresh-start:
	@echo "🔄 Starting fresh Keycloak setup..."
	@echo "1. Stopping Keycloak..."
	@docker stop keycloak 2>/dev/null || true
	@docker rm keycloak 2>/dev/null || true
	@echo "2. Clearing Keycloak database..."
	@docker exec postgres psql -U ushadow -d ushadow -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;" 2>/dev/null || \
		echo "⚠️  Database already clean or Postgres not running"
	@echo "3. Starting Keycloak (realm will import automatically)..."
	@docker-compose -f compose/docker-compose.infra.yml --profile infra up -d keycloak
	@echo "4. Waiting for Keycloak health check..."
	@for i in {1..60}; do \
		printf "   Checking health (attempt $$i/60)...\r"; \
		if curl -sf http://localhost:$${KEYCLOAK_MGMT_PORT:-9000}/health/ready > /dev/null 2>&1; then \
			echo "\n   ✅ Keycloak is healthy                    "; \
			break; \
		fi; \
		if [ $$i -eq 60 ]; then \
			echo "\n   ⚠️  Keycloak health check timeout - check logs: docker logs keycloak"; \
			exit 1; \
		fi; \
		sleep 2; \
	done
	@echo "5. Waiting for realm import to complete..."
	@for i in {1..30}; do \
		printf "   Checking realm (attempt $$i/30)...\r"; \
		if curl -sf http://localhost:$${KEYCLOAK_PORT:-8081}/realms/ushadow > /dev/null 2>&1; then \
			echo "\n   ✅ Realm 'ushadow' is ready                    "; \
			break; \
		fi; \
		if [ $$i -eq 30 ]; then \
			echo "\n   ⚠️  Realm import timeout - check logs: docker logs keycloak"; \
		fi; \
		sleep 2; \
	done
	@echo "6. Restarting backend..."
	@docker ps --format "{{.Names}}" | grep -E "^ushadow-.*-backend$$" | grep -v chronicle | grep -v mycelia | head -1 | xargs -r docker restart
	@echo "✅ Backend restarted"
	@echo "✅ Fresh Keycloak setup complete"
	@echo "   Admin console: http://localhost:$${KEYCLOAK_PORT:-8081}"
	@echo "   Username: admin"
	@echo "   Password: admin"
