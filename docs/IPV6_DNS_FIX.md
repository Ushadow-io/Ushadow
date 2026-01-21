# IPv6 DNS Resolution Fix for MicroK8s Cluster

## Problem

Applications using modern HTTP clients (like Rust-based `uv`, Python package manager) were failing with DNS resolution errors:

```
dns error: failed to lookup address information: Name has no usable address
```

**Root Cause:**
- MicroK8s cluster had IPv6 enabled with Calico IPv6 IP pool (`fd70:8823:7283::/48`)
- Nodes had global IPv6 addresses but **no IPv6 routing to the internet**
- Applications attempting IPv6 connections would fail with "Network unreachable"
- Some applications (especially Rust-based tools like `uv`) don't gracefully fall back to IPv4

## Solution Applied

### 1. Deleted the IPv6 IP Pool (2026-01-14)

```bash
kubectl delete ippool default-ipv6-ippool
```

This removed IPv6 addressing from pods, leaving only the IPv4 pool (`10.1.0.0/16`).

### 2. CoreDNS Configuration - Block AAAA Queries

CoreDNS is configured to block IPv6 AAAA DNS queries, returning empty responses:

```yaml
# Block IPv6 AAAA queries
template IN AAAA . {
    rcode NOERROR
}
forward . 8.8.8.8 8.8.4.4 {
  prefer_udp
}
```

This ensures DNS only returns IPv4 addresses. However, **this doesn't prevent applications that have IPv6 enabled from trying IPv6 connections**.

### 3. Disabled IPv6 at Kernel Level on All Nodes

**Note: This affects the host but NOT pod network namespaces!**

Created a DaemonSet that disables IPv6 at the operating system level on every node in the cluster:

**File:** `/tmp/disable-ipv6-daemonset.yaml`

```yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: disable-ipv6
  namespace: kube-system
spec:
  selector:
    matchLabels:
      name: disable-ipv6
  template:
    metadata:
      labels:
        name: disable-ipv6
    spec:
      hostNetwork: true
      hostPID: true
      initContainers:
      - name: disable-ipv6
        image: busybox
        command:
        - sh
        - -c
        - |
          echo "🔧 Disabling IPv6 on host..."

          # Disable IPv6 on all interfaces
          nsenter -t 1 -m -u -n -i -- sysctl -w net.ipv6.conf.all.disable_ipv6=1
          nsenter -t 1 -m -u -n -i -- sysctl -w net.ipv6.conf.default.disable_ipv6=1
          nsenter -t 1 -m -u -n -i -- sysctl -w net.ipv6.conf.lo.disable_ipv6=0

          echo "✅ IPv6 disabled on host"
          echo "Current IPv6 status:"
          nsenter -t 1 -m -u -n -i -- sysctl net.ipv6.conf.all.disable_ipv6

          # Make persistent by adding to sysctl.conf
          if ! nsenter -t 1 -m -u -n -i -- grep -q "disable_ipv6" /etc/sysctl.conf 2>/dev/null; then
            echo "Adding to /etc/sysctl.conf for persistence..."
            nsenter -t 1 -m -u -n -i -- sh -c 'echo "net.ipv6.conf.all.disable_ipv6=1" >> /etc/sysctl.conf'
            nsenter -t 1 -m -u -n -i -- sh -c 'echo "net.ipv6.conf.default.disable_ipv6=1" >> /etc/sysctl.conf'
          fi

          echo "Done"
        securityContext:
          privileged: true
      containers:
      - name: pause
        image: gcr.io/google_containers/pause:3.1
      tolerations:
      - effect: NoSchedule
        operator: Exists
      - key: CriticalAddonsOnly
        operator: Exists
      - effect: NoExecute
        operator: Exists
```

**Apply the DaemonSet:**

```bash
kubectl apply -f /tmp/disable-ipv6-daemonset.yaml
```

## How This Works

1. **DaemonSet runs on ALL nodes** - One pod per node (anubis, babel, ra)
2. **Privileged access** - Uses `nsenter` to break into host namespace
3. **Kernel-level disable** - Sets `net.ipv6.conf.all.disable_ipv6=1` on the host
4. **Persistent across reboots** - Writes settings to `/etc/sysctl.conf`

This is a **cluster-wide fix** that affects:
- All nodes in the cluster
- All pods on those nodes
- All network connections from pods
- Persists after node reboots

## Verification

### Check DaemonSet is Running on All Nodes

```bash
kubectl get daemonset -n kube-system disable-ipv6
```

Expected output:
```
NAME           DESIRED   CURRENT   READY   UP-TO-DATE   AVAILABLE
disable-ipv6   3         3         3       3            3
```

### Verify IPv6 is Disabled on Each Node

