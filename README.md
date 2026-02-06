dev branch is cutting edge
main is more stable


# ushadow

**AI Orchestration Platform** - Unified interface for Chronicle, MCP, Agent Zero, n8n, and more.

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

## What is ushadow?

ushadow is an AI orchestration platform that provides a unified dashboard and API for managing multiple AI services and tools:

- **Chronicle Integration** - Audio processing, transcription, conversations, and memory management
- **MCP (Model Context Protocol)** - Multi-protocol AI service integrations
- **Agent Zero** - Autonomous agent orchestration and management
- **n8n Workflows** - Visual workflow automation
- **Kubernetes Ready** - Enterprise deployment with K8s support

### Architecture

```
┌─────────────────────────────────┐
│   ushadow Frontend (React)      │
│   ├── Dashboard                 │
│   ├── Setup Wizard              │
│   ├── Conversations (Chronicle) │
│   ├── MCP Hub                   │
│   ├── Agent Orchestrator        │
│   └── Workflows (n8n)           │
└────────────┬────────────────────┘
             │
┌────────────┴────────────────────┐
│   ushadow Backend (FastAPI)     │
│   ├── API Gateway               │
│   ├── Chronicle Proxy           │
│   ├── MCP Service               │
│   ├── Agent Service             │
│   └── Workflow Service          │
└────────────┬────────────────────┘
             │
       ┌─────┴────────┐
       │              │
   Chronicle      MongoDB
   (External)     Redis
                  Qdrant
```

## Quick Start

### Prerequisites

Before getting started, ensure you have:

- **Docker & Docker Compose** - For running services in containers
- **Git** - For version control and worktree management
- **Python 3.12+** (optional) - Will be auto-installed via `uv` if not present
- **Node.js 18+** (optional) - Only needed for frontend development

**Note:** The startup scripts will automatically install `uv` (Python package manager) if not present. No manual Python setup required!

### Choose Your Installation Method

You have three options to get started with ushadow:

#### Option 1: Desktop Launcher (GUI - Recommended for Multi-Environment Development)

The ushadow Desktop Launcher provides a graphical interface for managing multiple parallel development environments with git worktrees.

```bash
cd ushadow/launcher
npm install
npm run dev
```

The launcher will:
- Auto-detect existing environments/worktrees
- Manage tmux sessions for each environment
- Start/stop Docker containers per environment
- Provide one-click access to terminals and VS Code

**See [ushadow/launcher/README.md](ushadow/launcher/README.md) for full launcher documentation.**

#### Option 2: Development Script (Quick Start for Development)

For a single development environment with hot-reload:

```bash
./dev.sh
```

This script will:
- Auto-install `uv` (Python package manager) if not present
- Generate secure credentials
- Set up Docker networks
- Start infrastructure services (Postgres, Keycloak, MongoDB, Redis, Qdrant)
- Start Chronicle backend
- Start ushadow application in **development mode** (with Vite HMR)
- Display access URLs and credentials

**Note:** `dev.sh` creates an environment named "ushadow" by default on ports 8080 (backend) and 3000 (frontend).

#### Option 3: Production Script (Quick Start for Testing)

For production-like builds without hot-reload:

```bash
./go.sh
```

This runs the same setup as `dev.sh` but builds optimized production bundles.

### Post-Installation Steps

#### 1. Complete the Quickstart Wizard

After services start, navigate to http://localhost:3000 to access the setup wizard. The wizard will guide you through:

1. **Initial Configuration** - Set up basic settings
2. **Service Selection** - Choose which services to enable
   - **Note:** You can skip starting services during the wizard and enable them later
   - Services can be started individually from the dashboard or using `make` commands
3. **API Keys** (optional) - Configure API keys for AI providers (OpenAI, Deepgram, etc.)

**You don't need to start all services to complete the wizard** - skip this step and configure services as needed later.

#### 2. Register a User with Keycloak

**IMPORTANT:** You must register a user with Keycloak before you can fully access the dashboard.

1. Wait for all services to be healthy (check with `make status`)
2. On the login screen, click "Register" and create your account
3. The first user created will have admin privileges

**Troubleshooting Keycloak Issues:**

If you encounter authentication problems, use these Makefile commands:

```bash
# Delete and recreate Keycloak realm
make keycloak-reset-realm

# Complete fresh start (stops Keycloak, clears DB, restarts, imports realm)
make keycloak-fresh-start
```

### Accessing ushadow

Once services are running and you've registered:

- **Dashboard**: http://localhost:3000
- **API Documentation**: http://localhost:8080/docs
- **Keycloak Admin**: http://localhost:8081 (admin/admin)

### Helpful Commands

The project includes two powerful tools for managing ushadow:

#### Makefile Commands

