"""Prompts, answer schemas and size budgets of the three L2 model calls.

Budget (characters; about 4 characters per token):
- gap model:    system ~0.6k + state <= 1.1k + next lines <= 1.6k    -> under 4k (~1k tokens)
- state update: system ~0.8k + state <= 1.1k + moment lines <= 2.6k  -> under 5k (~1.2k tokens)
- composer:     system ~0.6k + state <= 1.1k + sampled lines <= 6k   -> under 8k (~2k tokens)
Lines over the budget keep their ref and time but lose their text tail, so a split can still
cite any segment of the moment.

Lines are shown to the model with a short ref (L1, L2, ... in the order of the lines of that
call), never with the segment id: real segment ids are 65-79 characters (two UUIDs and an
index), a large part of the prompt tokens on a real day, and the model mis-copied them in its
composer citations (eval, 14 Nov: 11 composer answers with unknown citations in 3 runs). Code
maps a ref back to its segment.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from ledger.l2_models import ConvState
from ledger.services.l2.lines import Line

GAP_LINES_BUDGET = 1600
STATE_LINES_BUDGET = 2600
COMPOSER_LINES_BUDGET = 6000
LINE_TEXT_MAX = 240
LINE_TEXT_SHORT = 40

SMALL_INPUT_MAX_CHARS = 5000
COMPOSER_INPUT_MAX_CHARS = 8000

GAP_SYSTEM = (
    "You decide if the next part of a recorded day continues the open conversation. "
    "Input: the conversation state (topic, people, open threads), the gap in seconds, whether "
    "it is the same recording or device, and the next lines as 'ref|time|role:speaker|text'. "
    'Answer JSON only: {"decision": "continues" | "new", "confidence": 0..1}. '
    "Say continues when the same people go on with the same exchange after a pause. "
    "Say new when other people speak, or the subject and setting clearly change."
)

STATE_SYSTEM = (
    "You keep a short rolling state of one conversation. Input: the state so far and the "
    "next lines as 'ref|time|role:speaker|text'. Answer JSON only: "
    '{"state": {"topic": str, "people": [str], "threads": [str]}, "topicChangedAt": ref|null}. '
    "topic: <= 12 words. people: names or roles heard, <= 8. threads: open questions or "
    "tasks, <= 5, short. Use only what the lines say. topicChangedAt: the ref of the FIRST "
    "line of a new conversation that starts inside these lines, else null. A new "
    "conversation is the owner talking with someone else for another purpose: a visitor at "
    "the door, a phone call, a shop assistant or waiter, or a meeting that ends and a "
    "different private talk starts. Its first line is often a greeting or 'have you got a "
    "sec'. A new subject between the same people is NOT a new conversation. Voices with role "
    "media or background (TV, radio) never start one. Only refs from the input are valid."
)

COMPOSER_SYSTEM = (
    "You write a title and summary of one finished conversation. Input: its state and lines "
    "as 'ref|time|role:speaker|text' (long talks are sampled). Answer JSON only: "
    '{"title": str (<= 10 words), "summary": str (<= 4 sentences), "citations": [ref]}. '
    "Cite the refs (like L3) of the lines that support the summary (1 to 6). Use only what "
    "the lines say; only refs from the input are valid."
)


class GapAnswer(BaseModel):
    decision: Literal["continues", "new"]
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)


class StateAnswer(BaseModel):
    state: ConvState
    topicChangedAt: str | None = None


class ComposeAnswer(BaseModel):
    title: str = Field(min_length=1)
    summary: str = ""
    citations: list[str] = Field(default_factory=list)

    @field_validator("title", mode="before")
    @classmethod
    def _title(cls, value: object) -> str:
        return str(value or "")[:120]

    @field_validator("summary", mode="before")
    @classmethod
    def _summary(cls, value: object) -> str:
        return str(value or "")[:1200]

    @field_validator("citations", mode="before")
    @classmethod
    def _citations(cls, value: object) -> list[str]:
        items = value if isinstance(value, list) else []
        return [str(c) for c in items][:12]


def ref(index: int) -> str:
    return f"L{index + 1}"


def ref_index(value: object, count: int) -> int | None:
    """Index of a ref the model gave ('L3', 'l3', 3, '3'), or None when it is not one of the
    `count` lines of the call."""
    text = str(value).strip().upper()
    text = text[1:] if text.startswith("L") else text
    if not text.isdigit():
        return None
    index = int(text) - 1
    return index if 0 <= index < count else None


def render(line: Line, row_ref: str, text_max: int = LINE_TEXT_MAX) -> str:
    text = " ".join(line.text.split())[:text_max]
    return f"{row_ref}|{line.start:%H:%M:%S}|{line.who}|{text}"


def render_lines(lines: Sequence[Line], budget: int) -> list[str]:
    """All refs are kept while they fit; text is cut once the budget is used."""
    out: list[str] = []
    used = 0
    for i, line in enumerate(lines):
        r = ref(i)
        row = render(line, r) if used < budget else render(line, r, LINE_TEXT_SHORT)
        if used + len(row) > budget * 1.3:
            break
        out.append(row)
        used += len(row) + 3
    return out


def sample_lines(lines: Sequence[Line], budget: int) -> list[Line]:
    """Evenly spread lines of a long conversation, so the composer input stays bounded."""
    total = sum(len(render(ln, "L000", 160)) + 3 for ln in lines)
    if total <= budget:
        return list(lines)
    step = -(-total // budget)
    return list(lines[::step])


def _state(state: ConvState) -> dict[str, Any]:
    return state.model_dump()


def gap_payload(state: ConvState, facts: dict[str, Any], lines: Sequence[Line]) -> dict[str, Any]:
    return {"state": _state(state), **facts, "next": render_lines(lines, GAP_LINES_BUDGET)}


def state_payload(state: ConvState, lines: Sequence[Line], allow_split: bool) -> dict[str, Any]:
    return {
        "state": _state(state),
        "allowSplit": allow_split,
        "lines": render_lines(lines, STATE_LINES_BUDGET),
    }


def composer_payload(
    state: ConvState, lines: Sequence[Line]
) -> tuple[dict[str, Any], list[str]]:
    """(payload, segment id of each ref: seg_ids[i] is the segment of ref(i))."""
    picked = sample_lines(lines, COMPOSER_LINES_BUDGET)
    rows = [render(ln, ref(i), 160) for i, ln in enumerate(picked)]
    return {"state": _state(state), "lines": rows}, [ln.seg_id for ln in picked]
