#!/bin/bash
# Refresh OpenAPI spec for dynamic ush CLI
#
# The ush CLI auto-discovers commands from openapi.json at runtime.
# This script simply downloads a fresh copy of the spec.
#
# Usage:
#   ./scripts/regenerate_client.sh
#
# The CLI will immediately pick up any new endpoints.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "🔄 Refreshing OpenAPI spec for ush CLI..."

# Check if backend is running
if ! curl -s http://localhost:8000/health > /dev/null 2>&1; then
    # Try reading BACKEND_PORT from .env
    if [ -f "$PROJECT_ROOT/.env" ]; then
        BACKEND_PORT=$(grep "^BACKEND_PORT=" "$PROJECT_ROOT/.env" | cut -d'=' -f2)
    fi
    BACKEND_PORT=${BACKEND_PORT:-8000}

    if ! curl -s "http://localhost:$BACKEND_PORT/health" > /dev/null 2>&1; then
        echo "⚠️  Backend not running. Please start it first:"
        echo "   make up"
        exit 1
    fi
fi

# Download fresh OpenAPI spec
echo "📥 Downloading OpenAPI spec..."
python3 "$SCRIPT_DIR/generate_openapi_spec.py" "$PROJECT_ROOT/openapi.json"

echo ""
echo "✅ OpenAPI spec refreshed!"
echo ""
echo "The ush CLI now has access to all current API endpoints."
echo ""
echo "📖 Usage:"
echo "   ./ush                    # Show all command groups"
echo "   ./ush services           # Show services commands"
echo "   ./ush services list      # List all services"
echo "   ./ush health             # Check backend health"
