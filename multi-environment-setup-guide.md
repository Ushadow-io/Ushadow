# Multi-Environment Setup Guide with Port Offsets and Vite Hot Reloading

## Overview

This guide explains how to set up a multi-environment development system that allows multiple isolated environments to run simultaneously using:

1. **Port Offsets**: Each environment uses unique ports to avoid conflicts
2. **Shared Infrastructure**: Single database instances with logical isolation
3. **Vite Hot Reloading**: Development server with instant UI updates
4. **Git Worktrees**: Optional multi-branch development support

Based on the Chronicle codebase architecture.

---

## Architecture Principles

### The Three-Layer Approach

**Layer 1: Shared Infrastructure (Same Ports)**
- MongoDB: Single instance on port 27017
- Redis: Single instance on port 6379
- Qdrant/Vector Store: Single instance on port 6333
- **Why?** Resource efficient, simpler to manage, no duplicate data services

**Layer 2: Application Services (Offset Ports)**
- Backend API: 8000 + PORT_OFFSET
- Frontend/WebUI: 3000 + PORT_OFFSET
- **Why?** Each environment needs its own application, but they can share databases

**Layer 3: Logical Isolation (Database Names)**
- MongoDB databases: `projectname`, `projectname_env1`, `projectname_env2`
- Redis databases: 0, 1, 2, 3... (Redis supports 0-15)
- **Why?** Data isolation without duplicate database services

---

## File Structure

```
project/
├── .env.default              # Committed template with defaults
├── backends/advanced/
│   ├── .env                  # Generated, gitignored overrides
│   ├── docker-compose.yml    # Main compose file
│   ├── compose/
│   │   ├── backend.yml       # Backend service definition
│   │   ├── frontend.yml      # Frontend service definition
│   │   └── overrides/
│   │       ├── dev-webui.yml # Vite dev server override
│   │       └── prod.yml      # Production build override
│   └── webui/
│       ├── Dockerfile.dev    # Dev container with npm
│       ├── vite.config.ts    # Vite configuration
│       └── src/              # Source files (volume mounted)
├── compose/
│   └── infrastructure-shared.yml  # Shared databases
└── setup/
    └── setuputils.py         # Port/DB validation utilities
```

---

## Step-by-Step Implementation

### Step 1: Create Setup Utilities

Create `setup/setuputils.py` for validation:

```python
#!/usr/bin/env python3
"""
Setup utilities for multi-environment configuration.
Provides port checking and Redis database validation.
"""

import sys
import socket
import subprocess
import json
from typing import List, Tuple, Optional


def check_port_in_use(port: int) -> bool:
    """Check if a TCP port is already in use."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.settimeout(0.5)
            result = sock.connect_ex(('127.0.0.1', port))
            return result == 0
    except Exception:
        return False


def find_available_redis_db(
    preferred_db: int = 0,
    env_name: Optional[str] = None,
    container_name: str = "redis"
) -> int:
    """
    Find available Redis database (0-15) for the environment.

    First checks if environment already has a marked database (reuse it).
    If not, tries preferred database, then finds empty one.
    This prevents database exhaustion in multi-worktree setups.
    """
    # Check if this environment already has a marked database
    if env_name:
        for db in range(16):
            marker = get_redis_db_env_marker(db, container_name)
            if marker == env_name:
                return db

    # Try preferred database if empty
    if not check_redis_db_has_data(preferred_db, container_name):
        return preferred_db

    # Find any empty database
    for db in range(16):
        if not check_redis_db_has_data(db, container_name):
            return db

    # All full - return preferred
    return preferred_db


def set_redis_db_env_marker(
    db_num: int,
    env_name: str,
    container_name: str = "redis"
) -> bool:
    """
    Set environment marker in Redis database.
    Marker: chronicle:env:name = environment_name
    """
    try:
        result = subprocess.run(
            ["docker", "exec", container_name, "redis-cli", "-n", str(db_num),
             "SET", "chronicle:env:name", env_name],
            capture_output=True,
            text=True,
            timeout=5
        )
        return result.returncode == 0
    except Exception:
        return False


def validate_ports(ports: List[int]) -> Tuple[bool, List[int]]:
    """Validate that ports are available."""
    conflicts = [port for port in ports if check_port_in_use(port)]
    return (len(conflicts) == 0, conflicts)
```

