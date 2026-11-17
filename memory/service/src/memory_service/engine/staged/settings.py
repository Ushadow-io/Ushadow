"""Settings of the staged engine, read from the environment. See README.md for the table."""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass

RECONCILE_MODES = ("collection", "per_fact")


def _flag(value: str | None, default: bool) -> bool:
    if value is None or not value.strip():
        return default
    return value.strip().lower() not in ("0", "false", "no", "off")


@dataclass(frozen=True)
class StagedSettings:
    store: str = "neo4j"  # neo4j | memory (memory: tests and demos)
    fact_reconcile: str = "collection"  # collection: one call per episode | per_fact: one per fact
    chunk_chars: int = 6000  # extraction chunk budget, split at line boundaries
    same_above: float = 0.93  # entity similarity at or above this: same entity, no model
    new_below: float = 0.80  # entity similarity below this: new entity, no model
    entity_top_k: int = 5  # similar existing entities fetched per new entity
    candidate_facts: int = 5  # known facts shown per candidate entity
    fact_top_k: int = 5  # known facts of the subject compared with each new fact
    dup_above: float = 0.90  # maintenance: open facts of one entity this similar are a pair to check
    dup_batch: int = 10  # maintenance: pairs per model call
    model_confidence: float = 0.75  # a decided model answer that gives no certainty of its own
    review_below: float = 0.6  # an entity match below this is reviewed by maintenance
    min_confidence: float = 0.0  # facts()/search() leave out facts below this (0 = keep all)
    maintain: bool = True  # background maintenance on/off (worker, idle ticks only)
    maintain_inline: bool = False  # run one maintenance batch right after each episode (dev/test)
    maintain_budget: int = 5  # model calls per maintenance batch
    owner_name: str = ""  # the user's name in every fact ("" = "Owner")
    owner_aliases: tuple[str, ...] = ()  # other names that mean the user (full name, nickname)

    def __post_init__(self) -> None:
        if self.fact_reconcile not in RECONCILE_MODES:
            raise ValueError(f"MEMORY_FACT_RECONCILE={self.fact_reconcile!r}: use collection or per_fact")
        if not 0 <= self.new_below <= self.same_above <= 1:
            raise ValueError("need 0 <= MEMORY_STAGED_NEW_BELOW <= MEMORY_STAGED_SAME_ABOVE <= 1")

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> StagedSettings:
        e = env if env is not None else os.environ
        d = cls()
        return cls(
            store=e.get("MEMORY_STAGED_STORE") or d.store,
            fact_reconcile=(e.get("MEMORY_FACT_RECONCILE") or d.fact_reconcile).strip().lower(),
            chunk_chars=int(e.get("MEMORY_STAGED_CHUNK_CHARS") or d.chunk_chars),
            same_above=float(e.get("MEMORY_STAGED_SAME_ABOVE") or d.same_above),
            new_below=float(e.get("MEMORY_STAGED_NEW_BELOW") or d.new_below),
            entity_top_k=int(e.get("MEMORY_STAGED_ENTITY_TOP_K") or d.entity_top_k),
            candidate_facts=int(e.get("MEMORY_STAGED_CANDIDATE_FACTS") or d.candidate_facts),
            fact_top_k=int(e.get("MEMORY_STAGED_FACT_TOP_K") or d.fact_top_k),
            dup_above=float(e.get("MEMORY_STAGED_DUP_ABOVE") or d.dup_above),
            dup_batch=int(e.get("MEMORY_STAGED_DUP_BATCH") or d.dup_batch),
            model_confidence=float(e.get("MEMORY_STAGED_MODEL_CONFIDENCE") or d.model_confidence),
            review_below=float(e.get("MEMORY_REVIEW_BELOW") or d.review_below),
            min_confidence=float(e.get("MEMORY_MIN_CONFIDENCE") or d.min_confidence),
            maintain=_flag(e.get("MEMORY_MAINTAIN"), d.maintain),
            maintain_inline=_flag(e.get("MEMORY_MAINTAIN_INLINE"), d.maintain_inline),
            maintain_budget=int(e.get("MEMORY_MAINTAIN_BUDGET") or d.maintain_budget),
            owner_name=(e.get("MEMORY_OWNER_NAME") or d.owner_name).strip(),
            owner_aliases=tuple(a.strip() for a in (e.get("MEMORY_OWNER_ALIASES") or "").split(",")
                                if a.strip()),
        )
