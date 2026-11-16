"""Pure helpers for time ranges, stable keys and fingerprints."""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from typing import Any

from ledger.schema import TimeRange

_TS_FORMAT = "%Y-%m-%dT%H:%M:%S.%fZ"


def utc(value: datetime) -> datetime:
    """Return value as an aware UTC datetime."""
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def ts(value: datetime) -> str:
    """Fixed-width UTC string. Sorts and compares the same as the time, in Mongo and in tests."""
    return utc(value).strftime(_TS_FORMAT)


def now_utc() -> datetime:
    return datetime.now(UTC)


def overlaps(a: TimeRange, b: TimeRange) -> bool:
    """True when the two ranges share time (touching ends do not count)."""
    return utc(a.start) < utc(b.end) and utc(b.start) < utc(a.end)


def overlap_seconds(a: TimeRange, b: TimeRange) -> float:
    start = max(utc(a.start), utc(b.start))
    end = min(utc(a.end), utc(b.end))
    return max(0.0, (end - start).total_seconds())


def duration(r: TimeRange) -> float:
    return (utc(r.end) - utc(r.start)).total_seconds()


def stable_hash(*parts: Any, length: int = 24) -> str:
    """Deterministic short hash of the parts (same input, same key, on every run)."""
    raw = "|".join(ts(p) if isinstance(p, datetime) else str(p) for p in parts)
    return hashlib.sha256(raw.encode()).hexdigest()[:length]


def fingerprint(body: dict[str, Any]) -> str:
    """Content hash of a JSON-mode body, independent of key order."""
    raw = json.dumps(body, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(raw.encode()).hexdigest()
