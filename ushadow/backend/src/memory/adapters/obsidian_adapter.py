"""
Obsidian Filesystem Adapter

Reads markdown files from an Obsidian vault and transforms them into memory format.
Supports:
- YAML frontmatter parsing
- Inline tag extraction (#tag)
- Wiki link extraction ([[link]])
- Incremental sync (based on file modification time)
"""

import re
import yaml
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any, Optional

import logging

from .base import MemoryAdapter
from src.models.memory import MemoryCreate

logger = logging.getLogger(__name__)


class ObsidianAdapter(MemoryAdapter):
    """Adapter for Obsidian vault integration (filesystem-based)."""

    async def test_connection(self) -> bool:
        """
        Check if vault path exists and is readable.

        Returns:
            True if vault exists and is a directory
        """
        try:
            vault_path = self._get_vault_path()
            exists = vault_path.exists() and vault_path.is_dir()

            if exists:
                logger.info(f"Obsidian vault found at {vault_path}")
            else:
                logger.warning(f"Obsidian vault not found at {vault_path}")

            return exists

        except Exception as e:
            logger.error(f"Error checking Obsidian vault: {e}")
            return False

    async def fetch_items(
        self,
        limit: Optional[int] = None,
        offset: Optional[int] = 0,
        filters: Optional[Dict[str, Any]] = None
    ) -> List[MemoryCreate]:
        """
        Read markdown files from Obsidian vault.

        Args:
            limit: Maximum number of files to process
            offset: Number of files to skip
            filters: Additional filters (not used currently)

        Returns:
            List of MemoryCreate objects
        """
        vault_path = self._get_vault_path()

        if not vault_path.exists():
            logger.error(f"Vault path does not exist: {vault_path}")
            return []

        # Find all markdown files
        md_files = list(vault_path.rglob("*.md"))
        logger.info(f"Found {len(md_files)} markdown files in {vault_path}")

        # Filter by modification time if incremental sync
        if hasattr(self.config, 'last_sync') and self.config.last_sync:
            try:
                last_sync_time = datetime.fromisoformat(self.config.last_sync)
                original_count = len(md_files)
                md_files = [
                    f for f in md_files
                    if datetime.fromtimestamp(f.stat().st_mtime) > last_sync_time
                ]
                logger.info(
                    f"Incremental sync: {len(md_files)}/{original_count} files modified "
                    f"since {last_sync_time}"
                )
            except Exception as e:
                logger.warning(f"Error filtering by last_sync: {e}")

        # Apply pagination
        if limit:
            md_files = md_files[offset:offset + limit]

        # Parse and transform each file
        memories = []
        for md_file in md_files:
            try:
                raw_item = self._parse_markdown(md_file, vault_path)
                memory = self.transform_to_memory(raw_item)
                memories.append(memory)
            except Exception as e:
                logger.warning(f"Failed to parse {md_file}: {e}")
                continue

        logger.info(f"Successfully parsed {len(memories)} markdown files")
        return memories

    async def fetch_item(self, item_id: str) -> Optional[MemoryCreate]:
        """
        Fetch a single markdown file by relative path.

        Args:
            item_id: Relative path from vault root (e.g., "folder/note.md")

        Returns:
            MemoryCreate object or None if not found
        """
        vault_path = self._get_vault_path()
        file_path = vault_path / item_id

        if not file_path.exists():
            logger.warning(f"File not found: {file_path}")
            return None

        try:
            raw_item = self._parse_markdown(file_path, vault_path)
            memory = self.transform_to_memory(raw_item)
            return memory
        except Exception as e:
            logger.error(f"Failed to parse {file_path}: {e}")
            return None

    def _get_vault_path(self) -> Path:
        """
        Get vault path from config.

        Returns:
            Path object pointing to vault directory
        """
        # Check connection_url first (new style)
        if hasattr(self.config, 'connection_url') and self.config.connection_url:
            vault_str = self.config.connection_url
            # Remove file:// prefix if present
            if vault_str.startswith('file://'):
                vault_str = vault_str[7:]
            return Path(vault_str).expanduser().resolve()

        # Check connection object (if present)
        if hasattr(self.config, 'connection') and self.config.connection:
            vault_str = self.config.connection.url
            if vault_str.startswith('file://'):
                vault_str = vault_str[7:]
            return Path(vault_str).expanduser().resolve()

        # Fallback: check config_overrides (for simple integrations)
        # Try source_path first (new standard), then vault_path (legacy)
        if hasattr(self.config, 'config_overrides'):
            if 'source_path' in self.config.config_overrides:
                vault_str = self.config.config_overrides['source_path']
                return Path(vault_str).expanduser().resolve()
            elif 'vault_path' in self.config.config_overrides:
                vault_str = self.config.config_overrides['vault_path']
                return Path(vault_str).expanduser().resolve()

        raise ValueError("No vault path configured")

    def _parse_markdown(self, filepath: Path, vault_root: Path) -> Dict[str, Any]:
        """
        Parse Obsidian markdown file into structured data.

        Args:
            filepath: Path to markdown file
            vault_root: Root path of the vault

        Returns:
            Dictionary with parsed frontmatter, body, tags, etc.
        """
        content = filepath.read_text(encoding='utf-8')

        # Parse YAML frontmatter
        frontmatter = {}
        body = content

        if content.startswith('---'):
            parts = content.split('---', 2)
            if len(parts) >= 3:
                try:
                    frontmatter = yaml.safe_load(parts[1]) or {}
                    body = parts[2].strip()
                except yaml.YAMLError as e:
                    logger.warning(f"Failed to parse frontmatter in {filepath}: {e}")

        # Extract inline tags (#tag)
        inline_tags = re.findall(r'#([a-zA-Z0-9_-]+)', body)

        # Combine frontmatter tags + inline tags
        all_tags = set()
        if frontmatter.get('tags'):
            if isinstance(frontmatter['tags'], list):
                all_tags.update(frontmatter['tags'])
            elif isinstance(frontmatter['tags'], str):
                # Handle comma-separated tags
                all_tags.update([t.strip() for t in frontmatter['tags'].split(',')])
        all_tags.update(inline_tags)

        # Extract wiki links [[Note Name]]
        wiki_links = re.findall(r'\[\[([^\]]+)\]\]', body)

        # Calculate relative path from vault root
        try:
            relative_path = filepath.relative_to(vault_root)
        except ValueError:
            relative_path = filepath

        return {
            "id": str(relative_path),
            "relative_path": str(relative_path),
            "absolute_path": str(filepath),
            "filename": filepath.stem,
            "frontmatter": frontmatter,
            "body": body,
            "tags": list(all_tags),
            "wiki_links": wiki_links,
            "created": frontmatter.get('created') or frontmatter.get('date'),
            "modified": datetime.fromtimestamp(filepath.stat().st_mtime).isoformat(),
            "folder": str(filepath.parent.relative_to(vault_root)) if filepath.parent != vault_root else "",
        }
