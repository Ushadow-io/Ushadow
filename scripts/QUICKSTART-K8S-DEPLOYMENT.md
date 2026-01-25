# Quickstart: Deploy Ushadow to Kubernetes

This guide walks you through deploying ushadow to Kubernetes using **PVC for config storage**.

## Prerequisites

✅ Kubernetes cluster running (MicroK8s, kind, minikube, etc.)
✅ `kubectl` configured to access your cluster
✅ Infrastructure services running in K8s:
   - MongoDB at `mongodb.root.svc.cluster.local:27017`
   - Redis at `redis.root.svc.cluster.local:6379`

## Step-by-Step Deployment

### 1. Build Docker Images from Source

```bash
# Build images locally
./scripts/build-ushadow-images.sh

# Or build and push to registry
REGISTRY=ghcr.io/yourorg PUSH=true ./scripts/build-ushadow-images.sh
```

**For local clusters (kind/minikube):**
```bash
# Build locally
docker build -t ushadow/backend:latest -f ushadow/backend/Dockerfile ushadow/backend
docker build -t ushadow/frontend:latest -f ushadow/frontend/Dockerfile ushadow/frontend

# Load into kind
kind load docker-image ushadow/backend:latest
kind load docker-image ushadow/frontend:latest

# Or load into minikube
minikube image load ushadow/backend:latest
minikube image load ushadow/frontend:latest
```

### 2. Generate K8s Manifests

```bash
# Generate manifests with PVC for config
./scripts/generate-ushadow-k8s-manifests.sh

# Output will be in k8s/ushadow/
ls -la k8s/ushadow/
```

### 3. Create Namespace and PVC

```bash
kubectl apply -f k8s/ushadow/00-namespace.yaml
kubectl apply -f k8s/ushadow/10-config-pvc.yaml
```

Verify PVC is created and bound:
```bash
kubectl get pvc -n ushadow
# Should show: ushadow-config   Bound   ...
```

### 4. Initialize Config PVC

Create a ConfigMap with your local config files:

```bash
kubectl create configmap ushadow-initial-config \
  --from-file=config/config.yml \
  --from-file=config/capabilities.yaml \
  --from-file=config/feature_flags.yaml \
  --from-file=config/wiring.yaml \
  --from-file=config/defaults.yml \
  -n ushadow
```

Run the init job to copy files to PVC:
```bash
kubectl create -f k8s/ushadow/12-init-config-job.yaml
```

Watch the job complete:
```bash
kubectl wait --for=condition=complete job/ushadow-init-config -n ushadow --timeout=60s
kubectl logs job/ushadow-init-config -n ushadow
```

You should see:
```
Copying config files to PVC...
Creating subdirectories...
Setting permissions...
Config PVC initialized successfully!
```

### 5. Create Secrets

Edit the secret file to add your AUTH_SECRET_KEY:
```bash
vim k8s/ushadow/15-secret.yaml
```

Or generate a new secret:
```bash
kubectl create secret generic ushadow-secrets \
  --from-literal=AUTH_SECRET_KEY=$(openssl rand -hex 32) \
  -n ushadow
```

### 6. Deploy Backend and Frontend

```bash
kubectl apply -f k8s/ushadow/20-backend-deployment.yaml
kubectl apply -f k8s/ushadow/25-backend-service.yaml
kubectl apply -f k8s/ushadow/30-frontend-deployment.yaml
kubectl apply -f k8s/ushadow/35-frontend-service.yaml
```

Watch pods start:
```bash
kubectl get pods -n ushadow -w
```

Wait for:
```
ushadow-backend-xxx   1/1   Running
ushadow-frontend-xxx  1/1   Running
```

### 7. Verify Deployment

Check backend logs:
```bash
kubectl logs -n ushadow -l app.kubernetes.io/name=ushadow-backend -f
```

You should see:
```
INFO: Started server process
INFO: Uvicorn running on http://0.0.0.0:8000
```

Check health:
```bash
kubectl exec -n ushadow deployment/ushadow-backend -- curl -s localhost:8000/health
# Should return: {"status":"healthy"}
```

### 8. Access Ushadow

**Via port-forward (quick access):**
```bash
# Backend API
kubectl port-forward -n ushadow svc/ushadow-backend 8000:8000

# Frontend UI (in another terminal)
kubectl port-forward -n ushadow svc/ushadow-frontend 3000:80
```

Access:
- Backend API: http://localhost:8000
- Frontend UI: http://localhost:3000
- Swagger docs: http://localhost:8000/docs

**Via Ingress (production):**
Uncomment and configure `k8s/ushadow/40-ingress.yaml`, then:
```bash
kubectl apply -f k8s/ushadow/40-ingress.yaml
```

## Verify Config PVC is Working

Check that ushadow can read/write to config:

