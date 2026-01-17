"""
Unit tests for authentication service.

Tests authentication logic without requiring database or external services.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


@pytest.mark.unit
class TestAuthService:
    """Tests for authentication service."""

    def test_password_hashing_is_secure(self):
        """Password hashing should use bcrypt or similar secure algorithm."""
        from passlib.context import CryptContext

        # Test that we can create a password context
        pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

        password = "test-password-123"
        hashed = pwd_context.hash(password)

        # Hash should not contain plain password
        assert password not in hashed
        # Hash should be bcrypt format
        assert hashed.startswith("$2b$")
        # Should verify correctly
        assert pwd_context.verify(password, hashed)
        # Should not verify wrong password
        assert not pwd_context.verify("wrong-password", hashed)

    def test_password_hashing_produces_different_hashes(self):
        """Same password should produce different hashes (due to salt)."""
        from passlib.context import CryptContext

        pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
        password = "test-password-123"

        hash1 = pwd_context.hash(password)
        hash2 = pwd_context.hash(password)

        # Hashes should be different
        assert hash1 != hash2
        # But both should verify
        assert pwd_context.verify(password, hash1)
        assert pwd_context.verify(password, hash2)

    @pytest.mark.asyncio
    async def test_jwt_token_generation_requires_secret_key(self):
        """JWT token generation should require a secret key."""
        from jose import jwt
        import time

        secret_key = "test-secret-key-for-testing-only"
        algorithm = "HS256"

        # Create a token
        payload = {
            "sub": "test-user@example.com",
            "exp": int(time.time()) + 3600,  # 1 hour
            "iat": int(time.time()),
        }

        token = jwt.encode(payload, secret_key, algorithm=algorithm)

        # Decode and verify
        decoded = jwt.decode(token, secret_key, algorithms=[algorithm])
        assert decoded["sub"] == "test-user@example.com"

    @pytest.mark.asyncio
    async def test_jwt_token_cannot_be_decoded_with_wrong_key(self):
        """JWT token should not be decodable with wrong secret key."""
        from jose import jwt, JWTError
        import time

        secret_key = "test-secret-key"
        wrong_key = "wrong-secret-key"
        algorithm = "HS256"

        payload = {
            "sub": "test-user@example.com",
            "exp": int(time.time()) + 3600,
        }

        token = jwt.encode(payload, secret_key, algorithm=algorithm)

        # Should raise error with wrong key
        with pytest.raises(JWTError):
            jwt.decode(token, wrong_key, algorithms=[algorithm])

    @pytest.mark.asyncio
    async def test_expired_jwt_token_is_rejected(self):
        """Expired JWT tokens should be rejected."""
        from jose import jwt, JWTError
        import time

        secret_key = "test-secret-key"
        algorithm = "HS256"

        # Create expired token
        payload = {
            "sub": "test-user@example.com",
            "exp": int(time.time()) - 3600,  # Expired 1 hour ago
        }

        token = jwt.encode(payload, secret_key, algorithm=algorithm)

        # Should raise error for expired token
        with pytest.raises(JWTError):
            jwt.decode(token, secret_key, algorithms=[algorithm])


@pytest.mark.unit
class TestUserValidation:
    """Tests for user validation logic."""

    def test_email_validation_accepts_valid_emails(self):
        """Valid email addresses should be accepted."""
        from pydantic import BaseModel, EmailStr

        class UserEmail(BaseModel):
            email: EmailStr

        # These should all be valid
        valid_emails = [
            "user@example.com",
            "test.user@example.com",
            "user+tag@example.co.uk",
            "user123@test-domain.com",
        ]

        for email in valid_emails:
            user = UserEmail(email=email)
            assert user.email == email

    def test_email_validation_rejects_invalid_emails(self):
        """Invalid email addresses should be rejected."""
        from pydantic import BaseModel, EmailStr, ValidationError

        class UserEmail(BaseModel):
            email: EmailStr

        invalid_emails = [
            "not-an-email",
            "@example.com",
            "user@",
            "user @example.com",
            "",
        ]

        for email in invalid_emails:
            with pytest.raises(ValidationError):
                UserEmail(email=email)


@pytest.mark.unit
class TestSecurityUtilities:
    """Tests for security utility functions."""

    def test_secret_key_masking(self, mock_settings_store):
        """Secret keys should be masked in logs and responses."""
        from config.secrets import mask_value

        api_key = "sk-1234567890abcdefghijklmnop"
        masked = mask_value(api_key)

        # Should not contain full key
        assert api_key not in masked
        # Should show last 4 chars
        assert masked.endswith("mnop")
        # Should start with asterisks
        assert masked.startswith("****")

    def test_secret_detection_in_dict(self, mock_settings_store):
        """Secrets should be detected and masked in dictionaries."""
        from config.secrets import mask_dict_secrets

        config = {
            "api_key": "secret-key-12345",
            "host": "localhost",
            "password": "super-secret-password",
            "port": 8080,
        }

        masked = mask_dict_secrets(config)

        # Secrets should be masked
        assert "secret-key-12345" not in str(masked)
        assert "super-secret-password" not in str(masked)

        # Non-secrets should be preserved
        assert masked["host"] == "localhost"
        assert masked["port"] == 8080

        # Masked values should show last 4 chars
        assert masked["api_key"].endswith("2345")
        assert masked["password"].endswith("word")
