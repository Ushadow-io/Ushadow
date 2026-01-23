# Kubelet Unsafe Sysctl Configuration - Status Report

**Date**: 2026-01-14
**Goal**: Enable `net.ipv6.conf.all.disable_ipv6` sysctl in Kubernetes pods to fix Chronicle DNS issues

---

## Current Status: ❌ NOT WORKING

Pods attempting to use the `net.ipv6.conf.all.disable_ipv6` sysctl still fail with:
```
Status: SysctlForbidden
```

## The Problem We're Solving

Chronicle uses `uv` (Rust-based package manager) which doesn't gracefully fall back from IPv6 to IPv4 when making HTTP connections to PyPI. This causes DNS resolution failures:

```
dns error: failed to lookup address information: Name has no usable address
```

**Root Cause**: The cluster nodes have no IPv6 routing to the internet, but `uv`'s HTTP client (reqwest) tries IPv6 first and fails instead of falling back to IPv4.

**Solution**: Disable IPv6 at the pod level so `uv` never attempts IPv6 connections.

---

## What We've Configured

### 1. Added Kubelet Argument to All Nodes (✅ DONE)

Used a DaemonSet to add the following line to `/var/snap/microk8s/current/args/kubelet` on all nodes:

```bash
--allowed-unsafe-sysctls='net.ipv6.*'
```

**Verification on anubis**:
```bash
$ cat /var/snap/microk8s/current/args/kubelet | grep allowed
--allowed-unsafe-sysctls='net.ipv6.*'
```

✅ The configuration file has been updated correctly.

### 2. Updated kubernetes_manager.py (✅ DONE)

Added pod-level sysctl to deployment spec (lines 675-684):

```python
"securityContext": {
    "sysctls": [
        {
            "name": "net.ipv6.conf.all.disable_ipv6",
            "value": "1"
        }
    ]
}
```

✅ The code is ready to deploy pods with IPv6 disabled.

---

## What We've Tried

### Attempt 1: Deploy DaemonSet to Modify Kubelet Args
**Status**: ✅ Success
**Method**: Created `/tmp/allow-ipv6-sysctl-daemonset.yaml`
**Result**: Configuration added to `/var/snap/microk8s/current/args/kubelet`

### Attempt 2: Restart MicroK8s Using `microk8s stop && microk8s start`
**Status**: ⚠️ Partial - Caused control plane downtime
**Method**: Privileged pod with nsenter to run `microk8s stop && start`
**Result**: Control plane went down (anubis is the master). User manually recovered cluster.

### Attempt 3: Restart Individual Nodes (babel, ra)
**Status**: ✅ Completed
**Method**: Privileged pods with nsenter to restart worker nodes
**Result**: Nodes restarted successfully, cluster stable

### Attempt 4: Restart Kubelet Daemon
**Status**: ❌ Failed
**Method**: `nsenter -t 1 ... snapctl restart microk8s.daemon-kubelet`
**Result**: Command executed but sysctl still forbidden

### Attempt 5: Restart All MicroK8s Services Using `snap restart`
**Status**: ✅ Command succeeded
**Method**: `nsenter -t 1 ... snap restart microk8s`
**Result**: Command executed, cluster came back online, but sysctl still forbidden

### Attempt 6: Test Pod with IPv6 Sysctl
**Status**: ❌ Failed (tested 3 times)
**Test Pods**: `test-ipv6-sysctl`, `test-ipv6-sysctl-v2`, `test-ipv6-sysctl-v3`
**Result**: All failed with `Status: SysctlForbidden`

---

## Current Cluster State

**Nodes**: All healthy
```
NAME     STATUS   ROLES    AGE    VERSION
anubis   Ready    <none>   141d   v1.33.7
babel    Ready    <none>   140d   v1.33.7
ra       Ready    <none>   47d    v1.33.7
```

**Core Services**: Running
- calico-node: Running on all nodes
- coredns: Running
- Cluster is stable and accepting workloads

**Kubelet Args File**: Contains the correct configuration
```bash
--allowed-unsafe-sysctls='net.ipv6.*'
```

**Test Pod Status**: Failing
```
NAME                  READY   STATUS            RESTARTS   AGE
test-ipv6-sysctl-v3   0/1     SysctlForbidden   0          XXs
```

---

## Why It's Not Working

### Theory 1: Kubelet Hasn't Reloaded the Args File

Even though we modified `/var/snap/microk8s/current/args/kubelet`, the kubelet process may not have picked up the new configuration.

**Evidence**:
- We modified the args file ✅
- We restarted services ✅
- But pods still fail with SysctlForbidden ❌

**Possible Cause**: The kubelet may need a different restart method, or the args file might not be read during restart.

### Theory 2: MicroK8s Overrides the Args File

MicroK8s might have a different mechanism for configuring kubelet that overrides the args file.

**Possible Locations**:
- `/var/snap/microk8s/current/args/*` - Other arg files
- MicroK8s snap configuration
- systemd drop-in files

### Theory 3: Wrong Restart Method

We used `snap restart microk8s` which should restart all services, but maybe the kubelet needs a more forceful restart:
- Kill the kubelet process directly?
- Full node reboot?
- Different snap command?

---

## What We Haven't Tried Yet

### Option 1: Check Actual Kubelet Process Arguments ⏭️ NEXT STEP

