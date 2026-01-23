#!/bin/bash
# Build and push a multi-arch Docker image to ghcr.io/ushadow-io
#
# Usage:
#   ./scripts/build-and-push.sh <context-path> [tag] [image-name]
#
# Examples:
#   ./scripts/build-and-push.sh ushadow/backend
#   ./scripts/build-and-push.sh ushadow/frontend latest
#   ./scripts/build-and-push.sh services/chronicle v1.0.0 chronicle
#   ./scripts/build-and-push.sh . latest my-app  # current dir
#
# The script will:
#   - Look for Dockerfile in the context path
#   - Default image name to the last component of the path
#   - Push to ghcr.io/ushadow-io/<image-name>:<tag>
#
# Prerequisites:
#   - Docker with buildx
#   - Logged into ghcr.io: echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin

set -e

CONTEXT="${1:-.}"
TAG="${2:-latest}"
REGISTRY="ghcr.io/ushadow-io"
PLATFORMS="linux/amd64,linux/arm64"
BUILDER_NAME="ushadow-builder"

# Validate context exists
if [[ ! -d "$CONTEXT" ]]; then
    echo "Error: Context directory not found: $CONTEXT"
    echo ""
    echo "Usage: $0 <context-path> [tag] [image-name]"
    echo ""
    echo "Examples:"
    echo "  $0 ushadow/backend"
    echo "  $0 ushadow/frontend latest"
    echo "  $0 services/chronicle v1.0.0 chronicle"
    exit 1
fi

# Find Dockerfile
DOCKERFILE="${CONTEXT}/Dockerfile"
if [[ ! -f "$DOCKERFILE" ]]; then
    echo "Error: Dockerfile not found at: $DOCKERFILE"
    exit 1
fi

# Determine image name (3rd arg, or derive from context path)
if [[ -n "$3" ]]; then
    IMAGE_NAME="$3"
else
    # Use last path component as image name
    # e.g., "ushadow/backend" -> "backend", "services/chronicle" -> "chronicle"
    IMAGE_NAME=$(basename "$CONTEXT")
fi

FULL_IMAGE="${REGISTRY}/${IMAGE_NAME}:${TAG}"

echo "============================================="
echo "Build & Push Multi-Arch Image"
echo "============================================="
echo "Context:    ${CONTEXT}"
echo "Dockerfile: ${DOCKERFILE}"
echo "Image:      ${FULL_IMAGE}"
echo "Platforms:  ${PLATFORMS}"
echo ""

# Ensure buildx builder exists and is ready
if ! docker buildx inspect "$BUILDER_NAME" &>/dev/null; then
    echo "Creating buildx builder: ${BUILDER_NAME}"
    docker buildx create --name "$BUILDER_NAME" --driver docker-container --bootstrap
fi

# Use the builder
docker buildx use "$BUILDER_NAME"

# Build and push
echo "Building for ${PLATFORMS}..."
echo ""
docker buildx build \
    --platform "$PLATFORMS" \
    --tag "$FULL_IMAGE" \
    --file "$DOCKERFILE" \
    --push \
    "$CONTEXT"

echo ""
echo "============================================="
echo "Successfully pushed: ${FULL_IMAGE}"
echo "============================================="
