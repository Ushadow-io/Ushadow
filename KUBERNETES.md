# Ushadow Kubernetes Deployment Guide

This guide covers deploying Ushadow to Kubernetes using automatically generated manifests from Docker Compose files.

## Overview

The deployment process uses **kompose** to convert your existing Docker Compose files into Kubernetes manifests, then applies production-ready tweaks for a robust deployment.

## Prerequisites

### Required Tools

1. **kubectl** - Kubernetes CLI
   ```bash
   # macOS
   brew install kubectl

   # Linux
   curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
   chmod +x kubectl
   sudo mv kubectl /usr/local/bin/

   # Windows
   choco install kubernetes-cli
   ```

2. **kompose** - Compose to Kubernetes converter
   ```bash
   # macOS
   brew install kompose

   # Linux
   curl -L https://github.com/kubernetes/kompose/releases/download/v1.34.0/kompose-linux-amd64 -o kompose
   chmod +x kompose
   sudo mv kompose /usr/local/bin/

   # Windows
   choco install kubernetes-kompose
   ```

3. **A Kubernetes Cluster** - One of:
   - Minikube (local development)
   - Docker Desktop with Kubernetes (local development)
   - Cloud provider (EKS, GKE, AKS)
   - On-premises cluster

### Verify Cluster Connection

```bash
kubectl cluster-info
kubectl get nodes
```

## Quick Start

### 1. Generate Kubernetes Manifests

Run the deployment script to convert Docker Compose files to Kubernetes manifests:

```bash
./deploy.sh
```

This will:
- ✅ Check for kompose and kubectl
- ✅ Convert infrastructure services (MongoDB, Redis, Qdrant, etc.)
- ✅ Convert application services (backend, frontend)
- ✅ Generate namespace, ConfigMaps, and Secret templates
- ✅ Create production-ready examples and guides
- ✅ Generate kustomization file

### 2. Review Generated Manifests

```bash
ls -la k8s/
```

Directory structure:
```
k8s/
├── namespace.yaml           # Namespace definition
├── configmap.yaml          # Configuration data
├── secret.yaml             # Secrets template (NEEDS EDITING)
├── kustomization.yaml      # Kustomize config
├── infra/                  # Infrastructure services
│   ├── mongo-*.yaml
│   ├── redis-*.yaml
│   ├── qdrant-*.yaml
│   └── postgres-*.yaml
├── base/                   # Application services
│   ├── backend-*.yaml
│   └── webui-*.yaml
└── tweaks/                 # Examples and guides
    ├── README.md
    ├── ingress-example.yaml
    └── mongo-statefulset-example.yaml
```

### 3. Update Secrets

**IMPORTANT:** Edit `k8s/secret.yaml` with your actual secrets:

```bash
# Edit the secret file
vim k8s/secret.yaml

# Or create from .env file
./scripts/k8s-helpers.sh create-secret
```

### 4. Deploy to Kubernetes

#### Option A: Deploy Everything with Kustomize (Recommended)

```bash
kubectl apply -k k8s/
```

#### Option B: Deploy Step-by-Step

```bash
# 1. Create namespace
kubectl apply -f k8s/namespace.yaml

# 2. Deploy infrastructure first
kubectl apply -f k8s/infra/

# 3. Wait for infrastructure to be ready
kubectl wait --for=condition=ready pod -l app=mongo -n ushadow --timeout=300s
kubectl wait --for=condition=ready pod -l app=redis -n ushadow --timeout=300s

# 4. Deploy application
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/base/

# 5. Check status
kubectl get all -n ushadow
```

#### Option C: Use Helper Script

```bash
# Deploy infrastructure
./scripts/k8s-helpers.sh deploy-infra

# Deploy application
./scripts/k8s-helpers.sh deploy-app

# Or deploy everything
./scripts/k8s-helpers.sh deploy-all
```

## Management Operations

### Get Status

```bash
# Get all resources
./scripts/k8s-helpers.sh status

# Or manually
kubectl get all -n ushadow
kubectl get pvc -n ushadow
```

### View Logs

```bash
# Using helper script
./scripts/k8s-helpers.sh logs backend
./scripts/k8s-helpers.sh logs webui

# Or manually
kubectl logs -n ushadow -l app=backend --tail=100 -f
kubectl logs -n ushadow -l app=webui --tail=100 -f
```

### Port Forwarding (Local Access)

```bash
# Forward backend API
./scripts/k8s-helpers.sh port-forward backend 8000:8000

# Forward frontend
./scripts/k8s-helpers.sh port-forward webui 3000:80

# Or manually
kubectl port-forward -n ushadow svc/backend 8000:8000
kubectl port-forward -n ushadow svc/webui 3000:80
```

Then access:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

### Scale Services

```bash
# Scale backend to 3 replicas
./scripts/k8s-helpers.sh scale backend 3

# Scale frontend to 2 replicas
./scripts/k8s-helpers.sh scale webui 2

# Or manually
kubectl scale deployment/backend --replicas=3 -n ushadow
```

### Restart Services

```bash
# Restart backend
./scripts/k8s-helpers.sh restart backend

# Or manually
kubectl rollout restart deployment/backend -n ushadow
```

### Execute Commands in Pods

```bash
# Get a shell in backend pod
./scripts/k8s-helpers.sh exec backend bash

# Run a command
./scripts/k8s-helpers.sh exec backend env

# Or manually
kubectl exec -it -n ushadow deployment/backend -- bash
```

