# Enable IPv6 on MicroK8s Cluster

## Problem
The cluster nodes have IPv6 disabled, but your network has full IPv6 connectivity (confirmed from your Mac). This causes applications like Chronicle (using `uv`) to fail when trying to access PyPI over IPv6.

## Solution
Enable IPv6 on all cluster nodes and restart MicroK8s.

---

## Step 1: Enable IPv6 on Each Node

Run these commands on **each node** (anubis, babel, ra):

```bash
# SSH to node
ssh anubis  # or babel, or ra

# Enable IPv6
sudo sysctl -w net.ipv6.conf.all.disable_ipv6=0
sudo sysctl -w net.ipv6.conf.default.disable_ipv6=0
sudo sysctl -w net.ipv6.conf.lo.disable_ipv6=0

# Make persistent
echo "net.ipv6.conf.all.disable_ipv6=0" | sudo tee -a /etc/sysctl.conf
echo "net.ipv6.conf.default.disable_ipv6=0" | sudo tee -a /etc/sysctl.conf

# Wait for IPv6 address (SLAAC from router)
sleep 3

# Verify IPv6 is working
ip -6 addr show | grep inet6 | grep -v "scope host"
ping6 -c 2 google.com
```

**Expected output:**
- You should see a global IPv6 address (starts with 2xxx:xxxx:...)
- Ping to google.com should succeed

---

## Step 2: Restart MicroK8s on Each Node

After enabling IPv6 on all nodes, restart MicroK8s:

```bash
# On each node:
ssh anubis
microk8s stop
sleep 3
microk8s start
exit

# Repeat for babel and ra
```

Or restart all at once (from your Mac):

```bash
ssh anubis "microk8s stop && sleep 3 && microk8s start" &
ssh babel "microk8s stop && sleep 3 && microk8s start" &
# Wait for both to complete
wait

# Note: ra appears to be down, might need manual intervention
```

---

## Step 3: Verify Cluster Status

```bash
# Check nodes are ready
kubectl get nodes

# Check pods can use IPv6
kubectl run test-ipv6 --image=busybox --restart=Never --rm -i -- ping6 -c 2 google.com

# Should see successful ping responses
```

---

## Step 4: Remove IPv6 Sysctl from kubernetes_manager.py

Once IPv6 is working, remove the sysctl code we added (since it's not working anyway):

**File**: `ushadow/backend/src/services/kubernetes_manager.py`
**Lines**: 675-684

Remove:
```python
# Disable IPv6 at pod level to prevent DNS resolution issues
# with tools like uv that don't gracefully fall back to IPv4
"securityContext": {
    "sysctls": [
        {
            "name": "net.ipv6.conf.all.disable_ipv6",
            "value": "1"
        }
    ]
}
```

Replace with just:
```python
# Pod runs with default security context
```

---

## Step 5: Update Calico IPv6 Configuration

Check if Calico has IPv6 enabled:

```bash
kubectl get ippool -o yaml | grep cidr
```

If you only see IPv4 CIDRs, you may need to enable Calico IPv6:

```bash
# Create IPv6 IP pool
cat <<EOF | kubectl apply -f -
apiVersion: crd.projectcalico.org/v1
kind: IPPool
metadata:
  name: default-ipv6-ippool
spec:
  cidr: fd00:10:244::/64
  blockSize: 122
  ipipMode: Never
  natOutgoing: true
  disabled: false
  nodeSelector: all()
EOF
```

**Note**: This gives pods IPv6 addresses in the `fd00::/8` ULA range. They'll use NAT to reach the internet.

---

## Step 6: Deploy Chronicle

Once IPv6 is working, deploy Chronicle:

```bash
# Delete old deployment
kubectl delete deployment chronicle-backend -n ushadow

# Redeploy (via API or directly)
# Chronicle should now work with IPv6 internet connectivity
```

---

## Troubleshooting

### No IPv6 address after enabling

If you don't get an IPv6 address automatically:

```bash
# Check router advertisements
sudo rdisc6 enp3s0f0

# Or try DHCPv6
sudo dhclient -6 enp3s0f0
```

### ra node down

Node `ra` appears to be unreachable. Check:

```bash
# Can you ping it?
ping ra

# Is it powered on?
# Does it need network troubleshooting?
```

### Calico pods crashlooping after IPv6 enable

If Calico has issues, restart the pods:

```bash
kubectl delete pod -n kube-system -l k8s-app=calico-node
```

---

## Why This Works

Your Mac (on the same network) has full IPv6 connectivity:
- Global IPv6 address: `2a02:6b67:d5f0:6300:1d35:f592:d434:8ded`
- Successfully pings Google over IPv6

This means your router/ISP provides IPv6 via SLAAC (Router Advertisements). Once the cluster nodes have IPv6 enabled, they'll automatically get IPv6 addresses and can route to the internet.

## Alternative: Quick Fix for Chronicle Only

If you just want Chronicle working immediately without fixing IPv6 cluster-wide:

1. Edit `compose/chronicle-compose.yaml`
2. Change line 34 from:
   ```yaml
   exec uv run --extra deepgram python src/advanced_omi_backend/main.py
   ```
   To:
   ```yaml
   export UV_NO_SYNC=1
   exec uv run --extra deepgram python src/advanced_omi_backend/main.py
   ```

This skips package sync and avoids IPv6 DNS lookups. But enabling IPv6 properly is the better long-term solution.