```bash
make help           # Show all available commands
make status         # Show running containers
make health         # Check service health
make logs           # View application logs
make logs-f         # Follow application logs in real-time
make restart        # Restart ushadow application
make clean          # Stop everything and remove volumes

# Service management
make svc-list                # List all services
make restart-chronicle       # Restart specific service
make restart-<service>       # Restart any service

# Keycloak realm management
make keycloak-reset-realm    # Delete and recreate realm
make keycloak-fresh-start    # Complete fresh Keycloak setup

# Testing
make test                    # Run unit tests
make test-integration        # Run integration tests
make test-robot              # Run Robot Framework E2E tests
```

#### ush Shell Tool

`ush` is a dynamic CLI that auto-discovers commands from the OpenAPI spec:

```bash
./ush                    # List all command groups
./ush shell              # Interactive mode with Tab completion
./ush health             # Check backend health
./ush whoami             # Show current user info
./ush services list      # List all services
./ush services start chronicle  # Start a service
```

**Interactive shell mode:**
```bash
./ush shell
ushadow> services <Tab>           # Shows available commands and services
ushadow> services chronicle <Tab> # Shows commands for chronicle
ushadow> services chronicle start # Start chronicle
ushadow> exit
```

See `./ush --help` for more information.

## Multi-Worktree Environments

ushadow supports running multiple isolated environments simultaneously using different worktrees:

```bash
# Clone into different worktrees
git worktree add ../ushadow-blue main
git worktree add ../ushadow-gold main
git worktree add ../ushadow-green main

# Each environment runs with different ports:
# blue:  backend=8080, frontend=3000, chronicle=8000
# gold:  backend=8180, frontend=3100, chronicle=8100
# green: backend=8280, frontend=3200, chronicle=8200
```

During quickstart, you'll be asked for:
- **Environment name**: e.g., `gold`
- **Port offset**: e.g., `100` for gold, `200` for green

All environments share the same infrastructure (MongoDB, Redis, Qdrant) but use isolated databases.

## Configuration

### Environment Variables

Copy `.env.template` to `.env` and customize:

```bash
cp .env.template .env
```

Key configuration sections:
- **Authentication**: Admin credentials, secrets
- **Databases**: MongoDB, Redis, Qdrant URLs
- **Ports**: Application port configuration
- **Chronicle**: Integration settings
- **MCP/Agent Zero/n8n**: Optional service URLs
- **API Keys**: OpenAI, Anthropic, Deepgram, etc.

### API Keys

Configure API keys for enhanced functionality:

1. Navigate to Settings in the ushadow dashboard
2. Add your API keys:
   - **OpenAI**: For AI memory extraction and chat
   - **Deepgram**: For audio transcription
   - **Anthropic**: For Claude models
   - **Mistral**: Alternative transcription

## Development

### Project Structure

```
ushadow/
├── backend/                 # FastAPI backend
│   ├── ushadow/
│   │   ├── api/            # API routes
│   │   ├── services/       # Business logic
│   │   ├── config/         # Configuration
│   │   └── models/         # Data models
│   ├── main.py             # Application entry point
│   ├── requirements.txt    # Python dependencies
│   └── Dockerfile
├── frontend/                # React frontend
│   ├── src/
│   │   ├── pages/          # Page components
│   │   ├── components/     # Reusable components
│   │   ├── services/       # API clients
│   │   ├── hooks/          # Custom React hooks
│   │   └── types/          # TypeScript types
│   ├── package.json
│   └── Dockerfile
├── deployment/
│   ├── docker-compose.infra.yml     # Infrastructure services
│   ├── docker-compose.chronicle.yml # Chronicle service
│   └── k8s/                         # Kubernetes manifests
├── docs/                    # Documentation
├── scripts/                 # Utility scripts
├── tests/                   # Test suites
├── docker-compose.yml       # Main application compose
├── quickstart.sh            # Quick start script
└── README.md
```

### Settings Architecture

ushadow uses a dual-layer configuration system:

```
┌─────────────────────────────────────────────────┐
│              SETTINGS ARCHITECTURE              │
├─────────────────────────────────────────────────┤
│                                                 │
│  .env file (infrastructure)                     │
│      ↓                                          │
│  InfraSettings (Pydantic BaseSettings)          │
│      → Database URLs, ports, auth tokens        │
│      → Loaded once at startup                   │
│                                                 │
│  YAML files (config/)                           │
│      ├── config.defaults.yaml (shipped)         │
│      ├── secrets.yaml (gitignored)              │
│      └── config.overrides.yaml (gitignored)     │
│      ↓                                          │
│  SettingsStore (OmegaConf)                      │
│      → API keys, provider selection, prefs      │
│      → Merged with override semantics           │
│      → Variable interpolation supported         │
│                                                 │
└─────────────────────────────────────────────────┘
```

