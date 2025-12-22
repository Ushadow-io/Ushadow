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
BACKEND_ENV_FILE="backend/.env"

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

    # Generate secure secret
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

    read -sp "Admin Password [ushadow-123]: " INPUT_ADMIN_PASSWORD
    echo ""
    ADMIN_PASSWORD="${INPUT_ADMIN_PASSWORD:-ushadow-123}"

    # Prompt for environment name (for multi-worktree setups)
    echo ""
    echo -e "${BOLD}Environment Name${NC}"
    echo -e "${YELLOW}For multi-worktree setups, give each environment a unique name${NC}"
    echo -e "${YELLOW}Examples: ushadow, blue, gold, green, dev, staging${NC}"
    echo ""

    read -p "Environment name [ushadow]: " INPUT_ENV_NAME
    ENV_NAME="${INPUT_ENV_NAME:-ushadow}"

    # Convert to lowercase and replace spaces/special chars with hyphens
    ENV_NAME=$(echo "$ENV_NAME" | tr '[:upper:]' '[:lower:]' | tr -cs '[:alnum:]' '-' | sed 's/-$//')

    # Prompt for port offset (for multi-worktree environments)
    echo ""
    echo -e "${BOLD}Port Configuration${NC}"
    echo -e "${YELLOW}For multi-worktree setups, use different offsets for each environment${NC}"
    echo -e "${YELLOW}Suggested: blue=0, gold=100, green=200, red=300${NC}"
    echo ""
    read -p "Port offset [0]: " INPUT_PORT_OFFSET
    PORT_OFFSET="${INPUT_PORT_OFFSET:-0}"

    # Calculate application ports from offset
    USHADOW_BACKEND_PORT=$((8080 + PORT_OFFSET))
    USHADOW_FRONTEND_PORT=$((3000 + PORT_OFFSET))
    CHRONICLE_PORT=$((8000 + PORT_OFFSET))

    # Calculate Redis database number for isolation (shared Redis instance)
    REDIS_DATABASE=$((PORT_OFFSET / 100))

    # Set database and project names based on environment name
    if [[ "$ENV_NAME" == "ushadow" ]]; then
        MONGODB_DATABASE="ushadow"
        COMPOSE_PROJECT_NAME="ushadow"
    else
        MONGODB_DATABASE="ushadow_${ENV_NAME}"
        COMPOSE_PROJECT_NAME="ushadow-${ENV_NAME}"
    fi

    echo ""
    echo -e "${GREEN}✅ Environment configured${NC}"
    echo -e "  Name:            ${ENV_NAME}"
    echo -e "  Project:         ${COMPOSE_PROJECT_NAME}"
    echo -e "  ushadow Backend: ${USHADOW_BACKEND_PORT}"
    echo -e "  ushadow Frontend:${USHADOW_FRONTEND_PORT}"
    echo -e "  Chronicle:       ${CHRONICLE_PORT}"
    echo -e "  Database:        ${MONGODB_DATABASE}"
    echo ""

    # Create .env file with worktree-specific overrides
    cat > "$ENV_FILE" <<EOF
# ushadow Environment Configuration
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# DO NOT COMMIT - Contains environment-specific configuration

# ==========================================
# ENVIRONMENT & PROJECT NAMING
# ==========================================
ENV_NAME=${ENV_NAME}
COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME}
NODE_ENV=development

# ==========================================
# AUTHENTICATION (Generated)
# ==========================================
AUTH_SECRET_KEY=${AUTH_SECRET_KEY}
SESSION_SECRET=${SESSION_SECRET}
ADMIN_NAME=${ADMIN_NAME}
ADMIN_EMAIL=${ADMIN_EMAIL}
ADMIN_PASSWORD=${ADMIN_PASSWORD}

# ==========================================
# DATABASE ISOLATION
# ==========================================
MONGODB_URI=mongodb://mongo:27017
MONGODB_DATABASE=${MONGODB_DATABASE}
REDIS_URL=redis://redis:6379/${REDIS_DATABASE}
REDIS_DATABASE=${REDIS_DATABASE}

