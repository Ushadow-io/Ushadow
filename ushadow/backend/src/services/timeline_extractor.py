"""Timeline Extractor — LLM-powered transcript-to-timeline conversion.

Takes a conversation transcript and uses the configured LLM to extract
a structured timeline of discrete activities with timestamps, categories,
durations, and sentiment.

Works for both routine sessions and general conversations.
"""

import json
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any

from src.models.routine import TimelineEvent
from src.services.llm_client import get_llm_client

logger = logging.getLogger(__name__)


# =============================================================================
# Prompt templates
# =============================================================================

ROUTINE_EXTRACTION_PROMPT = """\
You are analysing a voice transcript of someone performing their daily routine.
The routine is called "{routine_name}" with the goal: "{goal}".
The recording started at {start_time}.

Extract a timeline of discrete activities from the transcript.
For each activity, return a JSON array of objects with these fields:
- activity: short normalised name (e.g. "Brushing teeth")
- category: one of [hygiene, food, clothing, organisation, transport, leisure, work, waiting, other]
- start_offset_seconds: seconds from recording start
- end_offset_seconds: seconds from recording start
- sentiment: one of [positive, neutral, negative, frustrated]
- is_productive: boolean — does this contribute to reaching the goal?
- is_transition: boolean — moving between activities rather than doing one?
- notes: any relevant context from what was said (short, or null)

Normalise activity names so that "doing my teeth", "brushing teeth",
and "cleaning my teeth" all become "Brushing teeth".

Return ONLY a JSON array, no other text.

Transcript:
{transcript}"""

GENERAL_EXTRACTION_PROMPT = """\
Analyse this conversation transcript and extract a timeline of events or
topics discussed. For each segment, return a JSON array of objects with:
- activity: short topic description
- category: one of [discussion, decision, action_item, question, tangent, other]
- start_offset_seconds: seconds from start
- end_offset_seconds: seconds from start
- sentiment: one of [positive, neutral, negative, frustrated]
- is_productive: boolean
- is_transition: boolean
- notes: key points (short, or null)

Return ONLY a JSON array, no other text.

Transcript:
{transcript}"""


class TimelineExtractor:
    """Extract structured timelines from transcripts using the LLM."""

    def __init__(self):
        self._llm = get_llm_client()

    async def extract_routine_timeline(
        self,
        session_id: str,
        transcript: str,
        routine_name: str,
        goal: str,
        start_time: datetime,
    ) -> List[TimelineEvent]:
        """Extract timeline events from a routine recording transcript.

        Args:
            session_id: The RoutineSession this timeline belongs to.
            transcript: Raw transcript text with timestamps.
            routine_name: Name of the routine.
            goal: The routine's goal description.
            start_time: When the recording started.

        Returns:
            List of persisted TimelineEvent documents.
        """
        prompt = ROUTINE_EXTRACTION_PROMPT.format(
            routine_name=routine_name,
            goal=goal,
            start_time=start_time.isoformat(),
            transcript=transcript,
        )

        raw_events = await self._call_llm(prompt)
        events = self._parse_events(raw_events, session_id, start_time)

        # Persist
        for event in events:
            await event.insert()

        logger.info(
            f"Extracted {len(events)} timeline events for session {session_id}"
        )
        return events

    async def extract_general_timeline(
        self,
        session_id: str,
        transcript: str,
        start_time: datetime,
    ) -> List[TimelineEvent]:
        """Extract timeline events from any conversation transcript."""
        prompt = GENERAL_EXTRACTION_PROMPT.format(transcript=transcript)

        raw_events = await self._call_llm(prompt)
        events = self._parse_events(raw_events, session_id, start_time)

        for event in events:
            await event.insert()

        logger.info(
            f"Extracted {len(events)} general timeline events for session {session_id}"
        )
        return events

    async def get_timeline(self, session_id: str) -> List[TimelineEvent]:
        """Retrieve the timeline for a session, ordered by start time."""
        return (
            await TimelineEvent.find(TimelineEvent.session_id == session_id)
            .sort("+started_at")
            .to_list()
        )

    # ── Internal ──────────────────────────────────────────────────────

    async def _call_llm(self, prompt: str) -> List[Dict[str, Any]]:
        """Send the extraction prompt to the LLM and parse JSON response."""
        messages = [
            {"role": "system", "content": "You are a precise timeline extraction assistant. Return only valid JSON arrays."},
            {"role": "user", "content": prompt},
        ]

        response = await self._llm.completion(
            messages=messages,
            temperature=0.2,
            max_tokens=4096,
        )

        content = response.choices[0].message.content.strip()

        # Strip markdown code fences if present
        if content.startswith("```"):
            lines = content.split("\n")
            # Remove first and last lines (```json and ```)
            lines = [l for l in lines if not l.strip().startswith("```")]
            content = "\n".join(lines)

        try:
            return json.loads(content)
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse LLM timeline response: {e}")
            logger.debug(f"Raw response: {content[:500]}")
            return []

    def _parse_events(
        self,
        raw_events: List[Dict[str, Any]],
        session_id: str,
        start_time: datetime,
    ) -> List[TimelineEvent]:
        """Convert raw LLM output into TimelineEvent documents."""
        events = []
        for raw in raw_events:
            try:
                start_offset = float(raw.get("start_offset_seconds", 0))
                end_offset = float(raw.get("end_offset_seconds", start_offset))
                duration = max(0, end_offset - start_offset)

                from datetime import timedelta

                event = TimelineEvent(
                    session_id=session_id,
                    activity=raw.get("activity", "Unknown"),
                    category=raw.get("category", "other"),
                    started_at=start_time + timedelta(seconds=start_offset),
                    ended_at=start_time + timedelta(seconds=end_offset),
                    duration_seconds=duration,
                    notes=raw.get("notes"),
                    sentiment=raw.get("sentiment"),
                    is_productive=raw.get("is_productive", True),
                    is_transition=raw.get("is_transition", False),
                )
                events.append(event)
            except Exception as e:
                logger.warning(f"Skipping malformed timeline event: {e}")
                continue

        return events


# Global singleton
_extractor: Optional[TimelineExtractor] = None


def get_timeline_extractor() -> TimelineExtractor:
    global _extractor
    if _extractor is None:
        _extractor = TimelineExtractor()
    return _extractor
