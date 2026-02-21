#!/bin/bash
# Diagnose ush CLI authentication issues
# This script checks all requirements for Keycloak CLI authentication

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color
BOLD='\033[1m'

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 Diagnosing ush CLI Authentication"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Get configuration from .env
if [ -f .env ]; then
    BACKEND_PORT=$(grep BACKEND_PORT .env | cut -d= -f2)
    KEYCLOAK_PORT=$(grep KEYCLOAK_PORT .env | cut -d= -f2)
    KEYCLOAK_EXTERNAL_URL=$(grep KEYCLOAK_EXTERNAL_URL .env | cut -d= -f2)
else
    echo -e "${YELLOW}⚠️  No .env file found - using defaults${NC}"
    BACKEND_PORT=8000
    KEYCLOAK_PORT=8081
    KEYCLOAK_EXTERNAL_URL="http://localhost:8081"
fi

BACKEND_URL="http://localhost:${BACKEND_PORT}"

echo -e "${BOLD}Configuration:${NC}"
echo "  Backend URL:    $BACKEND_URL"
echo "  Keycloak URL:   $KEYCLOAK_EXTERNAL_URL"
echo ""

# Step 1: Check backend connectivity
echo -e "${BOLD}1. Checking backend connectivity...${NC}"
if curl -s -f "${BACKEND_URL}/health" > /dev/null 2>&1; then
    echo -e "   ${GREEN}✓${NC} Backend is reachable"
else
    echo -e "   ${RED}✗${NC} Backend is NOT reachable at $BACKEND_URL"
    echo ""
    echo -e "${YELLOW}Fix:${NC} Start the backend with:"
    echo "  cd ushadow/backend && pixi run dev"
    echo ""
    exit 1
fi

# Step 2: Check Keycloak configuration
echo -e "${BOLD}2. Checking Keycloak configuration...${NC}"
KC_CONFIG=$(curl -s "${BACKEND_URL}/api/keycloak/config")

if [ -z "$KC_CONFIG" ]; then
    echo -e "   ${RED}✗${NC} Failed to fetch Keycloak config from backend"
    exit 1
fi

KC_ENABLED=$(echo "$KC_CONFIG" | python3 -c "import sys, json; print(json.load(sys.stdin).get('enabled', False))" 2>/dev/null || echo "false")
KC_PUBLIC_URL=$(echo "$KC_CONFIG" | python3 -c "import sys, json; print(json.load(sys.stdin).get('public_url', ''))" 2>/dev/null || echo "")
KC_REALM=$(echo "$KC_CONFIG" | python3 -c "import sys, json; print(json.load(sys.stdin).get('realm', ''))" 2>/dev/null || echo "")

if [ "$KC_ENABLED" = "True" ]; then
    echo -e "   ${GREEN}✓${NC} Keycloak is enabled"
    echo "   Public URL: $KC_PUBLIC_URL"
    echo "   Realm:      $KC_REALM"
else
    echo -e "   ${RED}✗${NC} Keycloak is DISABLED in backend configuration"
    echo ""
    echo -e "${YELLOW}Fix:${NC} Enable Keycloak in config/config.defaults.yaml:"
    echo "  keycloak:"
    echo "    enabled: true"
    echo ""
    exit 1
fi

# Step 3: Check Keycloak accessibility
echo -e "${BOLD}3. Checking Keycloak accessibility...${NC}"
KC_URL="${KC_PUBLIC_URL}/realms/${KC_REALM}"

if curl -s -f "${KC_URL}" > /dev/null 2>&1; then
    echo -e "   ${GREEN}✓${NC} Keycloak realm is accessible at $KC_URL"
else
    echo -e "   ${RED}✗${NC} Keycloak realm is NOT accessible"
    echo "   Tried: $KC_URL"
    echo ""
    echo -e "${YELLOW}Fix:${NC} Ensure Keycloak is running:"
    echo "  docker-compose up -d keycloak"
    echo ""
    exit 1
fi

# Step 4: Check credentials configuration
echo -e "${BOLD}4. Checking credentials configuration...${NC}"

