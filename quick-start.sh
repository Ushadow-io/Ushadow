#!/bin/bash

# Ushadow Quick Start (with config.yml support)
# Zero-configuration startup for local development

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Configuration
ENV_FILE=".env"  # Main environment file (ports, databases)
CONFIG_DIR="config"  # YAML config directory
SECRETS_FILE="$CONFIG_DIR/secrets.yaml"  # Sensitive credentials (gitignored)

# Parse arguments
RESET_CONFIG=false
if [[ "$1" == "--reset" ]]; then
    RESET_CONFIG=true
fi

# Print header
echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}🚀 Ushadow Quick Start${NC}"
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

    # Path to setup utilities
    SETUP_UTILS="setup/setup_utils.py"
    START_UTILS="setup/start_utils.py"

    # Prompt for port offset (for multi-worktree environments)
    echo ""
    echo -e "${BOLD}Port Configuration${NC}"
    echo -e "${YELLOW}For multi-worktree setups, use different offsets for each environment${NC}"
    echo -e "${YELLOW}Suggested: blue=0, gold=10, green=20, red=30${NC}"
    echo ""

    # Loop until we find available ports
    PORTS_AVAILABLE=false
    while [ "$PORTS_AVAILABLE" = false ]; do
        read -p "Port offset [0]: " INPUT_PORT_OFFSET
        PORT_OFFSET="${INPUT_PORT_OFFSET:-0}"

        # Calculate application ports from offset (backend and frontend only)
        BACKEND_PORT=$((8000 + PORT_OFFSET))
        WEBUI_PORT=$((3000 + PORT_OFFSET))

        # Use Python utility for port validation
        set +e
        PORT_CHECK=$(python3 "$SETUP_UTILS" validate-ports "$BACKEND_PORT" "$WEBUI_PORT" 2>/dev/null)
        PORT_EXIT_CODE=$?
        set -e

        if [ $PORT_EXIT_CODE -eq 0 ]; then
            PORTS_AVAILABLE=true
        else
            # Parse conflicts from JSON
            CONFLICTS=$(echo "$PORT_CHECK" | python3 -c "import sys, json; data=json.load(sys.stdin); print('\n'.join([f'Port {p} is already in use' for p in data['conflicts']]))" 2>/dev/null)

            echo ""
            echo -e "${RED}⚠️  Port conflict detected:${NC}"
            echo "$CONFLICTS"
            echo -e "${YELLOW}Please choose a different offset${NC}"
            echo ""
        fi
    done

    # Find available Redis database (0-15)
    # Redis only supports 16 databases, so we use an environment marker system:
    # 1. Check if this environment already has a marked database (reuse it)
    # 2. Try preferred database (based on port offset: PORT_OFFSET/10 % 16)
    # 3. Fall back to any empty database (0-15)
    # This prevents running out of databases when restarting environments
    PREFERRED_REDIS_DB=$(( (PORT_OFFSET / 10) % 16 ))

    # Use Python utility to find available database (with environment awareness)
    set +e
    REDIS_RESULT=$(python3 "$SETUP_UTILS" find-redis-db "$PREFERRED_REDIS_DB" "$ENV_NAME" 2>/dev/null)
    REDIS_EXIT_CODE=$?
    set -e

    if [ $REDIS_EXIT_CODE -eq 0 ] && [ -n "$REDIS_RESULT" ]; then
        # Parse JSON once and extract all three values
        read REDIS_DATABASE MATCHED_ENV CHANGED < <(echo "$REDIS_RESULT" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data['db_num'], data['matched_env'], data['changed'])")

        if [ "$MATCHED_ENV" = "True" ]; then
            echo -e "${GREEN}✓ Reusing Redis database ${REDIS_DATABASE} for environment '${ENV_NAME}'${NC}"
        elif [ "$CHANGED" = "True" ]; then
            echo -e "${YELLOW}Redis database ${PREFERRED_REDIS_DB} already has data${NC}"
            echo -e "${GREEN}Using available database ${REDIS_DATABASE} for '${ENV_NAME}'${NC}"
        fi

        # Set environment marker in the selected database
        set +e
        python3 "$SETUP_UTILS" set-redis-marker "$REDIS_DATABASE" "$ENV_NAME" > /dev/null 2>&1
        set -e
    else
        # Fallback if parsing fails
        REDIS_DATABASE=$PREFERRED_REDIS_DB
    fi

    # Calculate test environment ports (for parallel testing across worktrees)
    # Tests use shared infrastructure (MongoDB, Redis, Qdrant) but need unique app ports
    TEST_BACKEND_PORT=$((8001 + PORT_OFFSET))
    TEST_WEBUI_PORT=$((3001 + PORT_OFFSET))

    # Set database and project names based on environment name
    # Avoid chronicle-chronicle duplication
    if [[ "$ENV_NAME" == "ushadow" ]]; then
        MONGODB_DATABASE="ushadow"
        COMPOSE_PROJECT_NAME="ushadow"
    else
        MONGODB_DATABASE="ushadow_${ENV_NAME}"
        COMPOSE_PROJECT_NAME="ushadow-${ENV_NAME}"
    fi

    echo ""
    echo -e "${GREEN}✅ Environment configured${NC}"
    echo -e "  Name:     ${ENV_NAME}"
    echo -e "  Project:  ${COMPOSE_PROJECT_NAME}"
    echo -e "  Backend:  ${BACKEND_PORT}"
    echo -e "  WebUI:    ${WEBUI_PORT}"
    echo -e "  Database: ${MONGODB_DATABASE}"
    echo ""

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

    echo ""
    echo -e "${GREEN}✅ Admin account configured${NC}"
    echo -e "  Name:     ${ADMIN_NAME}"
    echo -e "  Email:    ${ADMIN_EMAIL}"
    echo -e "  Password: ${YELLOW}${ADMIN_PASSWORD}${NC}"
    echo ""

    # Create minimal .env file with deployment config only
    cat > "$ENV_FILE" <<EOF
