#!/bin/bash
set -e

# Build and push ushadow-manager to GHCR
#
# Usage:
#   ./build-and-push.sh [version]
#
# Example:
#   ./build-and-push.sh 0.3.0

VERSION="${1}"
IMAGE_NAME="ghcr.io/ushadow-io/ushadow-manager"

if [ -z "$VERSION" ]; then
    # Extract version from manager.py
    VERSION=$(grep 'MANAGER_VERSION = ' manager.py | sed 's/.*"\(.*\)".*/\1/')
    echo "Using version from manager.py: $VERSION"
fi

echo "🏗️  Building multi-platform ushadow-manager:$VERSION..."
echo "   Platforms: linux/amd64, linux/arm64"
echo "   (Windows hosts run Linux containers via Docker Desktop)"
echo ""

# Create/use buildx builder
docker buildx create --name ushadow-builder --use 2>/dev/null || docker buildx use ushadow-builder

# Build and push for multiple platforms
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t "$IMAGE_NAME:$VERSION" \
  -t "$IMAGE_NAME:latest" \
  --push \
  .

echo ""
echo "📤 Pushed to GHCR with tags: $VERSION, latest"

echo ""
echo "✅ Successfully published ushadow-manager:$VERSION"
echo ""
echo "🔄 To upgrade running managers:"
echo "   - UI: Settings → Cluster → Upgrade All"
echo "   - CLI: ush unodes upgrade-all $VERSION"
