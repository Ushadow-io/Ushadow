# Memory Source Plugin System

A pluggable architecture for integrating multiple memory sources into the chat system via LLM function calling.

## Overview

The memory source system allows the LLM to dynamically query external data sources for detailed information. Instead of pre-loading all context into every message, the LLM decides when it needs specific information and calls the appropriate source as a tool.

### Architecture

```
┌─────────────┐
│   LLM       │ "I need docs about X"
│             │──────────┐
└─────────────┘          │
                         ▼
                  ┌──────────────┐
                  │ Tool Call    │
                  │ Orchestrator │
                  └──────────────┘
                         │
                         ▼
                  ┌──────────────┐
                  │  Registry    │
                  └──────────────┘
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ OpenMemory   │ │ Documentation│ │  Custom      │
│ Source       │ │ Source       │ │  Source      │
└──────────────┘ └──────────────┘ └──────────────┘
```

### How It Works

1. **Central Memory (OpenMemory)** stores high-level inference facts with metadata references to original sources
2. **Memory Sources** provide detailed, queryable access to original data (docs, notes, APIs, etc.)
3. **LLM decides** which sources to query based on the conversation context
4. **Tool calls** are executed, results are injected back into the conversation
5. **Source references** allow users to follow links back to original content

## Creating a Custom Memory Source

### Step 1: Implement MemorySource

Create a new class that inherits from `MemorySource`:

```python
from src.memory.sources.base import MemorySource, MemorySourceConfig, MemorySourceResult
from typing import Any, Dict, List

class MyCustomSource(MemorySource):
    def __init__(self, config: MemorySourceConfig):
        super().__init__(config)

        # Extract source-specific config from metadata
        self.api_url = config.metadata.get("api_url")
        self.api_key = config.metadata.get("api_key")

    async def query(self, query: str, **kwargs) -> List[MemorySourceResult]:
        """
        Query your data source.

        Args:
            query: The search query from the LLM
            **kwargs: Additional parameters defined in your tool schema

        Returns:
            List of MemorySourceResult objects
        """
        # Your implementation here
        results = []

        # Example: Query your API
        # response = await your_api_client.search(query)
        # for item in response:
        #     results.append(MemorySourceResult(
        #         content=item["text"],
        #         source_id=self.config.source_id,
        #         source_name=self.config.name,
        #         metadata={"title": item["title"], ...},
        #         references=[item["url"]],
        #     ))

        return results

    def get_tool_definition(self) -> Dict[str, Any]:
        """
        Define the LLM function call schema (OpenAI format).
        """
        return {
            "type": "function",
            "function": {
                "name": f"search_{self.config.source_id}",
                "description": f"Search {self.config.name}. {self.config.description}",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Search query",
                        },
                        # Add any custom parameters
                        "filter": {
                            "type": "string",
                            "description": "Optional filter criteria",
                        },
                    },
                    "required": ["query"],
                },
            },
        }
```

### Step 2: Register Your Source Type

In `config_loader.py`, add your source to the `SOURCE_TYPE_MAP`:

```python
from .implementations import MyCustomSource

SOURCE_TYPE_MAP = {
    "documentation": DocumentationSource,
    "openmemory": OpenMemorySource,
    "mycustom": MyCustomSource,  # Add your source
}
```

### Step 3: Configure in config.yml

Add your source configuration under `memory.sources`:

```yaml
memory:
  sources:
    - type: mycustom
      source_id: my_custom_source
      name: "My Data Source"
      description: "Detailed information about X, Y, and Z"
      enabled: true
      metadata:
        api_url: "https://api.example.com"
        api_key: "${MY_API_KEY}"
        custom_param: "value"
```

## Configuration Reference

### MemorySourceConfig Fields

- **type** (required): Source type identifier (maps to `SOURCE_TYPE_MAP`)
- **source_id** (required): Unique identifier for this source instance
- **name** (required): Human-readable name
- **description** (required): What information this source provides (shown to LLM)
- **enabled** (optional): Whether this source is active (default: true)
- **metadata** (optional): Source-specific configuration (API keys, URLs, etc.)

### Environment Variables

Use `${VAR_NAME}` syntax in config.yml to reference environment variables:

```yaml
metadata:
  api_key: "${DOCS_API_KEY}"  # Reads from environment
```

## Using Memory Sources in Chat

### Enabling Tool Calling

By default, tool calling is enabled. To disable for a specific request:

```python
# POST /api/chat/simple
{
  "messages": [...],
  "use_tools": false  # Disable tool calling
}
```

### Response Format

When tool calling is used, the response includes:

```json
{
  "id": "...",
  "role": "assistant",
  "content": "Based on the documentation I found...",
  "tool_calls_made": [
    {
      "function": "search_docs",
      "arguments": {"query": "API authentication"},
      "result_preview": "Documentation from Technical Docs:\n1. **API Auth**\n..."
    }
  ],
  "iterations": 2
}
```

## Built-in Memory Sources

### OpenMemorySource

Queries the central memory store (Postgres + Qdrant + Neo4j).

**Configuration:**
```yaml
- type: openmemory
  source_id: openmemory
  name: "Central Memory"
  description: "Inference facts and contextual knowledge"
  enabled: true
  metadata:
    base_url: "http://localhost:8765"
    timeout: 5.0
```

