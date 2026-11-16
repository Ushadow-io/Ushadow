"""Stores for Decisions (Link), Moments and Erasure records."""

from __future__ import annotations

import contextlib

from pymongo.errors import DuplicateKeyError

from ledger.models import Erasure, Moment, MomentStatus
from ledger.schema import Link, TimeRange
from ledger.stores.base import Doc, DocStore, EvidenceStore, Outcome
from ledger.stores.evidence import range_query
from ledger.timeutil import ts


class LinkStore(EvidenceStore):
    """Decisions are never changed. To override one, save a Link that retracts it."""

    @staticmethod
    def key(user_id: str, link_id: str) -> str:
        return f"{user_id}|{link_id}"

    async def save(self, user_id: str, link: Link) -> Outcome:
        doc = {
            "_id": self.key(user_id, link.id),
            "userId": user_id,
            "linkId": link.id,
            "key": link.key,
            "kind": link.kind.value,
            "fromId": link.fromId,
            "toId": link.toId,
            "decidedBy": link.decidedBy.value,
            "retracts": link.retracts,
            "recordedAt": ts(link.recordedAt),
            "body": link.model_dump(mode="json"),
        }
        return await self.put(doc)

    async def load(self, user_id: str, link_id: str) -> Link | None:
        doc = await self.get(self.key(user_id, link_id))
        return Link.model_validate(doc["body"]) if doc else None

    async def by_key(self, user_id: str, key: str) -> list[Link]:
        docs = await self.find({"userId": user_id, "key": key}, sort=[("recordedAt", 1)])
        return [Link.model_validate(d["body"]) for d in docs]

    async def touching(self, user_id: str, item_ids: list[str]) -> list[Link]:
        query = {
            "userId": user_id,
            "$or": [{"fromId": {"$in": item_ids}}, {"toId": {"$in": item_ids}}],
        }
        docs = await self.find(query, sort=[("recordedAt", 1), ("_id", 1)])
        return [Link.model_validate(d["body"]) for d in docs]


class MomentStore(DocStore):
    """Moments are work units: the range never changes, the status does."""

    async def add(self, moment: Moment) -> Outcome:
        existing = await self.get(moment.key)
        if existing is not None:
            return Outcome.present
        body = moment.model_dump(mode="json")
        doc = {
            "_id": moment.key,
            "userId": moment.userId,
            "recordingId": moment.recordingId,
            "start": ts(moment.range.start),
            "end": ts(moment.range.end),
            "body": body,
        }
        try:
            await self._c.insert_one(doc)
        except DuplicateKeyError:  # a concurrent ingest cut the same moment first
            return Outcome.present
        return Outcome.created

    async def list(
        self, user_id: str, rng: TimeRange | None = None, recording_id: str | None = None
    ) -> list[Moment]:
        extra: Doc = {"recordingId": recording_id} if recording_id else {}
        docs = await self.find(range_query(user_id, rng, **extra), sort=[("start", 1), ("_id", 1)])
        return [Moment.model_validate(d["body"]) for d in docs]

    async def set_status(self, key: str, status: MomentStatus, count_attempt: bool = False) -> bool:
        doc = await self.get(key)
        if doc is None:
            return False
        body = {**doc["body"], "status": status.value}
        if count_attempt:
            body["attempts"] = body.get("attempts", 0) + 1
        await self._c.update_one({"_id": key}, {"$set": {"body": body}})
        return True

    async def set_content(self, moment: Moment, revision: str, content_hash: str) -> bool:
        """Point the moment at new text. The range and key never change. When the text
        changed, the moment goes back to `ready` for a new run. Returns True on a re-run."""
        rerun = content_hash != moment.contentHash
        body = {
            **moment.model_dump(mode="json"),
            "contentRevision": revision,
            "contentHash": content_hash,
        }
        if rerun:
            body["status"] = MomentStatus.ready.value
            body["reruns"] = moment.reruns + 1
        await self._c.update_one({"_id": moment.key}, {"$set": {"body": body}})
        return rerun

    async def delete_overlapping(self, user_id: str, recording_id: str, rng: TimeRange) -> int:
        return await self.delete_many(range_query(user_id, rng, recordingId=recording_id))


class ErasureStore(DocStore):
    async def add(self, erasure: Erasure) -> None:
        """Insert once. The same erase twice at the same time: the first record stays."""
        doc = {
            "_id": erasure.id,
            "userId": erasure.userId,
            "recordingId": erasure.recordingId,
            "start": ts(erasure.range.start),
            "end": ts(erasure.range.end),
            "body": erasure.model_dump(mode="json"),
        }
        with contextlib.suppress(DuplicateKeyError):
            await self._c.insert_one(doc)

    async def for_recording(self, user_id: str, recording_id: str) -> list[Erasure]:
        docs = await self.find(
            {"userId": user_id, "recordingId": recording_id}, sort=[("start", 1), ("_id", 1)]
        )
        return [Erasure.model_validate(d["body"]) for d in docs]

    async def list(self, user_id: str, rng: TimeRange | None = None) -> list[Erasure]:
        docs = await self.find(range_query(user_id, rng), sort=[("start", 1), ("_id", 1)])
        return [Erasure.model_validate(d["body"]) for d in docs]
