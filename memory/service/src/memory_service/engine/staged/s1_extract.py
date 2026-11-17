"""Stage 1 - Extract (Model). One call per chunk returns the entities AND the facts about them,
each fact with the line refs (and quote) it comes from. Long episodes are cut into chunks at line
boundaries by a character budget, so the model reads every line exactly once. Results merge by
normalised name within the episode. No earlier conversation is ever sent."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from memory_service.engine.staged import prompts
from memory_service.engine.staged.llm import LLMError
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
        await _extract_chunk(ctx, ext, chunk, inp.reference_time)
    used = {k for f in ext.facts for k in (f.subject, f.object)}
    ext.entities = {k: e for k, e in ext.entities.items() if k in used}  # no fact, nothing to store
    return ext


async def _extract_chunk(ctx: Ctx, ext: Extraction, chunk: list[SourceLine], at: datetime,
                         retry: bool = True) -> None:
    """One model call for one chunk. An answer that is not usable JSON (often cut off because it
    got too long) is tried again one time as two halves, so one bad chunk does not lose the episode."""
    payload = [{"ref": ln.ref, "rendered": ln.render(), "text": ln.text} for ln in chunk]
    try:
        answer = await ctx.llm.ask(prompts.extract_request(payload, at.isoformat()))
    except LLMError:
        if not retry or len(chunk) < 2:
            raise
        ctx.tally["extract_chunks_split_after_failure"] += 1
        mid = len(chunk) // 2
        await _extract_chunk(ctx, ext, chunk[:mid], at, retry=False)
        await _extract_chunk(ctx, ext, chunk[mid:], at, retry=False)
        return
    _merge(ctx, ext, answer, chunk)
    ext.chunks += 1


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


_RANGE = re.compile(r"^\D*(\d+)\s*(?:-|–|to)\s*\D*(\d+)\D*$")
_FIRST = re.compile(r"\d+")
_MAX_RANGE = 20


def _numbers(raw: Any) -> list[int]:
    """Line numbers a model meant by one item of `lines`: "L7", "7", 7, "[L7]", "L3-L5"."""
    text = str(raw).strip()
    span = _RANGE.match(text)
    if span:
        a, b = int(span.group(1)), int(span.group(2))
        return list(range(a, b + 1)) if 0 <= b - a < _MAX_RANGE else [a]
    first = _FIRST.search(text)
    return [int(first.group())] if first else []


def _line_refs(ctx: Ctx, item: dict[str, Any], chunk: list[SourceLine]) -> list[str]:
    """The refs of this chunk the fact points at. If none is usable, the line holding the quote."""
    known = {ln.ref for ln in chunk}
    out: list[str] = []
    raw = item.get("lines")
    for r in raw if isinstance(raw, list) else [raw] if raw is not None else []:
        for n in _numbers(r):
            if f"L{n}" in known and f"L{n}" not in out:
                out.append(f"L{n}")
    if out:
        return out
    quote = norm(_text(item.get("quote")))
    hit = next((ln.ref for ln in chunk if quote and quote in norm(ln.text)), None)
    if hit:
        ctx.tally["facts_line_from_quote"] += 1
        return [hit]
    shape = re.sub(r"[A-Za-z]", "a", re.sub(r"\d", "9", str(raw)))[:24]  # shape only, no text
    ctx.tally[f"ref_shape:{shape}"] += 1
    return []


def _add_fact(ctx: Ctx, ext: Extraction, item: dict[str, Any], chunk: list[SourceLine]) -> None:
    subject, relation, obj = (_text(item.get(k)) for k in ("subject", "relation", "object"))
    lines = _line_refs(ctx, item, chunk)
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


def _merge(ctx: Ctx, ext: Extraction, answer: dict[str, Any], chunk: list[SourceLine]) -> None:
    for item in answer.get("entities") or []:
        if isinstance(item, dict):
            _add_entity(ext, item)
    for item in answer.get("facts") or []:
        if isinstance(item, dict):
            _add_fact(ctx, ext, item, chunk)
