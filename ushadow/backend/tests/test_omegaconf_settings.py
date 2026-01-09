"""
Tests for the OmegaConf settings manager.
"""

import pytest
from pathlib import Path
import tempfile
import shutil
import asyncio

# Add src to path for imports
import sys
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from config.omegaconf_settings import (
    SettingsStore,
    get_settings_store,
    # Backward compatibility aliases (tested separately)
    OmegaConfSettingsManager,
    get_omegaconf_settings,
    # Helpers
    SettingSuggestion,
    infer_setting_type,
    categorize_setting,
    mask_secret_value,
    env_var_matches_setting,
)
from omegaconf import OmegaConf


@pytest.fixture
def temp_config_dir():
    """Create a temporary config directory for testing."""
    temp_dir = tempfile.mkdtemp()
    yield Path(temp_dir)
    shutil.rmtree(temp_dir)


@pytest.fixture
def settings_manager(temp_config_dir):
    """Create a settings store with temp directory."""
    return SettingsStore(config_dir=temp_config_dir)


class TestSettingsStore:
    """Tests for SettingsStore class."""

    @pytest.mark.asyncio
    async def test_init_paths(self, temp_config_dir):
        """Test that paths are initialized correctly."""
        manager = SettingsStore(config_dir=temp_config_dir)

        assert manager.config_dir == temp_config_dir
        assert manager.defaults_path == temp_config_dir / "config.defaults.yaml"
        assert manager.secrets_path == temp_config_dir / "secrets.yaml"
        assert manager.overrides_path == temp_config_dir / "config.overrides.yaml"

    @pytest.mark.asyncio
    async def test_load_empty_config(self, settings_manager):
        """Test loading when no config files exist."""
        config = await settings_manager.load_config()

        assert config is not None
        # Should be empty DictConfig
        assert len(OmegaConf.to_container(config)) == 0

    @pytest.mark.asyncio
    async def test_load_defaults(self, temp_config_dir, settings_manager):
        """Test loading from defaults file."""
        # Create defaults file
        defaults = temp_config_dir / "config.defaults.yaml"
        defaults.write_text("""
app:
  name: ushadow
  version: "1.0.0"
features:
  debug: false
  logging: true
""")

        config = await settings_manager.load_config(use_cache=False)

        assert OmegaConf.select(config, "app.name") == "ushadow"
        assert OmegaConf.select(config, "app.version") == "1.0.0"
        assert OmegaConf.select(config, "features.debug") is False
        assert OmegaConf.select(config, "features.logging") is True

    @pytest.mark.asyncio
    async def test_load_secrets(self, temp_config_dir, settings_manager):
        """Test loading from secrets file."""
        secrets = temp_config_dir / "secrets.yaml"
        secrets.write_text("""
api_keys:
  openai_api_key: "sk-test-12345"
  anthropic_api_key: "sk-ant-12345"
security:
  auth_secret_key: "super-secret-key"
""")

        config = await settings_manager.load_config(use_cache=False)

        assert OmegaConf.select(config, "api_keys.openai_api_key") == "sk-test-12345"
        assert OmegaConf.select(config, "security.auth_secret_key") == "super-secret-key"

    @pytest.mark.asyncio
    async def test_load_merges_in_order(self, temp_config_dir, settings_manager):
        """Test that configs merge in correct order (later overrides earlier)."""
        # Create defaults
        defaults = temp_config_dir / "config.defaults.yaml"
        defaults.write_text("""
app:
  name: ushadow
  environment: development
feature:
  enabled: false
""")

        # Create secrets (should override)
        secrets = temp_config_dir / "secrets.yaml"
        secrets.write_text("""
app:
  environment: staging
api_keys:
  openai: "secret-key"
""")

        # Create config.overrides (should override secrets)
        overrides = temp_config_dir / "config.overrides.yaml"
        overrides.write_text("""
app:
  environment: production
feature:
  enabled: true
""")

        config = await settings_manager.load_config(use_cache=False)

        # app.name from defaults (not overridden)
        assert OmegaConf.select(config, "app.name") == "ushadow"
        # app.environment from overrides (overrides secrets and defaults)
        assert OmegaConf.select(config, "app.environment") == "production"
        # feature.enabled from overrides
        assert OmegaConf.select(config, "feature.enabled") is True
        # api_keys from secrets
        assert OmegaConf.select(config, "api_keys.openai") == "secret-key"

    @pytest.mark.asyncio
    async def test_get_value(self, temp_config_dir, settings_manager):
        """Test getting a single value."""
        defaults = temp_config_dir / "config.defaults.yaml"
        defaults.write_text("""
database:
  host: localhost
  port: 5432
""")

        value = await settings_manager.get("database.host")
        assert value == "localhost"

        value = await settings_manager.get("database.port")
        assert value == 5432

    @pytest.mark.asyncio
    async def test_get_value_with_default(self, settings_manager):
        """Test getting a missing value with default."""
        value = await settings_manager.get("nonexistent.key", default="fallback")
        assert value == "fallback"

    @pytest.mark.asyncio
    async def test_get_value_missing_no_default(self, settings_manager):
        """Test getting a missing value returns None."""
        value = await settings_manager.get("nonexistent.key")
        assert value is None

    @pytest.mark.asyncio
    async def test_update_creates_settings_file(self, temp_config_dir, settings_manager):
        """Test that update creates appropriate config files."""
        assert not settings_manager.overrides_path.exists()
        assert not settings_manager.secrets_path.exists()

        # Non-secret goes to config.overrides.yaml
        await settings_manager.update({"database.host": "localhost"})
        assert settings_manager.overrides_path.exists()

        # Secret goes to secrets.yaml
        await settings_manager.update({"api_keys.openai": "new-key"})
        assert settings_manager.secrets_path.exists()

    @pytest.mark.asyncio
    async def test_update_with_dot_notation(self, temp_config_dir, settings_manager):
        """Test updating with dot notation keys."""
        await settings_manager.update({
            "api_keys.openai_api_key": "sk-new-key",
            "database.host": "newhost",
        })

        # Read back
        config = await settings_manager.load_config(use_cache=False)

        assert OmegaConf.select(config, "api_keys.openai_api_key") == "sk-new-key"
        assert OmegaConf.select(config, "database.host") == "newhost"

    @pytest.mark.asyncio
    async def test_update_with_nested_dict(self, temp_config_dir, settings_manager):
        """Test updating with nested dictionary."""
        await settings_manager.update({
            "api_keys": {
                "openai": "openai-key",
                "anthropic": "anthropic-key",
            }
        })

        config = await settings_manager.load_config(use_cache=False)

        assert OmegaConf.select(config, "api_keys.openai") == "openai-key"
        assert OmegaConf.select(config, "api_keys.anthropic") == "anthropic-key"

    @pytest.mark.asyncio
    async def test_update_preserves_existing(self, temp_config_dir, settings_manager):
        """Test that update preserves existing overrides."""
        # First update
        await settings_manager.update({"key1": "value1"})

        # Second update
        await settings_manager.update({"key2": "value2"})

        config = await settings_manager.load_config(use_cache=False)

        assert OmegaConf.select(config, "key1") == "value1"
        assert OmegaConf.select(config, "key2") == "value2"

    @pytest.mark.asyncio
    async def test_update_invalidates_cache(self, temp_config_dir, settings_manager):
        """Test that update invalidates cache."""
        # Load to populate cache
        await settings_manager.load_config()
        assert settings_manager._cache is not None

        # Update should invalidate cache
        await settings_manager.update({"key": "value"})
        assert settings_manager._cache is None

    @pytest.mark.asyncio
    async def test_cache_ttl(self, temp_config_dir, settings_manager):
        """Test that cache respects TTL."""
        import time

        defaults = temp_config_dir / "config.defaults.yaml"
        defaults.write_text("key: value1")

        # First load
        config1 = await settings_manager.load_config()
        assert OmegaConf.select(config1, "key") == "value1"

        # Modify file
        defaults.write_text("key: value2")

        # Load again immediately - should use cache
        settings_manager.cache_ttl = 5  # 5 seconds
        config2 = await settings_manager.load_config()
        assert OmegaConf.select(config2, "key") == "value1"  # Still cached

        # Force no cache
        config3 = await settings_manager.load_config(use_cache=False)
        assert OmegaConf.select(config3, "key") == "value2"  # Fresh load

    @pytest.mark.asyncio
    async def test_load_handles_invalid_yaml(self, temp_config_dir, settings_manager):
        """Test that invalid YAML files are handled gracefully."""
        defaults = temp_config_dir / "config.defaults.yaml"
        defaults.write_text("""
invalid: yaml: content:
  - this is not valid
""")

        # Should not raise, just log warning
        config = await settings_manager.load_config(use_cache=False)
        # Config should be empty due to parse error
        assert config is not None

    @pytest.mark.asyncio
    async def test_reset_deletes_all_files(self, temp_config_dir, settings_manager):
        """Test that reset() deletes both overrides and secrets files."""
        # Create both files
        await settings_manager.update({"some_setting": "value"})
        await settings_manager.update({"api_keys.test": "secret-key"})
        assert settings_manager.overrides_path.exists()
        assert settings_manager.secrets_path.exists()

        # Reset should delete both
        deleted = await settings_manager.reset(include_secrets=True)
        assert deleted == 2
        assert not settings_manager.overrides_path.exists()
        assert not settings_manager.secrets_path.exists()

    @pytest.mark.asyncio
    async def test_reset_preserves_secrets_when_requested(self, temp_config_dir, settings_manager):
        """Test that reset(include_secrets=False) preserves secrets."""
        await settings_manager.update({"some_setting": "value"})
        await settings_manager.update({"api_keys.test": "secret-key"})

        deleted = await settings_manager.reset(include_secrets=False)
        assert deleted == 1
        assert not settings_manager.overrides_path.exists()
        assert settings_manager.secrets_path.exists()  # Preserved

    @pytest.mark.asyncio
    async def test_reset_returns_zero_when_no_files(self, settings_manager):
        """Test that reset() returns 0 when no files exist."""
        assert not settings_manager.overrides_path.exists()
        deleted = await settings_manager.reset()
        assert deleted == 0

    def test_filter_masked_values_removes_masked(self, settings_manager):
        """Test that _filter_masked_values removes masked values."""
        updates = {
            "api_keys": {
                "openai": "****abcd",  # masked - should be removed
                "anthropic": "sk-real-key",  # not masked - should remain
            },
            "other": "value",
        }
        filtered = settings_manager._filter_masked_values(updates)
        
        assert "api_keys" in filtered
        assert "openai" not in filtered["api_keys"]
        assert filtered["api_keys"]["anthropic"] == "sk-real-key"
        assert filtered["other"] == "value"

    def test_filter_masked_values_empty_result(self, settings_manager):
        """Test that _filter_masked_values returns empty dict when all masked."""
        updates = {"api_key": "****1234"}
        filtered = settings_manager._filter_masked_values(updates)
        assert filtered == {}


