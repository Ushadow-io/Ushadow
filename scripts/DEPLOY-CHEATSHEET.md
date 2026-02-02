# Ushadow K8s Deployment - Quick Reference

## 🚀 Option 1: Ushadow Deploys Itself (Recommended)

```bash
# Prerequisites: Local ushadow running
cd ushadow/backend && uv run python src/main.py

# Deploy
./scripts/deploy-ushadow-to-k8s.sh

# Verify
kubectl get pods -n ushadow
```

---

## 🔧 Option 2: Manual Deployment (Most Control)

### Build Images from Source

```bash
# For local clusters (kind/minikube)
docker build -t ushadow/backend:latest -f ushadow/backend/Dockerfile ushadow/backend
docker build -t ushadow/frontend:latest -f ushadow/frontend/Dockerfile ushadow/frontend

# Load into kind
kind load docker-image ushadow/backend:latest ushadow/frontend:latest

# OR build and push to registry
REGISTRY=ghcr.io/yourorg PUSH=true ./scripts/build-ushadow-images.sh
```

### Generate and Deploy

```bash
# Generate manifests
./scripts/generate-ushadow-k8s-manifests.sh

# Create namespace and PVC
kubectl apply -f k8s/ushadow/00-namespace.yaml
kubectl apply -f k8s/ushadow/10-config-pvc.yaml

# Initialize config
kubectl create configmap ushadow-initial-config \
  --from-file=config/config.yml \
  --from-file=config/capabilities.yaml \
  --from-file=config/feature_flags.yaml \
  --from-file=config/wiring.yaml \
  --from-file=config/defaults.yml \
  -n ushadow

kubectl create -f k8s/ushadow/12-init-config-job.yaml
kubectl wait --for=condition=complete job/ushadow-init-config -n ushadow

# Create secrets
kubectl create secret generic ushadow-secrets \
  --from-literal=AUTH_SECRET_KEY=$(openssl rand -hex 32) \
  -n ushadow

# Deploy
kubectl apply -f k8s/ushadow/20-backend-deployment.yaml
kubectl apply -f k8s/ushadow/25-backend-service.yaml
kubectl apply -f k8s/ushadow/30-frontend-deployment.yaml
kubectl apply -f k8s/ushadow/35-frontend-service.yaml

# Access
kubectl port-forward -n ushadow svc/ushadow-backend 8000:8000
kubectl port-forward -n ushadow svc/ushadow-frontend 3000:80
```

---

## 🔍 Verification Commands

```bash
# Check all resources
kubectl get all -n ushadow

# Check PVC
kubectl get pvc -n ushadow

# View backend logs
kubectl logs -n ushadow -l app.kubernetes.io/name=ushadow-backend -f

# View frontend logs
kubectl logs -n ushadow -l app.kubernetes.io/name=ushadow-frontend -f

# Check init job
kubectl logs job/ushadow-init-config -n ushadow

# Check config PVC contents
kubectl exec -n ushadow deployment/ushadow-backend -- ls -la /config

# Test health endpoint
kubectl exec -n ushadow deployment/ushadow-backend -- curl -s localhost:8000/health
```

---

## 🐛 Troubleshooting

### Pod not starting
```bash
kubectl describe pod -n ushadow -l app.kubernetes.io/name=ushadow-backend
kubectl logs -n ushadow -l app.kubernetes.io/name=ushadow-backend
```

### Can't connect to MongoDB/Redis
```bash
kubectl run -it --rm debug --image=busybox -n ushadow -- sh
nslookup mongodb.root.svc.cluster.local
nslookup redis.root.svc.cluster.local
```

### PVC not binding
```bash
kubectl describe pvc -n ushadow ushadow-config
kubectl get storageclass
```

### Config files missing
```bash
# Re-run init job
kubectl delete job ushadow-init-config -n ushadow
kubectl create -f k8s/ushadow/12-init-config-job.yaml
kubectl wait --for=condition=complete job/ushadow-init-config -n ushadow
```

### Image pull failures (local builds)
```bash
# For kind
kind load docker-image ushadow/backend:latest
kind load docker-image ushadow/frontend:latest

# For minikube
minikube image load ushadow/backend:latest
minikube image load ushadow/frontend:latest

# Then set imagePullPolicy
kubectl edit deployment ushadow-backend -n ushadow
# Change: imagePullPolicy: Always → IfNotPresent
```

---

## 🧹 Cleanup

```bash
# Delete everything
kubectl delete namespace ushadow

# Backup config first (optional)
kubectl run backup --image=busybox -n ushadow \
  --overrides='{"spec":{"containers":[{"name":"backup","image":"busybox","command":["sleep","3600"],"volumeMounts":[{"name":"config","mountPath":"/config"}]}],"volumes":[{"name":"config","persistentVolumeClaim":{"claimName":"ushadow-config"}}]}}'

kubectl exec -n ushadow backup -- tar czf /tmp/backup.tar.gz -C /config .
kubectl cp ushadow/backup:/tmp/backup.tar.gz ./config-backup.tar.gz
```

---

## 📦 Update Config Files

### Method 1: Direct edit
```bash
kubectl exec -it -n ushadow deployment/ushadow-backend -- vi /config/config.yml
kubectl rollout restart deployment/ushadow-backend -n ushadow
```

### Method 2: Copy from local
```bash
POD=$(kubectl get pod -n ushadow -l app.kubernetes.io/name=ushadow-backend -o jsonpath='{.items[0].metadata.name}')
kubectl cp config/config.yml ushadow/$POD:/config/config.yml
kubectl rollout restart deployment/ushadow-backend -n ushadow
```

### Method 3: Re-run init job
```bash
kubectl create configmap ushadow-initial-config \
  --from-file=config/ \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl delete job ushadow-init-config -n ushadow
kubectl create -f k8s/ushadow/12-init-config-job.yaml
kubectl rollout restart deployment/ushadow-backend -n ushadow
```

---

## 🎯 Quick Access

```bash
# Backend API
kubectl port-forward -n ushadow svc/ushadow-backend 8000:8000
# → http://localhost:8000
# → http://localhost:8000/docs (Swagger)

# Frontend UI
kubectl port-forward -n ushadow svc/ushadow-frontend 3000:80
# → http://localhost:3000

# Direct pod access
kubectl exec -it -n ushadow deployment/ushadow-backend -- bash
```

---

## 📝 Environment Variables Reference

### Backend
```bash
HOST=0.0.0.0
PORT=8000
CONFIG_DIR=/config
REDIS_URL=redis://redis.root.svc.cluster.local:6379/0
MONGODB_URI=mongodb://mongodb.root.svc.cluster.local:27017/ushadow
MONGODB_DATABASE=ushadow
AUTH_SECRET_KEY=<secret>
CORS_ORIGINS=http://ushadow-frontend.ushadow.svc.cluster.local
```

### Frontend
```bash
VITE_BACKEND_URL=http://ushadow-backend.ushadow.svc.cluster.local:8000
VITE_ENV_NAME=k8s
```

---

## 📚 Documentation

- **Full guide**: `DEPLOY_USHADOW_TO_K8S.md`
- **Quickstart**: `scripts/QUICKSTART-K8S-DEPLOYMENT.md`
- **Summary**: `K8S_DEPLOYMENT_SUMMARY.md`
- **This cheatsheet**: `scripts/DEPLOY-CHEATSHEET.md`
