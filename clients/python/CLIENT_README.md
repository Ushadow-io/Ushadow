# ushadow Python Client (Auto-Generated)

This directory contains an **auto-generated** Python client for the ushadow API, built from the OpenAPI specification.

## 🏗️ Architecture

```
clients/python/
├── ushadow_api_client/          # Auto-generated (DO NOT EDIT)
│   ├── api/default/             # Typed API methods
│   ├── models/                  # Pydantic models
│   └── client.py                # Base client
├── ushadow_auth_client.py       # Custom wrapper with auth
└── CLIENT_README.md             # This file
```

## ✨ Key Benefits

### 1. **Always in Sync with API**
Regenerate when API changes - no manual maintenance!

### 2. **Full Type Safety**
IDE autocomplete for all models and methods.

### 3. **No Manual Endpoint Maintenance**
All endpoints auto-generated from OpenAPI spec.

## 🔄 Regeneration Workflow

When your FastAPI backend changes:

```bash
# 1. Start your backend
cd ushadow && make up

# 2. Generate fresh OpenAPI spec
python scripts/generate_openapi_spec.py

# 3. Regenerate client
openapi-python-client generate \
  --path openapi.json \
  --output-path clients/python \
  --overwrite
```

See full documentation in the main README.
