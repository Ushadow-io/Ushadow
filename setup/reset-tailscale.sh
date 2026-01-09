#!/bin/bash
# Reset Tailscale container and state
# Useful for troubleshooting authentication issues or starting fresh

set -e

echo "🧹 Resetting Tailscale..."
echo ""

# Stop and remove container
if docker ps -a --format '{{.Names}}' | grep -q "^ushadow-tailscale$"; then
    echo "Stopping and removing Tailscale container..."
    docker stop ushadow-tailscale 2>/dev/null || true
    docker rm ushadow-tailscale 2>/dev/null || true
    echo "✓ Container removed"
else
    echo "ℹ️  No Tailscale container found"
fi

echo ""

# Remove state volume (clears authentication state)
if docker volume ls --format '{{.Name}}' | grep -q "^tailscale_state$"; then
    echo "Removing Tailscale state volume..."
    docker volume rm tailscale_state 2>/dev/null || true
    echo "✓ State volume removed"
else
    echo "ℹ️  No state volume found"
fi

echo ""

# Remove certificates
if [ -d "config/SECRETS/certs" ]; then
    echo "Removing Tailscale certificates..."
    rm -f config/SECRETS/certs/*.ts.net.crt 2>/dev/null || true
    rm -f config/SECRETS/certs/*.ts.net.key 2>/dev/null || true
    echo "✓ Certificates removed"
fi

# Remove Tailscale configuration
if [ -f "config/tailscale.yaml" ]; then
    echo "Removing Tailscale configuration..."
    rm -f config/tailscale.yaml
    echo "✓ Configuration removed"
fi

echo ""
echo "✅ Tailscale reset complete!"
echo ""
echo "You can now run the Tailscale setup wizard from scratch."
echo "Visit: http://localhost:\${WEBUI_PORT:-3500}/wizard/tailscale"
echo ""
