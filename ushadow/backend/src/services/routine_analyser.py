"""Routine Analyser — Cross-session trend analysis and LLM optimisation.

Aggregates data across multiple sessions of the same routine to compute
statistics, identify patterns, and generate LLM-powered suggestions.
"""

import json
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from src.models.routine import (
    Routine,
    RoutineFeedback,
    RoutineSession,
    TimelineEvent,
)
from src.services.llm_client import get_llm_client

logger = logging.getLogger(__name__)

OPTIMISATION_PROMPT = """\
You are a routine optimisation coach. Analyse these {n} recordings of
the routine "{routine_name}" (goal: "{goal}"{target_time_clause}).

Session data (each session has a list of activities with durations):
{sessions_json}

User feedback across sessions:
{feedback_json}

Provide a JSON object with:
{{
  "summary": "1-2 sentence overview of routine performance",
  "total_sessions": {n},
  "avg_duration_minutes": <number>,
  "best_duration_minutes": <number>,
  "worst_duration_minutes": <number>,
  "suggestions": [
    {{
      "type": "reorder | parallelise | eliminate | timebox | prepare",
      "title": "short title",
      "description": "specific, data-backed suggestion",
      "estimated_savings_minutes": <number>
    }}
  ],
  "recurring_blockers": [
    {{
      "blocker": "description",
      "frequency_pct": <number>,
      "suggestion": "how to address it"
    }}
  ],
  "improvements": "encouragement about positive trends"
}}

Be specific and reference actual data. Return ONLY valid JSON."""


class RoutineAnalyser:
    """Aggregate session data and produce trend analysis + suggestions."""

    def __init__(self):
        self._llm = get_llm_client()

    async def get_trends(self, routine_id: str, user_id: str) -> Dict[str, Any]:
        """Compute pure data trends (no LLM call) for charting.

        Returns per-session durations, per-activity averages, day-of-week
        breakdown, and blocker frequencies.
        """
        sessions = (
            await RoutineSession.find(
                RoutineSession.routine_id == routine_id,
                RoutineSession.user_id == user_id,
                RoutineSession.status == "complete",
            )
            .sort("+started_at")
            .to_list()
        )

        if not sessions:
            return {"sessions": [], "activity_averages": {}, "blocker_counts": {}}

        session_data = []
        activity_totals: Dict[str, List[float]] = {}

        for sess in sessions:
            events = (
                await TimelineEvent.find(TimelineEvent.session_id == sess.session_id)
                .sort("+started_at")
                .to_list()
            )
            total_duration = sum(e.duration_seconds for e in events)

            for e in events:
                activity_totals.setdefault(e.activity, []).append(e.duration_seconds)

            session_data.append({
                "session_id": sess.session_id,
                "started_at": sess.started_at.isoformat() if sess.started_at else None,
                "total_duration_seconds": total_duration,
                "total_duration_minutes": round(total_duration / 60, 1),
                "goal_reached": sess.goal_reached,
                "day_of_week": sess.started_at.strftime("%A") if sess.started_at else None,
                "event_count": len(events),
            })

        # Activity averages
        activity_averages = {}
        for activity, durations in activity_totals.items():
            activity_averages[activity] = {
                "avg_seconds": round(sum(durations) / len(durations), 1),
                "min_seconds": round(min(durations), 1),
                "max_seconds": round(max(durations), 1),
                "count": len(durations),
            }

        # Blocker frequencies from feedback
        blocker_counts: Dict[str, int] = {}
        feedbacks = await RoutineFeedback.find(
            RoutineFeedback.user_id == user_id,
        ).to_list()
        session_ids = {s.session_id for s in sessions}
        for fb in feedbacks:
            if fb.session_id in session_ids:
                for blocker in fb.blockers:
                    blocker_counts[blocker] = blocker_counts.get(blocker, 0) + 1

        return {
            "sessions": session_data,
            "activity_averages": activity_averages,
            "blocker_counts": blocker_counts,
        }

    async def get_suggestions(self, routine_id: str, user_id: str) -> Dict[str, Any]:
        """Generate LLM-powered optimisation suggestions from session data."""
        routine = await Routine.find_one(
            Routine.routine_id == routine_id,
            Routine.user_id == user_id,
        )
        if not routine:
            return {"error": "Routine not found"}

        sessions = (
            await RoutineSession.find(
                RoutineSession.routine_id == routine_id,
                RoutineSession.user_id == user_id,
                RoutineSession.status == "complete",
            )
            .sort("+started_at")
            .to_list()
        )

        if len(sessions) < 2:
            return {
                "summary": "Need at least 2 completed sessions for analysis.",
                "suggestions": [],
                "recurring_blockers": [],
            }

        # Build session summaries for the prompt
        sessions_for_prompt = []
        for sess in sessions:
            events = (
                await TimelineEvent.find(TimelineEvent.session_id == sess.session_id)
                .sort("+started_at")
                .to_list()
            )
            sessions_for_prompt.append({
                "date": sess.started_at.isoformat() if sess.started_at else "unknown",
                "goal_reached": sess.goal_reached,
                "activities": [
                    {
                        "activity": e.activity,
                        "category": e.category,
                        "duration_minutes": round(e.duration_seconds / 60, 1),
                        "sentiment": e.sentiment,
                        "is_productive": e.is_productive,
                    }
                    for e in events
                ],
            })

        # Gather feedback
        session_ids = {s.session_id for s in sessions}
        all_feedback = await RoutineFeedback.find(
            RoutineFeedback.user_id == user_id,
        ).to_list()
        feedback_for_prompt = [
            {
                "session_date": next(
                    (s.started_at.isoformat() for s in sessions if s.session_id == fb.session_id),
                    "unknown",
                ),
                "rating": fb.overall_rating,
                "on_time": fb.on_time,
                "mood": fb.mood,
                "blockers": fb.blockers,
                "blocker_details": fb.blocker_details,
                "external_factors": fb.external_factors,
            }
            for fb in all_feedback
            if fb.session_id in session_ids
        ]

        target_time_clause = (
            f", target time: {routine.goal_time}" if routine.goal_time else ""
        )

        prompt = OPTIMISATION_PROMPT.format(
            n=len(sessions),
            routine_name=routine.name,
            goal=routine.goal,
            target_time_clause=target_time_clause,
            sessions_json=json.dumps(sessions_for_prompt, indent=2),
            feedback_json=json.dumps(feedback_for_prompt, indent=2),
        )

        messages = [
            {"role": "system", "content": "You are a routine optimisation coach. Return only valid JSON."},
            {"role": "user", "content": prompt},
        ]

        try:
            response = await self._llm.completion(
                messages=messages,
                temperature=0.3,
                max_tokens=2048,
            )
            content = response.choices[0].message.content.strip()

            if content.startswith("```"):
                lines = content.split("\n")
                lines = [l for l in lines if not l.strip().startswith("```")]
                content = "\n".join(lines)

            return json.loads(content)
        except Exception as e:
            logger.error(f"Routine analysis LLM call failed: {e}")
            return {
                "error": "Analysis failed — check LLM configuration",
                "suggestions": [],
            }


# Global singleton
_analyser: Optional[RoutineAnalyser] = None


def get_routine_analyser() -> RoutineAnalyser:
    global _analyser
    if _analyser is None:
        _analyser = RoutineAnalyser()
    return _analyser
