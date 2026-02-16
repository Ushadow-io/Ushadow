# Ushadow Kubernetes DNS Setup

Access your ushadow Kubernetes services via short DNS names through Tailscale, just like Docker containers.

## Overview

This setup integrates your ushadow services with the existing Chakra DNS system:

- **ushadow-frontend**: `http://ushadow`, `http://webui`, `http://ushadow-webui.chakra`
- **ushadow-backend**: `http://ushadow-api`, `http://api`, `http://ushadow-api.chakra`
- **chronicle-backend**: `http://chronicle`, `http://chronicle.chakra`
- **mem0-ui**: `http://mem0`, `http://memory`, `http://mem0.chakra`

## Architecture

```
Your Device (laptop/phone)
  ↓
Tailscale MagicDNS (forwards .chakra queries)
  ↓
Kubernetes CoreDNS (10.152.183.10)
  ↓
Nginx Ingress Controller (10.152.183.53)
  ↓
Ushadow Services
```

## Prerequisites

✅ Already configured:
- CoreDNS with hosts plugin
- Nginx Ingress Controller
- Tailscale subnet router
- Chakra DNS system

## Quick Setup

### Option 1: Combined Setup (Recommended)

```bash
cd k8s
./setup-ushadow-dns.sh
```

This will:
1. Add DNS mappings to CoreDNS
2. Create Ingress resources
3. Test the setup

### Option 2: Step-by-Step

```bash
cd k8s

# Step 1: Add DNS mappings
./add-ushadow-dns.sh

# Step 2: Create Ingress resources
./create-ushadow-ingress.sh

# Step 3: Test
nslookup ushadow.chakra
curl http://ushadow
```

## Accessing Services

### From Any Tailscale Device

**Frontend:**
```bash
# Short name (requires search domain configured)
open http://ushadow
open http://webui

# FQDN
open http://ushadow-webui.chakra
```

**Backend API:**
```bash
curl http://ushadow-api/health
curl http://api/health
curl http://ushadow-api.chakra/health
```

**Chronicle:**
```bash
curl http://chronicle/health
curl http://chronicle.chakra/health
```

**Mem0:**
```bash
open http://mem0
open http://memory
open http://mem0.chakra
```

### Port-less Access

All services use port 80 via Nginx Ingress Controller. No need to specify ports!

Instead of: `http://10.152.183.81:8000`
You get: `http://ushadow-api`

## How It Works

### 1. DNS Resolution

When you access `http://ushadow`:

1. **Tailscale MagicDNS** expands to `ushadow.chakra` (search domain)
2. Forwards to **CoreDNS** (10.152.183.10)
3. CoreDNS returns **Ingress Controller IP** (10.152.183.53)
4. Your device connects to Ingress Controller

### 2. HTTP Routing

Nginx Ingress Controller routes by Host header:

```
Host: ushadow.chakra → ushadow-frontend:80
Host: ushadow-api.chakra → ushadow-backend:8000
Host: chronicle.chakra → chronicle-backend:8000
Host: mem0.chakra → mem0-ui:8000
```

### 3. Zero Extra Pods

This solution adds:
- 0 extra pods
- 0 extra memory
- 1 ConfigMap update
- 4 Ingress resources

## DNS Mappings

All services resolve to Ingress Controller IP (`10.152.183.53`):

```
10.152.183.53  ushadow-webui.chakra ushadow webui ushadow-frontend
10.152.183.53  ushadow-api.chakra ushadow-api api
10.152.183.53  chronicle.chakra chronicle
10.152.183.53  mem0.chakra mem0 memory
```

## Ingress Resources

Located in: `k8s/ushadow-ingress.yaml`

Each service has multiple host rules for flexible access:
- FQDN: `servicename.chakra`
- Short names: `servicename`, aliases

## Testing

### DNS Resolution Test

```bash
# Test FQDN
nslookup ushadow-webui.chakra
# Should return: 10.152.183.53

# Test short name
nslookup ushadow
# Should return: 10.152.183.53
```

### HTTP Access Test

```bash
# Test frontend
curl -I http://ushadow
# Should return: 200 OK

# Test backend
curl http://ushadow-api/health
# Should return: {"status": "ok"}

# Test with Host header (debugging)
curl -v http://10.152.183.53 -H 'Host: ushadow.chakra'
```

### From Kubernetes Pod

```bash
kubectl run test-dns --image=busybox:1.28 --rm -it --restart=Never \
  -- nslookup ushadow.chakra
```

## Troubleshooting

### DNS Not Resolving

**Check CoreDNS logs:**
```bash
kubectl logs -n kube-system -l k8s-app=kube-dns --tail=50
```

