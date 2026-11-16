"""L2 stores: conversations (a rebuildable view) and rolling-state records (a model cache).

Conversation doc: {_id, userId, convId, start, end, active, revision, digest, body
(Conversation), fragments, state, decisions, momentKeys, composedRevision}. A conversation that
a rebuild no longer makes is retired (active false) with its text removed; its revision is
kept, so the id keeps counting up if it comes back.

State doc: {_id, userId, stateId, start, end, body}. Keyed on the input digest, so a re-run
finds the answer and asks no model. Erase deletes the records in the erased conversations.
"""

from __future__ import annotations

from typing import Any

from ledger.schema import TimeRange
from ledger.stores.base import Doc, DocStore
from ledger.stores.evidence import range_query
from ledger.timeutil import ts

_TEXT_FIELDS = ("title", "summary", "citations")


class ConversationStore(DocStore):
    @staticmethod
    def key(user_id: str, conv_id: str) -> str:
        return f"{user_id}|{conv_id}"

    async def load(self, user_id: str, conv_id: str) -> Doc | None:
        return await self.get(self.key(user_id, conv_id))

    async def put(self, doc: Doc) -> None:
        await self._c.replace_one({"_id": doc["_id"]}, doc, upsert=True)

    async def active(self, user_id: str, rng: TimeRange | None = None) -> list[Doc]:
        query = range_query(user_id, rng, active=True)
        return await self.find(query, sort=[("start", 1), ("_id", 1)])

    async def set_fields(self, user_id: str, conv_id: str, fields: dict[str, Any]) -> None:
        await self._c.update_one({"_id": self.key(user_id, conv_id)}, {"$set": fields})

    async def redact(self, doc: Doc) -> None:
        """Remove every derived text (title, summary, citations, state, fragment topics) and
        force the next build to make a new revision."""
        body = {k: v for k, v in doc["body"].items() if k not in _TEXT_FIELDS}
        fragments = [{**f, "topic": None, "summary": None} for f in doc.get("fragments", [])]
        await self._c.update_one(
            {"_id": doc["_id"]},
            {
                "$set": {
                    "body": body,
                    "fragments": fragments,
                    "state": None,
                    "digest": "",
                    "composedRevision": None,
                }
            },
        )

    async def retire(self, doc: Doc) -> None:
        await self.redact(doc)
        await self._c.update_one({"_id": doc["_id"]}, {"$set": {"active": False}})


class StateStore(DocStore):
    @staticmethod
    def key(user_id: str, state_id: str) -> str:
        return f"{user_id}|{state_id}"

    async def load(self, user_id: str, state_id: str) -> Doc | None:
        return await self.get(self.key(user_id, state_id))

    async def put(self, user_id: str, state_id: str, rng: TimeRange, body: Doc) -> None:
        doc = {
            "_id": self.key(user_id, state_id),
            "userId": user_id,
            "stateId": state_id,
            "start": ts(rng.start),
            "end": ts(rng.end),
            "body": body,
        }
        await self._c.replace_one({"_id": doc["_id"]}, doc, upsert=True)

    async def delete_overlapping(self, user_id: str, rng: TimeRange) -> int:
        return await self.delete_many(range_query(user_id, rng))
