"""
Tests for the Instance Manager.

Tests instance CRUD, wiring management, and config override detection.
"""

import pytest
from pathlib import Path
import tempfile
import shutil
from datetime import datetime, timezone

# Add src to path for imports
import sys
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from services.instance_manager import InstanceManager
from models.instance import (
    Instance,
    InstanceCreate,
    InstanceUpdate,
    InstanceConfig,
    InstanceStatus,
    WiringCreate,
)


@pytest.fixture
def temp_config_dir():
    """Create a temporary config directory for testing."""
    temp_dir = tempfile.mkdtemp()
    yield Path(temp_dir)
    shutil.rmtree(temp_dir)


@pytest.fixture
def instance_manager(temp_config_dir):
    """Create an instance manager with temp directory."""
    # Create empty config files
    instances_file = temp_config_dir / "instances.yaml"
    instances_file.write_text("instances: {}\n")
    
    wiring_file = temp_config_dir / "wiring.yaml"
    wiring_file.write_text("defaults: {}\nwiring: []\n")
    
    return InstanceManager(config_dir=temp_config_dir)


class TestInstanceCRUD:
    """Tests for instance create, read, update, delete operations."""

    def test_create_instance_basic(self, instance_manager):
        """Test creating a basic instance."""
        data = InstanceCreate(
            id="openai-1",
            template_id="openai",
            name="OpenAI Instance",
            deployment_target="cloud",
        )
        
        instance = instance_manager.create_instance(data)
        
        assert instance.id == "openai-1"
        assert instance.template_id == "openai"
        assert instance.name == "OpenAI Instance"
        assert instance.deployment_target == "cloud"
        assert instance.status == InstanceStatus.NOT_APPLICABLE  # cloud = n/a

    def test_create_instance_with_config(self, instance_manager):
        """Test creating an instance with config overrides."""
        data = InstanceCreate(
            id="openai-custom",
            template_id="openai",
            name="Custom OpenAI",
            deployment_target="cloud",
            config={"model": "gpt-4", "temperature": "0.7"},
        )
        
        instance = instance_manager.create_instance(data)
        
        assert instance.config.values == {"model": "gpt-4", "temperature": "0.7"}

    def test_create_instance_local_status(self, instance_manager):
        """Test that local instances get pending status."""
        data = InstanceCreate(
            id="ollama-1",
            template_id="ollama",
            name="Local Ollama",
            deployment_target="local",
        )
        
        instance = instance_manager.create_instance(data)
        
        assert instance.status == InstanceStatus.PENDING

    def test_create_instance_duplicate_raises(self, instance_manager):
        """Test that creating duplicate instance raises error."""
        data = InstanceCreate(
            id="test-instance",
            template_id="openai",
            name="Test",
            deployment_target="cloud",
        )
        
        instance_manager.create_instance(data)
        
        with pytest.raises(ValueError, match="already exists"):
            instance_manager.create_instance(data)

    def test_get_instance(self, instance_manager):
        """Test retrieving an instance by ID."""
        data = InstanceCreate(
            id="my-instance",
            template_id="openai",
            name="My Instance",
            deployment_target="cloud",
        )
        instance_manager.create_instance(data)
        
        instance = instance_manager.get_instance("my-instance")
        
        assert instance is not None
        assert instance.id == "my-instance"

    def test_get_instance_not_found(self, instance_manager):
        """Test retrieving non-existent instance returns None."""
        instance = instance_manager.get_instance("nonexistent")
        assert instance is None

    def test_list_instances_empty(self, instance_manager):
        """Test listing when no instances exist."""
        instances = instance_manager.list_instances()
        assert instances == []

    def test_list_instances(self, instance_manager):
        """Test listing multiple instances."""
        for i in range(3):
            data = InstanceCreate(
                id=f"instance-{i}",
                template_id="openai",
                name=f"Instance {i}",
                deployment_target="cloud",
            )
            instance_manager.create_instance(data)
        
        instances = instance_manager.list_instances()
        
        assert len(instances) == 3
        ids = [i.id for i in instances]
        assert "instance-0" in ids
        assert "instance-1" in ids
        assert "instance-2" in ids

    def test_update_instance_name(self, instance_manager):
        """Test updating instance name."""
        data = InstanceCreate(
            id="test-update",
            template_id="openai",
            name="Original Name",
            deployment_target="cloud",
        )
        instance_manager.create_instance(data)
        
        update = InstanceUpdate(name="Updated Name")
        updated = instance_manager.update_instance("test-update", update)
        
        assert updated.name == "Updated Name"

    def test_update_instance_config(self, instance_manager):
        """Test updating instance config."""
        data = InstanceCreate(
            id="test-config",
            template_id="openai",
            name="Config Test",
            deployment_target="cloud",
            config={"model": "gpt-3.5"},
        )
        instance_manager.create_instance(data)
        
        update = InstanceUpdate(config={"model": "gpt-4"})
        updated = instance_manager.update_instance("test-config", update)
        
        assert updated.config.values == {"model": "gpt-4"}

    def test_update_instance_not_found(self, instance_manager):
        """Test updating non-existent instance raises error."""
        update = InstanceUpdate(name="New Name")
        
        with pytest.raises(ValueError, match="not found"):
            instance_manager.update_instance("nonexistent", update)

    def test_delete_instance(self, instance_manager):
        """Test deleting an instance."""
        data = InstanceCreate(
            id="to-delete",
            template_id="openai",
            name="Delete Me",
            deployment_target="cloud",
        )
        instance_manager.create_instance(data)
        
        result = instance_manager.delete_instance("to-delete")
        
        assert result is True
        assert instance_manager.get_instance("to-delete") is None

    def test_delete_instance_not_found(self, instance_manager):
        """Test deleting non-existent instance returns False."""
        result = instance_manager.delete_instance("nonexistent")
        assert result is False


