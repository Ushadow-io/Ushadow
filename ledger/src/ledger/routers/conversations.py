"""L2 routes: conversations, why, pipeline run, model stats. All need a principal."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from ledger.l2_models import ConversationView, RunRequest, RunResult, WhyView
from ledger.llm.structured import ModelStats
from ledger.routers.auth import Principal, owner_query, require_principal, resolve_owner
from ledger.routers.deps import get_services, time_range
from ledger.schema import TimeRange
from ledger.services import Services

router = APIRouter(tags=["conversations"], dependencies=[Depends(require_principal)])

Owner = Depends(owner_query)


@router.get("/conversations", response_model=list[ConversationView])
async def conversations(
    userId: str = Owner,  # noqa: N803
    rng: TimeRange | None = Depends(time_range),
    services: Services = Depends(get_services),
) -> list[ConversationView]:
    """Active conversations that overlap the range, with fragments and composed text."""
    return await services.conversations.list(userId, rng)


@router.get("/conversations/{conversation_id}/why", response_model=WhyView)
async def why(
    conversation_id: str,
    userId: str = Owner,  # noqa: N803
    services: Services = Depends(get_services),
) -> WhyView:
    """The Links that opened, joined, split and closed the conversation, and who decided."""
    result = await services.conversations.why(userId, conversation_id)
    if result is None:
        raise HTTPException(404, "conversation not found for this user")
    return result


@router.post("/pipeline/run", response_model=RunResult)
async def run(
    req: RunRequest,
    principal: Principal = Depends(require_principal),
    services: Services = Depends(get_services),
) -> RunResult:
    """Build the conversations of a range now. Repeat-safe: a re-run asks no model."""
    return await services.conversations.run(resolve_owner(principal, req.userId), req.range)


@router.get("/stats", response_model=ModelStats)
async def stats(services: Services = Depends(get_services)) -> ModelStats:
    """Model calls and input sizes per layer since the service started."""
    return services.model_stats.finish()
