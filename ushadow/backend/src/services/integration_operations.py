"""
Integration Operations Service

Handles integration-specific operations like connection testing, syncing, and state management.
This service works with the ServiceConfigManager for CRUD operations and adds integration-specific logic.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, Tuple, Optional

from src.models.service_config import ServiceConfig
from src.models.integration import IntegrationConfig, ConnectionConfig, AuthConfig, AuthMethod
from src.memory.adapters.base import MemoryAdapter
from src.memory.adapters.factory import AdapterFactory
from .service_config_manager import ServiceConfigManager, get_service_config_manager

logger = logging.getLogger(__name__)


class IntegrationOperations:
    """
    Operations specific to integration instances.

    Provides integration-specific functionality on top of the base instance system:
    - Connection testing
    - Data syncing (manual and automatic)
    - State tracking
    """

    def __init__(self, instance_manager: Optional[ServiceConfigManager] = None):
        """
        Initialize integration operations.

        Args:
            instance_manager: ServiceConfig manager (defaults to singleton)
        """
        self.instance_manager = instance_manager or get_service_config_manager()

    async def test_connection(self, config_id: str) -> Tuple[bool, str]:
        """
        Test connection to an integration.

        Args:
            config_id: ID of the integration instance

        Returns:
            Tuple of (success: bool, message: str)
        """
        instance = self.instance_manager.get_service_config(config_id)
        if not instance:
            return False, f"ServiceConfig '{config_id}' not found"

        if not instance.integration_type:
            return False, f"ServiceConfig '{config_id}' is not an integration"

        try:
            # Create adapter for this integration
            adapter = await self._create_adapter(instance)

            # Test connection
            success = await adapter.test_connection()

            if success:
                logger.info(f"Connection test successful for integration '{config_id}'")
                return True, "Connection successful"
            else:
                logger.warning(f"Connection test failed for integration '{config_id}'")
                return False, "Connection failed"

        except Exception as e:
            logger.error(f"Connection test error for '{config_id}': {e}")
            return False, f"Connection error: {str(e)}"

    async def sync_now(self, config_id: str) -> Dict[str, Any]:
        """
        Trigger immediate sync for an integration.

        Args:
            config_id: ID of the integration instance

        Returns:
            Dict with sync results: {
                "success": bool,
                "items_synced": int,
                "last_sync_at": str (ISO datetime),
                "error": str (if failed)
            }
        """
        instance = self.instance_manager.get_service_config(config_id)
        if not instance:
            return {"success": False, "error": f"ServiceConfig '{config_id}' not found"}

        if not instance.integration_type:
            return {"success": False, "error": f"ServiceConfig '{config_id}' is not an integration"}

        # Update status to syncing
        instance.last_sync_status = "in_progress"
        self.instance_manager._save_service_configs()

        try:
            logger.info(f"Starting sync for integration '{config_id}'")

            # Create adapter and fetch items
            adapter = await self._create_adapter(instance)
            memories = await adapter.fetch_items()

            # TODO: Store in memory system (when MemoryService is implemented)
            # For now, just count the items
            # from src.services.memory_service import get_memory_service
            # memory_service = get_memory_service()
            # for memory in memories:
            #     await memory_service.create_or_update(memory)

            saved_count = len(memories)

            # Update sync status
            now = datetime.now(timezone.utc)
            instance.last_sync_at = now
            instance.last_sync_status = "success"
            instance.last_sync_items_count = saved_count
            instance.last_sync_error = None

            # Calculate next sync time if auto-sync is enabled
            if instance.sync_enabled and instance.sync_interval:
                instance.next_sync_at = now + timedelta(seconds=instance.sync_interval)

            self.instance_manager._save_service_configs()

            logger.info(f"Sync completed for '{config_id}': {saved_count} items")

            return {
                "success": True,
                "items_synced": saved_count,
                "last_sync_at": now.isoformat()
            }

        except Exception as e:
            logger.error(f"Sync failed for '{config_id}': {e}")

            # Update error status
            instance.last_sync_status = "error"
            instance.last_sync_error = str(e)
            self.instance_manager._save_service_configs()

            return {
                "success": False,
                "error": str(e)
            }

    async def enable_auto_sync(self, config_id: str) -> Tuple[bool, str]:
        """
        Enable automatic syncing for an integration.

        Args:
            config_id: ID of the integration instance

        Returns:
            Tuple of (success: bool, message: str)
        """
        instance = self.instance_manager.get_service_config(config_id)
        if not instance:
            return False, f"ServiceConfig '{config_id}' not found"

        if not instance.integration_type:
            return False, f"ServiceConfig '{config_id}' is not an integration"

        if not instance.sync_interval:
            return False, "Sync interval not configured. Set sync_interval first."

        instance.sync_enabled = True

        # Calculate next sync time
        if instance.last_sync_at:
            instance.next_sync_at = instance.last_sync_at + timedelta(seconds=instance.sync_interval)
        else:
            # Never synced, schedule for now + interval
            instance.next_sync_at = datetime.now(timezone.utc) + timedelta(seconds=instance.sync_interval)

        self.instance_manager._save_service_configs()

        logger.info(f"Auto-sync enabled for '{config_id}', interval: {instance.sync_interval}s")
        return True, "Auto-sync enabled"

    async def disable_auto_sync(self, config_id: str) -> Tuple[bool, str]:
        """
        Disable automatic syncing for an integration.

        Args:
            config_id: ID of the integration instance

        Returns:
            Tuple of (success: bool, message: str)
        """
        instance = self.instance_manager.get_service_config(config_id)
        if not instance:
            return False, f"ServiceConfig '{config_id}' not found"

        if not instance.integration_type:
            return False, f"ServiceConfig '{config_id}' is not an integration"

        instance.sync_enabled = False
        instance.next_sync_at = None
        self.instance_manager._save_service_configs()

        logger.info(f"Auto-sync disabled for '{config_id}'")
        return True, "Auto-sync disabled"

    def get_sync_status(self, config_id: str) -> Dict[str, Any]:
        """
        Get current sync status for an integration.

        Args:
            config_id: ID of the integration instance

        Returns:
            Dict with sync status information
        """
        instance = self.instance_manager.get_service_config(config_id)
        if not instance:
            return {"error": f"ServiceConfig '{config_id}' not found"}

        if not instance.integration_type:
            return {"error": f"ServiceConfig '{config_id}' is not an integration"}

        return {
            "integration_id": instance.id,
            "integration_type": instance.integration_type,
            "sync_enabled": instance.sync_enabled,
            "sync_interval": instance.sync_interval,
            "last_sync_at": instance.last_sync_at.isoformat() if instance.last_sync_at else None,
            "last_sync_status": instance.last_sync_status or "never",
            "last_sync_items_count": instance.last_sync_items_count,
            "last_sync_error": instance.last_sync_error,
            "next_sync_at": instance.next_sync_at.isoformat() if instance.next_sync_at else None,
        }

    async def _create_adapter(self, instance: ServiceConfig) -> MemoryAdapter:
        """
        Create appropriate memory adapter for an integration instance.

        Args:
            instance: Integration instance

        Returns:
            MemoryAdapter instance
        """
        # Build IntegrationConfig from instance
        # For now, create a minimal config - will be expanded as needed
        config = IntegrationConfig(
            integration_id=instance.id,
            name=instance.name,
            template=instance.template_id,
            mode=instance.deployment_target or "local",
            integration_type=instance.integration_type,
            config_overrides=instance.config.values,
            # Connection will be built from config values
            connection_url=instance.config.values.get('vault_path') or instance.config.values.get('url'),
        )

        # TODO: Build full ConnectionConfig from instance config
        # This will depend on the integration template's connection requirements

        # Get global settings (for API keys, etc.)
        # TODO: Integrate with SettingsStore when needed
        settings = {}

        # Create adapter via factory
        adapter = AdapterFactory.create_adapter(config, settings)
        return adapter


# Singleton pattern
_integration_operations: Optional[IntegrationOperations] = None


def get_integration_operations() -> IntegrationOperations:
    """Get the singleton IntegrationOperations instance."""
    global _integration_operations
    if _integration_operations is None:
        _integration_operations = IntegrationOperations()
    return _integration_operations
