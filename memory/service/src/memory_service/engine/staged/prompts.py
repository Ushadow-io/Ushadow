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


def _dump(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False, separators=(",", ":"), default=str)


# ---- stage 1: extract entities and facts ----------------------------------------------------------

EXTRACT_SCHEMA = _obj({
    "entities": _arr(_obj({"name": _STR, "type": _STR, "aliases": _arr(_STR)})),
    "facts": _arr(_obj({"subject": _STR, "relation": _STR, "object": _STR, "fact": _STR,
                        "valid_from": _NSTR, "valid_until": _NSTR, "lines": _arr(_STR),
                        "quote": _NSTR})),
})

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
  it started or stopped being true, else null. lines: the REFs the fact comes from. quote: the
  exact words from one of those lines, copied without change.
Only what is clearly said. No small talk, no guesses, no facts from media or background talk.

Lines:
{lines}"""


def extract_request(lines: list[dict[str, str]], reference_time: str) -> LLMRequest:
    text = "\n".join(ln["rendered"] for ln in lines)
    return LLMRequest(stage="extract", prompt=_EXTRACT.format(reference_time=reference_time, lines=text),
                      schema_name="extraction", schema=EXTRACT_SCHEMA, payload=lines)


# ---- stage 3: same entity or new? -----------------------------------------------------------------

MATCH_SCHEMA = _obj({"decisions": _arr(_obj({
    "id": _STR, "answer": {"type": "string", "enum": ["same", "new", "inconclusive"]},
    "candidate": _NSTR, "certainty": _CERTAINTY}))})

_MATCH = """Decide whether each new entity is one of its candidate entities already known.
For each item you get the new entity with the facts just learned about it, and candidates with
facts already known about them. Answer per item: "same" (give the candidate id), "new" (none of
them), or "inconclusive" (cannot tell from this). Same name alone is not enough when the facts
disagree; a different name can still be the same entity (nickname, full name).
certainty: how sure you are (high, medium, low).

Items:
{items}"""


def match_request(items: list[dict[str, Any]]) -> LLMRequest:
    return LLMRequest(stage="match", prompt=_MATCH.format(items=_dump(items)),
                      schema_name="entity_match", schema=MATCH_SCHEMA, payload=items)


# ---- stage 4: new fact, duplicate or contradiction? -----------------------------------------------

RECONCILE_SCHEMA = _obj({"decisions": _arr(_obj({
    "id": _STR, "answer": {"type": "string", "enum": ["new", "duplicate", "contradicts"]},
    "known_ids": _arr(_STR), "certainty": _CERTAINTY}))})

_RECONCILE = """Compare each new fact with the facts already known about the same subject.
Answer per new fact:
- "duplicate": it says the same as a known fact (give that known id);
- "contradicts": it cannot be true at the same time as known facts, so they have ended
  (give their ids; e.g. a new employer ends the old job, a new home ends the old one);
- "new": anything else (a further fact, a different detail, a different time).
certainty: how sure you are (high, medium, low).

New facts:
{items}"""


def reconcile_request(items: list[dict[str, Any]]) -> LLMRequest:
    return LLMRequest(stage="reconcile", prompt=_RECONCILE.format(items=_dump(items)),
                      schema_name="fact_reconcile", schema=RECONCILE_SCHEMA, payload=items)


# ---- maintenance 1: review an uncertain entity ----------------------------------------------------

REVIEW_SCHEMA = _obj({"answer": {"type": "string", "enum": ["same", "distinct", "inconclusive"]},
                      "candidate": _NSTR, "certainty": _CERTAINTY})

_REVIEW = """An entity was stored as new, but it may be one of some known entities. Decide.
You get the entity, the facts about it, the lines where it was mentioned, and the candidates
with their facts. Answer "same" (give the candidate id), "distinct" (it is none of them) or
"inconclusive".

Entity and candidates:
{item}

Lines where it was mentioned:
{lines}"""


def review_request(item: dict[str, Any], lines: list[str]) -> LLMRequest:
    return LLMRequest(stage="review", prompt=_REVIEW.format(item=_dump(item), lines="\n".join(lines)),
                      schema_name="entity_review", schema=REVIEW_SCHEMA,
                      payload={"item": item, "lines": lines})


# ---- maintenance 2: duplicate facts ---------------------------------------------------------------

DUP_SCHEMA = _obj({"decisions": _arr(_obj({"id": _STR, "same": {"type": "boolean"}}))})

_DUP = """Each pair holds two facts about the same entity. Say for each pair whether they say the
same thing (same=true) or not (same=false). Different times or details mean not the same.

Pairs:
{pairs}"""


def dup_request(pairs: list[dict[str, Any]]) -> LLMRequest:
    return LLMRequest(stage="dup_facts", prompt=_DUP.format(pairs=_dump(pairs)),
                      schema_name="duplicate_facts", schema=DUP_SCHEMA, payload=pairs)
