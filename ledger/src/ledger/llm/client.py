"""Model client: one small interface, an OpenAI-compatible HTTP implementation, a null one.

Config (env): LEDGER_LLM_BASE_URL (e.g. http://host:8000/v1), LEDGER_LLM_API_KEY,
LEDGER_LLM_MODEL (gap model and state update), LEDGER_LLM_COMPOSER_MODEL (optional; default
LEDGER_LLM_MODEL), LEDGER_LLM_TIMEOUT (seconds, default 30). With no base URL or model the
client is NullModel: every call is `unavailable`, and nothing is saved for it.

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


def _content(data: dict[str, Any]) -> str:
    try:
        return str(data["choices"][0]["message"]["content"] or "")
    except (KeyError, IndexError, TypeError):
        return ""  # an empty answer fails validation and is retried


class OpenAICompatModel:
    """POST {base_url}/chat/completions with JSON output, temperature 0."""

    def __init__(self, config: HttpModelConfig, transport: httpx.AsyncBaseTransport | None = None):
        self.name = config.model
        self._cfg = config
        self._transport = transport

    def _body(self, req: ModelRequest) -> dict[str, Any]:
        return {
            "model": self._cfg.model,
            "messages": [
                {"role": "system", "content": req.system},
                {"role": "user", "content": req.user},
            ],
            "temperature": 0,
            "max_tokens": req.max_tokens,
            "response_format": {"type": "json_object"},
        }

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


def load_models() -> Models:
    base = os.environ.get("LEDGER_LLM_BASE_URL", "").strip()
    model = os.environ.get("LEDGER_LLM_MODEL", "").strip()
    if not base or not model:
        return Models(small=NullModel(), composer=NullModel())
    key = os.environ.get("LEDGER_LLM_API_KEY", "")
    timeout = float(os.environ.get("LEDGER_LLM_TIMEOUT", "30"))
    composer = os.environ.get("LEDGER_LLM_COMPOSER_MODEL", "").strip() or model
    small_cfg = HttpModelConfig(base_url=base, model=model, api_key=key, timeout=timeout)
    composer_cfg = HttpModelConfig(base_url=base, model=composer, api_key=key, timeout=timeout)
    return Models(small=OpenAICompatModel(small_cfg), composer=OpenAICompatModel(composer_cfg))
