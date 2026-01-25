"""
Integration tests for health check endpoints.

Tests the /health and /readiness endpoints to ensure the API is running
and responding correctly.
"""

import pytest
from fastapi.testclient import TestClient


@pytest.mark.integration
def test_health_endpoint_returns_200(client: TestClient):
    """Health check endpoint should return 200 OK."""
    response = client.get("/health")

    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert data["status"] in ["healthy", "ok"]


@pytest.mark.integration
def test_health_endpoint_has_correct_structure(client: TestClient):
    """Health check should return expected JSON structure."""
    response = client.get("/health")

    assert response.status_code == 200
    data = response.json()

    # Should have basic health info
    assert isinstance(data, dict)
    assert "status" in data


@pytest.mark.integration
def test_readiness_endpoint(client: TestClient):
    """Readiness check endpoint should indicate if system is ready."""
    response = client.get("/readiness")

    # Readiness might be 200 (ready) or 503 (not ready)
    assert response.status_code in [200, 503]

    data = response.json()
    assert "ready" in data or "status" in data


@pytest.mark.integration
def test_health_endpoint_responds_quickly(client: TestClient):
    """Health check should respond within reasonable time."""
    import time

    start = time.time()
    response = client.get("/health")
    duration = time.time() - start

    assert response.status_code == 200
    assert duration < 1.0, f"Health check took {duration}s, should be < 1s"


@pytest.mark.integration
def test_health_endpoint_content_type(client: TestClient):
    """Health check should return JSON content type."""
    response = client.get("/health")

    assert response.status_code == 200
    assert "application/json" in response.headers.get("content-type", "")