class TestConfigOverrides:
    """Tests for config override detection using OmegaConf."""

    def test_get_config_overrides_empty(self, instance_manager):
        """Test getting overrides when config is empty."""
        data = InstanceCreate(
            id="no-config",
            template_id="openai",
            name="No Config",
            deployment_target="cloud",
        )
        instance_manager.create_instance(data)
        
        overrides = instance_manager.get_config_overrides("no-config")
        
        assert overrides == {}

    def test_get_config_overrides_with_values(self, instance_manager):
        """Test getting overrides returns direct values."""
        data = InstanceCreate(
            id="with-config",
            template_id="openai",
            name="With Config",
            deployment_target="cloud",
            config={"model": "gpt-4", "temperature": "0.5"},
        )
        instance_manager.create_instance(data)
        
        overrides = instance_manager.get_config_overrides("with-config")
        
        assert overrides == {"model": "gpt-4", "temperature": "0.5"}

    def test_get_config_overrides_not_found(self, instance_manager):
        """Test getting overrides for non-existent instance."""
        overrides = instance_manager.get_config_overrides("nonexistent")
        assert overrides == {}


class TestWiringCRUD:
    """Tests for wiring create, read, delete operations."""

    def test_create_wiring(self, instance_manager):
        """Test creating a wiring connection."""
        # Create source and target instances first
        instance_manager.create_instance(InstanceCreate(
            id="openai-1",
            template_id="openai",
            name="OpenAI",
            deployment_target="cloud",
        ))
        
        data = WiringCreate(
            source_instance_id="openai-1",
            source_capability="llm",
            target_instance_id="chronicle",
            target_capability="llm",
        )
        
        wiring = instance_manager.create_wiring(data)
        
        assert wiring.source_instance_id == "openai-1"
        assert wiring.source_capability == "llm"
        assert wiring.target_instance_id == "chronicle"
        assert wiring.id is not None

    def test_create_wiring_generates_id(self, instance_manager):
        """Test that wiring ID is auto-generated."""
        instance_manager.create_instance(InstanceCreate(
            id="source",
            template_id="openai",
            name="Source",
            deployment_target="cloud",
        ))
        
        data = WiringCreate(
            source_instance_id="source",
            source_capability="llm",
            target_instance_id="target",
            target_capability="llm",
        )
        
        wiring = instance_manager.create_wiring(data)
        
        assert len(wiring.id) == 8  # Short UUID

    def test_list_wiring_empty(self, instance_manager):
        """Test listing when no wiring exists."""
        wiring_list = instance_manager.list_wiring()
        assert wiring_list == []

    def test_list_wiring(self, instance_manager):
        """Test listing multiple wiring connections."""
        instance_manager.create_instance(InstanceCreate(
            id="provider",
            template_id="openai",
            name="Provider",
            deployment_target="cloud",
        ))
        
        for i in range(2):
            instance_manager.create_wiring(WiringCreate(
                source_instance_id="provider",
                source_capability="llm",
                target_instance_id=f"consumer-{i}",
                target_capability="llm",
            ))
        
        wiring_list = instance_manager.list_wiring()
        
        assert len(wiring_list) == 2

    def test_get_wiring_for_instance(self, instance_manager):
        """Test getting wiring for a specific instance (as target)."""
        instance_manager.create_instance(InstanceCreate(
            id="provider",
            template_id="openai",
            name="Provider",
            deployment_target="cloud",
        ))
        
        # Create wiring where consumer-1 is the target
        instance_manager.create_wiring(WiringCreate(
            source_instance_id="provider",
            source_capability="llm",
            target_instance_id="consumer-1",
            target_capability="llm",
        ))
        instance_manager.create_wiring(WiringCreate(
            source_instance_id="other-provider",
            source_capability="llm",
            target_instance_id="consumer-2",
            target_capability="llm",
        ))
        
        # get_wiring_for_instance returns wiring where instance is TARGET
        wiring = instance_manager.get_wiring_for_instance("consumer-1")
        
        assert len(wiring) == 1
        assert wiring[0].target_instance_id == "consumer-1"

    def test_delete_wiring(self, instance_manager):
        """Test deleting a wiring connection."""
        instance_manager.create_instance(InstanceCreate(
            id="provider",
            template_id="openai",
            name="Provider",
            deployment_target="cloud",
        ))
        
        wiring = instance_manager.create_wiring(WiringCreate(
            source_instance_id="provider",
            source_capability="llm",
            target_instance_id="consumer",
            target_capability="llm",
        ))
        
        result = instance_manager.delete_wiring(wiring.id)
        
        assert result is True
        assert len(instance_manager.list_wiring()) == 0

    def test_delete_wiring_not_found(self, instance_manager):
        """Test deleting non-existent wiring returns False."""
        result = instance_manager.delete_wiring("nonexistent")
        assert result is False


