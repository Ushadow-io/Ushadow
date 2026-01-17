# Obsidian Integration Example

This document describes how the Memory Adapter system would integrate an Obsidian vault into Ushadow's memory system.

## Overview

**Goal**: Import markdown notes from an Obsidian vault into Ushadow's vector memory, making them searchable and available to AI agents.

**Components Involved**:
- Integration Config (defines how to connect)
- Memory Adapter (reads and transforms data)
- Memory Service (stores in MongoDB/Qdrant)
- API/UI (user configures and triggers sync)

---

## Step-by-Step Flow

### 1. User Configures Integration (UI)

User goes to Settings → Integrations → Add Integration:

```
Integration Type: File System / Obsidian Vault
Name: My Knowledge Base
Vault Path: /Users/stu/Documents/ObsidianVault
Sync Frequency: Every 6 hours
```

Field Mapping Configuration:
```yaml
Title Source: frontmatter.title (fallback to filename)
Content: Full markdown body
Tags: frontmatter.tags + inline #tags
Created Date: frontmatter.created
Source ID: relative file path
```

Advanced Options:
- ✓ Parse wiki links [[Note Name]]
- ✓ Extract inline tags #tag
- ✓ Preserve folder structure
- ✓ Include frontmatter in metadata
- ✓ Only sync files modified since last sync

### 2. System Creates Integration Config

Backend saves this as an `IntegrationConfig` object:

```python
{
  "service_id": "obsidian-main",
  "name": "My Knowledge Base",
  "template": "memory_source",
  "integration_type": "filesystem",
  "mode": "local",

  # Connection config (for filesystem, this is the path)
  "connection": {
    "url": "file:///Users/stu/Documents/ObsidianVault",
    "auth": None,  # Local filesystem, no auth needed
  },

  # How to map Obsidian data → Memory format
  "memory_mapping": {
    "field_mappings": [
      {
        "source_field": "frontmatter.title",
        "target_field": "title",
        "default_value": None  # Will use filename if missing
      },
      {
        "source_field": "body",
        "target_field": "content"
      },
      {
        "source_field": "tags",
        "target_field": "tags"
      },
      {
        "source_field": "frontmatter.created",
        "target_field": "created_at",
        "transform": "DATE_FORMAT"
      },
      {
        "source_field": "relative_path",
        "target_field": "source_id"
      }
    ],
    "include_unmapped": true  # Keep all frontmatter in metadata
  },

  # Sync configuration
  "sync_interval": 21600,  # 6 hours in seconds
  "last_sync": None,
  "enabled": true
}
```

Saved to: `config.overrides.yaml`:
```yaml
integrations:
  obsidian-main:
    name: My Knowledge Base
    template: memory_source
    integration_type: filesystem
    connection:
      url: file:///Users/stu/Documents/ObsidianVault
    memory_mapping:
      field_mappings:
        - source_field: frontmatter.title
          target_field: title
        # ... etc
    sync_interval: 21600
    enabled: true
```

### 3. User Triggers Sync

User clicks "Sync Now" button in UI, which calls:
```
POST /api/integrations/obsidian-main/sync
```

### 4. Backend Creates Adapter

```python
# In sync endpoint handler
from src.services.integration_orchestrator import get_integration_orchestrator

orchestrator = get_integration_orchestrator()
result = await orchestrator.sync_integration("obsidian-main")
```

The orchestrator:
1. Loads integration config from settings
2. Creates appropriate adapter via factory
3. Calls adapter to fetch data
4. Saves to memory system

```python
# Inside IntegrationOrchestrator.sync_integration()
config = await self.get_integration_config("obsidian-main")

# Factory creates ObsidianAdapter based on integration_type
adapter = AdapterFactory.create_adapter(config, settings)

# Test connection first
if not await adapter.test_connection():
    return {"success": False, "error": "Cannot access vault"}

# Fetch items (this is where the magic happens)
memories = await adapter.fetch_items(limit=None)  # Get all

# Save to memory system
saved_count = 0
for memory in memories:
    await self.memory_service.create_or_update(memory)
    saved_count += 1

# Update last sync time
await self.update_sync_timestamp("obsidian-main")

return {
    "success": True,
    "imported": saved_count,
    "last_sync": datetime.now().isoformat()
}
```

### 5. Adapter Reads Obsidian Files

The ObsidianAdapter (extends MemoryAdapter):

