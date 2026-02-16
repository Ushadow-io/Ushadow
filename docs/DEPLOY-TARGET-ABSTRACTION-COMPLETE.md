# DeployTarget Abstraction - Complete

**Date:** 2026-02-16
**Status:** ✅ Complete
**Goal:** Make Settings platform-agnostic using DeployTarget abstraction

---

## Problem

Settings was **tightly coupled to Kubernetes:**

```python
# ❌ Before: Settings calling k8s_manager directly
from src.services.kubernetes_manager import get_kubernetes_manager

k8s_manager = get_kubernetes_manager()
cluster = k8s_manager.get_cluster(parsed["identifier"])
if cluster and cluster.infra_scans:
    # K8s-specific logic...
```

**Issues:**
- Settings knows about K8s internals
- Can't support other platforms (Docker, Cloud)
- Hard to test (requires K8s setup)
- Violates layering (Settings → K8s directly)

---

## Solution: DeployTarget Abstraction

Settings now calls through the **DeployTarget/DeploymentPlatform abstraction:**

```python
# ✅ After: Platform-agnostic
from src.models.deploy_target import DeployTarget
from src.services.deployment_platforms import get_deploy_platform

# 1. Get target (works for K8s, Docker, Cloud)
target = await DeployTarget.from_id(deploy_target_id)

# 2. Get platform (automatically selects K8s/Docker/Cloud implementation)
platform = get_deploy_platform(target)

# 3. Get infrastructure (platform handles specifics)
infrastructure = await platform.get_infrastructure(target)
```

---

## Architecture Layers

```
┌─────────────────────────────────────────────────────────┐
│ Settings API (src/config/settings.py)                   │
│ - Platform-agnostic                                     │
│ - No K8s knowledge                                      │
│ - Calls DeployTarget abstraction                       │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ DeployTarget (src/models/deploy_target.py)              │
│ - DeployTarget.from_id(target_id)                       │
│ - Standardized interface: .id, .type, .infrastructure  │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ DeploymentPlatform (src/services/deployment_platforms.py)│
│ - get_deploy_platform(target) → platform               │
│ - platform.get_infrastructure(target)                  │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ Platform Implementations                                 │
│ - KubernetesPlatform → k8s_manager (K8s specifics)      │
│ - DockerPlatform → docker scans (Docker specifics)      │
│ - CloudPlatform → AWS/GCP APIs (future)                 │
└─────────────────────────────────────────────────────────┘
```

---

## Code Changes

### Updated: `settings.py`

**Removed K8s-specific code:**
```python
# ❌ Removed
from src.utils.deployment_targets import parse_deployment_target_id
from src.services.kubernetes_manager import get_kubernetes_manager

parsed = parse_deployment_target_id(deploy_target)
if parsed["type"] != "k8s":
    return {}

k8s_manager = get_kubernetes_manager()
cluster = k8s_manager.get_cluster(parsed["identifier"])
if not cluster or not cluster.infra_scans:
    return {}

# 40+ lines of K8s-specific logic...
```

**Added platform-agnostic code:**
```python
# ✅ Added
from src.models.deploy_target import DeployTarget
from src.services.deployment_platforms import get_deploy_platform

target = await DeployTarget.from_id(deploy_target_id)
platform = get_deploy_platform(target)
infrastructure_scan = await platform.get_infrastructure(target)

# Platform handles specifics (K8s, Docker, Cloud, etc.)
```

**Lines changed:** ~60 lines → ~20 lines

---

## Benefits

### 1. Platform-Agnostic ✅

**Settings doesn't know about:**
- Kubernetes specifics
- K8s cluster scans
- Namespace filtering
- K8s manager APIs

**Settings only knows:**
- DeployTarget abstraction
- Infrastructure scan format (common across platforms)
- How to map services to env vars (via InfrastructureRegistry)

### 2. Future Platforms ✅

**Easy to add new platforms:**

