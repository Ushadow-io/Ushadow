# Kubernetes Registry Fallback Configuration

This guide explains how to configure your Kubernetes cluster to fall back to GHCR or Docker Hub when images aren't found in your local registry (`anubis:32000`).

## Overview

Currently, your deployments use:
- **Local registry**: `anubis:32000/ushadow-backend:latest`
- **Pull policy**: `imagePullPolicy: IfNotPresent`

When an image isn't in the local registry, Kubernetes will fail to pull it. Registry fallback solves this.

## Choose Your Kubernetes Distribution

Different Kubernetes distributions use different configuration methods:

- **MicroK8s** → See [MicroK8s Configuration](#microk8s-configuration) below
- **K3s** → Uses `/etc/rancher/k3s/registries.yaml`
- **Standard K8s** → Uses containerd `config.toml`

Run `./diagnose-containerd.sh` to detect your setup automatically.

---

## MicroK8s Configuration

**MicroK8s uses the containerd hosts.toml format** in `/var/snap/microk8s/current/args/certs.d/`.

### Quick Setup

```bash
cd k8s/scripts/air-gap

# 1. Generate MicroK8s registry configs
./setup-microk8s-registry-fallback.sh

# 2. Apply to all nodes (automated)
./apply-microk8s-registry-fallback.sh

# 3. Test configuration
./test-microk8s-registry-fallback.sh
```

### Manual Setup

If you prefer manual configuration:

```bash
# Generate configs
./setup-microk8s-registry-fallback.sh

# Apply to each node
for node in anubis babel ra; do
  # Create directories
  ssh -t $node 'sudo mkdir -p /var/snap/microk8s/current/args/certs.d/{anubis:32000,docker.io,ghcr.io}'

  # Copy configs
  scp /tmp/microk8s-registry-config/*.toml $node:/tmp/

  # Install
  ssh -t $node 'sudo mv /tmp/anubis-32000-hosts.toml /var/snap/microk8s/current/args/certs.d/anubis:32000/hosts.toml'
  ssh -t $node 'sudo mv /tmp/docker-io-hosts.toml /var/snap/microk8s/current/args/certs.d/docker.io/hosts.toml'
  ssh -t $node 'sudo mv /tmp/ghcr-io-hosts.toml /var/snap/microk8s/current/args/certs.d/ghcr.io/hosts.toml'

  # Restart MicroK8s
  ssh -t $node 'sudo microk8s stop && sudo microk8s start'
done
```

### How It Works

MicroK8s will try registries in this order:
1. **anubis:32000** (local registry)
2. **ghcr.io** (GitHub Container Registry)
3. **registry-1.docker.io** (Docker Hub)

### Testing

```bash
# Test image pull
ssh anubis 'microk8s ctr image pull anubis:32000/library/alpine:latest'

# View configs
ssh anubis 'sudo cat /var/snap/microk8s/current/args/certs.d/anubis:32000/hosts.toml'

# Check MicroK8s status
ssh anubis 'microk8s status'
```

### MicroK8s-Specific Notes

- **No daemon restart needed** - MicroK8s automatically detects config changes
- **Per-registry config** - Each registry gets its own `hosts.toml` file
- **Snap-based paths** - Config lives in `/var/snap/microk8s/`
- **Use `microk8s ctr`** - Not `crictl` for manual image operations

---

## Option 1: Containerd Registry Mirrors (Standard K8s)

**Pros:**
- Transparent to Kubernetes - no manifest changes needed
- Works at the CRI level (containerd)
- Applies to all pods automatically
- Can cache pulled images in local registry

**Cons:**
- Requires node-level configuration on all K8s nodes
- Requires containerd restart (brief downtime)

### Implementation

```bash
cd k8s/scripts/air-gap
./setup-registry-fallback.sh
```

This creates `/tmp/containerd-registry-fallback.toml` with:
1. **anubis:32000** → Try local first, fall back to GHCR, then Docker Hub
2. **docker.io** → Try local cache, fall back to Docker Hub
3. **ghcr.io** → Try local cache, fall back to GHCR

Apply to all nodes:
```bash
for node in anubis babel ra; do
  echo "Updating $node..."
  ssh $node 'sudo cp /etc/containerd/config.toml /etc/containerd/config.toml.backup'
  scp /tmp/containerd-registry-fallback.toml $node:/tmp/
  ssh $node 'sudo sh -c "cat /tmp/containerd-registry-fallback.toml >> /etc/containerd/config.toml"'
  ssh $node 'sudo systemctl restart containerd'
done
```

### Verification

```bash
# Check containerd config
sudo crictl info | grep -A 20 registry

# Test pull (should try local, then GHCR, then Docker Hub)
kubectl run test-fallback --image=anubis:32000/library/nginx:latest --rm -it -- /bin/sh

# Check logs to see which registry was used
kubectl logs -n kube-system -l component=kubelet
```

## Option 2: Kubernetes-Level Image Rewriting

**Pros:**
- No node configuration required
- Works with any CRI (containerd, CRI-O, Docker)
- Per-deployment control over fallback behavior

**Cons:**
- Requires changing deployment manifests
- More complex to maintain multiple image references

### Implementation

Update deployments to use full registry paths:

```yaml
# Option 2a: Primary/fallback image approach
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ushadow-backend
spec:
  template:
    spec:
      containers:
        - name: backend
          # Try local first with IfNotPresent
          image: anubis:32000/ushadow-backend:latest
          imagePullPolicy: IfNotPresent

        # Fallback init container to pull from GHCR if local fails
        initContainers:
          - name: image-puller
            image: ghcr.io/your-org/ushadow-backend:latest
            imagePullPolicy: Always
            command: ["/bin/sh", "-c", "echo 'Image pulled from GHCR'"]
```

### Option 2b: Change to Remote Registry with Always Policy

```yaml
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
        - name: backend
          # Pull from GHCR with Always policy
          image: ghcr.io/your-org/ushadow-backend:latest
          imagePullPolicy: Always
```

This always checks remote registry, pulling if local cache is outdated.

## Option 3: Pull-Through Cache (Advanced)

Configure your local registry as a **pull-through cache** that automatically fetches from upstream registries.

### Docker Registry as Pull-Through Cache

```bash
# On anubis (registry host), configure registry as proxy
cat > /etc/docker/registry/config.yml <<EOF
version: 0.1
storage:
  filesystem:
    rootdirectory: /var/lib/registry
http:
  addr: :32000
proxy:
  remoteurl: https://registry-1.docker.io
  username: your-dockerhub-user  # Optional
  password: your-dockerhub-pass  # Optional
EOF

# Restart registry
docker restart registry
```

For GHCR, you'd need separate registry instances or use a more advanced registry like Harbor.

## Comparison

| Feature | Containerd Mirrors | Image Rewriting | Pull-Through Cache |
|---------|-------------------|-----------------|-------------------|
| **Setup Complexity** | Medium | Low | High |
| **Node Changes** | Yes (all nodes) | No | Yes (registry host) |
| **Manifest Changes** | No | Yes | No |
| **Fallback Order** | Configurable | Fixed | Single upstream |
| **Caching** | Yes | No | Yes |
| **Multi-registry** | Yes | Yes | Limited |

## Recommended Approach

**For your setup (local dev/test cluster):**

1. **Use Containerd Mirrors** (Option 1) for transparent fallback
2. Keep `imagePullPolicy: IfNotPresent` for local builds
3. Add authentication for GHCR/Docker Hub to avoid rate limits

**For production:**
1. Use explicit image references with full registry paths
2. Set `imagePullPolicy: Always` for external images
3. Set `imagePullPolicy: IfNotPresent` for internal builds

## Authentication for Remote Registries

### Docker Hub (avoid rate limits)

```bash
# Create Docker Hub secret
kubectl create secret docker-registry dockerhub-creds \
  --docker-server=registry-1.docker.io \
  --docker-username=your-user \
  --docker-password=your-token \
  -n ushadow

# Add to deployment
spec:
  template:
    spec:
      imagePullSecrets:
        - name: dockerhub-creds
```

### GitHub Container Registry (GHCR)

```bash
# Create GHCR secret (use GitHub PAT)
kubectl create secret docker-registry ghcr-creds \
  --docker-server=ghcr.io \
  --docker-username=your-github-user \
  --docker-password=ghp_yourPersonalAccessToken \
  -n ushadow

# Add to deployment
spec:
  template:
    spec:
      imagePullSecrets:
        - name: ghcr-creds
```

## Troubleshooting

### Image Pull Fails with "not found"

```bash
# Check which registry was tried
kubectl describe pod <pod-name> -n ushadow

# Check containerd logs
sudo journalctl -u containerd -f

# Manual pull test
sudo crictl pull anubis:32000/library/alpine:latest
```

### Containerd not using fallback

```bash
# Verify config loaded
sudo crictl info | jq '.config.registry'

# Check registry mirrors
sudo cat /etc/containerd/config.toml | grep -A 10 mirrors

# Restart containerd
sudo systemctl restart containerd
```

### Authentication issues

```bash
# Test authentication
docker login ghcr.io
docker login registry-1.docker.io

# Verify secret exists
kubectl get secret dockerhub-creds -n ushadow -o yaml

# Check secret is mounted
kubectl get pod <pod> -n ushadow -o yaml | grep imagePullSecrets
```

## Next Steps

1. **Choose approach**: Containerd mirrors (recommended) or manifest changes
2. **Add authentication**: Create secrets for GHCR/Docker Hub
3. **Test fallback**: Delete local image and verify pull from remote
4. **Monitor**: Check pull times and registry hit rates

## See Also

- `k8s/scripts/air-gap/setup-registry-fallback.sh` - Containerd mirror setup
- `k8s/scripts/air-gap/setup-dockerhub-auth.sh` - Docker Hub auth
- `k8s/scripts/air-gap/pull-and-push-images.sh` - Populate local registry
- [Containerd Registry Host Docs](https://github.com/containerd/containerd/blob/main/docs/hosts.md)
