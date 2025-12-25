#!/bin/bash
# set -e  # Exit on error

# ============================================================================
# APPLICATION CONFIGURATION
# Customize these variables to use this script for different applications
# ============================================================================

# Application identity
APP_NAME="ushadow"                  # Short name (lowercase for DB names, env names)
APP_DISPLAY_NAME="Ushadow"          # Display name for UI messages

# Directory structure
SETUP_DIR="setup"                      # Setup utilities directory
COMPOSE_OVERRIDES_DIR="compose/overrides"  # Docker Compose overrides

# Docker Compose files
INFRA_COMPOSE_FILE="docker-compose.infra.yml"  # Infrastructure services
APP_COMPOSE_FILE="docker-compose.yml"                   # Application services (in APP_DIR)
INFRA_PROJECT_NAME="infra"                              # Infrastructure compose project name

# Default ports
DEFAULT_BACKEND_PORT="8000"            # Backend API port
DEFAULT_WEBUI_PORT="3000"              # Web UI port

# ============================================================================
# END CONFIGURATION - Do not modify below this line
# ============================================================================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Derived configuration
ENV_FILE=".env"
CONFIG_DIR="config"
CONFIG_FILE="${CONFIG_DIR}/config.yaml"
SECRETS_FILE="${CONFIG_DIR}/secrets.yaml"

# Parse arguments
RESET_CONFIG=false
if [[ "$1" == "--reset" ]]; then
    RESET_CONFIG=true
fi

# Print header
echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}🚀 ${APP_DISPLAY_NAME} Quick Start${NC}"
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
    echo -e "${YELLOW}Examples: ${APP_NAME}, blue, gold, green, dev, staging${NC}"
    echo ""

    read -p "Environment name [${APP_NAME}]: " INPUT_ENV_NAME
    ENV_NAME="${INPUT_ENV_NAME:-${APP_NAME}}"

    # Convert to lowercase and replace spaces/special chars with hyphens
    ENV_NAME=$(echo "$ENV_NAME" | tr '[:upper:]' '[:lower:]' | tr -cs '[:alnum:]' '-' | sed 's/-$//')

    # Path to setup utilities
    SETUP_UTILS="${SETUP_DIR}/setup_utils.py"
    START_UTILS="${SETUP_DIR}/start_utils.py"

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
        BACKEND_PORT=$((DEFAULT_BACKEND_PORT + PORT_OFFSET))
        WEBUI_PORT=$((DEFAULT_WEBUI_PORT + PORT_OFFSET))

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
    # Avoid app-app duplication (e.g., chronicle-chronicle)
    if [[ "$ENV_NAME" == "${APP_NAME}" ]]; then
        MONGODB_DATABASE="${APP_NAME}"
        COMPOSE_PROJECT_NAME="${APP_NAME}"
    else
        MONGODB_DATABASE="${APP_NAME}_${ENV_NAME}"
        COMPOSE_PROJECT_NAME="${APP_NAME}-${ENV_NAME}"
    fi

    echo ""
    echo -e "${GREEN}✅ Environment configured${NC}"
    echo -e "  Name:     ${ENV_NAME}"
    echo -e "  Project:  ${COMPOSE_PROJECT_NAME}"
    echo -e "  Backend:  ${BACKEND_PORT}"
    echo -e "  WebUI:    ${WEBUI_PORT}"
    echo -e "  Database: ${MONGODB_DATABASE}"
    echo ""

    # Create minimal .env file with deployment config only
    cat > "$ENV_FILE" <<EOF
# ${APP_DISPLAY_NAME} Environment Configuration
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# DO NOT COMMIT - Contains environment-specific configuration
#
# This file contains ONLY deployment configuration (ports, databases).
# Application config (API keys, providers) managed via config.yaml and secrets.yaml.
# See .env.default for base defaults (committed to git).

# ==========================================
# ENVIRONMENT & PROJECT NAMING
# ==========================================
ENV_NAME=${ENV_NAME}
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
VITE_ENV_NAME=${ENV_NAME}
HOST_IP=localhost