class TestOmegaConfInterpolation:
    """Tests for OmegaConf interpolation features."""

    @pytest.mark.asyncio
    async def test_variable_interpolation(self, temp_config_dir):
        """Test OmegaConf variable interpolation."""
        manager = SettingsStore(config_dir=temp_config_dir)

        defaults = temp_config_dir / "config.defaults.yaml"
        defaults.write_text("""
base_url: "http://localhost"
api:
  url: "${base_url}/api"
  health: "${base_url}/health"
""")

        config = await manager.load_config(use_cache=False)

        # Interpolation should resolve
        assert OmegaConf.select(config, "api.url") == "http://localhost/api"
        assert OmegaConf.select(config, "api.health") == "http://localhost/health"

    @pytest.mark.asyncio
    async def test_cross_file_interpolation(self, temp_config_dir):
        """Test interpolation across merged files."""
        manager = SettingsStore(config_dir=temp_config_dir)

        # Define base URL in defaults
        defaults = temp_config_dir / "config.defaults.yaml"
        defaults.write_text("""
services:
  chronicle:
    url: "${api_keys.chronicle_url}"
""")

        # Define the referenced value in secrets
        secrets = temp_config_dir / "secrets.yaml"
        secrets.write_text("""
api_keys:
  chronicle_url: "http://chronicle:8000"
""")

        config = await manager.load_config(use_cache=False)

        # Should resolve from secrets
        assert OmegaConf.select(config, "services.chronicle.url") == "http://chronicle:8000"


