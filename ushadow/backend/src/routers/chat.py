"""
Chat Router - Streaming chat endpoint for the WebUI.

Provides a chat interface that:
- Uses the selected LLM provider via LiteLLM
- Uses MCP-style tool calling for dynamic memory search
- Queries OpenMemory for user-specific context
- Streams responses using AI SDK data stream protocol

The LLM can call the search_memories tool to fetch relevant context
from OpenMemory during the conversation.
"""

import json
import logging
import uuid
from typing import List, Optional, Dict, Any

import httpx
from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from src.services.llm_client import get_llm_client
from src.services.auth import get_current_user
from src.models.user import User

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
    limit: int = 5,
    auth_header: Optional[str] = None
) -> List[str]:
    """
    Fetch relevant memories from OpenMemory to enrich context.

    Args:
        query: The user's message to find relevant context for
        user_id: User identifier for memory lookup
        limit: Maximum number of memories to retrieve
        auth_header: Authorization header to forward to mem0

    Returns:
        List of relevant memory strings
    """
    try:
        # Use proxy endpoint - call backend's internal port (8000) not external port
        # This works regardless of deployment (Docker, K8s, etc.)
        headers = {}
        if auth_header:
            headers["Authorization"] = auth_header

        async with httpx.AsyncClient(timeout=5.0) as client:
            # Query OpenMemory (mem0) using filter endpoint - should be the source of truth
            url = "http://localhost:8000/api/services/mem0/proxy/api/v1/memories/filter"
            body = {
                "user_id": user_id,
                "limit": 20,
            }
            logger.info(f"[CHAT] Fetching memories from OpenMemory filter: {url} with body: {body}, auth: {bool(headers.get('Authorization'))}")

            response = await client.post(url, json=body, headers=headers)

            logger.info(f"[CHAT] Memory fetch response status: {response.status_code}")

            if response.status_code == 200:
                data = response.json()
                items = data.get("items", [])
                logger.info(f"[CHAT] Memory fetch returned {len(items)} total memories")

                memories = []
                for item in items:
                    # OpenMemory uses 'text' field for content
                    content = item.get("text") or item.get("content", "")
                    if content:
                        # Include category info if available for better context
                        categories = item.get("categories", [])
                        if categories:
                            content = f"[{', '.join(categories)}] {content}"
                        memories.append(content)

                logger.info(f"[CHAT] Retrieved {len(memories)} memories: {memories[:3]}")
                return memories[:limit]
            else:
                logger.warning(f"[CHAT] Memory fetch failed with status {response.status_code}: {response.text[:200]}")

    except httpx.TimeoutException:
        logger.warning("[CHAT] OpenMemory timeout - continuing without context")
    except httpx.ConnectError as e:
        logger.warning(f"[CHAT] OpenMemory connection error: {e} - continuing without context")
    except Exception as e:
        logger.warning(f"[CHAT] OpenMemory error: {e}", exc_info=True)

    return []


