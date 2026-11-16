"""Services: the ledger rules. They return data and never raise HTTP errors."""

from __future__ import annotations

from dataclasses import dataclass

from ledger.services.decision_service import DecisionService
from ledger.services.duplicate_service import DuplicateService
from ledger.services.erase_service import EraseService
from ledger.services.ingest_service import IngestService
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


def build_services(stores: Stores, clock: Clock = now_utc) -> Services:
    moments = MomentService(stores, clock=clock)
    duplicates = DuplicateService(stores, clock=clock)
    return Services(
        stores=stores,
        ingest=IngestService(stores, moments, duplicates),
        moments=moments,
        erase=EraseService(stores, moments, clock=clock),
        decisions=DecisionService(stores, clock=clock),
        query=QueryService(stores),
    )
