# Test Environment Configuration
import os
from pathlib import Path

# Find robot_tests root (resources/setup/test_env.py -> go up 2 levels)
ROBOT_TESTS_DIR = Path(__file__).parent.parent.parent
PROJECT_ROOT = ROBOT_TESTS_DIR.parent

# Export absolute paths for Robot Framework keywords
ROBOT_TESTS_DIR_STR = str(ROBOT_TESTS_DIR.absolute())
PROJECT_ROOT_STR = str(PROJECT_ROOT.absolute())

# API Configuration (test environment)
TEST_BACKEND_PORT = os.getenv('TEST_BACKEND_PORT', '8200')
TEST_KEYCLOAK_PORT = os.getenv('TEST_KEYCLOAK_PORT', '8181')
TEST_MONGO_PORT = os.getenv('TEST_MONGO_PORT', '27118')
TEST_REDIS_PORT = os.getenv('TEST_REDIS_PORT', '6480')
TEST_POSTGRES_PORT = os.getenv('TEST_POSTGRES_PORT', '5433')

# API URLs
BACKEND_URL = f'http://localhost:{TEST_BACKEND_PORT}'
KEYCLOAK_URL = f'http://localhost:{TEST_KEYCLOAK_PORT}'
MONGODB_URI = f'mongodb://localhost:{TEST_MONGO_PORT}'

# Frontend URL (for browser tests)
FRONTEND_URL = os.getenv('FRONTEND_URL', 'http://localhost:3001')
WEB_URL = FRONTEND_URL  # Alias matching old test convention

# Legacy variable names (for compatibility)
BACKEND_PORT = TEST_BACKEND_PORT

# Keycloak Configuration
KEYCLOAK_REALM = os.getenv('KEYCLOAK_REALM', 'ushadow')
KEYCLOAK_CLIENT_ID = os.getenv('KEYCLOAK_CLIENT_ID', 'ushadow-frontend')
KEYCLOAK_CLI_CLIENT_ID = os.getenv('KEYCLOAK_CLI_CLIENT_ID', 'ushadow-cli')

# Test credentials
KEYCLOAK_ADMIN_USER = 'admin'
KEYCLOAK_ADMIN_PASSWORD = 'admin'

# Admin user credentials (Robot Framework format)
ADMIN_USER = {
    "email": "admin@ushadow.local",
    "password": "admin"
}

TEST_USER = {
    "email": "test@example.com",
    "password": "test-password"
}

# Keycloak test user (for OAuth/OIDC flow testing)
KEYCLOAK_TEST_USER = {
    "email": "kctest@example.com",
    "password": "TestKeycloak123!",
    "display_name": "Keycloak Test User"
}

# Individual variables for Robot Framework
TEST_USER_EMAIL = "test@example.com"
TEST_USER_PASSWORD = "test-password"

# Keycloak test user (individual variables)
KEYCLOAK_TEST_EMAIL = "kctest@example.com"
KEYCLOAK_TEST_PASSWORD = "TestKeycloak123!"

# API Endpoints
ENDPOINTS = {
    "health": "/health",
    "readiness": "/readiness",
    "auth_login": "/api/auth/login",
    "keycloak_admin": f"{KEYCLOAK_URL}/admin/realms/ushadow"
}

# Test Configuration
TEST_CONFIG = {
    "retry_count": 3,
    "retry_delay": 1,
    "default_timeout": 30
}

# App environment identifiers (for tailscale/integration tests that reference live containers)
TAILSCALE_HOSTNAME = os.getenv('TAILSCALE_HOSTNAME', '')
TAILSCALE_URL = os.getenv('TAILSCALE_URL', '')

# Docker Container Names (test environment)
TEST_COMPOSE_PROJECT_NAME = "ushadow-test"
COMPOSE_PROJECT_NAME = "ushadow-test"  # legacy alias
BACKEND_CONTAINER = f"{COMPOSE_PROJECT_NAME}-backend-test-1"
KEYCLOAK_CONTAINER = f"{COMPOSE_PROJECT_NAME}-keycloak-test-1"
KEYCLOAK_DB_CONTAINER = f"{COMPOSE_PROJECT_NAME}-keycloak-db-test-1"
MONGO_CONTAINER = f"{COMPOSE_PROJECT_NAME}-mongo-test-1"
REDIS_CONTAINER = f"{COMPOSE_PROJECT_NAME}-redis-test-1"

# Docker compose file path
DOCKER_COMPOSE_FILE = str((ROBOT_TESTS_DIR / "docker-compose-test.yml").absolute())
