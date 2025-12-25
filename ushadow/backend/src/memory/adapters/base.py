"""
Base Memory Adapter

Abstract base class for memory source adapters.
Provides common transformation logic for mapping external data to memory format.
"""

from abc import ABC, abstractmethod
from typing import Dict, List, Any, Optional
from datetime import datetime
import logging
import json

from src.models.memory import MemoryCreate
from src.models.service import ServiceConfig, FieldMapping, TransformType

logger = logging.getLogger(__name__)


class MemoryAdapter(ABC):
    """Abstract base class for memory adapters."""
    
    def __init__(self, config: ServiceConfig, settings: Dict[str, Any]):
        """
        Initialize adapter.
        
        Args:
            config: Service configuration
            settings: Global settings dictionary
        """
        self.config = config
        self.settings = settings
    
    @abstractmethod
    async def test_connection(self) -> bool:
        """
        Test connection to the external service.
        
        Returns:
            True if connection successful
        """
        pass
    
    @abstractmethod
    async def fetch_items(
        self,
        limit: Optional[int] = None,
        offset: Optional[int] = 0,
        filters: Optional[Dict[str, Any]] = None
    ) -> List[MemoryCreate]:
        """
        Fetch multiple items from the external service.
        
        Args:
            limit: Maximum number of items to fetch
            offset: Number of items to skip
            filters: Additional filters to apply
            
        Returns:
            List of MemoryCreate objects
        """
        pass
    
    @abstractmethod
    async def fetch_item(self, item_id: str) -> Optional[MemoryCreate]:
        """
        Fetch a single item by ID.
        
        Args:
            item_id: External item ID
            
        Returns:
            MemoryCreate object or None if not found
        """
        pass
    
    def transform_to_memory(self, raw_item: Dict[str, Any]) -> MemoryCreate:
        """
        Transform external item to MemoryCreate using field mappings.
        
        Args:
            raw_item: Raw data from external service
            
        Returns:
            MemoryCreate object
        """
        if not self.config.memory_mapping:
            raise ValueError(f"No memory mapping configured for {self.config.service_id}")
        
        # Start with empty memory data
        memory_data = {
            "source": self.config.service_id,
            "source_id": str(raw_item.get("id", raw_item.get("_id", "unknown"))),
            "tags": [],
            "metadata": {}
        }
        
        # Apply field mappings
        mapped_fields = set()
        for field_mapping in self.config.memory_mapping.field_mappings:
            value = self._get_nested_value(raw_item, field_mapping.source_field)
            
            if value is None and field_mapping.default_value is not None:
                value = field_mapping.default_value
            
            if value is not None:
                # Apply transformation if specified
                if field_mapping.transform:
                    value = self._apply_transform(value, field_mapping.transform)
                
                memory_data[field_mapping.target_field] = value
                mapped_fields.add(field_mapping.source_field)
        
        # Add unmapped fields to metadata if configured
        if self.config.memory_mapping.include_unmapped:
            for key, value in raw_item.items():
                if key not in mapped_fields and key not in ['id', '_id']:
                    memory_data["metadata"][key] = value
        
        # Ensure required fields have defaults
        if "title" not in memory_data:
            memory_data["title"] = memory_data.get("source_id", "Untitled")
        
        if "content" not in memory_data:
            memory_data["content"] = json.dumps(raw_item, indent=2)
        
        return MemoryCreate(**memory_data)
    
    def _get_nested_value(self, data: Dict[str, Any], field_path: str) -> Any:
        """
        Get a nested value from a dictionary using dot notation.
        
        Example: 'user.profile.name' accesses data['user']['profile']['name']
        
        Args:
            data: Source dictionary
            field_path: Dot-notation path to the field
            
        Returns:
            Field value or None if not found
        """
        keys = field_path.split(".")
        current = data
        
        for key in keys:
            if isinstance(current, dict) and key in current:
                current = current[key]
            else:
                return None
        
        return current
    
    def _apply_transform(self, value: Any, transform: TransformType) -> Any:
        """
        Apply a transformation to a value.
        
        Args:
            value: Value to transform
            transform: Type of transformation
            
        Returns:
            Transformed value
        """
        if value is None:
            return None
        
        try:
            if transform == TransformType.LOWERCASE:
                return str(value).lower()
            
            elif transform == TransformType.UPPERCASE:
                return str(value).upper()
            
            elif transform == TransformType.TRIM:
                return str(value).strip()
            
            elif transform == TransformType.JSON_PARSE:
                if isinstance(value, str):
                    return json.loads(value)
                return value
            
            elif transform == TransformType.SPLIT:
                # Split on common delimiters
                if isinstance(value, str):
                    # Try comma, semicolon, pipe
                    for delimiter in [',', ';', '|']:
                        if delimiter in value:
                            return [item.strip() for item in value.split(delimiter)]
                    # If no delimiter found, return as single-item list
                    return [value.strip()]
                elif isinstance(value, list):
                    return value
                return [str(value)]
            
            elif transform == TransformType.DATE_FORMAT:
                # Attempt to parse and format date
                if isinstance(value, str):
                    try:
                        dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
                        return dt.isoformat()
                    except:
                        return value
                return value
            
            else:
                logger.warning(f"Unknown transform type: {transform}")
                return value
                
        except Exception as e:
            logger.warning(f"Error applying transform {transform} to value {value}: {e}")
            return value
