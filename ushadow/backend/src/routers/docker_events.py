"""Real-time Docker events streaming via Server-Sent Events (SSE).

Implements continuous event stream for container status changes,
enabling instant UI updates without polling. Modeled after simple-docker-ui.
"""

import asyncio
import json
import logging
from datetime import datetime

from fastapi import APIRouter, Depends
from sse_starlette.sse import EventSourceResponse

from src.services.docker_manager import get_docker_manager
from src.services.auth_dependencies import get_current_user
from src.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/events")
async def docker_events_stream(
    current_user: User = Depends(get_current_user)
) -> EventSourceResponse:
    """
    Stream Docker events via Server-Sent Events.

    Sends real-time notifications for container lifecycle events:
    - start, stop, die, restart
    - create, destroy
    - health_status changes

    Client connects with EventSource and receives JSON-formatted events.
    """

    async def event_generator():
        """Generate SSE events from Docker event stream."""
        docker_manager = get_docker_manager()

        if not docker_manager.is_available():
            logger.warning("Docker not available for events stream")
            yield {
                "event": "error",
                "data": json.dumps({"error": "Docker not available"})
            }
            return

        logger.info(f"SSE client connected: {current_user.email}")

        try:
            # Get Docker client
            client = docker_manager._client

            # Subscribe to container events only
            event_filter = {"type": ["container"]}

            # Create event generator from Docker
            # events() returns a blocking generator, so we run next() in a thread
            events = client.events(decode=True, filters=event_filter)

            # Send initial heartbeat
            yield {
                "event": "connected",
                "data": json.dumps({
                    "message": "Docker events stream connected",
                    "timestamp": datetime.now().isoformat()
                })
            }

            # Helper to get next event without blocking the async loop
            def get_next_event():
                try:
                    return next(events)
                except StopIteration:
                    return None

            # Iterate over events using asyncio.to_thread to avoid blocking
            while True:
                event = await asyncio.to_thread(get_next_event)
                if event is None:
                    break

                event_type = event.get("Type")
                if event_type != "container":
                    continue

                action = event.get("Action", "")
                attributes = event.get("Actor", {}).get("Attributes", {})
                container_name = attributes.get("name", "")
                container_id = event.get("Actor", {}).get("ID", "")[:12]

                # Only send relevant state-changing events
                if action in ["start", "stop", "die", "restart", "create", "destroy", "health_status"]:
                    logger.info(f"Docker event: {action} {container_name}")

                    yield {
                        "event": "container",
                        "data": json.dumps({
                            "action": action,
                            "container_name": container_name,
                            "container_id": container_id,
                            "status": event.get("status"),
                            "timestamp": event.get("time")
                        })
                    }

        except asyncio.CancelledError:
            logger.info(f"SSE client disconnected: {current_user.email}")
            raise
        except Exception as e:
            logger.error(f"Error in Docker events stream: {e}")
            yield {
                "event": "error",
                "data": json.dumps({"error": str(e)})
            }

    return EventSourceResponse(event_generator())
