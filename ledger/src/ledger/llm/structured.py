"""Structured JSON calls: validate the answer, retry a bounded number of times, count sizes.

A call returns an Answer:
- ok: the answer parsed and passed validation (and the optional check);
- not ok: every attempt failed validation. `value` holds the last parsed answer, if any. The
  caller then falls back to a rule decision and records it as such;
- unavailable: the model could not be reached. The caller uses a rule for this build only and
  saves nothing, so the next run asks again.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel, Field

from ledger.llm.client import ModelClient, ModelRequest, ModelUnavailable

log = logging.getLogger("ledger.llm")

CHARS_PER_TOKEN = 4  # rough estimate, for the size budget only


class LayerStats(BaseModel):
    calls: int = 0
    retries: int = 0
    invalid: int = 0
    fallbacks: int = 0
    unavailable: int = 0
    inputChars: int = 0
    maxInputChars: int = 0
    outputChars: int = 0

    @property
    def max_input_tokens(self) -> int:
        return -(-self.maxInputChars // CHARS_PER_TOKEN)


class ModelStats(BaseModel):
    layers: dict[str, LayerStats] = Field(default_factory=dict)
    maxInputTokensEstimate: int = 0

    def layer(self, name: str) -> LayerStats:
        return self.layers.setdefault(name, LayerStats())

    @property
    def calls(self) -> int:
        return sum(s.calls for s in self.layers.values())

    def finish(self) -> ModelStats:
        tokens = [s.max_input_tokens for s in self.layers.values()]
        self.maxInputTokensEstimate = max(tokens, default=0)
        return self


Check = Callable[[Any], str | None]


@dataclass(frozen=True)
class Call:
    layer: str
    system: str
    payload: dict[str, Any]
    schema: type[BaseModel]
    max_tokens: int = 400
    check: Check | None = None


@dataclass(frozen=True)
class Answer:
    value: Any = None
    ok: bool = False
    unavailable: bool = False
    problem: str | None = None
    model: str | None = None


def _parse(raw: str, call: Call) -> tuple[Any, str | None]:
    text = raw.strip()
    if text.startswith("```"):
        text = text.strip("`").removeprefix("json").strip()
    try:
        value = call.schema.model_validate(json.loads(text))
    except ValueError as exc:  # JSONDecodeError and ValidationError are ValueErrors
        return None, type(exc).__name__
    problem = call.check(value) if call.check else None
    return value, problem


class StructuredCaller:
    def __init__(self, client: ModelClient, totals: ModelStats, retries: int = 2) -> None:
        self._client = client
        self._totals = totals
        self._retries = retries

    @property
    def model_name(self) -> str:
        return self._client.name

    def _count(self, sinks: tuple[ModelStats, ...], layer: str, field: str, n: int = 1) -> None:
        for sink in sinks:
            stats = sink.layer(layer)
            setattr(stats, field, getattr(stats, field) + n)

    def _count_input(self, sinks: tuple[ModelStats, ...], layer: str, chars: int) -> None:
        for sink in sinks:
            stats = sink.layer(layer)
            stats.calls += 1
            stats.inputChars += chars
            stats.maxInputChars = max(stats.maxInputChars, chars)

    async def ask(self, call: Call, run_stats: ModelStats) -> Answer:
        sinks = (self._totals, run_stats)
        user = json.dumps(call.payload, ensure_ascii=False, separators=(",", ":"))
        req = ModelRequest(call.layer, call.system, user, call.max_tokens)
        last: Any = None
        problem: str | None = None
        for attempt in range(self._retries + 1):
            if attempt:
                self._count(sinks, call.layer, "retries")
            self._count_input(sinks, call.layer, len(call.system) + len(user))
            try:
                raw = await self._client.complete(req)
            except ModelUnavailable:
                self._count(sinks, call.layer, "unavailable")
                return Answer(unavailable=True, problem="unavailable", model=self.model_name)
            self._count(sinks, call.layer, "outputChars", len(raw))
            value, problem = _parse(raw, call)
            if problem is None:
                return Answer(value=value, ok=True, model=self.model_name)
            last = value if value is not None else last
            self._count(sinks, call.layer, "invalid")
            log.info(
                "model answer invalid layer=%s attempt=%d problem=%s", call.layer, attempt, problem
            )
        self._count(sinks, call.layer, "fallbacks")
        return Answer(value=last, ok=False, problem=problem, model=self.model_name)
