"""Join decision between two neighbour moments: human, day pass, rule, then the gap model."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from ledger.l2_models import JOIN_POLICY, ConvState
from ledger.llm.structured import Call, StructuredCaller
from ledger.schema import Decider, LinkKind
from ledger.services.decision_rules import effective
from ledger.services.l2.context import LinkSpec, RunCtx, daypass_key, human_link, join_key
from ledger.services.l2.lines import seconds
from ledger.services.l2.prompts import GAP_SYSTEM, GapAnswer, gap_payload
from ledger.services.l2.rules import JoinFacts, fallback_join, judge_join
from ledger.services.l2.views import MomentView
from ledger.timeutil import stable_hash


@dataclass(frozen=True)
class JoinOutcome:
    continues: bool
    link_id: str | None
    source: str  # human | daypass | rule | model | fallback


@dataclass(frozen=True)
class OpenConversation:
    """What the join needs to know about the open conversation."""

    state: ConvState
    state_id: str
    start: datetime  # its first line


def facts(prev: MomentView, nxt: MomentView, conv_start: datetime) -> JoinFacts:
    return JoinFacts(
        gap_seconds=seconds(prev.lines[-1].end, nxt.lines[0].start),
        same_recording=prev.recording_id == nxt.recording_id,
        same_source=prev.source_id == nxt.source_id,
        people_before=prev.people,
        people_after=nxt.people,
        conversation_seconds=seconds(conv_start, nxt.lines[-1].end),
    )


def _kind(continues: bool) -> LinkKind:
    return LinkKind.continues if continues else LinkKind.unrelated


class JoinDecider:
    def __init__(self, caller: StructuredCaller) -> None:
        self._caller = caller

    async def decide(
        self, ctx: RunCtx, pair: tuple[MomentView, MomentView], conv: OpenConversation
    ) -> JoinOutcome:
        prev, nxt = pair
        key = join_key(prev.key, nxt.key)
        human = human_link(await ctx.links(key))
        if human is not None:
            return JoinOutcome(human.kind == LinkKind.continues, human.id, "human")
        day = effective(await ctx.links(daypass_key(prev.key, nxt.key)))
        if day is not None and day.kind == LinkKind.continues:
            return JoinOutcome(True, day.id, "daypass")
        f = facts(prev, nxt, conv.start)
        ruled = judge_join(f)
        if ruled is not None:
            spec = self._spec(key, f.digest(), (prev, nxt), ruled, f.gap_seconds)
            link = await ctx.write(spec)
            return JoinOutcome(ruled[0], link.id, "rule")
        return await self._model(ctx, (prev, nxt), conv, f)

    @staticmethod
    def _spec(
        key: str,
        digest: str,
        pair: tuple[MomentView, MomentView],
        verdict: tuple[bool, str],
        gap: float,
    ) -> LinkSpec:
        return LinkSpec(
            key=key,
            digest=digest,
            kind=_kind(verdict[0]),
            from_id=pair[0].key,
            to_id=pair[1].key,
            decided_by=Decider.rule,
            policy=JOIN_POLICY,
            gap_seconds=gap,
            reason=verdict[1],
        )

    async def _model(
        self,
        ctx: RunCtx,
        pair: tuple[MomentView, MomentView],
        conv: OpenConversation,
        f: JoinFacts,
    ) -> JoinOutcome:
        prev, nxt = pair
        key = join_key(prev.key, nxt.key)
        digest = stable_hash(f.digest(), conv.state_id, nxt.digest)
        found = await ctx.find_machine(key, digest)
        if found is not None:
            source = "model" if found.decidedBy == Decider.model else "fallback"
            return JoinOutcome(found.kind == LinkKind.continues, found.id, source)
        extra = {
            "gapSeconds": round(f.gap_seconds),
            "sameRecording": f.same_recording,
            "sameDevice": f.same_source,
        }
        call = Call("gap", GAP_SYSTEM, gap_payload(conv.state, extra, nxt.lines), GapAnswer, 60)
        answer = await self._caller.ask(call, ctx.stats)
        if answer.unavailable:  # not saved: the next run asks again
            return JoinOutcome(fallback_join(f)[0], None, "fallback")
        if not answer.ok:
            ok, reason = fallback_join(f)
            spec = self._spec(key, digest, pair, (ok, f"{reason}:model_invalid"), f.gap_seconds)
            return JoinOutcome(ok, (await ctx.write(spec)).id, "fallback")
        verdict = answer.value.decision == "continues"
        spec = LinkSpec(
            key=key,
            digest=digest,
            kind=_kind(verdict),
            from_id=prev.key,
            to_id=nxt.key,
            decided_by=Decider.model,
            policy=JOIN_POLICY,
            model=answer.model,
            confidence=answer.value.confidence,
            gap_seconds=f.gap_seconds,
            reason="gap_model",
        )
        return JoinOutcome(verdict, (await ctx.write(spec)).id, "model")
