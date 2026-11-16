"""Services: the ledger rules. They return data and never raise HTTP errors."""

from __future__ import annotations

from dataclasses import dataclass

from ledger.llm import Models, ModelStats, StructuredCaller, load_models
from ledger.services.conversation_service import ConversationService
from ledger.services.decision_service import DecisionService
from ledger.services.duplicate_service import DuplicateService
from ledger.services.erase_service import EraseService
from ledger.services.ingest_service import IngestService
from ledger.services.l2.composer import Composer
from ledger.services.l2.joins import JoinDecider
from ledger.services.l2.pipeline import Pipeline
from ledger.services.l2.states import StateUpdater
from ledger.services.l2.walker import Walker
from ledger.services.moment_service import Clock, MomentService
from ledger.services.query_service import QueryService
from ledger.stores import Stores
from ledger.timeutil import now_utc


@dataclass(frozen=True)
class Services:
    stores: Stores
    ingest: IngestService
    moments: MomentService
    erase: EraseService
    decisions: DecisionService
    query: QueryService
    conversations: ConversationService
    models: Models
    model_stats: ModelStats


def _pipeline(stores: Stores, models: Models, totals: ModelStats, clock: Clock) -> Pipeline:
    small = StructuredCaller(models.small, totals)
    composer = StructuredCaller(models.composer, totals)
    walker = Walker(JoinDecider(small), StateUpdater(small))
    return Pipeline(stores, (walker, Composer(composer)), clock)


def build_services(
    stores: Stores, clock: Clock = now_utc, models: Models | None = None
) -> Services:
    """models: None reads LEDGER_LLM_* from the env (no model configured: NullModel)."""
    models = models or load_models()
    totals = ModelStats()
    moments = MomentService(stores, clock=clock)
    duplicates = DuplicateService(stores, clock=clock)
    decisions = DecisionService(stores, clock=clock)
    erase = EraseService(stores, moments, clock=clock)
    pipeline = _pipeline(stores, models, totals, clock)
    return Services(
        stores=stores,
        ingest=IngestService(stores, moments, duplicates),
        moments=moments,
        erase=erase,
        decisions=decisions,
        query=QueryService(stores),
        conversations=ConversationService(stores, pipeline, (decisions, erase)),
        models=models,
        model_stats=totals,
    )
