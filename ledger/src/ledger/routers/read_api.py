"""L6 read API over HTTP (/v1). Thin: authenticate, call the gateway, map a Refusal to a status.
Scopes are checked in the gateway (services/read/gateway.py), not here."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query

from ledger.read_models import (
    BriefAnswer,
    BriefRequest,
    ContextAnswer,
    ContextRequest,
    CorrectRequest,
    ForgetRequest,
    KnownEntitiesAnswer,
    KnownEntity,
    KnownEntityRemove,
    KnownEntityRequest,
    Refusal,
    RefusalCode,
    ResolveAnswer,
    ResolveRequest,
    SearchAnswer,
    SearchRequest,
    TimelineAnswer,
    TimelineRequest,
    WhyAnswer,
    WhyRequest,
    WriteAnswer,
)
from ledger.routers.auth import Principal, require_principal
from ledger.routers.deps import get_services
from ledger.services import Services

router = APIRouter(prefix="/v1", tags=["read-api"], dependencies=[Depends(require_principal)])

STATUS = {
    RefusalCode.forbidden: 403,
    RefusalCode.not_found: 404,
    RefusalCode.invalid: 422,
    RefusalCode.conflict: 409,
    RefusalCode.unavailable: 503,
}
Caller = Annotated[Principal, Depends(require_principal)]
Svc = Annotated[Services, Depends(get_services)]


def _out(result: Any) -> Any:
    if isinstance(result, Refusal):
        raise HTTPException(STATUS[result.code], result.detail)
    return result


@router.get("/context", response_model=ContextAnswer)
async def context(req: Annotated[ContextRequest, Query()], p: Caller, s: Svc) -> Any:
    """What is going on now: open/latest conversations, the people in them and their facts."""
    return _out(await s.read.read(p, req))


@router.get("/resolve", response_model=ResolveAnswer)
async def resolve(req: Annotated[ResolveRequest, Query()], p: Caller, s: Svc) -> Any:
    """A name to entities. Several matches: all shown, `ambiguous`, nothing `resolved`."""
    return _out(await s.read.read(p, req))


@router.get("/search", response_model=SearchAnswer)
async def search(req: Annotated[SearchRequest, Query()], p: Caller, s: Svc) -> Any:
    """Facts (memory) and conversations (ledger) that match, each with its proof."""
    return _out(await s.read.read(p, req))


@router.get("/brief", response_model=BriefAnswer)
async def brief(req: Annotated[BriefRequest, Query()], p: Caller, s: Svc) -> Any:
    """An entity or a conversation: last talk, open tasks, commitments both ways, decisions."""
    return _out(await s.read.read(p, req))


@router.get("/timeline", response_model=TimelineAnswer)
async def timeline(req: Annotated[TimelineRequest, Query()], p: Caller, s: Svc) -> Any:
    """Conversations in order, and the capture gaps of the range."""
    return _out(await s.read.read(p, req))


@router.get("/why", response_model=WhyAnswer)
async def why(req: Annotated[WhyRequest, Query()], p: Caller, s: Svc) -> Any:
    """Evidence of a fact or conversation, the decisions (Links) and who decided."""
    return _out(await s.read.read(p, req))


@router.post("/correct", response_model=WriteAnswer)
async def correct(req: CorrectRequest, p: Caller, s: Svc) -> Any:
    """A human correction, sent to the owner: memory (a fact) or the ledger (a conversation)."""
    return _out(await s.read.write(p, req))


@router.post("/forget", response_model=WriteAnswer)
async def forget(req: ForgetRequest, p: Caller, s: Svc) -> Any:
    """Forget facts or an entity in memory; memory blocks them from being made again."""
    return _out(await s.read.write(p, req))


@router.get("/known-entities", response_model=KnownEntitiesAnswer)
async def known_entities(p: Caller, s: Svc, userId: str = Query(min_length=1)) -> Any:  # noqa: N803
    """The owner's word list: names (people, projects, products) with their other names."""
    return _out(await s.read.known_entities(p, userId))


@router.post("/known-entities", response_model=KnownEntity)
async def name_entity(req: KnownEntityRequest, p: Caller, s: Svc) -> Any:
    """A human decision: this name and its other names are ONE entity. Replaces an entry of
    the same name. Memory keeps it across rebuilds."""
    return _out(await s.read.name_entity(p, req))


@router.post("/known-entities/remove")
async def unname_entity(req: KnownEntityRemove, p: Caller, s: Svc) -> Any:
    """Take an entry off the word list (entities already merged stay merged)."""
    return _out(await s.read.unname_entity(p, req))