```bash
# Check config directory contents
kubectl exec -n ushadow deployment/ushadow-backend -- ls -la /config

# Write a test file
kubectl exec -n ushadow deployment/ushadow-backend -- sh -c "echo test > /config/test.txt"

# Read it back
kubectl exec -n ushadow deployment/ushadow-backend -- cat /config/test.txt

# Restart pod - file should persist
kubectl rollout restart deployment/ushadow-backend -n ushadow
kubectl wait --for=condition=available deployment/ushadow-backend -n ushadow
kubectl exec -n ushadow deployment/ushadow-backend -- cat /config/test.txt
# Should still show "test"
```

## Add Your First Kubernetes Cluster

Now that ushadow is running in K8s, add the cluster to itself!

```bash
# Get your kubeconfig
cat ~/.kube/config | base64

# Via API (replace <base64> with output above)
curl -X POST http://localhost:8000/api/kubernetes/clusters \
  -H "Content-Type: application/json" \
  -d '{
    "kubeconfig": "<base64>",
    "context": "your-context-name",
    "name": "Self (ushadow cluster)"
  }'
```

Or via the UI:
1. Open http://localhost:3000
2. Go to Settings → Kubernetes
3. Click "Add Cluster"
4. Upload your kubeconfig

## Deploy Other Services via Ushadow

Now you can use the deployed ushadow to deploy other services:

```bash
# Deploy Chronicle
curl -X POST http://localhost:8000/api/instances \
  -H "Content-Type: application/json" \
  -d '{
    "template_id": "chronicle-compose:chronicle-backend",
    "name": "chronicle-k8s",
    "deployment_target": "k8s://CLUSTER_ID/chronicle",
    "config": {
      "OPENAI_API_KEY": "your-key"
    }
  }'
```

## Updating Config Files

When you need to update config files:

```bash
# Method 1: Edit directly in PVC
kubectl exec -it -n ushadow deployment/ushadow-backend -- vi /config/config.yml

# Method 2: Copy from local machine
kubectl cp config/config.yml ushadow/ushadow-backend-xxx:/config/config.yml

# Method 3: Update ConfigMap and re-run init job
kubectl create configmap ushadow-initial-config \
  --from-file=config/config.yml \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl delete job ushadow-init-config -n ushadow
kubectl create -f k8s/ushadow/12-init-config-job.yaml

# Restart backend to pick up changes
kubectl rollout restart deployment/ushadow-backend -n ushadow
```

## Troubleshooting

### Backend pod not starting

```bash
kubectl describe pod -n ushadow -l app.kubernetes.io/name=ushadow-backend
kubectl logs -n ushadow -l app.kubernetes.io/name=ushadow-backend
```

Common issues:
- Missing secret (AUTH_SECRET_KEY)
- Can't connect to MongoDB/Redis
- Image pull failures
- Config PVC not mounted

### Can't connect to MongoDB/Redis

Test connectivity:
```bash
kubectl run -it --rm debug --image=busybox -n ushadow -- sh
nslookup mongodb.root.svc.cluster.local
nslookup redis.root.svc.cluster.local
```

### Config PVC empty or not persisting

Check PVC status:
```bash
kubectl get pvc -n ushadow ushadow-config
kubectl describe pvc -n ushadow ushadow-config
```

Check if init job ran:
```bash
kubectl get jobs -n ushadow
kubectl logs job/ushadow-init-config -n ushadow
```

Re-run init job if needed:
```bash
kubectl delete job ushadow-init-config -n ushadow
kubectl create -f k8s/ushadow/12-init-config-job.yaml
```

### Image not found (local builds)

If using local images with kind/minikube, ensure:
1. Images are built locally
2. Images are loaded into cluster
3. `imagePullPolicy: Never` or `imagePullPolicy: IfNotPresent` in deployment

Edit deployment:
```bash
kubectl edit deployment ushadow-backend -n ushadow
# Change: imagePullPolicy: Always → imagePullPolicy: IfNotPresent
```

## Clean Up

Remove everything:
```bash
kubectl delete namespace ushadow
```

This deletes:
- All pods, deployments, services
- Secrets
- ConfigMaps
- PVC (config data will be deleted!)

To preserve config data, backup PVC first:
```bash
# Create a pod to access PVC
kubectl run backup --image=busybox -n ushadow \
  --overrides='{"spec":{"containers":[{"name":"backup","image":"busybox","command":["sleep","3600"],"volumeMounts":[{"name":"config","mountPath":"/config"}]}],"volumes":[{"name":"config","persistentVolumeClaim":{"claimName":"ushadow-config"}}]}}'

# Copy config out
kubectl exec -n ushadow backup -- tar czf /tmp/config-backup.tar.gz -C /config .
kubectl cp ushadow/backup:/tmp/config-backup.tar.gz ./config-backup.tar.gz

# Delete namespace
kubectl delete namespace ushadow
```

## Next Steps

- Configure Ingress for external access
- Set up monitoring (Prometheus/Grafana)
- Configure backups for config PVC
- Deploy Chronicle, OpenMemory, and other services
- Set up Tailscale for secure remote access