**Key Features:**
- Port conflict detection
- Redis database finder with environment markers
- Prevents database exhaustion (important for 16 DB limit)
- JSON output for shell script consumption

---

### Step 2: Create Configuration Templates

#### `.env.default` (Committed Template)

```bash
# Project Default Configuration
# Committed to repository - provides base defaults

# ==========================================
# DOCKER COMPOSE PROJECT NAME
# ==========================================
COMPOSE_PROJECT_NAME=projectname

# ==========================================
# DATABASE CONFIGURATION (Shared Infrastructure)
# ==========================================
MONGODB_URI=mongodb://mongo:27017
MONGODB_DATABASE=projectname
REDIS_URL=redis://redis:6379/0
REDIS_DATABASE=0
QDRANT_BASE_URL=qdrant

# ==========================================
# NETWORK CONFIGURATION (Application Ports)
# ==========================================
PORT_OFFSET=0
BACKEND_PORT=8000
WEBUI_PORT=3000
HOST_IP=localhost

# CORS with variable substitution support
CORS_ORIGINS=http://localhost:${WEBUI_PORT:-3000},http://localhost:${BACKEND_PORT:-8000}
VITE_BACKEND_URL=http://localhost:${BACKEND_PORT:-8000}

# ==========================================
# TEST ENVIRONMENT PORTS
# ==========================================
TEST_BACKEND_PORT=8001
TEST_WEBUI_PORT=3001

# ==========================================
# AUTHENTICATION & API KEYS
# ==========================================
AUTH_SECRET_KEY=
# Add other secrets...
```

**Why this structure?**
- ✅ Committed template everyone can use
- ✅ Variable substitution for dynamic ports
- ✅ Clear separation of concerns
- ✅ Test ports automatically offset by 1

---

### Step 3: Create Quick Start Script

Create `quick-start.sh`:

```bash
#!/bin/bash
set -e

ENV_FILE="backends/advanced/.env"
SETUP_UTILS="setup/setuputils.py"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo "🚀 Multi-Environment Setup"
echo ""

# Prompt for environment name
read -p "Environment name [projectname]: " INPUT_ENV_NAME
ENV_NAME="${INPUT_ENV_NAME:-projectname}"
ENV_NAME=$(echo "$ENV_NAME" | tr '[:upper:]' '[:lower:]' | tr -cs '[:alnum:]' '-')

# Find available ports with validation
PORTS_AVAILABLE=false
while [ "$PORTS_AVAILABLE" = false ]; do
    read -p "Port offset [0]: " INPUT_PORT_OFFSET
    PORT_OFFSET="${INPUT_PORT_OFFSET:-0}"

    BACKEND_PORT=$((8000 + PORT_OFFSET))
    WEBUI_PORT=$((3000 + PORT_OFFSET))

    # Validate ports using Python utility
    PORT_CHECK=$(python3 "$SETUP_UTILS" validate-ports "$BACKEND_PORT" "$WEBUI_PORT")
    if [ $? -eq 0 ]; then
        PORTS_AVAILABLE=true
    else
        CONFLICTS=$(echo "$PORT_CHECK" | python3 -c "import sys, json; print('\n'.join([f'Port {p}' for p in json.load(sys.stdin)['conflicts']]))")
        echo -e "${RED}⚠️  Port conflicts: ${CONFLICTS}${NC}"
        echo "Please choose different offset"
    fi
done

# Find available Redis database
PREFERRED_REDIS_DB=$(( (PORT_OFFSET / 10) % 16 ))
REDIS_RESULT=$(python3 "$SETUP_UTILS" find-redis-db "$PREFERRED_REDIS_DB" "$ENV_NAME")
REDIS_DATABASE=$(echo "$REDIS_RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin)['db_num'])")

# Set environment marker
python3 "$SETUP_UTILS" set-redis-marker "$REDIS_DATABASE" "$ENV_NAME"

# Calculate test ports
TEST_BACKEND_PORT=$((8001 + PORT_OFFSET))
TEST_WEBUI_PORT=$((3001 + PORT_OFFSET))

# Set database names
if [[ "$ENV_NAME" == "projectname" ]]; then
    MONGODB_DATABASE="projectname"
    COMPOSE_PROJECT_NAME="projectname"
else
    MONGODB_DATABASE="projectname_${ENV_NAME}"
    COMPOSE_PROJECT_NAME="projectname-${ENV_NAME}"
fi

echo ""
echo -e "${GREEN}✅ Configuration:${NC}"
echo "  Environment:  $ENV_NAME"
echo "  Backend:      $BACKEND_PORT"
echo "  WebUI:        $WEBUI_PORT"
echo "  Redis DB:     $REDIS_DATABASE"
echo ""

# Generate .env file
cat > "$ENV_FILE" <<EOF
# Environment Overrides - Generated $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# DO NOT COMMIT - Contains environment-specific configuration

ENV_NAME=${ENV_NAME}
COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME}
MONGODB_DATABASE=${MONGODB_DATABASE}
REDIS_DATABASE=${REDIS_DATABASE}
PORT_OFFSET=${PORT_OFFSET}
BACKEND_PORT=${BACKEND_PORT}
WEBUI_PORT=${WEBUI_PORT}
TEST_BACKEND_PORT=${TEST_BACKEND_PORT}
TEST_WEBUI_PORT=${TEST_WEBUI_PORT}
CORS_ORIGINS=http://localhost:${WEBUI_PORT},http://localhost:${BACKEND_PORT}
VITE_BACKEND_URL=http://localhost:${BACKEND_PORT}

# Add your API keys here:
# OPENAI_API_KEY=
# DEEPGRAM_API_KEY=
EOF

chmod 600 "$ENV_FILE"

# Ask about dev server
echo ""
read -p "Enable Vite dev server? (Y/n): " use_dev_server
if [[ "$use_dev_server" == "n" ]] || [[ "$use_dev_server" == "N" ]]; then
    COMPOSE_OVERRIDE="-f compose/overrides/prod.yml"
else
    COMPOSE_OVERRIDE="-f compose/overrides/dev-webui.yml"
fi

# Start infrastructure
echo ""
echo "🏗️  Starting shared infrastructure..."
docker compose -f compose/infrastructure-shared.yml up -d

# Start application
echo ""
echo "🚀 Starting application..."
cd backends/advanced
docker compose -f docker-compose.yml $COMPOSE_OVERRIDE up -d --build

echo ""
echo -e "${GREEN}✅ Ready! Access at: http://localhost:${WEBUI_PORT}${NC}"
```

**Script Features:**
- ✅ Interactive setup with validation
- ✅ Port conflict detection
- ✅ Redis database finder with reuse
- ✅ Automatic test port calculation
- ✅ Dev server option prompt

---

### Step 4: Configure Docker Compose

#### `compose/infrastructure-shared.yml`

```yaml
# Shared infrastructure for all environments
# Start once: docker compose -f compose/infrastructure-shared.yml up -d

services:
  mongo:
    image: mongo:latest
    container_name: mongo
    ports:
      - "27017:27017"
    volumes:
      - mongo_data:/data/db
    networks:
      - projectname-network
    restart: unless-stopped

  redis:
    image: redis:alpine
    container_name: redis
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    networks:
      - projectname-network
    restart: unless-stopped

  qdrant:
    image: qdrant/qdrant:latest
    container_name: qdrant
    ports:
      - "6333:6333"
      - "6334:6334"
    volumes:
      - qdrant_data:/qdrant/storage
    networks:
      - projectname-network
    restart: unless-stopped

networks:
  projectname-network:
    name: projectname-network

volumes:
  mongo_data:
  redis_data:
  qdrant_data:
```

#### `backends/advanced/docker-compose.yml`

```yaml
# Main application compose file
# Usage: docker compose -f docker-compose.yml -f compose/overrides/dev-webui.yml up

include:
  - compose/backend.yml
  - compose/frontend.yml

# Note: Infrastructure is SHARED across all environments
# Start once with: docker compose -f ../../compose/infrastructure-shared.yml up -d

networks:
  projectname-network:
    name: projectname-network
    external: true
```

#### `backends/advanced/compose/backend.yml`

