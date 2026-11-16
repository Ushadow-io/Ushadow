"""Side tables the memory service owns, outside the engine. Every row has `user_id` and every
read filters on it. Rows hold ids, ranges and hashes; only the proof table holds words (the
quote), and erase removes those rows."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from memory_service.models import Decision, UnitStatus, WorkUnit
from memory_service.schema import EvidenceRef, TimeRange
from memory_service.stores.collection import Collection, MemoryCollection, MongoCollection
from memory_service.textutil import digest, iso, overlaps, parse_iso


class WorkQueue:
    """Ingest work units: one per (user, conversation, revision), with status and attempts."""

    def __init__(self, c: Collection) -> None:
        self.c = c

    async def get(self, unit_id: str) -> WorkUnit | None:
        d = await self.c.get(unit_id)
        return WorkUnit.model_validate(d) if d else None

    async def save(self, unit: WorkUnit) -> None:
        unit.updated_at = datetime.now(UTC)
        doc = unit.model_dump(mode="json")
        await self.c.put({"_id": unit.id, **doc})

    async def save_new(self, unit: WorkUnit) -> bool:
        """Save only if no unit with this id exists yet (atomic), so a worker that lost the race
        never overwrites the winner's running or done unit. Gives whether it was saved."""
        unit.updated_at = datetime.now(UTC)
        return await self.c.put_if_absent({"_id": unit.id, **unit.model_dump(mode="json")})

    async def for_conversation(self, user_id: str, conversation_id: str) -> list[WorkUnit]:
        docs = await self.c.find(user_id=user_id, conversation_id=conversation_id)
        return sorted((WorkUnit.model_validate(d) for d in docs), key=lambda u: u.revision)

    async def users_with(self, *statuses: UnitStatus) -> list[str]:
        """Users that have at least one unit in one of these statuses."""
        out: set[str] = set()
        for s in statuses:
            out.update(await self.c.distinct("user_id", status=s.value))
        return sorted(out)

    async def for_user(self, user_id: str, status: UnitStatus | None = None) -> list[WorkUnit]:
        q: dict[str, Any] = {"user_id": user_id}
        if status is not None:
            q["status"] = status.value
        return [WorkUnit.model_validate(d) for d in await self.c.find(**q)]


@dataclass(frozen=True)
class Proof:
    fact_id: str
    evidence: EvidenceRef
    conversation_id: str
    revision: int


class ProofStore:
    def __init__(self, c: Collection) -> None:
        self.c = c

    async def add(self, user_id: str, proof: Proof) -> None:
        ev = proof.evidence
        pid = digest(user_id, proof.fact_id, ev.recordingId, iso(ev.range.start), iso(ev.range.end),
                     ev.quote or "", proof.conversation_id, str(proof.revision))
        await self.c.put({
            "_id": pid, "user_id": user_id, "fact_id": proof.fact_id,
            "recording_id": ev.recordingId, "start": iso(ev.range.start), "end": iso(ev.range.end),
            "transcript_revision": ev.transcriptRevision, "quote": ev.quote,
            "conversation_id": proof.conversation_id, "revision": proof.revision})

    @staticmethod
    def _proof(d: dict[str, Any]) -> Proof:
        ev = EvidenceRef(recordingId=d["recording_id"],
                         range=TimeRange(start=parse_iso(d["start"]), end=parse_iso(d["end"])),
                         transcriptRevision=d.get("transcript_revision"), quote=d.get("quote"))
        return Proof(d["fact_id"], ev, d["conversation_id"], d["revision"])

    async def for_fact(self, user_id: str, fact_id: str) -> list[Proof]:
        return [self._proof(d) for d in await self.c.find(user_id=user_id, fact_id=fact_id)]

    async def delete_for_fact(self, user_id: str, fact_id: str) -> int:
        return await self.c.delete_where(user_id=user_id, fact_id=fact_id)

    async def delete_for_unit(self, user_id: str, conversation_id: str, revision: int) -> list[str]:
        docs = await self.c.find(user_id=user_id, conversation_id=conversation_id, revision=revision)
        for d in docs:
            await self.c.delete(d["_id"])
        return sorted({d["fact_id"] for d in docs})

    async def remove_in_range(self, user_id: str, recording_id: str, rng: TimeRange) -> list[str]:
        """Delete every proof on `recording_id` that overlaps `rng`. Gives the fact ids hit."""
        hit = []
        for d in await self.c.find(user_id=user_id, recording_id=recording_id):
            if overlaps(parse_iso(d["start"]), parse_iso(d["end"]), rng.start, rng.end):
                await self.c.delete(d["_id"])
                hit.append(d["fact_id"])
        return hit

    async def delete_user(self, user_id: str) -> None:
        await self.c.delete_where(user_id=user_id)