# Ushadow Environment Configuration
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# DO NOT COMMIT - Contains environment-specific configuration
#
# This file contains ONLY deployment configuration (ports, databases).
# Application config (API keys, services) managed via:
#   - config/config.defaults.yaml (defaults)
#   - config/config.local.yaml (local overrides)
#   - config/services.yaml (service definitions)

# ==========================================
# ENVIRONMENT & PROJECT NAMING
# ==========================================
COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME}

# ==========================================
# PORT CONFIGURATION
# ==========================================
PORT_OFFSET=${PORT_OFFSET}
BACKEND_PORT=${BACKEND_PORT}
WEBUI_PORT=${WEBUI_PORT}

# ==========================================
# DATABASE ISOLATION
# ==========================================
MONGODB_DATABASE=${MONGODB_DATABASE}
REDIS_DATABASE=${REDIS_DATABASE}

# ==========================================
# CORS & FRONTEND CONFIGURATION
# ==========================================
CORS_ORIGINS=http://localhost:${WEBUI_PORT},http://127.0.0.1:${WEBUI_PORT},http://localhost:${BACKEND_PORT},http://127.0.0.1:${BACKEND_PORT}
VITE_BACKEND_URL=http://localhost:${BACKEND_PORT}
HOST_IP=localhost

# ==========================================
# NOTE: Application Configuration
# ==========================================
# This file contains ONLY deployment configuration (ports, databases, networking).
# 
# Sensitive credentials (admin, API keys) are stored in:
#   config/secrets.yaml (gitignored)
#
# Application configuration is stored in:
#   config/config.defaults.yaml (defaults, version-controlled)
#   config/config.local.yaml (local overrides, gitignored)
#   config/services.yaml (service definitions, version-controlled)
# 
# To change admin credentials, edit config/secrets.yaml or run: ./quick-start.sh --reset
EOF

    chmod 600 "$ENV_FILE"

    # Create secrets.yaml for sensitive credentials
    mkdir -p "$CONFIG_DIR"
    cat > "$SECRETS_FILE" <<EOF
# Ushadow Secrets
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# DO NOT COMMIT - Contains sensitive credentials
# This file is gitignored

# Admin Account
admin:
  name: "${ADMIN_NAME}"
  email: "${ADMIN_EMAIL}"
  password: "${ADMIN_PASSWORD}"

# API Keys (add your keys here)
api_keys:
  openai: ""
  anthropic: ""
  deepgram: ""
  mistral: ""
  pieces: ""

# Service Credentials
services:
  openmemory:
    api_key: ""
  chronicle:
    api_key: ""
EOF

    chmod 600 "$SECRETS_FILE"

    echo ""
    echo -e "${GREEN}✅ Configuration saved${NC}"
    echo -e "  Deployment config: ${ENV_FILE}"
    echo -e "  Secrets:           ${SECRETS_FILE}"
    echo ""
    sleep 2
