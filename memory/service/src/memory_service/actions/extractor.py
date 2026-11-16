"""Action-fact extraction: tasks, commitments (with direction), decisions, constraints.

An extractor only proposes. Each candidate must carry an exact quote; the service locates the
quote in the episode lines and checks it against the ledger transcript before anything is
written. Candidates without valid proof are rejected and counted.
"""

from __future__ import annotations

import json
import os
import re
from typing import Literal, Protocol

import httpx
from pydantic import BaseModel, ValidationError

from memory_service.models import EpisodeInput

ActionKey = Literal["task_requested", "promise_made", "decision_made", "constraint_added"]
SUBJECT_KIND: dict[str, str] = {"task_requested": "task", "promise_made": "commitment",
                                "decision_made": "decision", "constraint_added": "constraint"}


class ActionCandidate(BaseModel):
    key: ActionKey
    text: str
    quote: str
    direction: Literal["owed_by_me", "owed_to_me"] | None = None
    due: str | None = None
    about: list[str] = []
    sensitivity: Literal["normal", "private", "health", "finance"] | None = None


class ActionExtractor(Protocol):
    async def extract(self, episode: EpisodeInput) -> list[ActionCandidate]: ...


class NoActionExtractor:
    async def extract(self, episode: EpisodeInput) -> list[ActionCandidate]:
        return []


_RULES: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\b(?:I will|I'll) [^.!?]+", re.I), "promise_made"),
    (re.compile(r"\bcan you [^.!?]+", re.I), "task_requested"),
    (re.compile(r"\bwe decided (?:to )?[^.!?]+", re.I), "decision_made"),
    (re.compile(r"\bthe (?:limit|budget) is [^.!?]+", re.I), "constraint_added"),
]


def _direction(key: str, owner_spoke: bool) -> str | None:
    if key == "promise_made":
        return "owed_by_me" if owner_spoke else "owed_to_me"
    if key == "task_requested":
        return "owed_to_me" if owner_spoke else "owed_by_me"
    return None


class FakeActionExtractor:
    """Deterministic rules for tests. `extra` lets a test inject a candidate (e.g. a made-up quote)."""

    def __init__(self, extra: list[ActionCandidate] | None = None) -> None:
        self.extra = list(extra or [])

    async def extract(self, episode: EpisodeInput) -> list[ActionCandidate]:
        out: list[ActionCandidate] = []
        for line in episode.lines:
            owner = line.role == "owner"
            for pattern, key in _RULES:
                for m in pattern.finditer(line.text):
                    out.append(ActionCandidate(key=key, text=m.group(0), quote=m.group(0),
                                               direction=_direction(key, owner)))
        return out + self.extra


_PROMPT = """You extract action facts from one conversation transcript.
Each line is "[UTC time] SPEAKER (role): text". The role "owner" is the user.
Reference time (resolve "tomorrow" etc. against it): {reference_time}
Return JSON {{"actions": [...]}}. Each action: key (task_requested | promise_made | decision_made |
constraint_added), text (one sentence), quote (exact words copied from ONE line, no changes),
direction (owed_by_me | owed_to_me, commitments and tasks only), due (ISO date or null).
Only facts that are clearly said. No quote, no action.

Transcript:
{body}"""


class OpenAICompatibleActionExtractor:
    """Any OpenAI-compatible /chat/completions endpoint. Env: MEMORY_LLM_BASE_URL,
    MEMORY_LLM_API_KEY, MEMORY_ACTION_MODEL (or MEMORY_LLM_MODEL). No OPENAI_API_KEY fallback.
    Never logs prompts or answers (they hold private speech). Extraction quality is NOT verified."""

    def __init__(self, base_url: str, model: str, api_key: str = "none",
                 http: httpx.AsyncClient | None = None) -> None:
        self._url = base_url.rstrip("/") + "/chat/completions"
        self._model = model
        self._headers = {"Authorization": f"Bearer {api_key}"}
        self._http = http or httpx.AsyncClient(timeout=httpx.Timeout(300.0, connect=10.0))

    @classmethod
    def from_env(cls) -> OpenAICompatibleActionExtractor:
        base = os.environ.get("MEMORY_LLM_BASE_URL")
        model = os.environ.get("MEMORY_ACTION_MODEL") or os.environ.get("MEMORY_LLM_MODEL")
        if not base or not model:
            raise RuntimeError("model extractor needs MEMORY_LLM_BASE_URL and MEMORY_LLM_MODEL")
        return cls(base, model, os.environ.get("MEMORY_LLM_API_KEY", "none"))

    async def extract(self, episode: EpisodeInput) -> list[ActionCandidate]:
        prompt = _PROMPT.format(reference_time=episode.reference_time.isoformat(), body=episode.body)
        r = await self._http.post(self._url, headers=self._headers, json={
            "model": self._model, "temperature": 0, "response_format": {"type": "json_object"},
            "messages": [{"role": "user", "content": prompt}]})
        r.raise_for_status()
        return parse_actions(r.json()["choices"][0]["message"]["content"])


def parse_actions(content: str) -> list[ActionCandidate]:
    """Model answer to candidates. Bad items are dropped, not repaired."""
    try:
        items = json.loads(content).get("actions", [])
    except (json.JSONDecodeError, AttributeError):
        return []
    out = []
    for item in items if isinstance(items, list) else []:
        try:
            out.append(ActionCandidate.model_validate(item))
        except ValidationError:
            continue
    return out
