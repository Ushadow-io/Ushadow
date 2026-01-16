"""
Agent Zero Service - Autonomous AI agents for task automation.

This service manages the lifecycle of agents:
- Creating agents from natural language descriptions
- Detecting when agents should be triggered
- Executing agents with appropriate context
- Storing agent definitions and invocations
"""

import json
import logging
import re
import uuid
from datetime import datetime
from typing import Dict, List, Optional, Any, Tuple

from motor.motor_asyncio import AsyncIOMotorDatabase

from src.models.agent import (
    Agent,
    AgentCreate,
    AgentUpdate,
    AgentStatus,
    AgentTrigger,
    AgentOutput,
    AgentInvocation,
)
from src.services.llm_client import get_llm_client

logger = logging.getLogger(__name__)

# System prompt for parsing agent creation requests
AGENT_CREATION_PARSER_PROMPT = """You are an AI assistant that helps create autonomous agents from natural language descriptions.

When a user describes what they want an agent to do, extract the following information and return it as JSON:

{
  "should_create_agent": true/false,  // Is the user actually requesting an agent?
  "name": "Agent name",
  "description": "Brief description of what the agent does",
  "trigger_keywords": ["keyword1", "keyword2"],  // Words/phrases that should trigger this agent
  "trigger_context": "Description of the context when this agent should activate",
  "system_prompt": "The system prompt for the agent's LLM",
  "instructions": "Detailed step-by-step instructions for the agent",
  "output_sections": ["section1", "section2"],  // What sections the output should have
  "output_format": "markdown"  // or "json", "plain"
}

Guidelines:
- Set should_create_agent to false if the user is just asking a question or not requesting an agent
- Extract meaningful trigger keywords from phrases like "when I am having...", "whenever...", "during..."
- Create a clear, specific system prompt that defines the agent's role
- Break down the task into clear instructions
- Identify output sections based on what the user wants to see

Example input: "when I am having a book review club then I want a summary of the main plot points of the book and a synopsis of the characters and motivations"

Example output:
{
  "should_create_agent": true,
  "name": "Book Review Club Assistant",
  "description": "Provides book summaries with plot points, character synopses, and character motivations for book club discussions",
  "trigger_keywords": ["book review club", "book club", "book discussion"],
  "trigger_context": "When the user mentions having a book review club or book discussion session",
  "system_prompt": "You are a literary analysis assistant specializing in book reviews. Your role is to provide comprehensive yet concise summaries that facilitate book club discussions.",
  "instructions": "1. Identify the book being discussed\\n2. Summarize the main plot points without spoiling key twists\\n3. Create character profiles with their motivations\\n4. Highlight themes for discussion",
  "output_sections": ["Main Plot Points", "Character Synopsis", "Character Motivations", "Discussion Themes"],
  "output_format": "markdown"
}

Return only valid JSON, no other text."""

# System prompt for detecting if an agent should be triggered
AGENT_TRIGGER_DETECTION_PROMPT = """You are an AI that determines if a user's message should trigger a specific agent.

Given:
- The user's message
- An agent's trigger keywords and context description

Respond with JSON:
{
  "should_trigger": true/false,
  "confidence": 0.0-1.0,
  "reason": "Brief explanation"
}

Be conservative - only trigger if there's a clear match. Return only valid JSON."""


