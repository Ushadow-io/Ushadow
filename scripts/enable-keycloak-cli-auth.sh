#!/bin/bash
# Enable CLI authentication for Keycloak
# This enables Direct Access Grants (Resource Owner Password Credentials)
# which allows the ush CLI tool to authenticate with username/password.

set -e

# Get backend port from .env
if [ -f .env ]; then
    BACKEND_PORT=$(grep BACKEND_PORT .env | cut -d= -f2)
else
    BACKEND_PORT=8000
fi

BACKEND_URL="http://localhost:${BACKEND_PORT}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔐 Enabling Keycloak CLI Authentication"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Backend URL: $BACKEND_URL"
echo ""

# Check if backend is running
echo "Checking backend health..."
if ! curl -s -f "${BACKEND_URL}/health" > /dev/null; then
    echo "❌ Backend not running at $BACKEND_URL"
    echo "   Start backend first: cd ushadow/backend && pixi run dev"
    exit 1
fi
echo "✅ Backend healthy"
echo ""

# Check Keycloak status
echo "Checking Keycloak configuration..."
KC_CONFIG=$(curl -s "${BACKEND_URL}/api/keycloak/config")
KC_ENABLED=$(echo "$KC_CONFIG" | python3 -c "import sys, json; print(json.load(sys.stdin).get('enabled', False))" 2>/dev/null || echo "false")

if [ "$KC_ENABLED" != "True" ]; then
    echo "⚠️  Keycloak is not enabled"
    echo "   Enable in config/config.defaults.yaml: keycloak.enabled: true"
    exit 1
fi
echo "✅ Keycloak enabled"
echo ""

# Enable direct access grants for frontend client
echo "Enabling Direct Access Grants for ushadow-frontend client..."
RESULT=$(curl -s -X POST "${BACKEND_URL}/api/keycloak/clients/ushadow-frontend/enable-direct-grant")
SUCCESS=$(echo "$RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin).get('success', False))" 2>/dev/null || echo "false")

if [ "$SUCCESS" = "True" ]; then
    echo "✅ Direct Access Grants enabled"
else
    echo "❌ Failed to enable Direct Access Grants"
    echo "   $RESULT"
    exit 1
fi
echo ""

# Test authentication
echo "Testing CLI authentication..."
if ./ush health --verbose 2>&1 | grep -q "Login successful (Keycloak)"; then
    echo "✅ Keycloak CLI authentication working!"
else
    echo "⚠️  Authentication test unclear - check manually with:"
    echo "   ./ush services list --verbose"
fi
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Setup Complete"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "You can now use ush with Keycloak authentication:"
echo "  ./ush services list"
echo "  ./ush health"
echo ""
echo "Credentials are read from:"
echo "  - config/SECRETS/secrets.yaml (admin.email, admin.password)"
echo "  - Environment variables (ADMIN_EMAIL, ADMIN_PASSWORD)"
echo "  - .env file (ADMIN_EMAIL, ADMIN_PASSWORD)"
echo ""