```python
class CloudPlatform(DeployPlatform):
    async def get_infrastructure(self, target: DeployTarget):
        """Get managed infrastructure from AWS/GCP."""
        # Query AWS RDS, ElastiCache, etc.
        return {
            "postgres": {
                "found": True,
                "endpoints": ["mydb.abc123.us-east-1.rds.amazonaws.com:5432"]
            },
            "redis": {
                "found": True,
                "endpoints": ["cache.abc123.use1.cache.amazonaws.com:6379"]
            }
        }
```

Settings automatically works with it - no changes needed!

### 3. Testable ✅

**Before:** Required full K8s setup to test Settings

**After:** Mock `platform.get_infrastructure()`:
```python
@pytest.fixture
def mock_platform():
    platform = Mock()
    platform.get_infrastructure = AsyncMock(return_value={
        "mongo": {"found": True, "endpoints": ["mongo:27017"]}
    })
    return platform

async def test_settings_infrastructure(mock_platform):
    # Test Settings without K8s
    ...
```

### 4. Clean Layering ✅

**Before:**
```
Settings → K8sManager → K8s API
(Direct dependency on K8s)
```

**After:**
```
Settings → DeployTarget → Platform → K8sManager → K8s API
(Abstracted, can swap platforms)
```

---

## Infrastructure Flow

### For K8s Deployment

```
1. User requests deployment to "anubis.k8s.purple"
   ↓
2. Settings._load_infrastructure_defaults("anubis.k8s.purple")
   ↓
3. DeployTarget.from_id("anubis.k8s.purple")
   - Fetches K8s cluster "anubis"
   - Returns DeployTarget with infrastructure field populated
   ↓
4. get_deploy_platform(target)
   - Checks target.type == "k8s"
   - Returns KubernetesPlatform instance
   ↓
5. platform.get_infrastructure(target)
   - Returns target.infrastructure (already scanned)
   ↓
6. InfrastructureRegistry.build_url("mongo", "mongodb.default.svc:27017")
   - Returns "mongodb://mongodb.default.svc:27017"
   ↓
7. Settings resolution
   - MONGO_URL = "mongodb://mongodb.default.svc:27017"
   - Source = INFRASTRUCTURE layer
```

### For Future Docker Deployment

```
1. User requests deployment to "worker-1.docker.purple"
   ↓
2. Settings._load_infrastructure_defaults("worker-1.docker.purple")
   ↓
3. DeployTarget.from_id("worker-1.docker.purple")
   - Fetches UNode "worker-1"
   - Returns DeployTarget
   ↓
4. get_deploy_platform(target)
   - Checks target.type == "docker"
   - Returns DockerPlatform instance
   ↓
5. platform.get_infrastructure(target)
   - Scans Docker network for infrastructure containers
   - Returns {"mongo": {"found": True, "endpoints": ["mongo:27017"]}}
   ↓
6. InfrastructureRegistry.build_url("mongo", "mongo:27017")
   - Returns "mongodb://mongo:27017"
   ↓
7. Settings resolution
   - MONGO_URL = "mongodb://mongo:27017"
   - Source = INFRASTRUCTURE layer
```

**Same Settings code works for both!**

---

## Verification

### No K8s Dependencies
```bash
$ grep -n "kubernetes_manager\|k8s_manager" settings.py
# ✓ No results
```

### Clean Imports
```python
# settings.py imports
from src.config.infrastructure_registry import get_infrastructure_registry
from src.services.provider_registry import get_provider_registry
# No K8s imports!
```

### Platform Abstraction Used
```python
# In _load_infrastructure_defaults()
from src.models.deploy_target import DeployTarget
from src.services.deployment_platforms import get_deploy_platform

target = await DeployTarget.from_id(deploy_target_id)
platform = get_deploy_platform(target)
infrastructure_scan = await platform.get_infrastructure(target)
```

---

## Testing

### Unit Test Example

