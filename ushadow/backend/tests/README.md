# Backend Tests

Comprehensive test suite for the Ushadow backend using pytest.

## Directory Structure

```
tests/
├── conftest.py              # Shared fixtures and pytest configuration
├── unit/                    # Unit tests (no external dependencies)
│   ├── test_services/       # Service layer tests
│   ├── test_utils/          # Utility function tests
│   └── test_models/         # Model/schema tests
├── integration/             # Integration tests (with DB, Redis, etc.)
│   ├── test_routers/        # API endpoint tests
│   ├── test_auth/           # Authentication integration tests
│   └── test_services/       # Service integration tests
└── fixtures/                # Shared test data and fixtures
```

## Running Tests

### Run All Tests

```bash
cd ushadow/backend
pytest tests/
```

### Run Specific Test Categories

```bash
# Run only unit tests
pytest tests/ -m unit

# Run only integration tests
pytest tests/ -m integration

# Run specific test file
pytest tests/unit/test_services/test_auth_service.py

# Run specific test class
pytest tests/unit/test_services/test_auth_service.py::TestAuthService

# Run specific test
pytest tests/unit/test_services/test_auth_service.py::TestAuthService::test_password_hashing_is_secure
```

### Run with Coverage

```bash
# Run tests with coverage report
pytest tests/ --cov=src --cov-report=html

# Open coverage report
open htmlcov/index.html
```

### Run with Verbose Output

```bash
# Show detailed test output
pytest tests/ -v

# Show print statements
pytest tests/ -s

# Both verbose and print statements
pytest tests/ -vs
```

## Test Markers

Tests can be marked with custom markers for selective execution:

- `@pytest.mark.unit` - Unit tests (no external dependencies)
- `@pytest.mark.integration` - Integration tests (require services)
- `@pytest.mark.slow` - Slow-running tests
- `@pytest.mark.requires_docker` - Tests requiring Docker
- `@pytest.mark.requires_k8s` - Tests requiring Kubernetes

Example usage:

```python
@pytest.mark.unit
def test_password_hashing():
    # Unit test logic
    pass

@pytest.mark.integration
@pytest.mark.requires_docker
async def test_docker_container_management():
    # Integration test logic
    pass
```

## Writing Tests

### Unit Test Example

```python
import pytest

@pytest.mark.unit
class TestMyService:
    """Tests for MyService."""

    def test_basic_functionality(self):
        """Test basic service functionality."""
        from services.my_service import MyService

        service = MyService()
        result = service.process("input")

        assert result == "expected_output"

    def test_error_handling(self):
        """Test service error handling."""
        from services.my_service import MyService

        service = MyService()

        with pytest.raises(ValueError):
            service.process(None)
```

### Integration Test Example

```python
import pytest
from fastapi.testclient import TestClient

@pytest.mark.integration
def test_api_endpoint(client: TestClient):
    """Test API endpoint returns correct data."""
    response = client.get("/api/data")

    assert response.status_code == 200
    data = response.json()
    assert "items" in data
```

### Async Test Example

```python
import pytest

@pytest.mark.asyncio
@pytest.mark.unit
async def test_async_function():
    """Test async function."""
    from services.async_service import AsyncService

    service = AsyncService()
    result = await service.fetch_data()

    assert result is not None
```

## Available Fixtures

See `conftest.py` for all available fixtures. Common fixtures include:

- `client` - Synchronous FastAPI test client
- `async_client` - Asynchronous FastAPI test client
- `mock_user` - Mock authenticated user
- `mock_admin_user` - Mock admin user
- `auth_headers` - Authentication headers for protected endpoints
- `mock_db` - Mock database for unit tests
- `test_db` - Real test database for integration tests
- `mock_docker_client` - Mock Docker client
- `mock_kubernetes_client` - Mock Kubernetes client
- `sample_service_config` - Sample service configuration
- `sample_provider_config` - Sample provider configuration

## Best Practices

### 1. Test Organization

- **Unit tests** should be fast and not depend on external services
- **Integration tests** can use real services but should be isolated
- Use descriptive test names that explain what is being tested
- Group related tests in classes

### 2. Test Independence

- Each test should be independent and not rely on other tests
- Use fixtures for setup/teardown
- Clean up resources after tests

### 3. Mocking

- Mock external dependencies in unit tests
- Use integration tests for testing with real services
- Use the provided mock fixtures in `conftest.py`

### 4. Assertions

- Use descriptive assertion messages
- Test both success and failure cases
- Use pytest's rich assertion introspection

```python
# Good
assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"

# Less helpful
assert response.status_code == 200
```

### 5. Test Data

- Use fixtures for test data
- Don't hardcode values - use constants or fixtures
- Keep test data minimal and focused

### 6. Async Testing

- Use `@pytest.mark.asyncio` for async tests
- Use `async_client` fixture for async API tests
- Properly await all async operations

## Continuous Integration

Tests run automatically on:
- Every push to a branch
- Every pull request
- Before merging to main

See `.github/workflows/test.yml` for CI configuration.

## Coverage Goals

- **Unit Tests**: 80%+ coverage
- **Integration Tests**: 70%+ coverage
- **Critical Services**: 90%+ coverage

## Troubleshooting

### Import Errors

If you see import errors, ensure the backend source is in the path:

```python
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))
```

This is already configured in `conftest.py`.

### Database Connection Errors

For integration tests, ensure test database is configured:

```bash
export MONGO_URI="mongodb://test:27017"
export REDIS_URL="redis://test:6379"
```

### Slow Tests

Use `-m "not slow"` to skip slow tests during development:

```bash
pytest tests/ -m "not slow"
```

### Docker/K8s Tests

Skip tests requiring external services:

```bash
pytest tests/ -m "not requires_docker and not requires_k8s"
```

## Contributing

When adding new tests:

1. Choose the appropriate directory (unit vs integration)
2. Add appropriate markers (`@pytest.mark.unit`, etc.)
3. Use existing fixtures from `conftest.py`
4. Follow the naming convention: `test_<what_is_being_tested>.py`
5. Add docstrings explaining what the test does
6. Ensure tests pass before committing

## Resources

- [Pytest Documentation](https://docs.pytest.org/)
- [FastAPI Testing](https://fastapi.tiangolo.com/tutorial/testing/)
- [Pytest Async](https://pytest-asyncio.readthedocs.io/)
