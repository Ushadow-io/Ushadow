"""Routine Service — CRUD and session lifecycle for routines.

Handles creating, listing, updating, and archiving routines, plus
starting/ending recording sessions and storing feedback.
"""

import logging
from datetime import datetime
from typing import List, Optional

from src.models.routine import (
    Routine,
    RoutineCreate,
    RoutineFeedback,
    RoutineSession,
    RoutineUpdate,
    FeedbackCreate,
    LocationPoint,
    SessionEnd,
    SessionStart,
)

logger = logging.getLogger(__name__)


class RoutineService:
    """CRUD operations for routines, sessions, and feedback."""

    # ── Routines ──────────────────────────────────────────────────────

    async def create_routine(self, user_id: str, data: RoutineCreate) -> Routine:
        routine = Routine(
            user_id=user_id,
            name=data.name,
            goal=data.goal,
            goal_type=data.goal_type,
            goal_location=data.goal_location,
            goal_time=data.goal_time,
            start_location=data.start_location,
            tags=data.tags,
        )
        await routine.insert()
        logger.info(f"Created routine '{routine.name}' ({routine.routine_id}) for {user_id}")
        return routine

    async def list_routines(
        self, user_id: str, include_archived: bool = False
    ) -> List[Routine]:
        query = {"user_id": user_id}
        if not include_archived:
            query["archived"] = False
        return await Routine.find(query).sort("-updated_at").to_list()

    async def get_routine(self, routine_id: str, user_id: str) -> Optional[Routine]:
        return await Routine.find_one(
            Routine.routine_id == routine_id,
            Routine.user_id == user_id,
        )

    async def update_routine(
        self, routine_id: str, user_id: str, data: RoutineUpdate
    ) -> Optional[Routine]:
        routine = await self.get_routine(routine_id, user_id)
        if not routine:
            return None

        update_data = data.model_dump(exclude_none=True)
        if update_data:
            update_data["updated_at"] = datetime.utcnow()
            await routine.set(update_data)

        return routine

    async def archive_routine(self, routine_id: str, user_id: str) -> bool:
        routine = await self.get_routine(routine_id, user_id)
        if not routine:
            return False
        await routine.set({"archived": True, "updated_at": datetime.utcnow()})
        return True

    # ── Sessions ──────────────────────────────────────────────────────

    async def start_session(
        self, routine_id: str, user_id: str, data: SessionStart
    ) -> Optional[RoutineSession]:
        routine = await self.get_routine(routine_id, user_id)
        if not routine:
            return None

        session = RoutineSession(
            routine_id=routine_id,
            user_id=user_id,
            audio_source=data.audio_source,
            conversation_id=data.conversation_id,
        )
        await session.insert()
        logger.info(
            f"Started session {session.session_id} for routine {routine_id}"
        )
        return session

    async def end_session(
        self, session_id: str, user_id: str, data: SessionEnd
    ) -> Optional[RoutineSession]:
        session = await RoutineSession.find_one(
            RoutineSession.session_id == session_id,
            RoutineSession.user_id == user_id,
        )
        if not session:
            return None
        if session.status != "recording":
            return session  # already ended

        await session.set({
            "status": "processing",
            "ended_at": datetime.utcnow(),
            "goal_reached": data.goal_reached,
        })
        logger.info(f"Ended session {session_id} (goal_reached={data.goal_reached})")
        return session

    async def get_session(
        self, session_id: str, user_id: str
    ) -> Optional[RoutineSession]:
        return await RoutineSession.find_one(
            RoutineSession.session_id == session_id,
            RoutineSession.user_id == user_id,
        )

    async def list_sessions(
        self, routine_id: str, user_id: str
    ) -> List[RoutineSession]:
        return (
            await RoutineSession.find(
                RoutineSession.routine_id == routine_id,
                RoutineSession.user_id == user_id,
            )
            .sort("-started_at")
            .to_list()
        )

    async def append_location(
        self, session_id: str, user_id: str, lat: float, lng: float, accuracy_m: Optional[float] = None
    ) -> bool:
        session = await RoutineSession.find_one(
            RoutineSession.session_id == session_id,
            RoutineSession.user_id == user_id,
            RoutineSession.status == "recording",
        )
        if not session:
            return False

        point = LocationPoint(
            lat=lat, lng=lng, timestamp=datetime.utcnow(), accuracy_m=accuracy_m
        )
        session.location_track.append(point)
        await session.save()
        return True

    async def mark_session_complete(self, session_id: str) -> Optional[RoutineSession]:
        """Called by TimelineExtractor after timeline is built."""
        session = await RoutineSession.find_one(
            RoutineSession.session_id == session_id,
        )
        if not session:
            return None
        await session.set({"status": "complete"})
        return session

    # ── Feedback ──────────────────────────────────────────────────────

    async def submit_feedback(
        self, session_id: str, user_id: str, data: FeedbackCreate
    ) -> Optional[RoutineFeedback]:
        session = await RoutineSession.find_one(
            RoutineSession.session_id == session_id,
            RoutineSession.user_id == user_id,
        )
        if not session:
            return None

        feedback = RoutineFeedback(
            session_id=session_id,
            user_id=user_id,
            overall_rating=data.overall_rating,
            on_time=data.on_time,
            blockers=data.blockers,
            blocker_details=data.blocker_details,
            mood=data.mood,
            sleep_quality=data.sleep_quality,
            external_factors=data.external_factors,
            suggestions=data.suggestions,
        )
        await feedback.insert()
        logger.info(f"Feedback submitted for session {session_id}")
        return feedback

    async def get_feedback(self, session_id: str, user_id: str) -> Optional[RoutineFeedback]:
        return await RoutineFeedback.find_one(
            RoutineFeedback.session_id == session_id,
            RoutineFeedback.user_id == user_id,
        )


# Global singleton
_routine_service: Optional[RoutineService] = None


def get_routine_service() -> RoutineService:
    global _routine_service
    if _routine_service is None:
        _routine_service = RoutineService()
    return _routine_service
