#!/bin/bash
# Bundle startup resources with the launcher at build time
# This ensures each launcher version is self-contained and won't break
# when the main repository code changes

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BUNDLE_DIR="$SCRIPT_DIR/src-tauri/bundled"

echo "Bundling resources for launcher..."
echo "  From: $REPO_ROOT"
echo "  To: $BUNDLE_DIR"

# Clean and create bundle directory
rm -rf "$BUNDLE_DIR"
mkdir -p "$BUNDLE_DIR"

# Copy setup scripts
echo "  Copying setup/ ..."
cp -r "$REPO_ROOT/setup" "$BUNDLE_DIR/"
# Remove __pycache__ and .pyc files
find "$BUNDLE_DIR/setup" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find "$BUNDLE_DIR/setup" -name "*.pyc" -delete 2>/dev/null || true

# Copy compose files
echo "  Copying compose/ ..."
mkdir -p "$BUNDLE_DIR/compose"
cp "$REPO_ROOT/compose/docker-compose.infra.yml" "$BUNDLE_DIR/compose/"

# Create version stamp
echo "  Creating version stamp..."
cat > "$BUNDLE_DIR/VERSION" << VERSION_EOF
Bundled at: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
Git commit: $(cd "$REPO_ROOT" && git rev-parse HEAD 2>/dev/null || echo "unknown")
Git branch: $(cd "$REPO_ROOT" && git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
VERSION_EOF

echo "✓ Resources bundled successfully"
echo ""
echo "Bundled files:"
find "$BUNDLE_DIR" -type f | sort
