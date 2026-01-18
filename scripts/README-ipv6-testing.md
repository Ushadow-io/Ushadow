# IPv6 Diagnostic Scripts

Scripts to diagnose IPv6 connectivity issues in Kubernetes pods, specifically for debugging Calico CNI IPv6 NAT problems.

## Scripts

### `diagnose-ipv6.sh`
Comprehensive IPv6 connectivity test that checks:
- Pod network configuration (IPv4/IPv6 addresses)
- IPv6 ICMP connectivity (ping)
- IPv6 TCP connectivity (netcat)
- DNS resolution (A and AAAA records)
- IPv6 HTTPS with direct IP addresses
- IPv6 HTTPS with hostnames (DNS-based)
- IPv4 connectivity for comparison
- Routing information

**Usage in a running pod:**
```bash
# Copy to pod and run
kubectl cp scripts/diagnose-ipv6.sh <pod-name>:/tmp/diagnose-ipv6.sh
kubectl exec <pod-name> -- sh /tmp/diagnose-ipv6.sh
```

**Usage with kubectl exec (pipe stdin):**
```bash
kubectl exec <pod-name> -- sh < scripts/diagnose-ipv6.sh
```

**Usage in Chronicle backend pod:**
```bash
# Find the pod
POD=$(kubectl get pod -l app=chronicle-backend -o jsonpath='{.items[0].metadata.name}')

# Run diagnostic
kubectl exec $POD -- sh < scripts/diagnose-ipv6.sh
```

### `test-ipv6-all-nodes.sh`
Automated test that:
1. Creates test pods on all cluster nodes (ra, babel, anubis)
2. Runs `diagnose-ipv6.sh` on each pod
3. Compares results across nodes
4. Optionally cleans up test pods

**Usage:**
```bash
./scripts/test-ipv6-all-nodes.sh
```

This is useful for verifying if IPv6 issues are node-specific or cluster-wide.

## Expected Results

### With Calico IPv6 NAT Bug (Current State)
```
✓ PASS: IPv6 ping to Google DNS
✓ PASS: IPv6 TCP connection to Google DNS port 443
✗ FAIL: IPv6 HTTPS to Google (direct IP)
✗ FAIL: IPv6 HTTPS to www.google.com (hostname)
✓ PASS: IPv4 HTTPS to pypi.org
```

**Why:** Calico VXLAN IPv6 NAT works for ICMP but fails for TCP/HTTPS.

### If IPv6 is Working Correctly
```
✓ PASS: IPv6 ping to Google DNS
✓ PASS: IPv6 TCP connection to Google DNS port 443
✓ PASS: IPv6 HTTPS to Google (direct IP)
✗ FAIL: IPv6 HTTPS to www.google.com (hostname) - DNS AAAA blocking
✓ PASS: IPv4 HTTPS to pypi.org
```

**Note:** IPv6 HTTPS with hostname will fail if CoreDNS is blocking AAAA records, but HTTPS with direct IPv6 should work.

## Testing Specific Issues

### Test if Chronicle can download from PyPI
```bash
POD=$(kubectl get pod -l app=chronicle-backend -o jsonpath='{.items[0].metadata.name}')

# Run diagnostic
kubectl exec $POD -- sh < scripts/diagnose-ipv6.sh

# Test actual uv/pip download (if available in image)
kubectl exec $POD -- python -c "import urllib.request; urllib.request.urlopen('https://pypi.org/simple/httpx/')"
```

### Test on specific node
```bash
kubectl run ipv6-test --image=nicolaka/netshoot --overrides='
{
  "spec": {
    "nodeSelector": {"kubernetes.io/hostname": "ra"}
  }
}' --command -- sleep 300

kubectl wait --for=condition=ready pod/ipv6-test --timeout=30s
kubectl exec ipv6-test -- sh < scripts/diagnose-ipv6.sh
kubectl delete pod ipv6-test
```

### Test with custom image
```bash
# Use your own image that has the tools needed
kubectl run custom-test --image=your-image:tag --command -- sleep 300
kubectl exec custom-test -- sh < scripts/diagnose-ipv6.sh
```

## Interpreting Results

### IPv6 ICMP works but TCP fails
**Root cause:** Calico VXLAN IPv6 NAT bug (GitHub Issue #7638)

**Workarounds:**
1. Fix application image to avoid runtime downloads
2. Disable IPv6 per-pod using init container (see docs/IPV6_DUALSTACK_CONFIGURATION.md)
3. Wait for Calico fix

### All IPv6 tests fail
**Root cause:** IPv6 not properly configured or disabled

**Check:**
```bash
kubectl get ippool default-ipv6-ippool -o yaml
kubectl get felixconfiguration default -o yaml | grep ipv6
```

### DNS lookups fail
**Root cause:** CoreDNS AAAA blocking or DNS configuration issue

**Check:**
```bash
kubectl get cm coredns -n kube-system -o yaml
```

## Related Documentation

- [IPv6 Dual-Stack Configuration](../docs/IPV6_DUALSTACK_CONFIGURATION.md) - Complete IPv6 setup and troubleshooting
- [Calico Issue #7638](https://github.com/projectcalico/calico/issues/7638) - IPv6 VXLAN TCP bug
- [Calico Issue #10834](https://github.com/projectcalico/calico/issues/10834) - Dual-stack routing failures
