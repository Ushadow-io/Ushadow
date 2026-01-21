"""
SSE Bridge - Reusable utility for streaming blocking operations via Server-Sent Events.

This module provides a bridge between synchronous/blocking operations and async SSE streams,
allowing the frontend to receive real-time progress updates.

Usage:
    from src.utils.sse_bridge import SSEBridge, create_sse_response

    # Create bridge and run blocking operation
    bridge = SSEBridge()

    def my_blocking_operation():
        for i in range(10):
            bridge.send({"progress": i * 10, "status": "Processing..."})
            time.sleep(1)
        bridge.complete(success=True, message="Done!")

    # Return SSE response
    return create_sse_response(bridge, my_blocking_operation)
"""

import asyncio
import json
import logging
from queue import Queue, Empty
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable, Dict, Optional, AsyncGenerator

from fastapi.responses import StreamingResponse

logger = logging.getLogger(__name__)

# Shared thread pool for SSE bridge operations
_sse_executor = ThreadPoolExecutor(max_workers=8, thread_name_prefix="sse-bridge")


class SSEBridge:
    """
    Bridge for streaming events from blocking operations to SSE.

    The blocking operation calls send() to emit events, and the SSE generator
    reads from the internal queue to stream them to the client.
    """

    def __init__(self):
        self._queue: Queue = Queue()
        self._completed = False

    def send(self, event: Dict[str, Any]) -> None:
        """
        Send an event to the SSE stream.

        Args:
            event: Dictionary to send as JSON. Common keys:
                - status: Current operation status
                - progress: Progress percentage or description
                - id: Item/layer ID (for multi-item operations)
                - error: Error message (if applicable)
        """
        self._queue.put(event)

    def complete(self, success: bool = True, message: str = "", **extra) -> None:
        """
        Signal completion of the operation.

        Args:
            success: Whether operation succeeded
            message: Completion message
            **extra: Additional fields to include in completion event
        """
        event = {
            "complete": True,
            "success": success,
            "message": message,
            **extra
        }
        self._queue.put(event)
        self._completed = True

    def error(self, message: str, **extra) -> None:
        """
        Signal an error and complete the stream.

        Args:
            message: Error message
            **extra: Additional error details
        """
        event = {
            "complete": True,
            "success": False,
            "error": message,
            **extra
        }
        self._queue.put(event)
        self._completed = True

    @property
    def is_completed(self) -> bool:
        return self._completed

    def get_event(self, timeout: float = 0.1) -> Optional[Dict[str, Any]]:
        """Get next event from queue (blocking with timeout)."""
        try:
            return self._queue.get(timeout=timeout)
        except Empty:
            return None

    def drain(self) -> list[Dict[str, Any]]:
        """Get all remaining events from queue."""
        events = []
        while not self._queue.empty():
            try:
                events.append(self._queue.get_nowait())
            except Empty:
                break
        return events


async def generate_sse_events(
    bridge: SSEBridge,
    operation: Callable[[], None],
    executor: Optional[ThreadPoolExecutor] = None
) -> AsyncGenerator[str, None]:
    """
    Generate SSE events from a blocking operation.

    Args:
        bridge: SSEBridge instance for communication
        operation: Blocking callable that uses bridge.send() to emit events
        executor: Optional thread pool (uses default if not provided)

    Yields:
        SSE-formatted event strings
    """
    pool = executor or _sse_executor
    loop = asyncio.get_event_loop()

    # Start the blocking operation in a thread
    future = loop.run_in_executor(pool, operation)

    try:
        while True:
            # Check for events with async-friendly polling
            try:
                event = await asyncio.wait_for(
                    loop.run_in_executor(None, lambda: bridge.get_event(timeout=0.1)),
                    timeout=0.2
                )

                if event:
                    yield f"data: {json.dumps(event)}\n\n"

                    if event.get("complete"):
                        break

            except asyncio.TimeoutError:
                # Check if operation finished
                if future.done():
                    # Drain remaining events
                    for event in bridge.drain():
                        yield f"data: {json.dumps(event)}\n\n"

                    # If no completion event was sent, create one
                    if not bridge.is_completed:
                        try:
                            # Check for exceptions
                            future.result()
                            yield f"data: {json.dumps({'complete': True, 'success': True})}\n\n"
                        except Exception as e:
                            yield f"data: {json.dumps({'complete': True, 'success': False, 'error': str(e)})}\n\n"
                    break
                continue

    except Exception as e:
        logger.error(f"SSE generation error: {e}")
        yield f"data: {json.dumps({'complete': True, 'success': False, 'error': str(e)})}\n\n"


def create_sse_response(
    bridge: SSEBridge,
    operation: Callable[[], None],
    executor: Optional[ThreadPoolExecutor] = None
) -> StreamingResponse:
    """
    Create a FastAPI StreamingResponse for SSE.

    Args:
        bridge: SSEBridge instance for communication
        operation: Blocking callable that uses bridge.send() to emit events
        executor: Optional thread pool

    Returns:
        StreamingResponse configured for SSE

    Example:
        @router.get("/progress")
        async def get_progress():
            bridge = SSEBridge()

            def my_operation():
                for i in range(100):
                    bridge.send({"progress": i})
                    time.sleep(0.1)
                bridge.complete(success=True)

            return create_sse_response(bridge, my_operation)
    """
    return StreamingResponse(
        generate_sse_events(bridge, operation, executor),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        }
    )
