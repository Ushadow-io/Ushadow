#!/usr/bin/env bash
# seed-pvcs.sh — copy local directories into Kubernetes PVCs.
#
# Used by Skaffold as a post-deploy hook and can also be run manually:
#   ./k8s/scripts/seed-pvcs.sh [namespace] [kubeconfig]
#
# Each seeding operation:
#   1. Checks if the PVC already has files (skips if so)
#   2. Creates a temporary busybox pod that mounts the PVC
#   3. Copies files via kubectl cp
#   4. Deletes the pod
#
# Usage:
#   ./k8s/scripts/seed-pvcs.sh ushadow            # uses current kubeconfig
#   ./k8s/scripts/seed-pvcs.sh ushadow ~/.kube/config

set -euo pipefail

NAMESPACE="${1:-ushadow}"
KUBECONFIG_PATH="${2:-}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

KUBECTL="kubectl"
if [[ -n "$KUBECONFIG_PATH" ]]; then
  KUBECTL="kubectl --kubeconfig=$KUBECONFIG_PATH"
fi

KUBECTL="$KUBECTL -n $NAMESPACE"

# ─── helpers ────────────────────────────────────────────────────────────────

log()  { echo "[seed-pvcs] $*"; }
warn() { echo "[seed-pvcs] WARNING: $*" >&2; }

# Seed a single PVC from a local directory.
# Skips if the PVC already has files at the mount root.
seed_pvc() {
  local pvc_name="$1"
  local source_dir="$2"
  local pod_name="seed-${pvc_name:0:18}-$(head -c4 /dev/urandom | xxd -p)"

  if [[ ! -d "$source_dir" ]]; then
    warn "Source dir $source_dir does not exist, skipping $pvc_name"
    return 0
  fi

  # Check if PVC already has content by listing its root in a temp pod
  log "Checking if PVC $pvc_name is already seeded..."
  local check_pod="check-${pvc_name:0:16}-$(head -c4 /dev/urandom | xxd -p)"
  $KUBECTL run "$check_pod" \
    --image=busybox:1.36 \
    --restart=Never \
    --overrides="{\"spec\":{\"volumes\":[{\"name\":\"pvc\",\"persistentVolumeClaim\":{\"claimName\":\"$pvc_name\"}}],\"containers\":[{\"name\":\"check\",\"image\":\"busybox:1.36\",\"command\":[\"sh\",\"-c\",\"ls /data | wc -l\"],\"volumeMounts\":[{\"name\":\"pvc\",\"mountPath\":\"/data\"}]}]}}" \
    --wait --timeout=60s 2>/dev/null || true

  local count
  count=$($KUBECTL logs "$check_pod" 2>/dev/null | tr -d '[:space:]') || count="0"
  $KUBECTL delete pod "$check_pod" --ignore-not-found --wait=false 2>/dev/null || true

  if [[ "$count" != "0" ]]; then
    log "PVC $pvc_name already has content ($count entries), skipping"
    return 0
  fi

  log "Seeding PVC $pvc_name from $source_dir ..."

  # Create a pod that mounts the PVC and sleeps so we can cp into it
  $KUBECTL run "$pod_name" \
    --image=busybox:1.36 \
    --restart=Never \
    --overrides="{\"spec\":{\"volumes\":[{\"name\":\"pvc\",\"persistentVolumeClaim\":{\"claimName\":\"$pvc_name\"}}],\"containers\":[{\"name\":\"seeder\",\"image\":\"busybox:1.36\",\"command\":[\"sh\",\"-c\",\"sleep 300\"],\"volumeMounts\":[{\"name\":\"pvc\",\"mountPath\":\"/seed-data\"}]}]}}"

  log "Waiting for seeder pod $pod_name to be Running..."
  $KUBECTL wait pod "$pod_name" --for=condition=Ready --timeout=120s

  log "Copying files from $source_dir into PVC $pvc_name ..."
  # Copy directory contents (not the directory itself)
  $KUBECTL cp "$source_dir/." "$pod_name:/seed-data/"

  # Clean up
  $KUBECTL delete pod "$pod_name" --grace-period=0 --force 2>/dev/null || true

  log "PVC $pvc_name seeded successfully"
}

# ─── main ───────────────────────────────────────────────────────────────────

log "Seeding PVCs in namespace: $NAMESPACE"
log "Repository root: $REPO_ROOT"

# Seed the shared config PVC from the local config/ directory
seed_pvc "ushadow-config" "$REPO_ROOT/config"

# Seed the shared compose PVC from the local compose/ directory
seed_pvc "ushadow-compose" "$REPO_ROOT/compose"

log "PVC seeding complete"
