"""Read routes. Every read is scoped by userId, asserted by an authenticated principal."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from ledger.models import Erasure, Moment
from ledger.routers.auth import owner_query, require_principal
from ledger.routers.deps import get_services, time_range
from ledger.schema import CaptureGap, Link, Recording, TimeRange, Transcript, TranscriptCorrection
from ledger.services import Services

router = APIRouter(tags=["read"], dependencies=[Depends(require_principal)])

UserId = Depends(owner_query)


@router.get("/recordings", response_model=list[Recording])
async def recordings(
    userId: str = UserId,  # noqa: N803
    rng: TimeRange | None = Depends(time_range),
    services: Services = Depends(get_services),
) -> list[Recording]:
    return await services.query.recordings(userId, rng)


@router.get("/recordings/{recording_id}/transcripts", response_model=list[Transcript])
async def transcripts(
    recording_id: str,
    userId: str = UserId,  # noqa: N803
    services: Services = Depends(get_services),
) -> list[Transcript]:
    return await services.query.transcripts(userId, recording_id)


@router.get("/recordings/{recording_id}/corrections", response_model=list[TranscriptCorrection])
async def corrections(
    recording_id: str,
    userId: str = UserId,  # noqa: N803
    services: Services = Depends(get_services),
) -> list[TranscriptCorrection]:
    return await services.query.corrections(userId, recording_id)


@router.get("/moments", response_model=list[Moment])
async def moments(
    userId: str = UserId,  # noqa: N803
    rng: TimeRange | None = Depends(time_range),
    services: Services = Depends(get_services),
) -> list[Moment]:
    return await services.query.moments(userId, rng)


@router.get("/gaps", response_model=list[CaptureGap])
async def gaps(
    userId: str = UserId,  # noqa: N803
    rng: TimeRange | None = Depends(time_range),
    services: Services = Depends(get_services),
) -> list[CaptureGap]:
    return await services.query.gaps(userId, rng)


@router.get("/erasures", response_model=list[Erasure])
async def erasures(
    userId: str = UserId,  # noqa: N803
    rng: TimeRange | None = Depends(time_range),
    services: Services = Depends(get_services),
) -> list[Erasure]:
    return await services.query.erasures(userId, rng)


@router.get("/links", response_model=list[Link])
async def links(
    userId: str = UserId,  # noqa: N803
    rng: TimeRange | None = Depends(time_range),
    effective: bool = Query(default=False, description="One winning Link per key"),
    services: Services = Depends(get_services),
) -> list[Link]:
    return await services.query.links(userId, rng, effective_only=effective)
