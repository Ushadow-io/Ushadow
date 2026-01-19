"""
Tool calling orchestration for LLM function calls.

Handles the multi-turn interaction loop when the LLM needs to call tools:
1. Send messages with available tools to LLM
2. If LLM responds with tool calls, execute them
3. Append tool results to message history
4. Send back to LLM and repeat until final response
"""

import json
import logging
from typing import Any, Dict, List, Optional

from src.services.llm_client import get_llm_client
from src.memory.sources import get_memory_source_registry

logger = logging.getLogger(__name__)


class ToolCallingOrchestrator:
    """
    Orchestrates multi-turn tool calling conversations with LLMs.

    Handles the loop:
    - LLM requests tool calls
    - Tools are executed
    - Results are sent back to LLM
    - Repeat until LLM provides final response
    """

    def __init__(self, max_iterations: int = 10):
        """
        Args:
            max_iterations: Maximum number of tool calling rounds to prevent infinite loops
        """
        self.max_iterations = max_iterations
        self.llm = get_llm_client()
        self.registry = get_memory_source_registry()

    async def run_with_tools(
        self,
        messages: List[Dict[str, Any]],
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Run a completion with tool calling support.

        This method handles the full tool calling loop:
        1. Get available tools from memory source registry
        2. Send to LLM with messages
        3. If LLM wants to call tools, execute them
        4. Add tool results to messages and repeat
        5. Return final response when LLM is done

        Args:
            messages: Conversation history
            temperature: Optional temperature override
            max_tokens: Optional max tokens override

        Returns:
            Final LLM response with:
            - content: Final text response
            - tool_calls_made: List of tools that were called
            - iterations: Number of tool calling rounds
        """
        # Get available tool definitions
        tools = self.registry.get_tool_definitions()

        if not tools:
            logger.debug("No memory source tools available, running without tools")
            # Fall back to regular completion
            response = await self.llm.completion(
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
            )
            return {
                "content": response.choices[0].message.content,
                "tool_calls_made": [],
                "iterations": 0,
            }

        logger.info(f"Running completion with {len(tools)} available tools")

        # Track tool calls made
        tool_calls_made = []

        # Clone messages to avoid modifying the original
        working_messages = messages.copy()

        for iteration in range(self.max_iterations):
            logger.debug(f"Tool calling iteration {iteration + 1}/{self.max_iterations}")

            # Call LLM with tools
            response = await self.llm.completion(
                messages=working_messages,
                temperature=temperature,
                max_tokens=max_tokens,
                tools=tools,
                tool_choice="auto",  # Let LLM decide when to use tools
            )

            message = response.choices[0].message
            finish_reason = response.choices[0].finish_reason

            # Check if LLM wants to call tools
            if finish_reason == "tool_calls" and message.tool_calls:
                logger.info(f"LLM requested {len(message.tool_calls)} tool call(s)")

                # Add assistant message with tool calls to history
                working_messages.append({
                    "role": "assistant",
                    "content": message.content or "",
                    "tool_calls": [
                        {
                            "id": tc.id,
                            "type": "function",
                            "function": {
                                "name": tc.function.name,
                                "arguments": tc.function.arguments,
                            }
                        }
                        for tc in message.tool_calls
                    ]
                })

                # Execute each tool call
                for tool_call in message.tool_calls:
                    function_name = tool_call.function.name
                    tool_call_id = tool_call.id

                    try:
                        # Parse arguments
                        arguments = json.loads(tool_call.function.arguments)

                        logger.info(f"Executing tool: {function_name} with args: {arguments}")

                        # Execute via registry
                        result = await self.registry.execute_tool_call(
                            function_name=function_name,
                            tool_call_id=tool_call_id,
                            arguments=arguments,
                        )

                        # Track this call
                        tool_calls_made.append({
                            "function": function_name,
                            "arguments": arguments,
                            "result_preview": result[:200] if len(result) > 200 else result,
                        })

                        # Add tool result to messages
                        working_messages.append({
                            "role": "tool",
                            "tool_call_id": tool_call_id,
                            "name": function_name,
                            "content": result,
                        })

                        logger.debug(f"Tool {function_name} executed successfully")

                    except Exception as e:
                        error_msg = f"Error executing {function_name}: {str(e)}"
                        logger.error(error_msg)

                        # Send error back to LLM
                        working_messages.append({
                            "role": "tool",
                            "tool_call_id": tool_call_id,
                            "name": function_name,
                            "content": error_msg,
                        })

                # Continue loop to let LLM process tool results
                continue

            # No more tool calls, return final response
            logger.info(f"Tool calling complete after {iteration + 1} iteration(s)")
            return {
                "content": message.content,
                "tool_calls_made": tool_calls_made,
                "iterations": iteration + 1,
                "finish_reason": finish_reason,
            }

        # Hit max iterations
        logger.warning(f"Max tool calling iterations ({self.max_iterations}) reached")
        return {
            "content": "Error: Maximum tool calling iterations reached. Please try a simpler query.",
            "tool_calls_made": tool_calls_made,
            "iterations": self.max_iterations,
            "finish_reason": "max_iterations",
        }
