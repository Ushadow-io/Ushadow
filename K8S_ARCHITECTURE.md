# Kubernetes Deployment Architecture

## Overview

Ushadow supports deploying services to Kubernetes clusters in addition to Docker. This document describes the architecture, components, and deployment flow.

## Architecture Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React)                          │
│  - KubernetesClustersPage: Cluster management UI            │
│  - DeployToK8sModal: Service deployment UI                  │
└─────────────────┬───────────────────────────────────────────┘
                  │ HTTPS API
┌─────────────────▼───────────────────────────────────────────┐
│              Backend (FastAPI)                               │
│  - routers/kubernetes.py: K8s API endpoints                  │
│  - services/kubernetes_manager.py: K8s operations            │
│  - services/compose_registry.py: Service definitions         │
└─────────────────┬───────────────────────────────────────────┘
                  │ Kubernetes Python Client
┌─────────────────▼───────────────────────────────────────────┐
│           Kubernetes Cluster                                 │
│  - Namespace: ushadow (default)                              │
│  - ConfigMaps: Non-sensitive env vars                        │
│  - Secrets: Sensitive env vars                               │
│  - Deployments: Service pods                                 │
│  - Services: Network endpoints                               │
└──────────────────────────────────────────────────────────────┘
```

## Deployment Strategy

### 1. Direct Kubernetes Interface

We chose **direct K8s API** over deploying unode-manager to K8s:

**Benefits:**
- Simpler architecture (no additional pods to manage)
- Native K8s features (StatefulSets, Operators, CRDs)
- Better debugging (direct API errors)
- Can add unode-manager-in-k8s later if needed

**Trade-offs:**
- Different code paths for Docker vs K8s deployments
- K8s-specific manifest generation

### 2. Manifest Generation Flow

```
Service Definition (Compose YAML)
    ↓
ComposeRegistry (parse & register)
    ↓
kubernetes_manager.compile_service_to_k8s()
    ↓
Generated Manifests:
  - ConfigMap (non-sensitive env vars)
  - Secret (sensitive env vars: keys, passwords, tokens)
  - Deployment (pods with envFrom references)
  - Service (ClusterIP/NodePort/LoadBalancer)
  - Ingress (optional)
    ↓
Apply to Kubernetes via Python client
    ↓
Running Pods
```

### 3. Environment Variable Handling

**Separation Strategy:**
- **ConfigMap**: Non-sensitive configuration
  - Database URLs (without credentials)
  - Service endpoints
  - Feature flags
  - Public configuration

- **Secret**: Sensitive data (base64 encoded)
  - API keys (`*_API_KEY`, `*_KEY`)
  - Passwords (`*_PASSWORD`, `*_PASS`)
  - Tokens (`*_TOKEN`)
  - Credentials (`*_CREDENTIALS`, `*_SECRET`)

**Resolution Order:**
1. Manual value (from deployment UI)
2. settingsStore suggestion (from user settings)
3. Infrastructure discovery (from cluster scan)
4. Default value (from compose file)

**Variable Substitution:**
Docker Compose variables like `${VAR:-default}` are resolved at deployment time:
- Check service env_config
- Check OS environment
- Use default value

### 4. Port Handling

**Multiple Ports Support:**
```yaml
# Service has multiple ports
ports: ['3002:3000', '8080:8080']

# Generated container ports with unique names
spec:
  containers:
  - ports:
    - name: http
      containerPort: 3000
    - name: http-2
      containerPort: 8080
```

**Port Name Requirements:**
- Must be unique within a container
- Must match regex: `[a-z0-9]([-a-z0-9]*[a-z0-9])?`
- Max 15 characters

### 5. Infrastructure Discovery

**Scan Process:**
```
1. User adds K8s cluster (with kubeconfig)
2. User clicks "Scan Infrastructure"
3. Backend scans namespace for services:
   - mongo/mongodb
   - redis
   - postgres/postgresql
   - qdrant
   - neo4j
