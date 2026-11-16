"""Write routes: ingest, erase, human decisions."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from ledger.models import (
    DecisionError,
    DecisionRequest,
    DecisionResponse,
    EraseRequest,
    Erasure,
    IngestRequest,
    IngestResult,
)
from ledger.routers.deps import get_services
from ledger.services import Services

router = APIRouter(tags=["write"])

_DECISION_STATUS = {
    DecisionError.unknown_retracts: 404,
    DecisionError.key_mismatch: 409,
    DecisionError.missing_target: 422,
}


@router.post("/ingest", response_model=IngestResult)
async def ingest(req: IngestRequest, services: Services = Depends(get_services)) -> IngestResult:
    """Store a (partial) CaptureBundle. Repeat-safe. Conflicts are listed in `refusals`."""
    return await services.ingest.ingest(req)


@router.post("/erase", response_model=Erasure)
async def erase(req: EraseRequest, services: Services = Depends(get_services)) -> Erasure:
    result = await services.erase.erase(req)
    if result is None:
        raise HTTPException(404, "recording not found for this user")
    return result


@router.post("/decisions", response_model=DecisionResponse)
async def decide(
    req: DecisionRequest, services: Services = Depends(get_services)
) -> DecisionResponse:
    result = await services.decisions.decide(req)
    if isinstance(result, DecisionError):
        raise HTTPException(_DECISION_STATUS[result], result.value)
    return result
