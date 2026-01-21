"""
Chat Router - Streaming chat endpoint for the WebUI.

Provides a chat interface that:
- Uses the selected LLM provider via LiteLLM
- Optionally enriches context with OpenMemory
- Streams responses using Server-Sent Events (SSE)

The streaming format is compatible with assistant-ui's data stream protocol.
"""

import json
import logging
import uuid
from typing import List, Optional, Dict, Any

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from src.services.llm_client import get_llm_client
from src.config.omegaconf_settings import get_settings

logger = logging.getLogger(__name__)
router = APIRouter()


# =============================================================================
# Request/Response Models
# =============================================================================

class ChatMessage(BaseModel):
    """A single chat message."""
    role: str  # 'user', 'assistant', 'system'
    content: str
    id: Optional[str] = None


class ChatRequest(BaseModel):
    """Request body for chat endpoint."""
    messages: List[ChatMessage]
    system: Optional[str] = None  # System prompt
    use_memory: bool = True  # Whether to fetch context from OpenMemory
    user_id: Optional[str] = None  # User ID for memory lookup
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None


class ChatStatus(BaseModel):
    """Status of chat configuration."""
    configured: bool
    provider: Optional[str] = None
    model: Optional[str] = None
    memory_available: bool = False
    error: Optional[str] = None


# =============================================================================
# OpenMemory Integration
# =============================================================================

async def fetch_memory_context(
    query: str,
    user_id: str,
    limit: int = 5
) -> List[str]:
    """
    Fetch relevant memories from OpenMemory to enrich context.

    Args:
        query: The user's message to find relevant context for
        user_id: User identifier for memory lookup
        limit: Maximum number of memories to retrieve

    Returns:
        List of relevant memory strings
    """
    settings = get_settings()
    memory_url = await settings.get(
        "infrastructure.openmemory_server_url",
        "http://localhost:8765"
    )

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            # Search for relevant memories
            response = await client.post(
                f"{memory_url}/api/v1/memories/search",
                json={
                    "query": query,
                    "user_id": user_id,
                    "limit": limit
                }
            )

            if response.status_code == 200:
                data = response.json()
                memories = data.get("results", [])
                return [m.get("memory", m.get("content", "")) for m in memories if m]

    except httpx.TimeoutException:
        logger.warning("OpenMemory timeout - continuing without context")
    except httpx.ConnectError:
        logger.debug("OpenMemory not available - continuing without context")
    except Exception as e:
        logger.warning(f"OpenMemory error: {e}")

    return []


async def check_memory_available() -> bool:
    """Check if OpenMemory service is available."""
    settings = get_settings()
    memory_url = await settings.get(
        "infrastructure.openmemory_server_url",
        "http://localhost:8765"
    )

    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            response = await client.get(f"{memory_url}/health")
            return response.status_code == 200
    except Exception:
        return False


# =============================================================================
# Streaming Helpers
# =============================================================================

def format_sse_event(event_type: str, data: Any) -> str:
    """Format data as a Server-Sent Event."""
    if isinstance(data, dict):
        data = json.dumps(data)
    return f"event: {event_type}\ndata: {data}\n\n"


def format_text_delta(content: str) -> str:
    """Format a text delta in AI SDK data stream format."""
    # AI SDK format: 0:content (text delta)
    return f"0:{json.dumps(content)}\n"


def format_finish_message(finish_reason: str = "stop") -> str:
    """Format finish message in AI SDK data stream format."""
    # AI SDK format: d:{finishReason, usage}
    return f"d:{json.dumps({'finishReason': finish_reason})}\n"


# =============================================================================
# Endpoints
# =============================================================================

@router.get("/status")
async def get_chat_status() -> ChatStatus:
    """
    Get chat configuration status.

    Returns whether LLM is configured and which provider/model is active.
    """
    llm = get_llm_client()

    try:
        config = await llm.get_llm_config()
        is_configured = await llm.is_configured()
        memory_available = await check_memory_available()

        return ChatStatus(
            configured=is_configured,
            provider=config.get("provider_id"),
            model=config.get("model"),
            memory_available=memory_available
        )
    except Exception as e:
        logger.error(f"Error getting chat status: {e}")
        return ChatStatus(
            configured=False,
            error=str(e)
        )


