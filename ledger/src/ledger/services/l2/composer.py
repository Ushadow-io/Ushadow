"""Composer: one call per closed conversation -> title, summary, citations.

Keyed on (conversation id, revision): `composedRevision` on the doc says it ran, so a re-run
asks nothing. Code checks every citation: it must be a segment of this conversation. An
answer with a bad citation is retried (bounded); after that, the bad citations are dropped and
only verified ones are stored. Unavailable model: nothing is stored; the next run asks again.
"""

from __future__ import annotations

from collections.abc import Sequence

from ledger.llm.structured import Call, StructuredCaller
from ledger.schema import EvidenceRef
from ledger.services.l2.build import Built
from ledger.services.l2.context import RunCtx
from ledger.services.l2.lines import Line
from ledger.services.l2.prompts import COMPOSER_SYSTEM, ComposeAnswer, composer_payload

QUOTE_MAX = 200


def _checker(known: set[str]):
    def check(answer: ComposeAnswer) -> str | None:
        bad = [c for c in answer.citations if c not in known]
        return f"unknown_citations:{len(bad)}" if bad else None

    return check


def citations(ids: Sequence[str], lines: Sequence[Line]) -> list[EvidenceRef]:
    by_id = {ln.seg_id: ln for ln in lines}
    out: list[EvidenceRef] = []
    for seg_id in dict.fromkeys(ids):
        line = by_id.get(seg_id)
        if line is not None:
            out.append(
                EvidenceRef(
                    recordingId=line.recording_id,
                    range=line.range,
                    transcriptRevision=line.revision,
                    quote=line.text[:QUOTE_MAX],
                )
            )
    return out


class Composer:
    def __init__(self, caller: StructuredCaller) -> None:
        self._caller = caller

    async def compose(self, ctx: RunCtx, built: Built, doc: dict) -> bool:
        """Compose one conversation if its revision has no composition yet. True when stored."""
        revision = doc["revision"]
        if doc.get("composedRevision") == revision or doc["body"].get("closedAt") is None:
            return False
        known = {ln.seg_id for ln in built.lines}
        call = Call(
            "composer",
            COMPOSER_SYSTEM,
            composer_payload(built.state, built.lines),
            ComposeAnswer,
            max_tokens=500,
            check=_checker(known),
        )
        answer = await self._caller.ask(call, ctx.stats)
        if answer.unavailable:
            return False
        fields: dict = {"composedRevision": revision}
        fields["changedAt"] = await ctx.stores.conversations.next_change(ctx.user_id, ctx.clock())
        if answer.value is not None:  # ok, or the last answer with its bad citations dropped
            value: ComposeAnswer = answer.value
            body = {
                **doc["body"],
                "title": value.title,
                "summary": value.summary or None,
                "citations": [
                    c.model_dump(mode="json") for c in citations(value.citations, built.lines)
                ]
                or None,
            }
            fields["body"] = body
        await ctx.stores.conversations.set_fields(ctx.user_id, built.conversation.id, fields)
        return True
