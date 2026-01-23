# Kubernetes Volume Mounting for Docker Compose Services

## Overview

The `kubernetes_manager.py` now automatically handles volume mounts from Docker Compose files when deploying services to Kubernetes. This allows services like Chronicle that require config files to work seamlessly in K8s without manual ConfigMap creation.

## How It Works

When deploying a service with volumes defined in its compose file:

### 1. Volume Parsing

The system parses volumes from the `volumes:` section of the compose service definition:

```yaml
volumes:
  - ${PROJECT_ROOT}/config/config.yml:/app/config.yml:ro
  - ${PROJECT_ROOT}/config/defaults.yml:/app/config/defaults.yml:ro
  - chronicle_data:/app/data
  - chronicle_audio:/app/audio_chunks
```

### 2. Volume Type Detection

**Config Files (Bind Mounts)**:
- If source is an existing **file** on the host: `${PROJECT_ROOT}/config/config.yml`
- Action: Read file contents and create a ConfigMap
- Result: File mounted into container via ConfigMap

**Data Volumes (Named Volumes or Directories)**:
- If source is a **directory** or doesn't exist: `chronicle_data`, `/app/data`
- Action: Create an `emptyDir` volume
- Result: Ephemeral storage mounted into container

### 3. Kubernetes Resources Created

For a service with config files, the system creates:

1. **ConfigMap for environment variables** (`{service}-config`)
   - Non-sensitive environment variables

2. **Secret for sensitive data** (`{service}-secrets`)
   - API keys, passwords, tokens

3. **ConfigMap for config files** (`{service}-files`)
   - File contents from bind mounts
   - Each file becomes a key in the ConfigMap

4. **Deployment** with:
   - `volumeMounts` referencing the config files
   - `volumes` definitions for ConfigMaps and emptyDirs

## Example: Chronicle Deployment

### Compose File (chronicle-compose.yaml)

```yaml
services:
  chronicle-backend:
    image: ghcr.io/ushadow-io/chronicle/backend:no-spacy
    volumes:
      - ${PROJECT_ROOT}/config/config.yml:/app/config.yml:ro
      - chronicle_audio:/app/audio_chunks
      - chronicle_data:/app/data
```

### Generated Kubernetes Resources

**ConfigMap: chronicle-backend-files**
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: chronicle-backend-files
  namespace: ushadow
data:
  config.yml: |
    # Full contents of config/config.yml
    llm:
      default: openai
      providers:
        - id: openai
          ...
```

**Deployment: chronicle-backend**
```yaml
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
      - name: chronicle-backend
        volumeMounts:
        - name: config-files
          mountPath: /app/config.yml
          subPath: config.yml
          readOnly: true
        - name: chronicle-audio
          mountPath: /app/audio_chunks
        - name: chronicle-data
          mountPath: /app/data
      volumes:
      - name: config-files
        configMap:
          name: chronicle-backend-files
      - name: chronicle-audio
        emptyDir: {}
      - name: chronicle-data
        emptyDir: {}
```

## Supported Volume Formats

### Bind Mount with Environment Variables
```yaml
- ${PROJECT_ROOT}/config/file.yml:/app/config/file.yml:ro
```
- Environment variables are expanded using `os.path.expandvars()`
- `:ro` suffix makes the mount read-only

### Named Volume
```yaml
- volume_name:/container/path
```
- Creates an `emptyDir` volume
- Data is ephemeral (lost when pod restarts)

### Absolute Path
```yaml
- /host/path:/container/path
```
- If path is a file: Creates ConfigMap
- If path is a directory: Creates emptyDir

## Configuration

No additional configuration needed! The system automatically:

1. **Detects environment variables** in volume source paths
2. **Resolves `${PROJECT_ROOT}`** to the backend's working directory
3. **Reads local files** and creates ConfigMaps
4. **Adds volumes** to the Deployment manifest

## Limitations

### Current Limitations

1. **File Size**: ConfigMaps are limited to ~1MB per file
   - For larger files, use PersistentVolumes instead

2. **Data Persistence**: Named volumes use `emptyDir` (ephemeral)
   - Data is lost when pod restarts
   - Future: Could add PersistentVolumeClaim support

3. **File Path Resolution**: Only works for files accessible from the backend
   - Files must exist at deployment time
   - Backend must have read permissions

### Future Enhancements

- [ ] Support for PersistentVolumeClaims for persistent data
- [ ] Binary file support (currently text files only)
- [ ] Directory mounting (currently file-level only)
- [ ] ConfigMap size validation and warnings

## Deployment Process

### From UI

1. Navigate to K8s Clusters → Deploy Service
2. Select Chronicle (or any service with volumes)
3. Click Deploy
4. System automatically:
   - Reads `config.yml` and `defaults.yml` from local filesystem
   - Creates `chronicle-backend-files` ConfigMap
   - Mounts files into pod at correct paths

### From API

```bash
curl -X POST http://localhost:8400/api/kubernetes/{cluster_id}/deploy \
  -H "Content-Type: application/json" \
  -d '{
    "service_id": "chronicle-compose:chronicle-backend",
    "namespace": "ushadow"
  }'
