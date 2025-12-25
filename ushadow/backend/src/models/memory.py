"""
Memory Models

Models for memory/knowledge items synced from external sources.
"""

from typing import Dict, List, Any, Optional
from datetime import datetime
from pydantic import BaseModel, Field


class MemoryCreate(BaseModel):
    """Model for creating a new memory item."""
    title: str
    content: str
    tags: List[str] = []
    source: str  # Service ID that provided this memory
    source_id: str  # External ID from the source service
    metadata: Dict[str, Any] = {}
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    
    class Config:
        json_schema_extra = {
            "example": {
                "title": "Python async/await patterns",
                "content": "async def fetch_data():\n    ...",
                "tags": ["python", "async", "code"],
                "source": "pieces-app",
                "source_id": "abc-123-def",
                "metadata": {
                    "language": "python",
                    "file_type": "snippet",
                    "original_filename": "async_utils.py"
                }
            }
        }


class Memory(MemoryCreate):
    """Complete memory model with ID."""
    id: str
    synced_at: datetime
    
    class Config:
        from_attributes = True