else
    echo -e "${GREEN}✅ Using existing configuration${NC}"
    
    # Extract configuration from .env
    BACKEND_PORT=$(grep "^BACKEND_PORT=" "$ENV_FILE" | cut -d'=' -f2 | tr -d ' ')
    WEBUI_PORT=$(grep "^WEBUI_PORT=" "$ENV_FILE" | cut -d'=' -f2 | tr -d ' ')
    
    # Set defaults if not found
    BACKEND_PORT=${BACKEND_PORT:-8000}
    WEBUI_PORT=${WEBUI_PORT:-3000}
    
    # Extract admin credentials from secrets.yaml if it exists
    if [[ -f "$SECRETS_FILE" ]]; then
        ADMIN_NAME=$(grep -A 3 "^admin:" "$SECRETS_FILE" | grep "name:" | cut -d'"' -f2 2>/dev/null || echo "admin")
        ADMIN_EMAIL=$(grep -A 3 "^admin:" "$SECRETS_FILE" | grep "email:" | cut -d'"' -f2 2>/dev/null || echo "admin@ushadow.local")
        ADMIN_PASSWORD=$(grep -A 3 "^admin:" "$SECRETS_FILE" | grep "password:" | cut -d'"' -f2 2>/dev/null || echo "ushadow-dev")
    else
        ADMIN_NAME="admin"
        ADMIN_EMAIL="admin@ushadow.local"
        ADMIN_PASSWORD="ushadow-dev"
    fi
    
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
    COMPOSE_OVERRIDE_FILE="-f compose/overrides/prod.yml"
    echo -e "${BLUE}   Using production build (no hot-reload)${NC}"
else
    USE_DEV_SERVER=true
    COMPOSE_OVERRIDE_FILE="-f compose/overrides/dev-webui.yml"
    echo -e "${GREEN}   Using dev server with hot-reload${NC}"
    # Add Vite dev server internal port to CORS (5173 is Vite's default)
    CORS_ORIGINS="${CORS_ORIGINS},http://localhost:5173,http://127.0.0.1:5173"
fi
echo ""

# Start infrastructure
echo -e "${BLUE}🏗️  Starting infrastructure...${NC}"

# Ensure Docker networks exist
python3 "$START_UTILS" ensure-networks >/dev/null 2>&1 || true

# Check if infrastructure is running
INFRA_RUNNING=$(python3 "$START_UTILS" check-infrastructure 2>/dev/null | python3 -c "import sys, json; print(json.load(sys.stdin)['running'])" 2>/dev/null || echo "false")

if [ "$INFRA_RUNNING" = "True" ]; then
    echo -e "${GREEN}   ✅ Infrastructure already running${NC}"
    echo -e "      MongoDB: $(docker ps --filter 'name=mongo' --format '{{.Names}}')"
    echo -e "      Redis:   $(docker ps --filter 'name=redis' --format '{{.Names}}')"
    echo -e "      Qdrant:  $(docker ps --filter 'name=qdrant' --format '{{.Names}}')"
else
    echo -e "${YELLOW}   Starting infrastructure services...${NC}"
    
    # Start infrastructure (handles both existing stopped containers and creating new ones)
    INFRA_RESULT=$(python3 "$START_UTILS" start-infrastructure "docker-compose.infra.yml" "ushadow-infra" 2>&1)
    INFRA_SUCCESS=$(echo "$INFRA_RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin)['success'])" 2>/dev/null || echo "false")
    INFRA_MESSAGE=$(echo "$INFRA_RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin)['message'])" 2>/dev/null || echo "Unknown error")
    
    if [ "$INFRA_SUCCESS" = "True" ]; then
        echo -e "${GREEN}   ✅ Infrastructure started${NC}"
        echo -e "      MongoDB: mongo"
        echo -e "      Redis:   redis"
        echo -e "      Qdrant:  qdrant"
    else
        echo -e "${RED}   ❌ Failed to start infrastructure${NC}"
        echo -e "${YELLOW}      Error: $INFRA_MESSAGE${NC}"
        echo ""
        echo -e "${YELLOW}   Attempting manual container start...${NC}"
        
        # Try to start existing containers manually
        docker start mongo redis qdrant >/dev/null 2>&1 || true
        
        # Check if they're running now
        if docker ps --filter 'name=mongo' --filter 'status=running' -q | grep -q .; then
            echo -e "${GREEN}   ✅ Infrastructure containers started manually${NC}"
        else
            echo -e "${RED}   ❌ Could not start infrastructure${NC}"
            echo -e "${YELLOW}   Please check: docker ps -a | grep -E 'mongo|redis|qdrant'${NC}"
            exit 1
        fi
    fi
fi
echo ""

# Start application
echo -e "${BLUE}🚀 Starting Ushadow application...${NC}"
echo ""
docker compose -f docker-compose.yml $COMPOSE_OVERRIDE_FILE up -d --build  # Build and start with .env overrides

echo ""
echo "   Waiting for backend to be healthy..."
sleep 3