**Verify ConfigMap:**
```bash
kubectl get configmap chakra-dns-hosts -n kube-system \
  -o jsonpath='{.data.chakra\.hosts}' | grep ushadow
```

**Check if CoreDNS reloaded:**
```bash
# ConfigMap updates trigger auto-reload (may take 5-10 seconds)
kubectl get pods -n kube-system -l k8s-app=kube-dns
```

### Ingress Not Working

**Check Ingress status:**
```bash
kubectl get ingress -n ushadow
kubectl describe ingress ushadow-frontend -n ushadow
```

**Test Ingress directly:**
```bash
curl -v http://10.152.183.53 -H 'Host: ushadow.chakra'
```

**Check service endpoints:**
```bash
kubectl get endpoints -n ushadow
```

### Service Not Responding

**Check pod status:**
```bash
kubectl get pods -n ushadow
kubectl logs -n ushadow <pod-name>
```

**Check service:**
```bash
kubectl get svc -n ushadow
kubectl describe svc ushadow-frontend -n ushadow
```

### Tailscale Not Routing

**Check subnet router:**
```bash
tailscale status
# Should show: 10.152.183.0/24 in advertised routes
```

**Test connectivity:**
```bash
ping 10.152.183.53
```

## Updating Services

### Add New Service

1. Update `add-ushadow-dns.sh` with new service
2. Create Ingress in `ushadow-ingress.yaml`
3. Run: `./setup-ushadow-dns.sh`

### Remove Service

```bash
# Remove from DNS
kubectl edit configmap chakra-dns-hosts -n kube-system
# (Remove the line)

# Remove Ingress
kubectl delete ingress <ingress-name> -n ushadow
```

### Update DNS Mapping

```bash
# Edit ConfigMap
kubectl edit configmap chakra-dns-hosts -n kube-system

# CoreDNS auto-reloads in 5-10 seconds
```

## Integration with Docker Services

Your Docker services (via Tailscale container operator) and Kubernetes services can coexist:

**Docker containers:**
- Direct Tailscale IP per container
- Example: `http://container-name.tailnet`

**Kubernetes services:**
- CoreDNS + Ingress routing
- Example: `http://service-name.chakra`

Both work seamlessly on your Tailnet!

## Files Created

```
k8s/
├── USHADOW_DNS_SETUP.md          # This file
├── add-ushadow-dns.sh             # Add DNS mappings
├── create-ushadow-ingress.sh      # Create Ingress resources
├── setup-ushadow-dns.sh           # Combined setup script
└── ushadow-ingress.yaml           # Ingress definitions
```

## Maintenance

### View Current DNS Mappings

```bash
kubectl get configmap chakra-dns-hosts -n kube-system \
  -o jsonpath='{.data.chakra\.hosts}'
```

### View Ingress Resources

```bash
kubectl get ingress -n ushadow -o wide
```

### Update After Service Changes

If you redeploy or change service ports:

```bash
# Update Ingress
kubectl apply -f k8s/ushadow-ingress.yaml

# DNS should not need updates (uses Ingress IP)
```

## Tailscale Configuration

Your Tailscale should already be configured with:

1. **MagicDNS**: Enabled
2. **Custom nameserver**: `10.152.183.10` (restrict to: `chakra`)
3. **Search domain**: `chakra`

This is already set up for Chakra. Ushadow uses the same configuration.

## Next Steps

After setup, you can:

1. **Bookmark services:**
   - Bookmark `http://ushadow` in your browser
   - Access from phone, tablet, etc.

2. **Share with team:**
   - Add team members to Tailnet
   - They get instant access to all services

3. **Add more services:**
   - Follow the same pattern for new deployments
   - Update DNS and create Ingress

4. **Monitor:**
   - Services appear in Kubernetes dashboard
   - Access via `http://dashboard.chakra` (if configured)

## Benefits

✅ **Port-less access** - Just `http://service`, no port numbers
✅ **Memorable names** - `ushadow` instead of `10.152.183.81:8000`
✅ **Zero overhead** - No extra pods, just ConfigMap + Ingress
✅ **Secure** - Only accessible via Tailscale
✅ **Multi-device** - Works on laptop, phone, tablet
✅ **Easy updates** - Just edit ConfigMap or Ingress

## Comparison: Docker vs Kubernetes

**Docker (Tailscale Container Operator):**
- Each container gets own Tailscale IP
- Access via: `http://container-name.tailnet`
- Resource: 1 Tailscale device per container

**Kubernetes (CoreDNS + Ingress):**
- All services share Ingress IP
- Access via: `http://service-name.chakra`
- Resource: 0 extra pods, 1 shared subnet router

Both approaches work! Kubernetes is more efficient for many services.
