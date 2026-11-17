"""Every prompt and JSON schema of the staged engine, in one place.

Only the extraction prompt (stage 1) and the review of an uncertain entity (maintenance 1) ever
contain episode lines. Matching (3), reconciling (4) and duplicate facts (maintenance 2) see
names and fact sentences only.
"""

from __future__ import annotations

import json
from typing import Any

from memory_service.engine.staged.llm import LLMRequest

_NSTR = {"type": ["string", "null"]}
_STR = {"type": "string"}
_CERTAINTY = {"type": "string", "enum": ["high", "medium", "low"]}


def _obj(props: dict[str, Any]) -> dict[str, Any]:
    return {"type": "object", "properties": props, "required": list(props),
            "additionalProperties": False}


def _arr(items: dict[str, Any]) -> dict[str, Any]:
    return {"type": "array", "items": items}


def _one_of(values: list[str]) -> dict[str, Any]:
    """Only these strings. The server turns the schema into a grammar, so the model cannot write
    an id or a line reference that does not exist."""
    return {"type": "string", "enum": values or [""]}


def _one_of_or_null(values: list[str]) -> dict[str, Any]:
    return {"anyOf": [_one_of(values), {"type": "null"}]} if values else {"type": "null"}


ENTITY_TYPES = ["Person", "Place", "Organization", "Thing", "Topic", "Event", "Other"]


def _dump(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False, separators=(",", ":"), default=str)


# ---- stage 1: extract entities and facts ----------------------------------------------------------

def extract_schema(refs: list[str]) -> dict[str, Any]:
    """`lines` can only hold REFs of this chunk, and at least one: a fact always has its proof."""
    lines = {"type": "array", "items": _one_of(refs), "minItems": 1}
    return _obj({
        "entities": _arr(_obj({"name": _STR, "type": _one_of(ENTITY_TYPES), "aliases": _arr(_STR)})),
        "facts": _arr(_obj({"subject": _STR, "relation": _STR, "object": _STR, "fact": _STR,
                            "valid_from": _NSTR, "valid_until": _NSTR, "lines": lines,
                            "quote": _NSTR})),
    })


EXTRACT_SCHEMA = extract_schema([])  # the shape, without a chunk's REFs

_EXTRACT_EXAMPLE = _dump({
    "entities": [{"name": "Owner", "type": "Person", "aliases": []},
                 {"name": "Acme Ltd", "type": "Organization", "aliases": ["Acme"]}],
    "facts": [{"subject": "Owner", "relation": "works at", "object": "Acme Ltd",
               "fact": "The owner works at Acme Ltd.", "valid_from": None, "valid_until": None,
               "lines": ["L2"], "quote": "I work at Acme"}]})

_EXTRACT = """You read part of a record of someone's day and write down lasting facts.
Each line is "REF [source time] SPEAKER (role): text". The role "owner" is the user ("I", "me").
Reference time (for "yesterday", "next week" ...): {reference_time}

Return JSON with:
- entities: the people, places, organisations, things and topics the facts are about.
  name (the fullest name used), type (Person, Place, Organization, Thing, Topic, Event, ...),
  aliases (other names used for it here).
- facts: lasting facts about those entities. subject and object are entity names from your
  list; the owner is "Owner". relation: a short lower-case verb phrase ("works at", "lives in",
  "likes"). fact: one plain sentence. valid_from / valid_until: ISO dates if the text says when
  it started or stopped being true, else null. lines: the REFs the fact comes from, exactly as
  written at the start of the line ("L7"), one REF per item, at least one. quote: the exact
  words from one of those lines, copied without change.
Only what is clearly said. No small talk, no guesses, no facts from media or background talk.
If there is no lasting fact, return empty lists.

Example of the answer shape (the content is made up):
{example}

Lines:
{lines}"""


def extract_request(lines: list[dict[str, str]], reference_time: str) -> LLMRequest:
    text = "\n".join(ln["rendered"] for ln in lines)
    prompt = _EXTRACT.format(reference_time=reference_time, lines=text, example=_EXTRACT_EXAMPLE)
    return LLMRequest(stage="extract", prompt=prompt, schema_name="extraction",
                      schema=extract_schema([ln["ref"] for ln in lines]), payload=lines)


# ---- stage 3: same entity or new? -----------------------------------------------------------------

def match_schema(item_ids: list[str], candidate_ids: list[str]) -> dict[str, Any]:
    return _obj({"decisions": _arr(_obj({
        "id": _one_of(item_ids), "answer": {"type": "string", "enum": ["same", "new", "inconclusive"]},
        "candidate": _one_of_or_null(candidate_ids), "certainty": _CERTAINTY}))})


MATCH_SCHEMA = match_schema([], [])

_MATCH_EXAMPLE = _dump({"decisions": [
    {"id": "n1", "answer": "same", "candidate": "c2", "certainty": "high"},
    {"id": "n2", "answer": "new", "candidate": None, "certainty": "medium"}]})

