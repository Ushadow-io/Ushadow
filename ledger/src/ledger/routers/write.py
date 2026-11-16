"""Write routes: ingest, erase, human decisions. All need an authenticated principal."""

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
from ledger.routers.auth import Principal, require_principal, resolve_owner
from ledger.routers.deps import get_services
from ledger.services import Services

router = APIRouter(tags=["write"], dependencies=[Depends(require_principal)])

_DECISION_STATUS = {
    DecisionError.unknown_retracts: 404,
    DecisionError.key_mismatch: 409,
    DecisionError.missing_target: 422,
}


@router.post("/ingest", response_model=IngestResult)
async def ingest(
    req: IngestRequest,
    principal: Principal = Depends(require_principal),
    services: Services = Depends(get_services),
) -> IngestResult:
    """Store a (partial) CaptureBundle. Repeat-safe. Conflicts are listed in `refusals`."""
    req.userId = resolve_owner(principal, req.userId)
    return await services.ingest.ingest(req)


@router.post("/erase", response_model=Erasure)
async def erase(
    req: EraseRequest,
    principal: Principal = Depends(require_principal),
    services: Services = Depends(get_services),
) -> Erasure:
    """Erase evidence, then rebuild the conversations that held it (words, state, title)."""
    req.userId = resolve_owner(principal, req.userId)
    result = await services.conversations.erase(req)
    if result is None:
        raise HTTPException(404, "recording not found for this user")
    return result


@router.post("/decisions", response_model=DecisionResponse)
async def decide(
    req: DecisionRequest,
    principal: Principal = Depends(require_principal),
    services: Services = Depends(get_services),
) -> DecisionResponse:
    """A human Link wins for its key; the affected conversations are rebuilt."""
    req.userId = resolve_owner(principal, req.userId)
    result = await services.conversations.decide(req)
    if isinstance(result, DecisionError):
        raise HTTPException(_DECISION_STATUS[result], result.value)
    return result
