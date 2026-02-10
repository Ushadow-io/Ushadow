#!/bin/bash
set -e

# Create Public UNode Virtual Environment
#
# Creates a virtual "public" worker unode on the same physical machine.
# This unode has its own Tailscale instance with Funnel enabled.
#
# Usage:
#   ./scripts/create-public-unode.sh [env-name]
#
# Example:
#   ./scripts/create-public-unode.sh orange

ENV_NAME="${1:-orange}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "🚀 Creating public unode virtual environment for: $ENV_NAME"
echo ""

# Check if leader is running
if ! docker ps | grep -q "ushadow-${ENV_NAME}-backend"; then
    echo "❌ Error: Leader environment '$ENV_NAME' is not running"
    echo "   Start it first: docker compose up -d"
    exit 1
fi

# Step 1: Create join token
echo "📝 Step 1: Creating join token..."
LEADER_URL="http://localhost:8000"  # Assuming leader on localhost
TOKEN_RESPONSE=$(curl -s -X POST "$LEADER_URL/api/unodes/join-tokens" \
    -H "Content-Type: application/json" \
    -d '{
        "role": "worker",
        "max_uses": 1,
        "expires_in_hours": 24
    }' 2>/dev/null || echo "")

if [ -z "$TOKEN_RESPONSE" ]; then
    echo "❌ Error: Failed to create join token"
    echo "   Make sure the leader API is accessible at $LEADER_URL"
    exit 1
fi

JOIN_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.token' 2>/dev/null || echo "")
if [ -z "$JOIN_TOKEN" ] || [ "$JOIN_TOKEN" = "null" ]; then
    echo "❌ Error: Failed to extract join token from response"
    echo "   Response: $TOKEN_RESPONSE"
    exit 1
fi

echo "✅ Join token created: ${JOIN_TOKEN:0:20}..."
echo ""

# Step 2: Check if Tailscale auth key is set
echo "📝 Step 2: Checking Tailscale auth key..."
TAILSCALE_AUTH_KEY="${TAILSCALE_PUBLIC_AUTH_KEY}"

if [ -z "$TAILSCALE_AUTH_KEY" ]; then
    echo "⚠️  TAILSCALE_PUBLIC_AUTH_KEY not set in environment"
    echo ""
    echo "To create a Tailscale auth key:"
    echo "1. Go to https://login.tailscale.com/admin/settings/keys"
    echo "2. Generate a new auth key with tags: dmz, public"
    echo "3. Export it: export TAILSCALE_PUBLIC_AUTH_KEY='tskey-auth-xxx'"
    echo ""
    read -p "Enter Tailscale auth key: " TAILSCALE_AUTH_KEY

    if [ -z "$TAILSCALE_AUTH_KEY" ]; then
        echo "❌ Error: Auth key is required"
        exit 1
    fi
fi

echo "✅ Tailscale auth key configured"
echo ""

# Step 3: Create .env file for public unode
echo "📝 Step 3: Creating .env.public-unode..."
cat > "$PROJECT_ROOT/.env.public-unode" <<EOF
# Public UNode Environment Configuration
# Generated: $(date)

ENV_NAME=$ENV_NAME
COMPOSE_PROJECT_NAME=ushadow-$ENV_NAME

# Public UNode Identification
PUBLIC_UNODE_HOSTNAME=ushadow-${ENV_NAME}-public
TAILSCALE_PUBLIC_HOSTNAME=ushadow-${ENV_NAME}-public

# Join Token (for registration)
PUBLIC_UNODE_JOIN_TOKEN=$JOIN_TOKEN

# Tailscale Configuration
TAILSCALE_PUBLIC_AUTH_KEY=$TAILSCALE_AUTH_KEY

# Leader URL (for manager to connect)
LEADER_URL=http://ushadow-${ENV_NAME}-backend:8000

# Optional: MongoDB (leave commented to use main MongoDB over Tailnet)
# MONGODB_URL=mongodb://mongodb-public:27017
EOF

echo "✅ Created .env.public-unode"
echo ""

# Step 4: Start public unode stack
echo "📝 Step 4: Starting public unode services..."
docker compose \
    --env-file "$PROJECT_ROOT/.env.public-unode" \
    -f "$PROJECT_ROOT/compose/public-unode-compose.yaml" \
    up -d

