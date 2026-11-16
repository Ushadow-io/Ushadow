"""Prompts, answer schemas and size budgets of the three L2 model calls.

Budget (characters; about 4 characters per token):
- gap model:    system ~0.6k + state <= 1.1k + next lines <= 1.6k    -> under 4k (~1k tokens)
- state update: system ~0.8k + state <= 1.1k + moment lines <= 2.6k  -> under 5k (~1.2k tokens)
- composer:     system ~0.6k + state <= 1.1k + sampled lines <= 6k   -> under 8k (~2k tokens)
Lines over the budget keep their id and time but lose their text tail, so a split can still
cite any segment of the moment.
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
    "it is the same recording or device, and the next lines as 'id|time|role:speaker|text'. "
    'Answer JSON only: {"decision": "continues" | "new", "confidence": 0..1}. '
    "Say continues when the same people go on with the same exchange after a pause. "
    "Say new when other people speak, or the subject and setting clearly change."
)

STATE_SYSTEM = (
    "You keep a short rolling state of one conversation. Input: the state so far and the "
    "next lines as 'id|time|role:speaker|text'. Answer JSON only: "
    '{"state": {"topic": str, "people": [str], "threads": [str]}, "topicChangedAt": id|null}. '
    "topic: <= 12 words. people: names or roles heard, <= 8. threads: open questions or "
    "tasks, <= 5, short. Use only what the lines say. topicChangedAt: the id of the line "
    "where a clearly new, unrelated conversation starts (other people or a new purpose), "
    "else null. A drift inside one talk is not a change. Only ids from the input are valid."
)

COMPOSER_SYSTEM = (
    "You write a title and summary of one finished conversation. Input: its state and lines "
    "as 'id|time|role:speaker|text' (long talks are sampled). Answer JSON only: "
    '{"title": str (<= 10 words), "summary": str (<= 4 sentences), "citations": [id]}. '
    "Cite the ids of the lines that support the summary (1 to 6). Use only what the lines say; "
    "only ids from the input are valid."
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


def render(line: Line, text_max: int = LINE_TEXT_MAX) -> str:
    text = " ".join(line.text.split())[:text_max]
    return f"{line.seg_id}|{line.start:%H:%M:%S}|{line.who}|{text}"


def render_lines(lines: Sequence[Line], budget: int) -> list[str]:
    """All ids are kept while they fit; text is cut once the budget is used."""
    out: list[str] = []
    used = 0
    for line in lines:
        row = render(line) if used < budget else render(line, LINE_TEXT_SHORT)
        if used + len(row) > budget * 1.3:
            break
        out.append(row)
        used += len(row) + 3
    return out


def sample_lines(lines: Sequence[Line], budget: int) -> list[Line]:
    """Evenly spread lines of a long conversation, so the composer input stays bounded."""
    total = sum(len(render(ln, 160)) + 3 for ln in lines)
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


def composer_payload(state: ConvState, lines: Sequence[Line]) -> dict[str, Any]:
    picked = sample_lines(lines, COMPOSER_LINES_BUDGET)
    rows = [render(ln, 160) for ln in picked]
    return {"state": _state(state), "lines": rows}
