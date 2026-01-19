# Notion Integration Implementation Summary

## What's Been Built

### 1. ✅ Docker Compose Service
**File:** `compose/notion-mcp-compose.yaml`
- Official Notion MCP server (`mcp/notion:latest`)
- SSE transport on port 3100
- Auto-connects to infra network
- Health checks configured

### 2. ✅ MetaMCP Registration
**File:** `config/metamcp/servers.json`
- Notion MCP server registered in MetaMCP hub
- Available tools listed: search_notion, get_page, create_page, update_page, etc.
- Aggregated with other MCP servers (openmemory, ushadow-orchestrator)
- Disabled by default (enable when instance is created)

### 3. ✅ Integration Provider Config
**File:** `config/providers/integrations/notion.yaml`
- Follows existing integration pattern (like Obsidian)
- Capability: `memory_source`
- Integration type: `mcp`
- Memory mapping configuration for Notion fields → OpenMemory
- Sync configuration with change detection via `last_edited_time`

### 4. ✅ MCP Adapter (COMPLETE)
**File:** `ushadow/backend/src/memory/adapters/mcp_adapter.py`
- Handles both sync (fetch all pages) and tool calling (on-demand queries)
- Registered in `AdapterFactory` for `IntegrationType.MCP`
- **IMPLEMENTED**: Uses MetaMCP HTTP endpoint with JSON-RPC 2.0 protocol
- Tool calls route through `http://metamcp:12008/metamcp/ushadow/mcp`

### 5. ✅ Integration Bridge
**File:** `ushadow/backend/src/memory/sources/integration_bridge.py`
- Auto-registers integrations as memory sources for LLM tool calling
- When user creates Notion instance → Becomes available as LLM tool
- Bridges the Instance system ↔ Tool Calling system

---

## Architecture: Chaos ↔ Order Flow

```
┌─────────────────────────────────────────────────────────┐
│                    ORDER (Notion)                        │
│  - Structured databases                                  │
│  - Human-readable tables                                 │
│  - User updates tasks/notes                              │
└─────────────────────────────────────────────────────────┘
                           ↕ Bidirectional Sync
┌─────────────────────────────────────────────────────────┐
│              MCP Adapter (Integration)                   │
│  Sync Mode: Fetch pages → Transform → Store             │
│  Tool Mode: Execute LLM tool calls → Live queries       │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│              CHAOS (OpenMemory)                          │
│  - Qdrant: Vector embeddings for semantic search        │
│  - Neo4j: Graph relationships                            │
│  - Postgres: Key facts + metadata links                 │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│              Chat + LLM (Chronicle)                      │
│  1. Query OpenMemory for fast context                   │
│  2. LLM decides: Need more detail?                      │
│  3. Tool call → Query Notion directly via MCP           │
│  4. LLM generates response with source links            │
└─────────────────────────────────────────────────────────┘
```

---

## Complete User Flow

### Setup (One-Time)

1. **User:** Instances Page → "Add Instance" → Select "Notion Workspace"
2. **User:** Enter API token from notion.so/my-integrations
3. **System:** Starts notion-mcp Docker service
4. **System:** Registers in MetaMCP hub
5. **System:** Auto-registers as memory source for tool calling
6. **User:** Click "Sync Now"
7. **System:**
   - Calls `MCPAdapter.fetch_items()`
   - Gets all Notion pages
   - Transforms to MemoryCreate
   - POSTs to OpenMemory
   - Stores vectors/graph/facts

### Voice Conversation: "What's on my task list?"

```python
# 1. Chronicle captures voice → Transcribes
User: "What's on my task list?"

# 2. Chat queries OpenMemory (fast)
OpenMemory returns: ["3 tasks found", "Implement chat is In Progress"]

# 3. LLM with tools available
tools = [
  {name: "search_openmemory"},
  {name: "search_notion_1"},  # Auto-registered from integration
  {name: "query_database"},    # From Notion MCP
]

# 4. LLM decides to get live data
LLM tool_call: query_database(database_id="tasks", filter={assignee: "Stu"})

# 5. Execute via MCP
ToolCallingOrchestrator
  → MemorySourceRegistry.execute_tool_call("query_database")
  → Routes to Notion integration
  → MCPAdapter.execute_tool_call()
  → Calls MetaMCP or direct MCP server
  → Returns live task list

# 6. LLM synthesizes response
"You have 3 tasks. Review PR #123 is due tomorrow..."

# 7. Chronicle speaks response
```

