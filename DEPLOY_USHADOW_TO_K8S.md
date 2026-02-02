# Deploying Ushadow to Kubernetes

Three ways to deploy ushadow itself to Kubernetes, from most elegant to most manual.

## Prerequisites

- Kubernetes cluster configured and accessible
- Docker images built or access to container registry
- Infrastructure services (MongoDB, Redis) running in K8s

## Option 1: Ushadow Deploys Itself (Recommended) 🚀

**The meta approach**: Use your running local ushadow instance to deploy itself to Kubernetes!

### How It Works

1. Ushadow has a service definition: `compose/ushadow-compose.yaml`
2. Your local ushadow backend reads this definition
3. The backend compiles it to K8s manifests via `kubernetes_manager.py`
4. Manifests are applied to your cluster
5. Ushadow is now running in K8s!

### Steps

1. **Start local ushadow** (if not already running):
   ```bash
   cd ushadow/backend
   uv run python src/main.py
   ```

2. **Add your K8s cluster** (if not already configured):
   - Via UI: Settings → Kubernetes → Add Cluster
   - Or via API:
     ```bash
     cat ~/.kube/config | base64 | curl -X POST \
       -H "Content-Type: application/json" \
       -d '{"kubeconfig":"<base64>","context":"your-context","name":"My Cluster"}' \
       http://localhost:8000/api/kubernetes/clusters
     ```

3. **Run the deployment script**:
   ```bash
   ./scripts/deploy-ushadow-to-k8s.sh
   ```

   Or manually via API:
   ```bash
   curl -X POST http://localhost:8000/api/instances \
     -H "Content-Type: application/json" \
     -d '{
       "template_id": "ushadow-compose:ushadow-backend",
       "name": "ushadow-backend-k8s",
       "deployment_target": "k8s://CLUSTER_ID/ushadow",
       "config": {
         "REDIS_URL": "redis://redis.root.svc.cluster.local:6379/0",
         "MONGODB_URI": "mongodb://mongodb.root.svc.cluster.local:27017/ushadow",
         "AUTH_SECRET_KEY": "your-secret-key"
       }
     }'
   ```

4. **Verify deployment**:
   ```bash
   kubectl get pods -n ushadow
   kubectl logs -n ushadow -l app.kubernetes.io/name=ushadow-backend -f
   ```

5. **Access**:
   ```bash
   kubectl port-forward -n ushadow svc/ushadow-backend 8000:8000
   # Backend API: http://localhost:8000
   ```

### Advantages
✅ Uses ushadow's own deployment logic
✅ Automatically handles manifest generation
✅ Consistent with how other services are deployed
✅ Meta and elegant!

### Disadvantages
❌ Requires running local ushadow first (chicken-and-egg)
❌ Needs cluster already configured in ushadow

---

## Option 2: Generate Manifests, Deploy Manually

**The script approach**: Generate K8s YAML files and apply them manually.

### Steps

1. **Generate manifests**:
   ```bash
   ./scripts/generate-ushadow-k8s-manifests.sh
   ```

   This creates files in `k8s/ushadow/`:
   - `00-namespace.yaml` - Namespace
   - `10-configmap.yaml` - Configuration files
   - `15-secret.yaml` - Secrets (AUTH_SECRET_KEY, etc.)
   - `20-backend-deployment.yaml` - Backend deployment
   - `25-backend-service.yaml` - Backend service
   - `30-frontend-deployment.yaml` - Frontend deployment
   - `35-frontend-service.yaml` - Frontend service
   - `40-ingress.yaml` - Ingress (optional)

2. **Customize the manifests**:
   ```bash
   # Edit config
   vim k8s/ushadow/10-configmap.yaml

   # Edit secrets
   vim k8s/ushadow/15-secret.yaml
   ```

3. **Deploy**:
   ```bash
   kubectl apply -f k8s/ushadow/
   ```

   Or apply in order:
   ```bash
   kubectl apply -f k8s/ushadow/00-namespace.yaml
   kubectl apply -f k8s/ushadow/10-configmap.yaml
   kubectl apply -f k8s/ushadow/15-secret.yaml
   kubectl apply -f k8s/ushadow/20-backend-deployment.yaml
   kubectl apply -f k8s/ushadow/25-backend-service.yaml
   kubectl apply -f k8s/ushadow/30-frontend-deployment.yaml
   kubectl apply -f k8s/ushadow/35-frontend-service.yaml
   ```

4. **Verify**:
   ```bash
   kubectl get all -n ushadow
   ```

5. **Access**:
   ```bash
   kubectl port-forward -n ushadow svc/ushadow-backend 8000:8000
   kubectl port-forward -n ushadow svc/ushadow-frontend 3000:80
   ```

