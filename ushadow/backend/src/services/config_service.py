"""
Configuration Service
Manages ushadow configuration stored in MongoDB
"""

import logging
from typing import Dict, Any

from motor.motor_asyncio import AsyncIOMotorClient

from src.config.settings import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class ConfigService:
    """Service for managing configuration in MongoDB."""

    def __init__(self):
        self.client = None
        self.db = None
        self.collection = None

    async def get_collection(self):
        """Get or create MongoDB collection."""
        if self.collection is None:
            self.client = AsyncIOMotorClient(settings.MONGODB_URI)
            self.db = self.client[settings.MONGODB_DATABASE]
            self.collection = self.db["configuration"]
        return self.collection

    async def load_config(self) -> Dict[str, Any]:
        """Load configuration from MongoDB."""
        try:
            collection = await self.get_collection()
            config = await collection.find_one({"_id": "ushadow_config"})
            if config:
                # Remove MongoDB _id field
                config.pop("_id", None)
                return config
            return {}
        except Exception as e:
            logger.error(f"Error loading config: {e}")
            return {}

    async def save_config(self, config: Dict[str, Any]) -> None:
        """Save configuration to MongoDB."""
        try:
            collection = await self.get_collection()
            await collection.update_one(
                {"_id": "ushadow_config"},
                {"$set": config},
                upsert=True
            )
            logger.info("Configuration saved successfully")
        except Exception as e:
            logger.error(f"Error saving config: {e}")
            raise

    async def get_value(self, key: str, default: Any = None) -> Any:
        """Get a single configuration value."""
        config = await self.load_config()
        return config.get(key, default)

    async def set_value(self, key: str, value: Any) -> None:
        """Set a single configuration value."""
        config = await self.load_config()
        config[key] = value
        await self.save_config(config)
