"""Pure helpers: text normalisation, stable hashes, time ranges. No state."""

from __future__ import annotations

import hashlib
import re
from datetime import UTC, datetime

_NON_WORD = re.compile(r"[^0-9a-z]+")


def norm(text: str | None) -> str:
    """Lower case, punctuation to spaces, one space between words. Used for every quote check."""
    return _NON_WORD.sub(" ", (text or "").lower()).strip()


def words(text: str | None) -> set[str]:
    return {w for w in norm(text).split(" ") if w}


def digest(*parts: str) -> str:
    """Stable sha256 over the parts. Used for ids and for suppression keys, so no side table
    has to keep the words of a fact to recognise it again."""
    h = hashlib.sha256()
    for p in parts:
        h.update(p.encode("utf-8"))
        h.update(b"\x00")
    return h.hexdigest()


def group_id(user_id: str) -> str:
    """Engine partition for one user. Graphiti needs ^[a-zA-Z0-9_-]+$, user ids can be emails."""
    return "u_" + digest("group", user_id)[:32]


def iso(dt: datetime) -> str:
    return dt.astimezone(UTC).isoformat()


def parse_iso(text: str) -> datetime:
    dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def overlaps(a_start: datetime, a_end: datetime, b_start: datetime, b_end: datetime) -> bool:
    """Closed-open overlap; a zero-length range overlaps when it sits inside the other."""
    if a_start == a_end:
        return b_start <= a_start <= b_end
    if b_start == b_end:
        return a_start <= b_start <= a_end
    return a_start < b_end and b_start < a_end


def midpoint(start: datetime, end: datetime) -> datetime:
    return start + (end - start) / 2