**Tool Call:**
```json
{
  "name": "search_openmemory",
  "arguments": {
    "query": "user preferences for dark mode",
    "user_id": "user123",
    "limit": 5
  }
}
```

### DocumentationSource

Queries documentation APIs (Confluence, ReadTheDocs, custom docs).

**Configuration:**
```yaml
- type: documentation
  source_id: docs
  name: "Technical Documentation"
  description: "Official API docs and guides"
  enabled: true
  metadata:
    api_url: "https://docs.example.com/api"
    api_key: "${DOC_API_KEY}"
    search_endpoint: "/v1/search"
    timeout: 10.0
```

**Tool Call:**
```json
{
  "name": "search_docs",
  "arguments": {
    "query": "authentication endpoints",
    "limit": 3,
    "category": "api"
  }
}
```

## Best Practices

### 1. Clear Descriptions

Write clear, specific descriptions that help the LLM decide when to use each source:

✅ **Good:** "User's personal notes and saved snippets from external sources"
❌ **Bad:** "Notes database"

### 2. Reasonable Timeouts

Set appropriate timeouts to prevent blocking the chat:

- **Fast sources** (local cache, memory): 2-5 seconds
- **External APIs**: 5-10 seconds
- **Slow sources** (complex queries): 10-15 seconds

### 3. Error Handling

Always handle errors gracefully and return meaningful messages:

```python
try:
    results = await self.query_api(query)
    return results
except TimeoutError:
    logger.warning(f"{self.config.name} timeout")
    return []  # Return empty, don't crash
except Exception as e:
    logger.error(f"Error querying {self.config.name}: {e}")
    return []
```

### 4. Source References

Always include references back to original content:

```python
MemorySourceResult(
    content="Summary of the content...",
    source_id=self.config.source_id,
    source_name=self.config.name,
    metadata={"title": "Original Title", "timestamp": "2025-01-12"},
    references=["https://source.com/original/link"],  # Important!
)
```

### 5. Limit Results

Don't return too many results to avoid overwhelming the LLM:

- **Default limit:** 5 results
- **Max limit:** 10 results
- Prioritize by relevance score

## Debugging

### Check Registered Sources

```python
from src.memory.sources import get_memory_sources_status

status = await get_memory_sources_status()
print(status)
# {
#   "total_sources": 2,
#   "enabled_sources": 2,
#   "sources": [...]
# }
```

### View Tool Definitions

```python
from src.memory.sources import get_memory_source_registry

registry = get_memory_source_registry()
tools = registry.get_tool_definitions()
print(json.dumps(tools, indent=2))
```

### Enable Debug Logging

```python
import logging
logging.getLogger("src.memory.sources").setLevel(logging.DEBUG)
logging.getLogger("src.services.tool_calling").setLevel(logging.DEBUG)
```

## Testing

### Unit Test Example

```python
import pytest
from src.memory.sources.base import MemorySourceConfig
from src.memory.sources.implementations import MyCustomSource

@pytest.mark.asyncio
async def test_my_custom_source():
    config = MemorySourceConfig(
        source_id="test",
        name="Test Source",
        description="Test",
        metadata={"api_url": "http://localhost:8000"}
    )

    source = MyCustomSource(config)
    results = await source.query("test query")

    assert len(results) > 0
    assert results[0].content != ""
    assert results[0].source_id == "test"
```

### Integration Test

```python
@pytest.mark.asyncio
async def test_tool_calling_flow():
    """Test complete tool calling flow."""
    from src.services.tool_calling import ToolCallingOrchestrator

    orchestrator = ToolCallingOrchestrator()
    messages = [
        {"role": "user", "content": "What are the API authentication methods?"}
    ]

    result = await orchestrator.run_with_tools(messages)

    assert result["content"] != ""
    assert len(result["tool_calls_made"]) > 0
    assert result["iterations"] >= 1
```

## Advanced: Dynamic Source Registration

Register sources at runtime without configuration:

```python
from src.memory.sources import get_memory_source_registry, MemorySourceConfig
from my_sources import MyRuntimeSource

config = MemorySourceConfig(
    source_id="runtime",
    name="Runtime Source",
    description="Dynamically added source",
    enabled=True,
    metadata={"key": "value"}
)

source = MyRuntimeSource(config)
registry = get_memory_source_registry()
registry.register(source)
```

## Troubleshooting

### Sources Not Loading

1. Check config.yml syntax (YAML is space-sensitive)
2. Verify source type is in `SOURCE_TYPE_MAP`
3. Check logs for errors: `grep "memory source" backend.log`

### Tool Calls Not Working

1. Ensure `use_tools=True` in chat request
2. Verify LLM supports function calling (GPT-4, Claude 3+)
3. Check if sources are enabled: `enabled: true`
4. Review tool definitions: `registry.get_tool_definitions()`

### Timeout Errors

1. Increase timeout in source metadata
2. Check source service availability
3. Add retry logic in source implementation

## Contributing

To add a new built-in source:

1. Create implementation in `src/memory/sources/implementations/`
2. Add to `SOURCE_TYPE_MAP` in `config_loader.py`
3. Export from `implementations/__init__.py`
4. Add example configuration to this README
5. Write unit tests