```

## Troubleshooting

### Config File Not Found in Pod

**Symptom**: Pod logs show "No config.yml found"

**Check**:
1. Verify ConfigMap exists:
   ```bash
   kubectl get configmap {service}-files -n {namespace}
   kubectl describe configmap {service}-files -n {namespace}
   ```

2. Check file was read at deployment time:
   ```bash
   # Check backend logs
   grep "Adding config file" /tmp/k8s-manifests/{cluster_id}/{namespace}/*.yaml
   ```

3. Verify volume mount in pod:
   ```bash
   kubectl describe pod {pod-name} -n {namespace} | grep -A 5 "Mounts:"
   ```

### ConfigMap Too Large

**Symptom**: Deployment fails with "ConfigMap too large"

**Solution**: ConfigMaps are limited to ~1MB. For larger files:
- Split into multiple smaller files
- Use PersistentVolume instead
- Store large files in the container image

### File Not Updated After Changes

**Symptom**: Changes to local config file don't appear in pod

**Solution**: Redeploy the service to update the ConfigMap:
```bash
# Delete deployment
kubectl delete deployment {service} -n {namespace}

# Redeploy via UI or API
```

ConfigMaps are immutable once created, so you need to recreate the deployment.

## Code Implementation

The volume mounting logic is implemented in:

**File**: `ushadow/backend/src/services/kubernetes_manager.py`

**Key Functions**:
- `compile_service_to_k8s()` - Parses volumes and creates manifests
- Lines 479-548 - Volume parsing logic
- Lines 587-598 - ConfigMap for config files creation
- Lines 670-674 - Volume mounts in Deployment

**Key Variables**:
- `config_files` - Dict of filename → file content for ConfigMap
- `volume_mounts` - List of volumeMount specs for container
- `k8s_volumes` - List of volume definitions for pod

## Examples

### Multiple Config Files

```yaml
volumes:
  - ./config/app.yml:/app/config/app.yml:ro
  - ./config/database.yml:/app/config/database.yml:ro
  - ./config/features.yml:/app/config/features.yml:ro
```

All three files are added to the same ConfigMap (`{service}-files`) and mounted individually.

### Mixed Volume Types

```yaml
volumes:
  - ./config.yml:/app/config.yml:ro     # ConfigMap
  - ./data:/app/data                     # emptyDir
  - logs:/app/logs                       # emptyDir
```

Config files go to ConfigMap, directories become emptyDir volumes.

### Read-Only vs Read-Write

```yaml
volumes:
  - ./config.yml:/app/config.yml:ro     # Read-only
  - ./data:/app/data                     # Read-write
```

The `:ro` suffix is respected in the volumeMount's `readOnly` field.

## Date Implemented

**2026-01-14** - Volume mounting support added to kubernetes_manager.py

## Related Documentation

- [IPv6 DNS Fix](./IPV6_DNS_FIX.md) - DNS resolution issues in K8s
- [Kubernetes Integration](./KUBERNETES_INTEGRATION.md) - General K8s deployment
