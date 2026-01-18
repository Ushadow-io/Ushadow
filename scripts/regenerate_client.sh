#!/bin/bash
# Regenerate ushadow Python client from OpenAPI spec

set -e

echo "🔄 Regenerating ushadow Python client..."

# Check if backend is running
if ! curl -s http://localhost:8000/health > /dev/null 2>&1; then
    echo "⚠️  Backend not running. Please start it first:"
    echo "   cd ushadow && make up"
    exit 1
fi

# Generate OpenAPI spec
echo "📥 Downloading OpenAPI spec..."
python3 scripts/generate_openapi_spec.py

# Check if openapi-python-client is installed
if ! command -v openapi-python-client &> /dev/null; then
    echo "📦 Installing openapi-python-client..."
    pip install openapi-python-client
fi

# Generate client
echo "🏗️  Generating Python client..."
openapi-python-client generate \
    --path openapi.json \
    --output-path clients/python \
    --overwrite

echo "✅ Client regenerated successfully!"
echo ""
echo "📖 Usage:"
echo "   ./scripts/ush services list"
echo "   ./scripts/ush -v services start chronicle"
echo ""
echo "📚 See docs/CLI-TOOL-GUIDE.md for more information"
