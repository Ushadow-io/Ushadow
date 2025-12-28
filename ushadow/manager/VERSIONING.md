# ushadow-manager Versioning

## Overview

The ushadow-manager is a lightweight daemon that runs on worker nodes in the Ushadow cluster. It handles:
- Heartbeat reporting to the leader
- Container deployment and management
- Self-upgrade capabilities
- Node capability reporting

## Container Registry

Images are published to: `ghcr.io/ushadow-io/ushadow-manager`

## Version Format

We use semantic versioning: `MAJOR.MINOR.PATCH`

- **MAJOR**: Breaking changes to the manager API or heartbeat protocol
- **MINOR**: New features, backwards compatible
- **PATCH**: Bug fixes, backwards compatible

The `latest` tag always points to the most recent stable release.

## Current Version

The version is defined in `manager.py`:

```python
MANAGER_VERSION = "0.2.0"
```

## When to Update the Version

**You MUST update the version and push a new image when:**

1. Any changes to `manager.py` that affect:
   - Heartbeat data format
   - API endpoints (`/health`, `/info`, `/upgrade`, `/deploy`, etc.)
   - Container management logic
   - Capability reporting
   - Self-upgrade mechanism

2. Changes to `Dockerfile` that affect the runtime environment

3. Changes to `requirements.txt` dependencies

## How to Release a New Version

### 1. Update the version in manager.py

```python
# Before
MANAGER_VERSION = "0.2.0"

# After
MANAGER_VERSION = "0.3.0"
```

### 2. Build and push the new image

From the repository root:

```bash
# Build for multiple platforms
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t ghcr.io/ushadow-io/ushadow-manager:0.3.0 \
  -t ghcr.io/ushadow-io/ushadow-manager:latest \
  --push \
  ushadow/manager/

# Or use the Makefile if available
make push-manager VERSION=0.3.0
```

### 3. Verify the release

```bash
# Check the new tag is available
curl -s "https://ghcr.io/token?scope=repository:ushadow-io/ushadow-manager:pull" | \
  jq -r '.token' | \
  xargs -I {} curl -s -H "Authorization: Bearer {}" \
  "https://ghcr.io/v2/ushadow-io/ushadow-manager/tags/list"
```

## Version Discovery

The Ushadow backend fetches available versions from ghcr.io to populate the upgrade UI dropdown. This happens via:

- Backend: `GET /api/unodes/versions` (in `src/routers/unodes.py`)
- Frontend: `clusterApi.getManagerVersions()`

## Upgrade Flow

1. User selects a version in the Cluster UI
2. Backend calls the worker node's `/upgrade` endpoint
3. Worker pulls the new image, stops itself, and restarts with the new version
4. Worker resumes heartbeats with the new `manager_version`

## Important Notes

- Always test new versions locally before pushing
- The `latest` tag should always point to a stable release
- Workers will be briefly offline (~10 seconds) during upgrades
- The leader node runs differently and cannot be upgraded via this mechanism
