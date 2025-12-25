"""
Memory Adapter Factory

Creates appropriate adapter instances based on service configuration.
"""

from typing import Dict, Any
import logging

from .base import MemoryAdapter
from .rest_adapter import RESTAdapter
from src.models.service import ServiceConfig, IntegrationType

logger = logging.getLogger(__name__)


class AdapterFactory:
    """Factory for creating memory adapters based on integration type."""
    
    # Registry of integration types to adapter classes
    _adapters = {
        IntegrationType.REST: RESTAdapter,
        # Future adapters:
        # IntegrationType.MCP: MCPAdapter,
        # IntegrationType.GRAPHQL: GraphQLAdapter,
        # IntegrationType.WEBSOCKET: WebSocketAdapter,
    }
    
    @classmethod
    def create_adapter(
        cls,
        config: ServiceConfig,
        settings: Dict[str, Any]
    ) -> MemoryAdapter:
        """
        Create an adapter instance based on service configuration.
        
        Args:
            config: Service configuration
            settings: Global settings dictionary
            
        Returns:
            MemoryAdapter instance
            
        Raises:
            ValueError: If integration type is not supported
        """
        adapter_class = cls._adapters.get(config.integration_type)
        
        if not adapter_class:
            raise ValueError(
                f"Unsupported integration type: {config.integration_type}. "
                f"Supported types: {list(cls._adapters.keys())}"
            )
        
        logger.info(
            f"Creating {adapter_class.__name__} for service {config.service_id}"
        )
        
        return adapter_class(config, settings)
    
    @classmethod
    def register_adapter(
        cls,
        integration_type: IntegrationType,
        adapter_class: type
    ):
        """
        Register a custom adapter class.
        
        Allows plugins to add new integration types.
        
        Args:
            integration_type: Type of integration
            adapter_class: Adapter class to register
        """
        if not issubclass(adapter_class, MemoryAdapter):
            raise TypeError(
                f"Adapter class must inherit from MemoryAdapter, "
                f"got {adapter_class}"
            )
        
        cls._adapters[integration_type] = adapter_class
        logger.info(
            f"Registered adapter {adapter_class.__name__} "
            f"for type {integration_type}"
        )
    
    @classmethod
    def get_supported_types(cls) -> list:
        """Get list of supported integration types."""
        return list(cls._adapters.keys())