class TestGetSettingsStore:
    """Tests for get_settings_store() singleton."""

    def test_returns_store_instance(self):
        """Function returns SettingsStore instance."""
        # Reset global
        import config.omegaconf_settings as module
        module._settings_store = None

        store = get_settings_store()
        assert isinstance(store, SettingsStore)

    def test_returns_singleton(self):
        """Function returns same instance on multiple calls."""
        import config.omegaconf_settings as module
        module._settings_store = None

        store1 = get_settings_store()
        store2 = get_settings_store()

        assert store1 is store2

    def test_backward_compat_aliases(self):
        """Backward compatibility aliases work correctly."""
        import config.omegaconf_settings as module
        module._settings_store = None

        # Old names should still work
        manager = get_omegaconf_settings()
        assert isinstance(manager, OmegaConfSettingsManager)
        assert OmegaConfSettingsManager is SettingsStore


class TestServiceDefaults:
    """Tests for service defaults in config.defaults.yaml."""

    @pytest.mark.asyncio
    async def test_loads_service_defaults_from_config(self, temp_config_dir):
        """Test loading service defaults from config.defaults.yaml."""
        manager = SettingsStore(config_dir=temp_config_dir)

        # Service defaults are now in config.defaults.yaml (not a separate file)
        defaults = temp_config_dir / "config.defaults.yaml"
        defaults.write_text("""
default_services:
  - chronicle
  - openmemory
selected_providers:
  llm: openai
service_preferences:
  chronicle:
    provider: openai
""")

        config = await manager.load_config(use_cache=False)

        services = OmegaConf.select(config, "default_services")
        assert "chronicle" in services
        assert "openmemory" in services

        provider = OmegaConf.select(config, "selected_providers.llm")
        assert provider == "openai"