# ==========================================
# PORT CONFIGURATION
# ==========================================
PORT_OFFSET=${PORT_OFFSET}
USHADOW_BACKEND_PORT=${USHADOW_BACKEND_PORT}
USHADOW_FRONTEND_PORT=${USHADOW_FRONTEND_PORT}
CHRONICLE_PORT=${CHRONICLE_PORT}

# ==========================================
# CHRONICLE INTEGRATION
# ==========================================
CHRONICLE_URL=http://chronicle-backend:${CHRONICLE_PORT}
CHRONICLE_API_URL=http://localhost:${CHRONICLE_PORT}

# ==========================================
# CORS & FRONTEND CONFIGURATION
# ==========================================
CORS_ORIGINS=http://localhost:${USHADOW_FRONTEND_PORT},http://127.0.0.1:${USHADOW_FRONTEND_PORT},http://localhost:${USHADOW_BACKEND_PORT},http://127.0.0.1:${USHADOW_BACKEND_PORT}
VITE_API_URL=http://localhost:${USHADOW_BACKEND_PORT}
VITE_CHRONICLE_URL=http://localhost:${CHRONICLE_PORT}

# ==========================================
# MCP INTEGRATION (Optional)
# ==========================================
MCP_SERVER_URL=http://mcp-server:8765
MCP_ENABLED=false

# ==========================================
# AGENT ZERO INTEGRATION (Optional)
# ==========================================
AGENT_ZERO_URL=http://agent-zero:9000
AGENT_ZERO_ENABLED=false

# ==========================================
# N8N WORKFLOW INTEGRATION (Optional)
# ==========================================
N8N_URL=http://n8n:5678
N8N_ENABLED=false

# ==========================================
# API KEYS (Optional - Add your keys here)
# ==========================================
# OPENAI_API_KEY=
# DEEPGRAM_API_KEY=
# MISTRAL_API_KEY=
# ANTHROPIC_API_KEY=
EOF

    chmod 600 "$ENV_FILE"

    # Create backend .env symlink or copy
    mkdir -p backend
    if [[ ! -f "$BACKEND_ENV_FILE" ]]; then
        ln -s "../$ENV_FILE" "$BACKEND_ENV_FILE" 2>/dev/null || cp "$ENV_FILE" "$BACKEND_ENV_FILE"
    fi

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
    ADMIN_NAME=$(grep "^ADMIN_NAME=" "$ENV_FILE" | cut -d'=' -f2)
    ADMIN_EMAIL=$(grep "^ADMIN_EMAIL=" "$ENV_FILE" | cut -d'=' -f2)
    ADMIN_PASSWORD=$(grep "^ADMIN_PASSWORD=" "$ENV_FILE" | cut -d'=' -f2)
    USHADOW_BACKEND_PORT=$(grep "^USHADOW_BACKEND_PORT=" "$ENV_FILE" | cut -d'=' -f2)
    USHADOW_FRONTEND_PORT=$(grep "^USHADOW_FRONTEND_PORT=" "$ENV_FILE" | cut -d'=' -f2)
    # Set defaults if not found
    USHADOW_BACKEND_PORT=${USHADOW_BACKEND_PORT:-8080}
    USHADOW_FRONTEND_PORT=${USHADOW_FRONTEND_PORT:-3000}
    echo ""
    echo -e "${BOLD}Login Credentials:${NC}"
    echo -e "  Name:     ${ADMIN_NAME:-admin}"
    echo -e "  Email:    ${ADMIN_EMAIL}"
    echo -e "  Password: ${YELLOW}${ADMIN_PASSWORD}${NC}"
    echo ""
fi

# Create external Docker network for cross-service communication
echo -e "${BLUE}🌐 Setting up Docker network...${NC}"
if ! docker network inspect ushadow-network >/dev/null 2>&1; then
    docker network create ushadow-network
    echo -e "${GREEN}   ✅ Created ushadow-network${NC}"
