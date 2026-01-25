# Ushadow Kubernetes Deployment - Summary

Created comprehensive deployment infrastructure for deploying ushadow itself to Kubernetes.

## Git Sync Sidecar - Explained

A **git sync sidecar** is a pattern where you run a second container alongside your main app that continuously pulls config from a git repository:

```
┌─────────────────────────────────────┐
│ Pod                                 │
│                                     │
│  ┌──────────────┐  ┌─────────────┐ │
│  │  Your App    │  │  git-sync   │ │
│  │              │  │  sidecar    │ │
│  │  reads       │  │  pulls from │ │
│  │  /config ────┼──┼─ git repo   │ │
│  │              │  │  every 30s  │ │
│  └──────────────┘  └─────────────┘ │
│         │                 │         │
│         └────── shared ───┘         │
│              volume (emptyDir)      │
└─────────────────────────────────────┘
```

**Pros:**
- ✅ Config in version control (audit trail via git commits)
- ✅ Automatic updates (pods get new config without redeployment)
- ✅ Easy rollback (git revert)
- ✅ Multiple replicas stay in sync

**Cons:**
- ❌ Read-only (apps can't write to config)
- ❌ Requires git repo setup
- ❌ Extra container overhead
- ❌ Can't store secrets (unless encrypted in git)

**Example use case:** Nginx configs, application settings, feature flags that are managed via git

**Why it doesn't work for ushadow:**
- Ushadow **writes** to `/config/kubeconfigs/` when you add clusters
- Ushadow **writes** to `/config/service_configs.yaml` with instance state
- Ushadow needs read-write access, not read-only

**Solution for ushadow:** Use PVC (PersistentVolumeClaim) with read-write access

---

## Created Files

### Service Definition
**`compose/ushadow-compose.yaml`**
- Defines ushadow as a deployable service (like Chronicle)
- Build from source by default
- Can be deployed via ushadow's own API
- Uses PVC for config directory

### Deployment Scripts

**`scripts/build-ushadow-images.sh`**
- Builds Docker images from source
- Backend: `ushadow/backend/Dockerfile`
- Frontend: `ushadow/frontend/Dockerfile`
- Optionally pushes to registry

**`scripts/deploy-ushadow-to-k8s.sh`**
- Uses ushadow API to deploy itself (meta!)
- Interactive cluster selection
- Most elegant option

**`scripts/generate-ushadow-k8s-manifests.sh`**
- Generates raw K8s YAML manifests
- Uses PVC for config storage
- Includes init job to populate PVC
- No dependencies except kubectl

### Documentation

**`DEPLOY_USHADOW_TO_K8S.md`**
- Complete deployment guide
- Three deployment options
- Configuration notes
- Troubleshooting

**`scripts/QUICKSTART-K8S-DEPLOYMENT.md`**
- Step-by-step quickstart guide
- PVC-based approach
- Build from source
- Detailed verification steps

**`K8S_DEPLOYMENT_SUMMARY.md`** (this file)
- Overview of all files created
- Git sync sidecar explanation
- Deployment approaches

---

## Deployment Approaches

### Option 1: Ushadow Deploys Itself 🚀

**Most elegant** - Use running local ushadow to deploy itself to K8s!

```bash
# 1. Start local ushadow
cd ushadow/backend && uv run python src/main.py

# 2. Deploy
./scripts/deploy-ushadow-to-k8s.sh
```

**How it works:**
1. Local ushadow reads `compose/ushadow-compose.yaml`
2. Compiles to K8s manifests via `kubernetes_manager.py`
3. Applies to your cluster
4. Ushadow now running in K8s!

**Pros:**
- ✅ Uses ushadow's own deployment system
- ✅ Automatic manifest generation
- ✅ Consistent with other services
- ✅ Meta and elegant!

**Cons:**
- ❌ Requires local ushadow running first
- ❌ Cluster must be configured in ushadow

### Option 2: Generate Manifests, Apply Manually

**Script-based** - Generate K8s YAML and apply with kubectl

```bash
# 1. Build images
./scripts/build-ushadow-images.sh

# 2. Generate manifests
./scripts/generate-ushadow-k8s-manifests.sh

# 3. Initialize config PVC
kubectl create configmap ushadow-initial-config \
  --from-file=config/ -n ushadow
kubectl apply -f k8s/ushadow/12-init-config-job.yaml

# 4. Deploy
kubectl apply -f k8s/ushadow/
```

**Pros:**
- ✅ No local ushadow needed
- ✅ Full control over manifests
- ✅ Good for CI/CD
- ✅ Easy to version control

**Cons:**
- ❌ More manual steps
- ❌ Must edit manifests for customization

### Option 3: Helm Chart (Future)

Not yet implemented. Would look like:

```bash
helm install ushadow ./charts/ushadow \
  --namespace ushadow \
  --set backend.image.tag=v1.0.0
```

---

## Key Design Decisions

### 1. PVC for Config (Not ConfigMap)

**Why?** Ushadow writes to config at runtime:
- Saves encrypted kubeconfig files when adding clusters
- Updates `service_configs.yaml` with instance state
- Modifies wiring configuration

**Implementation:**
- 1Gi PVC mounted at `/config`
- Init job copies initial config from ConfigMap to PVC
- Backend has read-write access

### 2. Build from Source (Default)

**Why?** Development flexibility:
- Easy to test changes
- No registry dependency
- Can load images into local clusters (kind/minikube)

**Alternative:** Pre-built images from ghcr.io (for production)

### 3. DNS Configuration

Applied the IPv6 DNS fix to all deployments:

```yaml
dnsPolicy: ClusterFirst
dnsConfig:
  options:
    - name: ndots
      value: "1"
```

**Why?** Ensures uv/Rust-based tools work correctly (see `docs/IPV6_DNS_FIX.md`)

### 4. No Docker Socket in K8s

**Local development:** Mounts `/var/run/docker.sock` for Docker Compose management

**Kubernetes:** Uses kubectl/K8s API for deployments

**Implementation:** Backend auto-detects environment and chooses appropriate deployment method

---

## Generated K8s Manifests

When you run `./scripts/generate-ushadow-k8s-manifests.sh`:

```
k8s/ushadow/
├── 00-namespace.yaml          # Namespace: ushadow
├── 10-config-pvc.yaml         # PVC for config (1Gi, ReadWriteOnce)
├── 12-init-config-job.yaml    # Job to initialize PVC
├── 15-secret.yaml             # Secrets (AUTH_SECRET_KEY)
├── 20-backend-deployment.yaml # Backend deployment
├── 25-backend-service.yaml    # Backend ClusterIP service
├── 30-frontend-deployment.yaml# Frontend deployment
├── 35-frontend-service.yaml   # Frontend ClusterIP service
└── 40-ingress.yaml            # Ingress (optional, commented)
```

### Init Job Workflow

```
1. Create ConfigMap from local files
   kubectl create configmap ushadow-initial-config --from-file=config/

2. Job runs busybox container
   - Mounts PVC at /config
   - Mounts ConfigMap at /init-config
   - Copies files: cp /init-config/* /config/
   - Creates directories: kubeconfigs/, SECRETS/, providers/
   - Sets permissions

3. Backend starts
   - Mounts PVC at /config
   - Has read-write access
   - Can add clusters, save state
```

---

## Infrastructure Requirements

Before deploying ushadow:

### Required Services in K8s

| Service | Default URL | Purpose |
|---------|-------------|---------|
| MongoDB | `mongodb://mongodb.root.svc.cluster.local:27017` | Database |
| Redis | `redis://redis.root.svc.cluster.local:6379/0` | Cache |

### Storage

- **StorageClass**: Default storageClass in your cluster
- **PVC Size**: 1Gi (adjustable in manifests)
- **Access Mode**: ReadWriteOnce (single node)

For multi-node deployments, consider:
- ReadWriteMany PVC (if supported by storage provider)
- Or run single replica with pod affinity

---

## Next Steps

After deployment:

1. **Access the UI**
   ```bash
   kubectl port-forward -n ushadow svc/ushadow-frontend 3000:80
   # Open http://localhost:3000
   ```

2. **Add K8s Clusters**
   - Via UI: Settings → Kubernetes → Add Cluster
   - Add the same cluster ushadow is running in!

3. **Deploy Other Services**
   - Chronicle
   - OpenMemory
   - Custom services

4. **Configure Ingress** (for production)
   - Edit `k8s/ushadow/40-ingress.yaml`
   - Set your domain
   - Apply: `kubectl apply -f k8s/ushadow/40-ingress.yaml`

5. **Set up Backups**
   - Backup config PVC regularly
   - Consider VolumeSnapshots
   - Export kubeconfigs to secure storage

---

## Troubleshooting

### PVC not binding

```bash
kubectl describe pvc -n ushadow ushadow-config
```

Check:
- StorageClass exists and is available
- Sufficient storage in cluster
- PV provisioner is running

### Init job fails

```bash
kubectl logs job/ushadow-init-config -n ushadow
```

Common issues:
- ConfigMap `ushadow-initial-config` doesn't exist
- PVC not mounted
- Permissions issues

### Backend can't write to config

```bash
kubectl exec -n ushadow deployment/ushadow-backend -- \
  sh -c "touch /config/test && ls -la /config/test"
```

If fails:
- PVC might be mounted read-only
- Check deployment volume mount settings
- Verify PVC accessMode is ReadWriteOnce

### Can't connect to MongoDB/Redis

```bash
kubectl run -it --rm debug --image=busybox -n ushadow -- \
  nslookup mongodb.root.svc.cluster.local
```

If DNS fails:
- Services in different namespace
- Update MONGODB_URI/REDIS_URL environment variables
- Check CoreDNS is running

---

## Contributing

To improve these deployment scripts:

1. Add Helm chart (Option 3)
2. Support for different storage providers (NFS, Ceph, etc.)
3. Better secrets management (external-secrets, sealed-secrets)
4. GitOps integration (ArgoCD, Flux)
5. Monitoring setup (Prometheus, Grafana)
6. Backup automation

---

## Summary

You now have three ways to deploy ushadow to Kubernetes:

1. **Meta deployment**: Ushadow deploys itself via its API
2. **Manual deployment**: Generate manifests and apply
3. **Helm (future)**: One command deployment

Key features:
- ✅ Build from source
- ✅ PVC for read-write config storage
- ✅ Init job to populate config
- ✅ IPv6 DNS fix applied
- ✅ Ready for production with Ingress
- ✅ Comprehensive troubleshooting docs

The deployed ushadow can then manage other services in the cluster, including itself!