class TestHelperFunctions:
    """Tests for helper functions."""

    def test_infer_setting_type_secret(self):
        """Test inferring secret type from name."""
        assert infer_setting_type("OPENAI_API_KEY") == "secret"
        assert infer_setting_type("admin_password") == "secret"
        assert infer_setting_type("AUTH_TOKEN") == "secret"
        assert infer_setting_type("db_secret") == "secret"
        assert infer_setting_type("credential_file") == "secret"

    def test_infer_setting_type_url(self):
        """Test inferring URL type from name."""
        assert infer_setting_type("DATABASE_URL") == "url"
        assert infer_setting_type("API_ENDPOINT") == "url"
        assert infer_setting_type("REDIS_HOST") == "url"
        assert infer_setting_type("SERVICE_URI") == "url"

    def test_infer_setting_type_string(self):
        """Test inferring string type for other names."""
        assert infer_setting_type("MODEL_NAME") == "string"
        assert infer_setting_type("LOG_LEVEL") == "string"
        assert infer_setting_type("ENVIRONMENT") == "string"

    def test_categorize_setting_admin(self):
        """Test categorizing admin settings."""
        assert categorize_setting("ADMIN_PASSWORD") == "admin"
        assert categorize_setting("admin_email") == "admin"

    def test_categorize_setting_api_keys(self):
        """Test categorizing API key settings."""
        assert categorize_setting("OPENAI_API_KEY") == "api_keys"
        assert categorize_setting("auth_token") == "api_keys"
        assert categorize_setting("db_secret") == "api_keys"

    def test_categorize_setting_security(self):
        """Test categorizing security settings."""
        assert categorize_setting("CORS_ORIGINS") == "security"
        assert categorize_setting("DEBUG_MODE") == "security"

    def test_mask_secret_value_masks_secrets(self):
        """Test masking secret values."""
        result = mask_secret_value("sk-12345678", "api_keys.openai_api_key")
        assert result == "••••5678"

    def test_mask_secret_value_preserves_short(self):
        """Test that short values are fully masked."""
        result = mask_secret_value("abc", "api_keys.key")
        # Short values are fully masked for security
        assert result == "••••"

    def test_mask_secret_value_empty(self):
        """Test masking empty value."""
        assert mask_secret_value("", "api_keys.key") == ""

    def test_mask_secret_value_non_secret_path(self):
        """Test that non-secret paths aren't masked."""
        result = mask_secret_value("sk-12345678", "services.url")
        assert result == "sk-12345678"

    def test_env_var_matches_setting_exact_path(self):
        """Test exact path matching (underscore as dot)."""
        # TRANSCRIPTION_PROVIDER -> transcription.provider
        assert env_var_matches_setting("TRANSCRIPTION_PROVIDER", "transcription.provider")
        assert env_var_matches_setting("LLM_PROVIDER", "llm.provider")

    def test_env_var_matches_setting_suffix_path(self):
        """Test suffix matching for nested paths."""
        # OPENAI_API_KEY matches api_keys.openai_api_key (suffix match)
        assert env_var_matches_setting("OPENAI_API_KEY", "api_keys.openai_api_key")
        assert env_var_matches_setting("DEEPGRAM_API_KEY", "api_keys.deepgram_api_key")

    def test_env_var_matches_setting_no_match(self):
        """Test non-matching pairs - prevents false positives."""
        # TRANSCRIPTION_PROVIDER should NOT match llm.provider
        assert not env_var_matches_setting("TRANSCRIPTION_PROVIDER", "llm.provider")
        assert not env_var_matches_setting("OPENAI_API_KEY", "anthropic.api_key")


