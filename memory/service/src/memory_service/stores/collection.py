"""A tiny document-collection port, so each side table is written once and runs on memory
(tests) or on Mongo (the memory service's own database on the shared replica set rs0)."""

from __future__ import annotations

import copy
from typing import Any, Protocol


class Collection(Protocol):
    async def get(self, doc_id: str) -> dict[str, Any] | None: ...

    async def put(self, doc: dict[str, Any]) -> None:
        """Insert or replace by `_id`."""
        ...

    async def delete(self, doc_id: str) -> None: ...

    async def find(self, **equals: Any) -> list[dict[str, Any]]:
        """Documents whose fields equal the given values (all of them)."""
        ...

    async def delete_where(self, **equals: Any) -> int: ...

    async def put_if_absent(self, doc: dict[str, Any]) -> bool:
        """Insert only if no document has this `_id`. Atomic. Gives whether it was inserted."""
        ...

    async def replace_if(self, doc: dict[str, Any], **expect: Any) -> bool:
        """Replace the document with this `_id` only if it still has all `expect` values.
        Atomic. Gives whether it was replaced."""
        ...


class MemoryCollection:
    def __init__(self) -> None:
        self.docs: dict[str, dict[str, Any]] = {}

    async def get(self, doc_id: str) -> dict[str, Any] | None:
        d = self.docs.get(doc_id)
        return copy.deepcopy(d) if d is not None else None

    async def put(self, doc: dict[str, Any]) -> None:
        self.docs[doc["_id"]] = copy.deepcopy(doc)

    async def delete(self, doc_id: str) -> None:
        self.docs.pop(doc_id, None)

    async def find(self, **equals: Any) -> list[dict[str, Any]]:
        return [copy.deepcopy(d) for _, d in sorted(self.docs.items())
                if all(d.get(k) == v for k, v in equals.items())]

    async def delete_where(self, **equals: Any) -> int:
        gone = [k for k, d in self.docs.items() if all(d.get(k2) == v for k2, v in equals.items())]
        for k in gone:
            del self.docs[k]
        return len(gone)


    async def put_if_absent(self, doc: dict[str, Any]) -> bool:
        if doc["_id"] in self.docs:  # no await between check and write: atomic on one loop
            return False
        self.docs[doc["_id"]] = copy.deepcopy(doc)
        return True

    async def replace_if(self, doc: dict[str, Any], **expect: Any) -> bool:
        cur = self.docs.get(doc["_id"])
        if cur is None or any(cur.get(k) != v for k, v in expect.items()):
            return False
        self.docs[doc["_id"]] = copy.deepcopy(doc)
        return True


class MongoCollection:
    """Motor collection. Every query the side tables make includes `user_id`; indexes are made
    by `ensure_indexes`."""

    def __init__(self, coll: Any) -> None:
        self.c = coll

    async def get(self, doc_id: str) -> dict[str, Any] | None:
        return await self.c.find_one({"_id": doc_id})

    async def put(self, doc: dict[str, Any]) -> None:
        await self.c.replace_one({"_id": doc["_id"]}, doc, upsert=True)

    async def delete(self, doc_id: str) -> None:
        await self.c.delete_one({"_id": doc_id})

    async def find(self, **equals: Any) -> list[dict[str, Any]]:
        return [d async for d in self.c.find(equals).sort("_id", 1)]

    async def delete_where(self, **equals: Any) -> int:
        res = await self.c.delete_many(equals)
        return res.deleted_count

    async def put_if_absent(self, doc: dict[str, Any]) -> bool:
        from pymongo.errors import DuplicateKeyError

        try:
            await self.c.insert_one(doc)
        except DuplicateKeyError:
            return False
        return True

    async def replace_if(self, doc: dict[str, Any], **expect: Any) -> bool:
        res = await self.c.replace_one({"_id": doc["_id"], **expect}, doc)
        return res.matched_count == 1
