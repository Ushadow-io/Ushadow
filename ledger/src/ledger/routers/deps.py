"""Shared router dependencies."""

from __future__ import annotations

from datetime import datetime

from fastapi import HTTPException, Query, Request

from ledger.schema import TimeRange
from ledger.services import Services


def get_services(request: Request) -> Services:
    return request.app.state.services


def time_range(
    start: datetime | None = Query(default=None, description="UTC, ISO 8601"),
    end: datetime | None = Query(default=None, description="UTC, ISO 8601"),
) -> TimeRange | None:
    if start is None and end is None:
        return None
    if start is None or end is None or start.tzinfo is None or end.tzinfo is None:
        raise HTTPException(422, "give both start and end, with a timezone (e.g. Z)")
    return TimeRange(start=start, end=end)
