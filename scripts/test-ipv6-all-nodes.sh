#!/bin/bash
# Test IPv6 connectivity across all Kubernetes nodes
# Creates test pods on each node and runs diagnostics

set -e

NODES=("ra" "babel" "anubis")
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=========================================="
echo "IPv6 Multi-Node Diagnostic Test"
echo "=========================================="
echo ""

# Create test pods on each node
echo "Creating test pods on each node..."
for node in "${NODES[@]}"; do
    kubectl run ipv6-test-${node} \
        --image=nicolaka/netshoot \
        --overrides="{
          \"spec\": {
            \"nodeSelector\": {
              \"kubernetes.io/hostname\": \"${node}\"
            }
          }
        }" \
        --command -- sh -c "sleep 300" 2>/dev/null || echo "Pod ipv6-test-${node} already exists"
done

echo "Waiting for pods to be ready..."
kubectl wait --for=condition=ready pod -l run=ipv6-test-ra --timeout=30s 2>/dev/null || true
kubectl wait --for=condition=ready pod -l run=ipv6-test-babel --timeout=30s 2>/dev/null || true
kubectl wait --for=condition=ready pod -l run=ipv6-test-anubis --timeout=30s 2>/dev/null || true

echo ""
echo "Running diagnostics on each node..."
echo ""

# Run diagnostic on each pod
for node in "${NODES[@]}"; do
    echo ""
    echo "=========================================="
    echo "Testing on node: $node"
    echo "=========================================="

    kubectl exec ipv6-test-${node} -- sh < "${SCRIPT_DIR}/diagnose-ipv6.sh" 2>&1 || echo "Failed to run on ${node}"

    echo ""
done

echo ""
echo "=========================================="
echo "Cleanup"
echo "=========================================="
read -p "Delete test pods? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    for node in "${NODES[@]}"; do
        kubectl delete pod ipv6-test-${node} --force --grace-period=0 2>/dev/null || true
    done
    echo "Test pods deleted"
fi