**Key concepts:**
- **Infrastructure settings** (`.env`): Database URLs, Redis, ports - things that vary by deployment
- **Application settings** (YAML): API keys, feature flags, provider selection - things users configure
- **Secrets** (`secrets.yaml`): Sensitive values like API keys, stored separately and gitignored
- **OmegaConf interpolation**: Reference values across files with `${api_keys.openai_api_key}`

**API Endpoints:**
- `GET /api/settings/config` - Get merged config (secrets masked)
- `PUT /api/settings/config` - Update settings (auto-routes to correct file)
- `POST /api/settings/reset` - Reset all settings to defaults

### Local Development

#### Option 1: Using Make (Recommended)

```bash
# Install all dependencies (Python + Node.js)
make install

# Run tests
make test

# Run linters
make lint

# Format code
make format
```

#### Option 2: Manual Setup

**Backend:**

```bash
cd ushadow/backend

# Install uv if not present (macOS, Linux, WSL)
curl -LsSf https://astral.sh/uv/install.sh | sh

# On Windows (PowerShell)
# powershell -c "irm https://astral.sh/uv/install.ps1 | iex"

# Install dependencies (uv is 10-100x faster than pip!)
uv pip install -r requirements.txt

# Run backend
uvicorn main:app --reload --port 8080
```

**Frontend:**

```bash
cd frontend
npm install
npm run dev
```

**Note on Python Version:**
- Backend requires Python 3.12+
- uv can install and manage Python versions for you
- The `.python-version` file ensures consistency across environments

### Running Tests

```bash
# Backend tests
cd ushadow/backend
pytest

# Frontend tests
cd frontend
npm test

# Or use Make commands
make test
```

## Docker Commands

### Start All Services

```bash
./quickstart.sh
```

Or manually:

```bash
# Start infrastructure
docker compose -f deployment/docker-compose.infra.yml up -d

# Start Chronicle
docker compose -f deployment/docker-compose.chronicle.yml up -d

# Start ushadow
docker compose up -d
```

### Stop Services

```bash
# Stop ushadow only (keeps infrastructure running)
docker compose down

# Stop everything
docker compose down
docker compose -f deployment/docker-compose.chronicle.yml down
docker compose -f deployment/docker-compose.infra.yml down
```

### View Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f ushadow-backend
```

### Rebuild After Code Changes

```bash
docker compose up -d --build
```

## Kubernetes Deployment

Kubernetes manifests are available in `deployment/k8s/`:

```bash
# Apply infrastructure
kubectl apply -f deployment/k8s/infrastructure/

# Apply ushadow
kubectl apply -f deployment/k8s/ushadow/

# Check status
kubectl get pods -n ushadow
```

See [Kubernetes Deployment Guide](docs/kubernetes-deployment.md) for details.

## Service URLs

When running locally with default ports:

- **ushadow Dashboard**: http://localhost:3000
- **ushadow API**: http://localhost:8080
- **ushadow API Docs**: http://localhost:8080/docs
- **Chronicle API**: http://localhost:8000
- **MongoDB**: localhost:27017
- **Redis**: localhost:6379
- **Qdrant**: localhost:6333

Optional services (when enabled):
- **MCP Server**: http://localhost:8765
- **Agent Zero**: http://localhost:9000
- **n8n**: http://localhost:5678

## Features

### Current

- ✅ Multi-worktree environment isolation
- ✅ Chronicle integration for audio/conversations
- ✅ Secure authentication and session management
- ✅ Setup wizard for easy configuration
- ✅ Docker Compose orchestration
- ✅ Kubernetes deployment manifests
- ✅ Shared infrastructure (MongoDB, Redis, Qdrant)

### Roadmap

- 🚧 MCP (Model Context Protocol) integration
- 🚧 Agent Zero orchestration
- 🚧 n8n workflow automation
- 🚧 Advanced conversation analytics
- 🚧 Custom plugin system
- 🚧 Multi-tenant support

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

ushadow is licensed under the Apache License 2.0. See [LICENSE](LICENSE) for details.

## Third-Party Software

ushadow integrates with and uses components from:

- **Chronicle** - Audio processing and conversation management (MIT License)
- See [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) for full attribution

## Support

- **Documentation**: [docs/](docs/)
- **Issues**: https://github.com/Ushadow-io/Ushadow/issues
- **Discussions**: https://github.com/Ushadow-io/Ushadow/discussions

## Acknowledgments

ushadow is built on top of excellent open source projects:

- [Chronicle](https://github.com/chronicler-ai/chronicle) - Personal memory system
- [FastAPI](https://fastapi.tiangolo.com/) - Modern Python web framework
- [React](https://react.dev/) - UI framework
- [MongoDB](https://www.mongodb.com/) - Database
- [Redis](https://redis.io/) - Caching & queues
- [Qdrant](https://qdrant.tech/) - Vector database

---

**Made with ❤️ by the ushadow team**
