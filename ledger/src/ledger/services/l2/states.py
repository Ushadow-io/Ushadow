"""State update: one small model call per moment (or per side of a split moment).

The record is keyed on hash(policy, previous state id, lines digest, allowSplit), so the chain of
states of one conversation is a pure function of its lines. A re-run finds every record and
asks no model; a changed moment re-runs its own state and the states after it in the same
conversation (they may carry its words), and nothing else.

A proposed topic split is checked in code: the cited segment must be a line of this moment,
and each side must keep MIN_SIDE_LINES lines and MIN_SIDE_SECONDS. A valid split is a model
`split_at` Link; a rejected one is a rule Link with reason `split_rejected:<why>`. The lines
after a split are asked again (part n, own Link key), so one moment can split up to
MAX_SPLITS_PER_MOMENT times.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from ledger.l2_models import SPLIT_POLICY, STATE_POLICY, ConvState
from ledger.llm.structured import Answer, Call, StructuredCaller
from ledger.schema import Decider, LinkKind, TimeRange
from ledger.services.l2.context import LinkSpec, RunCtx, split_key
from ledger.services.l2.lines import Line, lines_digest
from ledger.services.l2.prompts import STATE_SYSTEM, StateAnswer, ref_index, state_payload
from ledger.services.l2.rules import Side, check_split, split_index
from ledger.timeutil import stable_hash


@dataclass(frozen=True)
class StateInput:
    prev_id: str
    prev: ConvState
    lines: Sequence[Line]
    moment_key: str
    prior: Side | None  # what the conversation holds before these lines
    allow_split: bool = True
    part: int = 0  # 0: the whole moment; n: the lines after the n-th split in it


@dataclass(frozen=True)
class StateOutcome:
    state_id: str
    state: ConvState
    split_index: int | None = None
    split_link_id: str | None = None


def code_state(prev: ConvState, lines: Sequence[Line]) -> ConvState:
    """Fallback with no model: keep the topic and threads, add the names heard."""
    names = sorted({ln.name for ln in lines if ln.name} | set(prev.people))
    return ConvState(topic=prev.topic, people=names, threads=prev.threads)


def _span(lines: Sequence[Line]) -> TimeRange:
    return TimeRange(start=lines[0].start, end=lines[-1].end)


class StateUpdater:
    def __init__(self, caller: StructuredCaller) -> None:
        self._caller = caller

    async def update(self, ctx: RunCtx, inp: StateInput) -> StateOutcome:
        allow = inp.allow_split
        state_id = "st-" + stable_hash(STATE_POLICY, inp.prev_id, lines_digest(inp.lines), allow)
        saved = await ctx.stores.states.load(ctx.user_id, state_id)
        if saved is not None:
            return self._from_record(state_id, saved["body"], inp.lines)
        call = Call("state", STATE_SYSTEM, state_payload(inp.prev, inp.lines, allow), StateAnswer)
        answer = await self._caller.ask(call, ctx.stats)
        if answer.unavailable:  # not saved: the next run asks again
            return StateOutcome(state_id, code_state(inp.prev, inp.lines))
        out = await self._outcome(ctx, inp, state_id, answer)
        body = {
            "state": out.state.model_dump(),
            "splitSegId": inp.lines[out.split_index].seg_id
            if out.split_index is not None
            else None,
            "splitLinkId": out.split_link_id,
            "decidedBy": Decider.model.value if answer.ok else Decider.rule.value,
        }
        await ctx.stores.states.put(ctx.user_id, state_id, _span(inp.lines), body)
        return out

    @staticmethod
    def _from_record(state_id: str, body: dict, lines: Sequence[Line]) -> StateOutcome:
        index = split_index(lines, body.get("splitSegId")) if body.get("splitSegId") else None
        return StateOutcome(
            state_id, ConvState.model_validate(body["state"]), index, body.get("splitLinkId")
        )

    async def _outcome(
        self, ctx: RunCtx, inp: StateInput, state_id: str, answer: Answer
    ) -> StateOutcome:
        if not answer.ok:  # every attempt invalid: rule fallback, recorded in the state record
            return StateOutcome(state_id, code_state(inp.prev, inp.lines))
        value: StateAnswer = answer.value
        if not inp.allow_split or not value.topicChangedAt:
            return StateOutcome(state_id, value.state)
        index = ref_index(value.topicChangedAt, len(inp.lines))  # the model cites a line ref
        problem = "unknown_segment" if index is None else check_split(inp.prior, inp.lines, index)
        link = await ctx.write(self._split_spec(inp, state_id, index, problem, answer.model))
        if problem is not None:
            return StateOutcome(state_id, value.state, None, link.id)
        return StateOutcome(state_id, value.state, index, link.id)

    @staticmethod
    def _split_spec(
        inp: StateInput, digest: str, index: int | None, problem: str | None, model: str | None
    ) -> LinkSpec:
        recording_id = inp.lines[0].recording_id
        if problem is not None or index is None:
            return LinkSpec(
                key=split_key(inp.moment_key, inp.part),
                digest=digest,
                kind=LinkKind.continues,
                from_id=recording_id,
                to_id=inp.moment_key,
                decided_by=Decider.rule,
                policy=SPLIT_POLICY,
                reason=f"split_rejected:{problem}",
            )
        return LinkSpec(
            key=split_key(inp.moment_key, inp.part),
            digest=digest,
            kind=LinkKind.split_at,
            from_id=recording_id,
            at=inp.lines[index].start,
            decided_by=Decider.model,
            policy=SPLIT_POLICY,
            model=model,
            reason="topic_changed",
        )
