#!/bin/bash
# Deploy ushadow with config folder sync
# Syncs local config/ ↔ k8s PVC for bidirectional updates

set -e

NAMESPACE="${NAMESPACE:-ushadow}"
CONFIG_DIR="$(pwd)/config"

if [ ! -d "$CONFIG_DIR" ]; then
    echo "❌ Error: config/ folder not found at $CONFIG_DIR"
    exit 1
fi

echo "========================================="
echo "Deploy Ushadow with Config Sync"
echo "========================================="
echo "Config folder: $CONFIG_DIR"
echo "Namespace: $NAMESPACE"
echo ""

# Step 1: Deploy k8s resources
echo "📦 Deploying k8s resources..."
kubectl apply -k k8s/

# Step 2: Wait for backend pod to be ready
echo "⏳ Waiting for backend pod to be ready..."
kubectl rollout status deployment/backend -n "$NAMESPACE" --timeout=2m

# Step 3: Sync local config to PVC
echo "🔄 Syncing local config/ to PVC..."
BACKEND_POD=$(kubectl get pods -n "$NAMESPACE" -l io.kompose.service=backend -o jsonpath='{.items[0].metadata.name}')

if [ -z "$BACKEND_POD" ]; then
    echo "❌ Error: Could not find backend pod"
    exit 1
fi

echo "   Pod: $BACKEND_POD"
kubectl cp "$CONFIG_DIR" "$NAMESPACE/$BACKEND_POD:/config" -c ushadow-backend || true

echo ""
echo "✅ Deployment complete!"
echo ""
echo "To pull config changes from k8s back to local:"
echo "  kubectl cp $NAMESPACE/$BACKEND_POD:/config $CONFIG_DIR -c ushadow-backend"
echo ""
echo "To watch config updates from local:"
echo "  watch kubectl cp $CONFIG_DIR $NAMESPACE/$BACKEND_POD:/config -c ushadow-backend"