# ==========================================
# NOTE: Application Configuration
# ==========================================
# Admin credentials, API keys, and provider settings are managed via:
# - Setup wizard (first run): http://localhost:${WEBUI_PORT}/register
# - Settings page: http://localhost:${WEBUI_PORT}/settings
# - Config files: ${APP_DIR}/config/config.yaml and secrets.yaml
EOF

    chmod 600 "$ENV_FILE"

    # Generate secrets.yaml with security keys
    echo ""
    echo -e "${BLUE}🔐 Generating secrets...${NC}"
    RESULT=$(python3 "$SETUP_UTILS" ensure-secrets "$SECRETS_FILE")
    CREATED_NEW=$(echo "$RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin)['created_new'])" 2>/dev/null || echo "true")

    if [[ "$CREATED_NEW" == "True" ]] || [[ "$CREATED_NEW" == "true" ]]; then
        echo -e "${GREEN}   ✅ Generated security keys in secrets.yaml${NC}"
    else
        echo -e "${GREEN}   ✅ Security keys already configured${NC}"
    fi

    # Prompt for admin credentials
    echo ""
    echo -e "${BOLD}Admin Account Setup${NC}"
    echo -e "${YELLOW}Create your administrator account${NC}"
    echo ""

    read -p "Admin name [admin]: " INPUT_ADMIN_NAME
    ADMIN_NAME="${INPUT_ADMIN_NAME:-admin}"

    read -p "Admin email [admin@example.com]: " INPUT_ADMIN_EMAIL
    ADMIN_EMAIL="${INPUT_ADMIN_EMAIL:-admin@example.com}"

    # Password with confirmation
    while true; do
        read -sp "Admin password [password]: " INPUT_ADMIN_PASSWORD
        echo ""
        if [[ -z "$INPUT_ADMIN_PASSWORD" ]]; then
            ADMIN_PASSWORD="password"
            break
        fi
        read -sp "Confirm password: " INPUT_ADMIN_PASSWORD_CONFIRM
        echo ""
        if [[ "$INPUT_ADMIN_PASSWORD" == "$INPUT_ADMIN_PASSWORD_CONFIRM" ]]; then
            ADMIN_PASSWORD="$INPUT_ADMIN_PASSWORD"
            break
        else
            echo -e "${RED}Passwords do not match. Please try again.${NC}"
        fi
    done

    # Update admin credentials in secrets.yaml
    python3 -c "
import yaml
with open('$SECRETS_FILE', 'r') as f:
    data = yaml.safe_load(f)
if 'admin' not in data:
    data['admin'] = {}
data['admin']['name'] = '''$ADMIN_NAME'''
data['admin']['email'] = '''$ADMIN_EMAIL'''
data['admin']['password'] = '''$ADMIN_PASSWORD'''
with open('$SECRETS_FILE', 'w') as f:
    yaml.dump(data, f, default_flow_style=False, sort_keys=False)
" 2>/dev/null

    echo ""
    echo -e "${GREEN}✅ Admin credentials configured${NC}"

    echo ""
    echo -e "${GREEN}✅ Deployment configuration saved${NC}"
    echo ""
    echo -e "${YELLOW}📋 First-time setup will happen via web wizard${NC}"
    echo ""
    sleep 2
else
    echo -e "${GREEN}✅ Using existing configuration${NC}"
    # Extract ports from .env
    BACKEND_PORT=$(grep "^BACKEND_PORT=" "$ENV_FILE" | cut -d'=' -f2 | tr -d ' ')
    WEBUI_PORT=$(grep "^WEBUI_PORT=" "$ENV_FILE" | cut -d'=' -f2 | tr -d ' ')
    # Set defaults if not found
    BACKEND_PORT=${BACKEND_PORT:-${DEFAULT_BACKEND_PORT}}
    WEBUI_PORT=${WEBUI_PORT:-${DEFAULT_WEBUI_PORT}}
    echo ""
    echo -e "${YELLOW}📋 Login via web interface at http://localhost:${WEBUI_PORT}${NC}"
    echo ""
