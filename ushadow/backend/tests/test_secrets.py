"""
Tests for the secrets module - secret detection and masking utilities.
"""

import pytest
from pathlib import Path

# Add src to path for imports
import sys
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from config.secrets import (
    is_secret_key,
    mask_value,
    mask_if_secret,
    mask_dict_secrets,
    get_auth_secret_key,
    SENSITIVE_PATTERNS,
)


class TestIsSecretKey:
    """Tests for is_secret_key() function."""

    def test_detects_api_key(self):
        """API key patterns should be detected."""
        assert is_secret_key("OPENAI_API_KEY") is True
        assert is_secret_key("api_key") is True
        assert is_secret_key("apiKey") is True

    def test_detects_password(self):
        """Password patterns should be detected."""
        assert is_secret_key("password") is True
        assert is_secret_key("PASSWORD") is True
        assert is_secret_key("user_password") is True
        assert is_secret_key("admin_pass") is True

    def test_detects_secret(self):
        """Secret patterns should be detected."""
        assert is_secret_key("secret") is True
        assert is_secret_key("SECRET_KEY") is True
        assert is_secret_key("client_secret") is True

    def test_detects_token(self):
        """Token patterns should be detected."""
        assert is_secret_key("token") is True
        assert is_secret_key("ACCESS_TOKEN") is True
        assert is_secret_key("refresh_token") is True

    def test_detects_auth(self):
        """Auth patterns should be detected."""
        assert is_secret_key("auth") is True
        assert is_secret_key("AUTH_SECRET_KEY") is True
        assert is_secret_key("authorization") is True

    def test_detects_credential(self):
        """Credential patterns should be detected."""
        assert is_secret_key("credential") is True
        assert is_secret_key("CREDENTIALS") is True
        assert is_secret_key("db_credentials") is True

    def test_non_secrets(self):
        """Non-secret keys should not be detected."""
        assert is_secret_key("username") is False
        assert is_secret_key("host") is False
        assert is_secret_key("port") is False
        assert is_secret_key("database") is False
        assert is_secret_key("url") is False
        assert is_secret_key("name") is False
        assert is_secret_key("enabled") is False

    def test_case_insensitive(self):
        """Detection should be case insensitive."""
        assert is_secret_key("PASSWORD") is True
        assert is_secret_key("password") is True
        assert is_secret_key("Password") is True
        assert is_secret_key("PaSsWoRd") is True


class TestMaskValue:
    """Tests for mask_value() function."""

    def test_mask_normal_value(self):
        """Normal values show last 4 chars."""
        assert mask_value("sk-1234567890abcdef") == "****cdef"
        assert mask_value("mysecretpassword") == "****word"

    def test_mask_short_value(self):
        """Short values are fully masked."""
        assert mask_value("abc") == "****"
        assert mask_value("1234") == "****"
        assert mask_value("a") == "****"

    def test_mask_empty_value(self):
        """Empty values return mask."""
        assert mask_value("") == "****"

    def test_mask_none_value(self):
        """None values return mask."""
        assert mask_value(None) == "****"

    def test_mask_exactly_4_chars(self):
        """Exactly 4 char values are fully masked."""
        assert mask_value("abcd") == "****"

    def test_mask_5_chars(self):
        """5 char values show last 4."""
        assert mask_value("abcde") == "****bcde"


class TestMaskIfSecret:
    """Tests for mask_if_secret() function."""

    def test_masks_secret_key(self):
        """Secret keys should be masked."""
        assert mask_if_secret("api_key", "sk-1234567890") == "****7890"
        assert mask_if_secret("PASSWORD", "mysecret") == "****cret"

    def test_preserves_non_secret(self):
        """Non-secret keys should preserve value."""
        assert mask_if_secret("hostname", "localhost") == "localhost"
        assert mask_if_secret("port", "8080") == "8080"

    def test_handles_empty_value(self):
        """Empty values return as-is for non-secrets."""
        assert mask_if_secret("hostname", "") == ""
        assert mask_if_secret("api_key", "") == ""  # Empty secret also returned as-is


