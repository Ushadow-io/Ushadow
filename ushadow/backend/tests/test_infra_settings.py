"""
Tests for the infrastructure settings module.
"""

import pytest
from pathlib import Path
import os
from unittest.mock import patch

# Add src to path for imports
import sys
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from config.infra_settings import InfraSettings, get_infra_settings, get_settings


class TestInfraSettings:
    """Tests for InfraSettings class."""

    def test_default_values(self):
        """Test that default values are set correctly."""
        # Create settings without any env vars
        with patch.dict(os.environ, {}, clear=True):
            settings = InfraSettings()

        assert settings.ENV_NAME == "ushadow"
        assert settings.NODE_ENV == "development"
        assert settings.DEBUG is False
        assert settings.HOST == "0.0.0.0"
        assert settings.PORT == 8010
        assert settings.BACKEND_PORT == 8000
        assert settings.MONGODB_URI == "mongodb://mongo:27017"
        assert settings.MONGODB_DATABASE == "ushadow"
        assert settings.REDIS_URL == "redis://redis:6379/0"

    def test_env_override(self):
        """Test that environment variables override defaults."""
        env_vars = {
            "ENV_NAME": "test-env",
            "NODE_ENV": "production",
            "DEBUG": "true",
            "HOST": "127.0.0.1",
            "PORT": "9000",
            "BACKEND_PORT": "9001",
            "MONGODB_URI": "mongodb://custom:27017",
            "MONGODB_DATABASE": "testdb",
            "REDIS_URL": "redis://custom:6379/1",
        }

        with patch.dict(os.environ, env_vars, clear=True):
            settings = InfraSettings()

        assert settings.ENV_NAME == "test-env"
        assert settings.NODE_ENV == "production"
        assert settings.DEBUG is True
        assert settings.HOST == "127.0.0.1"
        assert settings.PORT == 9000
        assert settings.BACKEND_PORT == 9001
        assert settings.MONGODB_URI == "mongodb://custom:27017"
        assert settings.MONGODB_DATABASE == "testdb"
        assert settings.REDIS_URL == "redis://custom:6379/1"

    def test_cors_origins_from_string(self):
        """Test CORS origins parsing from comma-separated string."""
        env_vars = {
            "CORS_ORIGINS": "http://localhost:3000,http://example.com,https://app.example.com",
        }

        with patch.dict(os.environ, env_vars, clear=True):
            settings = InfraSettings()

        assert settings.CORS_ORIGINS == [
            "http://localhost:3000",
            "http://example.com",
            "https://app.example.com",
        ]

    def test_cors_origins_single_value(self):
        """Test CORS origins with single value."""
        env_vars = {
            "CORS_ORIGINS": "http://localhost:3000",
        }

        with patch.dict(os.environ, env_vars, clear=True):
            settings = InfraSettings()

        assert settings.CORS_ORIGINS == ["http://localhost:3000"]

    def test_cors_origins_with_spaces(self):
        """Test CORS origins parsing handles spaces correctly."""
        env_vars = {
            "CORS_ORIGINS": "http://localhost:3000 , http://example.com , https://app.example.com",
        }

        with patch.dict(os.environ, env_vars, clear=True):
            settings = InfraSettings()

        assert settings.CORS_ORIGINS == [
            "http://localhost:3000",
            "http://example.com",
            "https://app.example.com",
        ]

    def test_cors_origins_empty_entries_filtered(self):
        """Test CORS origins filters empty entries."""
        env_vars = {
            "CORS_ORIGINS": "http://localhost:3000,,http://example.com,",
        }

        with patch.dict(os.environ, env_vars, clear=True):
            settings = InfraSettings()

        assert settings.CORS_ORIGINS == [
            "http://localhost:3000",
            "http://example.com",
        ]

    def test_debug_false_values(self):
        """Test DEBUG field with various false values."""
        # Pydantic v2 accepts: false, False, FALSE, 0, off, no (case-insensitive)
        # But "no" may not work in all Pydantic versions, so we test the reliable ones
        false_values = ["false", "False", "FALSE", "0"]

        for value in false_values:
            env_vars = {"DEBUG": value}
            with patch.dict(os.environ, env_vars, clear=True):
                settings = InfraSettings()
                assert settings.DEBUG is False, f"DEBUG should be False for '{value}'"

    def test_debug_true_values(self):
        """Test DEBUG field with various true values."""
        true_values = ["true", "True", "TRUE", "1", "yes"]

        for value in true_values:
            env_vars = {"DEBUG": value}
            with patch.dict(os.environ, env_vars, clear=True):
                settings = InfraSettings()
                assert settings.DEBUG is True, f"DEBUG should be True for '{value}'"

    def test_port_as_string(self):
        """Test PORT parsing from string."""
        env_vars = {"PORT": "8080"}

        with patch.dict(os.environ, env_vars, clear=True):
            settings = InfraSettings()

        assert settings.PORT == 8080
        assert isinstance(settings.PORT, int)

    def test_extra_env_vars_ignored(self):
        """Test that extra environment variables are ignored."""
        env_vars = {
            "ENV_NAME": "test",
            "UNKNOWN_VAR": "should-be-ignored",
            "ANOTHER_UNKNOWN": "also-ignored",
        }

        with patch.dict(os.environ, env_vars, clear=True):
            # Should not raise an error
            settings = InfraSettings()
            assert settings.ENV_NAME == "test"
            # Unknown vars should not be accessible
            assert not hasattr(settings, "UNKNOWN_VAR")


class TestGetInfraSettings:
    """Tests for get_infra_settings() function."""

    def test_returns_infra_settings_instance(self):
        """Function returns InfraSettings instance."""
        # Clear the cache first
        get_infra_settings.cache_clear()

        settings = get_infra_settings()
        assert isinstance(settings, InfraSettings)

    def test_cached(self):
        """Function returns cached instance."""
        get_infra_settings.cache_clear()

        settings1 = get_infra_settings()
        settings2 = get_infra_settings()

        assert settings1 is settings2


class TestGetSettings:
    """Tests for get_settings() backward compatibility alias."""

    def test_returns_same_as_get_infra_settings(self):
        """get_settings() should return same as get_infra_settings()."""
        get_infra_settings.cache_clear()

        settings1 = get_settings()
        settings2 = get_infra_settings()

        assert settings1 is settings2

    def test_returns_infra_settings_instance(self):
        """get_settings() returns InfraSettings instance."""
        get_infra_settings.cache_clear()

        settings = get_settings()
        assert isinstance(settings, InfraSettings)


class TestInfraSettingsValidation:
    """Tests for InfraSettings validation."""

    def test_invalid_port_raises_error(self):
        """Invalid PORT value should raise validation error."""
        env_vars = {"PORT": "not-a-number"}

        with patch.dict(os.environ, env_vars, clear=True):
            with pytest.raises(Exception):  # Pydantic ValidationError
                InfraSettings()

    def test_mongodb_uri_formats(self):
        """Test various MongoDB URI formats."""
        valid_uris = [
            "mongodb://localhost:27017",
            "mongodb://user:pass@localhost:27017",
            "mongodb://mongo:27017/dbname",
            "mongodb+srv://cluster.mongodb.net",
        ]

        for uri in valid_uris:
            env_vars = {"MONGODB_URI": uri}
            with patch.dict(os.environ, env_vars, clear=True):
                settings = InfraSettings()
                assert settings.MONGODB_URI == uri


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