else
    echo -e "${GREEN}   ✅ ushadow-network already exists${NC}"
fi
echo ""

# Start infrastructure
echo -e "${BLUE}🏗️  Starting infrastructure...${NC}"
if docker ps --filter "name=^mongo$" --filter "status=running" -q | grep -q .; then
    echo -e "${GREEN}   ✅ Infrastructure already running${NC}"
else
    docker compose -f deployment/docker-compose.infra.yml up -d
    echo -e "${GREEN}   ✅ Infrastructure started${NC}"
    sleep 3
fi
echo ""

# Start Chronicle (as a service)
echo -e "${BLUE}📚 Starting Chronicle backend...${NC}"
if docker ps --filter "name=chronicle-backend" --filter "status=running" -q | grep -q .; then
    echo -e "${GREEN}   ✅ Chronicle already running${NC}"
else
    docker compose -f deployment/docker-compose.chronicle.yml up -d
    echo -e "${GREEN}   ✅ Chronicle started${NC}"
    sleep 2
fi
echo ""

# Start ushadow application
echo -e "${BLUE}🚀 Starting ushadow application...${NC}"
echo ""
docker compose up -d --build

echo ""
echo "   Waiting for services to be healthy..."
sleep 3

# Wait for backend health check (with timeout)
TIMEOUT=60
ELAPSED=0
BACKEND_HEALTHY=false

while [[ $ELAPSED -lt $TIMEOUT ]]; do
    if curl -s http://localhost:${USHADOW_BACKEND_PORT}/health > /dev/null 2>&1; then
        BACKEND_HEALTHY=true
        break
    fi
    sleep 2
    ELAPSED=$((ELAPSED + 2))
done

echo ""
if [[ "$BACKEND_HEALTHY" == true ]]; then
    echo -e "${GREEN}${BOLD}✅ ushadow is ready!${NC}"
else
    echo -e "${YELLOW}⚠️  Backend is starting... (may take a moment)${NC}"
fi

echo ""
echo -e "${BOLD}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║                                                    ║${NC}"
echo -e "${BOLD}║  ${GREEN}🌟 Open ushadow Dashboard:${NC}${BOLD}                      ║${NC}"
echo -e "${BOLD}║                                                    ║${NC}"
echo -e "${BOLD}║     ${GREEN}${BOLD}http://localhost:${USHADOW_FRONTEND_PORT}${NC}${BOLD}                          ║${NC}"
echo -e "${BOLD}║                                                    ║${NC}"
echo -e "${BOLD}║  ${YELLOW}(Click the link above or copy to browser)${NC}${BOLD}     ║${NC}"
echo -e "${BOLD}║                                                    ║${NC}"
echo -e "${BOLD}╚════════════════════════════════════════════════════╝${NC}"
echo ""

# Service status
echo -e "${BOLD}🔗 Service URLs:${NC}"
echo -e "  ushadow API:       http://localhost:${USHADOW_BACKEND_PORT}"
echo -e "  Chronicle API:     http://localhost:${CHRONICLE_PORT}"
echo ""

# Check for missing API keys
echo -e "${YELLOW}⚠️  Optional features (configure API keys to enable):${NC}"
echo -e "   • AI Memory extraction (OpenAI API key)"
echo -e "   • Transcription (Deepgram API key)"
echo -e "   • MCP integrations (configure in settings)"
echo -e "   • Agent Zero (configure in settings)"
echo -e "   • n8n workflows (configure in settings)"
echo ""
echo -e "   ${BOLD}→ Configure at: http://localhost:${USHADOW_FRONTEND_PORT}/settings${NC}"
echo ""

# Next steps
echo -e "${BOLD}Next steps:${NC}"
echo "  1. Login with the credentials shown above"
echo "  2. Configure API keys in Settings"
echo "  3. Explore Chronicle conversations"
echo "  4. Set up MCP connections"
echo "  5. Configure Agent Zero"
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