@router.post("")
async def chat(request: ChatRequest):
    """
    Chat endpoint with streaming response.

    Accepts messages and returns a streaming response compatible with
    assistant-ui's data stream protocol.
    """
    llm = get_llm_client()

    # Check if configured
    if not await llm.is_configured():
        raise HTTPException(
            status_code=503,
            detail="LLM not configured. Please set up an LLM provider in settings."
        )

    # Build messages list
    messages: List[Dict[str, str]] = []

    # Add system message if provided
    if request.system:
        messages.append({"role": "system", "content": request.system})

    # Fetch memory context if enabled
    memory_context = []
    if request.use_memory and request.messages:
        user_id = request.user_id or "default"
        last_user_message = next(
            (m.content for m in reversed(request.messages) if m.role == "user"),
            None
        )
        if last_user_message:
            memory_context = await fetch_memory_context(
                last_user_message,
                user_id
            )

    # Add memory context as system message if available
    if memory_context:
        context_text = "\n\nRelevant context from memory:\n" + "\n".join(
            f"- {mem}" for mem in memory_context
        )
        if messages and messages[0]["role"] == "system":
            messages[0]["content"] += context_text
        else:
            messages.insert(0, {
                "role": "system",
                "content": f"You are a helpful assistant.{context_text}"
            })

    # Add conversation messages
    for msg in request.messages:
        messages.append({"role": msg.role, "content": msg.content})

    async def generate():
        """Stream response chunks."""
        try:
            async for chunk in llm.stream_completion(
                messages=messages,
                temperature=request.temperature,
                max_tokens=request.max_tokens
            ):
                # Use AI SDK data stream format for text deltas
                yield format_text_delta(chunk)

            # Send finish message
            yield format_finish_message("stop")

        except Exception as e:
            logger.error(f"Chat streaming error: {e}")
            # Send error in stream
            error_msg = {"error": str(e)}
            yield f"e:{json.dumps(error_msg)}\n"

    return StreamingResponse(
        generate(),
        media_type="text/plain; charset=utf-8",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Content-Type-Options": "nosniff",
        }
    )


@router.post("/simple")
async def chat_simple(request: ChatRequest) -> Dict[str, Any]:
    """
    Non-streaming chat endpoint.

    Returns the complete response as JSON. Useful for testing or
    when streaming isn't needed.
    """
    llm = get_llm_client()

    # Check if configured
    if not await llm.is_configured():
        raise HTTPException(
            status_code=503,
            detail="LLM not configured. Please set up an LLM provider in settings."
        )

    # Build messages list
    messages: List[Dict[str, str]] = []

    # Add system message if provided
    if request.system:
        messages.append({"role": "system", "content": request.system})

    # Fetch memory context if enabled
    if request.use_memory and request.messages:
        user_id = request.user_id or "default"
        last_user_message = next(
            (m.content for m in reversed(request.messages) if m.role == "user"),
            None
        )
        if last_user_message:
            memory_context = await fetch_memory_context(
                last_user_message,
                user_id
            )
            if memory_context:
                context_text = "\n\nRelevant context from memory:\n" + "\n".join(
                    f"- {mem}" for mem in memory_context
                )
                if messages and messages[0]["role"] == "system":
                    messages[0]["content"] += context_text
                else:
                    messages.insert(0, {
                        "role": "system",
                        "content": f"You are a helpful assistant.{context_text}"
                    })

    # Add conversation messages
    for msg in request.messages:
        messages.append({"role": msg.role, "content": msg.content})

    try:
        response = await llm.completion(
            messages=messages,
            temperature=request.temperature,
            max_tokens=request.max_tokens
        )

        # Extract the assistant message
        content = response.choices[0].message.content

        return {
            "id": str(uuid.uuid4()),
            "role": "assistant",
            "content": content,
            "model": response.model if hasattr(response, 'model') else None,
        }

    except Exception as e:
        logger.error(f"Chat error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
