"""The staged knowledge engine. `add_episode` is the table of contents: read it, then read the
stage files in order (s1 .. s5, then m1, m2 for maintenance)."""

from __future__ import annotations

from collections import Counter
from collections.abc import Callable
from datetime import datetime

from memory_service.engine.base import EngineEntity, EngineFact, EpisodeResult, MaintainReport
from memory_service.engine.staged import confidence as conf
from memory_service.engine.staged import erase
from memory_service.engine.staged.llm import LLM
from memory_service.engine.staged.m1_review_uncertain import review_uncertain
from memory_service.engine.staged.m2_merge_duplicate_facts import merge_duplicate_facts
from memory_service.engine.staged.s1_extract import ExtractInput, extract, lines_from_episode
from memory_service.engine.staged.s2_candidates import find_candidates
from memory_service.engine.staged.s3_match_entities import match_entities
from memory_service.engine.staged.s4_reconcile_facts import reconcile_facts
from memory_service.engine.staged.s5_write import WriteInput, new_id, write_episode
from memory_service.engine.staged.settings import StagedSettings
from memory_service.engine.staged.store import GraphStore
from memory_service.engine.staged.types import Ctx, Decision, StoredEntity, StoredFact, utcnow
from memory_service.models import EpisodeInput, Statement
from memory_service.textutil import digest


class StagedEngine:
    def __init__(self, store: GraphStore, llm: LLM, settings: StagedSettings | None = None,
                 clock: Callable[[], datetime] = utcnow) -> None:
        self.store, self.llm, self.cfg, self.clock = store, llm, settings or StagedSettings(), clock
        self.tally: Counter[str] = Counter()  # rule/model decision counts, all groups

    def _ctx(self, group: str) -> Ctx:
        if not group:
            raise ValueError("a group is required")
        return Ctx(group=group, store=self.store, llm=self.llm, cfg=self.cfg, tally=self.tally,
                   clock=self.clock)

    # ---- per episode: the five stages ------------------------------------------------------------

    async def add_episode(self, group: str, episode: EpisodeInput) -> EpisodeResult:
        ctx = self._ctx(group)
        lines = lines_from_episode(episode)
        ext = await extract(ctx, ExtractInput(lines, episode.reference_time))  # 1 model
        candidates = await find_candidates(ctx, ext)  # 2 database
        match = await match_entities(ctx, ext, candidates)  # 3 code, model if unclear
        decisions = await reconcile_facts(ctx, ext, match)  # 4 code, model if needed
        result = await write_episode(ctx, WriteInput(  # 5 database
            episode.name, episode.reference_time, ext, match, decisions))
        if self.cfg.maintain_inline:  # development and tests only
            await self.maintain(group, self.cfg.maintain_budget)
        return result

    # ---- background: maintenance -----------------------------------------------------------------

    async def maintain(self, group: str, budget: int) -> MaintainReport:
        """One bounded batch: at most `budget` model calls. The worker calls it when idle."""
        ctx = self._ctx(group)
        review = await review_uncertain(ctx, budget)  # m1
        dup = await merge_duplicate_facts(ctx, max(budget - review.calls, 0))  # m2
        return MaintainReport(llm_calls=review.calls + dup.calls, entities_reviewed=review.reviewed,
                              entities_merged=review.merged, entities_confirmed=review.distinct,
                              fact_pairs_checked=dup.checked, facts_merged=dup.merged,
                              more=review.more or dup.more)

    # ---- the rest of the port --------------------------------------------------------------------

    async def _out(self, group: str, facts: list[StoredFact], floor: float = 0.0) -> list[EngineFact]:
        """Port facts with their effective confidence. Machine facts below `floor` are left out."""
        scores = await conf.effective(self.store, group, facts)
        return [f.to_engine(confidence=scores[f.id]) for f in facts if f.human or scores[f.id] >= floor]

    async def remove_episode(self, group: str, engine_episode_id: str) -> None:
        """Nothing said only in this episode stays (see erase.py); facts it closed stay closed."""
        await erase.remove_episode(self._ctx(group), engine_episode_id)

    async def facts(self, group: str) -> list[EngineFact]:
        """`min_confidence` filters here and in `search` only; lookups by id never hide a fact."""
        return await self._out(self._ctx(group).group, await self.store.all_facts(group),
                               self.cfg.min_confidence)

    async def get_fact(self, group: str, engine_id: str) -> EngineFact | None:
        f = await self.store.get_fact(self._ctx(group).group, engine_id)
        return (await self._out(group, [f]))[0] if f else None

    async def search(self, group: str, query: str, limit: int) -> list[EngineFact]:
        hits = await self.store.search_facts(self._ctx(group).group, query, limit * 2)
        return (await self._out(group, hits, self.cfg.min_confidence))[:limit]

    async def entity(self, group: str, engine_id: str) -> EngineEntity | None:
        e = await self.store.get_entity(self._ctx(group).group, engine_id)
        return EngineEntity(engine_id=e.id, name=e.name, summary=e.summary or None) if e else None

    async def entity_facts(self, group: str, engine_id: str) -> list[EngineFact]:
        return await self._out(group, await self.store.entity_facts(self._ctx(group).group, engine_id))

    async def _entity_for(self, group: str, name: str) -> StoredEntity:
        found = await self.store.find_entities(group, [name])
        if found:
            return found[0]
        e = StoredEntity(id=new_id(), name=name, created_at=self.clock())
        await self.store.create_entity(group, e)
        return e

    async def assert_fact(self, group: str, statement: Statement, at: datetime) -> EngineFact:
        ctx = self._ctx(group)
        s = await self._entity_for(group, statement.subject)
        o = await self._entity_for(group, statement.object)
        f = StoredFact(id=new_id(), source_id=s.id, target_id=o.id, source_name=s.name, target_name=o.name,
                       relation=statement.relation,
                       text=statement.text or f"{statement.subject} {statement.relation} {statement.object}",
                       valid_at=at, human=True, created_at=self.clock())
        await ctx.store.create_fact(group, f)
        await ctx.store.add_decision(group, Decision(
            id=new_id(), kind="fact_reconcile", key=digest("human", f.id), subject_id=f.id, outcome="new",
            confidence=1.0, decided_by="human", policy_version=conf.POLICY_VERSION, at=self.clock()))
        return f.to_engine(confidence=1.0)

    async def delete_fact(self, group: str, engine_id: str) -> None:
        await self.store.delete_fact(self._ctx(group).group, engine_id)
        await self.store.drop_orphan_entities(group)

    async def reopen_fact(self, group: str, engine_id: str) -> None:
        f = await self.store.get_fact(self._ctx(group).group, engine_id)
        if f is not None and f.invalid_at is not None:
            f.invalid_at = None
            await self.store.update_fact(group, f)

    async def clear(self, group: str) -> None:
        await self.store.clear(self._ctx(group).group)

    def dump(self) -> str:
        """Everything the store holds, as text, when the store can tell (tests)."""
        dump = getattr(self.store, "dump", None)
        return dump() if callable(dump) else ""
