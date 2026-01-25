# Ushadow Platform Overview

> **A Comprehensive Guide to the AI Orchestration Platform**

Ushadow is a powerful, enterprise-grade AI orchestration platform that serves as a unified control center for managing multiple AI services, tools, and integrations. Built with modern full-stack architecture, it provides seamless integration with Chronicle, MCP (Model Context Protocol), Agent Zero, n8n workflows, and custom AI services.

---

## 📑 Table of Contents

### Getting Started
- [What is Ushadow?](#what-is-ushadow)
- [Key Features](#key-features)
- [Architecture at a Glance](#architecture-at-a-glance)
- [Quick Start](#quick-start)

### Core Components
- [Backend (FastAPI)](#backend-fastapi)
- [Frontend (React)](#frontend-react)
- [Desktop Launcher (Tauri)](#desktop-launcher-tauri)
- [Mobile App (React Native)](#mobile-app-react-native)

### Platform Features
- [Service Orchestration](#service-orchestration)
- [Capability-Based Composition](#capability-based-composition)
- [Settings Architecture](#settings-architecture)
- [Multi-Environment Support](#multi-environment-support)
- [Wizard System](#wizard-system)
- [Feature Flags](#feature-flags)

### Integration Guide
- [Integrated Services](#integrated-services)
- [Adding New Services](#adding-new-services)
- [Configuration Management](#configuration-management)
- [Authentication & Security](#authentication--security)

### Development
- [Directory Structure](#directory-structure)
- [Development Workflow](#development-workflow)
- [Testing Strategy](#testing-strategy)
- [Code Quality Tools](#code-quality-tools)

### Deployment
- [Docker Compose](#docker-compose-deployment)
- [Kubernetes](#kubernetes-deployment)
- [Multi-Worktree Environments](#multi-worktree-environments)

### Reference
- [Technology Stack](#technology-stack)
- [API Endpoints](#api-endpoints)
- [Key Documentation Files](#key-documentation-files)
- [Troubleshooting](#troubleshooting)

---

## What is Ushadow?

Ushadow is an **AI Orchestration Platform** that simplifies the complexity of managing multiple AI services and tools. Think of it as a centralized hub that:

- **Orchestrates Services**: Manages lifecycle of Chronicle, MCP servers, Agent Zero, n8n, and custom services
- **Unifies Configuration**: Single place to manage API keys, provider selections, and settings
- **Abstracts Complexity**: Hides infrastructure details behind intuitive wizards and UI
- **Enables Flexibility**: Supports Docker, Kubernetes, and hybrid deployments
- **Scales Intelligently**: From local development to enterprise production

### Why Ushadow is Powerful

1. **Capability-Based Architecture**: Services declare what they need (e.g., "an LLM") and Ushadow automatically wires them to your chosen provider (OpenAI, Anthropic, Ollama, etc.)

2. **Multi-Environment Isolation**: Run multiple instances (dev, staging, prod) simultaneously with different configurations using isolated worktrees

3. **Comprehensive Integration**: Built-in support for Chronicle conversations, memory management, speaker recognition, workflow automation, and more

4. **Developer-Friendly**: Rich development tools, hot-reload, comprehensive testing, and clear separation of concerns

5. **Production-Ready**: Enterprise deployment support with Kubernetes, monitoring, health checks, and zero-downtime updates

---

## Key Features

### 🎯 Core Capabilities
- **Service Discovery & Management**: Automatically discover, install, configure, and monitor AI services
- **Multi-Service Orchestration**: Coordinate dependencies between Chronicle, MCP, databases, and custom services
- **Unified Settings**: Single source of truth for API keys, provider selections, and configuration
- **Authentication & Authorization**: Secure user management with JWT tokens
- **Real-Time Monitoring**: Service health checks, logs, and performance metrics

### 🧠 AI Integration
- **Chronicle Integration**: Full conversation UI, queue management, and recording capabilities
- **Memory Management**: Extract, organize, and search conversation memories
- **Speaker Recognition**: Identify and track speakers in conversations
- **LLM Provider Abstraction**: Seamlessly switch between OpenAI, Anthropic, Ollama, and more

### 🚀 Advanced Features
- **Wizard System**: Multi-step guided setup for complex configurations
- **Feature Flags**: Progressive rollout and A/B testing capabilities
- **Dual-Stream Audio Recording**: Browser-based audio capture for Chronicle
- **Workflow Automation**: n8n integration for visual workflow design
- **Agent Orchestration**: Agent Zero integration for autonomous AI agents
- **MCP Hub**: Model Context Protocol server management

### 🏗️ Infrastructure
- **Docker Compose**: Simple local development and testing
- **Kubernetes**: Enterprise-scale production deployment
- **Tailscale Integration**: Secure networking and remote access
- **Multi-Worktree Environments**: Isolated dev/staging/prod on same machine

---

## Architecture at a Glance

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Client Applications                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ Web App      │  │ Desktop App  │  │ Mobile App   │              │
│  │ (React)      │  │ (Tauri)      │  │ (React Nat.) │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
└───────────────────────────┬──────────────────────────────────────────┘
                            │ HTTPS/WebSocket
┌───────────────────────────▼──────────────────────────────────────────┐
│                    Ushadow Backend (FastAPI)                          │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ API Layer (routers/)                                           │  │
│  │  • Authentication  • Services  • Settings  • Chat             │  │
│  │  • Deployments  • Kubernetes  • Docker  • Feature Flags       │  │
│  └────────────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ Business Logic (services/)                                     │  │
│  │  • Service Orchestrator  • Capability Resolver                │  │
│  │  • Docker Manager  • Kubernetes Manager                       │  │
│  │  • Provider Registry  • Deployment Manager                    │  │
│  └────────────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ Configuration Layer                                            │  │
│  │  • OmegaConf Settings  • Secret Management                    │  │
│  └────────────────────────────────────────────────────────────────┘  │
└───────────────────────────┬──────────────────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────────────────┐
│                  Infrastructure & Services                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ MongoDB      │  │ Redis        │  │ Qdrant       │              │
│  │ (Persistent) │  │ (Cache)      │  │ (Vectors)    │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ Chronicle    │  │ MCP Servers  │  │ Agent Zero   │              │
│  │ (Optional)   │  │ (Optional)   │  │ (Optional)   │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
└───────────────────────────────────────────────────────────────────────┘
```

### Key Architectural Decisions

1. **Separation of Concerns**: Clear boundaries between API, business logic, and data layers
2. **Async-First**: FastAPI + async MongoDB for high concurrency
3. **Configuration-Driven**: YAML-based service definitions enable no-code service additions
4. **Capability Abstraction**: Services don't hardcode provider choices
5. **Polyglot Friendly**: REST APIs enable clients in any language

---

## Backend (FastAPI)

The backend is the brain of Ushadow, handling all orchestration, configuration, and business logic.

### What Makes It Powerful

- **Async Performance**: Built on FastAPI with async/await throughout for high concurrency
- **Type Safety**: Pydantic models ensure data validation and type checking
- **Modular Design**: Clear separation between routers (API), services (logic), and models (data)
- **Extensible**: Adding new endpoints or services requires minimal code changes

### Directory Structure

```
backend/src/
├── routers/              # HTTP API endpoints (thin controllers)
│   ├── auth.py          # User authentication & registration
│   ├── services.py      # Service lifecycle management
│   ├── settings.py      # Configuration CRUD
│   ├── chat.py          # Chat/conversation APIs
│   ├── chronicle.py     # Chronicle-specific endpoints
│   ├── deployments.py   # Multi-environment management
│   ├── kubernetes.py    # K8s cluster operations
│   ├── docker.py        # Docker container operations
│   ├── providers.py     # Provider selection & management
│   ├── wizard.py        # Wizard backend logic
│   └── feature_flags.py # Feature flag APIs
│
├── services/             # Business logic layer
│   ├── service_orchestrator.py   # Main service coordination
│   ├── capability_resolver.py    # Maps capabilities → providers
│   ├── docker_manager.py         # Docker operations
│   ├── kubernetes_manager.py     # K8s API client
│   ├── provider_registry.py      # In-memory provider catalog
│   ├── deployment_manager.py     # Multi-deployment handling
│   ├── auth.py                   # JWT & session management
│   ├── llm_client.py             # LLM provider abstraction
│   └── feature_flags.py          # Feature flag service
│
├── config/               # Configuration management
│   ├── omegaconf_settings.py    # OmegaConf integration
│   └── secrets.py               # Secret handling
│
├── models/               # Data models (Pydantic/Beanie)
│   ├── user.py          # User document
│   ├── service.py       # Service model
│   ├── deployment.py    # Deployment model
│   ├── provider.py      # Provider model
│   └── kubernetes.py    # K8s cluster model
│
└── utils/                # Shared utilities
```

### Key Components

#### 1. Service Orchestrator (`services/service_orchestrator.py`)
**Purpose**: Centralized facade for all service operations

**Capabilities**:
- Discover services from Docker Compose files
- Start/stop/restart containers
- Inject environment variables with capability resolution
- Monitor health and status
- Handle port conflict detection

**Example**:
```python
orchestrator = ServiceOrchestrator()
services = await orchestrator.list_services()
await orchestrator.start_service("chronicle")
status = await orchestrator.get_service_status("chronicle")
```

#### 2. Capability Resolver (`services/capability_resolver.py`)
**Purpose**: Translates abstract capabilities to concrete provider configurations

**Flow**:
```
Service: "I need llm capability"
    ↓
Capability Resolver: "User selected OpenAI"
    ↓
Config: Inject OPENAI_API_KEY into service environment
```

**Why It's Powerful**: Services never hardcode provider choices. Switching from OpenAI to Anthropic requires zero code changes.

#### 3. Docker Manager (`services/docker_manager.py`)
**Purpose**: Wrapper around Docker SDK for container lifecycle

**Features**:
- Container CRUD operations
- Log streaming
- Health monitoring
- Volume management
- Network configuration

#### 4. Settings Management (`config/omegaconf_settings.py`)
**Purpose**: Hierarchical configuration with merging and interpolation

**Power Features**:
- YAML file merging (defaults → environment → user overrides)
- Variable interpolation (`${env.PORT}`)
- Secret management (separate encrypted storage)
- Dynamic updates without restart

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/auth/register` | POST | User registration |
| `/api/auth/login` | POST | User login |
| `/api/services/` | GET | List all services |
| `/api/services/{id}/start` | POST | Start a service |
| `/api/services/{id}/stop` | POST | Stop a service |
| `/api/settings/` | GET | Get all settings |
| `/api/settings/` | PUT | Update settings |
| `/api/chat/messages` | POST | Send chat message |
| `/api/deployments/` | GET | List deployments |
| `/api/kubernetes/clusters` | GET | List K8s clusters |
| `/api/feature-flags/` | GET | Get feature flags |

**Full API Documentation**: See `SERVICES_ARCHITECTURE.md`

---

## Frontend (React)

The frontend provides an intuitive, responsive UI for managing the entire Ushadow platform.

### What Makes It Powerful

- **Modern React 19**: Latest features with concurrent rendering
- **Type-Safe**: Full TypeScript coverage prevents runtime errors
- **Component Library**: Reusable, tested components with consistent UX
- **Feature Flags**: Progressive rollout of new features
- **Testing-Ready**: Every interactive element has `data-testid` for E2E tests

### Directory Structure

```
frontend/src/
├── pages/                    # Route-level components
│   ├── Dashboard.tsx        # Main dashboard with stats
│   ├── ServicesPage.tsx     # Service management UI
│   ├── SettingsPage.tsx     # Settings & API keys
│   ├── ChroniclePage.tsx    # Chronicle conversations
│   ├── ChatPage.tsx         # Chat interface
│   ├── MemoriesPage.tsx     # Memory management
│   ├── MCPPage.tsx          # MCP hub (feature-flagged)
│   ├── AgentZeroPage.tsx    # Agent orchestration (feature-flagged)
│   ├── N8NPage.tsx          # n8n workflows (feature-flagged)
│   └── ClusterPage.tsx      # K8s cluster visualization
│
├── wizards/                  # Multi-step setup wizards
│   ├── QuickstartWizard.tsx
│   ├── ChronicleWizard.tsx
│   ├── MemoryWizard.tsx
│   ├── SpeakerRecognitionWizard.tsx
│   ├── TailscaleWizard.tsx
│   └── registry.ts          # Wizard discovery
│
├── components/               # Reusable UI components
│   ├── layout/              # Layout & navigation
│   │   ├── Layout.tsx       # Main app layout
│   │   └── EnvironmentFooter.tsx
│   ├── services/            # Service components
│   │   ├── ServiceCard.tsx
│   │   ├── ServiceStatusBadge.tsx
│   │   └── ServiceConfigForm.tsx
│   ├── settings/            # Settings components
│   │   ├── SecretInput.tsx
│   │   ├── SettingField.tsx
│   │   └── SettingsSection.tsx
│   ├── chronicle/           # Chronicle components
│   │   ├── ChronicleConversations.tsx
│   │   └── ChronicleQueue.tsx
│   ├── Modal.tsx            # Reusable modal
│   └── ConfirmDialog.tsx    # Confirmation dialogs
│
├── contexts/                 # React Context providers
│   ├── AuthContext.tsx      # User auth state
│   ├── ChronicleContext.tsx # Chronicle state
│   ├── FeatureFlagsContext.tsx
│   └── ThemeContext.tsx
│
├── hooks/                    # Custom hooks
│   ├── useAuth.ts
│   ├── useFeatureFlags.ts
│   └── useEnvironmentFavicon.ts
│
├── modules/                  # Reusable feature modules
│   └── dual-stream-audio/   # Audio recording module
│       ├── core/            # Core logic
│       ├── hooks/           # React hooks
│       ├── adapters/        # Integration adapters
│       └── README.md        # Module docs
│
├── services/                 # API clients
├── types/                    # TypeScript types
├── utils/                    # Utilities
└── App.tsx                   # Main app & routing
```

### Key Components

#### 1. Wizard System (`wizards/`)
**Purpose**: Multi-step guided setup for complex configurations

**Features**:
- Step-by-step UI with progress indicator
- Form validation at each step
- Backend integration for configuration
- Extensible registry pattern

**Example Wizards**:
- **Quickstart**: Initial platform setup
- **Chronicle**: Configure Chronicle backend
- **Memory**: Set up memory extraction
- **Tailscale**: Configure secure networking

**Why Powerful**: New users can set up complex services without touching YAML files or command line.

#### 2. Dual-Stream Audio Module (`modules/dual-stream-audio/`)
**Purpose**: Reusable browser audio recording with microphone + system audio mixing

**Capabilities**:
- Capture microphone input
- Capture system audio (browser tab)
- Mix both streams in real-time
- Convert to PCM format
- Stream to backend

**Why Powerful**: Drop-in module for any recording feature. Used by Chronicle for conversation capture.

#### 3. Settings Components (`components/settings/`)
**Purpose**: Standardized UI for configuration

**Components**:
- **SecretInput**: API keys with visibility toggle
- **SettingField**: Generic field (text, secret, URL, select, toggle)
- **SettingsSection**: Container for grouped settings

**Integration**: Works with `react-hook-form` for validation and state management.

#### 4. Feature Flags (`contexts/FeatureFlagsContext.tsx`)
**Purpose**: Progressive feature rollout and A/B testing

**Usage**:
```tsx
const { isFeatureEnabled } = useFeatureFlags();

{isFeatureEnabled('mcp-hub') && <MCPPage />}
```

**Configuration**: `config/feature_flags.yaml`

**Why Powerful**: Ship features to subset of users, gradual rollout, instant disable for bugs.

### UI/UX Principles

1. **Data-Testid Everywhere**: Every interactive element has `data-testid` for reliable E2E testing
2. **Consistent Modals**: Always use `Modal` component, never custom overlays
3. **Error Boundaries**: Graceful error handling with fallback UI
4. **Responsive Design**: Works on desktop, tablet, and mobile
5. **Dark/Light Theme**: Full theme support with `ThemeContext`

---

## Desktop Launcher (Tauri)

Native desktop application for managing Ushadow locally.

### What Makes It Powerful

- **Native Performance**: Rust backend with React frontend
- **Small Footprint**: ~10MB compared to Electron's ~100MB
- **System Integration**: Menu bar, notifications, auto-start
- **Cross-Platform**: Single codebase for macOS, Windows, Linux

### Features

- **Docker Prerequisite Check**: Verifies Docker is installed and running
- **Container Management**: Start/stop/restart Ushadow containers
- **System Tray**: Quick access to common actions
- **Auto-Updates**: Built-in update mechanism
- **Native Installers**: DMG (macOS), EXE (Windows), DEB/AppImage (Linux)

### Directory Structure

```
launcher/
├── src/                 # React UI
│   ├── App.tsx         # Main launcher UI
│   ├── components/     # UI components
│   └── store/          # State management
├── src-tauri/          # Rust backend
│   ├── src/main.rs     # Tauri entry point
│   └── Cargo.toml      # Rust dependencies
├── Makefile            # Build targets
└── tauri.conf.json     # Tauri configuration
```

### Build Targets

```bash
make build-macos     # Build macOS DMG
make build-windows   # Build Windows EXE
make build-linux     # Build DEB + AppImage
```

**Why Powerful**: Single command to launch entire Ushadow platform on any OS without touching terminal.

---

## Mobile App (React Native)

iOS and Android app for streaming audio to Ushadow/Chronicle.

### What Makes It Powerful

- **Cross-Platform**: Single codebase for iOS and Android
- **Expo Integration**: Fast development and testing
- **Background Recording**: Capture audio even when app is backgrounded
- **Real-Time Streaming**: Send audio directly to Chronicle

### Features

- **Audio Recording**: High-quality microphone capture
- **Speaker Labeling**: Tag who is speaking
- **Conversation Sync**: View conversations from Chronicle
- **Push Notifications**: Get notified when processing completes

### Directory Structure

```
mobile/
├── app/             # React Native screens
├── assets/          # Images & resources
├── patches/         # Dependency patches
└── package.json     # Dependencies
```

### Distribution Options

1. **Expo Go**: Quick testing (limited features)
2. **Development Build**: Full feature access
3. **EAS Build**: Production builds for app stores

**Why Powerful**: Record conversations on the go and process them with Chronicle's AI backend.

---

## Service Orchestration

The heart of Ushadow's power: intelligent service coordination.

### How It Works

```
User: "Start Chronicle"
    ↓
Service Orchestrator:
  1. Check if MongoDB/Redis/Qdrant are running (dependencies)
  2. Resolve LLM capability → inject OPENAI_API_KEY
  3. Build Docker Compose command with environment
  4. Start container
  5. Monitor health endpoint
  6. Update service status in database
    ↓
User: "Chronicle is ready!"
```

### Key Responsibilities

1. **Service Discovery**: Parse Docker Compose files to find available services
2. **Dependency Management**: Start services in correct order
3. **Capability Resolution**: Inject provider-specific configuration
4. **Health Monitoring**: Continuous health checks
5. **Port Management**: Detect and resolve port conflicts
6. **Log Aggregation**: Collect logs from all services

### Service Registry

Services are defined in `compose/*.yaml` files:

```yaml
# compose/chronicle-compose.yaml
services:
  chronicle:
    image: chronicle:latest
    ports:
      - "${CHRONICLE_PORT}:8000"
    environment:
      # Capabilities declared here are auto-resolved
      - LLM_API_KEY=${LLM_API_KEY}
      - TRANSCRIPTION_API_KEY=${TRANSCRIPTION_API_KEY}
    depends_on:
      - mongodb
      - redis
```

**Why Powerful**: Adding a new service requires only YAML configuration, zero code changes.

---

## Capability-Based Composition

One of Ushadow's most innovative features: abstract capability definitions.

### The Problem

Traditional approach:
```yaml
services:
  chronicle:
    environment:
      - OPENAI_API_KEY=sk-...    # Hardcoded to OpenAI
```

If you want to switch to Anthropic, you must:
1. Update environment variables
2. Modify Chronicle configuration
3. Update dependent services
4. Restart everything

### The Ushadow Solution

```yaml
# config/capabilities.yaml
capabilities:
  llm:
    description: "Language model for text generation"
    providers:
      - openai
      - anthropic
      - ollama
```

```yaml
# config/providers/llm.yaml
openai:
  api_key_env: OPENAI_API_KEY
  base_url: https://api.openai.com/v1
  models: [gpt-4, gpt-3.5-turbo]

anthropic:
  api_key_env: ANTHROPIC_API_KEY
  base_url: https://api.anthropic.com/v1
  models: [claude-3-opus, claude-3-sonnet]
```

```yaml
# Services just declare needs
services:
  chronicle:
    capabilities:
      - llm
      - transcription
      - embeddings
```

### Resolution Flow

```
1. Chronicle declares: "I need 'llm' capability"
2. User selects: "Use Anthropic for LLM"
3. Capability Resolver:
   - Loads anthropic provider config
   - Reads ANTHROPIC_API_KEY from secrets
   - Injects into Chronicle environment
4. Chronicle starts with correct provider
```

### Why It's Powerful

- **Provider Agnostic**: Services work with any provider
- **Zero Code Changes**: Switch providers via settings UI
- **Centralized Management**: One place to update API keys
- **Easy Testing**: Use Ollama locally, OpenAI in production
- **Cost Optimization**: Route cheap tasks to cheaper models

**See**: `SERVICES_ARCHITECTURE.md` for detailed capability definitions

---

## Settings Architecture

Ushadow uses a sophisticated dual-layer settings system.

### Layer 1: Infrastructure Settings (`.env`)

**Purpose**: Infrastructure-level configuration (ports, URLs, database)

**File**: `.env` in project root

**Example**:
```bash
# Ports
BACKEND_PORT=8080
FRONTEND_PORT=3000
CHRONICLE_PORT=8000

# Database
MONGODB_URL=mongodb://localhost:27017

# Environment
ENVIRONMENT_NAME=blue
```

**Why Separate**: These rarely change and are environment-specific.

### Layer 2: Application Settings (YAML + MongoDB)

**Purpose**: User-configurable application settings

**Files**:
- `config/config.defaults.yaml` - Default values
- `config/config.yml` - Active configuration
- `config/secrets.yaml` - API keys (git-ignored)
- MongoDB `settings` collection - Runtime overrides

**Example**:
```yaml
# config/config.yml
llm:
  selected_provider: openai
  model: gpt-4
  temperature: 0.7

transcription:
  selected_provider: deepgram
```

### OmegaConf Integration

Ushadow uses **OmegaConf** for advanced configuration features:

1. **Merging**: `defaults.yaml` + `config.yml` + `secrets.yaml` → final config
2. **Interpolation**: `${llm.model}` references within config
3. **Type Safety**: Schema validation
4. **Dynamic Updates**: Change settings without restart

**Example**:
```yaml
chronicle:
  llm_model: ${llm.model}        # References global LLM setting
  port: ${env.CHRONICLE_PORT}     # References .env variable
```

### Settings API

```typescript
// GET /api/settings/
const settings = await fetch('/api/settings/').then(r => r.json());

// PUT /api/settings/
await fetch('/api/settings/', {
  method: 'PUT',
  body: JSON.stringify({
    llm: { selected_provider: 'anthropic' }
  })
});
```

**Why Powerful**: Single API call updates configuration across all services, automatic validation, hierarchical merging.

---

## Multi-Environment Support

Run multiple isolated Ushadow environments simultaneously on one machine.

### The Problem

Traditional development:
- One development environment at a time
- Must stop dev to test staging config
- Can't compare behavior side-by-side

### Ushadow Solution: Multi-Worktree Environments

```
/Ushadow/
  └── worktrees/
      ├── blue/      # Dev environment (ports 8080, 3000, 8000)
      ├── gold/      # Staging environment (ports 8180, 3100, 8100)
      └── green/     # Production environment (ports 8280, 3200, 8200)
```

### How It Works

Each worktree:
1. Has its own `.env` file with unique ports
2. Uses shared infrastructure (MongoDB, Redis, Qdrant)
3. Has isolated database namespace (`ushadow_blue`, `ushadow_gold`)
4. Can run different code branches
5. Has distinct favicon color for easy identification

### Setup

```bash
# Create new environment
./scripts/create-worktree.sh green

# Start environment
cd worktrees/green
make go

# Access at http://localhost:3200 (unique port)
```

### Environment Detection

Frontend automatically detects environment from `.env`:

```tsx
// frontend/src/hooks/useEnvironmentFavicon.ts
const env = process.env.VITE_ENVIRONMENT_NAME; // "blue", "gold", "green"
// Sets favicon color accordingly
```

**Why Powerful**:
- Test production config without affecting dev
- Compare feature flag behavior across environments
- QA can test while dev continues work
- Zero configuration switching between environments

---

## Wizard System

Interactive, multi-step setup guides for complex configurations.

### Why Wizards?

**Problem**: Chronicle setup requires:
1. API key selection (OpenAI vs Anthropic vs Ollama)
2. Model configuration
3. Transcription provider setup
4. Audio device selection
5. Queue configuration

**Traditional approach**: Edit YAML files, restart services, debug errors

**Wizard approach**: Answer simple questions, wizard handles complexity

### Wizard Architecture

```
frontend/src/wizards/
├── QuickstartWizard.tsx          # Initial platform setup
├── ChronicleWizard.tsx            # Chronicle configuration
├── MemoryWizard.tsx               # Memory extraction setup
├── SpeakerRecognitionWizard.tsx   # Speaker ID setup
├── TailscaleWizard.tsx            # Network setup
├── registry.ts                    # Wizard discovery
└── WIZARD_TEMPLATE.md             # Template for new wizards
```

### Wizard Structure

```tsx
<Wizard>
  <Step id="llm">
    <h2>Choose LLM Provider</h2>
    <SelectProvider capabilities={["llm"]} />
  </Step>

  <Step id="api-key">
    <h2>Enter API Key</h2>
    <SecretInput name="api_key" />
  </Step>

  <Step id="confirm">
    <h2>Review Configuration</h2>
    <ConfigSummary />
  </Step>
</Wizard>
```

### Wizard Registry

Wizards auto-discover via registry pattern:

```typescript
// wizards/registry.ts
export const wizards = [
  {
    id: 'quickstart',
    name: 'Quickstart',
    description: 'Set up Ushadow for first time',
    component: QuickstartWizard,
    order: 1
  },
  // ... more wizards
];
```

### Backend Integration

Wizards call backend APIs to apply configuration:

```typescript
// In wizard step
const handleSubmit = async (data) => {
  await fetch('/api/wizard/chronicle/configure', {
    method: 'POST',
    body: JSON.stringify(data)
  });

  // Backend applies config, restarts services
};
```

**Why Powerful**:
- **User-Friendly**: No YAML editing required
- **Validated**: Form validation prevents invalid configs
- **Atomic**: All-or-nothing configuration updates
- **Extensible**: Add new wizards by dropping in a component

**See**: `WIZARD_TEMPLATE.md` for creating new wizards

---

## Feature Flags

Progressive feature rollout and experimentation framework.

### Configuration

```yaml
# config/feature_flags.yaml
feature_flags:
  mcp-hub:
    enabled: true
    description: "Model Context Protocol server management"
    rollout_percentage: 100

  agent-zero:
    enabled: false
    description: "Autonomous agent orchestration"
    rollout_percentage: 0

  n8n-workflows:
    enabled: true
    description: "Visual workflow automation"
    rollout_percentage: 50  # A/B test: 50% of users
```

### Frontend Usage

```tsx
import { useFeatureFlags } from '../contexts/FeatureFlagsContext';

function Navigation() {
  const { isFeatureEnabled } = useFeatureFlags();

  return (
    <nav>
      <NavItem href="/dashboard">Dashboard</NavItem>
      <NavItem href="/services">Services</NavItem>

      {isFeatureEnabled('mcp-hub') && (
        <NavItem href="/mcp">MCP Hub</NavItem>
      )}

      {isFeatureEnabled('agent-zero') && (
        <NavItem href="/agents">Agent Zero</NavItem>
      )}
    </nav>
  );
}
```

### Backend API

```python
# backend/src/routers/feature_flags.py
@router.get("/api/feature-flags/")
async def get_feature_flags():
    return await feature_flag_service.get_all_flags()

@router.post("/api/feature-flags/{flag_id}/toggle")
async def toggle_feature_flag(flag_id: str, enabled: bool):
    return await feature_flag_service.toggle_flag(flag_id, enabled)
```

### Use Cases

1. **Progressive Rollout**: Enable for 10% → 50% → 100% of users
2. **A/B Testing**: Test two UX approaches with 50/50 split
3. **Kill Switch**: Instantly disable buggy feature
4. **Beta Features**: Show only to opted-in users
5. **Environment-Specific**: Enable in dev, disable in prod

**Why Powerful**: Ship code to production without exposing features. Enable/disable instantly without deployment.

---

## Integrated Services

Ushadow integrates with multiple AI services and tools.

### Chronicle

**Purpose**: AI-powered conversation transcription, summarization, and memory extraction

**Integration Points**:
- **Frontend**: `ChroniclePage.tsx` - Full conversation UI
- **Backend**: `routers/chronicle.py` - Proxy endpoints
- **Audio**: `dual-stream-audio` module for recording
- **Wizard**: `ChronicleWizard.tsx` for setup

**Features**:
- Real-time transcription
- Speaker recognition
- Queue management
- Memory extraction
- Conversation search

### MCP (Model Context Protocol)

**Purpose**: Standardized protocol for AI model context management

**Integration Points**:
- **Frontend**: `MCPPage.tsx` (feature-flagged)
- **Backend**: `services/mcp_server.py`
- **Config**: `config/metamcp/`

**Features**:
- Server discovery
- Context injection
- Tool registration
- Multi-model support

### Agent Zero

**Purpose**: Autonomous agent orchestration and task execution

**Integration Points**:
- **Frontend**: `AgentZeroPage.tsx` (feature-flagged)
- **Compose**: `compose/agentzero-compose.yml`

**Features**:
- Task planning
- Multi-agent coordination
- Tool use
- Memory persistence

### n8n

**Purpose**: Visual workflow automation

**Integration Points**:
- **Frontend**: `N8NPage.tsx` (feature-flagged)
- **Compose**: `compose/n8n-compose.yml`

**Features**:
- Drag-and-drop workflows
- 200+ integrations
- Custom nodes
- Scheduling

### Infrastructure Services

- **MongoDB**: Primary database for users, settings, conversations
- **Redis**: Caching and session management
- **Qdrant**: Vector database for embeddings and semantic search

**See**: `SERVICES_ARCHITECTURE.md` for detailed service definitions

---

## Adding New Services

Ushadow makes it easy to add new services without code changes.

### Step-by-Step Guide

**1. Create Docker Compose file**

```yaml
# compose/myservice-compose.yaml
services:
  myservice:
    image: myservice:latest
    ports:
      - "${MYSERVICE_PORT}:8080"
    environment:
      - LLM_API_KEY=${LLM_API_KEY}
    depends_on:
      - mongodb
    capabilities:
      - llm
```

**2. Add environment variables**

```bash
# .env
MYSERVICE_PORT=9000
```

**3. Define capabilities (if needed)**

```yaml
# config/capabilities.yaml
capabilities:
  my_capability:
    description: "My new capability"
    providers:
      - my_provider
```

**4. Service auto-discovery**

Ushadow automatically discovers the service:

```bash
make svc-list
# Shows: myservice (discovered from compose/myservice-compose.yaml)

make svc-start SVC=myservice
# Starts service with capability resolution
```

**5. (Optional) Add frontend UI**

```tsx
// frontend/src/pages/MyServicePage.tsx
export default function MyServicePage() {
  return <div>My Service UI</div>;
}
```

**6. (Optional) Add wizard**

```tsx
// frontend/src/wizards/MyServiceWizard.tsx
export default function MyServiceWizard() {
  return <WizardSteps>...</WizardSteps>;
}
```

**See**: `ADDING_SERVICES.md` for complete guide

### Why It's Powerful

- **No Backend Code**: Service orchestrator handles everything
- **Capability Resolution**: Automatic provider wiring
- **Health Monitoring**: Built-in health checks
- **Consistent UX**: Service cards, status badges, logs all automatic

---

## Configuration Management

Comprehensive guide to Ushadow configuration.

### Configuration Hierarchy

```
1. Defaults (config/config.defaults.yaml)
   ↓ merged with
2. User Config (config/config.yml)
   ↓ merged with
3. Secrets (config/secrets.yaml)
   ↓ merged with
4. Environment Variables (.env)
   ↓ merged with
5. Runtime Overrides (MongoDB settings collection)
   ↓
Final Configuration
```

### Configuration Files

| File | Purpose | Git Tracked | Example |
|------|---------|-------------|---------|
| `config.defaults.yaml` | Default values | ✅ Yes | System defaults |
| `config.yml` | User configuration | ✅ Yes | Model selection |
| `secrets.yaml` | API keys | ❌ No | OpenAI key |
| `.env` | Infrastructure | ❌ No | Ports, URLs |

### Example Configuration

```yaml
# config/config.defaults.yaml (tracked)
llm:
  temperature: 0.7
  max_tokens: 2000
```

```yaml
# config/config.yml (tracked)
llm:
  selected_provider: openai
  model: gpt-4
```

```yaml
# config/secrets.yaml (not tracked)
providers:
  openai:
    api_key: sk-proj-...
  anthropic:
    api_key: sk-ant-...
```

### Secrets Management

**Generation**:
```bash
./scripts/generate-secrets.sh
# Creates config/secrets.yaml with prompts for API keys
```

**Structure**:
```yaml
providers:
  openai:
    api_key: "${OPENAI_API_KEY}"
  anthropic:
    api_key: "${ANTHROPIC_API_KEY}"
```

**Why Powerful**: Never commit secrets, easy rotation, environment-specific keys.

### Configuration API

```python
# Backend: Get configuration
from config.omegaconf_settings import Settings

settings = Settings()
llm_model = settings.llm.model
api_key = settings.providers.openai.api_key
```

```typescript
// Frontend: Update configuration
await fetch('/api/settings/', {
  method: 'PUT',
  body: JSON.stringify({
    llm: { temperature: 0.9 }
  })
});
```

---

## Authentication & Security

Ushadow implements secure authentication and authorization.

### Authentication Flow

```
1. User submits credentials
   ↓
2. Backend validates against MongoDB
   ↓
3. Generate JWT token (30-day expiry)
   ↓
4. Return token to frontend
   ↓
5. Frontend stores in localStorage
   ↓
6. Include token in all API requests (Authorization: Bearer <token>)
   ↓
7. Backend validates token on each request
```

### Implementation

**Backend** (`backend/src/routers/auth.py`):
```python
@router.post("/api/auth/register")
async def register(username: str, password: str):
    # Hash password with bcrypt
    hashed = hash_password(password)

    # Create user document
    user = User(username=username, password_hash=hashed)
    await user.save()

    return {"message": "User created"}

@router.post("/api/auth/login")
async def login(username: str, password: str):
    # Verify credentials
    user = await User.find_one(User.username == username)
    if not verify_password(password, user.password_hash):
        raise HTTPException(401, "Invalid credentials")

    # Generate JWT token
    token = create_jwt_token(user.id)

    return {"access_token": token, "token_type": "bearer"}
```

**Frontend** (`frontend/src/contexts/AuthContext.tsx`):
```tsx
const login = async (username: string, password: string) => {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });

  const { access_token } = await response.json();

  // Store token
  localStorage.setItem('token', access_token);

  // Update auth state
  setAuthState({ isAuthenticated: true, token: access_token });
};
```

### Protected Routes

```tsx
// frontend/src/components/auth/ProtectedRoute.tsx
function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }

  return children;
}
```

### Security Features

- **Password Hashing**: bcrypt with salt
- **JWT Tokens**: Signed with secret key, 30-day expiry
- **HTTPS Only**: Production requires HTTPS
- **CORS Protection**: Configured allowed origins
- **Rate Limiting**: Prevent brute force attacks
- **Input Validation**: Pydantic models sanitize input

**See**: `backend/src/services/auth.py` for implementation

---

## Directory Structure

Complete directory tree with descriptions.

```
/Ushadow/
│
├── ushadow/                          # Main application source
│   ├── backend/                      # FastAPI backend
│   │   ├── src/
│   │   │   ├── routers/              # API endpoints
│   │   │   ├── services/             # Business logic
│   │   │   ├── models/               # Data models
│   │   │   ├── config/               # Configuration
│   │   │   └── utils/                # Utilities
│   │   ├── tests/                    # Backend tests
│   │   ├── main.py                   # Entry point
│   │   └── requirements.txt          # Python dependencies
│   │
│   ├── frontend/                     # React web app
│   │   ├── src/
│   │   │   ├── pages/                # Route components
│   │   │   ├── wizards/              # Setup wizards
│   │   │   ├── components/           # Reusable components
│   │   │   ├── contexts/             # React contexts
│   │   │   ├── hooks/                # Custom hooks
│   │   │   ├── modules/              # Feature modules
│   │   │   ├── services/             # API clients
│   │   │   └── App.tsx               # Main app
│   │   ├── e2e/                      # E2E tests
│   │   │   └── pom/                  # Page Object Model
│   │   ├── public/                   # Static assets
│   │   ├── package.json              # Node dependencies
│   │   └── vite.config.ts            # Vite configuration
│   │
│   ├── launcher/                     # Tauri desktop app
│   │   ├── src/                      # React UI
│   │   ├── src-tauri/                # Rust backend
│   │   └── Makefile                  # Build targets
│   │
│   ├── mobile/                       # React Native mobile app
│   │   ├── app/                      # Screens
│   │   ├── assets/                   # Resources
│   │   └── package.json              # Dependencies
│   │
│   ├── manager/                      # Version management
│   └── ADDING_SERVICES.md            # Service integration guide
│
├── compose/                          # Docker Compose definitions
│   ├── backend.yml                   # Backend service
│   ├── frontend.yml                  # Frontend service
│   ├── docker-compose.infra.yml      # MongoDB, Redis, Qdrant
│   ├── chronicle-compose.yaml        # Chronicle service
│   ├── metamcp-compose.yaml          # MCP service
│   └── overrides/                    # Dev/prod overrides
│
├── config/                           # Configuration files
│   ├── capabilities.yaml             # Capability definitions
│   ├── config.defaults.yaml          # Default settings
│   ├── config.yml                    # User configuration
│   ├── feature_flags.yaml            # Feature flags
│   ├── secrets.yaml                  # API keys (not tracked)
│   ├── providers/                    # Provider configs
│   └── kubeconfigs/                  # Kubernetes configs
│
├── deployment/                       # Deployment configs
│   ├── k8s/                          # Kubernetes manifests
│   └── terraform/                    # Infrastructure as code
│
├── scripts/                          # Utility scripts
│   ├── bootstrap.sh                  # Initial setup
│   ├── generate-secrets.sh           # Secret generation
│   └── create-worktree.sh            # Multi-environment setup
│
├── docs/                             # Documentation
│   ├── tailscale_architecture.md     # Tailscale integration
│   ├── network_troubleshooting.md    # Network debugging
│   └── feature-flags-quickstart.md   # Feature flag guide
│
├── docker-compose.yml                # Main Docker Compose
├── Makefile                          # Development commands
├── README.md                         # Project overview
├── SERVICES_ARCHITECTURE.md          # Service architecture
├── OVERVIEW.md                       # This file
├── .env                              # Environment variables (not tracked)
└── go.sh / dev.sh                    # Quickstart scripts
```

---

## Development Workflow

Standard development workflow and best practices.

### Initial Setup

```bash
# 1. Clone repository
git clone https://github.com/ushadow/ushadow.git
cd ushadow

# 2. Bootstrap dependencies
./scripts/bootstrap.sh

# 3. Generate secrets
./scripts/generate-secrets.sh

# 4. Start infrastructure
make infra-up

# 5. Start application
make dev
```

### Development Mode

```bash
# Start with hot-reload
make dev

# Backend: http://localhost:8080
# Frontend: http://localhost:3000
# Changes auto-reload
```

### Common Tasks

```bash
# List all services
make svc-list

# Start a service
make svc-start SVC=chronicle

# Stop a service
make svc-stop SVC=chronicle

# View logs
make logs SVC=chronicle

# Restart service
make restart-chronicle

# Run tests
make test

# Format code
make format

# Lint code
make lint
```

### Git Workflow

```bash
# Create feature branch
git checkout -b feature/my-feature

# Make changes, commit
git add .
git commit -m "Add my feature"

# Push and create PR
git push origin feature/my-feature
```

### Testing Workflow

```bash
# Run backend tests
cd ushadow/backend
pytest

# Run frontend tests
cd ushadow/frontend
npm test

# Run E2E tests
npm run test:e2e

# Run specific test
npm run test:e2e -- tests/chronicle.spec.ts
```

---

## Testing Strategy

Comprehensive testing at all levels.

### Testing Pyramid

```
        ┌──────────────┐
        │  E2E Tests   │ ← Playwright (full user flows)
        │   (Slow)     │
        ├──────────────┤
        │ Integration  │ ← API tests, service integration
        │   (Medium)   │
        ├──────────────┤
        │  Unit Tests  │ ← Component/function tests
        │   (Fast)     │
        └──────────────┘
```

### Backend Testing

**Framework**: pytest

```python
# backend/tests/test_service_orchestrator.py
import pytest
from services.service_orchestrator import ServiceOrchestrator

@pytest.mark.asyncio
async def test_list_services():
    orchestrator = ServiceOrchestrator()
    services = await orchestrator.list_services()
    assert len(services) > 0
    assert "chronicle" in [s.name for s in services]

@pytest.mark.asyncio
async def test_start_service():
    orchestrator = ServiceOrchestrator()
    await orchestrator.start_service("chronicle")
    status = await orchestrator.get_service_status("chronicle")
    assert status.state == "running"
```

**Run tests**:
```bash
cd ushadow/backend
pytest
pytest tests/test_service_orchestrator.py::test_list_services  # Specific test
pytest --cov=src  # With coverage
```

### Frontend Testing

**Framework**: Playwright for E2E

**Page Object Model**:
```typescript
// frontend/e2e/pom/ServicesPage.ts
export class ServicesPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/services');
  }

  async startService(name: string) {
    await this.page.getByTestId(`service-${name}-start`).click();
  }

  async getServiceStatus(name: string) {
    return this.page.getByTestId(`service-${name}-status`).textContent();
  }
}
```

**Test**:
```typescript
// frontend/e2e/tests/services.spec.ts
import { test, expect } from '@playwright/test';
import { ServicesPage } from '../pom/ServicesPage';

test('start chronicle service', async ({ page }) => {
  const servicesPage = new ServicesPage(page);
  await servicesPage.goto();

  await servicesPage.startService('chronicle');

  const status = await servicesPage.getServiceStatus('chronicle');
  expect(status).toBe('Running');
});
```

**Run tests**:
```bash
cd ushadow/frontend
npm run test:e2e
npm run test:e2e -- tests/services.spec.ts  # Specific test
npm run test:e2e:ui  # Interactive mode
```

### Testing Best Practices

1. **Use data-testid**: Every interactive element has `data-testid` attribute
2. **Page Object Model**: Encapsulate page interactions in POM classes
3. **Test Independence**: Each test should be runnable in isolation
4. **Test Data**: Use factories/fixtures for test data
5. **Mocking**: Mock external services in unit tests
6. **Coverage**: Aim for >80% code coverage

**See**: `CLAUDE.md` for testing conventions

---

## Code Quality Tools

Tools and practices for maintaining code quality.

### Linting

**Backend** (Pylint):
```bash
cd ushadow/backend
pylint src/
```

**Frontend** (ESLint):
```bash
cd ushadow/frontend
npm run lint
```

### Formatting

**Backend** (Black):
```bash
cd ushadow/backend
black src/
```

**Frontend** (Prettier):
```bash
cd ushadow/frontend
npm run format
```

### Type Checking

**Backend** (Pydantic):
- Models automatically validated
- Type hints enforced

**Frontend** (TypeScript):
```bash
cd ushadow/frontend
npm run type-check
```

### Pre-Commit Hooks

```bash
# Install pre-commit
pip install pre-commit

# Setup hooks
pre-commit install

# Runs on every commit:
# - Format code
# - Lint code
# - Type check
# - Run quick tests
```

### Code Review Checklist

- [ ] Code follows style guide
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] No hardcoded secrets
- [ ] Error handling added
- [ ] Logging added
- [ ] Performance considered
- [ ] Backward compatibility maintained

---

## Docker Compose Deployment

Deploy Ushadow using Docker Compose for local/small-scale use.

### Quick Start

```bash
# Start everything
docker compose up -d

# Access:
# - Frontend: http://localhost:3000
# - Backend: http://localhost:8080
# - Chronicle: http://localhost:8000
```

### Service Architecture

```yaml
# docker-compose.yml
services:
  backend:
    build: ushadow/backend
    ports:
      - "8080:8080"
    depends_on:
      - mongodb
      - redis

  frontend:
    build: ushadow/frontend
    ports:
      - "3000:80"

  mongodb:
    image: mongo:7
    volumes:
      - mongodb_data:/data/db

  redis:
    image: redis:7
    volumes:
      - redis_data:/data

  qdrant:
    image: qdrant/qdrant
    volumes:
      - qdrant_data:/qdrant/storage
```

### Compose Files

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Main application |
| `compose/docker-compose.infra.yml` | Infrastructure (MongoDB, Redis, Qdrant) |
| `compose/backend.yml` | Backend service definition |
| `compose/frontend.yml` | Frontend service definition |
| `compose/chronicle-compose.yaml` | Chronicle service |
| `compose/overrides/dev-webui.yml` | Development frontend overrides |
| `compose/overrides/prod-webui.yml` | Production frontend overrides |

### Environment-Specific Deployment

**Development**:
```bash
docker compose -f docker-compose.yml -f compose/overrides/dev-webui.yml up
```

**Production**:
```bash
docker compose -f docker-compose.yml -f compose/overrides/prod-webui.yml up
```

### Management Commands

```bash
# Start services
docker compose up -d

# Stop services
docker compose down

# View logs
docker compose logs -f backend

# Restart service
docker compose restart backend

# Rebuild service
docker compose up -d --build backend

# Scale service
docker compose up -d --scale backend=3
```

---

## Kubernetes Deployment

Enterprise-scale deployment with Kubernetes.

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Kubernetes Cluster                        │
│                                                              │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐            │
│  │  Ingress   │  │   Service  │  │   Service  │            │
│  │ Controller │→ │  (Backend) │→ │ (Frontend) │            │
│  └────────────┘  └────────────┘  └────────────┘            │
│                         │                                    │
│  ┌────────────┐  ┌─────▼──────┐  ┌────────────┐            │
│  │  Backend   │  │  Backend   │  │  Backend   │            │
│  │   Pod 1    │  │   Pod 2    │  │   Pod 3    │            │
│  └────────────┘  └────────────┘  └────────────┘            │
│                                                              │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐            │
│  │  MongoDB   │  │   Redis    │  │   Qdrant   │            │
│  │ StatefulSet│  │ StatefulSet│  │ StatefulSet│            │
│  └────────────┘  └────────────┘  └────────────┘            │
└─────────────────────────────────────────────────────────────┘
```

### Manifests

```
deployment/k8s/
├── namespace.yaml              # Namespace definition
├── configmap.yaml              # Configuration
├── secrets.yaml                # Secrets (not tracked)
├── backend-deployment.yaml     # Backend deployment
├── backend-service.yaml        # Backend service
├── frontend-deployment.yaml    # Frontend deployment
├── frontend-service.yaml       # Frontend service
├── mongodb-statefulset.yaml    # MongoDB
├── redis-statefulset.yaml      # Redis
├── qdrant-statefulset.yaml     # Qdrant
└── ingress.yaml                # Ingress rules
```

### Deployment

```bash
# Create namespace
kubectl apply -f deployment/k8s/namespace.yaml

# Deploy infrastructure
kubectl apply -f deployment/k8s/mongodb-statefulset.yaml
kubectl apply -f deployment/k8s/redis-statefulset.yaml
kubectl apply -f deployment/k8s/qdrant-statefulset.yaml

# Deploy application
kubectl apply -f deployment/k8s/backend-deployment.yaml
kubectl apply -f deployment/k8s/backend-service.yaml
kubectl apply -f deployment/k8s/frontend-deployment.yaml
kubectl apply -f deployment/k8s/frontend-service.yaml

# Deploy ingress
kubectl apply -f deployment/k8s/ingress.yaml

# Check status
kubectl get pods -n ushadow
kubectl get services -n ushadow
```

### Scaling

```bash
# Scale backend
kubectl scale deployment backend --replicas=5 -n ushadow

# Autoscaling
kubectl autoscale deployment backend --min=2 --max=10 --cpu-percent=80 -n ushadow
```

### Rolling Updates

```bash
# Update backend image
kubectl set image deployment/backend backend=ushadow/backend:v2.0 -n ushadow

# Check rollout status
kubectl rollout status deployment/backend -n ushadow

# Rollback if needed
kubectl rollout undo deployment/backend -n ushadow
```

### Monitoring

```bash
# View logs
kubectl logs -f deployment/backend -n ushadow

# Exec into pod
kubectl exec -it pod/backend-abc123 -n ushadow -- /bin/bash

# Port forward for debugging
kubectl port-forward service/backend 8080:8080 -n ushadow
```

---

## Multi-Worktree Environments

Advanced multi-environment setup for simultaneous development.

### Concept

Git worktrees allow multiple checkouts of the same repository:

```
/Ushadow/ (main repo)
  ├── .git/
  ├── ushadow/
  └── worktrees/
      ├── blue/      # Main branch, dev environment
      ├── gold/      # Feature branch, staging
      └── green/     # Release branch, production
```

Each worktree:
- Has its own `.env` file
- Runs on different ports
- Uses isolated database namespace
- Can run different code branches
- Independent Docker containers

### Setup

```bash
# Create new worktree
./scripts/create-worktree.sh green

# This creates:
# - worktrees/green/ directory
# - Unique .env with port offsets
# - Isolated Docker Compose project
```

### Environment Configuration

**Blue Environment** (worktrees/blue/.env):
```bash
ENVIRONMENT_NAME=blue
BACKEND_PORT=8080
FRONTEND_PORT=3000
CHRONICLE_PORT=8000
MONGODB_DB=ushadow_blue
```

**Gold Environment** (worktrees/gold/.env):
```bash
ENVIRONMENT_NAME=gold
BACKEND_PORT=8180
FRONTEND_PORT=3100
CHRONICLE_PORT=8100
MONGODB_DB=ushadow_gold
```

**Green Environment** (worktrees/green/.env):
```bash
ENVIRONMENT_NAME=green
BACKEND_PORT=8280
FRONTEND_PORT=3200
CHRONICLE_PORT=8200
MONGODB_DB=ushadow_green
```

### Usage

```bash
# Terminal 1: Dev environment
cd worktrees/blue
make dev

# Terminal 2: Staging environment
cd worktrees/gold
make dev

# Terminal 3: Production environment
cd worktrees/green
make prod

# Access:
# - Blue:  http://localhost:3000 (blue favicon)
# - Gold:  http://localhost:3100 (gold favicon)
# - Green: http://localhost:3200 (green favicon)
```

### Use Cases

1. **Feature Testing**: Test feature branch without affecting dev
2. **Config Comparison**: Compare different provider configurations
3. **Migration Testing**: Test database migrations on staging data
4. **Performance Testing**: Compare performance across branches
5. **Demo Environments**: Multiple demos with different configurations

**Why Powerful**: Zero context switching, side-by-side comparison, isolated testing.

---

## Technology Stack

Complete technology overview.

### Backend Technologies

| Technology | Purpose | Version |
|------------|---------|---------|
| **Python** | Programming language | 3.11+ |
| **FastAPI** | Web framework | Latest |
| **Uvicorn** | ASGI server | Latest |
| **Beanie** | MongoDB ODM | Latest |
| **Motor** | Async MongoDB driver | Latest |
| **Pydantic** | Data validation | 2.x |
| **PyJWT** | JWT authentication | Latest |
| **OmegaConf** | Configuration | Latest |
| **Docker SDK** | Container management | Latest |
| **Kubernetes** | Orchestration client | Latest |
| **bcrypt** | Password hashing | Latest |

### Frontend Technologies

| Technology | Purpose | Version |
|------------|---------|---------|
| **React** | UI framework | 19.x |
| **TypeScript** | Type safety | 5.x |
| **Vite** | Build tool | Latest |
| **Tailwind CSS** | Styling | 3.x |
| **React Router** | Routing | 6.x |
| **Lucide React** | Icons | Latest |
| **react-hook-form** | Form management | Latest |
| **Playwright** | E2E testing | Latest |

### Desktop Technologies

| Technology | Purpose | Version |
|------------|---------|---------|
| **Tauri** | Desktop framework | 2.x |
| **Rust** | Backend language | Latest |
| **React** | UI framework | 19.x |

### Mobile Technologies

| Technology | Purpose | Version |
|------------|---------|---------|
| **React Native** | Mobile framework | Latest |
| **Expo** | Development platform | Latest |
| **TypeScript** | Type safety | 5.x |

### Infrastructure

| Technology | Purpose | Version |
|------------|---------|---------|
| **MongoDB** | Primary database | 7.x |
| **Redis** | Caching | 7.x |
| **Qdrant** | Vector database | Latest |
| **Docker** | Containerization | 24.x |
| **Docker Compose** | Orchestration | 2.x |
| **Kubernetes** | Orchestration | 1.28+ |
| **Nginx** | Reverse proxy | Latest |

### Development Tools

| Tool | Purpose |
|------|---------|
| **Git** | Version control |
| **Make** | Build automation |
| **Prettier** | Code formatting (frontend) |
| **Black** | Code formatting (backend) |
| **ESLint** | Linting (frontend) |
| **Pylint** | Linting (backend) |
| **pytest** | Testing (backend) |
| **Playwright** | Testing (frontend) |

---

## API Endpoints

Comprehensive API reference.

### Authentication

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/register` | POST | Register new user |
| `/api/auth/login` | POST | User login |
| `/api/auth/logout` | POST | User logout |
| `/api/auth/me` | GET | Get current user |

### Services

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/services/` | GET | List all services |
| `/api/services/{id}` | GET | Get service details |
| `/api/services/{id}/start` | POST | Start service |
| `/api/services/{id}/stop` | POST | Stop service |
| `/api/services/{id}/restart` | POST | Restart service |
| `/api/services/{id}/logs` | GET | Get service logs |
| `/api/services/{id}/status` | GET | Get service status |

### Settings

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/settings/` | GET | Get all settings |
| `/api/settings/` | PUT | Update settings |
| `/api/settings/{key}` | GET | Get specific setting |
| `/api/settings/{key}` | PUT | Update specific setting |

### Providers

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/providers/` | GET | List all providers |
| `/api/providers/{id}` | GET | Get provider details |
| `/api/providers/{id}/select` | POST | Select provider |

### Deployments

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/deployments/` | GET | List deployments |
| `/api/deployments/` | POST | Create deployment |
| `/api/deployments/{id}` | GET | Get deployment details |
| `/api/deployments/{id}` | PUT | Update deployment |
| `/api/deployments/{id}` | DELETE | Delete deployment |

### Kubernetes

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/kubernetes/clusters` | GET | List K8s clusters |
| `/api/kubernetes/clusters/{id}/namespaces` | GET | List namespaces |
| `/api/kubernetes/clusters/{id}/pods` | GET | List pods |

### Chronicle

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chronicle/conversations` | GET | List conversations |
| `/api/chronicle/conversations/{id}` | GET | Get conversation |
| `/api/chronicle/queue` | GET | Get queue status |
| `/api/chronicle/upload` | POST | Upload audio |

### Feature Flags

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/feature-flags/` | GET | Get all flags |
| `/api/feature-flags/{id}` | GET | Get specific flag |
| `/api/feature-flags/{id}/toggle` | POST | Toggle flag |

### Chat

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat/messages` | POST | Send message |
| `/api/chat/messages` | GET | Get message history |
| `/api/chat/stream` | WS | WebSocket chat stream |

**Full API Documentation**: See `SERVICES_ARCHITECTURE.md` and OpenAPI docs at `/api/docs`

---

## Key Documentation Files

Quick reference to important documentation.

### Main Documentation

| File | Purpose |
|------|---------|
| `README.md` | Project overview, quick start |
| `OVERVIEW.md` | This file - comprehensive guide |
| `SERVICES_ARCHITECTURE.md` | Deep dive into service composition |
| `ADDING_SERVICES.md` | Guide for adding new services |
| `CLAUDE.md` | Project coding guidelines |

### Component Documentation

| File | Purpose |
|------|---------|
| `backend/src/ARCHITECTURE.md` | Backend layer definitions |
| `frontend/src/modules/dual-stream-audio/README.md` | Audio module docs |
| `frontend/src/modules/dual-stream-audio/INTEGRATION.md` | Integration guide |
| `frontend/src/wizards/WIZARD_TEMPLATE.md` | Wizard template |

### Deployment & Operations

| File | Purpose |
|------|---------|
| `docs/tailscale_architecture.md` | Tailscale integration |
| `docs/network_troubleshooting.md` | Network debugging |
| `docs/feature-flags-quickstart.md` | Feature flag guide |
| `deployment/k8s/README.md` | K8s deployment guide |

### Development Guides

| File | Purpose |
|------|---------|
| `scripts/README.md` | Script documentation |
| `compose/README.md` | Compose file guide |
| `config/README.md` | Configuration guide |

---

## Troubleshooting

Common issues and solutions.

### Service Won't Start

**Symptom**: Service fails to start or crashes immediately

**Solutions**:
```bash
# Check logs
docker compose logs -f service-name

# Common issues:
# 1. Port conflict
netstat -an | grep PORT_NUMBER
# Solution: Change port in .env

# 2. Missing environment variable
docker compose config
# Solution: Add to .env or secrets.yaml

# 3. Capability not resolved
# Solution: Check config/capabilities.yaml and provider selection
```

### Port Conflicts

**Symptom**: "Address already in use" error

**Solutions**:
```bash
# Find process using port
lsof -i :8080

# Kill process
kill -9 PID

# Or change port in .env
BACKEND_PORT=8081
```

### Database Connection Failed

**Symptom**: "Connection refused" to MongoDB/Redis

**Solutions**:
```bash
# Check infrastructure is running
docker compose -f compose/docker-compose.infra.yml ps

# Start if not running
make infra-up

# Verify connectivity
docker exec -it ushadow-mongodb mongosh
```

### Frontend Can't Connect to Backend

**Symptom**: API calls fail with CORS or network errors

**Solutions**:
```bash
# 1. Check backend is running
curl http://localhost:8080/api/health

# 2. Check .env configuration
# Frontend must know backend URL
VITE_API_URL=http://localhost:8080

# 3. Check CORS settings in backend
# backend/src/main.py - ensure frontend URL in allowed origins
```

### Secrets Not Loading

**Symptom**: API key errors, provider authentication fails

**Solutions**:
```bash
# 1. Check secrets.yaml exists
ls -la config/secrets.yaml

# 2. Generate if missing
./scripts/generate-secrets.sh

# 3. Verify format
cat config/secrets.yaml

# 4. Restart services
docker compose restart
```

### Feature Flag Not Working

**Symptom**: Feature-flagged component not showing/hiding

**Solutions**:
```bash
# 1. Check flag configuration
cat config/feature_flags.yaml

# 2. Verify frontend cache
# Clear browser cache and localStorage

# 3. Check API endpoint
curl http://localhost:8080/api/feature-flags/

# 4. Restart frontend
docker compose restart frontend
```

### Multi-Worktree Port Conflicts

**Symptom**: Can't start second environment

**Solutions**:
```bash
# Each environment must have unique ports
# worktrees/blue/.env
BACKEND_PORT=8080

# worktrees/gold/.env
BACKEND_PORT=8180  # +100 offset

# Verify no overlap
grep PORT worktrees/*/.env
```

### For More Help

- **GitHub Issues**: https://github.com/ushadow/ushadow/issues
- **Documentation**: See `docs/` directory
- **Logs**: Always check `docker compose logs -f` first
- **Configuration**: Verify `config/*.yaml` and `.env` files
- **Health Checks**: Use `/api/health` endpoints

---

## Summary

Ushadow is a comprehensive AI orchestration platform that excels at:

1. **Service Management**: Discover, install, configure, and monitor AI services
2. **Capability Abstraction**: Provider-agnostic service composition
3. **Multi-Environment**: Run dev/staging/prod simultaneously
4. **Developer Experience**: Wizards, feature flags, hot-reload
5. **Production Ready**: Docker Compose and Kubernetes deployment

### Getting Started Checklist

- [ ] Read `README.md` for quick start
- [ ] Run `./scripts/bootstrap.sh` for initial setup
- [ ] Generate secrets with `./scripts/generate-secrets.sh`
- [ ] Start infrastructure with `make infra-up`
- [ ] Launch application with `make dev`
- [ ] Access frontend at http://localhost:3000
- [ ] Complete Quickstart Wizard
- [ ] Explore `SERVICES_ARCHITECTURE.md` for deep dive

### Next Steps

- Add your first service (see `ADDING_SERVICES.md`)
- Create a custom wizard (see `wizards/WIZARD_TEMPLATE.md`)
- Set up multi-worktree environments
- Deploy to Kubernetes (see `deployment/k8s/`)
- Contribute to the project!

---

**For questions, issues, or contributions:**
- GitHub: https://github.com/ushadow/ushadow
- Documentation: `docs/` directory
- Community: See README for links