Verify what arguments the running kubelet process actually has:
```bash
ps auxww | grep kubelet | grep -v grep
```

This will show if `--allowed-unsafe-sysctls` is actually being passed to the process.

### Option 2: Full Node Reboot

A complete node reboot would ensure all services start fresh with new configuration:
```bash
# On each node:
sudo reboot
```

**Risk**: Cluster downtime during reboots.

### Option 3: Manually Kill and Restart Kubelet

Force-kill the kubelet process and let snap restart it:
```bash
pkill -9 kubelet
# Snap should auto-restart it
```

### Option 4: Check MicroK8s Documentation

Look for MicroK8s-specific way to configure kubelet:
- `microk8s kubectl` might have different config paths
- MicroK8s might use a different config mechanism

### Option 5: Alternative: Use PodSecurityPolicy

Instead of sysctls, use PodSecurityPolicy to allow the sysctl:
```yaml
apiVersion: policy/v1beta1
kind: PodSecurityPolicy
metadata:
  name: allow-ipv6-sysctl
spec:
  allowedUnsafeSysctls:
  - net.ipv6.conf.all.disable_ipv6
```

**Note**: PodSecurityPolicy is deprecated in K8s 1.25+, replaced by Pod Security Standards.

---

## Update: Root Cause Found

**MicroK8s 1.33.7 uses kubelite architecture**: The cluster runs a single `kubelite` binary (not separate kubelet) that internally runs all K8s components.

**Verification Results**:
✅ Args file contains correct flag: `--allowed-unsafe-sysctls='net.ipv6.*'`
❌ Running kubelite process does NOT have this flag
❌ Test pods still fail with `SysctlForbidden`

**The Problem**: Even though the flag is in `/var/snap/microk8s/8596/args/kubelet`, kubelite's internal kubelet component is not honoring it. This may be:
1. A bug in kubelite's args file parsing
2. Version-specific limitation in MicroK8s 1.33.7
3. Requires different restart method (full reboot)

## Recommended Path Forward

### Option 1: Enable IPv6 Internet Access (PREFERRED)

Instead of disabling IPv6 in pods, fix the underlying issue - nodes don't have IPv6 internet connectivity.

**Why This Is Better**:
- No security workarounds needed
- Works with all software (not just workarounds)
- Future-proof as more services require IPv6

**Implementation**:
1. Enable IPv6 internet routing on host nodes
2. Configure NAT64/DNS64 if needed for IPv4 services
3. Verify connectivity: `ping6 pypi.org`

**Resources**:
- [MicroK8s Dual-Stack Configuration](https://microk8s.io/docs/explain-dual-stack)
- [IPv6 Masquerading for Egress on MicroK8s](https://www.checklyhq.com/blog/ipv6-masquerading-for-egress-on-microk8s-on-ec2/)
- [How to enable IPv6 when MicroK8s is already installed](https://discuss.kubernetes.io/t/how-can-i-enable-ipv6-when-microk8s-is-already-installed/25312)

### Option 2: Full Node Reboot

If you want to continue with the sysctl approach, try full node reboots:
```bash
# Reboot one at a time to maintain availability
ssh anubis "sudo reboot"
# Wait for anubis to come back
ssh babel "sudo reboot"
# Wait for babel to come back
ssh ra "sudo reboot"
```

**Risk**: May still not work due to kubelite limitation.

### Option 3: Use UV_NO_SYNC Workaround

Modify Chronicle's startup command to skip package sync:
```yaml
command:
  - /bin/bash
  - -c
  - |
    export UV_NO_SYNC=1
    exec uv run --extra deepgram python src/advanced_omi_backend/main.py
```

**Downsides**:
- Only works if dependencies are pre-installed in image
- Doesn't fix the underlying IPv6 issue
- Other services may have similar problems

---

## Resources Created

### Files Modified
- `/var/snap/microk8s/current/args/kubelet` - Added `--allowed-unsafe-sysctls='net.ipv6.*'` on all nodes
- `/Users/stu/repos/worktrees/ushadow/purple/ushadow/backend/src/services/kubernetes_manager.py` - Added sysctl to pod spec (lines 675-684)

### DaemonSets Deployed
- `allow-ipv6-sysctl` (namespace: kube-system) - Configured kubelet args
- `disable-ipv6` (namespace: kube-system) - Disabled IPv6 at host level (still running)

### Test Pods Created
- `test-ipv6-sysctl` - Deleted
- `test-ipv6-sysctl-v2` - Deleted
- `test-ipv6-sysctl-v3` - Currently failing with SysctlForbidden

---

## Related Documentation

- [IPv6 DNS Fix](./IPV6_DNS_FIX.md) - Previous attempts at fixing IPv6 issues
- [Kubernetes Volume Mounting](./KUBERNETES_VOLUME_MOUNTING.md) - Volume mount implementation for config files

---

## Summary

We have successfully:
1. ✅ Modified kubelet args file to allow IPv6 sysctls
2. ✅ Updated code to deploy pods with IPv6 sysctl
3. ✅ Restarted MicroK8s services

But the kubelet is still rejecting the sysctl. The configuration in the args file is correct, but the running kubelet process doesn't appear to be using it.

**Immediate Action Required**: Verify the actual kubelet process arguments to determine if the configuration was loaded.
