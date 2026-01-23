#!/bin/bash
# Redeploy ushadow to K8s with PVC support

set -e

BACKEND_URL="${BACKEND_URL:-http://localhost:8400}"
CLUSTER_ID="003fd5798ebbea9f"
NAMESPACE="ushadow"

echo "============================================="
echo "Redeploy Ushadow to K8s"
echo "============================================="
echo ""
echo "Backend URL: $BACKEND_URL"
echo "Cluster: $CLUSTER_ID"
echo "Namespace: $NAMESPACE"
echo ""

# Delete existing instances
echo "Deleting existing ushadow instances..."
for instance_id in ushadow-compose-ushadow-backend-anubis ushadow-compose-ushadow-frontend-anubis; do
    echo "Deleting $instance_id..."
    curl -s -X DELETE "$BACKEND_URL/api/instances/$instance_id" || true
    echo ""
done

echo "Waiting 5 seconds for cleanup..."
sleep 5

# Deploy backend
echo "Deploying ushadow-backend to K8s..."
curl -s -X POST "$BACKEND_URL/api/instances" \
    -H "Content-Type: application/json" \
    -d '{
        "template_id": "ushadow-compose:ushadow-backend",
        "name": "Ushadow Backend (K8s)",
        "deployment_target": "k8s://'"$CLUSTER_ID"'/'"$NAMESPACE"'",
        "config": {}
    }' | jq '.'

echo ""
echo "Waiting 10 seconds for backend to start..."
sleep 10

# Deploy frontend
echo "Deploying ushadow-frontend to K8s..."
curl -s -X POST "$BACKEND_URL/api/instances" \
    -H "Content-Type: application/json" \
    -d '{
        "template_id": "ushadow-compose:ushadow-frontend",
        "name": "Ushadow Frontend (K8s)",
        "deployment_target": "k8s://'"$CLUSTER_ID"'/'"$NAMESPACE"'",
        "config": {}
    }' | jq '.'

echo ""
echo "============================================="
echo "Deployment complete!"
echo "============================================="
echo ""
echo "Check status with:"
echo "  kubectl get pods -n $NAMESPACE"
echo "  kubectl get pvc -n $NAMESPACE"