```python
@pytest.fixture
async def mock_infrastructure_platform():
    """Mock platform that returns test infrastructure."""
    platform = Mock(spec=DeployPlatform)
    platform.get_infrastructure = AsyncMock(return_value={
        "mongo": {
            "found": True,
            "endpoints": ["mongodb.test.svc:27017"]
        },
        "redis": {
            "found": True,
            "endpoints": ["redis.test.svc:6379"]
        }
    })
    return platform

async def test_load_infrastructure_for_target(mock_infrastructure_platform):
    """Test infrastructure loading is platform-agnostic."""
    settings = Settings()

    # Mock DeployTarget.from_id and get_deploy_platform
    with patch('src.models.deploy_target.DeployTarget.from_id') as mock_from_id, \
         patch('src.services.deployment_platforms.get_deploy_platform') as mock_get_platform:

        mock_from_id.return_value = Mock(id="test.k8s.env", type="k8s")
        mock_get_platform.return_value = mock_infrastructure_platform

        # Load infrastructure
        infra = await settings._load_infrastructure_defaults(
            "test.k8s.env",
            ["MONGO_URL", "REDIS_URL"]
        )

        # Verify correct URLs built
        assert infra["MONGO_URL"] == "mongodb://mongodb.test.svc:27017"
        assert infra["REDIS_URL"] == "redis://redis.test.svc:6379"
```

---

## Future Enhancements

### 1. Docker Infrastructure Scanning

```python
class DockerPlatform(DeployPlatform):
    async def get_infrastructure(self, target: DeployTarget):
        """Scan Docker network for infrastructure containers."""
        # Scan compose_infra network
        # Find running mongo, redis, postgres containers
        # Return same format as K8s
        return {...}
```

### 2. Cloud Platform Support

```python
class AWSPlatform(DeployPlatform):
    async def get_infrastructure(self, target: DeployTarget):
        """Get RDS, ElastiCache from AWS."""
        # Query AWS APIs
        return {...}

class GCPPlatform(DeployPlatform):
    async def get_infrastructure(self, target: DeployTarget):
        """Get Cloud SQL, Memorystore from GCP."""
        return {...}
```

### 3. Infrastructure Caching

Settings already has `_infrastructure_cache` dict. Could enhance:
- TTL-based expiration
- Proactive refresh on infrastructure changes
- Invalidation hooks

---

## Summary

| Aspect | Before | After |
|--------|--------|-------|
| **K8s Dependency** | Direct k8s_manager calls | Abstracted via DeployTarget |
| **Platform Support** | K8s only | K8s + future Docker/Cloud |
| **Lines of Code** | ~60 lines (K8s-specific) | ~20 lines (platform-agnostic) |
| **Testability** | Requires K8s | Mockable platform |
| **Layering** | Settings → K8s (tight) | Settings → DeployTarget → Platform (loose) |
| **Future-Proof** | ❌ Hard to add platforms | ✅ Easy to add platforms |

---

## Commits

1. `7fc430e1` - Phase 1: Remove duplication (docker_helpers)
2. `c75a5331` - Infrastructure registry (data-driven from compose)
3. **Next:** DeployTarget abstraction (this document)

---

## Commit Message

```
refactor(settings): use DeployTarget abstraction for infrastructure

Remove direct K8s dependencies from Settings. Use DeployTarget/DeploymentPlatform
abstraction to make Settings platform-agnostic:

- Settings calls DeployTarget.from_id() and platform.get_infrastructure()
- No more direct k8s_manager imports
- Platform handles specifics (K8s, Docker, Cloud)
- Same code works for all platform types

Benefits:
- Platform-agnostic Settings API
- Future platforms (Docker, Cloud) work automatically
- Clean layering: Settings → DeployTarget → Platform → K8sManager
- Testable without K8s setup

Changes:
- Update _load_infrastructure_defaults() to use abstraction
- Remove parse_deployment_target_id import
- Remove k8s_manager calls
- 60 lines of K8s-specific code → 20 lines platform-agnostic

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```
