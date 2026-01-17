"""
Integration tests for authentication endpoints.

Tests the /auth routes including login, registration, and token management.
"""

import pytest
from fastapi.testclient import TestClient


@pytest.mark.integration
class TestAuthEndpoints:
    """Tests for authentication API endpoints."""

    def test_login_endpoint_exists(self, client: TestClient):
        """Login endpoint should exist and accept POST requests."""
        response = client.post("/auth/jwt/login")

        # Should respond (even if with error for missing credentials)
        assert response.status_code in [400, 401, 422]  # Not 404

    def test_login_with_invalid_credentials(self, client: TestClient):
        """Login with invalid credentials should return 400 or 401."""
        response = client.post(
            "/auth/jwt/login",
            data={
                "username": "nonexistent@example.com",
                "password": "wrong-password"
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )

        assert response.status_code in [400, 401]

    def test_login_requires_email_and_password(self, client: TestClient):
        """Login should require both email and password."""
        # Missing password
        response = client.post(
            "/auth/jwt/login",
            data={"username": "test@example.com"},
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
        assert response.status_code == 422

        # Missing email
        response = client.post(
            "/auth/jwt/login",
            data={"password": "password"},
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
        assert response.status_code == 422

    def test_protected_endpoint_requires_auth(self, client: TestClient):
        """Protected endpoints should require authentication."""
        response = client.get("/users/me")

        # Should return 401 Unauthorized without token
        assert response.status_code == 401

    def test_protected_endpoint_rejects_invalid_token(self, client: TestClient):
        """Protected endpoints should reject invalid tokens."""
        response = client.get(
            "/users/me",
            headers={"Authorization": "Bearer invalid-token"}
        )

        # Should return 401 Unauthorized
        assert response.status_code == 401

    def test_logout_endpoint_exists(self, client: TestClient):
        """Logout endpoint should exist."""
        response = client.post("/auth/jwt/logout")

        # Should respond (even if unauthorized)
        assert response.status_code in [200, 401]  # Not 404


@pytest.mark.integration
class TestUserRegistration:
    """Tests for user registration endpoints."""

    def test_register_endpoint_exists(self, client: TestClient):
        """Register endpoint should exist."""
        response = client.post("/auth/register")

        # Should respond (even if with validation error)
        assert response.status_code in [400, 422]  # Not 404

    def test_register_requires_valid_email(self, client: TestClient):
        """Registration should require a valid email address."""
        response = client.post(
            "/auth/register",
            json={
                "email": "not-an-email",
                "password": "test-password-123"
            }
        )

        assert response.status_code == 422

    def test_register_requires_password(self, client: TestClient):
        """Registration should require a password."""
        response = client.post(
            "/auth/register",
            json={
                "email": "test@example.com"
            }
        )

        assert response.status_code == 422

    def test_register_rejects_weak_passwords(self, client: TestClient):
        """Registration should reject weak passwords."""
        weak_passwords = ["123", "pass", "a"]

        for password in weak_passwords:
            response = client.post(
                "/auth/register",
                json={
                    "email": "test@example.com",
                    "password": password
                }
            )

            # Should reject weak password
            # Note: Actual validation depends on implementation
            assert response.status_code in [400, 422]


@pytest.mark.integration
class TestCurrentUser:
    """Tests for current user endpoints."""

    def test_get_current_user_requires_auth(self, client: TestClient):
        """Getting current user should require authentication."""
        response = client.get("/users/me")

        assert response.status_code == 401

    def test_get_current_user_with_invalid_token(self, client: TestClient):
        """Should reject invalid authentication tokens."""
        response = client.get(
            "/users/me",
            headers={"Authorization": "Bearer invalid-token-12345"}
        )

        assert response.status_code == 401
