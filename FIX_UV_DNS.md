# Fix for uv DNS Issues in Kubernetes

## Problem

Chronicle backend uses `uv 0.6.10` (Rust-based package manager) which fails to download packages from PyPI with error:

```
error: Failed to fetch: `https://pypi.org/simple/setuptools/`
  Caused by: dns error: failed to lookup address information: Name has no usable address
```

## Root Cause

Kubernetes adds search domains and `ndots:5` to `/etc/resolv.conf`:

```
search default.svc.cluster.local svc.cluster.local cluster.local communityfibre.co.uk
nameserver 10.152.183.10
options ndots:5
```

**Rust's DNS resolver (in uv 0.6.10) does NOT handle search domain expansion properly in dual-stack IPv6 environments.**

## Proof

When we remove search domains:
```bash
# Broken (with search domains)
uv pip install setuptools
# error: dns error: failed to lookup address information

# Works (without search domains)
echo "nameserver 10.152.183.10" > /etc/resolv.conf
uv pip install setuptools
# ✅ Successfully downloaded setuptools
```

## Solution: Configure dnsPolicy for Chronicle

Add `dnsPolicy: Default` to Chronicle deployment to bypass Kubernetes DNS and use node's `/etc/resolv.conf`:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: chronicle-backend
spec:
  dnsPolicy: Default  # Use node DNS, not cluster DNS
  containers:
  - name: backend
    image: ghcr.io/ushadow-io/chronicle/backend:nodeps1
    # ... rest of config
```

### Alternative: Custom DNS Config

If you need cluster DNS for service discovery but want simpler config for external domains:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: chronicle-backend
spec:
  dnsPolicy: None
  dnsConfig:
    nameservers:
      - 10.152.183.10  # CoreDNS
      - 8.8.8.8        # Google DNS as fallback
    options:
      - name: ndots
        value: "1"     # Reduce from 5 to 1
```

## Testing the Fix

### Test with dnsPolicy: Default

```bash
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: chronicle-dns-test
spec:
  dnsPolicy: Default  # Key fix
  containers:
  - name: test
    image: ghcr.io/ushadow-io/chronicle/backend:nodeps1
    command: ["sleep", "300"]
EOF

kubectl wait --for=condition=ready pod/chronicle-dns-test --timeout=60s

kubectl exec chronicle-dns-test -- sh -c '
echo "Testing uv with dnsPolicy: Default"
uv pip install --system setuptools
python3 -c "import setuptools; print(\"SUCCESS:\", setuptools.__version__)"
'

kubectl delete pod chronicle-dns-test
```

## Implementation for Chronicle

Update Chronicle deployment YAML or Helm chart:

### For docker-compose (k8s deployment)

If you're generating K8s manifests from docker-compose, add:

```yaml
# In your K8s deployment manifest
spec:
  template:
    spec:
      dnsPolicy: Default
      containers:
      - name: chronicle-backend
        # ... existing config
```

### For Helm chart

```yaml
# values.yaml
dnsPolicy: Default

# Or in templates/deployment.yaml
spec:
  template:
    spec:
      dnsPolicy: {{ .Values.dnsPolicy | default "Default" }}
```

## Why This Works

**dnsPolicy: Default**
- Uses the node's `/etc/resolv.conf` (typically 8.8.8.8, 8.8.4.4)
- No Kubernetes search domains
- No ndots:5
- Rust DNS resolver works correctly ✅

**Trade-off:**
- Can't resolve Kubernetes service names (e.g., `http://redis:6379`)
- Must use external DNS names or IP addresses
- If Chronicle needs to talk to K8s services, use full DNS names: `redis.default.svc.cluster.local`

## Alternative: Upgrade uv

Newer uv versions (0.9.x) may have better DNS handling. Chronicle uses uv 0.6.10 from the Dockerfile:

```dockerfile
COPY --from=ghcr.io/astral-sh/uv:0.6.10 /uv /uvx /bin/
```

Consider updating to:
```dockerfile
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/
```

**Note:** We tested uv 0.9.26 and it worked, but need to verify with Chronicle's specific use case.

## References

- Python DNS works: Uses glibc getaddrinfo() ✅
- curl DNS works: Uses c-ares library ✅
- uv 0.6.10 DNS fails: Rust resolver + Kubernetes ndots issue ❌
- uv 0.9.26 DNS works: Improved Rust resolver ✅

## Testing Results

| Configuration | Python | curl | uv 0.6.10 | uv 0.9.26 |
|--------------|--------|------|-----------|-----------|
| K8s DNS (ndots:5) | ✅ | ✅ | ❌ | ✅ |
| Simplified DNS | ✅ | ✅ | ✅ | ✅ |
| dnsPolicy: Default | ✅ | ✅ | ✅ | ✅ |
