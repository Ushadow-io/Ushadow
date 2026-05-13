# justfile
import 'scripts/just/casdoor.just'
import 'scripts/just/k8s.just'

# Config folder management

# Push local config/ to k8s PVC
config-push:
    #!/bin/bash
    set -e
    NAMESPACE="${NAMESPACE:-ushadow}"
    CONFIG_DIR="$(pwd)/config"

    if [ ! -d "$CONFIG_DIR" ]; then
        echo "❌ Error: config/ folder not found"
        exit 1
    fi

    echo "🔄 Getting backend pod..."
    POD=$(kubectl get pods -n "$NAMESPACE" -l io.kompose.service=backend -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")

    if [ -z "$POD" ]; then
        echo "❌ Error: Backend pod not found in namespace '$NAMESPACE'"
        echo "   Is ushadow deployed? Try: just k8s-deploy"
        exit 1
    fi

    echo "📤 Syncing local config/ → $POD:/config"
    kubectl cp "$CONFIG_DIR" "$NAMESPACE/$POD:/config" -c ushadow-backend
    echo "✅ Config pushed"

# Pull config from k8s PVC to local folder
config-pull:
    #!/bin/bash
    set -e
    NAMESPACE="${NAMESPACE:-ushadow}"
    CONFIG_DIR="$(pwd)/config"

    echo "🔄 Getting backend pod..."
    POD=$(kubectl get pods -n "$NAMESPACE" -l io.kompose.service=backend -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")

    if [ -z "$POD" ]; then
        echo "❌ Error: Backend pod not found in namespace '$NAMESPACE'"
        exit 1
    fi

    echo "📥 Syncing $POD:/config → local config/"
    kubectl cp "$NAMESPACE/$POD:/config" "$CONFIG_DIR" -c ushadow-backend
    echo "✅ Config pulled"

# Deploy k8s and sync config
k8s-deploy:
    #!/bin/bash
    set -e
    echo "📦 Deploying k8s resources..."
    kubectl apply -k k8s/

    NAMESPACE="${NAMESPACE:-ushadow}"
    echo "⏳ Waiting for backend pod..."
    kubectl rollout status deployment/backend -n "$NAMESPACE" --timeout=2m

    echo "🔄 Syncing config..."
    just config-push
    echo "✅ Deployment complete"

