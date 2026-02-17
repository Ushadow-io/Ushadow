#!/bin/bash
# Build and push ushadow images to local registry (Anubis)
#
# Usage:
#   ./scripts/build-push-local.sh [backend|frontend|all]
#
# Examples:
#   ./scripts/build-push-local.sh           # Build and push both
#   ./scripts/build-push-local.sh backend   # Build and push backend only
#   ./scripts/build-push-local.sh frontend  # Build and push frontend only

set -e

SERVICE="${1:-all}"
REGISTRY="${K8S_REGISTRY:-anubis:32000}"
TAG="${TAG:-latest}"
NAMESPACE="${NAMESPACE:-ushadow}"
PLATFORM="${PLATFORM:-linux/amd64}"  # Default to amd64 for K8s clusters
NO_CACHE="${NO_CACHE:-false}"  # Set to 'true' to force rebuild without cache
PULL="${PULL:-true}"  # Set to 'false' to skip pulling latest base images

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

section() {
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# Build and push a single image
build_and_push() {
    local name="$1"
    local context="$2"
    local dockerfile="$3"
    local full_image="${REGISTRY}/${name}:${TAG}"

    if [[ ! -d "$context" ]]; then
        error "Context directory not found: ${context}"
    fi

    if [[ ! -f "$dockerfile" ]]; then
        error "Dockerfile not found: ${dockerfile}"
    fi

    section "Building ${name}"
    info "  Context:    ${context}"
    info "  Dockerfile: ${dockerfile}"
    info "  Image:      ${full_image}"
    info "  Platform:   ${PLATFORM}"
    echo ""

    # Build for specified platform (default: linux/amd64 for K8s)
    info "🔨 Building..."

    # Build with optional flags
    local build_args=()
    build_args+=(--platform "$PLATFORM")
    build_args+=(--tag "$full_image")
    build_args+=(--file "$dockerfile")

    if [[ "$PULL" == "true" ]]; then
        build_args+=(--pull)
        info "   📥 Pulling latest base images..."
    fi

    if [[ "$NO_CACHE" == "true" ]]; then
        build_args+=(--no-cache)
        warn "   ⚠️  Building without cache (may be slow)..."
    fi

    docker build "${build_args[@]}" "$context"

    info "✅ Built successfully"
    echo ""

    # Push to local registry
    info "⬆️  Pushing to ${REGISTRY}..."
    if docker push "$full_image"; then
        info "✅ Pushed to local registry"
    else
        error "Failed to push to ${REGISTRY}"
    fi
    echo ""
}

# Update K8s deployment to use new image
update_deployment() {
    local name="$1"
    local full_image="${REGISTRY}/${name}:${TAG}"

    if kubectl get deployment "$name" -n "$NAMESPACE" &>/dev/null; then
        info "🔄 Updating deployment ${name}..."
        kubectl set image deployment/"$name" -n "$NAMESPACE" "$name=$full_image"

        # Force restart for :latest tag (K8s won't pull new image otherwise)
        if [[ "$TAG" == "latest" ]]; then
            info "   🔄 Forcing rollout restart (using :latest tag)..."
            kubectl rollout restart deployment/"$name" -n "$NAMESPACE"
        fi

        info "✅ Deployment updated"
    else
        warn "⚠️  Deployment ${name} not found in namespace ${NAMESPACE}"
    fi
}

# Main script
case "$SERVICE" in
    backend)
        section "Building ushadow-backend"
        build_and_push \
            "ushadow-backend" \
            "ushadow/backend" \
            "ushadow/backend/Dockerfile"

        update_deployment "ushadow-backend"

        info "============================================="
        info "✅ Backend image pushed successfully!"
        info "   ${REGISTRY}/ushadow-backend:${TAG}"
        info "============================================="
        ;;

    frontend)
        section "Building ushadow-frontend"
        build_and_push \
            "ushadow-frontend" \
            "ushadow/frontend" \
            "ushadow/frontend/Dockerfile"

        update_deployment "ushadow-frontend"

        info "============================================="
        info "✅ Frontend image pushed successfully!"
        info "   ${REGISTRY}/ushadow-frontend:${TAG}"
        info "============================================="
        ;;

    all)
        section "Building ushadow (backend + frontend)"
        echo ""

        # Build backend
        build_and_push \
            "ushadow-backend" \
            "ushadow/backend" \
            "ushadow/backend/Dockerfile"

        # Build frontend
        build_and_push \
            "ushadow-frontend" \
            "ushadow/frontend" \
            "ushadow/frontend/Dockerfile"

        # Update deployments
        section "Updating K8s deployments"
        update_deployment "ushadow-backend"
        update_deployment "ushadow-frontend"

        info "============================================="
        info "✅ All ushadow images pushed successfully!"
        info "   ${REGISTRY}/ushadow-backend:${TAG}"
        info "   ${REGISTRY}/ushadow-frontend:${TAG}"
        info "============================================="
        ;;

    *)
        echo "Usage: $0 [backend|frontend|all]"
        echo ""
        echo "Build and push ushadow images to local registry (${REGISTRY})"
        echo ""
        echo "Options:"
        echo "  backend   - Build and push backend only"
        echo "  frontend  - Build and push frontend only"
        echo "  all       - Build and push both (default)"
        echo ""
        echo "Environment variables:"
        echo "  K8S_REGISTRY  - Registry URL (default: anubis:32000)"
        echo "  TAG           - Image tag (default: latest)"
        echo "  NAMESPACE     - K8s namespace (default: ushadow)"
        echo "  PLATFORM      - Build platform (default: linux/amd64)"
        echo "  NO_CACHE      - Force rebuild without cache (default: false)"
        echo "  PULL          - Pull latest base images (default: true)"
        echo ""
        echo "Examples:"
        echo "  $0"
        echo "  $0 backend"
        echo "  $0 frontend"
        echo "  TAG=v0.1.0 $0"
        echo "  K8S_REGISTRY=localhost:5000 $0"
        echo "  PLATFORM=linux/arm64 $0  # For ARM clusters"
        echo "  NO_CACHE=true $0  # Force clean build (when cache issues occur)"
        echo ""
        exit 1
        ;;
esac

echo ""
info "🎉 Done!"
