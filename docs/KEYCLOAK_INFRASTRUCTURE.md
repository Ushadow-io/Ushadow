# Keycloak Infrastructure Setup

Keycloak has been integrated as a core infrastructure service in `compose/docker-compose.infra.yml`.

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Infrastructure Layer (All Environments)        │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │ Postgres │  │ Keycloak │  │   Redis  │      │
│  │  :5432   │  │  :8081   │  │  :6379   │      │
│  └────┬─────┘  └────┬─────┘  └──────────┘      │
│       │             │                            │
│       │   ┌─────────┴──────────┐                │
│       └───┤ keycloak database  │                │
│           └────────────────────┘                │
└─────────────────────────────────────────────────┘
          │                │
          ▼                ▼
    ┌──────────┐    ┌──────────┐
    │  Dev Env │    │ Prod Env │
    │  :8000   │    │  :8001   │
    └──────────┘    └──────────┘
```

## Why Infrastructure Layer?

Keycloak is now in the infrastructure layer because:

1. **Shared Authentication** - All environments (dev, staging, prod) use the same Keycloak instance
2. **Database Dependency** - Keycloak depends on Postgres, which is already infrastructure
3. **Persistent State** - User accounts and sessions must survive app restarts
4. **Centralized Management** - Single admin console for all auth configuration

## Starting Services

### Quick Start (Everything)
```bash
# Start all infrastructure including Keycloak
docker compose -f compose/docker-compose.infra.yml \
  --profile infra \
  --profile postgres \
  up -d
```

### Step-by-Step
```bash
# 1. Start Postgres (required by Keycloak)
docker compose -f compose/docker-compose.infra.yml --profile postgres up -d

# 2. Wait for Postgres to be healthy (10-20 seconds)
docker compose -f compose/docker-compose.infra.yml ps

# 3. Start Keycloak
docker compose -f compose/docker-compose.infra.yml --profile keycloak up -d

# 4. Wait for Keycloak to be ready (60 seconds first time)
docker logs -f keycloak

# 5. Run setup script (one-time)
python scripts/setup_keycloak.py
```

### Selective Start
```bash
# Just core (mongo + redis + keycloak)
docker compose -f compose/docker-compose.infra.yml --profile infra up -d

# Core + postgres + keycloak
docker compose -f compose/docker-compose.infra.yml --profile infra --profile postgres up -d
```

## Profiles Explained

The infrastructure compose uses profiles to control which services start:

| Profile | Services | When to Use |
|---------|----------|-------------|
| `infra` | mongo, redis, keycloak | Core infrastructure for all environments |
| `postgres` | postgres | When Keycloak or MetaMCP needs Postgres |
| `memory` | qdrant, neo4j, postgres | When using memory/graph features |
| `keycloak` | keycloak only | When starting Keycloak standalone |

## Service Details

### Keycloak Configuration

**Container**: `keycloak`
**Port**: `8081` (external) → `8080` (internal)
**Database**: `keycloak` (in Postgres)
**Admin Console**: http://localhost:8081

**Environment Variables**:
- `KEYCLOAK_PORT` - External port (default: 8081)
- `KEYCLOAK_ADMIN_USER` - Admin username (default: admin)
- `KEYCLOAK_ADMIN_PASSWORD` - Admin password (default: admin)
- `POSTGRES_USER` / `POSTGRES_PASSWORD` - Database credentials

**Profiles**: `["infra", "keycloak"]`
- Part of core `infra` profile (starts with core services)
- Can also start standalone with `keycloak` profile

**Dependencies**:
- Depends on `postgres` service with health check
- Will wait for Postgres to be healthy before starting

**Volumes**:
- `../config/keycloak/realm-export.json` - Auto-import realm configuration
- `../config/keycloak/themes` - Custom login UI themes

### Database Configuration

Keycloak uses a dedicated database in the shared Postgres instance:

**Database**: `keycloak`
**Created by**: `POSTGRES_MULTIPLE_DATABASES` environment variable
**Init script**: `config/postgres-init/create-multiple-databases.sh`

The Postgres service creates multiple databases on startup:
- `ushadow` (main application)
- `metamcp` (MetaMCP service)
- `openmemory` (OpenMemory service)
- `keycloak` (Keycloak authentication)

## Healthchecks

### Postgres
```bash
# Check if Postgres is ready
docker exec postgres pg_isready -U ushadow
```

### Keycloak
```bash
# Check Keycloak health
curl http://localhost:8081/health/ready

