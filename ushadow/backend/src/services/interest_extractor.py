"""Interest Extractor - Derives user interests from OpenMemory's stored memories.

Fetches user facts via mem0's /api/v1/memories/filter endpoint, aggregates
categories and entities across memories, and maps them to fediverse hashtags.

Two layers of signal:
  - Categories (broad): "ai, ml & technology" → #ai #ml #technology
  - Entities (specific): "Mac mini" → #macmini #apple
"""

import hashlib
import logging
import re
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import httpx

from src.config import get_localhost_proxy_url
from src.models.feed import Interest

logger = logging.getLogger(__name__)

# Categories too personal/broad to produce useful fediverse search results
EXCLUDED_CATEGORIES = {"personal", "relationships", "health", "finance"}

# Simple in-memory cache: user_id → (timestamp, interests)
_interest_cache: Dict[str, Tuple[float, List[Interest]]] = {}
CACHE_TTL_SECONDS = 300  # 5 minutes

# Known product/brand → hashtag expansions (poor man's LLM)
PRODUCT_HASHTAGS: Dict[str, List[str]] = {
    "strix halo": ["strixhalo", "amd", "ryzen"],
    "mac mini": ["macmini", "apple", "homelab"],
    "raspberry pi": ["raspberrypi", "homelab", "sbc"],
    "home assistant": ["homeassistant", "smarthome", "iot"],
}

# Common abbreviation expansions
ABBREVIATIONS: Dict[str, str] = {
    "artificial intelligence": "ai",
    "machine learning": "ml",
    "deep learning": "dl",
    "reinforcement learning": "rl",
    "natural language processing": "nlp",
    "large language model": "llm",
    "large language models": "llm",
    "language model": "llm",
    "language models": "llm",
    "kubernetes": "k8s",
    "javascript": "js",
    "typescript": "ts",
    "open source": "opensource",
    "self hosted": "selfhosted",
    "home lab": "homelab",
    "home server": "homeserver",
    "mac mini": "macmini",
    "raspberry pi": "raspberrypi",
}


