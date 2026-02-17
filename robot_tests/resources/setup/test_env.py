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
TEST_KEYCLOAK_PORT = os.getenv('TEST_KEYCLOAK_PORT', '8181')
TEST_MONGO_PORT = os.getenv('TEST_MONGO_PORT', '27118')
TEST_REDIS_PORT = os.getenv('TEST_REDIS_PORT', '6480')
TEST_POSTGRES_PORT = os.getenv('TEST_POSTGRES_PORT', '5433')

# API URLs
KEYCLOAK_URL = f'http://localhost:{TEST_KEYCLOAK_PORT}'
MONGODB_URI = f'mongodb://localhost:{TEST_MONGO_PORT}'
BACKEND_URL = os.getenv('BACKEND_URL', 'http://localhost:8290')
BACKEND_PORT = os.getenv('BACKEND_PORT', '8290')

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

# Individual variables for Robot Framework
TEST_USER_EMAIL = "test@example.com"
TEST_USER_PASSWORD = "test-password"

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

# Docker Container Names (test environment)
COMPOSE_PROJECT_NAME = "ushadow-test"
KEYCLOAK_CONTAINER = f"{COMPOSE_PROJECT_NAME}-keycloak-test-1"
KEYCLOAK_DB_CONTAINER = f"{COMPOSE_PROJECT_NAME}-keycloak-db-test-1"
MONGO_CONTAINER = f"{COMPOSE_PROJECT_NAME}-mongo-test-1"
REDIS_CONTAINER = f"{COMPOSE_PROJECT_NAME}-redis-test-1"

# Docker compose file path
DOCKER_COMPOSE_FILE = str((ROBOT_TESTS_DIR / "docker-compose-test.yml").absolute())
