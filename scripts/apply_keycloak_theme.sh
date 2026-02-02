#!/bin/bash
#
# Apply Ushadow Theme to Keycloak
#
# Updates the Keycloak realm to use the custom Ushadow login theme.
# The theme must already be mounted in the Keycloak container.
#
# Usage:
#     ./scripts/apply_keycloak_theme.sh
#

set -e

# Configuration from environment or defaults
KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8081}"
REALM="${KEYCLOAK_REALM:-ushadow}"
THEME="${KEYCLOAK_LOGIN_THEME:-ushadow}"
ADMIN_USER="${KEYCLOAK_ADMIN_USER:-admin}"
ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:-admin}"

echo "🎨 Applying Ushadow theme to Keycloak realm '$REALM'..."
echo "   Keycloak URL: $KEYCLOAK_URL"
echo "   Theme: $THEME"
echo ""

# Get admin token
echo "🔑 Authenticating as Keycloak admin..."
TOKEN_RESPONSE=$(curl -s -X POST \
  "$KEYCLOAK_URL/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" \
  -d "username=$ADMIN_USER" \
  -d "password=$ADMIN_PASSWORD")

TOKEN=$(echo "$TOKEN_RESPONSE" | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "❌ Failed to authenticate"
  echo "$TOKEN_RESPONSE"
  exit 1
fi

echo "   ✅ Authenticated"
echo ""

# Get current realm config
echo "📥 Fetching current realm configuration..."
REALM_CONFIG=$(curl -s -X GET \
  "$KEYCLOAK_URL/admin/realms/$REALM" \
  -H "Authorization: Bearer $TOKEN")

if [ -z "$REALM_CONFIG" ]; then
  echo "❌ Failed to fetch realm config"
  exit 1
fi

echo "   ✅ Config retrieved"
echo ""

# Update theme in config
echo "🎨 Setting login theme to '$THEME'..."
UPDATED_CONFIG=$(echo "$REALM_CONFIG" | sed "s/\"loginTheme\":\s*\"[^\"]*\"/\"loginTheme\":\"$THEME\"/")

# Apply update
HTTP_CODE=$(curl -s -w "%{http_code}" -o /dev/null -X PUT \
  "$KEYCLOAK_URL/admin/realms/$REALM" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$UPDATED_CONFIG")

if [ "$HTTP_CODE" = "204" ]; then
  echo "   ✅ Theme applied successfully!"
  echo ""
  echo "🎉 Done! The Ushadow theme is now active."
  echo "   Visit: $KEYCLOAK_URL/realms/$REALM/protocol/openid-connect/auth"
  echo ""
else
  echo "   ❌ Failed to apply theme (HTTP $HTTP_CODE)"
  exit 1
fi