4. Results cached in cluster document
5. Auto-mapped to service env vars on deployment
```

**Connection String Formats:**
- ClusterIP: `{service}.{namespace}.svc.cluster.local:{port}`
- NodePort: `<node-ip>:{nodePort}`
- LoadBalancer: `{lb-ip}:{port}`

## Data Model

### KubernetesCluster
```python
{
  "cluster_id": str,           # Unique ID
  "name": str,                 # Display name
  "context": str,              # Kubeconfig context
  "server": str,               # API server URL
  "status": "connected",       # connected | unreachable | unauthorized
  "version": str,              # K8s version
  "node_count": int,           # Number of nodes
  "namespace": str,            # Default namespace
  "infra_scans": {             # Cached scan results
    "ushadow": {
      "mongo": {
        "found": true,
        "endpoints": ["mongo.ushadow.svc.cluster.local:27017"]
      },
      ...
    }
  }
}
```

### KubernetesDeploymentSpec
```python
{
  "replicas": int,             # Pod replicas (default: 1)
  "namespace": str,            # Target namespace
  "resources": {               # Resource limits
    "requests": {"cpu": "100m", "memory": "128Mi"},
    "limits": {"cpu": "500m", "memory": "512Mi"}
  },
  "service_type": str,         # ClusterIP | NodePort | LoadBalancer
  "health_check_path": str,    # Health probe path (None = disabled)
  "ingress": {                 # Optional ingress config
    "enabled": bool,
    "host": str,
    "path": str,
    "tls": bool
  },
  "annotations": dict,         # Custom annotations
  "labels": dict               # Custom labels
}
```

## API Endpoints

### Cluster Management
- `POST /api/kubernetes/clusters` - Add cluster
- `GET /api/kubernetes/clusters` - List clusters
- `GET /api/kubernetes/clusters/{id}` - Get cluster
- `DELETE /api/kubernetes/clusters/{id}` - Remove cluster

### Infrastructure
- `POST /api/kubernetes/{id}/scan-infra` - Scan for infrastructure
- `GET /api/kubernetes/services/available` - List deployable services
- `GET /api/kubernetes/services/infra` - List infrastructure services

### Deployment
- `POST /api/kubernetes/{id}/envmap` - Create ConfigMap/Secret
- `POST /api/kubernetes/{id}/deploy` - Deploy service

## Security Considerations

### 1. Kubeconfig Storage
- Encrypted at rest using Fernet (derived from app secret key)
- Stored as `.enc` files in `/config/kubeconfigs/`
- Never sent to frontend
- Temporary files deleted after use

### 2. RBAC Requirements
Minimum required permissions for service account:
```yaml
rules:
- apiGroups: [""]
  resources: ["namespaces", "configmaps", "secrets", "services"]
  verbs: ["get", "list", "create", "update", "patch"]
- apiGroups: ["apps"]
  resources: ["deployments"]
  verbs: ["get", "list", "create", "update", "patch"]
- apiGroups: ["networking.k8s.io"]
  resources: ["ingresses"]
  verbs: ["get", "list", "create", "update", "patch"]
```

### 3. Secret Management
- Sensitive env vars automatically separated
- Base64 encoded in Kubernetes Secrets
- Never logged in plain text
- Accessed via envFrom in pods

## Debugging

### 1. Generated Manifests
All manifests saved to: `/tmp/k8s-manifests/{cluster_id}/{namespace}/`

```bash
docker exec ushadow-backend ls /tmp/k8s-manifests/
docker exec ushadow-backend cat /tmp/k8s-manifests/{cluster-id}/{namespace}/mem0-ui-deployment.yaml
```

### 2. Logs
```bash
# Backend logs with full stack traces
docker logs ushadow-backend | grep -A 20 "deployment of"

# K8s deployment status
kubectl get deployments,pods,services -n ushadow
kubectl describe deployment mem0-ui -n ushadow
kubectl logs -f deployment/mem0-ui -n ushadow
```

### 3. Common Issues

**Image pull errors:**
```bash
kubectl describe pod {pod-name} -n ushadow | grep -A 5 "Events:"
```

**ConfigMap/Secret issues:**
```bash
kubectl get configmaps,secrets -n ushadow
kubectl describe configmap mem0-ui-config -n ushadow
```

**Port conflicts:**
```bash
# Check generated manifest
docker exec ushadow-backend cat /tmp/k8s-manifests/{cluster-id}/{namespace}/mem0-ui-deployment.yaml | grep -A 10 "ports:"
```

## Future Enhancements

### 1. StatefulSets for Databases
Current: All services use Deployments
Future: Database services use StatefulSets with PVCs

### 2. Helm Chart Generation
Current: Direct manifest application
Future: Optional Helm chart generation for complex services

### 3. GitOps Integration
Current: Direct deployment
Future: ArgoCD/Flux integration with git-based workflows

### 4. Multi-Cluster Deployments
Current: Single cluster per deployment
Future: Deploy to multiple clusters simultaneously

### 5. Resource Autoscaling
Current: Fixed replica count
Future: HPA (Horizontal Pod Autoscaler) based on metrics

## Troubleshooting Guide

### Issue: "Duplicate port name"
**Symptom:** `spec.template.spec.containers[0].ports[1].name: Duplicate value: "http"`

**Cause:** Multiple ports with same name in container spec

**Fix:** Check generated manifest - each port must have unique name

### Issue: "Image pull failed"
**Symptom:** `ErrImagePull` or `ImagePullBackOff`

**Causes:**
1. Image doesn't exist
2. Registry authentication required
3. Network connectivity issues

**Fix:**
```bash
# Check image
docker pull {image-name}

# Add image pull secret
kubectl create secret docker-registry regcred \
  --docker-server={registry} \
  --docker-username={user} \
  --docker-password={password}
```

### Issue: "CrashLoopBackOff"
**Symptom:** Pod keeps restarting

**Debug:**
```bash
kubectl logs {pod-name} -n ushadow --previous
kubectl describe pod {pod-name} -n ushadow
```

### Issue: "Liveness probe failed"
**Symptom:** Pod killed by liveness probe

**Fix:** Set `health_check_path: null` in deployment spec to disable health checks for services without health endpoints

## References

- [Kubernetes Python Client](https://github.com/kubernetes-client/python)
- [Kubernetes API Reference](https://kubernetes.io/docs/reference/kubernetes-api/)
- [KUBERNETES_INTEGRATION.md](./KUBERNETES_INTEGRATION.md) - Implementation details
