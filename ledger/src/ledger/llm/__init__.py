"""Model access for L2: client interface, HTTP client, structured calls, fake model."""

from ledger.llm.client import (
    HttpModelConfig,
    ModelClient,
    ModelRequest,
    Models,
    ModelUnavailable,
    NullModel,
    OpenAICompatModel,
    load_models,
)
from ledger.llm.fake import FakeBehaviour, FakeModel
from ledger.llm.structured import Answer, Call, LayerStats, ModelStats, StructuredCaller

__all__ = [
    "Answer",
    "Call",
    "FakeBehaviour",
    "FakeModel",
    "HttpModelConfig",
    "LayerStats",
    "ModelClient",
    "ModelRequest",
    "ModelStats",
    "ModelUnavailable",
    "Models",
    "NullModel",
    "OpenAICompatModel",
    "StructuredCaller",
    "load_models",
]