class InterestExtractor:
    """Extracts user interests from OpenMemory's stored memories."""

    async def extract_interests(
        self, user_id: str, limit: int = 100
    ) -> List[Interest]:
        """Extract interests from the user's stored memories.

        1. Fetch recent active memories from mem0
        2. Aggregate categories (breadth) and entities (specificity)
        3. Compute weighted scores based on mention count + recency
        4. Derive hashtags from interest names
        5. Return sorted by weight descending
        """
        # Check cache first
        now = time.time()
        cached = _interest_cache.get(user_id)
        if cached and (now - cached[0]) < CACHE_TTL_SECONDS:
            logger.debug(f"Returning {len(cached[1])} cached interests for {user_id}")
            return cached[1]

        memories = await self._fetch_memories(user_id, limit)
        if not memories:
            logger.warning("No memories returned from OpenMemory")
            return []

        # Two aggregation passes
        category_interests = self._aggregate_categories(memories)
        entity_interests = self._aggregate_entities(memories)

        # Merge: entities override categories if same name
        merged: Dict[str, Interest] = {}
        for interest in category_interests + entity_interests:
            key = interest.name.lower()
            existing = merged.get(key)
            if existing is None or interest.relationship_count > existing.relationship_count:
                merged[key] = interest

        interests = sorted(
            merged.values(),
            key=lambda i: i.relationship_count,
            reverse=True,
        )

        logger.info(
            f"Extracted {len(interests)} interests from {len(memories)} memories "
            f"({len(category_interests)} categories, {len(entity_interests)} entities)"
        )

        # Update cache
        _interest_cache[user_id] = (now, interests)
        return interests

    def clear_cache(self, user_id: str) -> None:
        """Clear cached interests for a user (e.g., on refresh)."""
        _interest_cache.pop(user_id, None)

    # ------------------------------------------------------------------
    # Data fetching
    # ------------------------------------------------------------------

    async def _fetch_memories(
        self, user_id: str, limit: int
    ) -> List[Dict[str, Any]]:
        """Fetch user memories from mem0 via the backend proxy."""
        proxy_url = get_localhost_proxy_url("mem0")
        url = f"{proxy_url}/api/v1/memories/filter"
        # mem0's Params model enforces size <= 100
        body = {
            "user_id": user_id,
            "size": min(limit, 100),
            "sort_column": "created_at",
            "sort_direction": "desc",
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(url, json=body)
                resp.raise_for_status()
                data = resp.json()
                return data.get("items", [])
        except httpx.HTTPError as e:
            logger.error(f"Failed to fetch memories: {e}")
            return []

    # ------------------------------------------------------------------
    # Aggregation
    # ------------------------------------------------------------------

    def _aggregate_categories(
        self, memories: List[Dict[str, Any]]
    ) -> List[Interest]:
        """Aggregate memory categories into broad interests."""
        # category_name → {count, latest_timestamp}
        agg: Dict[str, Dict[str, Any]] = {}

        for mem in memories:
            categories = mem.get("categories", [])
            ts = _parse_created_at(mem.get("created_at"))

            for raw_cat in categories:
                cat = raw_cat.strip().lower()
                if not cat or cat in EXCLUDED_CATEGORIES:
                    continue

                if cat not in agg:
                    agg[cat] = {"count": 0, "latest": ts}
                agg[cat]["count"] += 1
                if ts and (agg[cat]["latest"] is None or ts > agg[cat]["latest"]):
                    agg[cat]["latest"] = ts

        interests = []
        for name, info in agg.items():
            weight = _compute_weight(info["count"], info["latest"], is_entity=False)
            if weight <= 0:
                continue

            hashtags = self._category_to_hashtags(name)
            if not hashtags:
                continue

            interests.append(
                Interest(
                    name=name,
                    node_id=_deterministic_id(name),
                    labels=["category"],
                    relationship_count=int(round(weight)),
                    last_active=info["latest"],
                    hashtags=hashtags,
                )
            )

        return interests

    def _aggregate_entities(
        self, memories: List[Dict[str, Any]]
    ) -> List[Interest]:
        """Aggregate metadata entities into specific interests."""
        agg: Dict[str, Dict[str, Any]] = {}

        for mem in memories:
            metadata = mem.get("metadata_", {}) or {}
            entities = metadata.get("entities", [])
            ts = _parse_created_at(mem.get("created_at"))

            if isinstance(entities, list):
                entity_list = entities
            elif isinstance(entities, dict):
                # Some mem0 versions return {type: [names]}
                entity_list = []
                for names in entities.values():
                    if isinstance(names, list):
                        entity_list.extend(names)
            else:
                continue

            for entity in entity_list:
                if not isinstance(entity, str) or len(entity.strip()) < 2:
                    continue
                key = entity.strip().lower()
                if key not in agg:
                    agg[key] = {"count": 0, "latest": ts, "original": entity.strip()}
                agg[key]["count"] += 1
                if ts and (agg[key]["latest"] is None or ts > agg[key]["latest"]):
                    agg[key]["latest"] = ts

        interests = []
        for key, info in agg.items():
            weight = _compute_weight(info["count"], info["latest"], is_entity=True)
            if weight <= 0:
                continue

            hashtags = self._name_to_hashtags(info["original"])
            if not hashtags:
                continue

            interests.append(
                Interest(
                    name=info["original"],
                    node_id=_deterministic_id(key),
                    labels=["entity"],
                    relationship_count=int(round(weight)),
                    last_active=info["latest"],
                    hashtags=hashtags,
                )
            )

        return interests

    # ------------------------------------------------------------------
    # Hashtag derivation
    # ------------------------------------------------------------------

    @staticmethod
    def _category_to_hashtags(category: str) -> List[str]:
        """Convert a category string to hashtags.

        'ai, ml & technology' → ['ai', 'ml', 'technology']
        """
        # Split on commas, ampersands, 'and'
        parts = re.split(r"[,&]+|\band\b", category)
        hashtags: List[str] = []

        for part in parts:
            clean = re.sub(r"[^a-zA-Z0-9\s]", "", part).strip().lower()
            if not clean:
                continue

            joined = clean.replace(" ", "")
            if len(joined) >= 2 and joined not in hashtags:
                hashtags.append(joined)

            # Check abbreviations for the sub-part
            abbrev = ABBREVIATIONS.get(clean)
            if abbrev and abbrev not in hashtags:
                hashtags.append(abbrev)

        return hashtags

    @staticmethod
    def _name_to_hashtags(name: str) -> List[str]:
        """Convert an entity/interest name to fediverse hashtags.

        'Mac mini' → ['macmini', 'apple', 'homelab']
        'LMs' → ['lms']
        'Kubernetes' → ['kubernetes', 'k8s']
        """
        clean = re.sub(r"[^a-zA-Z0-9\s]", "", name).strip().lower()
        joined = clean.replace(" ", "")

        hashtags: List[str] = []
        if joined and len(joined) >= 2:
            hashtags.append(joined)

        # Individual words for multi-word names
        words = clean.split()
        if len(words) > 1:
            for word in words:
                if len(word) >= 3 and word not in hashtags:
                    hashtags.append(word)

        # Common abbreviations
        abbrev = ABBREVIATIONS.get(clean)
        if abbrev and abbrev not in hashtags:
            hashtags.append(abbrev)

        # Known product/brand expansions
        product_tags = PRODUCT_HASHTAGS.get(clean, [])
        for tag in product_tags:
            if tag not in hashtags:
                hashtags.append(tag)

        return hashtags


# ======================================================================
# Module-level helpers
# ======================================================================


def _compute_weight(
    mention_count: int,
    latest: Optional[datetime],
    is_entity: bool,
) -> float:
    """Compute interest weight from mention count, recency, and source type.

    weight = mention_count × recency_multiplier × source_bonus
    """
    if mention_count <= 0:
        return 0.0

    # Recency multiplier based on how recent the latest memory is
    recency = 1.0
    if latest:
        try:
            now = datetime.now(timezone.utc)
            if latest.tzinfo is None:
                latest = latest.replace(tzinfo=timezone.utc)
            age_days = (now - latest).total_seconds() / 86400
            if age_days <= 7:
                recency = 2.0
            elif age_days <= 30:
                recency = 1.5
            elif age_days <= 90:
                recency = 1.0
            else:
                recency = 0.5
        except (TypeError, ValueError):
            recency = 1.0

    source_bonus = 1.5 if is_entity else 1.0

    return mention_count * recency * source_bonus


def _deterministic_id(name: str) -> str:
    """Generate a stable short ID from a name string."""
    return hashlib.md5(name.lower().encode()).hexdigest()[:12]


def _parse_created_at(value: Any) -> Optional[datetime]:
    """Parse a created_at value (unix timestamp or ISO string)."""
    if value is None:
        return None
    try:
        if isinstance(value, datetime):
            return value
        if isinstance(value, (int, float)):
            return datetime.fromtimestamp(value, tz=timezone.utc)
        if isinstance(value, str):
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, TypeError, OSError):
        pass
    return None
