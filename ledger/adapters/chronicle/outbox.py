"""Tiny on-disk outbox: one JSON file per pending bundle, no dependencies.

The key coalesces repeats: a new bundle for the same key replaces the old file.
This keeps `transcript.streaming` (fires repeatedly) from piling up files.
Writes are atomic (temp file + rename). The outbox is bounded: when it is full
the oldest file is dropped and logged (data loss is visible, never silent).
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, Iterator, Tuple

logger = logging.getLogger(__name__)


class Outbox:
    def __init__(self, directory: str, max_items: int = 5000):
        self.dir = Path(directory)
        self.max_items = max_items
        self.dir.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        return self.dir / (hashlib.sha1(key.encode()).hexdigest() + ".json")

    def put(self, key: str, bundle: Dict[str, Any]) -> None:
        path = self._path(key)
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps({"key": key, "bundle": bundle}))
        os.replace(tmp, path)
        self._trim()

    def pending(self) -> Iterator[Tuple[str, Dict[str, Any]]]:
        """Oldest first. Corrupt files are quarantined, not retried forever."""
        files = sorted(self.dir.glob("*.json"), key=lambda p: p.stat().st_mtime)
        for p in files:
            try:
                item = json.loads(p.read_text())
                yield item["key"], item["bundle"]
            except Exception as e:
                logger.error("ledger_adapter: corrupt outbox file %s (%s); quarantined", p.name, e)
                try:
                    p.rename(p.with_suffix(".bad"))
                except OSError:
                    pass

    def remove(self, key: str, bundle: Dict[str, Any]) -> None:
        """Delete the entry, unless a newer bundle replaced it while it was in flight."""
        path = self._path(key)
        try:
            current = json.loads(path.read_text())
        except (OSError, ValueError):
            return
        if current.get("bundle") == bundle:
            path.unlink(missing_ok=True)

    def count(self) -> int:
        return len(list(self.dir.glob("*.json")))

    def _trim(self) -> None:
        files = sorted(self.dir.glob("*.json"), key=lambda p: p.stat().st_mtime)
        for p in files[: max(0, len(files) - self.max_items)]:
            logger.error("ledger_adapter: outbox full (%d); dropping oldest %s", self.max_items, p.name)
            p.unlink(missing_ok=True)
