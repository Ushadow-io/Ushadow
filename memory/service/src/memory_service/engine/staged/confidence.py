"""Every confidence number of the staged engine, in one place (documented in README.md).

A score in 0..1 comes mostly from HOW a decision was made, not from a number the model makes up:
- rules: exact name/alias = 1.0; a similarity rule scales with the similarity;
- model answers: a fixed value per answer (`model_confidence` setting for same/new/duplicate/
  contradicts, MODEL_INCONCLUSIVE for inconclusive); when the model also gives its coarse
  certainty (high/medium/low), the fixed CERTAINTY value is used instead;
- the deeper review (with the conversation lines) gives REVIEW_* values.
A fact's effective confidence is computed at read time:
min(its own reconcile confidence, the current match decisions of its subject and object).
"""

from __future__ import annotations

from collections.abc import Iterable
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from memory_service.engine.staged.store import GraphStore
    from memory_service.engine.staged.types import StoredFact

POLICY_VERSION = "staged-1"  # bump when these numbers or the rules change

EXACT = 1.0  # exact normalised name or alias
NO_CANDIDATE = 1.0  # nothing in the store looks like it: certainly new
SIMILAR_SAME_FLOOR = 0.8  # similarity >= same_above: 0.8 at the threshold .. 1.0 at identical
SIMILAR_NEW_FLOOR = 0.7  # similarity < new_below: 0.7 just under the threshold .. 1.0 at nothing alike
FACT_RULE = 1.0  # identical signature (duplicate) or nothing to compare with (new)
MODEL_INCONCLUSIVE = 0.3  # the model could not tell (or gave an answer we could not use)
CERTAINTY = {"high": 0.85, "medium": 0.7, "low": 0.45}  # the model's own coarse certainty
REVIEW_DECIDED = 0.9  # the deeper review (with the lines) said same or distinct
REVIEW_INCONCLUSIVE = 0.4  # the deeper review could not tell either (not asked again)
BANDS = ((0.4, "<0.4"), (0.6, "0.4-0.6"), (0.8, "0.6-0.8"), (1.01, ">=0.8"))


def similar_same(score: float, same_above: float) -> float:
    if same_above >= 1:
        return EXACT
    return round(SIMILAR_SAME_FLOOR + (1 - SIMILAR_SAME_FLOOR) * (score - same_above) / (1 - same_above), 4)


def similar_new(best: float | None, new_below: float) -> float:
    if best is None or new_below <= 0:
        return NO_CANDIDATE
    return round(SIMILAR_NEW_FLOOR + (1 - SIMILAR_NEW_FLOOR) * (1 - best / new_below), 4)


def model_answer(answer: dict[str, Any], fixed: float) -> float:
    """A decided model answer: its coarse certainty if it gave one, else the fixed setting."""
    return CERTAINTY.get(str(answer.get("certainty") or "").lower(), fixed)


def band(score: float) -> str:
    return next(name for upper, name in BANDS if score < upper)


def bands(scores: Iterable[float]) -> dict[str, int]:
    out = {name: 0 for _, name in BANDS}
    for s in scores:
        out[band(s)] += 1
    return out


async def effective(store: GraphStore, group: str, facts: list[StoredFact]) -> dict[str, float]:
    """fact id -> min(own confidence, current match decisions of its two ends). Two batch reads."""
    ends = await store.get_entities(group, sorted({i for f in facts for i in (f.source_id, f.target_id)}))
    roots = {r for f in facts for r in (f.source_match, f.target_match) if r}
    roots |= {e.match_root for e in ends.values() if e.match_root}
    current = await store.current_decisions(group, sorted(roots))

    def score(root: str | None) -> float:
        d = current.get(root) if root else None
        return d.confidence if d else 1.0

    out = {}
    for f in facts:
        parts = [f.confidence, score(f.source_match), score(f.target_match)]
        parts += [score(e.match_root) for i in (f.source_id, f.target_id) if (e := ends.get(i))]
        out[f.id] = min(parts)
    return out