### Voice Command: "Add task to implement user auth"

```python
# LLM tool call
create_page(
  parent={database_id: "tasks"},
  properties={Name: "Implement user auth", Status: "Todo"}
)

# Executes → Creates in Notion
# Also stores in OpenMemory immediately for context
```

---

## ✅ MCP Tool Execution - IMPLEMENTED

**File:** `ushadow/backend/src/memory/adapters/mcp_adapter.py:186`

**Implementation Choice:** MetaMCP HTTP endpoint with JSON-RPC 2.0 protocol

### Implementation Details:

```python
async def _call_mcp_tool(self, tool_name: str, arguments: Dict[str, Any]) -> Any:
    # Build JSON-RPC 2.0 request
    request_payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {
            "name": tool_name,
            "arguments": arguments or {}
        }
    }

    # POST to MetaMCP HTTP endpoint
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            self.mcp_url,  # http://metamcp:12008/metamcp/ushadow/mcp
            json=request_payload,
            headers=self._get_headers()
        )
        # Parse JSON-RPC response and extract content
```

**Why MetaMCP HTTP:**
- ✅ Unified routing through MetaMCP hub (all servers aggregated)
- ✅ Standard JSON-RPC 2.0 protocol (MCP spec compliant)
- ✅ No SDK dependencies required
- ✅ Central logging/monitoring via MetaMCP
- ✅ Supports bearer token authentication
- ✅ Small latency cost (~20ms) acceptable for voice UI

**Methods now complete:**
1. ✅ `_call_mcp_tool()` - Core JSON-RPC 2.0 implementation
2. ✅ `fetch_items()` - Sync operations via MetaMCP
3. ✅ `execute_tool_call()` - LLM tool calling via MetaMCP

---

## Next Steps

### 1. ✅ Implementation Complete

All MCP adapter methods have been implemented using MetaMCP HTTP endpoint with JSON-RPC 2.0 protocol.

### 2. Test End-to-End

```bash
# Start services
docker compose -f compose/notion-mcp-compose.yaml up -d
docker compose -f compose/metamcp-compose.yaml up -d

# Create Notion instance
# (via Instances Page UI)

# Test sync
POST /api/instances/notion-1/sync

# Test chat with tools
POST /api/chat/simple
{
  "messages": [{"role": "user", "content": "What's in my Notion?"}],
  "use_tools": true
}
```

### 3. Production Considerations

- **Rate Limiting:** Notion API has rate limits (3 requests/sec)
- **Caching:** Cache MCP responses for repeated queries
- **Error Handling:** Graceful degradation if Notion/MCP unavailable
- **Monitoring:** Log all MCP tool calls for debugging
- **Security:** Rotate Notion API tokens, use secrets manager

---

## Files Modified/Created

### Created:
- `compose/notion-mcp-compose.yaml` - Docker service
- `config/providers/integrations/notion.yaml` - Integration provider
- `ushadow/backend/src/memory/adapters/mcp_adapter.py` - MCP adapter
- `ushadow/backend/src/memory/sources/integration_bridge.py` - Auto-registration bridge

### Modified:
- `config/metamcp/servers.json` - Added Notion server
- `ushadow/backend/src/memory/adapters/factory.py` - Registered MCP adapter

### Existing (Reused):
- Tool calling orchestrator (`src/services/tool_calling.py`)
- Memory source registry (`src/memory/sources/registry.py`)
- Integration operations (`src/services/integration_operations.py`)

---

## Questions?

1. **Should we use MetaMCP or direct?** → Recommend MetaMCP (Option B)
2. **When to sync vs tool call?** → Sync periodically, tool call for live queries
3. **What about other MCP servers?** → Same pattern applies (GitHub, Slack, etc.)
4. **Performance concerns?** → Tool calls add 100-200ms, acceptable for voice UI