class FactRegistry:
    """Our fact id <-> the engine ids that carry it, and the episodes that produced it."""

    def __init__(self, c: Collection) -> None:
        self.c = c

    async def upsert(self, user_id: str, fact_id: str, engine_id: str, episode_key: str) -> None:
        doc_id = f"{user_id}|{fact_id}"
        d = await self.c.get(doc_id) or {"_id": doc_id, "user_id": user_id, "fact_id": fact_id,
                                          "engine_ids": [], "episodes": []}
        if engine_id not in d["engine_ids"]:
            d["engine_ids"].append(engine_id)
        if episode_key and episode_key not in d["episodes"]:
            d["episodes"].append(episode_key)
        await self.c.put(d)

    async def get(self, user_id: str, fact_id: str) -> dict[str, Any] | None:
        return await self.c.get(f"{user_id}|{fact_id}")

    async def for_user(self, user_id: str) -> list[dict[str, Any]]:
        return await self.c.find(user_id=user_id)

    async def put(self, doc: dict[str, Any]) -> None:
        await self.c.put(doc)

    async def delete(self, user_id: str, fact_id: str) -> None:
        await self.c.delete(f"{user_id}|{fact_id}")

    async def delete_user(self, user_id: str) -> None:
        await self.c.delete_where(user_id=user_id)


class ClosureStore:
    """Which engine facts each episode closed. Graphiti's remove_episode does not reopen them."""

    def __init__(self, c: Collection) -> None:
        self.c = c

    async def add(self, user_id: str, episode_key: str, engine_ids: list[str]) -> None:
        for eid in engine_ids:
            await self.c.put({"_id": f"{user_id}|{episode_key}|{eid}", "user_id": user_id,
                              "episode_key": episode_key, "engine_id": eid})

    async def pop_episode(self, user_id: str, episode_key: str) -> list[str]:
        docs = await self.c.find(user_id=user_id, episode_key=episode_key)
        for d in docs:
            await self.c.delete(d["_id"])
        return [d["engine_id"] for d in docs]

    async def delete_user(self, user_id: str) -> None:
        await self.c.delete_where(user_id=user_id)


class ErasedRanges:
    """Ranges the user erased. No words: recording id and times only. Ingest drops any segment
    that overlaps one, so a replay or a rebuild cannot bring the words back."""

    def __init__(self, c: Collection) -> None:
        self.c = c

    async def add(self, user_id: str, recording_id: str, rng: TimeRange) -> None:
        rid = digest(user_id, recording_id, iso(rng.start), iso(rng.end))
        await self.c.put({"_id": rid, "user_id": user_id, "recording_id": recording_id,
                          "start": iso(rng.start), "end": iso(rng.end)})

    async def for_user(self, user_id: str) -> list[tuple[str, datetime, datetime]]:
        return [(d["recording_id"], parse_iso(d["start"]), parse_iso(d["end"]))
                for d in await self.c.find(user_id=user_id)]


class DecisionStore:
    """Human wins: corrections and forget decisions, outside the engine."""

    def __init__(self, c: Collection) -> None:
        self.c = c

    async def add(self, d: Decision) -> None:
        await self.c.put({"_id": d.id, **d.model_dump(mode="json")})

    async def for_user(self, user_id: str) -> list[Decision]:
        ds = [Decision.model_validate(d) for d in await self.c.find(user_id=user_id)]
        return sorted(ds, key=lambda d: (d.created_at, d.id))


class RejectionLog:
    """Counts of rejected facts, by reason. No text."""

    def __init__(self, c: Collection) -> None:
        self.c = c

    async def count(self, user_id: str, reason: str, n: int = 1) -> None:
        if n <= 0:
            return
        doc_id = f"{user_id}|{reason}"
        d = await self.c.get(doc_id) or {"_id": doc_id, "user_id": user_id, "reason": reason,
                                          "count": 0}
        d["count"] += n
        await self.c.put(d)

    async def counts(self, user_id: str) -> dict[str, int]:
        return {d["reason"]: d["count"] for d in await self.c.find(user_id=user_id)}


