"""
Pytest configuration and shared fixtures for backend tests.

This file provides common test fixtures used across unit and integration tests:
- Test client for API testing
- Database fixtures
- Authentication fixtures
- Mock service fixtures
"""

import os
import sys
from pathlib import Path
from typing import AsyncGenerator, Generator
from unittest.mock import MagicMock, AsyncMock

import pytest
from fastapi.testclient import TestClient
from httpx import AsyncClient, ASGITransport

# Add src to path for imports
backend_root = Path(__file__).parent.parent
sys.path.insert(0, str(backend_root / "src"))


# =============================================================================
# Application Fixtures
# =============================================================================

@pytest.fixture(scope="session")
def test_env():
    """Set up test environment variables."""
    os.environ["ENVIRONMENT"] = "test"
    os.environ["TESTING"] = "true"
    # Prevent actual service connections during tests
    os.environ["MONGO_URI"] = "mongodb://test:27017"
    os.environ["REDIS_URL"] = "redis://test:6379"


@pytest.fixture
def app(test_env):
    """FastAPI application instance for testing."""
    # Import here to ensure test env is set first
    from main import app as fastapi_app
    return fastapi_app


@pytest.fixture
def client(app) -> Generator[TestClient, None, None]:
    """
    Synchronous test client for API testing.

    Use this for simple endpoint tests that don't require async operations.
    """
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
async def async_client(app) -> AsyncGenerator[AsyncClient, None]:
    """
    Asynchronous test client for API testing.

    Use this for tests that need to test async endpoints or operations.
    """
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test"
    ) as ac:
        yield ac


# =============================================================================
# Authentication Fixtures
# =============================================================================

@pytest.fixture
def mock_user():
    """Mock authenticated user for testing."""
    return {
        "id": "test-user-id-123",
        "email": "test@example.com",
        "is_active": True,
        "is_superuser": False,
        "is_verified": True,
    }


@pytest.fixture
def mock_admin_user():
    """Mock admin user for testing."""
    return {
        "id": "admin-user-id-123",
        "email": "admin@example.com",
        "is_active": True,
        "is_superuser": True,
        "is_verified": True,
    }


@pytest.fixture
def auth_headers(mock_user):
    """
    Mock authentication headers for testing protected endpoints.

    In a real implementation, this would generate a valid JWT token.
    For now, we'll need to mock the authentication dependency.
    """
    return {
        "Authorization": "Bearer test-token-123"
    }


# =============================================================================
# Database Fixtures
# =============================================================================

@pytest.fixture
async def mock_db():
    """
    Mock database for unit tests.

    Use this when you don't need a real database connection.
    """
    db = AsyncMock()
    db.users = AsyncMock()
    db.conversations = AsyncMock()
    db.memories = AsyncMock()
    db.sessions = AsyncMock()
    return db


@pytest.fixture
async def test_db():
    """
    Real test database fixture for integration tests.

    TODO: Implement actual test database setup/teardown
    Currently returns a mock - update this when adding integration tests.
    """
    # TODO: Set up actual test database
    # - Create test database
    # - Run migrations
    # - Yield database connection
    # - Clean up after tests
    db = AsyncMock()
    yield db
    # TODO: Cleanup


# =============================================================================
# Service Fixtures
# =============================================================================

@pytest.fixture
def mock_docker_client():
    """Mock Docker client for testing Docker operations."""
    client = MagicMock()
    client.containers = MagicMock()
    client.images = MagicMock()
    client.networks = MagicMock()
    return client


@pytest.fixture
def mock_kubernetes_client():
    """Mock Kubernetes client for testing K8s operations."""
    client = AsyncMock()
    client.create_namespace = AsyncMock()
    client.create_deployment = AsyncMock()
    client.create_service = AsyncMock()
    return client


@pytest.fixture
def mock_settings_store():
    """Mock settings store for configuration testing."""
    from unittest.mock import MagicMock

    store = MagicMock()
    # Default settings
    store.get_sync.side_effect = lambda key: {
        "security.auth_secret_key": "test-secret-key-12345",
        "api.port": 8001,
        "api.host": "0.0.0.0",
    }.get(key)

    return store


@pytest.fixture
def mock_llm_client():
    """Mock LLM client for testing AI operations."""
    client = AsyncMock()
    client.chat = AsyncMock(return_value={
        "choices": [{
            "message": {
                "content": "Test response from LLM"
            }
        }]
    })
    return client


# =============================================================================
# Test Data Fixtures
# =============================================================================

@pytest.fixture
def sample_service_config():
    """Sample service configuration for testing."""
    return {
        "name": "test-service",
        "image": "test-image:latest",
        "ports": [8080],
        "environment": {
            "ENV": "test"
        },
        "capabilities": ["llm", "memory"]
    }


@pytest.fixture
def sample_provider_config():
    """Sample provider configuration for testing."""
    return {
        "name": "openai",
        "capability": "llm",
        "credentials": {
            "api_key": {
                "env_var": "OPENAI_API_KEY",
                "type": "secret"
            },
            "model": {
                "env_var": "OPENAI_MODEL",
                "type": "string",
                "default": "gpt-4"
            }
        }
    }


# =============================================================================
# Test Utilities
# =============================================================================

@pytest.fixture
def assert_valid_response():
    """Helper to assert common response properties."""
    def _assert(response, status_code=200, content_type="application/json"):
        assert response.status_code == status_code, \
            f"Expected {status_code}, got {response.status_code}: {response.text}"
        if content_type:
            assert content_type in response.headers.get("content-type", ""), \
                f"Expected content-type {content_type}, got {response.headers.get('content-type')}"
    return _assert


# =============================================================================
# Pytest Configuration
# =============================================================================

def pytest_configure(config):
    """Pytest configuration hook."""
    # Add custom markers
    config.addinivalue_line(
        "markers", "unit: mark test as a unit test"
    )
    config.addinivalue_line(
        "markers", "integration: mark test as an integration test"
    )
    config.addinivalue_line(
        "markers", "slow: mark test as slow running"
    )
    config.addinivalue_line(
        "markers", "requires_docker: mark test as requiring Docker"
    )
    config.addinivalue_line(
        "markers", "requires_k8s: mark test as requiring Kubernetes"
    )
