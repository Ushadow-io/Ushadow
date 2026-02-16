# Compose Files ConfigMap

## Problem

When deploying ushadow-backend to Kubernetes, the compose files from the `compose/` directory are not available in the container. In Docker Compose, these are mounted via:

```yaml
volumes:
  - ../compose:/compose
```

But Kubernetes doesn't support direct host directory mounts. Instead, we use a **ConfigMap**.

## Solution

The compose files are **automatically** packaged into a Kubernetes ConfigMap and mounted into the backend pod at `/compose`.

### 🎉 Automatic Generation (Recommended)

When you deploy ushadow-backend through the ushadow UI, the ConfigMap is **automatically created/updated** before deployment. No manual steps required!

### Manual Generation (Alternative)

You can also manually generate the ConfigMap using the provided script (useful for custom deployments or CI/CD).

### Files

- **`compose-configmap.yaml`** - Generated ConfigMap containing all compose files
- **`scripts/generate-compose-configmap.sh`** - Script to regenerate the ConfigMap

### How It Works

1. The script reads all files from `compose/` directory
2. Creates a ConfigMap with each file as a data key
3. The backend deployment mounts this ConfigMap as a volume at `/compose`
4. Backend code reads compose files from `/compose` just like in Docker Compose

## Usage

### Automatic (via ushadow UI) - Recommended

1. Go to **Kubernetes Clusters** page in ushadow
2. Select your cluster
3. Click **Deploy** and select `ushadow-backend` service
4. The system will **automatically**:
   - Collect all files from the `compose/` directory
   - Create/update the `compose-files` ConfigMap
   - Deploy the backend with the ConfigMap mounted at `/compose`

**That's it!** No manual steps needed.

### Manual (for custom deployments)

If you're deploying outside the ushadow UI (e.g., via `kubectl` or CI/CD):

```bash
# Generate the ConfigMap
./k8s/scripts/generate-compose-configmap.sh

# Apply to your cluster
kubectl apply -f k8s/compose-configmap.yaml

# Apply the backend deployment
kubectl apply -k k8s/
```

### When Compose Files Change

**Automatic (via UI)**: Just redeploy ushadow-backend - the ConfigMap will be automatically updated.

**Manual**:
```bash
# Regenerate the ConfigMap
./k8s/scripts/generate-compose-configmap.sh

# Apply the changes
kubectl apply -f k8s/compose-configmap.yaml

# Restart backend pods to pick up changes
kubectl rollout restart deployment/backend -n ushadow
```

## Verification

Check that the ConfigMap was created:

```bash
kubectl get configmap compose-files -n ushadow
```

Check that files are mounted in the pod:

```bash
# List files in the compose directory
kubectl exec -n ushadow deployment/backend -- ls -la /compose

# Check a specific file
kubectl exec -n ushadow deployment/backend -- cat /compose/ushadow-compose.yaml
```

## Architecture

### Automatic Flow (ushadow UI)

```
User clicks "Deploy ushadow-backend"
         ↓
KubernetesManager.deploy_to_kubernetes()
         ↓
Detect "ushadow-backend" deployment
         ↓
_ensure_compose_configmap()
    ├─ Read compose/ directory
    ├─ Collect all .yaml/.yml/.md files
    ├─ Create/update ConfigMap
    └─ Apply to cluster
         ↓
Deploy backend with ConfigMap mounted
```

### Data Flow

```
compose/                          Kubernetes ConfigMap
├── agent-zero-compose.yaml   →   compose-files
├── chronicle-compose.yaml    →   ├── agent-zero-compose.yaml
├── docker-compose.infra.yml  →   ├── chronicle-compose.yaml
└── ...                       →   └── ...
                                         ↓
                              Backend Pod Volume Mount
                                   /compose/
                                   ├── agent-zero-compose.yaml
                                   ├── chronicle-compose.yaml
                                   └── ...
```

## Limitations

- **ConfigMap size limit**: 1MB maximum
  - Current size: ~50KB (well within limit)
  - If you exceed this, consider splitting into multiple ConfigMaps or using a different approach

- **Updates require pod restart**: Changes to the ConfigMap don't automatically propagate to running pods
  - You must restart pods after updating the ConfigMap
  - Consider using a webhook or automation for this

## Alternative Approaches (Not Used)

1. **Build into Docker image** - Would require rebuilding image for any compose file change
2. **PersistentVolume** - Overkill for static configuration files
3. **Individual ConfigMaps** - More complex to manage, no benefit over single ConfigMap
4. **Init Container with git clone** - Requires git repo access, more complex

## Troubleshooting

### Backend can't find compose files

```bash
# Check if ConfigMap exists
kubectl get configmap compose-files -n ushadow

# Check if it's mounted in the pod
kubectl describe pod -n ushadow -l io.kompose.service=backend | grep -A 10 "Mounts:"

# Check file contents
kubectl exec -n ushadow deployment/backend -- ls -la /compose
```

### ConfigMap too large

If you get "ConfigMap size exceeds 1MB":

1. Remove unnecessary files from `compose/` (old backups, large docs)
2. Split into multiple ConfigMaps
3. Consider building files into the Docker image instead

### Changes not taking effect

```bash
# Update ConfigMap
./k8s/scripts/generate-compose-configmap.sh
kubectl apply -f k8s/compose-configmap.yaml

# Force pod restart
kubectl rollout restart deployment/backend -n ushadow
kubectl rollout status deployment/backend -n ushadow
```
