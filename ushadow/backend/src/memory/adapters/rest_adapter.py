"""
REST API Memory Adapter

Implements HTTP-based integration with external services.
Supports various authentication methods and pagination patterns.
"""

import httpx
from typing import Dict, List, Any, Optional
from datetime import datetime
import logging

from .base import MemoryAdapter
from src.models.memory import MemoryCreate
from src.models.service import ServiceConfig, IntegrationType, AuthMethod

logger = logging.getLogger(__name__)


class RESTAdapter(MemoryAdapter):
    """Adapter for REST API-based memory sources."""
    
    def __init__(self, config: ServiceConfig, settings: Dict[str, Any]):
        super().__init__(config, settings)
        self.client: Optional[httpx.AsyncClient] = None
        self._init_client()
    
    def _init_client(self):
        """Initialize HTTP client with auth and timeout settings."""
        headers = self._get_auth_headers()
        timeout = httpx.Timeout(
            connect=self.config.connection.timeout,
            read=self.config.connection.timeout,
            write=self.config.connection.timeout,
            pool=self.config.connection.timeout
        )
        
        self.client = httpx.AsyncClient(
            base_url=self.config.connection.url,
            headers=headers,
            timeout=timeout,
            follow_redirects=True
        )
    
    def _get_auth_headers(self) -> Dict[str, str]:
        """Build authentication headers based on auth method."""
        headers = {}
        auth = self.config.connection.auth
        
        if not auth:
            return headers
        
        if auth.method == AuthMethod.BEARER:
            if auth.token:
                headers["Authorization"] = f"Bearer {auth.token}"
        
        elif auth.method == AuthMethod.API_KEY:
            if auth.api_key and auth.api_key_header:
                headers[auth.api_key_header] = auth.api_key
        
        elif auth.method == AuthMethod.BASIC:
            # httpx handles basic auth via auth parameter, not headers
            pass
        
        elif auth.method == AuthMethod.OAUTH2:
            # OAuth2 tokens typically use Bearer format
            if auth.token:
                headers["Authorization"] = f"Bearer {auth.token}"
        
        return headers
    
    async def test_connection(self) -> bool:
        """Test connection to the REST API."""
        if not self.client:
            self._init_client()

        try:
            # Try health endpoint if configured, otherwise try list endpoint
            test_url = (
                self.config.connection.health_endpoint
                if self.config.connection.health_endpoint
                else self.config.connection.list_endpoint
            )

            # Include query params from config (e.g., user_id for mem0)
            params = self.config.connection.query_params or {}

            response = await self.client.get(test_url, params=params)

            # Accept 2xx success codes
            # Also accept 404 for "user not found" (means API is working, just no data)
            if response.status_code in [200, 201, 204, 404]:
                logger.info(f"Connection test successful for {self.config.service_id}")
                return True

            response.raise_for_status()
            return True

        except httpx.HTTPError as e:
            logger.error(f"Connection test failed for {self.config.service_id}: {e}")
            return False
    
    async def fetch_items(
        self, 
        limit: Optional[int] = None,
        offset: Optional[int] = 0,
        filters: Optional[Dict[str, Any]] = None
    ) -> List[MemoryCreate]:
        """Fetch multiple items from the REST API."""
        if not self.client:
            self._init_client()
        
        items = []
        
        try:
            # Build query parameters
            params = self._build_query_params(limit, offset, filters)
            
            # Make request to list endpoint
            response = await self.client.get(
                self.config.connection.list_endpoint,
                params=params
            )
            response.raise_for_status()
            
            data = response.json()
            
            # Extract items from response (handle different response structures)
            raw_items = self._extract_items_from_response(data)
            
            # Transform each item to MemoryCreate
            for raw_item in raw_items:
                try:
                    memory = self.transform_to_memory(raw_item)
                    items.append(memory)
                except Exception as e:
                    logger.warning(
                        f"Failed to transform item from {self.config.service_id}: {e}",
                        extra={"raw_item": raw_item}
                    )
            
            logger.info(
                f"Fetched {len(items)} items from {self.config.service_id}"
            )
            
        except httpx.HTTPError as e:
            logger.error(
                f"Failed to fetch items from {self.config.service_id}: {e}"
            )
        
        return items
    
    async def fetch_item(self, item_id: str) -> Optional[MemoryCreate]:
        """Fetch a single item by ID from the REST API."""
        if not self.client:
            self._init_client()
        
        try:
            # Build detail endpoint URL
            detail_url = self.config.connection.detail_endpoint.format(id=item_id)
            
            response = await self.client.get(detail_url)
            response.raise_for_status()
            
            raw_item = response.json()
            
            # Extract item if wrapped in a response object
            if isinstance(raw_item, dict) and "data" in raw_item:
                raw_item = raw_item["data"]
            
            memory = self.transform_to_memory(raw_item)
            
            logger.info(
                f"Fetched item {item_id} from {self.config.service_id}"
            )
            
            return memory
            
        except httpx.HTTPError as e:
            logger.error(
                f"Failed to fetch item {item_id} from {self.config.service_id}: {e}"
            )
            return None
    
    def _build_query_params(
        self,
        limit: Optional[int],
        offset: Optional[int],
        filters: Optional[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Build query parameters for the API request."""
        params = {}
        
        # Add pagination parameters (common patterns)
        if limit is not None:
            params["limit"] = limit
            params["page_size"] = limit  # Alternative param name
        
        if offset is not None:
            params["offset"] = offset
            params["skip"] = offset  # Alternative param name
        
        # Add custom filters
        if filters:
            params.update(filters)
        
        # Add query parameters from config
        if self.config.connection.query_params:
            params.update(self.config.connection.query_params)
        
        return params
    
    def _extract_items_from_response(self, data: Any) -> List[Dict[str, Any]]:
        """
        Extract items array from API response.
        Handles common response patterns:
        - Direct array: [item1, item2, ...]
        - Wrapped: {"data": [item1, item2, ...]}
        - Paginated: {"results": [...], "page": 1, ...}
        """
        if isinstance(data, list):
            return data
        
        if isinstance(data, dict):
            # Try common wrapper keys
            for key in ["data", "results", "items", "content"]:
                if key in data and isinstance(data[key], list):
                    return data[key]
            
            # If single item wrapped in object
            if "id" in data or "_id" in data:
                return [data]
        
        logger.warning(
            f"Unexpected response structure from {self.config.service_id}",
            extra={"data": data}
        )
        return []
    
    async def close(self):
        """Close the HTTP client."""
        if self.client:
            await self.client.aclose()
            self.client = None
    
    def __del__(self):
        """Cleanup on deletion."""
        if self.client:
            # Note: Can't await in __del__, client should be closed explicitly
            logger.warning(
                f"REST adapter for {self.config.service_id} deleted without closing client"
            )
