#!/bin/bash
# Build ushadow Docker images from source
# Optionally push to container registry

set -e

REGISTRY="${REGISTRY:-ghcr.io/ushadow-io}"
TAG="${TAG:-latest}"
PUSH="${PUSH:-false}"
PLATFORMS="${PLATFORMS:-linux/amd64,linux/arm64}"

echo "============================================="
echo "Build Ushadow Docker Images (Multi-arch)"
echo "============================================="
echo ""
echo "Registry: $REGISTRY"
echo "Tag: $TAG"
echo "Platforms: $PLATFORMS"
echo "Push to registry: $PUSH"
echo ""

# Build backend (multi-arch)
echo "Building backend image for $PLATFORMS..."
if [ "$PUSH" = "true" ]; then
    docker buildx build --platform "$PLATFORMS" \
        -t "${REGISTRY}/ushadow/backend:${TAG}" \
        -f ushadow/backend/Dockerfile \
        --push \
        ushadow/backend
else
    docker buildx build --platform "$PLATFORMS" \
        -t "${REGISTRY}/ushadow/backend:${TAG}" \
        -f ushadow/backend/Dockerfile \
        --load \
        ushadow/backend
fi

echo "✅ Backend image built: ${REGISTRY}/ushadow/backend:${TAG}"
echo ""

# Build frontend (multi-arch)
echo "Building frontend image for $PLATFORMS..."
if [ "$PUSH" = "true" ]; then
    docker buildx build --platform "$PLATFORMS" \
        -t "${REGISTRY}/ushadow/frontend:${TAG}" \
        -f ushadow/frontend/Dockerfile \
        --push \
        ushadow/frontend
else
    docker buildx build --platform "$PLATFORMS" \
        -t "${REGISTRY}/ushadow/frontend:${TAG}" \
        -f ushadow/frontend/Dockerfile \
        --load \
        ushadow/frontend
fi

echo "✅ Frontend image built: ${REGISTRY}/ushadow/frontend:${TAG}"
echo ""

if [ "$PUSH" != "true" ]; then
    echo "Images built locally (not pushed to registry)"
    echo "To push, run: PUSH=true $0"
fi

echo ""
echo "============================================="
echo "Built Images"
echo "============================================="
docker images | grep -E "REPOSITORY|ushadow/(backend|frontend)"
echo ""

echo "To use these images in K8s:"
echo "1. Either push to registry: PUSH=true $0"
echo "2. Or load into kind/minikube: docker save ... | kind load ..."
echo "3. Or use local registry in your cluster"