### Advantages
✅ No dependencies - just kubectl
✅ Full control over manifests
✅ Easy to version control
✅ No running instance needed

### Disadvantages
❌ Manual manifest editing required
❌ More steps
❌ Doesn't use ushadow's deployment system

---

## Option 3: Helm Chart (Future)

A Helm chart would be ideal for production deployments:

```bash
helm install ushadow ./charts/ushadow \
  --namespace ushadow \
  --create-namespace \
  --set backend.image.tag=v1.0.0 \
  --set secrets.authSecretKey=your-secret
```

**Status**: Not yet implemented. Contributions welcome!

---

## Configuration Notes

### Infrastructure Dependencies

Ushadow expects these services in the cluster:

| Service | Default URL | Purpose |
|---------|-------------|---------|
| MongoDB | `mongodb://mongodb.root.svc.cluster.local:27017` | Database |
| Redis | `redis://redis.root.svc.cluster.local:6379/0` | Cache |

Adjust the `MONGODB_URI` and `REDIS_URL` environment variables if your services are in different namespaces or have different names.

### Volumes and Config Files

Ushadow needs access to config files:
- `config/config.yml` - LLM/provider registry
- `config/capabilities.yaml` - Capability definitions
- `config/feature_flags.yaml` - Feature toggles
- `config/wiring.yaml` - Service wiring
- `config/kubeconfigs/` - Encrypted kubeconfig files for cluster management
- `config/service_configs.yaml` - Instance state (written by ushadow)
- `compose/*.yaml` - Service templates

**Why PVC is Required:**

Ushadow **writes** to the config directory at runtime:
- Saves kubeconfig files when you add clusters
- Updates `service_configs.yaml` with instance state
- Stores wiring configuration changes

**Options**:
1. ❌ **ConfigMap** - Read-only, won't work (ushadow needs write access)
2. ✅ **PVC** - Read-write persistent storage (RECOMMENDED)
3. ❌ **Git Sync Sidecar** - Read-only from git, won't work for ushadow

**Git Sync Sidecar Explained:**

A git sync sidecar is an additional container that runs alongside your main container and continuously pulls from a git repository:

```yaml
containers:
- name: app
  volumeMounts:
  - name: config
    mountPath: /config
- name: git-sync  # Sidecar
  image: k8s.gcr.io/git-sync/git-sync:v4.2.1
  env:
  - name: GITSYNC_REPO
    value: "https://github.com/your/config-repo"
  volumeMounts:
  - name: config
    mountPath: /config
```

**Pros:** Config in version control, automatic updates, audit trail
**Cons:** Read-only, requires git repo, extra container overhead

**For ushadow:** Not suitable because ushadow needs write access to store runtime data (kubeconfigs, instance state)

### Docker Socket Access

**Important**: The K8s deployment does NOT mount `/var/run/docker.sock`.

- Local Docker Compose deployments are managed via `docker-compose` commands
- K8s deployments are managed via `kubectl` and the Kubernetes API
- The backend automatically detects the deployment environment

### DNS Configuration

The generated manifests include the IPv6 DNS fix:

```yaml
dnsPolicy: ClusterFirst
dnsConfig:
  options:
    - name: ndots
      value: "1"
```

This ensures uv/Rust-based tools work correctly. See `docs/IPV6_DNS_FIX.md` for details.

---

## Troubleshooting

### Pods not starting

```bash
kubectl describe pod -n ushadow -l app.kubernetes.io/name=ushadow-backend
kubectl logs -n ushadow -l app.kubernetes.io/name=ushadow-backend
```

Common issues:
- Missing secrets (AUTH_SECRET_KEY)
- Can't connect to MongoDB/Redis
- Image pull failures

### Can't access MongoDB/Redis

Verify services are running:
```bash
kubectl get svc -n root mongodb redis
```

Test connectivity from a pod:
```bash
kubectl run -it --rm debug --image=busybox --restart=Never -- sh
nslookup mongodb.root.svc.cluster.local
nslookup redis.root.svc.cluster.local
```

### Health check failing

```bash
kubectl exec -n ushadow deployment/ushadow-backend -- curl localhost:8000/health
```

Check logs for startup errors:
```bash
kubectl logs -n ushadow -l app.kubernetes.io/name=ushadow-backend --tail=100
```

---

## Next Steps

Once deployed:

1. **Access the UI**: Port-forward or configure Ingress
2. **Add more K8s clusters**: Via the deployed ushadow instance!
3. **Deploy other services**: Chronicle, OpenMemory, etc.
4. **Configure Tailscale**: For secure remote access

The deployed ushadow can now manage itself and other services in the cluster!