fi

# Development server mode (always enabled)
USE_DEV_SERVER=true
COMPOSE_OVERRIDE_FILE="-f compose/overrides/dev-webui.yml"
# Add Vite dev server internal port to CORS (5173 is Vite's default)
CORS_ORIGINS="${CORS_ORIGINS},http://localhost:5173,http://127.0.0.1:5173"
echo ""
echo -e "${GREEN}🔥 Development server with hot-reload enabled${NC}"
echo ""

# Start infrastructure
echo -e "${BLUE}🏗️  Starting infrastructure...${NC}"

# Ensure Docker networks exist
python3 "$START_UTILS" ensure-networks >/dev/null 2>&1 || true

# Check if infrastructure is running, start if needed
INFRA_RUNNING=$(python3 "$START_UTILS" check-infrastructure 2>/dev/null | python3 -c "import sys, json; print(json.load(sys.stdin)['running'])" 2>/dev/null || echo "false")

if [ "$INFRA_RUNNING" = "True" ]; then
    echo -e "${GREEN}   ✅ Infrastructure already running${NC}"
else
    python3 "$START_UTILS" start-infrastructure "${INFRA_COMPOSE_FILE}" "${INFRA_PROJECT_NAME}" >/dev/null 2>&1
    echo -e "${GREEN}   ✅ Infrastructure started${NC}"
fi
echo ""

# Start application
echo -e "${BLUE}🚀 Starting ${APP_DISPLAY_NAME} application...${NC}"
echo ""
docker compose -f ${APP_COMPOSE_FILE} $COMPOSE_OVERRIDE_FILE up -d --build  # Build and start with .env overrides

echo ""
echo "   Waiting for backend to be healthy..."
sleep 3

# Wait for backend health check
RESULT=$(python3 "$START_UTILS" wait-backend "$BACKEND_PORT" 60 2>/dev/null || echo '{"healthy": false, "elapsed": 60}')
BACKEND_HEALTHY=$(echo "$RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin)['healthy'])" 2>/dev/null || echo "false")

echo ""
if [[ "$BACKEND_HEALTHY" == "True" ]]; then
    echo -e "${GREEN}${BOLD}✅ ${APP_DISPLAY_NAME} is ready!${NC}"

    # Create admin user from secrets.yaml
    echo ""
    echo -e "${BLUE}👤 Creating admin user...${NC}"
    ADMIN_RESULT=$(python3 "$SETUP_UTILS" create-admin "$BACKEND_PORT" "$SECRETS_FILE" 2>&1)
    ADMIN_SUCCESS=$(echo "$ADMIN_RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin)['success'])" 2>/dev/null || echo "false")

    if [[ "$ADMIN_SUCCESS" == "True" ]]; then
        ADMIN_MESSAGE=$(echo "$ADMIN_RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin)['message'])" 2>/dev/null || echo "Success")
        echo -e "${GREEN}   ✅ ${ADMIN_MESSAGE}${NC}"
    else
        ADMIN_ERROR=$(echo "$ADMIN_RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin).get('error', 'Unknown error'))" 2>/dev/null || echo "Failed")
        echo -e "${YELLOW}   ⚠️  ${ADMIN_ERROR}${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Backend is starting... (may take a moment)${NC}"
fi

echo ""
echo -e "${BOLD}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║                                                    ║${NC}"
echo -e "${BOLD}║  ${GREEN}🚀 ${APP_DISPLAY_NAME} is ready!${NC}${BOLD}                          ║${NC}"
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

# First-time setup instructions
echo -e "${BOLD}📋 First-Time Setup:${NC}"
echo ""
echo "  1. Open the web interface (link above)"
echo "  2. Complete the setup wizard:"
echo "     • Create admin account"
echo "     • Configure API keys (OpenAI, Deepgram, etc.)"
echo "     • Select LLM and memory providers"
echo "     • Set up OpenMemory (optional)"
echo ""
echo -e "  ${GREEN}✓${NC} After setup, all settings managed via Settings page"
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
