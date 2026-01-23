#!/bin/bash
# Deploy ushadow itself to Kubernetes
#
# This script uses the ushadow API to deploy ushadow to K8s.
# You need a running local ushadow instance to bootstrap the deployment.

set -e

BACKEND_URL="${BACKEND_URL:-http://localhost:8000}"
CLUSTER_ID="${CLUSTER_ID:-}"
NAMESPACE="${NAMESPACE:-ushadow}"

echo "============================================="
echo "Ushadow Self-Deployment to Kubernetes"
echo "============================================="
echo ""

# Check if backend is running
if ! curl -sf "$BACKEND_URL/health" > /dev/null; then
    echo "❌ Error: Ushadow backend not running at $BACKEND_URL"
    echo ""
    echo "Start your local ushadow first:"
    echo "  cd ushadow/backend && uv run python src/main.py"
    echo ""
    exit 1
fi

echo "✅ Ushadow backend is running at $BACKEND_URL"
echo ""

# Get cluster ID if not provided
if [ -z "$CLUSTER_ID" ]; then
    echo "Available Kubernetes clusters:"
    CLUSTERS=$(curl -sf "$BACKEND_URL/api/kubernetes/clusters" | jq -r '.[] | "\(.cluster_id) - \(.name) (\(.server))"')

    if [ -z "$CLUSTERS" ]; then
        echo "❌ No Kubernetes clusters configured."
        echo ""
        echo "Add a cluster first via the UI or API:"
        echo "  POST $BACKEND_URL/api/kubernetes/clusters"
        exit 1
    fi

    echo "$CLUSTERS"
    echo ""
    read -p "Enter cluster ID: " CLUSTER_ID
fi

echo ""
echo "Deploying ushadow to cluster: $CLUSTER_ID"
echo "Namespace: $NAMESPACE"
echo ""

# Prepare the deployment request
# This uses the ushadow API to deploy the ushadow-compose.yaml service definition
DEPLOY_REQUEST=$(cat <<EOF
{
  "template_id": "ushadow-compose:ushadow-backend",
  "name": "ushadow-backend-k8s",
  "deployment_target": "k8s://${CLUSTER_ID}/${NAMESPACE}",
  "config": {
    "REDIS_URL": "redis://redis.root.svc.cluster.local:6379/0",
    "MONGODB_URI": "mongodb://mongodb.root.svc.cluster.local:27017/ushadow",
    "MONGODB_DATABASE": "ushadow",
    "AUTH_SECRET_KEY": "${AUTH_SECRET_KEY:-$(openssl rand -hex 32)}",
    "CORS_ORIGINS": "http://ushadow-frontend.${NAMESPACE}.svc.cluster.local"
  }
}
EOF
)

echo "Creating deployment..."
RESPONSE=$(curl -sf -X POST \
    -H "Content-Type: application/json" \
    -d "$DEPLOY_REQUEST" \
    "$BACKEND_URL/api/instances")

if [ $? -eq 0 ]; then
    echo "✅ Deployment created successfully!"
    echo ""
    echo "$RESPONSE" | jq '.'
    echo ""
    echo "Check deployment status:"
    echo "  kubectl get pods -n $NAMESPACE -l app.kubernetes.io/name=ushadow-backend"
    echo ""
    echo "View logs:"
    echo "  kubectl logs -n $NAMESPACE -l app.kubernetes.io/name=ushadow-backend -f"
    echo ""
    echo "Access the service:"
    echo "  kubectl port-forward -n $NAMESPACE svc/ushadow-backend 8000:8000"
else
    echo "❌ Deployment failed"
    echo "$RESPONSE"
    exit 1
fi