# Should return: {"status":"UP","checks":[]}
```

### Both
```bash
# Check all service status
docker compose -f compose/docker-compose.infra.yml ps
```

## Migration from Old Setup

**Old**: `compose/keycloak.yml` (standalone file)
**New**: `compose/docker-compose.infra.yml` (integrated)

The old `keycloak.yml` file has been deprecated and now shows migration instructions.

### If You Were Using keycloak.yml

**Stop old setup**:
```bash
docker compose -f compose/keycloak.yml down
```

**Start new setup**:
```bash
docker compose -f compose/docker-compose.infra.yml --profile postgres up -d
docker compose -f compose/docker-compose.infra.yml --profile keycloak up -d
```

**Data Persists**: Your Keycloak database and configuration are preserved in the `postgres_data` volume.

## Troubleshooting

### Keycloak Won't Start

**Check Postgres is running**:
```bash
docker compose -f compose/docker-compose.infra.yml ps postgres
```

**Check database exists**:
```bash
docker exec postgres psql -U ushadow -l | grep keycloak
```

**Recreate database if missing**:
```bash
docker exec postgres psql -U ushadow -c "DROP DATABASE IF EXISTS keycloak;"
docker exec postgres psql -U ushadow -c "CREATE DATABASE keycloak;"
```

### Port Already in Use

If port 8081 is in use, set a different port:
```bash
KEYCLOAK_PORT=9000 docker compose -f compose/docker-compose.infra.yml --profile keycloak up -d
```

Update `config/config.defaults.yaml`:
```yaml
keycloak:
  public_url: http://localhost:9000
```

### Can't Access Admin Console

1. Check container is running: `docker ps | grep keycloak`
2. Check logs: `docker logs keycloak`
3. Verify port: http://localhost:8081 (NOT 8080)
4. Default credentials: admin / admin

### Database Connection Errors

**Check Postgres connection from Keycloak**:
```bash
docker exec keycloak nc -zv postgres 5432
```

**Check network**:
```bash
docker network inspect infra-network
```

Both `postgres` and `keycloak` should be in the `infra-network`.

## Production Considerations

For production deployments:

1. **Change admin password** in `.env`:
   ```bash
   KEYCLOAK_ADMIN_PASSWORD=secure-random-password
   ```

2. **Use production mode** in docker-compose.infra.yml:
   ```yaml
   command:
     - start
     - --import-realm
   ```

3. **Enable HTTPS**:
   ```yaml
   environment:
     KC_HOSTNAME_STRICT_HTTPS: true
     KC_PROXY: edge
   ```

4. **Configure reverse proxy** (nginx/traefik):
   - Terminate SSL at proxy
   - Set `X-Forwarded-*` headers
   - Use `KC_PROXY=edge` in Keycloak

5. **Backup database regularly**:
   ```bash
   docker exec postgres pg_dump -U ushadow keycloak > keycloak-backup.sql
   ```

## Next Steps

1. ✅ Keycloak running in infrastructure layer
2. ✅ Database integrated with Postgres
3. ✅ Hybrid authentication implemented (Strategy 3)
4. ⏳ **Next**: Implement frontend OIDC login
5. ⏳ Configure Google OAuth for social login
6. ⏳ Test complete voice message sharing flow

See `NEXT_STEPS.md` for detailed implementation guidance.
