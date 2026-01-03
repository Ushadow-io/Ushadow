# ushadow Makefile
# Quick commands for development and deployment
# should use a function in a python file in scripts folder for anything complex

.PHONY: help up down restart logs build clean test go install status health dev prod \
        svc-list svc-restart svc-start svc-stop svc-status \
        chronicle-env-export chronicle-build-local chronicle-up-local chronicle-down-local chronicle-dev

# Read DEV_MODE from .env if it exists
-include .env

# Set compose files based on DEV_MODE (set by start-dev.sh)
ifeq ($(DEV_MODE),true)
  COMPOSE_FILES := -f docker-compose.yml -f compose/overrides/dev-webui.yml
  MODE_LABEL := (dev mode)
else
  COMPOSE_FILES := -f docker-compose.yml -f compose/overrides/prod-webui.yml
  MODE_LABEL := (prod mode)
endif

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
	@echo "  make build        - Rebuild containers (auto-detects dev/prod)"
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
	@echo "Service management (via ushadow API):"
	@echo "  make svc-list           - List all services and their status"
	@echo "  make restart-<service>  - Restart a service (e.g., make restart-chronicle)"
	@echo "  make svc-start SVC=x    - Start a service"
	@echo "  make svc-stop SVC=x     - Stop a service"
	@echo ""
	@echo "Development commands:"
	@echo "  make install      - Install Python dependencies"
	@echo "  make test         - Run tests"
	@echo "  make lint         - Run linters"
	@echo "  make format       - Format code"
	@echo ""
	@echo "Cleanup commands:"
	@echo "  make clean-logs   - Remove log files"
	@echo "  make clean-cache  - Remove Python cache files"
	@echo "  make reset        - Full reset (stop all, remove volumes, clean)"
	@echo "  make reset-tailscale - Reset Tailscale (container, state, certs)"

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

# Application commands (auto-detect dev/prod mode from .env)
up:
	@echo "🚀 Starting ushadow $(MODE_LABEL)..."
	docker compose $(COMPOSE_FILES) up -d

down:
	docker compose $(COMPOSE_FILES) down

restart:
	docker compose $(COMPOSE_FILES) restart

logs:
	docker compose -f docker-compose.yml logs --tail=100

logs-f:
	docker compose -f docker-compose.yml logs -f

build:
	@echo "🔐 Ensuring secrets are configured..."
	@python3 setup/setup_utils.py ensure-secrets config/secrets.yaml > /dev/null
	@echo "🔨 Building ushadow $(MODE_LABEL)..."
	docker compose $(COMPOSE_FILES) up -d --build
	@echo "✅ Build complete"

build-with-tailscale:
	@echo "🔐 Ensuring secrets are configured..."
	@python3 setup/setup_utils.py ensure-secrets config/secrets.yaml > /dev/null
	@echo "🔨 Building with Tailscale socket support (Linux only)..."
	@echo "⚠️  This requires Tailscale to be running on your Linux host"
	docker compose -f docker-compose.yml -f compose/overrides/dev-webui.yml -f compose/backend-with-tailscale.yml up -d --build
	@echo "✅ Build complete - Tailscale socket mounted for auto-detection"

reset-tailscale:
	@./setup/reset-tailscale.sh

# Infrastructure commands
infra-up:
	@echo "🏗️  Starting infrastructure..."
	@docker network create ushadow-network 2>/dev/null || true
	@docker compose -f compose/docker-compose.infra.yml -p infra up -d
	@echo "✅ Infrastructure started"

infra-down:
	docker compose -f compose/docker-compose.infra.yml -p infra down

infra-logs:
	docker compose -f compose/docker-compose.infra.yml -p infra logs -f

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
	cd backend && pip install -r requirements.txt
	cd frontend && npm install

test:
	cd backend && pytest
	cd frontend && npm test

lint:
	cd backend && ruff check .
	cd frontend && npm run lint

format:
	cd backend && ruff format .
	cd frontend && npm run format

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