# Wait for backend health check
RESULT=$(python3 "$START_UTILS" wait-backend "$BACKEND_PORT" 60 2>/dev/null || echo '{"healthy": false, "elapsed": 60}')
BACKEND_HEALTHY=$(echo "$RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin)['healthy'])" 2>/dev/null || echo "false")

echo ""
if [[ "$BACKEND_HEALTHY" == "True" ]]; then
    echo -e "${GREEN}${BOLD}✅ ushadow is ready!${NC}"
else
    echo -e "${YELLOW}⚠️  Backend is starting... (may take a moment)${NC}"
fi

echo ""
echo -e "${BOLD}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║                                                    ║${NC}"
echo -e "${BOLD}║  ${GREEN}🚀 ushadow is ready!${NC}${BOLD}                          ║${NC}"
echo -e "${BOLD}║                                                    ║${NC}"
echo -e "${BOLD}║     ${GREEN}${BOLD}http://localhost:${WEBUI_PORT}${NC}${BOLD}                          ║${NC}"
echo -e "${BOLD}║                                                    ║${NC}"
if [[ "$USE_DEV_SERVER" == true ]]; then
echo -e "${BOLD}║  ${GREEN}(Dev server with hot-reload enabled)${NC}${BOLD}          ║${NC}"
echo -e "${BOLD}║                                                    ║${NC}"
fi
echo -e "${BOLD}║  ${YELLOW}(Click the link above or copy to browser)${NC}${BOLD}     ║${NC}"
echo -e "${BOLD}║                                                    ║${NC}"
echo -e "${BOLD}╚════════════════════════════════════════════════════╝${NC}"
echo ""

# Login instructions
echo -e "${BOLD}📋 Login & Next Steps:${NC}"
echo ""
echo "  1. Open the web interface: http://localhost:${WEBUI_PORT}"
echo "  2. Login with the credentials below"
echo "  3. Add API keys to config/secrets.yaml"
echo "  4. Configure services in Settings page"
echo ""
echo -e "${BOLD}Admin Credentials:${NC}"
echo -e "  Email:    ${ADMIN_EMAIL}"
echo -e "  Password: ${YELLOW}${ADMIN_PASSWORD}${NC}"
echo ""
echo -e "${BOLD}Configuration Files:${NC}"
echo -e "  Deployment: ${ENV_FILE}"
echo -e "  Secrets:    ${SECRETS_FILE}"
echo ""

# Check for Tailscale
if command -v tailscale &> /dev/null && tailscale status &> /dev/null; then
    TAILSCALE_HOSTNAME=$(tailscale status --json 2>/dev/null | grep -o '"DNSName":"[^"]*"' | cut -d'"' -f4 | head -1 || echo "")

    if [[ -n "$TAILSCALE_HOSTNAME" ]]; then
        echo -e "${BLUE}🌐 Tailscale detected: ${TAILSCALE_HOSTNAME}${NC}"
        echo ""
        read -p "Configure HTTPS access via Tailscale? (y/N): " setup_tailscale

        if [[ "$setup_tailscale" == "y" ]] || [[ "$setup_tailscale" == "Y" ]]; then
            echo ""
            echo -e "${BLUE}🔒 Provisioning Tailscale certificates...${NC}"

            # Provision certificates
            tailscale cert "$TAILSCALE_HOSTNAME" 2>/dev/null || true

            # Update .env.quick-start with HTTPS settings
            echo "" >> "$ENV_FILE"
            echo "# Tailscale HTTPS Configuration" >> "$ENV_FILE"
            echo "TAILSCALE_HOSTNAME=${TAILSCALE_HOSTNAME}" >> "$ENV_FILE"
            echo "HTTPS_ENABLED=true" >> "$ENV_FILE"
            echo "CORS_ORIGINS=https://${TAILSCALE_HOSTNAME}:9000,https://${TAILSCALE_HOSTNAME}:4000,http://localhost:${WEBUI_PORT}" >> "$ENV_FILE"

            echo ""
            echo -e "${GREEN}✅ HTTPS configured!${NC}"
            echo ""
            echo -e "   Access from any device on your tailnet:"
            echo -e "   ${BOLD}https://${TAILSCALE_HOSTNAME}:4000${NC}"
            echo ""
            echo -e "${YELLOW}   Note: Restart services to apply HTTPS settings:${NC}"
            echo -e "   ${BOLD}make restart${NC}"
            echo ""
        fi
    fi
fi

# Usage information
echo -e "${BOLD}Helpful commands:${NC}"
echo "  Stop:    make down"
echo "  Restart: make restart"
echo "  Logs:    make logs"
echo "  Rebuild: make build"
echo ""

echo -e "${GREEN}${BOLD}🎉 Setup complete! Happy coding!${NC}"
echo ""