class LeaseStore:
    """A lease per (user, conversation): owner id + expiry, taken atomically. An expired lease
    can be taken over, so a crashed worker does not block the unit for ever."""

    def __init__(self, c: Collection) -> None:
        self.c = c

    async def acquire(self, user_id: str, key: str, owner: str, now: datetime,
                      ttl: timedelta) -> bool:
        doc_id = f"{user_id}|{key}"
        new = {"_id": doc_id, "user_id": user_id, "owner": owner, "expires": iso(now + ttl)}
        if await self.c.put_if_absent(new):
            return True
        cur = await self.c.get(doc_id)
        if cur is None:  # released between the two calls
            return await self.c.put_if_absent(new)
        if parse_iso(cur["expires"]) > now:
            return False
        return await self.c.replace_if(new, owner=cur["owner"], expires=cur["expires"])

    async def renew(self, user_id: str, key: str, owner: str, now: datetime,
                    ttl: timedelta) -> bool:
        """Push the expiry out, only while this owner still holds the lease (a lease another
        worker took over is not renewed). Gives whether it is still ours."""
        doc_id = f"{user_id}|{key}"
        cur = await self.c.get(doc_id)
        if cur is None or cur["owner"] != owner:
            return False
        new = {"_id": doc_id, "user_id": user_id, "owner": owner, "expires": iso(now + ttl)}
        return await self.c.replace_if(new, owner=owner, expires=cur["expires"])

    async def release(self, user_id: str, key: str, owner: str) -> None:
        await self.c.delete_where(_id=f"{user_id}|{key}", owner=owner)


class SyncCursors:
    """Per user: the `since` time of the next /conversations/changes call."""

    def __init__(self, c: Collection) -> None:
        self.c = c

    async def get(self, user_id: str) -> datetime | None:
        d = await self.c.get(user_id)
        return parse_iso(d["since"]) if d else None

    async def set(self, user_id: str, since: datetime) -> None:
        await self.c.put({"_id": user_id, "user_id": user_id, "since": iso(since)})

    async def users(self) -> list[str]:
        return await self.c.distinct("user_id")


class AppliedErasures:
    """Ids of ledger erasures already run here. Ids only, no words."""

    def __init__(self, c: Collection) -> None:
        self.c = c

    async def has(self, user_id: str, erasure_id: str) -> bool:
        return await self.c.get(f"{user_id}|{erasure_id}") is not None

    async def add(self, user_id: str, erasure_id: str) -> None:
        await self.c.put({"_id": f"{user_id}|{erasure_id}", "user_id": user_id,
                          "erasure_id": erasure_id})


TABLES = ("work_units", "proofs", "fact_registry", "closures", "erased_ranges", "decisions",
          "rejections", "leases", "sync_cursors", "applied_erasures")


@dataclass
class SideTables:
    queue: WorkQueue
    proofs: ProofStore
    registry: FactRegistry
    closures: ClosureStore
    erased: ErasedRanges
    decisions: DecisionStore
    rejections: RejectionLog
    leases: LeaseStore
    cursors: SyncCursors
    applied: AppliedErasures
    collections: dict[str, Collection]


def _build(colls: dict[str, Collection]) -> SideTables:
    return SideTables(
        queue=WorkQueue(colls["work_units"]), proofs=ProofStore(colls["proofs"]),
        registry=FactRegistry(colls["fact_registry"]), closures=ClosureStore(colls["closures"]),
        erased=ErasedRanges(colls["erased_ranges"]), decisions=DecisionStore(colls["decisions"]),
        rejections=RejectionLog(colls["rejections"]), leases=LeaseStore(colls["leases"]),
        cursors=SyncCursors(colls["sync_cursors"]), applied=AppliedErasures(colls["applied_erasures"]),
        collections=colls)


def memory_tables() -> SideTables:
    return _build({name: MemoryCollection() for name in TABLES})


def mongo_tables(db: Any) -> SideTables:
    return _build({name: MongoCollection(db[name]) for name in TABLES})


async def ensure_indexes(db: Any) -> None:
    await db["work_units"].create_index([("user_id", 1), ("conversation_id", 1)])
    await db["proofs"].create_index([("user_id", 1), ("fact_id", 1)])
    await db["proofs"].create_index([("user_id", 1), ("recording_id", 1)])
    await db["proofs"].create_index([("user_id", 1), ("conversation_id", 1), ("revision", 1)])
    for name in ("fact_registry", "closures", "erased_ranges", "decisions", "rejections",
                 "applied_erasures"):
        await db[name].create_index([("user_id", 1)])
