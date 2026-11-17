"""HTTP adapter for the memory port. Thin: auth, user check, call the port, map errors."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from memory_service.models import (
    CorrectRequest,
    Decision,
    EraseReport,
    EraseRequest,
    FactDecision,
    FactKind,
    ForgetRequest,
    IngestRequest,
    MemoryEntity,
    MemoryFact,
    RebuildReport,
    RebuildRequest,
    SearchFilters,
    SyncRequest,
    UserRequest,
    WorkUnit,
)
from memory_service.routers.auth import Principal, authorize_user, require_service
from memory_service.services.ingest import NotClosed
from memory_service.services.port import MemoryPort

router = APIRouter(dependencies=[Depends(require_service)])


def port(request: Request) -> MemoryPort:
    return request.app.state.port


def _dump(model: Any) -> Any:
    return model.model_dump(mode="json", by_alias=True)


@router.post("/ingest")
async def ingest(req: IngestRequest, p: Principal = Depends(require_service),
                 mp: MemoryPort = Depends(port)) -> dict[str, Any]:
    user = authorize_user(p, req.user_id)
    try:
        unit = await mp.ingest(user, req.conversation, req.reference_time)
    except NotClosed as exc:
        raise HTTPException(409, str(exc)) from exc
    return _dump(unit)


@router.post("/sync")
async def sync(req: SyncRequest, p: Principal = Depends(require_service),
               mp: MemoryPort = Depends(port)) -> dict[str, Any]:
    return _dump(await mp.sync(authorize_user(p, req.user_id), req.start, req.end))


@router.post("/queue/run")
async def run_queue(req: UserRequest, p: Principal = Depends(require_service),
                    mp: MemoryPort = Depends(port)) -> list[dict[str, Any]]:
    return [_dump(u) for u in await mp.run_pending(authorize_user(p, req.user_id))]


@router.get("/queue", response_model=list[WorkUnit], response_model_by_alias=True)
async def queue(user_id: str = Query(alias="userId"), p: Principal = Depends(require_service),
                mp: MemoryPort = Depends(port)) -> list[WorkUnit]:
    return await mp.queue(authorize_user(p, user_id))


@router.get("/rejections")
async def rejections(user_id: str = Query(alias="userId"), p: Principal = Depends(require_service),
                     mp: MemoryPort = Depends(port)) -> dict[str, int]:
    return await mp.rejections(authorize_user(p, user_id))


def search_filters(kinds: list[FactKind] | None = Query(default=None),
                   include_closed: bool = Query(default=False, alias="includeClosed"),
                   limit: int = Query(default=20, ge=1, le=200)) -> SearchFilters:
    return SearchFilters(kinds=kinds or list(FactKind), include_closed=include_closed, limit=limit)


@router.get("/search")
async def search(user_id: str = Query(alias="userId"), q: str = Query(min_length=1),
                 filters: SearchFilters = Depends(search_filters),
                 p: Principal = Depends(require_service),
                 mp: MemoryPort = Depends(port)) -> dict[str, list[dict[str, Any]]]:
    facts: list[MemoryFact] = await mp.search(authorize_user(p, user_id), q, filters)
    return {"facts": [_dump(f) for f in facts]}


@router.get("/entities/{entity_id}")
async def entity(entity_id: str, user_id: str = Query(alias="userId"),
                 p: Principal = Depends(require_service),
                 mp: MemoryPort = Depends(port)) -> dict[str, Any]:
    e: MemoryEntity | None = await mp.entity(authorize_user(p, user_id), entity_id)
    if e is None:
        raise HTTPException(404, "no such entity")
    return _dump(e)


@router.get("/facts/{fact_id}")
async def fact(fact_id: str, user_id: str = Query(alias="userId"),
               p: Principal = Depends(require_service),
               mp: MemoryPort = Depends(port)) -> dict[str, Any]:
    f: MemoryFact | None = await mp.fact(authorize_user(p, user_id), fact_id)
    if f is None:
        raise HTTPException(404, "no such fact")
    return _dump(f)


@router.get("/facts/{fact_id}/decisions")
async def fact_decisions(fact_id: str, user_id: str = Query(alias="userId"),
                         p: Principal = Depends(require_service),
                         mp: MemoryPort = Depends(port)) -> dict[str, list[dict[str, Any]]]:
    decs: list[FactDecision] | None = await mp.fact_decisions(authorize_user(p, user_id), fact_id)
    if decs is None:
        raise HTTPException(404, "no such fact")
    return {"decisions": [_dump(d) for d in decs]}


@router.post("/correct")
async def correct(req: CorrectRequest, p: Principal = Depends(require_service),
                  mp: MemoryPort = Depends(port)) -> dict[str, list[dict[str, Any]]]:
    authorize_user(p, req.user_id)
    decs: list[Decision] | None = await mp.correct(req)
    if decs is None:
        raise HTTPException(404, "no such fact")
    return {"decisions": [_dump(d) for d in decs]}


@router.post("/forget")
async def forget(req: ForgetRequest, p: Principal = Depends(require_service),
                 mp: MemoryPort = Depends(port)) -> dict[str, list[dict[str, Any]]]:
    decs = await mp.forget(authorize_user(p, req.user_id), req.fact_ids, req.entity_id)
    return {"decisions": [_dump(d) for d in decs]}


@router.post("/erase")
async def erase(req: EraseRequest, p: Principal = Depends(require_service),
                mp: MemoryPort = Depends(port)) -> dict[str, Any]:
    rep: EraseReport = await mp.erase(authorize_user(p, req.user_id), req.recording_id, req.range)
    return _dump(rep)


@router.post("/rebuild")
async def rebuild(req: RebuildRequest, p: Principal = Depends(require_service),
                  mp: MemoryPort = Depends(port)) -> dict[str, Any]:
    rep: RebuildReport = await mp.rebuild(authorize_user(p, req.user_id), req.start, req.end)
    return _dump(rep)


@router.get("/action-facts")
async def action_facts(user_id: str = Query(alias="userId"), p: Principal = Depends(require_service),
                       mp: MemoryPort = Depends(port)) -> dict[str, list[dict[str, Any]]]:
    facts = await mp.action_facts(authorize_user(p, user_id))
    return {"facts": [f.model_dump(mode="json") for f in facts]}
