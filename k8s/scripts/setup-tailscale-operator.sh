#!/usr/bin/env bash
# setup-tailscale-operator.sh — Install the Tailscale Kubernetes operator and
# expose the ushadow ingress via a Tailscale-issued *.ts.net hostname.
#
# The operator installs once per cluster. After installation, annotating any
# Service with tailscale.com/expose=true gives it a MagicDNS hostname and a
# Tailscale-backed TLS cert (trusted by all devices, including mobile).
#
# Prerequisites:
#   - kubectl connected to the target cluster
#   - helm 3.x installed
#   - Tailscale OAuth client (NOT an auth key) — create one at:
#       https://login.tailscale.com/admin/settings/oauth
#     Scopes required: Core (devices read/write) + Keys (auth keys write)
#     Tag required: ensure tag:k8s-operator exists in your tailnet ACL policy
#
# Usage:
#   ./k8s/scripts/setup-tailscale-operator.sh \
#     --client-id tskey-client-xxx \
#     --client-secret tskey-secret-xxx \
#     --hostname ushadow-chakra
#
# Idempotent: safe to re-run. Upgrades the operator if already installed.
# The annotated service is left as-is if already annotated.

set -euo pipefail

# ─── defaults ────────────────────────────────────────────────────────────────

OPERATOR_NAMESPACE="tailscale-system"
INGRESS_NAMESPACE="ingress-nginx"
INGRESS_SERVICE="ingress-nginx-controller"
TS_HOSTNAME="ushadow-chakra"
CLIENT_ID=""
CLIENT_SECRET=""
KUBECONFIG_PATH=""
WAIT_TIMEOUT=120  # seconds to wait for Tailscale IP

# ─── helpers ─────────────────────────────────────────────────────────────────

log()  { echo "[ts-operator] $*"; }
warn() { echo "[ts-operator] WARNING: $*" >&2; }
err()  { echo "[ts-operator] ERROR: $*" >&2; exit 1; }

usage() {
  grep '^#' "$0" | sed 's/^# \{0,1\}//' | head -30
  exit 0
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || err "'$1' is required but not found in PATH"
}

kubectl_cmd() {
  if [[ -n "$KUBECONFIG_PATH" ]]; then
    kubectl --kubeconfig="$KUBECONFIG_PATH" "$@"
  else
    kubectl "$@"
  fi
}

# ─── arg parsing ─────────────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
  case "$1" in
    --client-id)       CLIENT_ID="$2";          shift 2 ;;
    --client-secret)   CLIENT_SECRET="$2";      shift 2 ;;
    --hostname)        TS_HOSTNAME="$2";         shift 2 ;;
    --operator-ns)     OPERATOR_NAMESPACE="$2";  shift 2 ;;
    --ingress-ns)      INGRESS_NAMESPACE="$2";   shift 2 ;;
    --ingress-svc)     INGRESS_SERVICE="$2";     shift 2 ;;
    --kubeconfig)      KUBECONFIG_PATH="$2";     shift 2 ;;
    --wait-timeout)    WAIT_TIMEOUT="$2";        shift 2 ;;
    -h|--help)         usage ;;
    *) err "Unknown argument: $1" ;;
  esac
done

[[ -n "$CLIENT_ID" ]]     || err "--client-id is required (create at https://login.tailscale.com/admin/settings/oauth)"
[[ -n "$CLIENT_SECRET" ]] || err "--client-secret is required"

# ─── preflight ───────────────────────────────────────────────────────────────

require_cmd kubectl
require_cmd helm

log "Checking cluster connectivity..."
kubectl_cmd cluster-info --request-timeout=5s >/dev/null \
  || err "Cannot reach cluster. Check your kubeconfig / VPN."

log "Target cluster: $(kubectl_cmd config current-context 2>/dev/null || echo '(unknown)')"
log "Ingress service: $INGRESS_NAMESPACE/$INGRESS_SERVICE"
log "Tailscale hostname: $TS_HOSTNAME"

# ─── step 1: Helm repo ───────────────────────────────────────────────────────

log "Adding Tailscale Helm repo..."
helm repo add tailscale https://pkgs.tailscale.com/helmcharts 2>/dev/null || true
helm repo update tailscale

# ─── step 2: Install / upgrade operator ──────────────────────────────────────

log "Installing/upgrading Tailscale operator in namespace '$OPERATOR_NAMESPACE'..."
kubectl_cmd create namespace "$OPERATOR_NAMESPACE" --dry-run=client -o yaml \
  | kubectl_cmd apply -f -

