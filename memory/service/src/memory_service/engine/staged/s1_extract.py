"""Stage 1 - Extract (Model). One call per chunk returns the entities AND the facts about them,
each fact with the line refs (and quote) it comes from. Long episodes are cut into chunks at line
boundaries by a character budget, so the model reads every line exactly once. Results merge by
normalised name within the episode. No earlier conversation is ever sent."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from memory_service.engine.staged import prompts
from memory_service.engine.staged.types import Ctx, Extraction, NewEntity, NewFact, SourceLine
from memory_service.models import EpisodeInput
from memory_service.schema import EvidenceRef, TimeRange
from memory_service.textutil import norm, parse_iso


@dataclass(frozen=True)
class ExtractInput:
    lines: list[SourceLine]
    reference_time: datetime


def lines_from_episode(episode: EpisodeInput) -> list[SourceLine]:
    """Speech episodes today. Another source only has to produce SourceLines."""
    return [SourceLine(ref=f"L{i}", kind="speech", speaker=ln.speaker, role=ln.role, text=ln.text,
                       at=ln.start,
                       locator=EvidenceRef(recordingId=ln.recording_id,
                                           range=TimeRange(start=ln.start, end=ln.end),
                                           transcriptRevision=ln.transcript_revision))
            for i, ln in enumerate(episode.lines, start=1)]


def chunk_lines(lines: list[SourceLine], budget: int) -> list[list[SourceLine]]:
    """Cut at line boundaries; a line longer than the budget is a chunk of its own."""
    chunks: list[list[SourceLine]] = []
    size = 0
    for ln in lines:
        n = len(ln.render()) + 1
        if not chunks or (budget > 0 and size + n > budget and chunks[-1]):
            chunks.append([])
            size = 0
        chunks[-1].append(ln)
        size += n
    return chunks


async def extract(ctx: Ctx, inp: ExtractInput) -> Extraction:
    ext = Extraction(lines=list(inp.lines))
    for chunk in chunk_lines(inp.lines, ctx.cfg.chunk_chars):
        payload = [{"ref": ln.ref, "rendered": ln.render(), "text": ln.text} for ln in chunk]
        answer = await ctx.llm.ask(prompts.extract_request(payload, inp.reference_time.isoformat()))
        _merge(ctx, ext, answer, {ln.ref for ln in chunk})
        ext.chunks += 1
    used = {k for f in ext.facts for k in (f.subject, f.object)}
    ext.entities = {k: e for k, e in ext.entities.items() if k in used}  # no fact, nothing to store
    return ext


# ---- merging one chunk's answer -------------------------------------------------------------------


def _text(v: Any) -> str:
    return v.strip() if isinstance(v, str) else ""


def _when(v: Any) -> datetime | None:
    try:
        dt = parse_iso(v) if isinstance(v, str) and v.strip() else None
    except ValueError:
        return None
    return dt.astimezone(UTC) if dt else None


def _entity_key(ext: Extraction, name: str, type_: str = "Entity") -> str:
    """The episode key for a name: an entity already named so (or aliased so), else a new one."""
    key = norm(name)
    for e in ext.entities.values():
        if key == e.key or key in {norm(a) for a in e.aliases}:
            return e.key
    ext.entities[key] = NewEntity(key=key, name=name, type=type_ or "Entity")
    return key


def _add_entity(ext: Extraction, item: dict[str, Any]) -> None:
    name = _text(item.get("name"))
    if not norm(name):
        return
    key = _entity_key(ext, name, _text(item.get("type")))
    e = ext.entities[key]
    have = {norm(n) for n in e.names()}
    for alias in item.get("aliases") or []:
        if isinstance(alias, str) and norm(alias) and norm(alias) not in have:
            e.aliases.append(alias.strip())
            have.add(norm(alias))


def _add_fact(ctx: Ctx, ext: Extraction, item: dict[str, Any], refs: set[str]) -> None:
    subject, relation, obj = (_text(item.get(k)) for k in ("subject", "relation", "object"))
    lines = [r for r in item.get("lines") or [] if isinstance(r, str) and r in refs]
    if not (norm(subject) and norm(relation) and norm(obj)):
        ctx.tally["facts_dropped_incomplete"] += 1
        return
    if not lines:  # nothing to prove it with
        ctx.tally["facts_dropped_no_line"] += 1
        return
    new = NewFact(subject=_entity_key(ext, subject), relation=norm(relation), object=_entity_key(ext, obj),
                  text=_text(item.get("fact")) or f"{subject} {relation} {obj}", line_refs=lines,
                  valid_at=_when(item.get("valid_from")), invalid_at=_when(item.get("valid_until")),
                  quote=_text(item.get("quote")) or None)
    same = next((f for f in ext.facts if f.key == new.key), None)
    if same is None:
        ext.facts.append(new)
    else:  # said twice in this episode: one fact, more lines
        same.line_refs += [r for r in new.line_refs if r not in same.line_refs]


def _merge(ctx: Ctx, ext: Extraction, answer: dict[str, Any], refs: set[str]) -> None:
    for item in answer.get("entities") or []:
        if isinstance(item, dict):
            _add_entity(ext, item)
    for item in answer.get("facts") or []:
        if isinstance(item, dict):
            _add_fact(ctx, ext, item, refs)
