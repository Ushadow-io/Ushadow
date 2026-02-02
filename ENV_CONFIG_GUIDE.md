# Environment Configuration System

## Overview

The launcher now supports comprehensive environment configuration including:
- Custom startup commands per project
- Automatic port detection and allocation
- Multi-environment support with port offsetting
- Database and service port management

## How It Works

### 1. Project Configuration (`.launcher-config.yaml`)

Each project can have a configuration file that defines:

```yaml
project:
  name: myproject
  display_name: My Project

setup:
  command: ./go.sh            # Command to start an environment
  env_vars:                   # Vars to inject
    - PROJECT_ROOT
    - WORKTREE_PATH
    - PORT_OFFSET             # Auto-calculated offset

ports:
  allocation_strategy: offset  # or: fixed
  base_port: 8000
  offset:
    min: 0
    max: 100
    step: 10                   # Each env gets ports +10 from previous
```

### 2. Port Detection

The launcher scans `.env.template` or `.env.example` to detect:
- Port variables (e.g., `BACKEND_PORT`, `WEBUI_PORT`)
- Database ports (e.g., `POSTGRES_PORT`, `REDIS_PORT`)
- Default values

**Example `.env.template`:**
```bash
BACKEND_PORT=8000
WEBUI_PORT=3000
POSTGRES_PORT=5432
REDIS_PORT=6379
```

### 3. Port Allocation

When creating environments, ports are automatically offset:

**Environment 1 (offset=0):**
- BACKEND_PORT=8000
- WEBUI_PORT=3000
- POSTGRES_PORT=5432

**Environment 2 (offset=10):**
- BACKEND_PORT=8010
- WEBUI_PORT=3010
- POSTGRES_PORT=5442

**Environment 3 (offset=20):**
- BACKEND_PORT=8020
- WEBUI_PORT=3020
- POSTGRES_PORT=5452

### 4. Environment Startup

When you create or start an environment:
1. Launcher calculates the port offset
2. Injects environment variables:
   ```bash
   PROJECT_ROOT=/Users/you/repos/myproject
   WORKTREE_PATH=/Users/you/repos/worktrees/myproject/dev
   PORT_OFFSET=10
   ```
3. Runs the startup command (e.g., `./go.sh`)
4. Your startup script reads PORT_OFFSET and adjusts ports accordingly

## Startup Script Pattern

Your `go.sh` or startup script should use the PORT_OFFSET:

```bash
#!/bin/bash

# Get port offset from environment (default to 0)
OFFSET=${PORT_OFFSET:-0}

# Calculate actual ports
export BACKEND_PORT=$((8000 + OFFSET))
export WEBUI_PORT=$((3000 + OFFSET))
export POSTGRES_PORT=$((5432 + OFFSET))
export REDIS_PORT=$((6379 + OFFSET))

# Load base .env if it exists
if [ -f .env.template ]; then
  source .env.template
fi

# Override with offset ports
cat > .env.local <<EOF
BACKEND_PORT=${BACKEND_PORT}
WEBUI_PORT=${WEBUI_PORT}
POSTGRES_PORT=${POSTGRES_PORT}
REDIS_PORT=${REDIS_PORT}
EOF

# Start services
docker compose --env-file .env.local up -d
```

## Configuration UI

Access the configuration editor:
1. Enable Multi-Project Mode in settings
2. Go to Install tab
3. Add or select a project
4. Click "Configure" or "Edit Config"
5. Set startup command and port strategy
6. Click "Scan .env files" to auto-detect ports

## Next Steps

- [ ] Add TypeScript interface for DetectedPort
- [ ] Wire up ProjectConfigEditor in ProjectsPanel
- [ ] Implement config save/load commands
- [ ] Auto-calculate PORT_OFFSET when creating environments
- [ ] Inject env vars when running startup commands
- [ ] Add UI to show port allocations for each environment