class TestMaskDictSecrets:
    """Tests for mask_dict_secrets() function."""

    def test_masks_flat_dict(self):
        """Masks secrets in flat dictionary."""
        data = {
            "api_key": "sk-1234567890",
            "hostname": "localhost",
            "password": "secret123",
        }
        result = mask_dict_secrets(data)

        assert result["api_key"] == "****7890"
        assert result["hostname"] == "localhost"
        assert result["password"] == "****t123"

    def test_masks_nested_dict(self):
        """Masks secrets in nested dictionaries."""
        data = {
            "database": {
                "host": "localhost",
                "password": "dbpassword123",
            },
            "api_keys": {
                "openai_key": "sk-openai12345678",
                "anthropic_key": "sk-ant-12345678",
            },
        }
        result = mask_dict_secrets(data)

        assert result["database"]["host"] == "localhost"
        assert result["database"]["password"] == "****d123"
        assert result["api_keys"]["openai_key"] == "****5678"
        assert result["api_keys"]["anthropic_key"] == "****5678"

    def test_handles_lists(self):
        """Handles lists within dictionaries."""
        data = {
            "servers": [
                {"host": "server1", "api_key": "key123456789"},
                {"host": "server2", "api_key": "key987654321"},
            ],
        }
        result = mask_dict_secrets(data)

        assert result["servers"][0]["host"] == "server1"
        assert result["servers"][0]["api_key"] == "****6789"
        assert result["servers"][1]["api_key"] == "****4321"

    def test_handles_list_of_strings(self):
        """List of strings is preserved (not masked)."""
        data = {
            "hosts": ["server1", "server2"],
            "api_keys": {"main_key": "secret12345"},
        }
        result = mask_dict_secrets(data)

        assert result["hosts"] == ["server1", "server2"]
        assert result["api_keys"]["main_key"] == "****2345"

    def test_preserves_non_string_values(self):
        """Non-string values are preserved."""
        data = {
            "port": 8080,
            "enabled": True,
            "timeout": 30.5,
            "api_key": "mysecret12345",
        }
        result = mask_dict_secrets(data)

        assert result["port"] == 8080
        assert result["enabled"] is True
        assert result["timeout"] == 30.5
        assert result["api_key"] == "****2345"

    def test_empty_dict(self):
        """Empty dict returns empty dict."""
        assert mask_dict_secrets({}) == {}

    def test_deeply_nested(self):
        """Handles deeply nested structures."""
        data = {
            "level1": {
                "level2": {
                    "level3": {
                        "secret_key": "deep_secret_123",
                        "name": "test",
                    }
                }
            }
        }
        result = mask_dict_secrets(data)

        assert result["level1"]["level2"]["level3"]["secret_key"] == "****_123"
        assert result["level1"]["level2"]["level3"]["name"] == "test"

    def test_whitespace_values_not_masked(self):
        """Whitespace-only values are not masked."""
        data = {
            "api_key": "   ",
            "password": "",
        }
        result = mask_dict_secrets(data)

        # Whitespace values are not masked (strip() is falsy)
        assert result["api_key"] == "   "
        assert result["password"] == ""


class TestGetAuthSecretKey:
    """Tests for get_auth_secret_key() function.

    Note: get_auth_secret_key() now uses OmegaConf settings store,
    so we mock get_settings_store() instead of file paths.
    """

    def test_loads_from_settings_store(self):
        """Loads auth secret key from settings store."""
        from unittest.mock import MagicMock, patch

        mock_store = MagicMock()
        mock_store.get_sync.return_value = "test-secret-key-12345"

        with patch("src.config.omegaconf_settings.get_settings_store", return_value=mock_store):
            key = get_auth_secret_key()
            assert key == "test-secret-key-12345"
            mock_store.get_sync.assert_called_once_with("security.auth_secret_key")

    def test_raises_when_key_missing(self):
        """Raises ValueError when auth_secret_key is missing."""
        from unittest.mock import MagicMock, patch

        mock_store = MagicMock()
        mock_store.get_sync.return_value = None

        with patch("src.config.omegaconf_settings.get_settings_store", return_value=mock_store):
            with pytest.raises(ValueError, match="AUTH_SECRET_KEY not found"):
                get_auth_secret_key()

    def test_raises_when_key_empty(self):
        """Raises ValueError when auth_secret_key is empty string."""
        from unittest.mock import MagicMock, patch

        mock_store = MagicMock()
        mock_store.get_sync.return_value = ""

        with patch("src.config.omegaconf_settings.get_settings_store", return_value=mock_store):
            with pytest.raises(ValueError, match="AUTH_SECRET_KEY not found"):
                get_auth_secret_key()


class TestSensitivePatterns:
    """Tests for the SENSITIVE_PATTERNS constant."""

    def test_patterns_are_lowercase(self):
        """All patterns should be lowercase for case-insensitive matching."""
        for pattern in SENSITIVE_PATTERNS:
            assert pattern == pattern.lower(), f"Pattern '{pattern}' should be lowercase"

    def test_expected_patterns_present(self):
        """Expected patterns should be present."""
        expected = ['key', 'secret', 'password', 'token', 'credential', 'auth', 'pass']
        for pattern in expected:
            assert pattern in SENSITIVE_PATTERNS, f"Expected pattern '{pattern}' not found"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
