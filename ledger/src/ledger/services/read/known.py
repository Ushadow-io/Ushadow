"""The owner's word list (known entities) through the read API. The list lives in memory as
human decisions; the ledger only forwards, so the UI and agents have ONE door. Reading needs a
scope for knowledge; writing needs a write scope too (checked in the gateway)."""

from __future__ import annotations

from ledger.clients.memory import MemoryKnownEntity, MemoryRejected, MemoryUnavailable
from ledger.read_models import (
    KnownEntitiesAnswer,
    KnownEntity,
    KnownEntityRemove,
    KnownEntityRequest,
    Refusal,
    RefusalCode,
)
from ledger.services.read.answers import ReadDeps

NOT_FOUND = Refusal(code=RefusalCode.not_found, detail="not found for this user")
UNAVAILABLE = Refusal(code=RefusalCode.unavailable, detail="memory is unavailable")
INVALID = Refusal(code=RefusalCode.invalid, detail="memory did not accept this entry")


def _entry(e: MemoryKnownEntity) -> KnownEntity:
    return KnownEntity(id=e.id, name=e.name, aliases=list(e.aliases), type=e.type, at=e.at)


class KnownHandlers:
    def __init__(self, deps: ReadDeps) -> None:
        self.d = deps

    async def list(self, user_id: str) -> KnownEntitiesAnswer | Refusal:
        try:
            found = await self.d.memory.known_entities(user_id)
        except (MemoryUnavailable, MemoryRejected):
            return UNAVAILABLE
        return KnownEntitiesAnswer(userId=user_id, entities=[_entry(e) for e in found])

    async def add(self, req: KnownEntityRequest) -> KnownEntity | Refusal:
        body = {"userId": req.userId, "name": req.name, "aliases": req.aliases, "type": req.type}
        try:
            return _entry(await self.d.memory.name_entity(body))
        except MemoryUnavailable:
            return UNAVAILABLE
        except MemoryRejected:
            return INVALID

    async def remove(self, req: KnownEntityRemove) -> dict[str, bool] | Refusal:
        try:
            removed = await self.d.memory.unname_entity(req.userId, req.name)
        except (MemoryUnavailable, MemoryRejected):
            return UNAVAILABLE
        return {"removed": True} if removed else NOT_FOUND
