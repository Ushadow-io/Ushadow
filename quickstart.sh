#!/bin/bash

# ushadow Quick Start
# AI Orchestration Platform - Zero-configuration startup for local development

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Configuration
ENV_FILE=".env"

# Parse arguments
RESET_CONFIG=false
if [[ "$1" == "--reset" ]]; then
    RESET_CONFIG=true
fi

# Print header
echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}🌟 ushadow Quick Start${NC}"
echo -e "${BOLD}   AI Orchestration Platform${NC}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check we're in the right directory
if [ ! -f "docker-compose.yml" ] || [ ! -f "docker-compose.infra.yml" ]; then
    echo -e "${RED}❌ Error: Must be run from the root directory${NC}"
    echo "   cd to the directory containing docker-compose.yml and compose/"
    exit 1
fi

# Check if config exists
if [[ -f "$ENV_FILE" ]] && [[ "$RESET_CONFIG" == false ]]; then
    echo -e "${GREEN}✅ Existing configuration found${NC}"
    echo ""
    read -p "Use existing configuration? (Y/n): " use_existing
    if [[ "$use_existing" == "n" ]] || [[ "$use_existing" == "N" ]]; then
        RESET_CONFIG=true
    fi
fi

# Generate or load configuration
if [[ ! -f "$ENV_FILE" ]] || [[ "$RESET_CONFIG" == true ]]; then
    echo -e "${BLUE}🔧 Generating configuration...${NC}"
    echo ""

    # Generate secure secrets
    if command -v openssl &> /dev/null; then
        AUTH_SECRET_KEY=$(openssl rand -hex 32)
        SESSION_SECRET=$(openssl rand -hex 32)
    else
        # Fallback for systems without openssl
        AUTH_SECRET_KEY=$(head -c 32 /dev/urandom | xxd -p -c 64)
        SESSION_SECRET=$(head -c 32 /dev/urandom | xxd -p -c 64)
    fi

    # Prompt for admin credentials
    echo ""
    echo -e "${BOLD}Admin Account Setup${NC}"
    echo -e "${YELLOW}Press Enter to use defaults shown in [brackets]${NC}"
    echo ""

    read -p "Admin Name [admin]: " INPUT_ADMIN_NAME
    ADMIN_NAME="${INPUT_ADMIN_NAME:-admin}"

    read -p "Admin Email [admin@ushadow.local]: " INPUT_ADMIN_EMAIL
    ADMIN_EMAIL="${INPUT_ADMIN_EMAIL:-admin@ushadow.local}"

    read -sp "Admin Password [ushadow-dev]: " INPUT_ADMIN_PASSWORD
    echo ""
    ADMIN_PASSWORD="${INPUT_ADMIN_PASSWORD:-ushadow-dev}"

    # Port configuration (simplified - use defaults from .env.default)
    BACKEND_PORT=8010
    WEBUI_PORT=3010

    echo ""
    echo -e "${GREEN}✅ Environment configured${NC}"
    echo -e "  Project:         ushadow"
    echo -e "  Backend:         ${BACKEND_PORT}"
    echo -e "  Frontend:        ${WEBUI_PORT}"
    echo ""

    # Create .env file in root
    cat > "$ENV_FILE" <<EOF
# Application Environment Variables
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# DO NOT commit to git

# Compose Project Name (defines container name prefix)
COMPOSE_PROJECT_NAME=ushadow

# Authentication (Generated)
AUTH_SECRET_KEY=${AUTH_SECRET_KEY}
SESSION_SECRET=${SESSION_SECRET}
ADMIN_NAME=${ADMIN_NAME}
ADMIN_EMAIL=${ADMIN_EMAIL}
ADMIN_PASSWORD=${ADMIN_PASSWORD}

# Ports (defaults from .env.default)
BACKEND_PORT=${BACKEND_PORT}
WEBUI_PORT=${WEBUI_PORT}

# Development Mode
NODE_ENV=development

# CORS Configuration (auto-configured for development)
CORS_ORIGINS=http://localhost:${WEBUI_PORT},http://127.0.0.1:${WEBUI_PORT},http://localhost:${BACKEND_PORT},http://127.0.0.1:${BACKEND_PORT},http://localhost:5173,http://127.0.0.1:5173