_MATCH = """Decide whether each new entity is one of its candidate entities already known.
For each item you get the new entity with the facts just learned about it, and candidates with
facts already known about them. Answer per item: "same" (give the candidate id), "new" (none of
them), or "inconclusive" (cannot tell from this). Same name alone is not enough when the facts
disagree; a different name can still be the same entity (nickname, full name).
certainty: how sure you are (high, medium, low).
Give exactly one decision for each item id. candidate is null unless the answer is "same".

Example of the answer shape: {example}

Items:
{items}"""


def match_request(items: list[dict[str, Any]]) -> LLMRequest:
    cands = sorted({c["id"] for it in items for c in it.get("candidates") or []})
    return LLMRequest(stage="match", prompt=_MATCH.format(items=_dump(items), example=_MATCH_EXAMPLE),
                      schema_name="entity_match", payload=items,
                      schema=match_schema([it["id"] for it in items], cands))


# ---- stage 4: new fact, duplicate or contradiction? -----------------------------------------------

def reconcile_schema(item_ids: list[str], known_ids: list[str]) -> dict[str, Any]:
    return _obj({"decisions": _arr(_obj({
        "id": _one_of(item_ids), "answer": {"type": "string", "enum": ["new", "duplicate", "contradicts"]},
        "known_ids": _arr(_one_of(known_ids)), "certainty": _CERTAINTY}))})


RECONCILE_SCHEMA = reconcile_schema([], [])

_RECONCILE_EXAMPLE = _dump({"decisions": [
    {"id": "f0", "answer": "duplicate", "known_ids": ["k1"], "certainty": "high"},
    {"id": "f1", "answer": "new", "known_ids": [], "certainty": "medium"}]})

_RECONCILE = """Compare each new fact with the facts already known about the same subject.
Answer per new fact:
- "duplicate": it says the same as a known fact (give that known id);
- "contradicts": it cannot be true at the same time as known facts, so they have ended
  (give their ids; e.g. a new employer ends the old job, a new home ends the old one);
- "new": anything else (a further fact, a different detail, a different time).
certainty: how sure you are (high, medium, low).
Give exactly one decision for each new fact id. known_ids is empty when the answer is "new".

Example of the answer shape: {example}

New facts:
{items}"""


def reconcile_request(items: list[dict[str, Any]]) -> LLMRequest:
    known = sorted({k["id"] for it in items for k in it.get("known") or []})
    prompt = _RECONCILE.format(items=_dump(items), example=_RECONCILE_EXAMPLE)
    return LLMRequest(stage="reconcile", prompt=prompt,
                      schema_name="fact_reconcile", payload=items,
                      schema=reconcile_schema([it["id"] for it in items], known))


# ---- maintenance 1: review an uncertain entity ----------------------------------------------------

def review_schema(candidate_ids: list[str]) -> dict[str, Any]:
    return _obj({"answer": {"type": "string", "enum": ["same", "distinct", "inconclusive"]},
                 "candidate": _one_of_or_null(candidate_ids), "certainty": _CERTAINTY})


REVIEW_SCHEMA = review_schema([])

_REVIEW = """An entity was stored as new, but it may be one of some known entities. Decide.
You get the entity, the facts about it, the lines where it was mentioned, and the candidates
with their facts. Answer "same" (give the candidate id), "distinct" (it is none of them) or
"inconclusive". candidate is null unless the answer is "same".

Example of the answer shape: {{"answer":"same","candidate":"c1","certainty":"high"}}

Entity and candidates:
{item}

Lines where it was mentioned:
{lines}"""


def review_request(item: dict[str, Any], lines: list[str]) -> LLMRequest:
    return LLMRequest(stage="review", prompt=_REVIEW.format(item=_dump(item), lines="\n".join(lines)),
                      schema_name="entity_review",
                      schema=review_schema([c["id"] for c in item.get("candidates") or []]),
                      payload={"item": item, "lines": lines})


# ---- maintenance 2: duplicate facts ---------------------------------------------------------------

def dup_schema(pair_ids: list[str]) -> dict[str, Any]:
    return _obj({"decisions": _arr(_obj({"id": _one_of(pair_ids), "same": {"type": "boolean"}}))})


DUP_SCHEMA = dup_schema([])

_DUP = """Each pair holds two facts about the same entity. Say for each pair whether they say the
same thing (same=true) or not (same=false). Different times or details mean not the same.
Give exactly one decision for each pair id.

Example of the answer shape: {{"decisions":[{{"id":"p1","same":true}},{{"id":"p2","same":false}}]}}

Pairs:
{pairs}"""


def dup_request(pairs: list[dict[str, Any]]) -> LLMRequest:
    return LLMRequest(stage="dup_facts", prompt=_DUP.format(pairs=_dump(pairs)),
                      schema_name="duplicate_facts", schema=dup_schema([p["id"] for p in pairs]),
                      payload=pairs)
