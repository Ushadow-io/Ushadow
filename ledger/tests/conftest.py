"""Tests run with no external services: Mongo is mongomock-motor (in memory)."""

from __future__ import annotations

from datetime import UTC, datetime

import httpx
import pytest
from mongomock_motor import AsyncMongoMockClient

from ledger.llm import FakeBehaviour, FakeModel, Models, NullModel
from ledger.main import create_app
from ledger.models import IngestRequest
from ledger.services import Services, build_services
from ledger.stores import build_stores
from tests.fixtures.bundle import USER, golden_day

NOW = datetime(2026, 11, 16, 12, 0, tzinfo=UTC)


def fixed_clock() -> datetime:
    return NOW


def new_db():
    return AsyncMongoMockClient()["ledger_test"]


def make_services(db=None, models: Models | None = None) -> Services:
    """No model unless given (tests never use the network)."""
    models = models or Models(small=NullModel(), composer=NullModel())
    store = build_stores(db if db is not None else new_db())
    return build_services(store, clock=fixed_clock, models=models)


def fake_models(behaviour: FakeBehaviour | None = None) -> Models:
    return Models(
        small=FakeModel(behaviour, name="fake-small"),
        composer=FakeModel(behaviour, name="fake-composer"),
    )


@pytest.fixture
def services() -> Services:
    return make_services()


@pytest.fixture
def request_day() -> IngestRequest:
    return IngestRequest(userId=USER, bundle=golden_day())


TOKEN = "test-token-0123456789"


@pytest.fixture
async def client(services: Services, monkeypatch):
    monkeypatch.setenv("LEDGER_TOKEN", TOKEN)
    monkeypatch.delenv("LEDGER_TOKENS", raising=False)
    app = create_app(db=object(), sweep=False)
    app.state.services = services  # lifespan is not run by ASGITransport
    transport = httpx.ASGITransport(app=app)
    headers = {"Authorization": f"Bearer {TOKEN}"}
    async with httpx.AsyncClient(
        transport=transport, base_url="http://ledger", headers=headers
    ) as http:
        yield http
