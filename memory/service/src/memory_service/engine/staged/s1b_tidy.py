"""Stage 1b - Tidy (Code). No model call. Cleans what stage 1 extracted, before anything is
compared with the store:

- one owner: every way of saying the user ("Owner", "the owner", "I", the owner's speaker label,
  the configured aliases) is ONE entity, named by the `owner_name` setting;
- no fact from an entity to itself;
- one sentence, one fact: the same sentence given for several subject/object pairs is kept once;
- no fact that only repeats a part of a longer fact about the same subject;
- a source score per fact: said by the owner or a known speaker = full; only by an unknown
  speaker (a person in the room, or a TV) = low (see confidence.py).
"""

from __future__ import annotations

import re

from memory_service.engine.staged import confidence as conf
from memory_service.engine.staged.types import Ctx, Extraction, NewFact, SourceLine
from memory_service.textutil import norm

OWNER_WORDS = frozenset({"owner", "the owner", "user", "the user", "i", "me", "myself"})
_OWNER_IN_TEXT = re.compile(r"\b(?:the\s+)?owner\b", re.IGNORECASE)
_FILLER = frozenset({"a", "an", "and", "the", "or", "both", "also"})
# a longer fact holding one of these extra words does not just repeat the shorter one
_TURNS = frozenset({"not", "no", "never", "longer", "cannot", "without", "except", "stopped",
                    "t", "nt", "isn", "doesn", "don", "didn", "wasn", "won", "can"})
_MIN_WORDS = 3


def owner_name(ctx: Ctx) -> str:
    return ctx.cfg.owner_name.strip() or "Owner"


def owner_names(ctx: Ctx, lines: list[SourceLine]) -> frozenset[str]:
    """Normalised names that mean the user: the fixed words, the settings, and the speaker label
    of every line with role owner."""
    names = {owner_name(ctx), *ctx.cfg.owner_aliases, *(ln.speaker for ln in lines if ln.role == "owner")}
    return OWNER_WORDS | {norm(n) for n in names if norm(n)}


def owner_text(ext: Extraction, text: str) -> str:
    """"The owner works at Acme." -> "Stu works at Acme." (only when a name is set)."""
    if norm(ext.owner) == "owner":
        return text
    return _OWNER_IN_TEXT.sub(ext.owner, text)


def _content(f: NewFact) -> frozenset[str]:
    return frozenset(w for w in norm(f.text).split() if w not in _FILLER)


def _more_lines(keep: NewFact, gone: NewFact) -> None:
    keep.line_refs += [r for r in gone.line_refs if r not in keep.line_refs]


def _one_per_sentence(ctx: Ctx, facts: list[NewFact]) -> list[NewFact]:
    first: dict[str, NewFact] = {}
    for f in facts:
        seen = first.setdefault(norm(f.text), f)
        if seen is not f:
            _more_lines(seen, f)
            ctx.tally["facts_dropped_same_sentence"] += 1
    return list(first.values())


def _repeats_part_of(small: NewFact, big: NewFact) -> bool:
    a, b = _content(small), _content(big)
    return (small.subject == big.subject and len(a) >= _MIN_WORDS and a < b
            and not (b - a) & _TURNS)


def _no_parts(ctx: Ctx, facts: list[NewFact]) -> list[NewFact]:
    out = []
    for f in facts:
        whole = next((g for g in facts if g is not f and _repeats_part_of(f, g)), None)
        if whole is None:
            out.append(f)
        else:
            _more_lines(whole, f)
            ctx.tally["facts_dropped_part_of_longer"] += 1
    return out


def tidy(ctx: Ctx, ext: Extraction) -> None:
    facts = []
    for f in ext.facts:
        if f.subject == f.object:
            ctx.tally["facts_dropped_self"] += 1
        else:
            facts.append(f)
    facts = _no_parts(ctx, _one_per_sentence(ctx, facts))
    for f in facts:
        roles = [ln.role for r in f.line_refs if (ln := ext.line(r)) is not None]
        f.source = conf.source(roles)
        if f.source < 1:
            ctx.tally["facts_from_unknown_speakers_only"] += 1
    ext.facts = facts
    used = {k for f in facts for k in (f.subject, f.object)}
    ext.entities = {k: e for k, e in ext.entities.items() if k in used}  # no fact, nothing to store
