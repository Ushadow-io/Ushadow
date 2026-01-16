"""
Agent models for Agent Zero - autonomous AI agents for task automation.

Agents are created from natural language descriptions in chat and can be
triggered based on conversation context.
"""

from datetime import datetime
from enum import Enum
from typing import Dict, List, Optional, Any

from pydantic import BaseModel, Field


class AgentStatus(str, Enum):
    """Status of an agent."""
    ACTIVE = "active"          # Agent is active and will respond to triggers
    INACTIVE = "inactive"      # Agent is paused/disabled
    DRAFT = "draft"            # Agent is being configured


class AgentTrigger(BaseModel):
    """
    Defines when an agent should be activated.

    Agents can be triggered by:
    - Keywords/phrases in the conversation
    - Explicit invocation by name
    - Context matching (semantic similarity)
    """
    type: str = Field(
        default="keyword",
        description="Trigger type: keyword, context, explicit"
    )
    keywords: List[str] = Field(
        default_factory=list,
        description="Keywords/phrases that trigger the agent"
    )
    context_description: Optional[str] = Field(
        default=None,
        description="Description of context when agent should activate"
    )
    threshold: float = Field(
        default=0.7,
        description="Similarity threshold for context matching (0-1)"
    )


class AgentOutput(BaseModel):
    """
    Defines how an agent should structure its output.
    """
    format: str = Field(
        default="markdown",
        description="Output format: markdown, json, plain"
    )
    sections: List[str] = Field(
        default_factory=list,
        description="Required sections in the output"
    )
    include_sources: bool = Field(
        default=False,
        description="Whether to include sources/citations"
    )


class Agent(BaseModel):
    """
    An autonomous AI agent for task automation.

    Agents are created from natural language descriptions and can be
    triggered based on conversation context to perform specific tasks.
    """
    id: str = Field(..., description="Unique agent ID")
    name: str = Field(..., description="Agent display name")
    description: str = Field(..., description="What the agent does")

    # What triggers this agent
    trigger: AgentTrigger = Field(
        default_factory=AgentTrigger,
        description="When this agent should activate"
    )

    # What the agent does
    system_prompt: str = Field(
        default="",
        description="System prompt for the agent's LLM"
    )
    instructions: str = Field(
        default="",
        description="Detailed instructions for the agent"
    )

    # Output configuration
    output: AgentOutput = Field(
        default_factory=AgentOutput,
        description="How the agent should format output"
    )

    # Status
    status: AgentStatus = Field(
        default=AgentStatus.ACTIVE,
        description="Current agent status"
    )

    # Metadata
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    created_by: Optional[str] = None
    last_used_at: Optional[datetime] = None
    use_count: int = Field(default=0, description="Number of times agent was invoked")

    # Tags for organization
    tags: List[str] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)

    class Config:
        use_enum_values = True


class AgentCreate(BaseModel):
    """Request to create a new agent."""
    name: str = Field(..., min_length=1, max_length=100)
    description: str = Field(..., min_length=1, max_length=500)
    trigger: Optional[AgentTrigger] = None
    system_prompt: Optional[str] = None
    instructions: Optional[str] = None
    output: Optional[AgentOutput] = None
    tags: List[str] = Field(default_factory=list)


class AgentUpdate(BaseModel):
    """Request to update an agent."""
    name: Optional[str] = None
    description: Optional[str] = None
    trigger: Optional[AgentTrigger] = None
    system_prompt: Optional[str] = None
    instructions: Optional[str] = None
    output: Optional[AgentOutput] = None
    status: Optional[AgentStatus] = None
    tags: Optional[List[str]] = None


class AgentFromChat(BaseModel):
    """
    Request to create an agent from natural language in chat.

    The LLM will parse this to extract agent configuration.
    """
    user_request: str = Field(..., description="The user's natural language request")
    conversation_context: Optional[List[Dict[str, str]]] = Field(
        default=None,
        description="Previous conversation messages for context"
    )


class AgentInvocation(BaseModel):
    """
    Record of an agent being invoked.
    """
    id: str = Field(..., description="Unique invocation ID")
    agent_id: str = Field(..., description="The agent that was invoked")
    trigger_type: str = Field(..., description="How the agent was triggered")
    input_context: str = Field(..., description="The input that triggered the agent")
    output: str = Field(..., description="The agent's response")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    user_id: Optional[str] = None


class AgentExecuteRequest(BaseModel):
    """Request to execute an agent with specific input."""
    agent_id: str = Field(..., description="Agent to execute")
    input_text: str = Field(..., description="Input for the agent")
    additional_context: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Additional context to provide to the agent"
    )
