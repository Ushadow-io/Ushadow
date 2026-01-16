# Manual Adjustments Needed

Kompose does a good job, but these adjustments are recommended for production:

## 1. Infrastructure Services - Use StatefulSets

For MongoDB, Redis, Qdrant, PostgreSQL, Neo4j:
- Convert Deployment → StatefulSet
- Add proper volumeClaimTemplates
- Configure podManagementPolicy: Parallel or OrderedReady
- Add headless service for stable network identities

## 2. Persistent Storage

Add StorageClass and PersistentVolumeClaims:
```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: mongo-data
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi
  storageClassName: standard  # or your storage class
```

## 3. Resource Limits

Add resource requests and limits to all deployments:
```yaml
resources:
  requests:
    memory: "256Mi"
    cpu: "250m"
  limits:
    memory: "512Mi"
    cpu: "500m"
```

## 4. Ingress for External Access

Create an Ingress resource (see ingress-example.yaml)

## 5. Network Policies

Add NetworkPolicy for security (optional but recommended)

## 6. ConfigMaps and Secrets

- Move environment variables to ConfigMaps
- Move sensitive data to Secrets
- Use external secret management (e.g., Sealed Secrets, External Secrets Operator)

## Files Generated

- `infra/` - Infrastructure services (databases, cache)
- `base/` - Application services (backend, frontend)
- `namespace.yaml` - Namespace definition
- `configmap.yaml` - Configuration data
- `secret.yaml` - Secrets (template only)
