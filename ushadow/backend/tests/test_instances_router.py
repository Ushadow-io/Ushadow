"""
Tests for the Instances Router API endpoints.

Tests the endpoint functions directly, bypassing HTTP transport for cleaner unit tests.
This approach tests the business logic of each endpoint without complex dependency injection.

Tests cover:
- Instance CRUD operations
- Deploy/undeploy operations
- Wiring CRUD operations
- Default capability mappings
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import HTTPException

# Add src to path for imports
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from models.instance import (
    Instance,
    InstanceConfig,
    InstanceCreate,
    InstanceSummary,
    InstanceStatus,
    InstanceUpdate,
    Wiring,
    WiringCreate,
)


# =============================================================================
# Test Fixtures
# =============================================================================

@pytest.fixture
def mock_current_user():
    """Mock authenticated user."""
    return MagicMock(id="test-user", email="test@example.com")


@pytest.fixture
def mock_instance_manager():
    """Create a mock instance manager."""
    manager = MagicMock()

    # Default return values
    manager.list_instances.return_value = []
    manager.get_instance.return_value = None
    manager.list_wiring.return_value = []
    manager.get_defaults.return_value = {}
    manager.get_config_overrides.return_value = {}
    manager.get_wiring_for_instance.return_value = []
    manager.deploy_instance = AsyncMock(return_value=(True, "Success"))
    manager.undeploy_instance = AsyncMock(return_value=(True, "Success"))

    return manager


@pytest.fixture
def sample_instance():
    """Create a sample instance for testing."""
    return Instance(
        id="test-instance",
        template_id="openai",
        name="Test Instance",
        deployment_target="cloud",
        status=InstanceStatus.NOT_APPLICABLE,
        config=InstanceConfig(values={}),
    )


@pytest.fixture
def sample_wiring():
    """Create a sample wiring for testing."""
    return Wiring(
        id="wiring-1",
        source_instance_id="openai-1",
        source_capability="llm",
        target_instance_id="chronicle",
        target_capability="llm",
    )


# =============================================================================
# Instance Endpoint Tests
# =============================================================================

class TestListInstances:
    """Tests for list_instances endpoint."""

    @pytest.mark.asyncio
    async def test_list_instances_empty(self, mock_instance_manager, mock_current_user):
        """Test listing when no instances exist."""
        mock_instance_manager.list_instances.return_value = []

        with patch("src.routers.instances.get_instance_manager", return_value=mock_instance_manager):
            from src.routers.instances import list_instances
            result = await list_instances(current_user=mock_current_user)

        assert result == []

    @pytest.mark.asyncio
    async def test_list_instances_returns_summaries(self, mock_instance_manager, mock_current_user):
        """Test listing returns instance summaries."""
        summaries = [
            InstanceSummary(
                id="instance-1",
                template_id="openai",
                name="Instance 1",
                deployment_target="cloud",
                status=InstanceStatus.NOT_APPLICABLE,
            ),
            InstanceSummary(
                id="instance-2",
                template_id="ollama",
                name="Instance 2",
                deployment_target="local",
                status=InstanceStatus.RUNNING,
            ),
        ]
        mock_instance_manager.list_instances.return_value = summaries

        with patch("src.routers.instances.get_instance_manager", return_value=mock_instance_manager):
            from src.routers.instances import list_instances
            result = await list_instances(current_user=mock_current_user)

        assert len(result) == 2
        assert result[0].id == "instance-1"
        assert result[1].id == "instance-2"


class TestGetInstance:
    """Tests for get_instance endpoint."""

    @pytest.mark.asyncio
    async def test_get_instance_found(self, mock_instance_manager, mock_current_user, sample_instance):
        """Test retrieving an existing instance."""
        mock_instance_manager.get_instance.return_value = sample_instance
        mock_instance_manager.get_config_overrides.return_value = {}

        with patch("src.routers.instances.get_instance_manager", return_value=mock_instance_manager):
            from src.routers.instances import get_instance
            result = await get_instance(instance_id="test-instance", current_user=mock_current_user)

        assert result.id == "test-instance"
        assert result.template_id == "openai"

    @pytest.mark.asyncio
    async def test_get_instance_not_found(self, mock_instance_manager, mock_current_user):
        """Test retrieving non-existent instance raises 404."""
        mock_instance_manager.get_instance.return_value = None

        with patch("src.routers.instances.get_instance_manager", return_value=mock_instance_manager):
            from src.routers.instances import get_instance
            with pytest.raises(HTTPException) as exc_info:
                await get_instance(instance_id="nonexistent", current_user=mock_current_user)

        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_get_instance_with_overrides(self, mock_instance_manager, mock_current_user, sample_instance):
        """Test that config overrides are applied to result."""
        mock_instance_manager.get_instance.return_value = sample_instance
        mock_instance_manager.get_config_overrides.return_value = {"model": "gpt-4"}

        with patch("src.routers.instances.get_instance_manager", return_value=mock_instance_manager):
            from src.routers.instances import get_instance
            result = await get_instance(instance_id="test-instance", current_user=mock_current_user)

        assert result.config.values == {"model": "gpt-4"}


class TestCreateInstance:
    """Tests for create_instance endpoint."""

    @pytest.mark.asyncio
    async def test_create_instance_success(self, mock_instance_manager, mock_current_user, sample_instance):
        """Test creating a new instance."""
        mock_instance_manager.create_instance.return_value = sample_instance
        data = InstanceCreate(
            id="test-instance",
            template_id="openai",
            name="Test Instance",
            deployment_target="cloud",
        )

        with patch("src.routers.instances.get_instance_manager", return_value=mock_instance_manager):
            from src.routers.instances import create_instance
            result = await create_instance(data=data, current_user=mock_current_user)

        assert result.id == "test-instance"

    @pytest.mark.asyncio
    async def test_create_instance_duplicate_raises(self, mock_instance_manager, mock_current_user):
        """Test creating duplicate instance raises 400."""
        mock_instance_manager.create_instance.side_effect = ValueError("Instance already exists")
        data = InstanceCreate(
            id="existing",
            template_id="openai",
            name="Duplicate",
            deployment_target="cloud",
        )

        with patch("src.routers.instances.get_instance_manager", return_value=mock_instance_manager):
            from src.routers.instances import create_instance
            with pytest.raises(HTTPException) as exc_info:
                await create_instance(data=data, current_user=mock_current_user)

        assert exc_info.value.status_code == 400


class TestUpdateInstance:
    """Tests for update_instance endpoint."""

    @pytest.mark.asyncio
    async def test_update_instance_name(self, mock_instance_manager, mock_current_user, sample_instance):
        """Test updating instance name."""
        updated = Instance(
            id="test-instance",
            template_id="openai",
            name="Updated Name",
            deployment_target="cloud",
            status=InstanceStatus.NOT_APPLICABLE,
            config=InstanceConfig(values={}),
        )
        mock_instance_manager.get_instance.return_value = sample_instance
        mock_instance_manager.update_instance.return_value = updated
        data = InstanceUpdate(name="Updated Name")

        with patch("src.routers.instances.get_instance_manager", return_value=mock_instance_manager):
            from src.routers.instances import update_instance
            result = await update_instance(
                instance_id="test-instance", data=data, current_user=mock_current_user
            )

        assert result.name == "Updated Name"

    @pytest.mark.asyncio
    async def test_update_instance_not_found(self, mock_instance_manager, mock_current_user):
        """Test updating non-existent instance raises 404."""
        mock_instance_manager.update_instance.side_effect = ValueError("Instance not found")
        data = InstanceUpdate(name="New Name")

        with patch("src.routers.instances.get_instance_manager", return_value=mock_instance_manager):
            from src.routers.instances import update_instance
            with pytest.raises(HTTPException) as exc_info:
                await update_instance(
                    instance_id="nonexistent", data=data, current_user=mock_current_user
                )

        assert exc_info.value.status_code == 404


class TestDeleteInstance:
    """Tests for delete_instance endpoint."""

    @pytest.mark.asyncio
    async def test_delete_instance_success(self, mock_instance_manager, mock_current_user):
        """Test deleting an instance."""
        mock_instance_manager.delete_instance.return_value = True

        with patch("src.routers.instances.get_instance_manager", return_value=mock_instance_manager):
            from src.routers.instances import delete_instance
            result = await delete_instance(instance_id="test-instance", current_user=mock_current_user)

        assert result["success"] is True

    @pytest.mark.asyncio
    async def test_delete_instance_not_found(self, mock_instance_manager, mock_current_user):
        """Test deleting non-existent instance raises 404."""
        mock_instance_manager.delete_instance.return_value = False

        with patch("src.routers.instances.get_instance_manager", return_value=mock_instance_manager):
            from src.routers.instances import delete_instance
            with pytest.raises(HTTPException) as exc_info:
                await delete_instance(instance_id="nonexistent", current_user=mock_current_user)

        assert exc_info.value.status_code == 404


# =============================================================================
# Deploy/Undeploy Endpoint Tests
# =============================================================================

class TestDeployInstance:
    """Tests for deploy_instance endpoint."""

    @pytest.mark.asyncio
    async def test_deploy_instance_success(self, mock_instance_manager, mock_current_user):
        """Test deploying an instance."""
        mock_instance_manager.deploy_instance = AsyncMock(
            return_value=(True, "Instance deployed successfully")
        )

        with patch("src.routers.instances.get_instance_manager", return_value=mock_instance_manager):
            from src.routers.instances import deploy_instance
            result = await deploy_instance(instance_id="test-instance", current_user=mock_current_user)

        assert result["success"] is True

    @pytest.mark.asyncio
    async def test_deploy_instance_failure(self, mock_instance_manager, mock_current_user):
        """Test deploy failure raises 400."""
        mock_instance_manager.deploy_instance = AsyncMock(
            return_value=(False, "Failed to deploy: container error")
        )

        with patch("src.routers.instances.get_instance_manager", return_value=mock_instance_manager):
            from src.routers.instances import deploy_instance
            with pytest.raises(HTTPException) as exc_info:
                await deploy_instance(instance_id="test-instance", current_user=mock_current_user)

        assert exc_info.value.status_code == 400


class TestUndeployInstance:
    """Tests for undeploy_instance endpoint."""

    @pytest.mark.asyncio
    async def test_undeploy_instance_success(self, mock_instance_manager, mock_current_user):
        """Test undeploying an instance."""
        mock_instance_manager.undeploy_instance = AsyncMock(
            return_value=(True, "Instance stopped successfully")
        )

        with patch("src.routers.instances.get_instance_manager", return_value=mock_instance_manager):
            from src.routers.instances import undeploy_instance
            result = await undeploy_instance(instance_id="test-instance", current_user=mock_current_user)

        assert result["success"] is True

    @pytest.mark.asyncio
    async def test_undeploy_instance_failure(self, mock_instance_manager, mock_current_user):
        """Test undeploy failure raises 400."""
        mock_instance_manager.undeploy_instance = AsyncMock(
            return_value=(False, "Instance not running")
        )

        with patch("src.routers.instances.get_instance_manager", return_value=mock_instance_manager):
            from src.routers.instances import undeploy_instance
            with pytest.raises(HTTPException) as exc_info:
                await undeploy_instance(instance_id="test-instance", current_user=mock_current_user)

        assert exc_info.value.status_code == 400


# =============================================================================
# Wiring Endpoint Tests
# =============================================================================

class TestListWiring:
    """Tests for list_wiring endpoint."""

    @pytest.mark.asyncio
    async def test_list_wiring_empty(self, mock_instance_manager, mock_current_user):
        """Test listing when no wiring exists."""
        mock_instance_manager.list_wiring.return_value = []

        with patch("src.routers.instances.get_instance_manager", return_value=mock_instance_manager):
            from src.routers.instances import list_wiring
            result = await list_wiring(current_user=mock_current_user)

        assert result == []

    @pytest.mark.asyncio
    async def test_list_wiring_returns_connections(self, mock_instance_manager, mock_current_user, sample_wiring):
        """Test listing returns wiring connections."""
        mock_instance_manager.list_wiring.return_value = [sample_wiring]

        with patch("src.routers.instances.get_instance_manager", return_value=mock_instance_manager):
            from src.routers.instances import list_wiring
            result = await list_wiring(current_user=mock_current_user)

        assert len(result) == 1
        assert result[0].source_instance_id == "openai-1"


class TestGetDefaults:
    """Tests for get_defaults endpoint."""

    @pytest.mark.asyncio
    async def test_get_defaults_empty(self, mock_instance_manager, mock_current_user):
        """Test getting defaults when none set."""
        mock_instance_manager.get_defaults.return_value = {}

        with patch("src.routers.instances.get_instance_manager", return_value=mock_instance_manager):
            from src.routers.instances import get_defaults
            result = await get_defaults(current_user=mock_current_user)

        assert result == {}

    @pytest.mark.asyncio
    async def test_get_defaults_returns_mappings(self, mock_instance_manager, mock_current_user):
        """Test getting default capability mappings."""
        mock_instance_manager.get_defaults.return_value = {
            "llm": "openai-1",
            "embedding": "openai-embed",
        }

        with patch("src.routers.instances.get_instance_manager", return_value=mock_instance_manager):
            from src.routers.instances import get_defaults
            result = await get_defaults(current_user=mock_current_user)

        assert result["llm"] == "openai-1"
        assert result["embedding"] == "openai-embed"


class TestSetDefault:
    """Tests for set_default endpoint."""

    @pytest.mark.asyncio
    async def test_set_default_success(self, mock_instance_manager, mock_current_user):
        """Test setting a default for a capability."""
        mock_instance_manager.set_default.return_value = None

        with patch("src.routers.instances.get_instance_manager", return_value=mock_instance_manager):
            from src.routers.instances import set_default
            result = await set_default(
                capability="llm", instance_id="openai-1", current_user=mock_current_user
            )

        assert result["success"] is True
        assert result["capability"] == "llm"

    @pytest.mark.asyncio
    async def test_set_default_invalid_instance(self, mock_instance_manager, mock_current_user):
        """Test setting default with invalid instance raises 400."""
        mock_instance_manager.set_default.side_effect = ValueError("Instance not found")

        with patch("src.routers.instances.get_instance_manager", return_value=mock_instance_manager):
            from src.routers.instances import set_default
            with pytest.raises(HTTPException) as exc_info:
                await set_default(
                    capability="llm", instance_id="nonexistent", current_user=mock_current_user
                )

        assert exc_info.value.status_code == 400


class TestCreateWiring:
    """Tests for create_wiring endpoint."""

    @pytest.mark.asyncio
    async def test_create_wiring_success(self, mock_instance_manager, mock_current_user, sample_wiring):
        """Test creating a wiring connection."""
        mock_instance_manager.create_wiring.return_value = sample_wiring
        data = WiringCreate(
            source_instance_id="openai-1",
            source_capability="llm",
            target_instance_id="chronicle",
            target_capability="llm",
        )

        with patch("src.routers.instances.get_instance_manager", return_value=mock_instance_manager):
            from src.routers.instances import create_wiring
            result = await create_wiring(data=data, current_user=mock_current_user)

        assert result.source_instance_id == "openai-1"
        assert result.id is not None

    @pytest.mark.asyncio
    async def test_create_wiring_invalid(self, mock_instance_manager, mock_current_user):
        """Test creating invalid wiring raises 400."""
        mock_instance_manager.create_wiring.side_effect = ValueError("Source instance not found")
        data = WiringCreate(
            source_instance_id="nonexistent",
            source_capability="llm",
            target_instance_id="chronicle",
            target_capability="llm",
        )

        with patch("src.routers.instances.get_instance_manager", return_value=mock_instance_manager):
            from src.routers.instances import create_wiring
            with pytest.raises(HTTPException) as exc_info:
                await create_wiring(data=data, current_user=mock_current_user)

        assert exc_info.value.status_code == 400


class TestDeleteWiring:
    """Tests for delete_wiring endpoint."""

    @pytest.mark.asyncio
    async def test_delete_wiring_success(self, mock_instance_manager, mock_current_user):
        """Test deleting a wiring connection."""
        mock_instance_manager.delete_wiring.return_value = True

        with patch("src.routers.instances.get_instance_manager", return_value=mock_instance_manager):
            from src.routers.instances import delete_wiring
            result = await delete_wiring(wiring_id="wiring-1", current_user=mock_current_user)

        assert result["success"] is True

    @pytest.mark.asyncio
    async def test_delete_wiring_not_found(self, mock_instance_manager, mock_current_user):
        """Test deleting non-existent wiring raises 404."""
        mock_instance_manager.delete_wiring.return_value = False

        with patch("src.routers.instances.get_instance_manager", return_value=mock_instance_manager):
            from src.routers.instances import delete_wiring
            with pytest.raises(HTTPException) as exc_info:
                await delete_wiring(wiring_id="nonexistent", current_user=mock_current_user)

        assert exc_info.value.status_code == 404


class TestGetInstanceWiring:
    """Tests for get_instance_wiring endpoint."""

    @pytest.mark.asyncio
    async def test_get_instance_wiring_found(
        self, mock_instance_manager, mock_current_user, sample_instance, sample_wiring
    ):
        """Test getting wiring for an instance."""
        mock_instance_manager.get_instance.return_value = sample_instance
        mock_instance_manager.get_wiring_for_instance.return_value = [sample_wiring]

        with patch("src.routers.instances.get_instance_manager", return_value=mock_instance_manager):
            from src.routers.instances import get_instance_wiring
            result = await get_instance_wiring(
                instance_id="test-instance", current_user=mock_current_user
            )

        assert len(result) == 1

    @pytest.mark.asyncio
    async def test_get_instance_wiring_instance_not_found(self, mock_instance_manager, mock_current_user):
        """Test getting wiring for non-existent instance raises 404."""
        mock_instance_manager.get_instance.return_value = None

        with patch("src.routers.instances.get_instance_manager", return_value=mock_instance_manager):
            from src.routers.instances import get_instance_wiring
            with pytest.raises(HTTPException) as exc_info:
                await get_instance_wiring(instance_id="nonexistent", current_user=mock_current_user)

        assert exc_info.value.status_code == 404


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
