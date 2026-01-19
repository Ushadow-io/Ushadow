"""
Example memory source implementations.

These demonstrate how to create custom memory sources that the LLM can query via tool calling.
"""

from .documentation_source import DocumentationSource
from .openmemory_source import OpenMemorySource
from .notion_source import NotionSource
from .mcp_source import MCPSource

__all__ = [
    "DocumentationSource",
    "OpenMemorySource",
    "NotionSource",
    "MCPSource",
]
