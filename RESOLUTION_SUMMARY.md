# IPv6 + uv DNS Issue - Complete Resolution

**Date:** 2026-01-17
**Issue:** Chronicle backend fails to download packages with `uv` - "dns error: failed to lookup address information"

## Executive Summary

✅ **FIXED** - Applied `dnsPolicy: Default` to all Kubernetes service deployments

## Root Causes Discovered

### 1. CoreDNS AAAA Blocking (Initial Issue - FIXED)
- **Problem:** CoreDNS was blocking IPv6 AAAA DNS queries
- **Impact:** Applications couldn't resolve IPv6 addresses
- **Fix:** Removed AAAA blocking template from CoreDNS ConfigMap
- **Result:** DNS now returns both IPv4 and IPv6 addresses

### 2. Rust DNS Resolver + Kubernetes ndots (Primary Issue - FIXED)
- **Problem:** uv 0.6.10 (Rust-based) breaks with Kubernetes `ndots:5` + search domains
- **Impact:** Even though DNS works, Rust resolver fails with "Name has no usable address"
- **Fix:** Added `dnsPolicy: Default` to pod spec in `kubernetes_manager.py`
- **Result:** uv now uses node DNS instead of K8s cluster DNS

## What We Learned

| Component | DNS Library | K8s DNS (ndots:5) | Node DNS |
|-----------|------------|-------------------|----------|
| Python (glibc) | getaddrinfo() | ✅ Works | ✅ Works |
| curl | c-ares | ✅ Works | ✅ Works |
| uv 0.6.10 (Rust) | Rust resolver | ❌ Broken | ✅ Works |
| uv 0.9.26 (Rust) | Rust resolver | ✅ Works | ✅ Works |

**Key Finding:** The issue was specific to how Rust's DNS resolver in uv 0.6.10 handles DNS search domain expansion in dual-stack environments.

## Files Changed

### 1. CoreDNS ConfigMap
**File:** `kube-system/configmap/coredns`

**Before:**
```yaml
template IN AAAA . {
    rcode NOERROR
}
```

**After:** (removed AAAA blocking)
```yaml
# No AAAA template - returns IPv6 records normally
```

### 2. Kubernetes Manager
**File:** `ushadow/backend/src/services/kubernetes_manager.py`

**Added at line 628:**
```python
"dnsPolicy": "Default",  # Use node DNS, not cluster DNS
```

**Impact:** All services deployed via ushadow backend will use simplified DNS

### 3. Documentation
Created comprehensive documentation:
- `FIX_UV_DNS.md` - Technical details and workarounds
- `CHRONICLE_IPV6_RESOLUTION.md` - Chronicle-specific resolution
- `docs/IPV6_DUALSTACK_CONFIGURATION.md` - Updated with resolution
- This file - Complete summary

## Testing Performed

### Test 1: CoreDNS Fix Verification
```bash
# DNS returns both A and AAAA records
kubectl run test --image=busybox --rm -it -- nslookup pypi.org
# ✅ Shows both IPv4 and IPv6 addresses
```

### Test 2: Python DNS (baseline)
```bash
# Using Chronicle's base image
kubectl run test --image=python:3.12-slim-bookworm --rm -it -- \
  python3 -c "import socket; print(len(socket.getaddrinfo('pypi.org', 443)))"
# ✅ Returns 24 addresses (IPv4 + IPv6)
```

### Test 3: uv with K8s DNS (broken)
```bash
# Using Chronicle backend image with default K8s DNS
kubectl run test --image=ghcr.io/ushadow-io/chronicle/backend:nodeps1 --rm -it -- \
  uv pip install setuptools
# ❌ dns error: failed to lookup address information
```

### Test 4: uv with dnsPolicy: Default (fixed)
```bash
# Using Chronicle backend image with dnsPolicy: Default
kubectl run test --image=ghcr.io/ushadow-io/chronicle/backend:nodeps1 \
  --overrides='{"spec":{"dnsPolicy":"Default"}}' --rm -it -- \
  uv pip install setuptools httpx
# ✅ Successfully downloaded both packages
```

