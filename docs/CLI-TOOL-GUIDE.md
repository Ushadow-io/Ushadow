# ushadow CLI Tool Guide

## Overview

The `ush` CLI tool provides command-line access to the ushadow API. It's built on an **auto-generated client** from the OpenAPI specification, ensuring it stays perfectly in sync with your backend.

## Quick Start

```bash
# Check backend health
./scripts/ush health

# List all services
./scripts/ush services list

# Start a service
./scripts/ush services start chronicle-backend

# Stop a service
./scripts/ush services stop chronicle-backend

# Get service status
./scripts/ush services status chronicle-backend

# Raw API access
./scripts/ush api GET /api/services/
```

## Architecture

```
┌─────────────────────────────────────────┐
│  FastAPI Backend (main.py)              │
│  - Auto-generates /openapi.json         │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  scripts/generate_openapi_spec.py       │
│  - Downloads OpenAPI spec                │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  openapi-python-client                   │
│  - Generates clients/python/             │
│  - Type-safe API methods                 │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  clients/python/ushadow_auth_client.py  │
│  - Handles authentication                │
│  - Wraps generated client                │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  scripts/ush (typer + rich)             │
│  - Beautiful CLI interface               │
│  - Uses authenticated client             │
└─────────────────────────────────────────┘
```

## Benefits Over Manual Client

### Old Approach (scripts/ushadow_client.py)
- ❌ Manually maintain endpoint URLs
- ❌ No type checking
- ❌ No IDE autocomplete
- ❌ Breaks when API changes
- ❌ Limited to endpoints you manually add

### New Approach (scripts/ush)
- ✅ Auto-generated from OpenAPI spec
- ✅ Full type safety with Pydantic models
- ✅ IDE autocomplete everywhere
- ✅ Regenerate when API changes
- ✅ 100% API coverage automatically

## Usage Examples

### Basic Commands

```bash
# Health check (no auth required)
./scripts/ush health

# List services (no auth required)
./scripts/ush services list
```

### Service Management (requires auth)

```bash
# Start a service
./scripts/ush services start chronicle-backend

# Stop a service
./scripts/ush services stop chronicle-backend

# Check service status
./scripts/ush services status chronicle-backend
```

### Verbose Mode

```bash
# See detailed output including login process
./scripts/ush -v services start chronicle-backend
```

### Raw API Access

```bash
# GET request
./scripts/ush api GET /api/services/

# POST request with JSON data
./scripts/ush api POST /api/services/test/start -d '{"detach": true}'

# Skip authentication
./scripts/ush api GET /health --no-auth
```

## Configuration

The CLI automatically loads credentials from:

1. `config/SECRETS/secrets.yaml` (preferred)
   ```yaml
   admin:
     email: admin@example.com
     password: your-password
   ```

2. `.env` file (fallback)
   ```bash
   ADMIN_EMAIL=admin@example.com
   ADMIN_PASSWORD=your-password
   BACKEND_PORT=8000
   ```

3. Environment variables
   ```bash
   export USHADOW_TOKEN=your-jwt-token  # Pre-authenticated
   export ADMIN_EMAIL=admin@example.com
   export ADMIN_PASSWORD=your-password
   ```

## Regenerating the Client

When your FastAPI backend changes:

```bash
# 1. Ensure backend is running
cd ushadow && make up

# 2. Generate fresh OpenAPI spec
python scripts/generate_openapi_spec.py

# 3. Regenerate Python client
openapi-python-client generate \
  --path openapi.json \
  --output-path clients/python \
  --overwrite

# 4. Test the CLI
./scripts/ush services list
```

**Recommended:** Add this to your CI/CD pipeline to keep the client in sync.

## Using in Python Scripts

The generated client can be used directly in your Python scripts:

```python
from clients.python.ushadow_auth_client import UshadowAuthClient

# Auto-login with env credentials
client = UshadowAuthClient.from_env()

# List services
services = client.list_services()
for svc in services:
    print(f"{svc.service_name}: {svc.status}")

# Start a service
result = client.start_service("chronicle-backend")
if result["success"]:
    print("Service started!")
```

## For LLM/AI Testing

The typed client is perfect for LLM-driven testing:

```python
# Full type hints help LLMs understand the API
from ushadow_api_client.models import Service

def test_service_health(client: UshadowAuthClient) -> None:
    """LLM can see Service schema and write correct tests"""
    services: list[Service] = client.list_services()
    
    for svc in services:
        assert svc.status in ["running", "stopped", "exited"]
        if svc.status == "running":
            assert svc.health in ["healthy", "unhealthy"]
```

## Comparison Table

| Feature | Manual Client | Auto-Generated Client |
|---------|--------------|----------------------|
| **Endpoint Coverage** | Partial (what you wrote) | 100% automatic |
| **Type Safety** | None | Full Pydantic models |
| **IDE Autocomplete** | No | Yes |
| **Maintenance** | Manual updates | Regenerate command |
| **API Sync** | Can drift | Always in sync |
| **Testing** | Manual mocking | Type-safe mocking |
| **Documentation** | In code | From OpenAPI |
| **LLM-Friendly** | Medium | Excellent |

## Menu System (Future)

For interactive mode, we can add `questionary`:

```python
import questionary

choice = questionary.select(
    "What would you like to do?",
    choices=[
        "List Services",
        "Start Service",
        "Stop Service",
        "View Logs",
        "Exit"
    ]
).ask()
```

This would provide a menu-driven interface for users who prefer interactive mode.

## Troubleshooting

### Authentication Errors
```bash
# Enable verbose mode to see login details
./scripts/ush -v services list

# Check credentials are configured
cat config/SECRETS/secrets.yaml
cat .env | grep ADMIN
```

### Client Out of Sync
```bash
# Regenerate from running server
python scripts/generate_openapi_spec.py
openapi-python-client generate --path openapi.json --output-path clients/python --overwrite
```

### Import Errors
```bash
# Ensure dependencies are installed
pip install httpx attrs typer rich
```

## Next Steps

1. **Add more commands** - The CLI is easily extensible with new typer commands
2. **Interactive menu** - Add `questionary` for menu-driven interface
3. **CI/CD integration** - Auto-regenerate client on API changes
4. **Shell completion** - Add bash/zsh completion support
5. **Config file** - Support `~/.ushrc` for user preferences

## References

- [OpenAPI Python Client](https://github.com/openapi-generators/openapi-python-client)
- [Typer CLI Framework](https://typer.tiangolo.com/)
- [Rich Terminal Formatting](https://rich.readthedocs.io/)
- [FastAPI OpenAPI](https://fastapi.tiangolo.com/advanced/extending-openapi/)
