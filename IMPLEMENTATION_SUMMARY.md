# ushadow CLI Tool - Auto-Generated Client Implementation

## What Was Built

### 1. **OpenAPI Spec Generator** (`scripts/generate_openapi_spec.py`)
Downloads the OpenAPI specification from your running FastAPI backend.

```bash
python scripts/generate_openapi_spec.py
# Creates: openapi.json
```

### 2. **Auto-Generated Python Client** (`clients/python/ushadow_api_client/`)
Type-safe Python client generated from OpenAPI spec using `openapi-python-client`.

- Full Pydantic models for all API types
- Sync and async methods for all endpoints
- Complete IDE autocomplete support
- 100% API coverage automatically

### 3. **Authenticated Client Wrapper** (`clients/python/ushadow_auth_client.py`)
Convenient wrapper that handles authentication automatically.

```python
from ushadow_auth_client import UshadowAuthClient

client = UshadowAuthClient.from_env()
services = client.list_services()
```

### 4. **Modern CLI Tool** (`scripts/ush`)
Beautiful command-line interface built with Typer and Rich.

```bash
./scripts/ush services list           # Pretty table output
./scripts/ush services start chronicle
./scripts/ush -v api GET /api/services/
```

### 5. **Regeneration Script** (`scripts/regenerate_client.sh`)
One-command client regeneration when API changes.

```bash
./scripts/regenerate_client.sh
```

## File Structure

```
Ushadow/
├── scripts/
│   ├── ush                           # New CLI tool (typer + rich)
│   ├── ushadow_client.py             # Old manual client (keep for now)
│   ├── generate_openapi_spec.py      # OpenAPI spec downloader
│   └── regenerate_client.sh          # Regeneration helper
├── clients/
│   └── python/
│       ├── ushadow_api_client/       # AUTO-GENERATED (don't edit)
│       │   ├── api/default/          # Typed API methods
│       │   ├── models/               # Pydantic models
│       │   └── client.py             # Base client
│       ├── ushadow_auth_client.py    # Auth wrapper (edit this)
│       └── CLIENT_README.md
├── docs/
│   └── CLI-TOOL-GUIDE.md             # Comprehensive guide
└── openapi.json                      # Generated OpenAPI spec
```

## Key Advantages

### 1. **No Manual Maintenance**
```bash
# API changed? Just regenerate:
./scripts/regenerate_client.sh

# Old way required manual endpoint updates everywhere
```

### 2. **Full Type Safety**
```python
# IDE knows all fields, autocomplete everywhere
services: list[Service] = client.list_services()
for svc in services:
    print(svc.service_name)  # Autocomplete!
    print(svc.status)        # Type-checked!
```

### 3. **Perfect for Testing**
```python
# LLMs can see full type information
def test_services(client: UshadowAuthClient):
    services: list[Service] = client.list_services()
    assert all(s.status in ["running", "stopped"] for s in services)
```

### 4. **Beautiful CLI Output**
Uses Rich for pretty tables, colored output, and progress indicators.

## Migration Path

### Phase 1: Parallel (Current)
Both clients exist side-by-side:
- `scripts/ushadow_client.py` - Old manual client
- `scripts/ush` - New auto-generated client

### Phase 2: Transition
Update scripts to use new client:
```python
# Old
from scripts.ushadow_client import api_request
result = api_request("/api/services/")

# New
from clients.python.ushadow_auth_client import UshadowAuthClient
client = UshadowAuthClient.from_env()
result = client.list_services()
```

### Phase 3: Deprecation
Remove `scripts/ushadow_client.py` once all dependencies migrated.

## Usage Examples

### CLI Usage
```bash
# Basic commands
./scripts/ush health
./scripts/ush services list
./scripts/ush services start chronicle-backend

# Verbose mode (shows authentication)
./scripts/ush -v services start chronicle

# Raw API access
./scripts/ush api GET /api/services/
./scripts/ush api POST /api/services/test/start -d '{"detach": true}'
```