class TestDefaults:
    """Tests for default capability mappings."""

    def test_get_defaults_empty(self, instance_manager):
        """Test getting defaults when none set."""
        defaults = instance_manager.get_defaults()
        assert defaults == {}

    def test_set_default(self, instance_manager):
        """Test setting a default for a capability."""
        instance_manager.create_instance(InstanceCreate(
            id="openai-default",
            template_id="openai",
            name="Default OpenAI",
            deployment_target="cloud",
        ))
        
        instance_manager.set_default("llm", "openai-default")
        
        defaults = instance_manager.get_defaults()
        assert defaults["llm"] == "openai-default"

    def test_set_default_overwrites(self, instance_manager):
        """Test that setting default overwrites previous."""
        instance_manager.create_instance(InstanceCreate(
            id="first",
            template_id="openai",
            name="First",
            deployment_target="cloud",
        ))
        instance_manager.create_instance(InstanceCreate(
            id="second",
            template_id="openai",
            name="Second",
            deployment_target="cloud",
        ))
        
        instance_manager.set_default("llm", "first")
        instance_manager.set_default("llm", "second")
        
        defaults = instance_manager.get_defaults()
        assert defaults["llm"] == "second"


class TestPersistence:
    """Tests for config file persistence."""

    def test_instances_persist_to_file(self, temp_config_dir):
        """Test that instances are saved to YAML file."""
        # Create empty files
        (temp_config_dir / "instances.yaml").write_text("instances: {}\n")
        (temp_config_dir / "wiring.yaml").write_text("defaults: {}\nwiring: []\n")
        
        manager = InstanceManager(config_dir=temp_config_dir)
        manager.create_instance(InstanceCreate(
            id="persistent",
            template_id="openai",
            name="Persistent Instance",
            deployment_target="cloud",
        ))
        
        # Create new manager to load from file
        manager2 = InstanceManager(config_dir=temp_config_dir)
        instance = manager2.get_instance("persistent")
        
        assert instance is not None
        assert instance.name == "Persistent Instance"

    def test_wiring_persists_to_file(self, temp_config_dir):
        """Test that wiring is saved to YAML file."""
        (temp_config_dir / "instances.yaml").write_text("instances: {}\n")
        (temp_config_dir / "wiring.yaml").write_text("defaults: {}\nwiring: []\n")
        
        manager = InstanceManager(config_dir=temp_config_dir)
        manager.create_instance(InstanceCreate(
            id="provider",
            template_id="openai",
            name="Provider",
            deployment_target="cloud",
        ))
        manager.create_wiring(WiringCreate(
            source_instance_id="provider",
            source_capability="llm",
            target_instance_id="consumer",
            target_capability="llm",
        ))
        
        # Create new manager to load from file
        manager2 = InstanceManager(config_dir=temp_config_dir)
        wiring = manager2.list_wiring()
        
        assert len(wiring) == 1
        assert wiring[0].source_instance_id == "provider"

    def test_defaults_persist_to_file(self, temp_config_dir):
        """Test that defaults are saved to YAML file."""
        (temp_config_dir / "instances.yaml").write_text("instances: {}\n")
        (temp_config_dir / "wiring.yaml").write_text("defaults: {}\nwiring: []\n")
        
        manager = InstanceManager(config_dir=temp_config_dir)
        manager.create_instance(InstanceCreate(
            id="default-provider",
            template_id="openai",
            name="Default Provider",
            deployment_target="cloud",
        ))
        manager.set_default("llm", "default-provider")
        
        # Create new manager to load from file
        manager2 = InstanceManager(config_dir=temp_config_dir)
        defaults = manager2.get_defaults()
        
        assert defaults["llm"] == "default-provider"


class TestEdgeCases:
    """Tests for edge cases and error handling."""

    def test_delete_instance_cleans_up_wiring(self, instance_manager):
        """Test that deleting instance removes associated wiring."""
        instance_manager.create_instance(InstanceCreate(
            id="provider",
            template_id="openai",
            name="Provider",
            deployment_target="cloud",
        ))
        instance_manager.create_wiring(WiringCreate(
            source_instance_id="provider",
            source_capability="llm",
            target_instance_id="consumer",
            target_capability="llm",
        ))
        
        # Delete the provider - wiring should be cleaned up
        instance_manager.delete_instance("provider")
        
        # Wiring should be removed (cleaned up, not orphaned)
        wiring = instance_manager.list_wiring()
        assert len(wiring) == 0

    def test_empty_config_not_stored(self, instance_manager):
        """Test that empty config dict is handled correctly."""
        data = InstanceCreate(
            id="empty-config",
            template_id="openai",
            name="Empty Config",
            deployment_target="cloud",
            config={},
        )
        
        instance = instance_manager.create_instance(data)
        
        assert instance.config.values == {}
        overrides = instance_manager.get_config_overrides("empty-config")
        assert overrides == {}


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
