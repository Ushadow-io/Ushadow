# Services & Settings Architecture

> **Status: IMPLEMENTED** - The capability-based service composition pattern is live.

## Table of Contents

1. [Overview](#overview)
2. [Core Concepts](#core-concepts)
3. [File Structure](#file-structure)
4. [Settings System](#settings-system)
5. [Service Discovery](#service-discovery)
6. [The Wiring Flow](#the-wiring-flow)
7. [Adding New Components](#adding-new-components)
8. [Backend Components](#backend-components)
9. [API Reference](#api-reference)
10. [Docker Integration](#docker-integration)

---

## Overview

Ushadow uses **capability-based composition** to manage services. This pattern separates:

- **What a service needs** (capabilities like LLM, transcription)
- **Who provides it** (providers like OpenAI, Deepgram, Ollama)
- **How it's configured** (settings stored in YAML files and MongoDB)

This decoupling allows users to swap providers without touching service code. Chronicle doesn't care if you use OpenAI or Anthropic for LLM - it just declares "I need an LLM" and the system wires in the right credentials.

### The Three Layers

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           CAPABILITIES                                   │
│  Abstract requirements a service may have                                │
│  ┌────────────┐  ┌────────────────┐  ┌────────────┐  ┌────────────┐     │
│  │    llm     │  │ transcription  │  │   memory   │  │ speaker_   │     │
│  │            │  │                │  │            │  │ recognition│     │
│  └────────────┘  └────────────────┘  └────────────┘  └────────────┘     │
│         │                │                │                │            │
│         ▼                ▼                ▼                ▼            │
├─────────────────────────────────────────────────────────────────────────┤
│                            PROVIDERS                                     │
│  Concrete implementations of capabilities                                │
│  ┌──────────────────────────────┐  ┌──────────────────────────────┐     │
│  │ LLM Providers                │  │ Transcription Providers      │     │
│  │ • openai (cloud)             │  │ • deepgram (cloud)           │     │
│  │ • anthropic (cloud)          │  │ • whisper-local (local)      │     │
│  │ • ollama (local)             │  │ • mistral-voxtral (cloud)    │     │
│  │ • openai-compatible (local)  │  │                              │     │
│  └──────────────────────────────┘  └──────────────────────────────┘     │
│         │                                   │                           │
│         ▼                                   ▼                           │
├─────────────────────────────────────────────────────────────────────────┤
│                            SERVICES                                      │
│  Applications that USE capabilities                                      │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ Chronicle                                                           │ │
│  │ uses: [llm, transcription, memory]                                  │ │
│  │                                                                     │ │
│  │   LLM_API_KEY ◄── (resolved from selected provider)                │ │
│  │   DEEPGRAM_API_KEY ◄── (resolved from selected provider)           │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Core Concepts

### Capabilities

A **capability** is an abstract interface that services can depend on. Capabilities are defined in `config/capabilities.yaml` and specify what types of credentials they provide:

```yaml
# config/capabilities.yaml
capabilities:
  llm:
    description: "Large Language Model providers"

    provides:
      api_key:
        type: secret
        description: "API key for the LLM provider"
      base_url:
        type: url
        description: "Base URL for API requests"
      model:
        type: string
        description: "Model identifier"
```

**Note:** Capabilities don't define env var names - each provider declares its own. Default provider selections are in `config/service-defaults.yaml` under `selected_providers`.

### Providers

A **provider** implements a capability with concrete credentials. Each credential declares its own `env_var` name. Providers are defined in `config/providers/{capability}.yaml`:

```yaml
# config/providers/llm.yaml
capability: llm

providers:
  - id: openai
    name: "OpenAI"
    mode: cloud

    credentials:
      api_key:
        env_var: OPENAI_API_KEY                   # Env var name this provider exposes
        settings_path: api_keys.openai_api_key   # Where to read the value
        link: "https://platform.openai.com/api-keys"
        required: true
      base_url:
        env_var: OPENAI_BASE_URL
        value: "https://api.openai.com/v1"       # Literal value
      model:
        env_var: OPENAI_MODEL
        settings_path: llm.openai_model
        default: "gpt-4o-mini"

  - id: ollama
    name: "Ollama"
    mode: local

    credentials:
      api_key:
        env_var: OLLAMA_API_KEY
        value: ""                                 # No API key needed
      base_url:
        env_var: OLLAMA_BASE_URL
        value: "http://ollama:11434"
      model:
        env_var: OLLAMA_MODEL
        default: "llama3.1:latest"
```

**Key insight:** Each provider exposes its native env var names. Services receive these directly and only need `env_mapping` if they expect different names.

### Services

A **service** declares what capabilities it uses. Services are defined in `config/services/{service-id}.yaml`:

```yaml
# config/services/chronicle.yaml
id: chronicle
name: "Chronicle"
description: "AI-powered conversation processing"

# What capabilities this service needs
uses:
  - capability: llm
    required: true
    purpose: "Conversation analysis and summarization"
    # No env_mapping needed - Chronicle uses OpenAI SDK natively
    # Provider's env vars (OPENAI_API_KEY, etc.) pass through directly

  - capability: transcription
    required: true
    # No env_mapping - Chronicle expects Deepgram env vars

  - capability: memory
    required: false                        # Optional capability

# Docker configuration
docker:
  image: ghcr.io/chronicler-ai/chronicle:latest
  compose_file: compose/chronicle-compose.yaml
  service_name: chronicle-backend

# Service-specific config (not from capabilities)
config:
  - key: mongodb_uri
    env_var: MONGODB_URI
    settings_path: infrastructure.mongodb_uri
    default: "mongodb://mongo:27017"
```

**When is env_mapping needed?** Only when the service expects different env var names than what the provider exposes:

```yaml
# OpenMemory needs EMBEDDING_MODEL but provider gives OPENAI_MODEL
uses:
  - capability: llm
    env_mapping:
      OPENAI_MODEL: EMBEDDING_MODEL   # Override just this one
```

### Settings

**Settings** store actual values (API keys, preferences, etc.). They're loaded from multiple sources and merged:

```
Load Order (later overrides earlier):
1. config.defaults.yaml    - General app settings (committed)
2. service-defaults.yaml   - Provider selection, default services (committed)
3. secrets.yaml            - API keys (gitignored)
4. MongoDB                 - Runtime changes via UI
```

---

## File Structure

```
config/
├── config.defaults.yaml          # General app settings (committed)
├── service-defaults.yaml         # Provider selection, default services (committed)
├── secrets.yaml                  # API keys (gitignored)
│
├── capabilities.yaml             # Capability definitions (llm, transcription, memory)
│
├── providers/                    # Provider implementations per capability
│   ├── llm.yaml                 # openai, anthropic, ollama, openai-compatible
│   ├── transcription.yaml       # deepgram, whisper-local, mistral-voxtral
│   └── memory.yaml              # openmemory, cognee, mem0-cloud
│
├── services/                     # Service definitions (what gets deployed)
│   ├── chronicle.yaml           # uses: [llm, transcription, memory]
│   ├── chronicle-webui.yaml     # UI only (no capabilities)
│   ├── openmemory.yaml          # uses: [llm]
│   └── openmemory-ui.yaml       # UI only
│
└── compose/                      # Docker compose files
    ├── chronicle-compose.yaml
    └── openmemory-compose.yaml
```

---

## Service Discovery

### Where Services Come From

**Available services** are discovered by scanning `config/services/*.yaml`. Each YAML file defines one service.

**Default services** for the quickstart wizard are those with `ui.is_default: true` in their definition:

```yaml
# config/services/chronicle.yaml
ui:
  is_default: true      # Included in quickstart wizard
  wizard_order: 1       # Order in wizard (lower = earlier)
```

**Enabled services** are tracked in MongoDB under `installed_services.{service_id}.enabled`.

### env_mapping in Services

The `env_mapping` in a service's `uses:` section maps **provider env vars → service-expected env vars**:

```yaml
# OpenMemory expects EMBEDDING_MODEL, but provider gives OPENAI_MODEL
uses:
  - capability: llm
    env_mapping:
      OPENAI_MODEL: EMBEDDING_MODEL    # Provider env var → Service env var
```

**In most cases, no mapping is needed!** Services typically use the same env var names as their native provider:
- Chronicle uses OpenAI SDK → expects `OPENAI_API_KEY` → openai provider gives `OPENAI_API_KEY` ✓
- Chronicle uses Deepgram SDK → expects `DEEPGRAM_API_KEY` → deepgram provider gives `DEEPGRAM_API_KEY` ✓

`env_mapping` is only needed when:
- **Provider** exposes one name (e.g., `OPENAI_MODEL`)
- **Service** expects a different name (e.g., `EMBEDDING_MODEL`)
- **env_mapping** bridges them

---

## Settings System

### OmegaConf-Based Settings

Settings are managed by `OmegaConfSettingsManager` which uses [OmegaConf](https://omegaconf.readthedocs.io/) for:

- **Automatic merging** of multiple config sources
- **Dot notation access** (`api_keys.openai_api_key`)
- **Variable interpolation** (`${api_keys.openai_api_key}`)

### Settings Paths

Values are accessed via dot notation paths:

| Path | Description | Example Value |
|------|-------------|---------------|
| `api_keys.openai_api_key` | OpenAI API key | `sk-...` |
| `api_keys.deepgram_api_key` | Deepgram API key | `...` |
| `llm.openai_model` | OpenAI model preference | `gpt-4o-mini` |
| `selected_providers.llm` | User's selected LLM provider | `openai` |
| `selected_providers.transcription` | User's selected transcription provider | `deepgram` |
| `wizard_mode` | Wizard mode (determines defaults) | `quickstart` |
| `infrastructure.mongodb_uri` | MongoDB connection | `mongodb://mongo:27017` |
| `security.auth_secret_key` | JWT signing key | `abc123...` |

### Config Files

**config.defaults.yaml** (committed) - General app settings:
```yaml
# General application settings
llm:
  openai_model: gpt-4o-mini
  ollama_model: llama3.1:latest

transcription:
  provider: deepgram
  language: en

infrastructure:
  mongodb_uri: mongodb://mongo:27017
  redis_url: redis://redis:6379/0
  qdrant_base_url: qdrant
  qdrant_port: "6333"
```

**service-defaults.yaml** (committed) - Provider and service defaults:
```yaml
# Provider selection and default services
wizard_mode: quickstart

selected_providers:
  llm: openai
  transcription: deepgram
  memory: openmemory

default_services:
  - chronicle
  - chronicle-webui
  - openmemory
  - openmemory-ui
```

**secrets.yaml** (gitignored):
```yaml
# User's API keys
api_keys:
  openai_api_key: sk-...
  deepgram_api_key: ...
  anthropic_api_key: ...

admin:
  password: ...

security:
  auth_secret_key: ...
```

---

## The Wiring Flow

When a service is started, here's how credentials get resolved:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 1. USER CLICKS "START" on Chronicle                                     │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 2. DockerManager calls CapabilityResolver.resolve_for_service()         │
│                                                                          │
│    service_id = "chronicle"                                              │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 3. CapabilityResolver loads config/services/chronicle.yaml              │
│                                                                          │
│    uses:                                                                 │
│      - capability: llm                                                   │
│        required: true                                                    │
│        # No env_mapping - Chronicle uses OpenAI SDK natively             │
│                                                                          │
│      - capability: transcription                                         │
│        required: true                                                    │
│        # No env_mapping - Chronicle uses Deepgram SDK natively           │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 4. For each capability, resolver looks up selected_providers            │
│                                                                          │
│    settings.get("selected_providers.llm") → "openai"                     │
│    settings.get("selected_providers.transcription") → "deepgram"         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 5. Resolver loads provider credentials from config/providers/llm.yaml   │
│                                                                          │
│    Provider "openai":                                                    │
│      credentials:                                                        │
│        api_key:                                                          │
│          env_var: OPENAI_API_KEY   ◄── Provider declares its env var    │
│          settings_path: api_keys.openai_api_key                          │
│        base_url:                                                         │
│          env_var: OPENAI_BASE_URL                                        │
│          value: "https://api.openai.com/v1"                              │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 6. Resolver reads actual values from settings                            │
│                                                                          │
│    settings.get("api_keys.openai_api_key") → "sk-abc123..."              │
│    settings.get("api_keys.deepgram_api_key") → "dg-xyz789..."            │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 7. Resolver uses provider's env_var directly (no mapping needed!)       │
│                                                                          │
│    Provider openai.api_key.env_var = OPENAI_API_KEY                      │
│    → env["OPENAI_API_KEY"] = "sk-abc123..."                              │
│                                                                          │
│    Provider deepgram.api_key.env_var = DEEPGRAM_API_KEY                  │
│    → env["DEEPGRAM_API_KEY"] = "dg-xyz789..."                            │
│                                                                          │
│    (env_mapping only consulted if service needs to override)             │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 8. Final resolved env vars returned to DockerManager:                    │
│                                                                          │
│    {                                                                     │
│      "OPENAI_API_KEY": "sk-abc123...",                                   │
│      "OPENAI_BASE_URL": "https://api.openai.com/v1",                     │
│      "OPENAI_MODEL": "gpt-4o-mini",                                      │
│      "DEEPGRAM_API_KEY": "dg-xyz789...",                                 │
│      "MONGODB_URI": "mongodb://mongo:27017",                             │
│      ...                                                                 │
│    }                                                                     │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 9. DockerManager writes env to file, runs docker compose up             │
│                                                                          │
│    Writes: /config/chronicle.env                                         │
│    Runs: docker compose -f compose/chronicle-compose.yaml up -d          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Adding New Components

### Adding a New Provider

To add a new LLM provider (e.g., Google Gemini):

1. Edit `config/providers/llm.yaml`:

```yaml
providers:
  # ... existing providers ...

  - id: google-gemini
    name: "Google Gemini"
    description: "Google's Gemini models"
    mode: cloud

    credentials:
      api_key:
        env_var: GOOGLE_API_KEY               # Env var this provider exposes
        settings_path: api_keys.google_api_key
        label: "Google AI API Key"
        link: "https://aistudio.google.com/apikey"
        required: true
      base_url:
        env_var: GOOGLE_BASE_URL
        value: "https://generativelanguage.googleapis.com/v1beta"
      model:
        env_var: GOOGLE_MODEL
        settings_path: llm.google_model
        default: "gemini-pro"

    ui:
      icon: google
      tags: ["llm", "cloud", "gemini"]
```

2. Add default settings to `config.defaults.yaml`:

```yaml
llm:
  google_model: gemini-pro
```

3. User adds their API key to `secrets.yaml`:

```yaml
api_keys:
  google_api_key: AIza...
```

**No code changes required!** The provider is automatically loaded.

**Note:** Services using this provider will receive `GOOGLE_API_KEY`, `GOOGLE_BASE_URL`, `GOOGLE_MODEL` env vars. If a service expects different names (like `OPENAI_API_KEY`), it needs `env_mapping`.

### Adding a New Service

To add a new service that uses capabilities:

1. Create `config/services/my-service.yaml`:

```yaml
id: my-service
name: "My Service"
description: "Description of what it does"

uses:
  - capability: llm
    required: true
    # No env_mapping needed if your service uses OpenAI SDK (OPENAI_API_KEY)
    # Only add env_mapping if your service expects different env var names:
    # env_mapping:
    #   OPENAI_API_KEY: MY_LLM_KEY     # Provider env → Your expected env

docker:
  image: myorg/my-service:latest
  compose_file: compose/my-service-compose.yaml
  service_name: my-service

  ports:
    - container: 8000
      host: 8000
      protocol: http

  health:
    http_get: /health
    port: 8000

# Service-specific config
config:
  - key: some_setting
    env_var: MY_SETTING
    settings_path: service_preferences.my_service.some_setting
    default: "default_value"

ui:
  icon: box
  category: my_category
  is_default: false
  tags: ["my-tag"]
```

2. Create `compose/my-service-compose.yaml`:

```yaml
services:
  my-service:
    image: myorg/my-service:${MY_SERVICE_TAG:-latest}
    container_name: ${COMPOSE_PROJECT_NAME:-ushadow}-my-service
    env_file:
      - ${PROJECT_ROOT}/.env
      - ${PROJECT_ROOT}/config/my-service.env
    ports:
      - "${MY_SERVICE_PORT:-8000}:8000"
    networks:
      - infra-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 10s
      timeout: 5s
      retries: 5

networks:
  infra-network:
    name: infra-network
    external: true
```

### Adding a New Capability

To add a new capability type:

1. Define it in `config/capabilities.yaml`:

```yaml
capabilities:
  # ... existing capabilities ...

  tts:  # Text-to-speech capability
    description: "Text-to-speech synthesis services"

    provides:
      api_key:
        type: secret
        description: "API key for TTS service"
      server_url:
        type: url
        description: "TTS server endpoint"
      voice:
        type: string
        description: "Voice identifier"
```

2. Add default provider selection to `config/service-defaults.yaml`:

```yaml
selected_providers:
  # ... existing selections ...
  tts: elevenlabs
```

3. Create `config/providers/tts.yaml`:

```yaml
capability: tts

providers:
  - id: elevenlabs
    name: "ElevenLabs"
    mode: cloud
    credentials:
      api_key:
        env_var: ELEVENLABS_API_KEY
        settings_path: api_keys.elevenlabs_api_key
        required: true
      server_url:
        env_var: ELEVENLABS_SERVER_URL
        value: "https://api.elevenlabs.io/v1"
      voice:
        env_var: ELEVENLABS_VOICE
        settings_path: tts.elevenlabs_voice
        default: "Rachel"

  - id: coqui
    name: "Coqui TTS"
    mode: local
    docker:
      image: coqui/tts:latest
      compose_file: compose/coqui-compose.yaml
      service_name: coqui
    credentials:
      api_key:
        env_var: COQUI_API_KEY
        value: ""
      server_url:
        env_var: COQUI_SERVER_URL
        value: "http://coqui:5000"
      voice:
        env_var: COQUI_VOICE
        default: "en/vctk/vits"
```

---

## Backend Components

### Component Overview

| Component | File | Purpose |
|-----------|------|---------|
| `ProviderRegistry` | `src/services/provider_registry.py` | Loads providers from YAML |
| `CapabilityResolver` | `src/services/capability_resolver.py` | Wires providers → services |
| `ServiceRegistry` | `src/services/service_registry.py` | Loads service definitions |
| `OmegaConfSettingsManager` | `src/services/omegaconf_settings.py` | Manages merged settings |
| `DockerManager` | `src/services/docker_manager.py` | Starts/stops containers |

### ProviderRegistry

Loads and queries provider definitions:

```python
registry = get_provider_registry()

# Get all providers for a capability
llm_providers = registry.get_providers_for_capability("llm")

# Get specific provider
openai = registry.get_provider("openai")

# Get default provider for mode
default = registry.get_default_provider("llm", mode="cloud")  # → openai
```

### CapabilityResolver

The core component that wires everything together:

```python
resolver = get_capability_resolver()

# Resolve all env vars for a service
env = await resolver.resolve_for_service("chronicle")
# Returns: {"OPENAI_API_KEY": "sk-...", "DEEPGRAM_API_KEY": "...", ...}

# Validate a service can start
validation = await resolver.validate_service("chronicle")
# Returns: {"can_start": true, "missing_capabilities": [], ...}
```

### ServiceRegistry

Loads service definitions:

```python
registry = get_service_registry()

# Get all services
services = registry.get_services()

# Get specific service
chronicle = registry.get_service("chronicle")

# Get services for quickstart wizard
defaults = registry.get_quickstart_services()
```

### OmegaConfSettingsManager

Manages the settings with automatic merging:

```python
settings = get_omegaconf_settings()

# Get a value (merges all sources automatically)
api_key = await settings.get("api_keys.openai_api_key")

# Update a value (saves to MongoDB)
await settings.update({"selected_providers.llm": "anthropic"})

# Get full config
config = await settings.load_config()
```

---

## API Reference

### Provider Selection

```
GET  /api/providers/capabilities
```
Returns all capabilities with their available providers.

```
GET  /api/providers/selected
```
Returns current provider selections: `{"llm": "openai", "transcription": "deepgram"}`

```
PUT  /api/providers/selected
{
  "llm": "anthropic",
  "transcription": "whisper-local"
}
```
Update provider selections.

```
POST /api/providers/apply-defaults/{mode}
```
Apply default providers for `quickstart`, `local`, or `custom` mode.

### Service Validation

```
GET  /api/providers/validate/{service_id}
```
Check if a service can start:
```json
{
  "can_start": false,
  "missing_capabilities": [],
  "missing_credentials": [
    {
      "capability": "llm",
      "provider": "openai",
      "credential": "api_key",
      "settings_path": "api_keys.openai_api_key",
      "link": "https://platform.openai.com/api-keys",
      "label": "OpenAI API Key"
    }
  ],
  "warnings": []
}
```

### Docker Operations

```
POST /api/docker/{service_id}/start
```
Start a service container.

```
POST /api/docker/{service_id}/stop
```
Stop a service container.

```
GET  /api/docker/status
```
Get status of all service containers.

---

## Docker Integration

### How Docker Compose Works

Services run via Docker Compose. The backend container itself runs `docker compose` commands to manage service containers.

**Key challenge**: The backend runs inside a container, but Docker Compose runs on the host. Volume paths must be **host paths**, not container paths.

**Solution**: `PROJECT_ROOT` environment variable bridges this gap.

### Compose File Pattern

```yaml
# compose/chronicle-compose.yaml
services:
  chronicle-backend:
    image: ghcr.io/chronicler-ai/chronicle:${CHRONICLE_TAG:-latest}
    container_name: ${COMPOSE_PROJECT_NAME:-ushadow}-chronicle-backend
    env_file:
      - ${PROJECT_ROOT}/.env                    # Host path via PROJECT_ROOT
      - ${PROJECT_ROOT}/config/chronicle.env    # Generated by resolver
    volumes:
      - ${PROJECT_ROOT}/config/config.yml:/app/config.yml:ro
    networks:
      - infra-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]

networks:
  infra-network:
    name: infra-network
    external: true
```

### Environment File Generation

When starting a service, `DockerManager`:

1. Calls `CapabilityResolver.resolve_for_service()`
2. Writes resolved env vars to `/config/{service_id}.env`
3. Runs `docker compose -f {compose_file} up -d {service_name}`

The compose file's `env_file:` directive loads the generated env file.

### Container Naming

Containers get prefixed with the project name:
- Compose project: `ushadow-wiz-frame`
- Service name: `chronicle-backend`
- Container name: `ushadow-wiz-frame-chronicle-backend`

The backend finds containers by Docker Compose labels, not names:
```python
containers = client.containers.list(
    filters={"label": f"com.docker.compose.service={service_name}"}
)
```

---

## Troubleshooting

### Service Won't Start

1. **Check validation**: `GET /api/providers/validate/{service_id}`
2. **Missing API key**: Add to `config/secrets.yaml`
3. **Wrong provider selected**: Check `selected_providers` in settings

### Env Vars Not Injected

1. **Check the generated env file**: `cat /config/{service_id}.env`
2. **Check resolver output**: Add logging to `CapabilityResolver.resolve_for_service()`
3. **Cache issue**: Call `resolver.reload()` to clear caches

### Container Name Not Found

If you see 404 errors when stopping services:
- The container has project prefix (e.g., `ushadow-wiz-frame-chronicle-backend`)
- The code should search by compose label, not container name

### Volume Mount Errors

If you see "file not found" or "IsADirectoryError":
- Volume paths must be **host paths**, not container paths
- Use `${PROJECT_ROOT}` in compose files to reference host paths
- Ensure `PROJECT_ROOT` is set in `.env`
