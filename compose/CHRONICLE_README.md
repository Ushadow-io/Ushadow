# Chronicle Backend for ushadow

## Quick Start

### 1. Build Chronicle Images

```bash
# From project root
./chronicle/build-images.sh
```

**Builds:**
- `localhost:5000/chronicle-backend:latest` (~5.2 GB)
- `localhost:5000/chronicle-webui:latest` (~1.1 GB)

**Time:** ~5-10 minutes

---

### 2. Configure Chronicle

Add to your `.env` file (or set as environment variables):

```bash
# Chronicle Authentication (REQUIRED)
CHRONICLE_ADMIN_EMAIL=admin@chronicle.local
CHRONICLE_ADMIN_PASSWORD=your-secure-password-here
CHRONICLE_AUTH_SECRET=your-jwt-secret-must-be-at-least-32-characters-long

# Transcription (REQUIRED - choose one)
TRANSCRIPTION_PROVIDER=deepgram
DEEPGRAM_API_KEY=your-deepgram-api-key

# LLM (REQUIRED - choose one)
LLM_PROVIDER=openai
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-4o-mini

# Optional: Worker configuration
RQ_WORKER_COUNT=3
```

**Ports are already configured in `.env`:**
- CHRONICLE_PORT=8000
- CHRONICLE_WEBUI_PORT=3010
- CHRONICLE_REDIS_DB=1

---

### 3. Start Chronicle

```bash
# Start with ushadow services
docker compose \
  -f compose/backend.yml \
  -f compose/frontend.yml \
  -f compose/chronicle-compose.yaml \
  up -d

# Or add to your existing startup command
```

---

### 4. Verify

```bash
# Check Chronicle backend health
curl http://localhost:8000/health

# Expected: {"status": "ok", ...}

# Check containers
docker ps | grep chronicle

# Should show:
# - ushadow-blue-chronicle-backend (running backend + workers)
# - ushadow-blue-chronicle-webui
```

---

### 5. Access Chronicle Dashboard

Open: **http://localhost:3010**

Login:
- Email: Your CHRONICLE_ADMIN_EMAIL
- Password: Your CHRONICLE_ADMIN_PASSWORD

---

## Architecture

### Sidecar Pattern (Single Container)

**chronicle-backend container runs:**
- ✅ FastAPI backend (port 8000)
- ✅ 3x RQ workers (transcription, memory, default)
- ✅ 1x Audio persistence worker
- ✅ Stream workers (Deepgram/Parakeet if configured)

**Total:** 5-7 processes in one container

---

## Shared Infrastructure

Chronicle uses ushadow's existing services:

| Service | Connection | Notes |
|---------|------------|-------|
| **MongoDB** | mongodb://mongo:27017 | Shared database server |
| **Redis** | redis://redis:6379/1 | Separate DB (DB 1) |
| **Qdrant** | http://qdrant:6333 | Shared vector storage |

**Benefits:**
- ✅ No duplicate infrastructure
- ✅ Lower resource usage
- ✅ Simplified management

---

## Service URLs

| Service | URL | Purpose |
|---------|-----|---------|
| Chronicle API | http://localhost:8000 | Backend REST API |
| Chronicle WebUI | http://localhost:3010 | Web dashboard |
| Chronicle WebSocket | ws://localhost:8000/ws_pcm | Audio streaming |
| ushadow API | http://localhost:8050 | ushadow backend |
| ushadow UI | http://localhost:3050 | ushadow dashboard |

---

## Common Commands

```bash
# Start Chronicle
docker compose -f compose/chronicle-compose.yaml up -d

# Stop Chronicle
docker compose -f compose/chronicle-compose.yaml down

# Restart Chronicle (after config changes)
docker compose -f compose/chronicle-compose.yaml restart chronicle-backend

# View logs
docker logs -f ushadow-blue-chronicle-backend

# Check worker processes
docker exec ushadow-blue-chronicle-backend ps aux | grep python

# Shell into container
docker exec -it ushadow-blue-chronicle-backend /bin/bash
```

