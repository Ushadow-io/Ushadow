#!/usr/bin/env bash
# seed-pvcs.sh — copy local directories into Kubernetes PVCs.
#
# Used by Skaffold as a post-deploy hook and can also be run manually:
#   ./k8s/scripts/seed-pvcs.sh [namespace] [kubeconfig]
#
# Seeding rules:
#   - Only seeds if the PVC is missing a specific sentinel file
#   - On check failure (PVC busy / pod error), SKIPS seeding (safe default)
#   - Never overwrites user-data files: config.overrides.yaml, SECRETS/, instance-overrides.yaml
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
#
# Checks for a sentinel file (config.defaults.yaml or compose/) to decide
# whether the PVC is already seeded. Defaults to SKIP if the check fails
# (e.g. PVC busy with ReadWriteOnce storage — better to skip than overwrite).
#
# Never overwrites user-data files even when seeding fresh:
#   config.overrides.yaml, SECRETS/, instance-overrides.yaml
#
seed_pvc() {
  local pvc_name="$1"
  local source_dir="$2"
  local sentinel_file="${3:-}"   # relative path inside PVC to check for (e.g. "config.defaults.yaml")

  if [[ ! -d "$source_dir" ]]; then
    warn "Source dir $source_dir does not exist, skipping $pvc_name"
    return 0
  fi

  # Check for the sentinel file inside the PVC
  local check_pod="check-${pvc_name:0:16}-$(head -c4 /dev/urandom | xxd -p)"
  local sentinel_check_cmd="ls /data/${sentinel_file} > /dev/null 2>&1 && echo FOUND || echo MISSING"

  log "Checking PVC $pvc_name for sentinel: ${sentinel_file:-<any file>}..."

  local check_result="SKIP"  # Safe default: skip if we can't determine state
  if $KUBECTL run "$check_pod" \
    --image=busybox:1.36 \
    --restart=Never \
    --overrides="{\"spec\":{\"volumes\":[{\"name\":\"pvc\",\"persistentVolumeClaim\":{\"claimName\":\"$pvc_name\"}}],\"containers\":[{\"name\":\"check\",\"image\":\"busybox:1.36\",\"command\":[\"sh\",\"-c\",\"${sentinel_check_cmd}\"],\"volumeMounts\":[{\"name\":\"pvc\",\"mountPath\":\"/data\"}]}]}}" \
    --wait --timeout=60s 2>/dev/null; then
    check_result=$($KUBECTL logs "$check_pod" 2>/dev/null | tr -d '[:space:]') || check_result="SKIP"
  else
    warn "Check pod failed to run for $pvc_name — skipping seed (safe default)"
  fi
  $KUBECTL delete pod "$check_pod" --ignore-not-found --wait=false 2>/dev/null || true

  if [[ "$check_result" == "FOUND" ]]; then
    log "PVC $pvc_name already seeded (sentinel found), skipping"
    return 0
  elif [[ "$check_result" != "MISSING" ]]; then
    # SKIP or unexpected output — don't risk overwriting user data
    warn "PVC $pvc_name check inconclusive (result='$check_result'), skipping seed"
    return 0
  fi

  log "Seeding PVC $pvc_name from $source_dir ..."

  # Create a pod that mounts the PVC and sleeps so we can cp into it
  local pod_name="seed-${pvc_name:0:18}-$(head -c4 /dev/urandom | xxd -p)"
  $KUBECTL run "$pod_name" \
    --image=busybox:1.36 \
    --restart=Never \
    --overrides="{\"spec\":{\"volumes\":[{\"name\":\"pvc\",\"persistentVolumeClaim\":{\"claimName\":\"$pvc_name\"}}],\"containers\":[{\"name\":\"seeder\",\"image\":\"busybox:1.36\",\"command\":[\"sh\",\"-c\",\"sleep 300\"],\"volumeMounts\":[{\"name\":\"pvc\",\"mountPath\":\"/seed-data\"}]}]}}"

  log "Waiting for seeder pod $pod_name to be Running..."
  $KUBECTL wait pod "$pod_name" --for=condition=Ready --timeout=120s

  log "Copying files from $source_dir into PVC $pvc_name (preserving user-data files)..."

  # Copy all files EXCEPT user-data files that should never be overwritten.
  # We use a temporary staging approach: copy everything then delete protected files.
  # Protected files: config.overrides.yaml, instance-overrides.yaml, SECRETS/
  $KUBECTL cp "$source_dir/." "$pod_name:/seed-data/"

  # Remove any user-data files we just copied — they should only exist if the user created them.
  # This prevents factory-default versions from polluting the PVC.
  $KUBECTL exec "$pod_name" -- sh -c "
    rm -f /seed-data/config.overrides.yaml
    rm -f /seed-data/instance-overrides.yaml
    rm -f /seed-data/secrets.yml
    rm -rf /seed-data/SECRETS
  " 2>/dev/null || true

  # Clean up
  $KUBECTL delete pod "$pod_name" --grace-period=0 --force 2>/dev/null || true

  log "PVC $pvc_name seeded successfully"
}

# ─── main ───────────────────────────────────────────────────────────────────

log "Seeding PVCs in namespace: $NAMESPACE"
log "Repository root: $REPO_ROOT"

# Apply PVC manifests first (idempotent - kubectl apply is a no-op if they exist).
# PVCs are NOT in kustomization.yaml to prevent Skaffold from deleting them on teardown
# (skaffold dev runs `skaffold delete` on Ctrl+C, which would wipe stored overrides/secrets).
log "Ensuring PVCs exist..."
$KUBECTL apply -f "$REPO_ROOT/k8s/backend-pvc.yaml"
$KUBECTL apply -f "$REPO_ROOT/k8s/backend-data-pvc.yaml"

# Seed the shared config PVC — sentinel: config.defaults.yaml (always present after seeding)
seed_pvc "ushadow-config" "$REPO_ROOT/config" "config.defaults.yaml"

# Seed the shared compose PVC — sentinel: the directory itself having content
seed_pvc "ushadow-compose" "$REPO_ROOT/compose" "docker-compose.yml"

log "PVC seeding complete"
