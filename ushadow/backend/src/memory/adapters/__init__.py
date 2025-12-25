"""Memory adapters for external service integration."""

from .base import MemoryAdapter
from .rest_adapter import RESTAdapter
from .factory import AdapterFactory

__all__ = [
    "MemoryAdapter",
    "RESTAdapter",
    "AdapterFactory",
]
