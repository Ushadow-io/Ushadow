#!/bin/bash
# Generate Caddyfile from running ushadow environments
# Run this after spinning up new environments
#
# Usage: ./scripts/generate-caddyfile.sh [output-dir]

set -e

OUTPUT_DIR="${1:-/tmp/caddy-config}"
mkdir -p "$OUTPUT_DIR"

CADDYFILE="$OUTPUT_DIR/Caddyfile"

# Get Tailscale hostname (optional, for HTTPS)
TS_HOSTNAME=$(tailscale status --json 2>/dev/null | jq -r '.Self.DNSName' | sed 's/\.$//' || echo "")

echo "Generating Caddyfile..."
echo "Output: $CADDYFILE"

cat > "$CADDYFILE" << 'EOF'
# Auto-generated Caddyfile for ushadow environments
# Generated: $(date)
{
    auto_https off
}

:443 {
EOF

# Discover running ushadow environments
# Format: ENV_NAME:BACKEND_PORT:FRONTEND_PORT
ENVS=$(docker ps --format '{{.Names}}' | grep -E 'ushadow.*-backend$' | while read name; do
    # Extract env name (ushadow-wiz-backend -> wiz)
    env_name=$(echo "$name" | sed 's/ushadow-//' | sed 's/-backend$//')
    if [ "$env_name" = "backend" ]; then
        env_name=""  # default ushadow
    fi

    # Get backend port
    backend_port=$(docker port "$name" 8000 2>/dev/null | head -1 | cut -d: -f2)

    # Get frontend port (ushadow-wiz-webui)
    if [ -z "$env_name" ]; then
        frontend_name="ushadow-webui"
    else
        frontend_name="ushadow-${env_name}-webui"
    fi
    frontend_port=$(docker port "$frontend_name" 5173 2>/dev/null | head -1 | cut -d: -f2)

    if [ -n "$backend_port" ] && [ -n "$frontend_port" ]; then
        echo "${env_name}:${backend_port}:${frontend_port}"
    fi
done)

# Generate routes for each environment
DEFAULT_FOUND=false

while IFS=: read -r env_name backend_port frontend_port; do
    [ -z "$backend_port" ] && continue

    if [ -z "$env_name" ]; then
        # Default environment (no prefix)
        DEFAULT_FOUND=true
        cat >> "$CADDYFILE" << EOF

    # Default ushadow environment
    @default_api {
        path /api/* /auth/* /ws_pcm
    }
    handle @default_api {
        reverse_proxy host.docker.internal:${backend_port}
    }
EOF
    else
        # Named environment with path prefix
        # Use handle + uri strip_prefix to only strip the env prefix, not /api
        cat >> "$CADDYFILE" << EOF

    # ushadow-${env_name} environment
    handle /${env_name}/api/* {
        uri strip_prefix /${env_name}
        reverse_proxy host.docker.internal:${backend_port}
    }
    handle /${env_name}/auth/* {
        uri strip_prefix /${env_name}
        reverse_proxy host.docker.internal:${backend_port}
    }
    handle /${env_name}/* {
        uri strip_prefix /${env_name}
        reverse_proxy host.docker.internal:${frontend_port}
    }
EOF
    fi
done <<< "$ENVS"

# Check for other services (mem0, etc.)
if docker ps --format '{{.Names}}' | grep -q '^mem0$'; then
    MEM0_PORT=$(docker port mem0 8765 2>/dev/null | head -1 | cut -d: -f2)
    if [ -n "$MEM0_PORT" ]; then
        cat >> "$CADDYFILE" << EOF

    # mem0 service
    handle_path /mem0/* {
        reverse_proxy host.docker.internal:${MEM0_PORT}
    }
EOF
    fi
fi

# Infrastructure dashboards
cat >> "$CADDYFILE" << 'EOF'

    # Infrastructure dashboards
    handle_path /qdrant/* {
        reverse_proxy qdrant:6333
    }
EOF

# Default catch-all (frontend)
if [ "$DEFAULT_FOUND" = true ]; then
    # Get default frontend port
    DEFAULT_FRONTEND=$(docker port ushadow-webui 5173 2>/dev/null | head -1 | cut -d: -f2)
    if [ -n "$DEFAULT_FRONTEND" ]; then
        cat >> "$CADDYFILE" << EOF

    # Default catch-all (main ushadow frontend)
    handle {
        reverse_proxy host.docker.internal:${DEFAULT_FRONTEND}
    }
EOF
    fi
fi

echo "}" >> "$CADDYFILE"

echo ""
echo "Generated Caddyfile:"
echo "---"
cat "$CADDYFILE"
echo "---"
echo ""
echo "To apply:"
echo "  docker cp $CADDYFILE ushadow-caddy:/etc/caddy/Caddyfile"
echo "  docker exec ushadow-caddy caddy reload --config /etc/caddy/Caddyfile"