helm upgrade --install tailscale-operator tailscale/tailscale-operator \
  --namespace "$OPERATOR_NAMESPACE" \
  --set-string oauth.clientId="$CLIENT_ID" \
  --set-string oauth.clientSecret="$CLIENT_SECRET" \
  --set operatorConfig.defaultTags=tag:k8s-operator \
  --wait --timeout 120s

log "Operator installed. Waiting for it to become ready..."
kubectl_cmd rollout status deployment/operator \
  -n "$OPERATOR_NAMESPACE" --timeout=60s

# ─── step 3: Annotate ingress service ────────────────────────────────────────

log "Checking ingress service $INGRESS_NAMESPACE/$INGRESS_SERVICE..."
kubectl_cmd get service "$INGRESS_SERVICE" -n "$INGRESS_NAMESPACE" >/dev/null \
  || err "Service $INGRESS_NAMESPACE/$INGRESS_SERVICE not found. Check --ingress-ns / --ingress-svc."

# Check if already annotated
EXISTING_HOSTNAME=$(kubectl_cmd get service "$INGRESS_SERVICE" \
  -n "$INGRESS_NAMESPACE" \
  -o jsonpath='{.metadata.annotations.tailscale\.com/hostname}' 2>/dev/null || true)

if [[ "$EXISTING_HOSTNAME" == "$TS_HOSTNAME" ]]; then
  log "Service already annotated with hostname '$TS_HOSTNAME', skipping annotation."
else
  log "Annotating $INGRESS_SERVICE with Tailscale hostname '$TS_HOSTNAME'..."
  kubectl_cmd annotate service "$INGRESS_SERVICE" \
    -n "$INGRESS_NAMESPACE" \
    "tailscale.com/expose=true" \
    "tailscale.com/hostname=$TS_HOSTNAME" \
    --overwrite
fi

# ─── step 4: Wait for Tailscale IP ───────────────────────────────────────────

log "Waiting up to ${WAIT_TIMEOUT}s for Tailscale to provision the proxy..."

TS_IP=""
ELAPSED=0
INTERVAL=5
while [[ $ELAPSED -lt $WAIT_TIMEOUT ]]; do
  TS_IP=$(kubectl_cmd get service "$INGRESS_SERVICE" \
    -n "$INGRESS_NAMESPACE" \
    -o jsonpath='{.status.loadBalancer.ingress[?(@.hostname)].hostname}' 2>/dev/null || true)

  # Also check for IP (some setups return IP not hostname at first)
  if [[ -z "$TS_IP" ]]; then
    TS_IP=$(kubectl_cmd get service "$INGRESS_SERVICE" \
      -n "$INGRESS_NAMESPACE" \
      -o jsonpath='{.status.loadBalancer.ingress[*].ip}' 2>/dev/null || true)
  fi

  if [[ -n "$TS_IP" ]]; then
    break
  fi

  printf "."
  sleep $INTERVAL
  ELAPSED=$((ELAPSED + INTERVAL))
done
echo ""

# ─── step 5: Summary ─────────────────────────────────────────────────────────

FULL_HOSTNAME="${TS_HOSTNAME}.$(kubectl_cmd get secret \
  -n "$OPERATOR_NAMESPACE" \
  -l "tailscale.com/managed=true" \
  -o jsonpath='{.items[0].data.config}' 2>/dev/null \
  | base64 -d 2>/dev/null \
  | grep -o '"ServerName":"[^"]*"' \
  | head -1 \
  | sed 's/"ServerName":"//;s/"//' \
  | sed "s/^${TS_HOSTNAME}\.//" \
  || echo "spangled-kettle.ts.net")"

log ""
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log " Tailscale operator setup complete"
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log ""
if [[ -n "$TS_IP" ]]; then
  log " Tailscale proxy: $TS_IP"
fi
log " MagicDNS hostname: https://${TS_HOSTNAME}.<your-tailnet>.ts.net"
log ""
log " Next steps:"
log "   1. Check your Tailscale admin panel for the actual hostname:"
log "      https://login.tailscale.com/admin/machines"
log ""
log "   2. Update k8s/backend-deployment.yaml:"
log "        USHADOW_PUBLIC_URL: https://${TS_HOSTNAME}.<your-tailnet>.ts.net"
log "        CORS_ORIGINS:       https://${TS_HOSTNAME}.<your-tailnet>.ts.net"
log ""
log "   3. Update k8s/ingress.yaml to add the new hostname:"
log "        - host: ${TS_HOSTNAME}.<your-tailnet>.ts.net"
log ""
log "   4. Delete the old local-ca certificate (no longer needed):"
log "      kubectl delete certificate ushadow-tls -n ushadow"
log "      kubectl delete clusterissuer local-ca-issuer"
log ""
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
