"""Model client: one small interface, an OpenAI-compatible HTTP implementation, a null one.

Config (env): LEDGER_LLM_BASE_URL (e.g. http://host:8000/v1), LEDGER_LLM_API_KEY,
LEDGER_LLM_MODEL (gap model and state update), LEDGER_LLM_COMPOSER_MODEL (optional; default
LEDGER_LLM_MODEL), LEDGER_LLM_TIMEOUT (seconds, default 30), LEDGER_LLM_SEED (default 0),
LEDGER_LLM_THINKING (default off). With no base URL or model the client is NullModel: every
call is `unavailable`, and nothing is saved for it.

Thinking is OFF by default: a reasoning model (Qwen3, ...) on llama.cpp / lemonade otherwise
spends the whole max_tokens budget in `reasoning_content` and returns `content: null` (seen
with Qwen3-1.7B on the eval server). The off switch is the chat template flag
`chat_template_kwargs.enable_thinking=false`, which models without thinking ignore.
LEDGER_LLM_THINKING=1 leaves it out (then raise the layers' max_tokens).

TEST ONLY: LEDGER_TEST_FAKE_MODEL=1 uses the deterministic FakeModel (as `ledger-day --fake`),
with LEDGER_TEST_FAKE_SPLIT_MARKER as its split marker. It is refused together with a real
model, logged loudly, and not passed by compose/ledger-compose.yaml (its environment is an
explicit list), so a deployment cannot switch it on by accident.

Nothing here logs prompt or answer text.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Any, Protocol

import httpx

log = logging.getLogger("ledger.llm")


class ModelUnavailable(Exception):
    """The model is not configured or could not be reached. Not an answer: nothing is saved."""


@dataclass(frozen=True)
class ModelRequest:
    layer: str
    system: str
    user: str
    max_tokens: int = 400


class ModelClient(Protocol):
    name: str

    async def complete(self, req: ModelRequest) -> str: ...


class NullModel:
    name = "none"

    async def complete(self, req: ModelRequest) -> str:
        raise ModelUnavailable("no model configured")


@dataclass(frozen=True)
class HttpModelConfig:
    base_url: str
    model: str
    api_key: str = ""
    timeout: float = 30.0
    transport_retries: int = 2
    seed: int | None = 0
    thinking: bool = False


def _content(data: dict[str, Any]) -> str:
    try:
        return str(data["choices"][0]["message"]["content"] or "")
    except (KeyError, IndexError, TypeError):
        return ""  # an empty answer fails validation and is retried


class OpenAICompatModel:
    """POST {base_url}/chat/completions with JSON output, temperature 0, a fixed seed and no
    thinking (see the module doc)."""

    def __init__(self, config: HttpModelConfig, transport: httpx.AsyncBaseTransport | None = None):
        self.name = config.model
        self._cfg = config
        self._transport = transport

    def _body(self, req: ModelRequest) -> dict[str, Any]:
        body: dict[str, Any] = {
            "model": self._cfg.model,
            "messages": [
                {"role": "system", "content": req.system},
                {"role": "user", "content": req.user},
            ],
            "temperature": 0,
            "max_tokens": req.max_tokens,
            "response_format": {"type": "json_object"},
        }
        if self._cfg.seed is not None:
            body["seed"] = self._cfg.seed
        if not self._cfg.thinking:
            body["chat_template_kwargs"] = {"enable_thinking": False}
        return body

    async def complete(self, req: ModelRequest) -> str:
        url = self._cfg.base_url.rstrip("/") + "/chat/completions"
        headers = {"Authorization": f"Bearer {self._cfg.api_key}"} if self._cfg.api_key else {}
        problem = "no answer"
        async with httpx.AsyncClient(timeout=self._cfg.timeout, transport=self._transport) as http:
            for _ in range(self._cfg.transport_retries + 1):
                try:
                    resp = await http.post(url, json=self._body(req), headers=headers)
                except httpx.HTTPError as exc:
                    problem = type(exc).__name__
                    continue
                if resp.status_code == 429 or resp.status_code >= 500:
                    problem = f"http {resp.status_code}"
                    continue
                if resp.status_code >= 400:
                    raise ModelUnavailable(f"http {resp.status_code}")
                return _content(resp.json())
        log.warning("model unavailable layer=%s problem=%s", req.layer, problem)
        raise ModelUnavailable(problem)


@dataclass(frozen=True)
class Models:
    small: ModelClient
    composer: ModelClient

    @property
    def configured(self) -> bool:
        return not isinstance(self.small, NullModel)


FAKE_SWITCH = "LEDGER_TEST_FAKE_MODEL"


def _test_fake_models(base: str) -> Models:
    from ledger.llm.fake import FakeBehaviour, FakeModel

    if base:
        raise RuntimeError(f"{FAKE_SWITCH}=1 and LEDGER_LLM_BASE_URL are both set; pick one")
    marker = os.environ.get("LEDGER_TEST_FAKE_SPLIT_MARKER", "").strip() or None
    log.warning("%s=1: the deterministic FAKE model builds conversations (tests only)", FAKE_SWITCH)
    behaviour = FakeBehaviour(split_marker=marker)
    return Models(FakeModel(behaviour), FakeModel(behaviour, name="fake-composer"))


def load_models() -> Models:
    base = os.environ.get("LEDGER_LLM_BASE_URL", "").strip()
    model = os.environ.get("LEDGER_LLM_MODEL", "").strip()
    switch = os.environ.get(FAKE_SWITCH, "").strip()
    if switch:
        if switch != "1":
            raise RuntimeError(f"{FAKE_SWITCH} must be 1 or unset")
        return _test_fake_models(base)
    if not base or not model:
        return Models(small=NullModel(), composer=NullModel())
    key = os.environ.get("LEDGER_LLM_API_KEY", "")
    composer = os.environ.get("LEDGER_LLM_COMPOSER_MODEL", "").strip() or model
    common = {
        "base_url": base,
        "api_key": key,
        "timeout": float(os.environ.get("LEDGER_LLM_TIMEOUT", "30")),
        "seed": int(os.environ.get("LEDGER_LLM_SEED", "0")),
        "thinking": os.environ.get("LEDGER_LLM_THINKING", "").strip() == "1",
    }
    small_cfg = HttpModelConfig(model=model, **common)
    composer_cfg = HttpModelConfig(model=composer, **common)
    return Models(small=OpenAICompatModel(small_cfg), composer=OpenAICompatModel(composer_cfg))
