#!/bin/bash
set -e

# ushadow Quick Start - Web UI Registration Flow
# This script starts ushadow and opens the web UI registration screen to create an admin account

echo "🚀 ushadow Quick Start - Web UI Registration"
echo "==============================================="

# Parse arguments
USE_PROD=false
if [[ "$1" == "--prod" ]]; then
    USE_PROD=true
fi

# Check we're in the right directory
if [ ! -f "docker-compose.yml" ] || [ ! -f "docker-compose.infra.yml" ]; then
    echo "❌ Error: Must be run from the root directory"
    echo "   cd to the directory containing docker-compose.yml"
    exit 1
fi

# Python utilities
SETUP_UTILS="setup/setup_utils.py"
START_UTILS="setup/start_utils.py"


# Set compose files based on mode
if [ "$USE_PROD" = true ]; then
    COMPOSE_FILES="-f docker-compose.yml"
    echo "📦 Mode: Production (minified build)"
else
    COMPOSE_FILES="-f docker-compose.yml -f compose/overrides/dev-webui.yml"
    echo "🔧 Mode: Development (hot-reload, better errors)"
fi
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found"
    echo "   Run ./quick-start.sh to generate configuration"
    exit 1
fi

# Ensure secrets.yaml exists with generated security keys
RESULT=$(python3 setup/setup_utils.py ensure-secrets "config/secrets.yaml")
CREATED_NEW=$(echo "$RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin)['created_new'])" 2>/dev/null || echo "true")

if [ "$CREATED_NEW" = "True" ] || [ "$CREATED_NEW" = "true" ]; then
    echo "🔐 Generated security keys in config/secrets.yaml"
else
    echo "✅ Security keys already configured"
fi


echo ""
echo "🐳 Starting Docker services..."

# Python utilities
START_UTILS="setup/start_utils.py"

# Ensure Docker networks exist
python3 "$START_UTILS" ensure-networks >/dev/null 2>&1 || true

# Check if infrastructure is running, start if needed
INFRA_RUNNING=$(python3 "$START_UTILS" check-infrastructure 2>/dev/null | python3 -c "import sys, json; print(json.load(sys.stdin)['running'])" 2>/dev/null || echo "false")

if [ "$INFRA_RUNNING" = "True" ]; then
    echo "   ✅ Infrastructure already running (reusing existing)"
else
    echo "   Starting infrastructure (MongoDB, Redis, Qdrant)..."
    python3 "$START_UTILS" start-infrastructure "docker-compose.infra.yml" "infra" >/dev/null 2>&1
fi

echo "   Starting application services..."
# Clean up any orphaned containers from previous runs
docker compose down 2>/dev/null || true
docker compose $COMPOSE_FILES up -d --build

# Wait for backend to be healthy
echo ""
echo "⏳ Waiting for backend to be ready..."
BACKEND_PORT=$(grep "^BACKEND_PORT=" .env 2>/dev/null | cut -d'=' -f2 | tr -d ' ' || echo "8000")

RESULT=$(python3 setup/start_utils.py wait-backend "$BACKEND_PORT" 60)
HEALTHY=$(echo "$RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin)['healthy'])")

if [ "$HEALTHY" = "True" ]; then
    echo "✅ Backend is ready!"
else
    echo "❌ Backend failed to start within 60 seconds"
    echo "   Check logs with: docker compose logs backend"
    exit 1
fi

echo ""
echo "✅ Ushadow is running!"
echo ""

# Get webui port
WEBUI_PORT=$(grep "^WEBUI_PORT=" .env | cut -d'=' -f2 | tr -d ' ' || echo "3000")

# Open browser to register page
if command -v open > /dev/null; then
    # macOS
    open "http://localhost:${WEBUI_PORT}/register"
elif command -v xdg-open > /dev/null; then
    # Linux
    xdg-open "http://localhost:${WEBUI_PORT}/register"
elif command -v start > /dev/null; then
    # Windows
    start "http://localhost:${WEBUI_PORT}/register"
else
    echo "   Please open your browser to: http://localhost:${WEBUI_PORT}/register"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 Quick Reference:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   Registration:  http://localhost:${WEBUI_PORT}/register"
echo "   Web Dashboard: http://localhost:${WEBUI_PORT}"
echo "   Backend API:   http://localhost:${BACKEND_PORT}"
echo ""
if [ "$USE_PROD" = true ]; then
    echo "   Mode:          Production build"
else
    echo "   Mode:          Development (use './go.sh --prod' for production)"
fi
echo ""
echo "   View logs:     docker compose logs -f"
echo "   Stop services: docker compose down"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
