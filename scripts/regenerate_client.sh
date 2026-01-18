#!/bin/bash
# Regenerate ushadow Python client from OpenAPI spec

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "🔄 Regenerating ushadow Python client..."

# Check if backend is running
if ! curl -s http://localhost:8000/health > /dev/null 2>&1; then
    echo "⚠️  Backend not running. Please start it first:"
    echo "   cd ushadow && make up"
    exit 1
fi

# Generate OpenAPI spec
echo "📥 Downloading OpenAPI spec..."
python3 "$SCRIPT_DIR/generate_openapi_spec.py"

# Check if openapi-python-client is installed
if ! command -v openapi-python-client &> /dev/null; then
    echo "📦 Installing openapi-python-client..."
    pip install openapi-python-client
fi

# Generate to temp location first
TEMP_DIR=$(mktemp -d)
echo "🏗️  Generating Python client..."
openapi-python-client generate \
    --path "$PROJECT_ROOT/openapi.json" \
    --output-path "$TEMP_DIR/generated"

# Flatten structure: move inner package to ushadow/client/
echo "📁 Flattening structure..."
rm -rf "$PROJECT_ROOT/ushadow/client/api" "$PROJECT_ROOT/ushadow/client/models"
rm -f "$PROJECT_ROOT/ushadow/client/client.py" "$PROJECT_ROOT/ushadow/client/errors.py" \
      "$PROJECT_ROOT/ushadow/client/types.py" "$PROJECT_ROOT/ushadow/client/py.typed"

# Find the generated package name and move contents
GENERATED_PKG=$(ls "$TEMP_DIR/generated" | grep -v "^\." | grep -v "pyproject" | grep -v "README" | head -1)
cp -r "$TEMP_DIR/generated/$GENERATED_PKG/"* "$PROJECT_ROOT/ushadow/client/"

# Keep our custom __init__.py and auth.py
cat > "$PROJECT_ROOT/ushadow/client/__init__.py" << 'EOFINIT'
"""
ushadow API Client (Auto-Generated)

Usage:
    from ushadow.client import Client, AuthenticatedClient
    from ushadow.client.auth import UshadowClient
    from ushadow.client.api.default import list_services, start_service
    from ushadow.client.models import Service

Regenerate with:
    ./scripts/regenerate_client.sh
"""

from .client import AuthenticatedClient, Client
from .errors import UnexpectedStatus

__all__ = (
    "AuthenticatedClient",
    "Client",
    "UnexpectedStatus",
)
EOFINIT

# Cleanup
rm -rf "$TEMP_DIR"

echo "✅ Client regenerated successfully!"
echo ""
echo "📁 Structure:"
echo "   ushadow/client/"
echo "   ├── __init__.py"
echo "   ├── auth.py        (your custom wrapper)"
echo "   ├── client.py      (auto-generated)"
echo "   ├── api/default/   (auto-generated endpoints)"
echo "   └── models/        (auto-generated models)"
echo ""
echo "📖 Usage:"
echo "   ./scripts/ush services list"
echo "   ./scripts/ush -v services start chronicle"
