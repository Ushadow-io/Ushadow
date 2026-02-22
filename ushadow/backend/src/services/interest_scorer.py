"""Interest Scorer - Merges feed-based and graph-based interests into a unified ranked list.

Two complementary signals:

  Feed-based  (InterestExtractor / mem0 enriched memories)
    ─ Derived from memory categories + graph entities
    ─ Weighted by mention_count × recency × source_bonus
    ─ Rich hashtag derivation (critical for Mastodon tag search)
    ─ Reflects *frequency* — what you talk about most

  Graph-based  (/api/v1/graph/interests via mem0 Neo4j)
    ─ Derived from relationship-type traversal (INTERESTED_IN, WORKING_ON, …)
    ─ Per-relationship-type base scores with recency bonuses
    ─ Captures semantic *intent* — are you learning it, building with it, or just mentioning it?
    ─ Reflects *depth* of engagement, not just mention count

Merge strategy:
  Overlap (name in both sources) → additive: feed_score + graph_score × GRAPH_WEIGHT
  Graph-only (not in feed)       → graph_score × GRAPH_SOLO_WEIGHT, hashtags derived from name
  Feed-only  (not in graph)      → kept as-is

Score scaling rationale:
  Feed relationship_count ≈ 3–30 (int, mention × recency × source_bonus)
  Graph score             ≈ 1–15 (float, baked-in recency + relationship type weight)
  GRAPH_WEIGHT = 1.5    — confirmed interests get a meaningful boost
  GRAPH_SOLO_WEIGHT = 2.5 — unconfirmed graph interests scaled to feed range
"""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx

from src.config import get_localhost_proxy_url
from src.models.feed import Interest
from src.services.interest_extractor import (
    InterestExtractor,
    _deterministic_id,
)

logger = logging.getLogger(__name__)

# Tuning constants — adjust as real scoring data accumulates
GRAPH_WEIGHT = 1.5       # multiplied by graph_score when interest appears in BOTH sources
GRAPH_SOLO_WEIGHT = 2.5  # multiplied by graph_score for graph-only interests

# Combined cap — more than feed alone since we have two sources
MAX_INTERESTS = 40


class InterestScorer:
    """Merges feed-based and graph-based interests into a unified ranked list.

    Drop-in replacement for InterestExtractor in FeedService:
      - Falls back gracefully to feed-only if graph endpoint is unavailable
      - Always returns List[Interest] (the shape PostScorer expects)
      - Clears both internal caches on refresh
    """

    def __init__(self) -> None:
        self._extractor = InterestExtractor()

    async def score_interests(self, user_id: str) -> List[Interest]:
        """Fetch from both sources, merge, and return a ranked interest list.

        The merge gives every interest the best of both worlds:
        - Feed hashtags (Mastodon tag matching)
        - Graph semantic weighting (intent-aware scoring)
        """
        feed_interests = await self._extractor.extract_interests(user_id)
        graph_items = await self._fetch_graph_items(user_id)

        if not graph_items:
            logger.info("Graph interests unavailable — using feed-based interests only")
            return feed_interests

        merged = _merge(feed_interests, graph_items)

        logger.info(
            f"InterestScorer: {len(feed_interests)} feed + {len(graph_items)} graph "
            f"→ {len(merged)} unified interests (cap={MAX_INTERESTS})"
        )
        for i in merged[:10]:
            tag_str = " ".join(f"#{t}" for t in i.hashtags)
            logger.debug(
                f"  [{i.labels[0]}] {i.name!r} "
                f"(score={i.relationship_count}) → {tag_str or '(no tags)'}"
            )

        return merged

    def clear_cache(self, user_id: str) -> None:
        """Clear feed-based interest cache (graph endpoint has no backend cache)."""
        self._extractor.clear_cache(user_id)

    async def _fetch_graph_items(self, user_id: str) -> List[Dict[str, Any]]:
        """Fetch interests + research_topics from mem0 graph endpoint.

        Returns a flat list of graph item dicts, or [] if unavailable.
        """
        proxy_url = get_localhost_proxy_url("mem0")
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(
                    f"{proxy_url}/api/v1/graph/interests",
                    params={"user_id": user_id},
                )
                resp.raise_for_status()
                data = resp.json()

                if not data.get("graph_available", False):
                    logger.warning("Graph interests: graph_available=false, skipping graph signal")
                    return []

                # Both buckets are useful for post scoring
                items = data.get("interests", []) + data.get("research_topics", [])

                unknown = data.get("unknown_rel_types", [])
                if unknown:
                    logger.warning(f"Graph: {len(unknown)} unknown relationship types: {unknown[:5]}…")

                logger.info(
                    f"Graph interests: {len(data.get('interests', []))} interests, "
                    f"{len(data.get('research_topics', []))} research topics"
                )
                return items

        except httpx.HTTPError as e:
            logger.warning(f"Graph interests endpoint unavailable: {e}")
            return []


# =============================================================================
# Merge logic
# =============================================================================


def _merge(
    feed_interests: List[Interest],
    graph_items: List[Dict[str, Any]],
) -> List[Interest]:
    """Merge feed and graph interests into a unified ranked list.

    Feed interests retain their hashtags (the primary Mastodon search signal).
    Graph-only interests get hashtags derived from their name.
    Overlap is resolved additively — both sources agreeing on a topic boosts it.
    """
    # Work on copies so we don't mutate cached feed interests
    output: Dict[str, Interest] = {
        i.name.lower(): i.model_copy() for i in feed_interests
    }

    for item in graph_items:
        raw_name = (item.get("name") or "").strip()
        if not raw_name:
            continue

        graph_score = float(item.get("score") or 0)
        if graph_score <= 0:
            continue

        key = raw_name.lower()

        if key in output:
            # Additive boost — both sources confirm this interest
            boost = int(round(graph_score * GRAPH_WEIGHT))
            output[key].relationship_count += boost
        else:
            # Graph-only — derive hashtags from the name
            hashtags = InterestExtractor._name_to_hashtags(raw_name)
            if not hashtags:
                # Skip interests we can't produce any hashtags for
                continue

            entity_type = (item.get("entity_type") or "ENTITY").lower()
            output[key] = Interest(
                name=raw_name,
                node_id=_deterministic_id(key),
                labels=["entity", entity_type],
                relationship_count=int(round(graph_score * GRAPH_SOLO_WEIGHT)),
                last_active=None,  # Graph score already bakes in recency
                hashtags=hashtags,
            )

    ranked = sorted(output.values(), key=lambda i: i.relationship_count, reverse=True)
    return ranked[:MAX_INTERESTS]