async def check_memory_available() -> bool:
    """Check if OpenMemory service is available by testing the proxy endpoint."""
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            # Use the DNS alias to check mem0 directly (same as proxy does internally)
            response = await client.get("http://mem0:8765/api/v1/config/")
            return response.status_code == 200
    except Exception as e:
        logger.debug(f"Could not check mem0 availability: {e}")
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
async def chat(
    chat_request: ChatRequest,
    request: Request,
    current_user: User = Depends(get_current_user)
):
    """
    Chat endpoint with streaming response.

    Accepts messages and returns a streaming response compatible with
    assistant-ui's data stream protocol.

    Uses MCP-style tool calling for memory access - the LLM can query
    memories dynamically during the conversation.
    """
    llm = get_llm_client()

    # Extract auth header to forward to memory service
    auth_header = request.headers.get("Authorization")

    # Check if configured
    if not await llm.is_configured():
        raise HTTPException(
            status_code=503,
            detail="LLM not configured. Please set up an LLM provider in settings."
        )

    # Build messages list
    messages: List[Dict[str, str]] = []

    # Add system message if provided
    if chat_request.system:
        messages.append({"role": "system", "content": chat_request.system})
    else:
        messages.append({"role": "system", "content": "You are a helpful assistant with access to memory search."})

    # Add conversation messages
    for msg in chat_request.messages:
        messages.append({"role": msg.role, "content": msg.content})

    # Define memory search tool (MCP-style function calling)
    tools = None
    if chat_request.use_memory:
        # Use authenticated user's email as user_id (same as memories router)
        user_id = chat_request.user_id or current_user.email
        tools = [{
            "type": "function",
            "function": {
                "name": "search_memories",
                "description": "Search the user's stored memories and context. Use this to recall information about the user, their preferences, previous conversations, and relevant facts.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "What to search for in memories"
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Maximum number of memories to return (default 5)",
                            "default": 5
                        }
                    },
                    "required": ["query"]
                }
            }
        }]

    async def generate():
        """Stream response chunks."""
        try:
            # First pass - LLM may request tool calls
            response = await llm.completion(
                messages=messages,
                temperature=chat_request.temperature,
                max_tokens=chat_request.max_tokens,
                tools=tools if tools else None,
                tool_choice="auto" if tools else None
            )

            # Check if LLM wants to call tools
            if response.choices[0].message.tool_calls:
                logger.info(f"[CHAT] LLM requested {len(response.choices[0].message.tool_calls)} tool calls")

                # Add assistant's tool call message to history
                assistant_msg = response.choices[0].message
                messages.append({
                    "role": "assistant",
                    "content": assistant_msg.content,
                    "tool_calls": [
                        {
                            "id": tc.id,
                            "type": "function",
                            "function": {
                                "name": tc.function.name,
                                "arguments": tc.function.arguments
                            }
                        }
                        for tc in assistant_msg.tool_calls
                    ]
                })

                # Execute tool calls
                for tool_call in assistant_msg.tool_calls:
                    if tool_call.function.name == "search_memories":
                        args = json.loads(tool_call.function.arguments)
                        query = args.get("query", "")
                        limit = args.get("limit", 5)

                        logger.info(f"[CHAT] Executing memory search: query='{query}', limit={limit}")
                        memories = await fetch_memory_context(query, user_id, limit=limit, auth_header=auth_header)

                        # Format memories as readable text
                        memories_text = "\n".join([f"- {mem}" for mem in memories])

                        # Format tool result
                        tool_result = {
                            "role": "tool",
                            "tool_call_id": tool_call.id,
                            "name": "search_memories",
                            "content": f"Found {len(memories)} memories:\n{memories_text}"
                        }
                        messages.append(tool_result)
                        logger.info(f"[CHAT] Memory search returned {len(memories)} results: {memories[:2]}")

                # Second pass - LLM responds with tool results
                async for chunk in llm.stream_completion(
                    messages=messages,
                    temperature=chat_request.temperature,
                    max_tokens=chat_request.max_tokens
                ):
                    yield format_text_delta(chunk)
            else:
                # No tool calls - stream the original response
                content = response.choices[0].message.content
                if content:
                    yield format_text_delta(content)

            # Send finish message
            yield format_finish_message("stop")

        except Exception as e:
            logger.error(f"Chat streaming error: {e}", exc_info=True)
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
async def chat_simple(
    chat_request: ChatRequest,
    request: Request,
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Non-streaming chat endpoint with MCP tool calling.

    Returns the complete response as JSON. Useful for testing or
    when streaming isn't needed.
    """
    llm = get_llm_client()

    # Extract auth header to forward to memory service
    auth_header = request.headers.get("Authorization")

    # Check if configured
    if not await llm.is_configured():
        raise HTTPException(
            status_code=503,
            detail="LLM not configured. Please set up an LLM provider in settings."
        )

    # Build messages list
    messages: List[Dict[str, str]] = []

    # Add system message if provided
    if chat_request.system:
        messages.append({"role": "system", "content": chat_request.system})
    else:
        messages.append({"role": "system", "content": "You are a helpful assistant with access to memory search."})

    # Add conversation messages
    for msg in chat_request.messages:
        messages.append({"role": msg.role, "content": msg.content})

    # Define memory search tool (MCP-style function calling)
    tools = None
    if chat_request.use_memory:
        # Use authenticated user's email as user_id (same as memories router)
        user_id = chat_request.user_id or current_user.email
        tools = [{
            "type": "function",
            "function": {
                "name": "search_memories",
                "description": "Search the user's stored memories and context. Use this to recall information about the user, their preferences, previous conversations, and relevant facts.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "What to search for in memories"
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Maximum number of memories to return (default 5)",
                            "default": 5
                        }
                    },
                    "required": ["query"]
                }
            }
        }]

    try:
        # First pass - LLM may request tool calls
        response = await llm.completion(
            messages=messages,
            temperature=chat_request.temperature,
            max_tokens=chat_request.max_tokens,
            tools=tools if tools else None,
            tool_choice="auto" if tools else None
        )

        # Check if LLM wants to call tools
        if response.choices[0].message.tool_calls:
            logger.info(f"[CHAT] LLM requested {len(response.choices[0].message.tool_calls)} tool calls")

            # Add assistant's tool call message to history
            assistant_msg = response.choices[0].message
            messages.append({
                "role": "assistant",
                "content": assistant_msg.content,
                "tool_calls": [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {
                            "name": tc.function.name,
                            "arguments": tc.function.arguments
                        }
                    }
                    for tc in assistant_msg.tool_calls
                ]
            })

            # Execute tool calls
            for tool_call in assistant_msg.tool_calls:
                if tool_call.function.name == "search_memories":
                    args = json.loads(tool_call.function.arguments)
                    query = args.get("query", "")
                    limit = args.get("limit", 5)

                    logger.info(f"[CHAT] Executing memory search: query='{query}', limit={limit}")
                    memories = await fetch_memory_context(query, user_id, limit=limit, auth_header=auth_header)

                    # Format memories as readable text
                    memories_text = "\n".join([f"- {mem}" for mem in memories])

                    # Format tool result
                    tool_result = {
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "name": "search_memories",
                        "content": f"Found {len(memories)} memories:\n{memories_text}"
                    }
                    messages.append(tool_result)
                    logger.info(f"[CHAT] Memory search returned {len(memories)} results: {memories[:2]}")

            # Second pass - LLM responds with tool results
            response = await llm.completion(
                messages=messages,
                temperature=chat_request.temperature,
                max_tokens=chat_request.max_tokens
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
        logger.error(f"Chat error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