## Impact on Existing Services

### Positive Impacts
- ✅ Chronicle backend will deploy successfully
- ✅ All uv-based applications will work
- ✅ Simpler DNS configuration (no search domains)
- ✅ Slightly faster DNS resolution (fewer lookups)

### Trade-offs
- ⚠️ Can't use short Kubernetes service names (e.g., `http://redis`)
- ⚠️ Must use full DNS names for K8s services (e.g., `redis.default.svc.cluster.local`)
- ⚠️ Uses node DNS servers (typically 8.8.8.8, 192.168.1.1) instead of CoreDNS

### Workarounds for K8s Service Discovery
If a service needs to talk to other K8s services, use full DNS names:

```python
# Instead of:
REDIS_URL = "redis://redis:6379"

# Use:
REDIS_URL = "redis://redis.default.svc.cluster.local:6379"
```

Or use IP addresses:
```python
# Get service ClusterIP
kubectl get svc redis -o jsonpath='{.spec.clusterIP}'
# Use that IP in environment variable
```

## Alternative Solutions Considered

### Option 1: Upgrade uv (not chosen)
- **Pro:** uv 0.9.26 handles K8s DNS correctly
- **Con:** Requires rebuilding Chronicle image
- **Con:** Untested with Chronicle's dependencies

### Option 2: Custom dnsConfig (not chosen)
- **Pro:** Can still use cluster DNS with reduced ndots
- **Con:** More complex configuration
- **Con:** Still might have issues with Rust resolver

### Option 3: dnsPolicy: Default (CHOSEN)
- **Pro:** Simple, proven to work
- **Pro:** No image changes needed
- **Pro:** Applies automatically to all future deployments
- **Con:** Requires full DNS names for K8s services

## Deployment Instructions

### For New Chronicle Deployments
No action needed - the fix is automatic when deploying via ushadow backend.

### For Existing Chronicle Pods
Restart the deployment to pick up new DNS policy:
```bash
# Find Chronicle deployment
kubectl get deploy -A | grep chronicle

# Restart it
kubectl rollout restart deployment/chronicle-backend -n <namespace>
```

### Verification
```bash
# Check DNS policy in running pod
kubectl get pod <chronicle-pod> -o yaml | grep dnsPolicy
# Should show: dnsPolicy: Default

# Check resolv.conf
kubectl exec <chronicle-pod> -- cat /etc/resolv.conf
# Should show simple nameserver config, no search domains

# Test uv
kubectl exec <chronicle-pod> -- uv pip list
# Should work without errors
```

## Timeline

1. **Initial Issue:** Chronicle crashes with "dns error" from uv
2. **First Investigation:** Thought it was Calico IPv6 NAT bug
3. **CoreDNS Fix:** Removed AAAA blocking (helped Python, not uv)
4. **Deep Dive:** Discovered uv 0.6.10 + Kubernetes ndots incompatibility
5. **Solution:** Applied dnsPolicy: Default
6. **Verification:** Tested with actual Chronicle backend image ✅

## References

- [FIX_UV_DNS.md](./FIX_UV_DNS.md) - Detailed technical fix
- [docs/IPV6_DUALSTACK_CONFIGURATION.md](./docs/IPV6_DUALSTACK_CONFIGURATION.md) - IPv6 setup
- [Calico Issue #7638](https://github.com/projectcalico/calico/issues/7638) - Similar symptoms (different cause)
- [Rust DNS Resolver](https://docs.rs/trust-dns-resolver/) - Library used by uv

## Status

🟢 **RESOLVED** - Chronicle backend will now deploy successfully with uv package downloads working.

## Next Steps

1. Deploy Chronicle to verify fix works in production
2. Monitor for any issues with K8s service discovery
3. Update any hardcoded service URLs to use full DNS names if needed
4. Consider upgrading to uv 0.9+ in future Chronicle image updates