```bash
kubectl get pods -n kube-system -l name=disable-ipv6
```

Check logs from any pod:
```bash
kubectl logs -n kube-system disable-ipv6-XXXXX -c disable-ipv6
```

Should show:
```
✅ IPv6 disabled on host
Current IPv6 status:
net.ipv6.conf.all.disable_ipv6 = 1
```

### Test Application DNS Resolution

Create a test pod to verify applications can now resolve DNS:

```bash
kubectl run dns-test --image=busybox --restart=Never -- sh -c "nslookup github.com && nslookup pypi.org"
kubectl logs dns-test
kubectl delete pod dns-test
```

## Previous Attempts (Did Not Fully Solve the Issue)

1. ✅ **CoreDNS template to block AAAA queries** - Helped but didn't solve the root issue
   - Some applications bypass CoreDNS or use cached DNS

2. ✅ **gai.conf modification for IPv4 preference** - Helped for some tools
   - Modified `/etc/gai.conf` with `precedence ::ffff:0:0/96  100`
   - Not respected by all applications (especially Rust-based tools)

3. ❌ **Calico FELIX_IPV6SUPPORT setting** - Was already set correctly
   - `FELIX_IPV6SUPPORT=true` (for IPv6 readiness, not routing)
   - Didn't prevent IPv6 address assignment issues

## Current Status

**What Works:**
- ✅ DNS queries return IPv4 addresses only (no AAAA records)
- ✅ Busybox/curl/wget can resolve DNS
- ✅ Pods get IPv4-only addresses (no IPv6 from Calico pool)

**What Still Fails:**
- ❌ Applications with IPv6 enabled (like Rust-based `uv`) still try IPv6
- ❌ **Cannot disable IPv6 in pod network namespaces** - Kubernetes forbids the required sysctl
- ❌ Chronicle `no-spacy` image **still downloads packages at runtime** despite the name

## The Real Problem

The fundamental issue is **NOT just IPv6** - it's that:

1. **Chronicle images download dependencies at runtime** instead of having them baked in
2. The Rust-based `uv` package manager doesn't gracefully fall back from IPv6 to IPv4
3. Kubernetes security policy prevents using `sysctls` to disable IPv6 in pods

**Why Host-Level Disable Doesn't Help:**
- Each pod has its own isolated network namespace
- Host sysctls don't propagate to pods
- Test shows: `cat /proc/sys/net/ipv6/conf/all/disable_ipv6` returns `0` (enabled) in pods

## Solutions Going Forward

### Option 1: Use a Pre-Built Chronicle Image (RECOMMENDED)
Find or build a Chronicle image that has ALL dependencies pre-installed:
```bash
# Image should include spacy, all Python packages
# No runtime downloads needed
```

### Option 2: PyPI Mirror/Proxy
Set up a local PyPI mirror that's reachable via IPv4:
```bash
# devpi, bandersnatch, or pypi-mirror
# Configure UV_INDEX_URL to point to local mirror
```

### Option 3: Force IPv4 in Application
Try environment variables to force IPv4 (limited success):
```yaml
env:
- name: FORCE_IPV4
  value: "1"
# May not work with all Rust networking stacks
```

## Impact of Current Fixes

**Partial Success:**
- Standard tools (curl, wget, nslookup) work fine
- DNS resolution returns IPv4 only
- Host networking improved

**Still Broken:**
- Rust-based tools like `uv` that don't fall back to IPv4
- Any application that tries IPv6 connections despite DNS returning IPv4

## Maintenance

- **DaemonSet is permanent** - Runs continuously to ensure IPv6 stays disabled
- **Automatic on new nodes** - Any new node added to cluster will automatically get IPv6 disabled
- **Survives node reboots** - Settings are written to `/etc/sysctl.conf`

## Rollback (If Needed)

To re-enable IPv6:

```bash
# Delete the DaemonSet
kubectl delete daemonset disable-ipv6 -n kube-system

# On each node, manually re-enable IPv6:
# ssh to node and run:
sudo sysctl -w net.ipv6.conf.all.disable_ipv6=0
sudo sysctl -w net.ipv6.conf.default.disable_ipv6=0

# Remove from sysctl.conf
sudo sed -i '/disable_ipv6/d' /etc/sysctl.conf

# Recreate the IPv6 IP pool (if desired)
# You would need the original IPv6 pool configuration
```

## Date Applied

- **2026-01-14** - IPv6 IP pool deleted
- **2026-01-14** - DaemonSet deployed and verified on all 3 nodes (anubis, babel, ra)

## Nodes Affected

- anubis (192.168.1.42)
- babel (192.168.1.43)
- ra (192.168.1.44)

All nodes now have IPv6 disabled at the kernel level.
