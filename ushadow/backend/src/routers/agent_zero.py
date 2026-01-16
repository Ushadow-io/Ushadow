"""
Agent Zero Router - API endpoints for autonomous AI agents.

Provides endpoints for:
- Agent CRUD operations
- Creating agents from natural language
- Executing agents
- Agent status and monitoring
"""

import logging
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, HTTPException

from src.models.agent import (
    Agent,
    AgentCreate,
    AgentUpdate,
    AgentStatus,
    AgentFromChat,
    AgentExecuteRequest,
)
from src.services.agent_zero import get_agent_zero_service

logger = logging.getLogger(__name__)
router = APIRouter()


# =============================================================================
# Status
# =============================================================================

@router.get("/status")
async def get_status() -> Dict[str, Any]:
    """Get Agent Zero service status."""
    service = get_agent_zero_service()
    if not service:
        return {
            "connected": False,
            "error": "Agent Zero service not initialized",
        }

    return await service.get_status()


# =============================================================================
# Agent CRUD
# =============================================================================

@router.get("/agents", response_model=List[Agent])
async def list_agents(
    status: Optional[str] = None,
) -> List[Agent]:
    """List all agents, optionally filtered by status."""
    service = get_agent_zero_service()
    if not service:
        raise HTTPException(status_code=503, detail="Agent Zero service not available")

    agent_status = None
    if status:
        try:
            agent_status = AgentStatus(status)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid status: {status}")

    return await service.list_agents(status=agent_status)


@router.get("/agents/{agent_id}", response_model=Agent)
async def get_agent(agent_id: str) -> Agent:
    """Get an agent by ID."""
    service = get_agent_zero_service()
    if not service:
        raise HTTPException(status_code=503, detail="Agent Zero service not available")

    agent = await service.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent not found: {agent_id}")

    return agent


@router.post("/agents", response_model=Agent)
async def create_agent(data: AgentCreate) -> Agent:
    """Create a new agent."""
    service = get_agent_zero_service()
    if not service:
        raise HTTPException(status_code=503, detail="Agent Zero service not available")

    return await service.create_agent(data)


@router.put("/agents/{agent_id}", response_model=Agent)
async def update_agent(agent_id: str, data: AgentUpdate) -> Agent:
    """Update an agent."""
    service = get_agent_zero_service()
    if not service:
        raise HTTPException(status_code=503, detail="Agent Zero service not available")

    agent = await service.update_agent(agent_id, data)
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent not found: {agent_id}")

    return agent


@router.delete("/agents/{agent_id}")
async def delete_agent(agent_id: str) -> Dict[str, Any]:
    """Delete an agent."""
    service = get_agent_zero_service()
    if not service:
        raise HTTPException(status_code=503, detail="Agent Zero service not available")

    deleted = await service.delete_agent(agent_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Agent not found: {agent_id}")

    return {"success": True, "message": f"Agent {agent_id} deleted"}


# =============================================================================
# Natural Language Agent Creation
# =============================================================================

@router.post("/agents/from-chat")
async def create_agent_from_chat(data: AgentFromChat) -> Dict[str, Any]:
    """
    Create an agent from a natural language description.

    The LLM will parse the user's request and create an appropriate agent.
    """
    service = get_agent_zero_service()
    if not service:
        raise HTTPException(status_code=503, detail="Agent Zero service not available")

    agent, message = await service.create_agent_from_chat(
        data.user_request,
        data.conversation_context,
    )

    if agent:
        return {
            "success": True,
            "agent": agent.model_dump(),
            "message": message,
        }
    else:
        return {
            "success": False,
            "agent": None,
            "message": message,
        }


# =============================================================================
# Agent Execution
# =============================================================================

@router.post("/agents/{agent_id}/execute")
async def execute_agent(agent_id: str, data: AgentExecuteRequest) -> Dict[str, Any]:
    """Execute an agent with the given input."""
    service = get_agent_zero_service()
    if not service:
        raise HTTPException(status_code=503, detail="Agent Zero service not available")

    output, invocation = await service.execute_agent(
        agent_id,
        data.input_text,
        data.additional_context,
    )

    return {
        "success": invocation is not None,
        "output": output,
        "invocation_id": invocation.id if invocation else None,
    }


@router.post("/process-message")
async def process_chat_message(
    message: str,
    conversation_context: Optional[List[Dict[str, str]]] = None,
) -> Dict[str, Any]:
    """
    Process a chat message to detect agent creation requests or triggers.

    This endpoint is used by the chat system to integrate agent functionality.
    """
    service = get_agent_zero_service()
    if not service:
        return {"action": None}

    result = await service.process_chat_message(message, conversation_context)
    return {"action": result}


# =============================================================================
# Agent Activation
# =============================================================================

@router.post("/agents/{agent_id}/activate")
async def activate_agent(agent_id: str) -> Dict[str, Any]:
    """Activate an agent (set status to active)."""
    service = get_agent_zero_service()
    if not service:
        raise HTTPException(status_code=503, detail="Agent Zero service not available")

    agent = await service.update_agent(agent_id, AgentUpdate(status=AgentStatus.ACTIVE))
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent not found: {agent_id}")

    return {"success": True, "agent": agent.model_dump()}


@router.post("/agents/{agent_id}/deactivate")
async def deactivate_agent(agent_id: str) -> Dict[str, Any]:
    """Deactivate an agent (set status to inactive)."""
    service = get_agent_zero_service()
    if not service:
        raise HTTPException(status_code=503, detail="Agent Zero service not available")

    agent = await service.update_agent(agent_id, AgentUpdate(status=AgentStatus.INACTIVE))
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent not found: {agent_id}")

    return {"success": True, "agent": agent.model_dump()}
