"""Count REAL calls to the model endpoints.

Every HTTP request that the OpenAI SDK sends (LLM, reranker and embedder) goes
through an httpx client with event hooks. Each response is one counted call,
retries included, with the token usage that the endpoint itself returned. Nothing
is estimated: when an endpoint returns no `usage`, the call is counted and the
tokens are marked missing.

Attribution: a ContextVar holds the current episode label. asyncio tasks copy
context at creation, so Graphiti's internal gathers inherit the label.

`stub_transport` answers chat/embedding requests locally (no network). It exists
only to test the harness plumbing; its outputs are empty extractions.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import sys
import time
from collections import Counter, defaultdict
from contextvars import ContextVar
from dataclasses import asdict, dataclass
from typing import Any

import httpx

current_episode: ContextVar[str] = ContextVar("current_episode", default="(none)")
current_prompt: ContextVar[str] = ContextVar("current_prompt", default="(direct)")


@dataclass
class Call:
    kind: str  # llm | embed | other
    episode: str
    prompt: str
    status: int
    input_tokens: int | None
    output_tokens: int | None
    latency_s: float
    reasoning_tokens: int | None = None  # part of output_tokens, when the server reports it
    finish_reason: str | None = None
    server_ms: float | None = None  # llama.cpp `timings` prompt_ms + predicted_ms (compute, no queue)


class CallLedger:
    def __init__(self) -> None:
        self.calls: list[Call] = []
        self.logical_llm_calls: Counter[str] = Counter()
        self.attempt_errors: list[dict[str, str]] = []  # failed LLM attempts (JSON, empty, ...)
        self.think_stripped = 0  # responses that had a <think> block in content

    # -- httpx hooks -------------------------------------------------------
    def event_hooks(self) -> dict[str, list[Any]]:
        async def on_request(request: httpx.Request) -> None:
            request.extensions["s1_t0"] = time.perf_counter()

        async def on_response(response: httpx.Response) -> None:
            t0 = response.request.extensions.get("s1_t0", time.perf_counter())
            path = response.request.url.path
            kind = "llm" if path.endswith("/chat/completions") else (
                "embed" if path.endswith("/embeddings") else "other")
            await response.aread()
            in_tok = out_tok = reason_tok = finish = server_ms = None
            try:
                body = response.json()
                usage = body.get("usage") or {}
                in_tok = usage.get("prompt_tokens")
                out_tok = usage.get("completion_tokens")
                reason_tok = (usage.get("completion_tokens_details") or {}).get("reasoning_tokens")
                finish = ((body.get("choices") or [{}])[0] or {}).get("finish_reason")
                tm = body.get("timings") or {}
                if tm:
                    server_ms = round((tm.get("prompt_ms") or 0) + (tm.get("predicted_ms") or 0), 1)
            except (ValueError, AttributeError, IndexError):
                pass
            self.calls.append(Call(kind, current_episode.get(), current_prompt.get(),
                                   response.status_code, in_tok, out_tok,
                                   time.perf_counter() - t0, reason_tok, finish, server_ms))
            if kind == "llm" and os.environ.get("SPIKE_PROGRESS") == "1":  # ids + counts only
                c = self.calls[-1]
                print(f"      call {len(self.calls)} {c.episode} {c.prompt} {c.status} "
                      f"{c.input_tokens}+{c.output_tokens} tok {c.latency_s:.0f}s wall "
                      f"{(c.server_ms or 0) / 1000:.1f}s compute",
                      file=sys.stderr, flush=True)

        return {"request": [on_request], "response": [on_response]}

    # -- summaries ---------------------------------------------------------
    def for_episode(self, label: str) -> dict[str, Any]:
        out = summarize([c for c in self.calls if c.episode == label],
                        self.logical_llm_calls[label])
        out["llm_failed_attempts"] = sum(1 for e in self.attempt_errors if e["episode"] == label)
        return out

    def per_prompt(self, exclude: tuple[str, ...] = ()) -> dict[str, dict[str, Any]]:
        groups: dict[str, list[Call]] = defaultdict(list)
        for c in self.calls:
            if c.kind == "llm" and not c.episode.startswith(exclude or ("\0",)):
                groups[c.prompt].append(c)
        return {k: summarize(v, None) for k, v in sorted(groups.items())}

    def dump(self) -> list[dict[str, Any]]:
        return [asdict(c) for c in self.calls]


def summarize(calls: list[Call], logical: int | None) -> dict[str, Any]:
    llm = [c for c in calls if c.kind == "llm"]
    emb = [c for c in calls if c.kind == "embed"]

    def tok(cs: list[Call], attr: str) -> int:
        return sum(getattr(c, attr) or 0 for c in cs)

    return {
        "llm_http_calls": len(llm),
        "llm_logical_calls": logical,
        "llm_errors": sum(1 for c in llm if c.status >= 400),
        "llm_usage_missing": sum(1 for c in llm if c.input_tokens is None),
        "input_tokens": tok(llm, "input_tokens"),
        "output_tokens": tok(llm, "output_tokens"),
        "reasoning_tokens": tok(llm, "reasoning_tokens"),
        "llm_finish_length": sum(1 for c in llm if c.finish_reason == "length"),
        "llm_seconds": round(sum(c.latency_s for c in llm), 3),
        "llm_server_compute_seconds": round(sum(c.server_ms or 0 for c in llm) / 1000, 3),
        "embed_http_calls": len(emb),
        "embed_tokens": tok(emb, "input_tokens"),
        "other_http_calls": sum(1 for c in calls if c.kind == "other"),
    }


# -- stub endpoint (plumbing tests only) ---------------------------------------
def _minimal(schema: dict[str, Any], defs: dict[str, Any]) -> Any:
    if "$ref" in schema:
        return _minimal(defs[schema["$ref"].split("/")[-1]], defs)
    for key in ("anyOf", "oneOf"):
        if key in schema:
            opts = [o for o in schema[key] if o.get("type") != "null"]
            return _minimal(opts[0], defs) if opts else None
    if "enum" in schema:
        return schema["enum"][0]
    if "default" in schema:
        return schema["default"]
    t = schema.get("type")
    if t == "object":
        props = schema.get("properties", {})
        return {k: _minimal(props[k], defs) for k in schema.get("required", []) if k in props}
    return {"array": [], "string": "", "integer": 0, "number": 0, "boolean": False}.get(t)


def _vector(text: str, dim: int) -> list[float]:
    raw = hashlib.sha256(text.encode()).digest()
    vals = [((raw[i % len(raw)] + i) % 251) / 251 - 0.5 for i in range(dim)]
    norm = math.sqrt(sum(v * v for v in vals)) or 1.0
    return [v / norm for v in vals]


def stub_transport(embed_dim: int) -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content or b"{}")
        if request.url.path.endswith("/embeddings"):
            inputs = body.get("input")
            inputs = inputs if isinstance(inputs, list) else [inputs]
            data = [{"object": "embedding", "index": i, "embedding": _vector(str(x), embed_dim)}
                    for i, x in enumerate(inputs)]
            return httpx.Response(200, json={
                "object": "list", "data": data, "model": body.get("model", "stub"),
                "usage": {"prompt_tokens": len(inputs), "total_tokens": len(inputs)}})
        fmt = body.get("response_format") or {}
        schema = (fmt.get("json_schema") or {}).get("schema")
        content = json.dumps(_minimal(schema, schema.get("$defs", {})) if schema else {})
        return httpx.Response(200, json={
            "id": "stub", "object": "chat.completion", "created": 0,
            "model": body.get("model", "stub"),
            "choices": [{"index": 0, "finish_reason": "stop",
                         "message": {"role": "assistant", "content": content}}],
            "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2}})

    return httpx.MockTransport(handler)
