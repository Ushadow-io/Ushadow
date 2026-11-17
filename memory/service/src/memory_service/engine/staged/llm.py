"""Thin JSON client for an OpenAI-compatible /chat/completions endpoint, plus a scripted fake.

Every call names its stage; the `Meter` counts calls, input/output tokens (the server's `usage`)
and seconds per stage. Prompts and answers are never logged (they hold private speech), and an
error message never quotes them.

Not shared with actions/extractor.py: that extractor builds its request inline in `extract`
and has no stage counters or structured output; changing it was out of scope.
"""

from __future__ import annotations

import json
import os
import time
from collections.abc import Callable, Mapping
from dataclasses import asdict, dataclass, field
from typing import Any, Protocol

import httpx


@dataclass
class StageCount:
    calls: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    seconds: float = 0.0
    failures: int = 0

    def add(self, other: StageCount) -> None:
        self.calls += other.calls
        self.input_tokens += other.input_tokens
        self.output_tokens += other.output_tokens
        self.seconds += other.seconds
        self.failures += other.failures


@dataclass
class Meter:
    stages: dict[str, StageCount] = field(default_factory=dict)

    def record(self, stage: str, count: StageCount) -> None:
        self.stages.setdefault(stage, StageCount()).add(count)

    def calls(self, stage: str | None = None) -> int:
        if stage is not None:
            return self.stages.get(stage, StageCount()).calls
        return sum(c.calls for c in self.stages.values())

    def total(self) -> StageCount:
        out = StageCount()
        for c in self.stages.values():
            out.add(c)
        return out

    def as_dict(self) -> dict[str, dict[str, float]]:
        out = {k: asdict(v) for k, v in sorted(self.stages.items())}
        out["total"] = asdict(self.total())
        return out


@dataclass(frozen=True)
class LLMRequest:
    stage: str  # extract | match | reconcile | review | dup_facts
    prompt: str
    schema_name: str
    schema: dict[str, Any]
    payload: Any = None  # the data the prompt was built from (the fake answers from it)


class LLMError(RuntimeError):
    """The model gave no usable JSON. The message never holds prompt or answer text."""


class LLM(Protocol):
    model: str
    meter: Meter

    async def ask(self, req: LLMRequest) -> dict[str, Any]: ...


@dataclass(frozen=True)
class LLMConfig:
    base_url: str
    model: str
    api_key: str = field(default="none", repr=False)
    extra_body: Mapping[str, Any] = field(default_factory=dict)
    response_format: str = "json_schema"  # json_schema | json_object
    timeout_seconds: float = 600.0

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> LLMConfig:
        """MEMORY_LLM_BASE_URL, MEMORY_LLM_MODEL (MEMORY_STAGED_MODEL overrides), MEMORY_LLM_API_KEY,
        MEMORY_LLM_EXTRA_BODY (JSON merged into every request), MEMORY_LLM_RESPONSE_FORMAT,
        MEMORY_LLM_TIMEOUT_SECONDS. No OPENAI_API_KEY fallback."""
        e = env if env is not None else os.environ
        base, model = e.get("MEMORY_LLM_BASE_URL"), e.get("MEMORY_STAGED_MODEL") or e.get("MEMORY_LLM_MODEL")
        if not base or not model:
            raise RuntimeError("staged engine needs MEMORY_LLM_BASE_URL and MEMORY_LLM_MODEL")
        extra = json.loads(e.get("MEMORY_LLM_EXTRA_BODY") or "{}")
        if not isinstance(extra, dict):
            raise ValueError("MEMORY_LLM_EXTRA_BODY must be a JSON object")
        return cls(base_url=base, model=model, api_key=e.get("MEMORY_LLM_API_KEY") or "none",
                   extra_body=extra,
                   response_format=e.get("MEMORY_LLM_RESPONSE_FORMAT") or "json_schema",
                   timeout_seconds=float(e.get("MEMORY_LLM_TIMEOUT_SECONDS") or 600))


def _response_format(cfg: LLMConfig, req: LLMRequest) -> dict[str, Any]:
    if cfg.response_format == "json_object":
        return {"type": "json_object"}
    return {"type": "json_schema",
            "json_schema": {"name": req.schema_name, "schema": req.schema, "strict": True}}


def parse_json(content: str | None) -> dict[str, Any]:
    try:
        data = json.loads(content or "")
    except json.JSONDecodeError as exc:
        raise LLMError("model answer is not JSON") from exc
    if not isinstance(data, dict):
        raise LLMError("model answer is not a JSON object")
    return data


class OpenAICompatibleLLM:
    def __init__(self, cfg: LLMConfig, http: httpx.AsyncClient | None = None) -> None:
        self.cfg = cfg
        self.model = cfg.model
        self.meter = Meter()
        self._url = cfg.base_url.rstrip("/") + "/chat/completions"
        self._headers = {"Authorization": f"Bearer {cfg.api_key}"}
        self._http = http or httpx.AsyncClient(
            timeout=httpx.Timeout(cfg.timeout_seconds, connect=10.0))

    def body(self, req: LLMRequest) -> dict[str, Any]:
        return {"model": self.model, "temperature": 0,
                "messages": [{"role": "user", "content": req.prompt}],
                "response_format": _response_format(self.cfg, req), **self.cfg.extra_body}

    async def ask(self, req: LLMRequest) -> dict[str, Any]:
        t0 = time.perf_counter()
        count = StageCount(calls=1)
        try:
            r = await self._http.post(self._url, headers=self._headers, json=self.body(req))
            r.raise_for_status()
            data = r.json()
            usage = data.get("usage") or {}
            count.input_tokens = int(usage.get("prompt_tokens") or 0)
            count.output_tokens = int(usage.get("completion_tokens") or 0)
            return parse_json(data["choices"][0]["message"].get("content"))
        except Exception:
            count.failures = 1
            raise
        finally:
            count.seconds = time.perf_counter() - t0
            self.meter.record(req.stage, count)


Answer = dict[str, Any] | Callable[[LLMRequest], dict[str, Any]]


class FakeLLM:
    """Scripted answers keyed by stage, for tests. A stage's script is a list (answers used in
    order; a callable item is called with the request) or one callable used for every call.
    Every request is kept in `requests`. Tokens are estimated as characters / 4."""

    def __init__(self, script: Mapping[str, list[Answer] | Answer] | None = None,
                 model: str = "fake-llm") -> None:
        self.script: dict[str, Any] = {k: list(v) if isinstance(v, list) else v
                                       for k, v in (script or {}).items()}
        self.model = model
        self.meter = Meter()
        self.requests: list[LLMRequest] = []

    def prompts(self, stage: str) -> list[str]:
        return [r.prompt for r in self.requests if r.stage == stage]

    def _next(self, req: LLMRequest) -> dict[str, Any]:
        entry = self.script.get(req.stage)
        if isinstance(entry, list):
            if not entry:
                raise LLMError(f"FakeLLM: no scripted answer left for stage {req.stage}")
            entry = entry.pop(0)
        if entry is None:
            raise LLMError(f"FakeLLM: no script for stage {req.stage}")
        return entry(req) if callable(entry) else entry

    async def ask(self, req: LLMRequest) -> dict[str, Any]:
        self.requests.append(req)
        answer = self._next(req)
        self.meter.record(req.stage, StageCount(calls=1, input_tokens=len(req.prompt) // 4,
                                                output_tokens=len(json.dumps(answer)) // 4))
        return answer