echo "✅ Public unode services started"
echo ""

# Step 5: Wait for Tailscale to connect
echo "📝 Step 5: Waiting for Tailscale connection..."
for i in {1..30}; do
    if docker exec ushadow-${ENV_NAME}-public-tailscale tailscale status &>/dev/null; then
        echo "✅ Tailscale connected"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "❌ Error: Tailscale failed to connect after 30 seconds"
        echo "   Check logs: docker logs ushadow-${ENV_NAME}-public-tailscale"
        exit 1
    fi
    sleep 1
done
echo ""

# Step 6: Enable Tailscale Funnel
echo "📝 Step 6: Enabling Tailscale Funnel..."
docker exec ushadow-${ENV_NAME}-public-tailscale tailscale funnel --bg 443

# Get public URL
PUBLIC_URL=$(docker exec ushadow-${ENV_NAME}-public-tailscale tailscale funnel status 2>/dev/null | grep -o 'https://[^ ]*' | head -1)

if [ -n "$PUBLIC_URL" ]; then
    echo "✅ Funnel enabled: $PUBLIC_URL"
else
    echo "⚠️  Funnel enabled but couldn't detect public URL"
    echo "   Run: docker exec ushadow-${ENV_NAME}-public-tailscale tailscale funnel status"
fi
echo ""

# Step 7: Wait for unode registration
echo "📝 Step 7: Waiting for unode registration..."
for i in {1..30}; do
    UNODES=$(curl -s "$LEADER_URL/api/unodes" 2>/dev/null || echo "[]")
    if echo "$UNODES" | jq -e ".unodes[] | select(.hostname==\"ushadow-${ENV_NAME}-public\")" &>/dev/null; then
        echo "✅ UNode registered successfully"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "⚠️  UNode not yet registered (this may take a few minutes)"
        echo "   Check manager logs: docker logs ushadow-${ENV_NAME}-public-manager"
    fi
    sleep 2
done
echo ""

# Step 8: Verify labels
echo "📝 Step 8: Verifying unode labels..."
UNODE_DATA=$(curl -s "$LEADER_URL/api/unodes" 2>/dev/null | jq ".unodes[] | select(.hostname==\"ushadow-${ENV_NAME}-public\")")
if [ -n "$UNODE_DATA" ]; then
    LABELS=$(echo "$UNODE_DATA" | jq '.labels')
    echo "Labels: $LABELS"

    if echo "$LABELS" | jq -e '.zone == "public"' &>/dev/null; then
        echo "✅ Labels configured correctly"
    else
        echo "⚠️  Labels may need manual update"
        echo "   Expected: {\"zone\": \"public\", \"funnel\": \"enabled\"}"
    fi
else
    echo "⚠️  Could not verify labels (unode may still be registering)"
fi
echo ""

# Summary
echo "╔════════════════════════════════════════════════════════════╗"
echo "║  Public UNode Created Successfully!                        ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "📊 Summary:"
echo "   Environment:    $ENV_NAME"
echo "   UNode Name:     ushadow-${ENV_NAME}-public"
echo "   Public URL:     ${PUBLIC_URL:-<pending>}"
echo "   Status:         Running"
echo ""
echo "📝 Next Steps:"
echo "   1. Verify unode status:"
echo "      curl http://localhost:8000/api/unodes"
echo ""
echo "   2. Deploy share-dmz services to this unode"
echo ""
echo "   3. Configure Funnel routes (if not auto-configured):"
echo "      docker exec ushadow-${ENV_NAME}-public-tailscale \\"
echo "        tailscale serve --bg --set-path / http://share-dmz-frontend:5173"
echo ""
echo "   4. View logs:"
echo "      docker logs ushadow-${ENV_NAME}-public-manager"
echo "      docker logs ushadow-${ENV_NAME}-public-tailscale"
echo ""
echo "🔧 Management:"
echo "   Start:  docker compose --env-file .env.public-unode -f compose/public-unode-compose.yaml up -d"
echo "   Stop:   docker compose --env-file .env.public-unode -f compose/public-unode-compose.yaml down"
echo "   Logs:   docker compose --env-file .env.public-unode -f compose/public-unode-compose.yaml logs -f"
echo ""