```python
async def fetch_items(self, limit=None, offset=0, filters=None):
    """Read all markdown files from vault."""
    items = []
    vault_path = Path(self.config.connection.url.replace("file://", ""))

    # Find all markdown files
    md_files = list(vault_path.rglob("*.md"))

    # Filter by modification time if incremental sync
    if self.config.last_sync:
        last_sync_time = datetime.fromisoformat(self.config.last_sync)
        md_files = [
            f for f in md_files
            if datetime.fromtimestamp(f.stat().st_mtime) > last_sync_time
        ]

    # Apply pagination if needed
    if limit:
        md_files = md_files[offset:offset + limit]

    # Parse each file
    for md_file in md_files:
        raw_item = self._parse_markdown_file(md_file)
        memory = self.transform_to_memory(raw_item)
        items.append(memory)

    return items

def _parse_markdown_file(self, filepath: Path) -> Dict[str, Any]:
    """Parse Obsidian markdown file into structured data."""
    content = filepath.read_text(encoding='utf-8')
    vault_path = Path(self.config.connection.url.replace("file://", ""))

    # Parse YAML frontmatter
    frontmatter = {}
    body = content

    if content.startswith('---'):
        parts = content.split('---', 2)
        if len(parts) >= 3:
            import yaml
            frontmatter = yaml.safe_load(parts[1]) or {}
            body = parts[2].strip()

    # Extract inline tags (#tag)
    import re
    inline_tags = re.findall(r'#([a-zA-Z0-9_-]+)', body)

    # Combine frontmatter tags + inline tags
    all_tags = set(frontmatter.get('tags', []))
    all_tags.update(inline_tags)

    # Extract wiki links [[Note Name]]
    wiki_links = re.findall(r'\[\[([^\]]+)\]\]', body)

    return {
        "id": str(filepath.relative_to(vault_path)),
        "relative_path": str(filepath.relative_to(vault_path)),
        "absolute_path": str(filepath),
        "filename": filepath.stem,
        "frontmatter": frontmatter,
        "body": body,
        "tags": list(all_tags),
        "wiki_links": wiki_links,
        "created": frontmatter.get('created'),
        "modified": datetime.fromtimestamp(filepath.stat().st_mtime).isoformat(),
        "folder": str(filepath.parent.relative_to(vault_path)),
    }
```

### 6. Adapter Transforms Data

The base `MemoryAdapter.transform_to_memory()` applies field mappings:

**Example Obsidian File**:
```markdown
---
title: Project Alpha Planning
created: 2024-01-15
tags: [work, project-alpha]
status: active
---

# Project Alpha Planning

## Objectives
- Launch by Q2 2024
- Target 10k users

## Resources
See [[Team Roster]] and [[Budget 2024]]

#planning #strategic
```

**After Parsing** (raw_item):
```python
{
  "id": "work/project-alpha-planning.md",
  "relative_path": "work/project-alpha-planning.md",
  "absolute_path": "/Users/stu/Documents/ObsidianVault/work/project-alpha-planning.md",
  "filename": "project-alpha-planning",
  "frontmatter": {
    "title": "Project Alpha Planning",
    "created": "2024-01-15",
    "tags": ["work", "project-alpha"],
    "status": "active"
  },
  "body": "# Project Alpha Planning\n\n## Objectives\n- Launch by Q2...",
  "tags": ["work", "project-alpha", "planning", "strategic"],
  "wiki_links": ["Team Roster", "Budget 2024"],
  "created": "2024-01-15",
  "modified": "2024-01-20T14:30:00",
  "folder": "work"
}
```

**After Transform** (MemoryCreate):
```python
MemoryCreate(
  source="obsidian-main",
  source_id="work/project-alpha-planning.md",
  title="Project Alpha Planning",
  content="# Project Alpha Planning\n\n## Objectives\n- Launch by Q2...",
  tags=["work", "project-alpha", "planning", "strategic"],
  created_at="2024-01-15T00:00:00",
  metadata={
    "frontmatter": {
      "title": "Project Alpha Planning",
      "created": "2024-01-15",
      "tags": ["work", "project-alpha"],
      "status": "active"
    },
    "wiki_links": ["Team Roster", "Budget 2024"],
    "folder": "work",
    "filename": "project-alpha-planning",
    "absolute_path": "/Users/stu/.../work/project-alpha-planning.md",
    "modified": "2024-01-20T14:30:00"
  }
)
```

### 7. Save to Memory System

The memory service saves each `MemoryCreate` to:

**MongoDB** (structured data):
```javascript
{
  "_id": ObjectId("..."),
  "source": "obsidian-main",
  "source_id": "work/project-alpha-planning.md",
  "title": "Project Alpha Planning",
  "content": "# Project Alpha Planning\n\n## Objectives...",
  "tags": ["work", "project-alpha", "planning", "strategic"],
  "created_at": ISODate("2024-01-15T00:00:00Z"),
  "updated_at": ISODate("2024-01-20T14:30:00Z"),
  "metadata": { /* ... */ },
  "embedding_id": "qdrant-vector-123"
}
```

