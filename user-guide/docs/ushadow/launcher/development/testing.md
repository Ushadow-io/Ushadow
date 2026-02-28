---
title: Testing
sidebar_position: 1
---


## Mock Mode for Development

The launcher supports mock mode to test different prerequisite scenarios without actually installing/uninstalling Docker, Git, or Tailscale.

### Quick Start

Run the interactive test script:

```bash
./test-scenarios.sh
```

Select from predefined scenarios:
1. **Fresh install** - No Docker, no Git, no Tailscale
2. **Docker installed but not running** - Git installed, need to start Docker
3. **Docker running, no Tailscale** - Docker and Git ready, Tailscale optional
4. **Everything ready** - All prerequisites satisfied (Docker, Git, Tailscale)
5. **Custom** - Use your own `.env.local` configuration

### Manual Configuration

1. Copy the test environment template:
```bash
cp .env.test .env.local
```

2. Edit `.env.local` to configure mock behavior:
```bash
# Enable mock mode
MOCK_MODE=true

# Configure mock prerequisite status
MOCK_DOCKER_INSTALLED=true
MOCK_DOCKER_RUNNING=false
MOCK_GIT_INSTALLED=true
MOCK_TAILSCALE_INSTALLED=false

# Mock container state
MOCK_INFRA_RUNNING=false
MOCK_ENVS_COUNT=0

# Override platform detection (optional)
# MOCK_PLATFORM=windows
```

3. Run in dev mode:
```bash
npm run dev
```

### Environment Variables

| Variable | Values | Description |
|----------|--------|-------------|
| `MOCK_MODE` | `true`/`false` | Enable/disable mock mode |
| `MOCK_DOCKER_INSTALLED` | `true`/`false` | Mock Docker installation status |
| `MOCK_DOCKER_RUNNING` | `true`/`false` | Mock Docker running status |
| `MOCK_GIT_INSTALLED` | `true`/`false` | Mock Git installation status |
| `MOCK_TAILSCALE_INSTALLED` | `true`/`false` | Mock Tailscale installation status |
| `MOCK_PLATFORM` | `macos`/`windows`/`linux` | Override platform detection |

### Testing Scenarios

#### Fresh Install
Tests the complete installation flow from scratch.

```bash
MOCK_MODE=true \
MOCK_DOCKER_INSTALLED=false \
MOCK_DOCKER_RUNNING=false \
MOCK_GIT_INSTALLED=false \
MOCK_TAILSCALE_INSTALLED=false \
npm run dev
```

#### Docker Not Running
Tests the "start Docker" flow (with Git installed).

```bash
MOCK_MODE=true \
MOCK_DOCKER_INSTALLED=true \
MOCK_DOCKER_RUNNING=false \
MOCK_GIT_INSTALLED=true \
npm run dev
```

#### Platform-Specific Testing
Test Windows installation flow on macOS:

```bash
MOCK_MODE=true \
MOCK_PLATFORM=windows \
MOCK_DOCKER_INSTALLED=false \
MOCK_GIT_INSTALLED=false \
npm run dev
```

#### Git Installation Testing
Test Git installation flow with Docker already installed:

```bash
MOCK_MODE=true \
MOCK_DOCKER_INSTALLED=true \
MOCK_DOCKER_RUNNING=true \
MOCK_GIT_INSTALLED=false \
npm run dev
```

### Notes

- Mock mode only affects prerequisite checking
- Docker/Git/Tailscale commands are not executed in mock mode
- Real container operations still require Docker to be installed
- Git is required for cloning the Ushadow repository during first launch
- Set `MOCK_MODE=false` or remove it to test with real prerequisites