## Production-Ready Adjustments

The auto-generated manifests need these adjustments for production. See `k8s/tweaks/README.md` for detailed instructions.

### 1. StatefulSets for Databases

Convert database Deployments to StatefulSets for stable storage:

```bash
# Example provided in k8s/tweaks/mongo-statefulset-example.yaml
kubectl apply -f k8s/tweaks/mongo-statefulset-example.yaml
```

### 2. Add Resource Limits

Edit deployments to add resource constraints:

```yaml
resources:
  requests:
    memory: "256Mi"
    cpu: "250m"
  limits:
    memory: "512Mi"
    cpu: "500m"
```

### 3. Configure Ingress

Edit and apply the Ingress example:

```bash
# Edit with your domain
vim k8s/tweaks/ingress-example.yaml

# Apply
kubectl apply -f k8s/tweaks/ingress-example.yaml
```

### 4. Add Persistent Storage

For production, configure proper StorageClass and PVCs:

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: mongo-data
  namespace: ushadow
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 20Gi
  storageClassName: standard  # Use your cloud provider's storage class
```

### 5. Configure Monitoring

Add Prometheus annotations to services:

```yaml
annotations:
  prometheus.io/scrape: "true"
  prometheus.io/port: "8000"
  prometheus.io/path: "/metrics"
```

## Environment-Specific Deployments

### Development Environment

```bash
# Use namespace for dev
export NAMESPACE=ushadow-dev
./deploy.sh
kubectl apply -k k8s/
```

### Production Environment

```bash
# Use namespace for prod
export NAMESPACE=ushadow-prod
./deploy.sh

# Review carefully before applying
kubectl apply -k k8s/ --dry-run=client

# Apply
kubectl apply -k k8s/
```

## Troubleshooting

### Pods Not Starting

```bash
# Check pod status
kubectl get pods -n ushadow

# Describe problematic pod
kubectl describe pod <pod-name> -n ushadow

# Check logs
kubectl logs <pod-name> -n ushadow
```

### Storage Issues

```bash
# Check PVCs
kubectl get pvc -n ushadow

# Describe PVC
kubectl describe pvc <pvc-name> -n ushadow

# Check storage class
kubectl get storageclass
```

### Network Issues

```bash
# Check services
kubectl get svc -n ushadow

# Test connectivity from a pod
kubectl run -it --rm debug --image=busybox -n ushadow -- sh
# Inside the pod:
wget -O- http://backend:8000/health
```

### Image Pull Issues

```bash
# Check events
kubectl get events -n ushadow --sort-by='.lastTimestamp'

# If using private registry, create image pull secret
kubectl create secret docker-registry regcred \
  --docker-server=<your-registry> \
  --docker-username=<username> \
  --docker-password=<password> \
  -n ushadow
```

## Cleanup

### Delete All Resources

```bash
# Using helper script (prompts for confirmation)
./scripts/k8s-helpers.sh delete-all

# Or manually
kubectl delete namespace ushadow

# Delete with kustomize
kubectl delete -k k8s/
```

### Regenerate Manifests

```bash
# Clean and regenerate
rm -rf k8s/
./deploy.sh
```

## Advanced Configuration

### Using Kustomize Overlays

For different environments, use overlays:

```bash
# Create overlay for production
mkdir -p k8s/overlays/prod

cat > k8s/overlays/prod/kustomization.yaml <<EOF
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: ushadow-prod

resources:
  - ../../base

# Add production-specific patches
patchesStrategicMerge:
  - replica-count.yaml
  - resource-limits.yaml

# Use different images
images:
  - name: backend
    newTag: v1.0.0
  - name: webui
    newTag: v1.0.0
EOF

# Deploy production
kubectl apply -k k8s/overlays/prod/
```

### GitOps with ArgoCD

```yaml
# argocd-application.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: ushadow
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/your-org/ushadow
    targetRevision: main
    path: k8s
  destination:
    server: https://kubernetes.default.svc
    namespace: ushadow
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

## Useful Commands Reference

```bash
# Get all resources in namespace
kubectl get all -n ushadow

# Watch pod status
kubectl get pods -n ushadow -w

# Get resource usage
kubectl top pods -n ushadow
kubectl top nodes

# Edit a deployment
kubectl edit deployment/backend -n ushadow

# View configuration
kubectl get configmap ushadow-config -n ushadow -o yaml

# View secrets (base64 encoded)
kubectl get secret ushadow-secret -n ushadow -o yaml

# Decode secret
kubectl get secret ushadow-secret -n ushadow -o jsonpath='{.data.API_KEY}' | base64 -d

# Get YAML of running resource
kubectl get deployment/backend -n ushadow -o yaml

# Apply with dry-run
kubectl apply -f k8s/base/ --dry-run=client

# Diff before applying
kubectl diff -k k8s/
```

## Additional Resources

- [Kompose Documentation](https://kompose.io/)
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Kustomize Documentation](https://kubectl.docs.kubernetes.io/references/kustomize/)
- [kubectl Cheat Sheet](https://kubernetes.io/docs/reference/kubectl/cheatsheet/)

## Support

For issues related to:
- **Kompose conversion**: Check `k8s/tweaks/README.md`
- **Deployment failures**: Review pod logs and events
- **Networking**: Ensure services and ingress are properly configured
- **Storage**: Verify StorageClass and PVC configurations