**Qdrant** (vector embeddings):
```python
{
  "id": "qdrant-vector-123",
  "vector": [0.123, -0.456, 0.789, ...],  # 1536-dim embedding
  "payload": {
    "memory_id": "mongodb-object-id",
    "source": "obsidian-main",
    "title": "Project Alpha Planning",
    "tags": ["work", "project-alpha", "planning", "strategic"],
    "content_preview": "# Project Alpha Planning\n\n## Objectives..."
  }
}
```

### 8. User Queries Memory

Later, when a user or AI agent queries:
```
"What are our plans for Project Alpha?"
```

The memory service:
1. Generates query embedding
2. Searches Qdrant for similar vectors
3. Returns MongoDB documents
4. Results include Obsidian note with source metadata

```json
{
  "results": [
    {
      "title": "Project Alpha Planning",
      "content": "# Project Alpha Planning...",
      "similarity": 0.92,
      "source": "obsidian-main",
      "source_id": "work/project-alpha-planning.md",
      "metadata": {
        "folder": "work",
        "wiki_links": ["Team Roster", "Budget 2024"]
      }
    }
  ]
}
```

User can click to open original file in Obsidian:
```
obsidian://open?vault=MyVault&file=work/project-alpha-planning.md
```

---

## Incremental Sync

On subsequent syncs (every 6 hours):

1. Adapter checks `last_sync` timestamp
2. Only processes files modified since last sync
3. Updates existing memories or creates new ones
4. Deletes memories for deleted files (optional)

```python
# Incremental sync logic
if self.config.last_sync:
    last_sync_time = datetime.fromisoformat(self.config.last_sync)

    # Only modified files
    md_files = [
        f for f in vault_path.rglob("*.md")
        if datetime.fromtimestamp(f.stat().st_mtime) > last_sync_time
    ]
```

---

## Advanced Features

### Graph Links
Parse wiki links to create relationships:
```python
# After importing all notes, create links
for memory in imported_memories:
    for wiki_link in memory.metadata.get('wiki_links', []):
        linked_memory = await find_memory_by_title(wiki_link)
        if linked_memory:
            await create_memory_relationship(
                from_id=memory.id,
                to_id=linked_memory.id,
                type="references"
            )
```

### Bi-directional Sync
When user updates memory in Ushadow:
1. Check if source is Obsidian
2. Update original .md file
3. Preserve frontmatter structure
4. Trigger Obsidian to reload

### Tag Synchronization
Auto-sync tags between systems:
- Obsidian tags → Ushadow tags
- Ushadow tags → Obsidian frontmatter

---

## API Endpoints Needed

```
GET    /api/integrations                    # List all integrations
POST   /api/integrations                    # Create integration
GET    /api/integrations/{id}               # Get details
PUT    /api/integrations/{id}               # Update config
DELETE /api/integrations/{id}               # Remove integration

POST   /api/integrations/{id}/test          # Test connection
POST   /api/integrations/{id}/sync          # Trigger sync now
GET    /api/integrations/{id}/sync-status   # Get sync progress
GET    /api/integrations/{id}/sync-history  # View past syncs

GET    /api/integrations/templates          # Available templates
GET    /api/integrations/templates/{type}   # Template schema
```

---

## Configuration Files

**config/integration-templates.yaml**:
```yaml
templates:
  memory_source:
    description: External memory/knowledge source
    modes:
      local:
        - filesystem (Obsidian, Logseq, local files)
        - database (SQLite, PostgreSQL)
      cloud:
        - rest (Generic REST API)
        - notion (Notion API)
        - gdrive (Google Drive API)
        - mem0 (mem0.ai API)
```

**config.overrides.yaml** (user config):
```yaml
integrations:
  obsidian-main:
    name: My Knowledge Base
    template: memory_source
    integration_type: filesystem
    enabled: true
    connection:
      url: file:///Users/stu/Documents/ObsidianVault
    memory_mapping:
      # ... field mappings
    sync_interval: 21600
    last_sync: "2024-01-20T14:30:00Z"
```

---

## Summary

**Data Flow**:
```
Obsidian Vault (.md files)
  ↓ ObsidianAdapter reads + parses
Raw Data (dicts with frontmatter, body, tags)
  ↓ MemoryAdapter transforms via field mappings
MemoryCreate objects (standardized format)
  ↓ MemoryService saves
MongoDB (documents) + Qdrant (vectors)
  ↓ User queries
Search Results (with source metadata)
  ↓ Click to open
Opens in Obsidian via obsidian:// URL
```

**Key Benefits**:
- ✅ Your Obsidian knowledge becomes searchable in Ushadow
- ✅ AI agents can reference your notes
- ✅ Automatic sync keeps systems in sync
- ✅ Preserves all metadata and structure
- ✅ Can link back to original files
