#!/bin/bash
# Build and push multi-arch Docker images to GitHub Container Registry
#
# Usage:
#   ./scripts/build-push-images.sh <service> [tag]
#
# Examples:
#   ./scripts/build-push-images.sh chronicle
#   ./scripts/build-push-images.sh chronicle v1.0.0
#   ./scripts/build-push-images.sh mycelia latest

set -e

SERVICE="${1:-}"
TAG="${2:-latest}"
REGISTRY="ghcr.io/ushadow-io"
PLATFORMS="linux/amd64,linux/arm64"
BUILDER_NAME="ushadow-builder"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

error() {
    echo -e "${RED}ERROR: $1${NC}" >&2
    exit 1
}

info() {
    echo -e "${GREEN}$1${NC}"
}

warn() {
    echo -e "${YELLOW}$1${NC}"
}

# Ensure buildx builder exists
ensure_builder() {
    if ! docker buildx inspect "$BUILDER_NAME" &>/dev/null; then
        info "Creating buildx builder: ${BUILDER_NAME}"
        docker buildx create --name "$BUILDER_NAME" --driver docker-container --bootstrap
    fi
    docker buildx use "$BUILDER_NAME"
}

# Build and push an image
build_and_push() {
    local context="$1"
    local dockerfile="$2"
    local image_name="$3"
    local full_image="${REGISTRY}/${image_name}:${TAG}"

    if [[ ! -d "$context" ]]; then
        error "Context directory not found: ${context}"
    fi

    if [[ ! -f "$dockerfile" ]]; then
        error "Dockerfile not found: ${dockerfile}"
    fi

    info "---------------------------------------------"
    info "Building ${image_name}"
    info "  Context:    ${context}"
    info "  Dockerfile: ${dockerfile}"
    info "  Image:      ${full_image}"
    info "  Platforms:  ${PLATFORMS}"
    info "---------------------------------------------"

    docker buildx build \
        --platform "$PLATFORMS" \
        --tag "$full_image" \
        --file "$dockerfile" \
        --push \
        "$context"

    info "✅ Pushed: ${full_image}"
    echo ""
}

# Main script
case "$SERVICE" in
    chronicle)
        info "============================================="
        info "Building Chronicle (tag: ${TAG})"
        info "============================================="
        ensure_builder

        # Build backend
        build_and_push \
            "chronicle/backends/advanced" \
            "chronicle/backends/advanced/Dockerfile" \
            "chronicle-backend"

        # Build workers (same Dockerfile as backend, different tag)
        build_and_push \
            "chronicle/backends/advanced" \
            "chronicle/backends/advanced/Dockerfile" \
            "chronicle-workers"

        # Build webui
        build_and_push \
            "chronicle/backends/advanced/webui" \
            "chronicle/backends/advanced/webui/Dockerfile" \
            "chronicle-webui"

        info "============================================="
        info "Chronicle images pushed successfully!"
        info "  ${REGISTRY}/chronicle-backend:${TAG}"
        info "  ${REGISTRY}/chronicle-workers:${TAG}"
        info "  ${REGISTRY}/chronicle-webui:${TAG}"
        info "============================================="
        ;;

    mycelia)
        info "============================================="
        info "Building Mycelia (tag: ${TAG})"
        info "============================================="
        ensure_builder

        # Build backend (context is mycelia root, Dockerfile is in backend/)
        build_and_push \
            "mycelia" \
            "mycelia/backend/Dockerfile" \
            "mycelia-backend"

        info "============================================="
        info "Mycelia images pushed successfully!"
        info "  ${REGISTRY}/mycelia-backend:${TAG}"
        info "============================================="
        ;;

    openmemory)
        info "============================================="
        info "Building OpenMemory (tag: ${TAG})"
        info "============================================="
        ensure_builder

        # Build server
        build_and_push \
            "openmemory/server" \
            "openmemory/server/Dockerfile" \
            "openmemory-server"

        info "============================================="
        info "OpenMemory images pushed successfully!"
        info "  ${REGISTRY}/openmemory-server:${TAG}"
        info "============================================="
        ;;

    *)
        echo "Usage: $0 <service> [tag]"
        echo ""
        echo "Available services:"
        echo "  chronicle   - Build Chronicle backend + workers + webui"
        echo "  mycelia     - Build Mycelia backend"
        echo "  openmemory  - Build OpenMemory server"
        echo ""
        echo "Examples:"
        echo "  $0 chronicle"
        echo "  $0 chronicle v1.0.0"
        echo "  $0 mycelia latest"
        echo "  $0 openmemory v2.0.0"
        echo ""
        echo "Prerequisites:"
        echo "  1. Docker with buildx support"
        echo "  2. Login to GHCR:"
        echo "     echo \$GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin"
        exit 1
        ;;
esac
