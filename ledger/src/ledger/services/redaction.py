"""Pure erase rules, used both by erase (on stored data) and by ingest (on incoming data).

Using the same functions on both paths is what stops a re-ingest or a replay from bringing
erased words back: incoming evidence is cut the same way before it is compared and stored.
"""

from __future__ import annotations

from collections.abc import Sequence

from ledger.schema import Recording, TimeRange
from ledger.stores.growth import AUDIO_POINTER_KEYS
from ledger.timeutil import overlaps

__all__ = ["AUDIO_POINTER_KEYS", "is_erased", "strip_audio_pointer"]


def is_erased(rng: TimeRange, erased: Sequence[TimeRange]) -> bool:
    return any(overlaps(rng, e) for e in erased)


def strip_audio_pointer(rec: Recording) -> tuple[Recording, bool]:
    """Remove the audio pointer: `Recording.audio` (the AudioRef), and as a fallback the
    metadata keys older senders used. The ledger cannot cut the audio file, so a partial erase
    drops the pointer for the whole recording. The rest of the record stays."""
    meta = rec.metadata or {}
    kept = {k: v for k, v in meta.items() if k not in AUDIO_POINTER_KEYS}
    removed = rec.audio is not None or len(kept) != len(meta)
    return rec.model_copy(update={"audio": None, "metadata": kept or None}), removed
