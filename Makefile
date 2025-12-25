# ushadow Makefile
# Quick commands for development and deployment
# should use a function in a python file in scripts folder for anything complex

.PHONY: help up down restart logs build clean test go install status health dev prod

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
	@echo "  make build        - Rebuild containers"
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

# Quick start - runs go.sh
go:
	@./go.sh

# Development mode - Vite dev server + backend in Docker
dev:
	@./dev.sh

# Production mode - Optimized build with nginx
prod:
	@echo "🚀 Starting ushadow in production mode..."
	@docker network create ushadow-network 2>/dev/null || true
	@docker compose -f compose/docker-compose.yml -f compose/docker-compose.prod.yml up -d --build
	@echo "✅ ushadow running in production mode"
	@echo ""
	@echo "Access at: http://localhost:$${USHADOW_FRONTEND_PORT:-3000}"

# Application commands
up:
	@echo "🚀 Starting with dev server..."
	docker compose -f docker-compose.yml -f compose/overrides/dev-webui.yml up -d

down:
	docker compose -f docker-compose.yml -f compose/overrides/dev-webui.yml down

restart:
	docker compose -f docker-compose.yml -f compose/overrides/dev-webui.yml restart

logs:
	docker compose -f docker-compose.yml logs --tail=100

logs-f:
	docker compose -f docker-compose.yml logs -f

build:
	@echo "🔨 Building with dev server (hot-reload enabled)..."
	docker compose -f docker-compose.yml -f compose/overrides/dev-webui.yml up -d --build
	@echo "✅ Build complete - frontend running on port $${WEBUI_PORT:-3050} with hot-reload"

# Infrastructure commands
infra-up:
	@echo "🏗️  Starting infrastructure..."
	@docker network create ushadow-network 2>/dev/null || true
	@docker compose -f docker-compose.infra.yml up -d
	@echo "✅ Infrastructure started"

infra-down:
	docker compose -f docker-compose.infra.yml down

infra-logs:
	docker compose -f docker-compose.infra.yml logs -f

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
	@curl -s http://localhost:8080/health | grep -q "healthy" && echo "✅ Healthy" || echo "❌ Unhealthy"
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
	docker compose -f docker-compose.infra.yml down -v

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
	@echo "USHADOW_BACKEND_PORT: $${USHADOW_BACKEND_PORT:-8080}"
	@echo "USHADOW_FRONTEND_PORT: $${USHADOW_FRONTEND_PORT:-3000}"
	@echo "CHRONICLE_PORT: $${CHRONICLE_PORT:-8000}"
	@echo "MONGODB_DATABASE: $${MONGODB_DATABASE:-ushadow}"
