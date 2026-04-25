# OpenMemory Integration Guide

OpenMemory is an advanced semantic memory service based on [mem0.ai](https://mem0.ai/) that provides:
- **Semantic search** - Find memories by meaning, not just keywords
- **Knowledge graphs** - Connect related memories using Neo4j
- **Context-aware retrieval** - Get relevant memories based on conversation context
- **Multi-user support** - Isolated memory spaces per user

## Prerequisites

1. **OpenMemory service running** (typically on port 8765)
   - If using Chronicle's OpenMemory: `docker compose -f compose/openmemory.yml up -d`
   - If self-hosted: Follow [mem0 deployment guide](https://docs.mem0.ai/)

2. **Required infrastructure** (if using knowledge graphs):
   - Neo4j (for graph relationships)
   - Qdrant (for vector embeddings)
   - OpenAI API key (for embeddings and LLM)

## Quick Setup

### 1. Enable OpenMemory

Create or edit `config/config.local.yaml`:

```yaml
services:
  openmemory:
    enabled: true
    url: "http://localhost:8765"  # or "http://mem0:8765" in Docker
    user_id: "ushadow"
    sync_interval: 1800  # Sync every 30 minutes (optional)
```

### 2. Test the Connection

Start Ushadow backend and test the OpenMemory connection:

```bash
# Via curl
curl http://localhost:8010/api/services/openmemory/test

# Or use the UI
# Navigate to http://localhost:3000/services
# Click "Test" on the OpenMemory card
```

### 3. Preview Data

See what memories will be synced before actually syncing:

```bash
curl http://localhost:8010/api/services/openmemory/preview?limit=5
```

### 4. Sync Memories

Manually trigger a sync:

```bash
curl -X POST http://localhost:8010/api/services/openmemory/sync?limit=100
```

## Configuration Options

### Basic Configuration

```yaml
services:
  openmemory:
    enabled: true
    url: "http://localhost:8765"
    user_id: "your-user-id"  # Unique identifier for memory isolation
    sync_interval: 1800      # Seconds between auto-syncs
```

### Advanced Configuration

Edit `config/services.yaml` to customize field mappings:

```yaml
- service_id: openmemory
  # ... (existing config)
  
  memory_mapping:
    field_mappings:
      # Customize how OpenMemory data maps to Ushadow memories
      - source_field: "memory"
        target_field: "content"
      
      - source_field: "metadata.category"
        target_field: "tags"
        transform: "split"
      
      # Add custom mappings
      - source_field: "metadata.priority"
        target_field: "metadata.priority"
    
    include_unmapped: true  # Preserve all other fields in metadata
```

## API Endpoints

OpenMemory exposes the following mem0 API endpoints:

- `GET /v1/memories/?user_id={user_id}` - List all memories
- `POST /v1/memories/` - Create a new memory
- `GET /v1/memories/{id}/` - Get specific memory
- `PUT /v1/memories/{id}/` - Update memory
- `DELETE /v1/memories/{id}/` - Delete memory
- `POST /v1/memories/search/` - Semantic search

## Usage Examples

### Create Memory via OpenMemory

```bash
curl -X POST http://localhost:8765/v1/memories/ \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "I prefer Python over JavaScript"}
    ],
    "user_id": "ushadow"
  }'
```

### Search Memories

```bash
curl -X POST http://localhost:8765/v1/memories/search/ \
  -H "Content-Type: application/json" \
  -d '{
    "query": "programming languages",
    "user_id": "ushadow"
  }'
```

### Sync to Ushadow

Once memories exist in OpenMemory, sync them to Ushadow:

```bash
curl -X POST http://localhost:8010/api/services/openmemory/sync
```

## Field Mapping

OpenMemory memory format → Ushadow memory format:

| OpenMemory Field | Ushadow Field | Transform |
|-----------------|---------------|-----------|
| `memory` | `content` | None |
| `id` | `title` | None (fallback) |
| `metadata.category` | `tags` | Split |
| `created_at` | `created_at` | Date format |
| `updated_at` | `updated_at` | Date format |
| `metadata.*` | `metadata.*` | Preserve all |

## Troubleshooting

### Connection Failed

```bash
# Check if OpenMemory is running
curl http://localhost:8765/health

# Check Docker container
docker ps | grep mem0
```

### No Memories Returned

```bash
# Verify user_id matches
curl "http://localhost:8765/v1/memories/?user_id=ushadow"

# Check Ushadow logs
docker logs ushadow-backend
```

### Sync Issues

1. Check service configuration:
   ```bash
   curl http://localhost:8010/api/services/openmemory
   ```

2. Preview data before syncing:
   ```bash
   curl "http://localhost:8010/api/services/openmemory/preview?limit=5"
   ```

3. Check backend logs for errors:
   ```bash
   docker logs ushadow-backend --tail=100
   ```

## Architecture

```
┌─────────────┐
│   Ushadow   │
│   Backend   │
└──────┬──────┘
       │ REST API
       │ (services/openmemory)
       ▼
┌─────────────┐
│ OpenMemory  │
│  (mem0 API) │
└──────┬──────┘
       │
       ├──▶ Neo4j (knowledge graph)
       ├──▶ Qdrant (vector embeddings)
       └──▶ SQLite (internal storage)
```

## Performance Tips

1. **Adjust sync interval** based on memory creation frequency:
   ```yaml
   sync_interval: 3600  # 1 hour for low-frequency updates
   sync_interval: 300   # 5 minutes for high-frequency updates
   ```

2. **Limit sync batch size** to avoid overwhelming the system:
   ```bash
   curl -X POST "http://localhost:8010/api/services/openmemory/sync?limit=50"
   ```

3. **Use preview** to test mappings before large syncs:
   ```bash
   curl "http://localhost:8010/api/services/openmemory/preview?limit=10"
   ```

## References

- [mem0 Official Documentation](https://docs.mem0.ai/)
- [mem0 API Reference](https://docs.mem0.ai/api-reference)
- [OpenMemory MCP Server Guide](https://apidog.com/blog/openmemory-mcp-server/)
- [Ushadow Services API](../api/services.md)

## Next Steps

- Set up automated syncing with cron jobs
- Configure memory retention policies
- Implement bi-directional sync
- Add custom field transformations
- Enable knowledge graph features