---

## Mobile App Configuration

Once Chronicle is running:

1. **Open Chronicle mobile app**
2. **Tap "Local Advanced Backend" preset**
3. **Or enter custom URL**: `ws://[your-ip]:8000/ws_pcm`
4. **Test connection** (should show ✅)
5. **Login** with Chronicle credentials
6. **Start streaming**

---

## Troubleshooting

### Health Check Failing

```bash
# Check logs
docker logs ushadow-blue-chronicle-backend | tail -50

# Manual health check
docker exec ushadow-blue-chronicle-backend curl http://localhost:8000/health

# Check readiness (includes dependencies)
docker exec ushadow-blue-chronicle-backend curl http://localhost:8000/readiness
```

### Workers Not Running

```bash
# Check worker processes
docker exec ushadow-blue-chronicle-backend ps aux | grep rq

# Should show 3+ python processes for RQ workers

# Check environment
docker exec ushadow-blue-chronicle-backend env | grep ENABLE_SIDECAR_WORKERS
# Should show: ENABLE_SIDECAR_WORKERS=true
```

### Database Connection Issues

```bash
# Test MongoDB
docker exec ushadow-blue-chronicle-backend ping mongo

# Test Redis
docker exec ushadow-blue-chronicle-backend redis-cli -h redis -n 1 ping
# Should show: PONG

# Test Qdrant
curl http://localhost:6333/health
```

---

## Resource Usage

**chronicle-backend** (sidecar):
- Memory: ~2-4 GB
- CPU: 2-4 cores
- Disk: ~5.2 GB image

**chronicle-webui**:
- Memory: ~100 MB
- CPU: <0.5 core
- Disk: ~1.1 GB image

**Total additional to ushadow:** ~2-4 GB RAM

---

## Configuration

### Worker Count

```bash
# In .env
RQ_WORKER_COUNT=3  # Default

# More workers for higher load
RQ_WORKER_COUNT=6
```

### Transcription Provider

```bash
# Option 1: Deepgram (recommended)
TRANSCRIPTION_PROVIDER=deepgram
DEEPGRAM_API_KEY=your-key

# Option 2: Mistral
TRANSCRIPTION_PROVIDER=mistral
MISTRAL_API_KEY=your-key

# Option 3: Local Parakeet
PARAKEET_ASR_URL=http://parakeet-asr:8767
```

### LLM Provider

```bash
# Option 1: OpenAI (recommended)
LLM_PROVIDER=openai
OPENAI_API_KEY=your-key
OPENAI_MODEL=gpt-4o-mini

# Option 2: Local Ollama
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://ollama:11434
```

---

## Complete Startup Example

```bash
# === COMPLETE CHRONICLE STARTUP ===

# 1. Build images (one time)
./chronicle/build-images.sh

# 2. Configure .env (add API keys)
nano .env
# Add: CHRONICLE_ADMIN_EMAIL, CHRONICLE_ADMIN_PASSWORD, CHRONICLE_AUTH_SECRET
# Add: DEEPGRAM_API_KEY, OPENAI_API_KEY

# 3. Start all services
docker compose \
  -f compose/backend.yml \
  -f compose/frontend.yml \
  -f compose/chronicle-compose.yaml \
  up -d

# 4. Verify
curl http://localhost:8000/health    # Chronicle
curl http://localhost:8050/health    # ushadow

# 5. Access dashboards
open http://localhost:3050           # ushadow
open http://localhost:3010           # Chronicle

# Done! 🎉
```

---

## Summary

✅ **One container** for backend + workers (sidecar pattern)
✅ **Shares infrastructure** with ushadow (Mongo, Redis, Qdrant)
✅ **Easy management** via docker compose
✅ **Ready to use** - just build, configure, and start

**Chronicle is now integrated with ushadow!** 🎉
