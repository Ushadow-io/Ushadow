# Feature Flags Quick Start

The ushadow feature flags system uses a simple YAML-based approach for easy management without external dependencies.

## Features

- **YAML-based storage** - No database required
- **Live reload** - Changes take effect immediately without restart
- **Web UI** - Beautiful interface for toggling flags at `/feature-flags`
- **Git-tracked** - Feature flags are version controlled
- **Header indicator** - Shows when example feature flag is active

## Quick Start

### 1. Access the UI

Navigate to **http://localhost:3050/feature-flags**

Or click the **TestTube icon** (🧪) in the header.

### 2. Toggle Flags

Click the toggle switches to enable/disable features instantly.

### 3. Add New Flags

Edit `ushadow/backend/config/feature_flags.yaml`:

```yaml
flags:
  my_new_feature:
    enabled: false
    description: "What this feature does"
    type: release  # or experiment, ops
```

The UI will automatically show your new flag!

## Using Flags in Code

### Backend (Python)

```python
from src.services.feature_flags import get_feature_flag_service

service = get_feature_flag_service()
if service.is_enabled("my_new_feature"):
    return new_implementation()
else:
    return old_implementation()
```

### Frontend (React)

```typescript
import { useFeatureFlags } from '../contexts/FeatureFlagsContext'

function MyComponent() {
  const { isEnabled } = useFeatureFlags()

  if (isEnabled('my_new_feature')) {
    return <NewFeature />
  }
  return <OldFeature />
}
```

## Header Indicator

The purple "Feature Flag Active" indicator appears in the header when `example_feature` is enabled. This is useful for demos and testing.

To enable it:
1. Go to `/feature-flags`
2. Toggle "example_feature" to ON
3. See the indicator appear in the header

## File Location

- **Config**: `config/feature_flags.yaml`
- **Service**: `ushadow/backend/src/services/feature_flags.py`
- **API**: `ushadow/backend/src/api/feature_flags.py`
- **Frontend Context**: `ushadow/frontend/src/contexts/FeatureFlagsContext.tsx`
- **Frontend Page**: `ushadow/frontend/src/pages/FeatureFlags.tsx`

## API Endpoints

- `GET /api/feature-flags/status` - List all flags (public, no auth)
- `GET /api/feature-flags/check/{flag_name}` - Check specific flag (requires auth)
- `POST /api/feature-flags/toggle/{flag_name}` - Toggle flag (requires auth)

## Common Use Cases

### Feature Rollouts
```yaml
new_dashboard:
  enabled: false
  description: "New dashboard UI with improved UX"
  type: release
```

### A/B Testing
```yaml
search_algorithm_v2:
  enabled: false
  description: "Testing new semantic search algorithm"
  type: experiment
```

### Operational Toggles
```yaml
maintenance_mode:
  enabled: false
  description: "Enable maintenance mode banner"
  type: ops
```

## Troubleshooting

### Feature flags not loading
- Check browser console for errors
- Verify backend is running on port 8050
- Check `config/feature_flags.yaml` exists

### Toggle not working
- Ensure you're logged in
- Check browser console for API errors
- Verify file permissions on `feature_flags.yaml`

### Flag doesn't appear in UI
- Restart backend to reload YAML file
- Check YAML syntax is correct
- Ensure flag is in the `flags:` section

---

Imported from friend-lite feature flags system - YAML-based, simple, and powerful!