```yaml
# Backend service definition

services:
  backend:
    build:
      context: ..
      dockerfile: Dockerfile
    env_file:
      - ../../../.env.default  # Base defaults
      - ../.env                # Environment overrides
    ports:
      - "${BACKEND_PORT:-8000}:8000"
    volumes:
      - ../src:/app/src
      - ../data:/app/data
    environment:
      - REDIS_URL=redis://redis:6379/${REDIS_DATABASE:-0}
      - MONGODB_URI=${MONGODB_URI:-mongodb://mongo:27017}
    restart: unless-stopped
    networks:
      - projectname-network

networks:
  projectname-network:
    name: projectname-network
    external: true
```

**Critical Details:**
- ✅ `env_file` reads BOTH default and override
- ✅ Port uses variable with fallback: `${BACKEND_PORT:-8000}`
- ✅ Redis URL includes database number: `/${REDIS_DATABASE:-0}`
- ✅ External network connects to shared infrastructure

---

### Step 5: Configure Vite Hot Reloading

#### `backends/advanced/webui/vite.config.ts`

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || '/',
  server: {
    port: 5173,
    host: '0.0.0.0',  // Allow external connections
    allowedHosts: process.env.VITE_ALLOWED_HOSTS
      ? process.env.VITE_ALLOWED_HOSTS.split(' ')
      : ['localhost', '127.0.0.1', '.nip.io'],
    hmr: {
      port: 5173,
      // HMR connects to external port (not internal)
      clientPort: process.env.VITE_HMR_PORT
        ? parseInt(process.env.VITE_HMR_PORT)
        : undefined,
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
```

**Key Configuration:**
- ✅ `host: '0.0.0.0'` - Allows Docker port mapping
- ✅ `clientPort` - HMR uses external port (WEBUI_PORT)
- ✅ `allowedHosts` - Prevents Host header attacks

#### `backends/advanced/compose/overrides/dev-webui.yml`

```yaml
# Development override for hot-reload
# Usage: docker compose -f docker-compose.yml -f compose/overrides/dev-webui.yml up

services:
  webui:
    build:
      context: ./webui
      dockerfile: Dockerfile.dev
      args:
        - VITE_BASE_PATH=${VITE_BASE_PATH:-/}
        - VITE_BACKEND_URL=${VITE_BACKEND_URL:-http://localhost:8000}
    command: npm run dev
    volumes:
      # Volume mount source files for hot-reload
      - ./webui/src:/app/src
      - ./webui/public:/app/public
      - ./webui/index.html:/app/index.html
      - ./webui/vite.config.ts:/app/vite.config.ts
    ports:
      - "${WEBUI_PORT:-3000}:5173"  # External:Internal
    environment:
      - VITE_BACKEND_URL=${VITE_BACKEND_URL:-http://localhost:8000}
      - VITE_HMR_PORT=${WEBUI_PORT:-3000}  # HMR client connects to external port
```

**Critical for Hot Reloading:**
- ✅ Volume mounts for `src/`, `public/`, `vite.config.ts`
- ✅ `VITE_HMR_PORT` set to external port (WEBUI_PORT)
- ✅ Port mapping: `${WEBUI_PORT}:5173` (external:internal)

#### `backends/advanced/webui/Dockerfile.dev`

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy config files
COPY . .

EXPOSE 5173

# Start dev server (npm run dev = vite)
CMD ["npm", "run", "dev"]
```

**Why this works:**
- ✅ Dependencies installed at build time
- ✅ Source files mounted as volumes (not copied)
- ✅ Changes to `src/` trigger instant HMR
- ✅ No rebuild needed for code changes

---

## Common Issues and Solutions

### Issue 1: Hot Reload Not Working

**Symptoms:**
- Changes to files don't appear
- Page requires manual refresh

**Causes:**
1. Source files not volume mounted
2. HMR client port mismatch
3. WebSocket connection blocked

**Solution:**
```yaml
# dev-webui.yml MUST include:
volumes:
  - ./webui/src:/app/src        # Critical!
  - ./webui/vite.config.ts:/app/vite.config.ts

environment:
  - VITE_HMR_PORT=${WEBUI_PORT:-3000}  # Must match external port
```

### Issue 2: Port Conflicts

**Symptoms:**
- "port already in use" error
- Services fail to start

**Solution:**
```bash
# Use setuputils.py validation
python3 setup/setuputils.py validate-ports 8000 3000

# If conflicts, choose different offset
PORT_OFFSET=10  # backend=8010, webui=3010
```

### Issue 3: Wrong Environment Data

**Symptoms:**
- Seeing data from other environment
- Database shows wrong information

**Causes:**
1. Forgot to set MONGODB_DATABASE
2. REDIS_DATABASE not configured
3. Using wrong .env file

**Solution:**
```bash
# Check .env file:
cat backends/advanced/.env

# Should show:
MONGODB_DATABASE=projectname_gold  # NOT projectname
REDIS_DATABASE=1                    # NOT 0

# Restart to apply:
docker compose down && docker compose up -d
```

### Issue 4: Changes Require Rebuild

**Symptoms:**
- Must run `docker compose build` for changes
- Using wrong override file

**Cause:**
Using production override (`prod.yml`) instead of dev override

**Solution:**
```bash
# Wrong (production - no hot reload):
docker compose -f docker-compose.yml -f compose/overrides/prod.yml up

# Right (development - hot reload):
docker compose -f docker-compose.yml -f compose/overrides/dev-webui.yml up
```

### Issue 5: Redis Database Exhaustion

**Symptoms:**
- Running out of Redis databases
- Multiple environments using same DB

**Cause:**
Redis only supports 16 databases (0-15), restarting environments claims new DBs

**Solution:**
Implement environment markers:
```python
# setuputils.py
def set_redis_db_env_marker(db_num: int, env_name: str):
    """Mark database with environment name for reuse"""
    subprocess.run([
        "docker", "exec", "redis", "redis-cli",
        "-n", str(db_num), "SET", "chronicle:env:name", env_name
    ])

def find_available_redis_db(preferred_db: int, env_name: str):
    """Check for existing marker before claiming new DB"""
    for db in range(16):
        marker = get_redis_db_env_marker(db)
        if marker == env_name:
            return db  # Reuse marked database
    # ... continue with normal logic
```

---

## Best Practices

### 1. Port Offset Convention
```
Default environment: 0    (backend=8000, webui=3000)
Environment 1:      10    (backend=8010, webui=3010)
Environment 2:      20    (backend=8020, webui=3020)
Environment 3:      30    (backend=8030, webui=3030)
```

**Why?** Easy mental math, room for expansion (test ports +1)

### 2. Environment Naming
```
✅ Good: gold, green, staging, dev, feature-auth
❌ Bad: env1, test123, johns-branch
```

**Why?** Descriptive names aid debugging and identification

### 3. Database Naming Pattern
```
Default:  projectname
Named:    projectname_envname
Test:     projectname_envname_test
```

**Why?** Clear ownership, no collisions, test isolation

### 4. .gitignore Configuration
```gitignore
# Never commit environment-specific files
backends/advanced/.env
.env.quick-start

# Always commit templates
!.env.default
!.env.template
```

### 5. Volume Mounting Strategy

**For Hot Reload (Development):**
```yaml
volumes:
  - ./webui/src:/app/src              # Source code
  - ./webui/public:/app/public        # Static assets
  - ./webui/vite.config.ts:/app/vite.config.ts
  # NOT package.json or node_modules!
```

**For Production:**
```yaml
# No volumes - code baked into image
# Rebuild required for changes
```

### 6. CORS Configuration
```bash
# .env with variable substitution
CORS_ORIGINS=http://localhost:${WEBUI_PORT},http://localhost:${BACKEND_PORT}

# Expands to (offset=10):
# http://localhost:3010,http://localhost:8010
```

**Why?** Dynamic CORS based on actual ports

---

## Testing in Multi-Environment Setup

### Test Port Strategy
```bash
# Development ports:
BACKEND_PORT=8000 + offset
WEBUI_PORT=3000 + offset

# Test ports (always +1):
TEST_BACKEND_PORT=8001 + offset
TEST_WEBUI_PORT=3001 + offset

# Test database:
MONGODB_DATABASE=${MONGODB_DATABASE}_test
```

**Benefit:** Parallel testing across worktrees without conflicts

### Running Tests
```bash
# Each environment has its own test ports
cd worktree-gold/backends/advanced
./run-test.sh  # Uses 8011, 3011 (offset=10 + 1)

# Simultaneously in another worktree:
cd worktree-green/backends/advanced
./run-test.sh  # Uses 8021, 3021 (offset=20 + 1)
```

---

## Migration Guide

### From Single Environment

**Current setup:**
```bash
# Single .env file with hardcoded ports
BACKEND_PORT=8000
WEBUI_PORT=3000
```

**Migration steps:**

1. **Backup existing config:**
```bash
cp backends/advanced/.env backends/advanced/.env.backup
```

2. **Create .env.default template:**
```bash
# Extract common config to .env.default
# Use variable substitution: ${BACKEND_PORT:-8000}
```

3. **Run quick-start.sh:**
```bash
./quick-start.sh
# Choose environment name: default
# Choose port offset: 0 (maintains existing ports)
```

4. **Copy API keys:**
```bash
# Copy keys from backup to new .env
grep API_KEY backends/advanced/.env.backup >> backends/advanced/.env
```

5. **Test and verify:**
```bash
docker compose down
docker compose -f compose/infrastructure-shared.yml up -d
cd backends/advanced
docker compose up -d
```

---

## Summary Checklist

### Setup Checklist
- [ ] Create `setuputils.py` with port and Redis DB validation
- [ ] Create `.env.default` with variable substitution
- [ ] Create `quick-start.sh` for interactive setup
- [ ] Set up infrastructure-shared.yml (MongoDB, Redis, Qdrant)
- [ ] Configure backend.yml with env_file layers
- [ ] Create dev-webui.yml override for hot reload
- [ ] Configure vite.config.ts with HMR settings
- [ ] Create Dockerfile.dev with volume mounts
- [ ] Add .env to .gitignore
- [ ] Test hot reload with source file change

### Hot Reload Checklist
- [ ] Vite server on host: '0.0.0.0'
- [ ] VITE_HMR_PORT set to external port
- [ ] src/ folder volume mounted
- [ ] vite.config.ts volume mounted
- [ ] Port mapping: ${WEBUI_PORT}:5173
- [ ] Using dev-webui.yml override
- [ ] npm run dev starts Vite dev server

### Multi-Environment Checklist
- [ ] Each environment has unique PORT_OFFSET
- [ ] Each environment has unique MONGODB_DATABASE
- [ ] Each environment has unique REDIS_DATABASE (0-15)
- [ ] Each environment has unique COMPOSE_PROJECT_NAME
- [ ] Port validation runs before starting
- [ ] Redis DB markers prevent exhaustion
- [ ] Test ports automatically calculated (+1 offset)
- [ ] Infrastructure started only once
- [ ] .env files gitignored

---

## Additional Resources

### Useful Commands

```bash
# Check which ports are in use
python3 setup/setuputils.py validate-ports 8000 3000 8010 3010

# Find available Redis database for environment
python3 setup/setuputils.py find-redis-db 2 "gold"

# List running containers by environment
docker ps --filter "name=projectname-gold"

# View all environment containers
docker ps --format "table {{.Names}}\t{{.Ports}}" | grep projectname

# Stop specific environment
docker compose -p projectname-gold down

# View logs for specific environment
docker logs projectname-gold-backend-1 -f
```

### Debugging Hot Reload

```bash
# Check if WebSocket connection works
# Open browser dev console → Network → WS tab
# Should see: ws://localhost:3010/ (connected)

# Verify volume mounts
docker inspect projectname-webui-1 | grep -A 20 Mounts

# Check HMR environment variables
docker exec projectname-webui-1 env | grep VITE_HMR_PORT
```

---

## Conclusion

This multi-environment setup provides:

✅ **Parallel Development**: Multiple environments run simultaneously
✅ **Resource Efficiency**: Single database infrastructure shared by all
✅ **Fast Iteration**: Vite hot reload for instant UI updates
✅ **Data Isolation**: Separate databases prevent cross-contamination
✅ **Parallel Testing**: Test suites run concurrently without conflicts
✅ **Simple Management**: Clear container naming, easy identification
✅ **Scalability**: Supports up to 16 environments (Redis DB limit)

By following this guide, other agents can implement the same robust multi-environment architecture used in the Chronicle project.
