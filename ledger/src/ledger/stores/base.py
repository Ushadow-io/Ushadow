"""Store primitives.

Every document is `{_id, userId, <index fields>, body, fp}`. `body` is the life-datatypes object
in JSON mode; `fp` is its fingerprint. Times in index fields are fixed-width UTC strings
(timeutil.ts), so range queries behave the same in Mongo and in mongomock.
"""

from __future__ import annotations

from collections.abc import Callable
from enum import StrEnum
from typing import Any

from pymongo.errors import DuplicateKeyError

from ledger.timeutil import fingerprint

Doc = dict[str, Any]
GrowFn = Callable[[Doc, Doc], Doc | None]


class EvidenceImmutableError(Exception):
    """Raised when a write would change stored evidence."""


class Outcome(StrEnum):
    created = "created"
    present = "present"
    extended = "extended"
    replaced = "replaced"


class DocStore:
    """Thin async wrapper over one Motor collection."""

    def __init__(self, collection: Any) -> None:
        self._c = collection

    async def get(self, key: str) -> Doc | None:
        return await self._c.find_one({"_id": key})

    async def find(self, query: Doc, sort: list[tuple[str, int]] | None = None) -> list[Doc]:
        cursor = self._c.find(query)
        if sort:
            cursor = cursor.sort(sort)
        return await cursor.to_list(None)

    async def delete_many(self, query: Doc) -> int:
        result = await self._c.delete_many(query)
        return result.deleted_count


class EvidenceStore(DocStore):
    """Insert-once store. A second write of the same key must carry the same content.

    `grow` (optional) allows a narrow, explicit kind of change: filling an unset field or
    extending an open recording. It returns the merged body, or None when the new body
    conflicts with the stored one. Anything else is refused with EvidenceImmutableError.
    """

    def __init__(self, collection: Any, grow: GrowFn | None = None) -> None:
        super().__init__(collection)
        self._grow = grow

    async def put(self, doc: Doc) -> Outcome:
        doc = {**doc, "fp": fingerprint(doc["body"])}
        try:
            await self._c.insert_one(doc)
            return Outcome.created
        except DuplicateKeyError:
            return await self._on_existing(doc)

    async def _on_existing(self, doc: Doc) -> Outcome:
        existing = await self.get(doc["_id"])
        if existing is None:  # deleted in between; try once more
            await self._c.insert_one(doc)
            return Outcome.created
        if existing["fp"] == doc["fp"]:
            return Outcome.present
        merged = self._grow(existing["body"], doc["body"]) if self._grow else None
        if merged is None:
            raise EvidenceImmutableError(f"refused: stored evidence {doc['_id']} differs")
        if fingerprint(merged) == existing["fp"]:
            return Outcome.present
        await self._replace_body(existing, merged)
        return Outcome.extended

    async def update(self, *_: Any, **__: Any) -> None:
        """Evidence is never updated. A new reading is a new revision; a fix is a correction."""
        raise EvidenceImmutableError("evidence is never updated")

    async def put_provisional(self, doc: Doc) -> Outcome:
        """The ONE overwrite path: provisional (live) evidence, before a final revision exists.

        The caller (ingest) must check that the recording has no final revision. Final
        evidence never goes through here.
        """
        doc = {**doc, "fp": fingerprint(doc["body"]), "provisional": True}
        existing = await self.get(doc["_id"])
        if existing is None:
            return await self.put(doc)
        if existing["fp"] == doc["fp"]:
            return Outcome.present
        await self._c.replace_one({"_id": doc["_id"]}, doc)
        return Outcome.replaced

    async def redact(self, key: str, body: Doc, erasure_id: str) -> None:
        """Erase path only: replace the body with a version that has the erased parts removed."""
        existing = await self.get(key)
        if existing is None:
            return
        erased = sorted({*existing.get("erasedBy", []), erasure_id})
        await self._replace_body(existing, body, erasedBy=erased)

    async def _replace_body(self, existing: Doc, body: Doc, **extra: Any) -> None:
        new = {**existing, **extra, "body": body, "fp": fingerprint(body)}
        await self._c.replace_one({"_id": existing["_id"]}, new)
