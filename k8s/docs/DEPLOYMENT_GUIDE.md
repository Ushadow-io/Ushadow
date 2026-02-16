# Ushadow Kubernetes Development with Skaffold

This directory contains Kubernetes manifests and Skaffold configuration for deploying ushadow to Kubernetes.

## Prerequisites

1. **Kubernetes cluster** - Local (kind, minikube, k3s) or remote
2. **kubectl** configured to access your cluster
3. **Skaffold** installed: `brew install skaffold` (or see [skaffold.dev](https://skaffold.dev/docs/install/))
4. **Docker** for building images

## Quick Start

### 1. Set up environment

```bash
# From project root
cp .env.example .env
# Edit .env with your configuration
```

### 2. Deploy infrastructure (one-time setup)

```bash
skaffold run -p infrastructure
```

This deploys:
- MongoDB
- Redis
- Keycloak
- PostgreSQL

### 3. Deploy application

```bash
# Deploy once
skaffold run -p application

# Or start development mode (watches for changes)
skaffold dev -p application
```

Development mode:
- Watches Python files for changes
- Auto-syncs changes to running containers
- Rebuilds on Dockerfile changes
- Port-forwards services to localhost

## Skaffold Profiles

### `infrastructure`
Infrastructure services (databases, auth)
```bash
skaffold run -p infrastructure
```

### `application`
Backend application only
```bash
skaffold run -p application      # Deploy once
skaffold dev -p application       # Development mode
```

### `dev`
Full stack (infrastructure + application) with file watching
```bash
skaffold dev -p dev
```

## What Skaffold Does

### Before Deployment
1. **Creates ConfigMap** - Config files from `config/` directory
2. **Creates Secrets** - From `.env` file (MongoDB, auth keys, etc.)

### During Deployment
1. **Builds Docker images** - Locally or pushes to registry
2. **Applies manifests** - Namespace, PVCs, Deployments, Services
3. **Port forwards** - Backend to localhost:8000

### During Development (`skaffold dev`)
1. **Watches files** - Auto-syncs Python changes
2. **Rebuilds images** - On Dockerfile or requirements changes
3. **Streams logs** - Shows pod logs in terminal
4. **Cleans up** - Removes resources on exit (Ctrl+C)

## Manual Steps

### Create Secrets
```bash
# Automatically created by Skaffold hooks, or manually:
./k8s/create-secrets.sh
```

### Create ConfigMaps
```bash
# Automatically created by Skaffold hooks, or manually:
./k8s/create-config-configmap.sh
```

### Verify Deployment
```bash
# Check pods
kubectl get pods -n ushadow

# Check services
kubectl get svc -n ushadow

# Check ConfigMap
kubectl get configmap ushadow-backend-config-files -n ushadow -o yaml

# Test backend
curl http://localhost:8000/health
```

## Development Workflow

### Typical Development Session

```bash
# Start development mode
skaffold dev -p application

# Make changes to Python files in ushadow/backend/src/
# Skaffold auto-syncs changes to pod
# Backend auto-reloads (uvicorn --reload)

# To exit: Ctrl+C (cleans up resources)
```

### Rebuild on Config Changes

```bash
# Config files changed (config.defaults.yaml)
kubectl delete configmap ushadow-backend-config-files -n ushadow
./k8s/create-config-configmap.sh

# Restart pod to pick up new config
kubectl rollout restart deployment/ushadow-backend -n ushadow
```

### Full Rebuild

```bash
# Clean everything and redeploy
skaffold delete -p application
skaffold run -p application
```

## Comparing with Compose-to-K8s

**Old way (ushadow compose-to-k8s):**
- Converts Docker Compose → K8s manifests
- Deploys via ushadow backend API
- ❌ ConfigMaps not mounted as files
- ❌ Manual image building
- ❌ No file watching

**New way (Skaffold):**
- Direct Kubernetes manifests
- ✅ ConfigMaps properly mounted
- ✅ Automatic image builds
- ✅ File watching + hot reload
- ✅ Consistent with Chronicle
- ✅ Better developer experience

## Troubleshooting

### Backend can't read config
```bash
# Check ConfigMap exists
kubectl get cm ushadow-backend-config-files -n ushadow

# Check it's mounted in pod
kubectl describe pod -n ushadow -l app=ushadow,component=backend | grep -A 5 "Mounts:"

# Verify config content
kubectl exec -n ushadow deploy/ushadow-backend -- cat /config/config.defaults.yaml
```

### Secrets missing
```bash
# Recreate secrets
./k8s/create-secrets.sh

# Restart backend
kubectl rollout restart deployment/ushadow-backend -n ushadow
```

### Port forwarding not working
```bash
# Skaffold automatically port-forwards
# Or manually:
kubectl port-forward -n ushadow svc/ushadow-backend 8000:8000
```

## File Structure

```
k8s/
├── README-SKAFFOLD.md           # This file
├── ushadow-namespace.yaml       # Namespace definition
├── base/
│   ├── backend-deployment.yaml  # Backend deployment (with ConfigMap mounts)
│   ├── backend-service.yaml     # Backend service
│   ├── backend-pvc.yaml         # Persistent volume claim
│   └── backend-secrets.yaml.example  # Example secrets
├── infra/                       # Infrastructure manifests
│   ├── mongo-deployment.yaml
│   ├── redis-deployment.yaml
│   ├── keycloak-deployment.yaml
│   └── ...
├── create-config-configmap.sh   # Create config ConfigMap
└── create-secrets.sh            # Create secrets from .env

skaffold.yaml                    # Skaffold configuration (project root)
```
