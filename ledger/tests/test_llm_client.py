"""OpenAI-compatible client against a mock transport (no network), and env config."""

from __future__ import annotations

import json
from pathlib import Path

import httpx
import pytest

from ledger.llm import (
    FakeModel,
    HttpModelConfig,
    ModelRequest,
    ModelUnavailable,
    NullModel,
    OpenAICompatModel,
    load_models,
)

REQ = ModelRequest(layer="gap", system="sys", user='{"a":1}', max_tokens=50)


def _client(handler) -> OpenAICompatModel:
    cfg = HttpModelConfig(base_url="http://llm.local/v1", model="small-1", api_key="k")
    return OpenAICompatModel(cfg, transport=httpx.MockTransport(handler))


async def test_posts_chat_completions_with_json_mode_and_returns_content():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["auth"] = request.headers.get("authorization")
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={"choices": [{"message": {"content": '{"ok":true}'}}]})

    assert await _client(handler).complete(REQ) == '{"ok":true}'
    assert seen["url"] == "http://llm.local/v1/chat/completions"
    assert seen["auth"] == "Bearer k"
    body = seen["body"]
    assert body["model"] == "small-1" and body["temperature"] == 0
    assert body["response_format"] == {"type": "json_object"}


async def test_retries_server_errors_then_reports_unavailable():
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(1)
        return httpx.Response(503)

    with pytest.raises(ModelUnavailable):
        await _client(handler).complete(REQ)
    assert len(calls) == 3  # 1 + transport_retries


async def test_client_error_is_unavailable_without_retry():
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(1)
        return httpx.Response(401)

    with pytest.raises(ModelUnavailable):
        await _client(handler).complete(REQ)
    assert len(calls) == 1


def test_env_config(monkeypatch):
    for name in ("LEDGER_LLM_BASE_URL", "LEDGER_LLM_MODEL", "LEDGER_LLM_COMPOSER_MODEL"):
        monkeypatch.delenv(name, raising=False)
    models = load_models()
    assert isinstance(models.small, NullModel) and not models.configured
    monkeypatch.setenv("LEDGER_LLM_BASE_URL", "http://llm.local/v1")
    monkeypatch.setenv("LEDGER_LLM_MODEL", "small-1")
    monkeypatch.setenv("LEDGER_LLM_COMPOSER_MODEL", "medium-1")
    models = load_models()
    assert models.configured
    assert (models.small.name, models.composer.name) == ("small-1", "medium-1")


def test_test_only_fake_model_switch(monkeypatch):
    for name in ("LEDGER_LLM_BASE_URL", "LEDGER_LLM_MODEL", "LEDGER_TEST_FAKE_SPLIT_MARKER"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("LEDGER_TEST_FAKE_MODEL", "1")
    monkeypatch.setenv("LEDGER_TEST_FAKE_SPLIT_MARKER", "Different thing")
    models = load_models()
    assert isinstance(models.small, FakeModel) and models.configured
    assert models.small.behaviour.split_marker == "Different thing"
    monkeypatch.setenv("LEDGER_TEST_FAKE_MODEL", "yes")  # only exactly 1
    with pytest.raises(RuntimeError):
        load_models()
    monkeypatch.setenv("LEDGER_TEST_FAKE_MODEL", "1")
    monkeypatch.setenv("LEDGER_LLM_BASE_URL", "http://llm.local/v1")  # never with a real model
    with pytest.raises(RuntimeError):
        load_models()


def test_compose_cannot_pass_the_fake_model_switch():
    compose = Path(__file__).resolve().parents[2] / "compose" / "ledger-compose.yaml"
    assert "environment:" in compose.read_text()
    assert "LEDGER_TEST_" not in compose.read_text()