# ==========================================
# API KEYS (Optional - Add your keys here)
# ==========================================
# OPENAI_API_KEY=
# ANTHROPIC_API_KEY=
# DEEPGRAM_API_KEY=
# MISTRAL_API_KEY=
EOF

    chmod 600 "$ENV_FILE"

    # Display credentials confirmation
    echo ""
    echo -e "${GREEN}✅ Admin account configured${NC}"
    echo ""
    echo -e "${BOLD}Login Credentials:${NC}"
    echo -e "  Name:     ${ADMIN_NAME}"
    echo -e "  Email:    ${ADMIN_EMAIL}"
    echo -e "  Password: ${YELLOW}${ADMIN_PASSWORD}${NC}"
    echo ""
    sleep 2
else
    echo -e "${GREEN}✅ Using existing configuration${NC}"
    # Extract credentials and ports to display
    ADMIN_NAME=$(grep "^ADMIN_NAME=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2 || echo "admin")
    ADMIN_EMAIL=$(grep "^ADMIN_EMAIL=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2 || echo "admin@ushadow.local")
    ADMIN_PASSWORD=$(grep "^ADMIN_PASSWORD=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2 || echo "ushadow-dev")

    # Try to get ports from app/.env, then .env.default, finally use defaults
    BACKEND_PORT=$(grep "^BACKEND_PORT=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2)
    if [ -z "$BACKEND_PORT" ]; then
        BACKEND_PORT=$(grep "^BACKEND_PORT=" .env.default 2>/dev/null | cut -d'=' -f2)
    fi
    BACKEND_PORT=${BACKEND_PORT:-8010}

    WEBUI_PORT=$(grep "^WEBUI_PORT=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2)
    if [ -z "$WEBUI_PORT" ]; then
        WEBUI_PORT=$(grep "^WEBUI_PORT=" .env.default 2>/dev/null | cut -d'=' -f2)
    fi
    WEBUI_PORT=${WEBUI_PORT:-3010}
    echo ""
    echo -e "${BOLD}Login Credentials:${NC}"
    echo -e "  Name:     ${ADMIN_NAME}"
    echo -e "  Email:    ${ADMIN_EMAIL}"
    echo -e "  Password: ${YELLOW}${ADMIN_PASSWORD}${NC}"
    echo ""
fi

# Ask about dev server
echo ""
echo -e "${BOLD}Development Server${NC}"
echo -e "${YELLOW}Use dev server for frontend hot-reload? (Recommended for development)${NC}"
echo -e "${YELLOW}With dev server: Changes to UI files reload instantly${NC}"
echo -e "${YELLOW}Without dev server: UI changes require rebuild${NC}"
echo ""
read -p "Enable dev server? (Y/n): " use_dev_server
if [[ "$use_dev_server" == "n" ]] || [[ "$use_dev_server" == "N" ]]; then
    USE_DEV_SERVER=false
    COMPOSE_OVERRIDE_FILE=""
    echo -e "${BLUE}   Using production build (no hot-reload)${NC}"
else
    USE_DEV_SERVER=true
    COMPOSE_OVERRIDE_FILE="-f compose/overrides/dev-webui.yml"
    echo -e "${GREEN}   Using dev server with hot-reload${NC}"
fi
echo ""

# Python utilities
START_UTILS="setup/start_utils.py"

# Create external Docker network for cross-service communication
echo -e "${BLUE}🌐 Setting up Docker network...${NC}"
python3 "$START_UTILS" ensure-networks >/dev/null 2>&1 || true
echo -e "${GREEN}   ✅ Docker networks ready${NC}"
echo ""

# Start infrastructure (detect from any source)
echo -e "${BLUE}🏗️  Checking infrastructure...${NC}"

# Check if infrastructure is running
INFRA_RUNNING=$(python3 "$START_UTILS" check-infrastructure 2>/dev/null | python3 -c "import sys, json; print(json.load(sys.stdin)['running'])" 2>/dev/null || echo "false")

if [ "$INFRA_RUNNING" = "True" ]; then
    echo -e "${GREEN}   ✅ Infrastructure already running${NC}"
    echo -e "      MongoDB: $(docker ps --filter 'name=mongo' --format '{{.Names}}')"
    echo -e "      Redis:   $(docker ps --filter 'name=redis' --format '{{.Names}}')"
    echo -e "      Qdrant:  $(docker ps --filter 'name=qdrant' --format '{{.Names}}')"
else
    echo -e "${YELLOW}   Starting infrastructure services...${NC}"
    python3 "$START_UTILS" start-infrastructure  >/dev/null 2>&1
    echo -e "${GREEN}   ✅ Infrastructure started${NC}"
fi
echo ""

# Check if ushadow containers are already running
echo -e "${BLUE}🚀 Checking ushadow application...${NC}"

BACKEND_RUNNING=$(docker ps --filter "name=ushadow-backend" --filter "status=running" -q)
WEBUI_RUNNING=$(docker ps --filter "name=ushadow-webui" --filter "status=running" -q)

if [[ -n "$BACKEND_RUNNING" ]] && [[ -n "$WEBUI_RUNNING" ]]; then
    echo -e "${GREEN}   ✅ ushadow already running${NC}"
    echo -e "      Backend:  $(docker ps --filter 'name=ushadow-backend' --format '{{.Names}}')"
    echo -e "      Frontend: $(docker ps --filter 'name=ushadow-webui' --format '{{.Names}}')"
    echo ""
    echo -e "${YELLOW}   Skipping startup (containers already running)${NC}"
    SKIP_STARTUP=true
else
    echo -e "${YELLOW}   Starting ushadow...${NC}"
    echo ""
    docker compose -f docker-compose.yml $COMPOSE_OVERRIDE_FILE up -d --build
    SKIP_STARTUP=false
fi

echo ""

if [[ "$SKIP_STARTUP" == false ]]; then
    echo "   Waiting for services to be healthy..."
    sleep 3

    # Use Python utility for backend health check (30 second timeout)
    RESULT=$(python3 "$START_UTILS" wait-backend "$BACKEND_PORT" 30 2>/dev/null || echo '{"healthy": false, "elapsed": 30}')
    BACKEND_HEALTHY=$(echo "$RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin)['healthy'])" 2>/dev/null || echo "false")

    echo ""
    if [[ "$BACKEND_HEALTHY" == "True" ]]; then
        echo -e "${GREEN}${BOLD}✅ ushadow is ready!${NC}"
    else
        echo -e "${YELLOW}⚠️  Backend is starting... (may take a moment)${NC}"
    fi
fi

echo ""
echo -e "${BOLD}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║                                                    ║${NC}"
echo -e "${BOLD}║  ${GREEN}🌟 Open ushadow Dashboard:${NC}${BOLD}                     ║${NC}"
echo -e "${BOLD}║                                                    ║${NC}"
echo -e "${BOLD}║     ${GREEN}${BOLD}http://localhost:${WEBUI_PORT}${NC}${BOLD}                         ║${NC}"
echo -e "${BOLD}║                                                    ║${NC}"
if [[ "$USE_DEV_SERVER" == true ]]; then
echo -e "${BOLD}║  ${GREEN}(Dev server with hot-reload enabled)${NC}${BOLD}          ║${NC}"
echo -e "${BOLD}║                                                    ║${NC}"
fi
echo -e "${BOLD}║  ${YELLOW}(Click the link above or copy to browser)${NC}${BOLD}     ║${NC}"
echo -e "${BOLD}║                                                    ║${NC}"
echo -e "${BOLD}╚════════════════════════════════════════════════════╝${NC}"
echo ""

# Service status
echo -e "${BOLD}🔗 Service URLs:${NC}"
echo -e "  Frontend:  http://localhost:${WEBUI_PORT}"
echo -e "  Backend:   http://localhost:${BACKEND_PORT}"
echo -e "  API Docs:  http://localhost:${BACKEND_PORT}/docs"
echo ""

# Next steps
echo -e "${BOLD}Next steps:${NC}"
echo "  1. Login with the credentials shown above"
echo "  2. Explore the dashboard and integrations"
echo "  3. Configure API keys in Settings (optional)"
echo ""

# Usage information
echo -e "${BOLD}Helpful commands:${NC}"
echo "  Stop:    docker compose down"
echo "  Restart: docker compose restart"
echo "  Logs:    docker compose logs -f"
echo "  Rebuild: docker compose up -d --build"
echo ""

echo -e "${GREEN}${BOLD}🎉 ushadow is running! Happy orchestrating!${NC}"
echo ""

# Auto-open dashboard in browser
echo -e "${BLUE}🌐 Opening dashboard in browser...${NC}"
if command -v open &> /dev/null; then
    # macOS
    open "http://localhost:${WEBUI_PORT}"
elif command -v xdg-open &> /dev/null; then
    # Linux
    xdg-open "http://localhost:${WEBUI_PORT}"
elif command -v start &> /dev/null; then
    # Windows (Git Bash)
    start "http://localhost:${WEBUI_PORT}"
else
    echo -e "${YELLOW}   Unable to auto-open browser. Please visit URL above manually.${NC}"
fi
echo ""