### Python Script Usage
```python
from clients.python.ushadow_auth_client import UshadowAuthClient

# Auto-login with credentials from secrets.yaml or .env
client = UshadowAuthClient.from_env(verbose=True)

# List services
services = client.list_services()
for svc in services:
    print(f"{svc.service_name}: {svc.status}")

# Start a service (auto-authenticated)
result = client.start_service("chronicle-backend")
print(result)
```

### Testing Usage
```python
import pytest
from clients.python.ushadow_auth_client import UshadowAuthClient

@pytest.fixture
def client():
    return UshadowAuthClient.from_env()

def test_service_lifecycle(client):
    # Full type safety in tests
    services = client.list_services()
    assert len(services) > 0
    
    result = client.start_service("test-service")
    assert result["success"] is True
```

## Regeneration Workflow

When your FastAPI backend changes:

```bash
# 1. Start backend
cd ushadow && make up

# 2. Regenerate client (one command!)
./scripts/regenerate_client.sh

# 3. Test
./scripts/ush services list
```

**Pro tip:** Add to CI/CD:
```yaml
# .github/workflows/regenerate-client.yml
- name: Regenerate API client
  run: |
    make up  # Start backend
    ./scripts/regenerate_client.sh
    git diff --exit-code clients/python/  # Fail if out of sync
```

## Comparison: Old vs New

| Aspect | Old (`ushadow_client.py`) | New (`ush` + generated) |
|--------|--------------------------|------------------------|
| **Endpoint Management** | Manual strings | Auto-generated from OpenAPI |
| **Type Safety** | Dict responses | Pydantic models |
| **IDE Support** | None | Full autocomplete |
| **API Coverage** | Partial (13 endpoints) | 100% automatic |
| **Maintenance** | Manual updates | Regenerate command |
| **CLI Output** | Plain text | Rich tables & colors |
| **Authentication** | Manual token handling | Automatic login |
| **Testing** | Manual mocking | Type-safe models |
| **LLM Integration** | Medium | Excellent |

## Next Steps

### Immediate
1. ✅ Test the new CLI with running backend
2. ✅ Update documentation references
3. ✅ Add to CI/CD pipeline

### Future Enhancements
1. **Interactive Menu** - Add `questionary` for menu-driven interface
2. **Shell Completion** - Bash/Zsh autocomplete
3. **Config File** - Support `~/.ushrc` for preferences
4. **More Commands** - Add wizard, deployments, etc.
5. **Async CLI** - For long-running operations

## Questions Answered

### Q: Why not use Swagger directly?
**A:** Swagger/OpenAPI is just the specification (a JSON file). You still need:
- `openapi-python-client` - Reads spec, generates Python code
- `ushadow_auth_client.py` - Adds authentication logic
- `ush` - Provides CLI interface

### Q: What if I don't want to regenerate?
**A:** The generated client is stable. You only regenerate when:
- FastAPI backend adds new endpoints
- Existing endpoints change structure
- You want new API features in your CLI

### Q: Can I customize the generated client?
**A:** Don't edit `ushadow_api_client/` directly (gets overwritten).
Instead, customize `ushadow_auth_client.py` which wraps the generated client.

### Q: How does authentication work?
**A:** 
1. Client reads credentials from `secrets.yaml` or `.env`
2. Logs in via `/api/auth/jwt/login` endpoint
3. Caches JWT token for subsequent requests
4. Adds `Authorization: Bearer <token>` header automatically

## Resources

- **Documentation:** `docs/CLI-TOOL-GUIDE.md`
- **Client README:** `clients/python/CLIENT_README.md`
- **OpenAPI Spec:** `http://localhost:8000/openapi.json` (when running)
- **API Docs:** `http://localhost:8000/docs` (Swagger UI)

## Summary

You now have a **modern, type-safe, auto-generated CLI tool** that:
- ✅ Stays in sync with your API automatically
- ✅ Provides full IDE autocomplete and type checking
- ✅ Handles authentication transparently
- ✅ Works great for scripts, tests, and LLM integration
- ✅ Looks beautiful with Rich formatting
- ✅ Regenerates in seconds when API changes

**No more manual endpoint maintenance!** 🎉