class TestSettingSuggestion:
    """Tests for SettingSuggestion dataclass."""

    def test_basic_creation(self):
        """Test creating a basic suggestion."""
        suggestion = SettingSuggestion(
            path="api_keys.openai",
            label="OpenAI API Key",
            has_value=True,
            value="••••5678",
        )
        assert suggestion.path == "api_keys.openai"
        assert suggestion.has_value is True

    def test_to_dict(self):
        """Test converting to dict for API responses."""
        suggestion = SettingSuggestion(
            path="api_keys.openai",
            label="OpenAI API Key",
            has_value=True,
            value="••••5678",
            capability="llm",
            provider_name="OpenAI",
        )
        result = suggestion.to_dict()

        assert result["path"] == "api_keys.openai"
        assert result["label"] == "OpenAI API Key"
        assert result["has_value"] is True
        assert result["value"] == "••••5678"
        assert result["capability"] == "llm"
        assert result["provider_name"] == "OpenAI"


class TestEnvVarMapping:
    """Tests for environment variable mapping methods."""

    @pytest.mark.asyncio
    async def test_get_config_as_dict(self, temp_config_dir):
        """Test getting config as plain dict."""
        manager = SettingsStore(config_dir=temp_config_dir)

        defaults = temp_config_dir / "config.defaults.yaml"
        defaults.write_text("""
api_keys:
  openai: "sk-test"
settings:
  debug: true
""")

        result = await manager.get_config_as_dict()

        assert isinstance(result, dict)
        assert result["api_keys"]["openai"] == "sk-test"
        assert result["settings"]["debug"] is True

    @pytest.mark.asyncio
    async def test_find_setting_for_env_var_found(self, temp_config_dir):
        """Test finding a setting that matches env var."""
        manager = SettingsStore(config_dir=temp_config_dir)

        secrets = temp_config_dir / "secrets.yaml"
        secrets.write_text("""
api_keys:
  openai_api_key: "sk-found"
  anthropic_api_key: "sk-ant"
""")

        result = await manager.find_setting_for_env_var("OPENAI_API_KEY")

        # Function first checks provider registry mapping, then falls back to config
        # The exact path depends on provider registry state, but should find a value
        assert result is not None
        path, value = result
        assert "openai" in path.lower()
        assert path.startswith("api_keys.")

    @pytest.mark.asyncio
    async def test_find_setting_for_env_var_not_found(self, temp_config_dir):
        """Test searching for non-existent env var."""
        manager = SettingsStore(config_dir=temp_config_dir)

        secrets = temp_config_dir / "secrets.yaml"
        secrets.write_text("""
api_keys:
  openai_api_key: "sk-test"
""")

        result = await manager.find_setting_for_env_var("STRIPE_API_KEY")
        assert result is None

    @pytest.mark.asyncio
    async def test_has_value_for_env_var_true(self, temp_config_dir):
        """Test checking if env var has value - exists."""
        manager = SettingsStore(config_dir=temp_config_dir)

        secrets = temp_config_dir / "secrets.yaml"
        secrets.write_text("""
api_keys:
  openai_api_key: "sk-has-value"
""")

        assert await manager.has_value_for_env_var("OPENAI_API_KEY") is True

    @pytest.mark.asyncio
    async def test_has_value_for_env_var_empty(self, temp_config_dir):
        """Test checking if env var has value - empty."""
        manager = SettingsStore(config_dir=temp_config_dir)

        secrets = temp_config_dir / "secrets.yaml"
        secrets.write_text("""
api_keys:
  openai_api_key: ""
""")

        assert await manager.has_value_for_env_var("OPENAI_API_KEY") is False

    @pytest.mark.asyncio
    async def test_has_value_for_env_var_not_found(self, temp_config_dir):
        """Test checking if env var has value - not found."""
        manager = SettingsStore(config_dir=temp_config_dir)
        assert await manager.has_value_for_env_var("NONEXISTENT_KEY") is False

    @pytest.mark.asyncio
    async def test_get_suggestions_for_env_var(self, temp_config_dir):
        """Test getting suggestions for env var."""
        manager = SettingsStore(config_dir=temp_config_dir)

        secrets = temp_config_dir / "secrets.yaml"
        secrets.write_text("""
api_keys:
  openai_api_key: "sk-test123"
  anthropic_api_key: "sk-ant"
""")

        suggestions = await manager.get_suggestions_for_env_var("OPENAI_API_KEY")

        assert len(suggestions) > 0
        # Should include the matching key
        paths = [s.path for s in suggestions]
        assert "api_keys.openai_api_key" in paths

    @pytest.mark.asyncio
    async def test_save_env_var_values(self, temp_config_dir):
        """Test saving env var values to config."""
        manager = SettingsStore(config_dir=temp_config_dir)

        result = await manager.save_env_var_values({
            "OPENAI_API_KEY": "sk-new-key",
            "ADMIN_PASSWORD": "secret-pass",
            "AUTH_SECRET": "auth-value",
        })

        # Check counts
        assert result["api_keys"] == 2  # openai_api_key, auth_secret
        assert result["admin"] == 1  # admin_password

        # Verify saved values
        config = await manager.load_config(use_cache=False)
        assert OmegaConf.select(config, "api_keys.openai_api_key") == "sk-new-key"
        assert OmegaConf.select(config, "admin.admin_password") == "secret-pass"

    @pytest.mark.asyncio
    async def test_save_env_var_values_skips_masked(self, temp_config_dir):
        """Test that masked values are skipped."""
        manager = SettingsStore(config_dir=temp_config_dir)

        result = await manager.save_env_var_values({
            "OPENAI_API_KEY": "sk-real-key",
            "ANTHROPIC_KEY": "***hidden***",
            "EMPTY_KEY": "",
        })

        # Only non-masked, non-empty should be saved
        assert result["api_keys"] == 1

        config = await manager.load_config(use_cache=False)
        assert OmegaConf.select(config, "api_keys.openai_api_key") == "sk-real-key"
        assert OmegaConf.select(config, "api_keys.anthropic_key") is None


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