if [ -f config/SECRETS/secrets.yaml ]; then
    ADMIN_EMAIL=$(python3 -c "import yaml; data = yaml.safe_load(open('config/SECRETS/secrets.yaml')); print(data.get('admin', {}).get('email', ''))" 2>/dev/null || echo "")
    ADMIN_PASSWORD=$(python3 -c "import yaml; data = yaml.safe_load(open('config/SECRETS/secrets.yaml')); print(data.get('admin', {}).get('password', ''))" 2>/dev/null || echo "")

    if [ -n "$ADMIN_EMAIL" ] && [ -n "$ADMIN_PASSWORD" ]; then
        echo -e "   ${GREEN}✓${NC} Credentials found in config/SECRETS/secrets.yaml"
        echo "   Email: $ADMIN_EMAIL"
    else
        echo -e "   ${YELLOW}⚠${NC}  No credentials in secrets.yaml - checking .env"
        ADMIN_EMAIL=$(grep ADMIN_EMAIL .env | cut -d= -f2)
        ADMIN_PASSWORD=$(grep ADMIN_PASSWORD .env | cut -d= -f2)

        if [ -n "$ADMIN_EMAIL" ] && [ -n "$ADMIN_PASSWORD" ]; then
            echo -e "   ${GREEN}✓${NC} Credentials found in .env"
            echo "   Email: $ADMIN_EMAIL"
        else
            echo -e "   ${RED}✗${NC} No admin credentials found"
            echo ""
            echo -e "${YELLOW}Fix:${NC} Add credentials to config/SECRETS/secrets.yaml:"
            echo "  admin:"
            echo "    email: admin@example.com"
            echo "    password: your_password"
            echo ""
            exit 1
        fi
    fi
else
    echo -e "   ${YELLOW}⚠${NC}  No secrets.yaml found - checking .env"
    ADMIN_EMAIL=$(grep ADMIN_EMAIL .env | cut -d= -f2)
    if [ -n "$ADMIN_EMAIL" ]; then
        echo -e "   ${GREEN}✓${NC} Email found in .env: $ADMIN_EMAIL"
    else
        echo -e "   ${RED}✗${NC} No admin email configured"
    fi
fi

# Step 5: Test Keycloak Direct Grant capability
echo -e "${BOLD}5. Testing Keycloak Direct Grant capability...${NC}"

TOKEN_URL="${KC_PUBLIC_URL}/realms/${KC_REALM}/protocol/openid-connect/token"

# Try to get a token (this will fail if Direct Access Grants is disabled)
TOKEN_RESPONSE=$(curl -s -X POST "$TOKEN_URL" \
    -d "grant_type=password" \
    -d "client_id=ushadow-cli" \
    -d "username=${ADMIN_EMAIL}" \
    -d "password=${ADMIN_PASSWORD}" \
    2>&1)

# Check if we got an access token
if echo "$TOKEN_RESPONSE" | grep -q '"access_token"'; then
    echo -e "   ${GREEN}✓${NC} Direct Access Grants is working!"
    echo -e "   ${GREEN}✓${NC} Successfully obtained access token"
else
    # Parse error message
    ERROR=$(echo "$TOKEN_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('error_description', data.get('error', 'Unknown error')))" 2>/dev/null || echo "$TOKEN_RESPONSE")

    if echo "$ERROR" | grep -q "invalid_grant"; then
        echo -e "   ${RED}✗${NC} Authentication failed - invalid credentials"
        echo "   Error: $ERROR"
        echo ""
        echo -e "${YELLOW}Fix:${NC} Ensure the user exists in Keycloak with correct credentials"
    elif echo "$ERROR" | grep -q "unauthorized_client"; then
        echo -e "   ${RED}✗${NC} Direct Access Grants is NOT enabled for ushadow-cli"
        echo "   Error: $ERROR"
        echo ""
        echo -e "${YELLOW}Fix:${NC} Enable Direct Access Grants by running:"
        echo "  ./scripts/enable-keycloak-cli-auth.sh"
        echo ""
        echo "Or manually enable it in Keycloak Admin Console:"
        echo "  1. Go to: ${KEYCLOAK_EXTERNAL_URL}/admin"
        echo "  2. Select realm: $KC_REALM"
        echo "  3. Go to: Clients → ushadow-cli → Settings"
        echo "  4. Enable: Direct Access Grants"
        echo "  5. Click: Save"
        echo ""
        exit 1
    else
        echo -e "   ${RED}✗${NC} Authentication failed"
        echo "   Error: $ERROR"
    fi
fi

# Step 6: Test ush with verbose mode
echo -e "${BOLD}6. Testing ush CLI...${NC}"
echo "   Running: ./ush health --verbose"
echo ""

./ush health --verbose

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✓ Diagnosis Complete${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