class AgentZeroService:
    """
    Service for managing Agent Zero agents.

    Provides CRUD operations for agents, natural language agent creation,
    trigger detection, and agent execution.
    """

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.agents_collection = db["agents"]
        self.invocations_collection = db["agent_invocations"]
        self._llm = get_llm_client()

    # =========================================================================
    # CRUD Operations
    # =========================================================================

    async def create_agent(self, data: AgentCreate, user_id: Optional[str] = None) -> Agent:
        """Create a new agent from structured data."""
        agent_id = str(uuid.uuid4())[:8]
        now = datetime.utcnow()

        agent = Agent(
            id=agent_id,
            name=data.name,
            description=data.description,
            trigger=data.trigger or AgentTrigger(),
            system_prompt=data.system_prompt or "",
            instructions=data.instructions or "",
            output=data.output or AgentOutput(),
            status=AgentStatus.ACTIVE,
            created_at=now,
            updated_at=now,
            created_by=user_id,
            tags=data.tags,
        )

        await self.agents_collection.insert_one(agent.model_dump())
        logger.info(f"Created agent: {agent.name} (id={agent_id})")
        return agent

    async def get_agent(self, agent_id: str) -> Optional[Agent]:
        """Get an agent by ID."""
        doc = await self.agents_collection.find_one({"id": agent_id})
        return Agent(**doc) if doc else None

    async def list_agents(
        self,
        status: Optional[AgentStatus] = None,
        user_id: Optional[str] = None,
    ) -> List[Agent]:
        """List all agents, optionally filtered by status or user."""
        query: Dict[str, Any] = {}
        if status:
            query["status"] = status.value if isinstance(status, AgentStatus) else status
        if user_id:
            query["created_by"] = user_id

        cursor = self.agents_collection.find(query).sort("created_at", -1)
        docs = await cursor.to_list(length=100)
        return [Agent(**doc) for doc in docs]

    async def update_agent(self, agent_id: str, data: AgentUpdate) -> Optional[Agent]:
        """Update an agent."""
        update_data = data.model_dump(exclude_unset=True)
        if not update_data:
            return await self.get_agent(agent_id)

        update_data["updated_at"] = datetime.utcnow()

        result = await self.agents_collection.update_one(
            {"id": agent_id},
            {"$set": update_data}
        )

        if result.modified_count == 0:
            return None

        return await self.get_agent(agent_id)

    async def delete_agent(self, agent_id: str) -> bool:
        """Delete an agent."""
        result = await self.agents_collection.delete_one({"id": agent_id})
        return result.deleted_count > 0

    # =========================================================================
    # Natural Language Agent Creation
    # =========================================================================

    async def create_agent_from_chat(
        self,
        user_request: str,
        conversation_context: Optional[List[Dict[str, str]]] = None,
        user_id: Optional[str] = None,
    ) -> Tuple[Optional[Agent], str]:
        """
        Create an agent from a natural language description.

        Returns:
            Tuple of (Agent if created, explanation message)
        """
        # Build messages for the LLM
        messages = [
            {"role": "system", "content": AGENT_CREATION_PARSER_PROMPT},
        ]

        # Add conversation context if provided
        if conversation_context:
            context_str = "\n".join(
                f"{m['role']}: {m['content']}" for m in conversation_context[-5:]
            )
            messages.append({
                "role": "user",
                "content": f"Previous conversation context:\n{context_str}\n\nUser's agent request:\n{user_request}"
            })
        else:
            messages.append({"role": "user", "content": user_request})

        try:
            # Get LLM response
            response = await self._llm.completion(
                messages=messages,
                temperature=0.3,  # Lower temperature for more consistent parsing
                max_tokens=1000,
            )

            content = response.choices[0].message.content.strip()

            # Parse JSON from response
            # Try to extract JSON if it's wrapped in markdown code blocks
            json_match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', content)
            if json_match:
                content = json_match.group(1)

            parsed = json.loads(content)

            if not parsed.get("should_create_agent", False):
                return None, "I didn't detect a request to create an agent. Could you describe what you'd like the agent to do?"

            # Create the agent
            agent_data = AgentCreate(
                name=parsed.get("name", "Unnamed Agent"),
                description=parsed.get("description", user_request[:200]),
                trigger=AgentTrigger(
                    type="keyword",
                    keywords=parsed.get("trigger_keywords", []),
                    context_description=parsed.get("trigger_context"),
                ),
                system_prompt=parsed.get("system_prompt", ""),
                instructions=parsed.get("instructions", ""),
                output=AgentOutput(
                    format=parsed.get("output_format", "markdown"),
                    sections=parsed.get("output_sections", []),
                ),
            )

            agent = await self.create_agent(agent_data, user_id)

            # Build confirmation message
            trigger_info = ""
            if agent.trigger.keywords:
                trigger_info = f" It will activate when you mention: {', '.join(agent.trigger.keywords)}."

            return agent, (
                f"I've created the **{agent.name}** agent for you.{trigger_info}\n\n"
                f"**What it does:** {agent.description}\n\n"
                f"**Output sections:** {', '.join(agent.output.sections) if agent.output.sections else 'Free-form response'}"
            )

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse agent creation response: {e}")
            return None, "I had trouble understanding your request. Could you describe the agent you want in more detail?"
        except Exception as e:
            logger.error(f"Error creating agent from chat: {e}")
            return None, f"Sorry, I encountered an error creating the agent: {str(e)}"

    # =========================================================================
    # Trigger Detection
    # =========================================================================

    async def detect_triggered_agents(
        self,
        user_message: str,
        conversation_context: Optional[List[Dict[str, str]]] = None,
    ) -> List[Tuple[Agent, float]]:
        """
        Detect which agents should be triggered by a user message.

        Returns:
            List of (Agent, confidence) tuples, sorted by confidence descending.
        """
        # Get all active agents
        agents = await self.list_agents(status=AgentStatus.ACTIVE)
        if not agents:
            return []

        triggered: List[Tuple[Agent, float]] = []

        # Check each agent
        for agent in agents:
            # First, quick keyword check
            message_lower = user_message.lower()
            keyword_match = any(
                kw.lower() in message_lower
                for kw in agent.trigger.keywords
            )

            if keyword_match:
                # Keyword match - high confidence
                triggered.append((agent, 0.9))
                continue

            # If no keyword match but agent has context description,
            # use LLM for semantic matching
            if agent.trigger.context_description:
                confidence = await self._check_context_trigger(
                    user_message,
                    agent,
                    conversation_context,
                )
                if confidence >= agent.trigger.threshold:
                    triggered.append((agent, confidence))

        # Sort by confidence
        triggered.sort(key=lambda x: x[1], reverse=True)
        return triggered

    async def _check_context_trigger(
        self,
        user_message: str,
        agent: Agent,
        conversation_context: Optional[List[Dict[str, str]]] = None,
    ) -> float:
        """Check if a message semantically matches an agent's trigger context."""
        messages = [
            {"role": "system", "content": AGENT_TRIGGER_DETECTION_PROMPT},
            {
                "role": "user",
                "content": f"""User message: "{user_message}"

Agent trigger keywords: {agent.trigger.keywords}
Agent trigger context: {agent.trigger.context_description}

Should this agent be triggered?"""
            }
        ]

        try:
            response = await self._llm.completion(
                messages=messages,
                temperature=0.1,
                max_tokens=200,
            )

            content = response.choices[0].message.content.strip()
            json_match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', content)
            if json_match:
                content = json_match.group(1)

            parsed = json.loads(content)
            if parsed.get("should_trigger", False):
                return parsed.get("confidence", 0.5)
            return 0.0

        except Exception as e:
            logger.warning(f"Error checking trigger context: {e}")
            return 0.0

    # =========================================================================
    # Agent Execution
    # =========================================================================

    async def execute_agent(
        self,
        agent_id: str,
        input_text: str,
        additional_context: Optional[Dict[str, Any]] = None,
        user_id: Optional[str] = None,
    ) -> Tuple[str, Optional[AgentInvocation]]:
        """
        Execute an agent with the given input.

        Returns:
            Tuple of (response text, invocation record)
        """
        agent = await self.get_agent(agent_id)
        if not agent:
            return "Agent not found.", None

        if agent.status != AgentStatus.ACTIVE:
            return f"Agent '{agent.name}' is not active.", None

        # Build the agent's prompt
        system_content = agent.system_prompt or f"You are an AI assistant named '{agent.name}'."

        if agent.instructions:
            system_content += f"\n\nInstructions:\n{agent.instructions}"

        if agent.output.sections:
            system_content += f"\n\nYour response should include the following sections: {', '.join(agent.output.sections)}"

        if agent.output.format == "json":
            system_content += "\n\nRespond with valid JSON."
        elif agent.output.format == "markdown":
            system_content += "\n\nUse markdown formatting in your response."

        messages = [
            {"role": "system", "content": system_content},
            {"role": "user", "content": input_text},
        ]

        # Add additional context if provided
        if additional_context:
            context_str = "\n".join(f"- {k}: {v}" for k, v in additional_context.items())
            messages[0]["content"] += f"\n\nAdditional context:\n{context_str}"

        try:
            response = await self._llm.completion(
                messages=messages,
                temperature=0.7,
                max_tokens=2000,
            )

            output = response.choices[0].message.content

            # Record the invocation
            invocation = AgentInvocation(
                id=str(uuid.uuid4())[:8],
                agent_id=agent_id,
                trigger_type="explicit",
                input_context=input_text[:500],
                output=output[:2000],
                user_id=user_id,
            )

            await self.invocations_collection.insert_one(invocation.model_dump())

            # Update agent usage stats
            await self.agents_collection.update_one(
                {"id": agent_id},
                {
                    "$set": {"last_used_at": datetime.utcnow()},
                    "$inc": {"use_count": 1}
                }
            )

            return output, invocation

        except Exception as e:
            logger.error(f"Error executing agent {agent_id}: {e}")
            return f"Error executing agent: {str(e)}", None

    # =========================================================================
    # Chat Integration
    # =========================================================================

    async def process_chat_message(
        self,
        user_message: str,
        conversation_context: Optional[List[Dict[str, str]]] = None,
        user_id: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Process a chat message to check for agent creation requests or triggers.

        Returns:
            Dict with 'type' ('agent_created' or 'agent_triggered') and relevant data,
            or None if no agent action needed.
        """
        message_lower = user_message.lower()

        # Check for agent creation intent
        creation_phrases = [
            "create an agent",
            "make an agent",
            "i want an agent",
            "when i am",
            "whenever i",
            "when i'm",
            "i want a",
            "create a helper",
            "make a helper",
            "add an agent",
        ]

        if any(phrase in message_lower for phrase in creation_phrases):
            agent, message = await self.create_agent_from_chat(
                user_message,
                conversation_context,
                user_id,
            )
            if agent:
                return {
                    "type": "agent_created",
                    "agent": agent.model_dump(),
                    "message": message,
                }
            else:
                return {
                    "type": "agent_creation_failed",
                    "message": message,
                }

        # Check for triggered agents
        triggered = await self.detect_triggered_agents(
            user_message,
            conversation_context,
        )

        if triggered:
            # Execute the highest confidence agent
            agent, confidence = triggered[0]
            output, invocation = await self.execute_agent(
                agent.id,
                user_message,
                user_id=user_id,
            )

            return {
                "type": "agent_triggered",
                "agent": agent.model_dump(),
                "confidence": confidence,
                "output": output,
                "invocation_id": invocation.id if invocation else None,
            }

        return None

    async def get_status(self) -> Dict[str, Any]:
        """Get Agent Zero service status."""
        agent_count = await self.agents_collection.count_documents({})
        active_count = await self.agents_collection.count_documents(
            {"status": AgentStatus.ACTIVE.value}
        )

        return {
            "connected": True,
            "agent_count": agent_count,
            "active_agents": active_count,
        }


# Global service instance
_agent_service: Optional[AgentZeroService] = None


async def init_agent_zero_service(db: AsyncIOMotorDatabase) -> AgentZeroService:
    """Initialize the Agent Zero service with database connection."""
    global _agent_service
    _agent_service = AgentZeroService(db)

    # Verify the service is working
    try:
        status = await _agent_service.get_status()
        logger.info(f"Agent Zero service initialized - {status.get('agent_count', 0)} agents, {status.get('active_agents', 0)} active")
    except Exception as e:
        logger.warning(f"Agent Zero service initialized but status check failed: {e}")

    return _agent_service


def get_agent_zero_service() -> Optional[AgentZeroService]:
    """Get the Agent Zero service instance."""
    return _agent_service
