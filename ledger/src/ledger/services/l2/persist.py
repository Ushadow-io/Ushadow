"""Save built conversations. Same digest: keep (and keep the composed text). New digest: the
next revision, composed text cleared. Not built any more: retired, text removed, and
`replacedBy` = the conversations of this build that overlap its time range (empty when none
does, e.g. after an erase). Every such change sets `changedAt` (stores/l2.py next_change)."""

from __future__ import annotations

from collections.abc import Callable, Sequence
from datetime import datetime

from pydantic import AwareDatetime, TypeAdapter

from ledger.l2_models import ConversationCounts
from ledger.schema import TimeRange
from ledger.services.l2.build import Built
from ledger.stores import Stores
from ledger.timeutil import ts

_WHEN = TypeAdapter(AwareDatetime | None)


def _doc(user_id: str, built: Built, revision: int, closed: datetime | None) -> dict:
    conv = built.conversation.model_copy(update={"revision": revision, "closedAt": closed})
    return {
        "userId": user_id,
        "convId": conv.id,
        "start": ts(conv.range.start),
        "end": ts(conv.range.end),
        "active": True,
        "revision": revision,
        "digest": built.digest,
        "body": conv.model_dump(mode="json"),
        "fragments": [f.model_dump(mode="json") for f in built.fragments],
        "state": built.state.model_dump(),
        "decisions": built.decisions,
        "momentKeys": built.moment_keys,
        "composedRevision": None,
    }


def _overlaps(doc: dict, other: dict) -> bool:
    return doc["start"] < other["end"] and other["start"] < doc["end"]


class Persister:
    def __init__(self, stores: Stores, clock: Callable[[], datetime]) -> None:
        self._s = stores
        self._clock = clock

    async def _change(self, user_id: str) -> str:
        return await self._s.conversations.next_change(user_id, self._clock())

    async def save(
        self, user_id: str, built: Sequence[tuple[Built, datetime | None]], scope: TimeRange
    ) -> tuple[ConversationCounts, dict[str, dict]]:
        """scope: (start, end); active conversations that start in it and were not built are
        retired. Returns the counts and the saved docs by id."""
        counts = ConversationCounts()
        store = self._s.conversations
        docs: dict[str, dict] = {}
        for item, closed in built:
            conv_id = item.conversation.id
            old = await store.load(user_id, conv_id)
            if old and old["active"] and old["digest"] == item.digest:
                counts.unchanged += 1
                await self._closed(user_id, old, closed)
                docs[conv_id] = await store.load(user_id, conv_id) or old
                continue
            revision = old["revision"] + 1 if old else 1
            doc = {"_id": store.key(user_id, conv_id), **_doc(user_id, item, revision, closed)}
            doc["changedAt"] = await self._change(user_id)
            await store.put(doc)
            docs[conv_id] = doc
            counts.created += old is None
            counts.changed += old is not None
        start, end = ts(scope.start), ts(scope.end)
        for old in await store.active(user_id, scope):
            if old["convId"] not in docs and start <= old["start"] < end:
                by = sorted(i for i, d in docs.items() if _overlaps(old, d))
                await store.retire(old, await self._change(user_id), by)
                counts.retired += 1
        return counts, docs

    async def _closed(self, user_id: str, doc: dict, closed: datetime | None) -> None:
        value = _WHEN.dump_python(closed, mode="json")
        if doc["body"].get("closedAt") == value:
            return
        body = {**doc["body"], "closedAt": value}
        fields = {"body": body, "changedAt": await self._change(user_id)}
        await self._s.conversations.set_fields(user_id, doc["convId"], fields)
