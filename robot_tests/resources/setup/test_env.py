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
TEST_CASDOOR_PORT = os.getenv('TEST_CASDOOR_PORT', '8282')
TEST_MONGO_PORT = os.getenv('TEST_MONGO_PORT', '27118')
TEST_REDIS_PORT = os.getenv('TEST_REDIS_PORT', '6480')
TEST_POSTGRES_PORT = os.getenv('TEST_POSTGRES_PORT', '5433')

# API URLs
BACKEND_URL = f'http://localhost:{TEST_BACKEND_PORT}'
CASDOOR_URL = f'http://localhost:{TEST_CASDOOR_PORT}'
MONGODB_URI = f'mongodb://localhost:{TEST_MONGO_PORT}'

# Frontend URL (for browser tests)
FRONTEND_URL = os.getenv('FRONTEND_URL', 'http://localhost:3001')
WEB_URL = FRONTEND_URL  # Alias matching old test convention

# Legacy variable names (for compatibility)
BACKEND_PORT = TEST_BACKEND_PORT

# Casdoor Configuration
CASDOOR_CLIENT_ID = os.getenv('CASDOOR_CLIENT_ID', 'ushadow')
CASDOOR_ORG_NAME = os.getenv('CASDOOR_ORG_NAME', 'ushadow')  # matches .env.test key
CASDOOR_ORGANIZATION = CASDOOR_ORG_NAME  # legacy alias

# Individual variables for Robot Framework
TEST_USER_EMAIL = "test@example.com"
TEST_USER_PASSWORD = "test-password"

# API Endpoints
ENDPOINTS = {
    "health": "/health",
    "readiness": "/readiness",
    "auth_login": "/api/auth/login",
    "casdoor_health": f"{CASDOOR_URL}/api/health"
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

# Casdoor app credentials (test environment uses a fixed secret)
CASDOOR_CLIENT_SECRET = os.getenv('CASDOOR_CLIENT_SECRET', 'test-casdoor-secret')

# App-level admin user (created in ushadow org by casdoor-provision for ROPC/CLI auth)
CASDOOR_APP_ADMIN_USER     = os.getenv('CASDOOR_APP_ADMIN_USER', 'admin')
CASDOOR_APP_ADMIN_PASSWORD = os.getenv('CASDOOR_APP_ADMIN_PASSWORD', 'ushadow')

# Docker Container Names (test environment)
TEST_COMPOSE_PROJECT_NAME = os.getenv('COMPOSE_PROJECT_NAME', 'ushadow-test')
COMPOSE_PROJECT_NAME = TEST_COMPOSE_PROJECT_NAME  # legacy alias
BACKEND_CONTAINER = f"{COMPOSE_PROJECT_NAME}-backend-test-1"
CASDOOR_CONTAINER = f"{COMPOSE_PROJECT_NAME}-casdoor-test-1"
CASDOOR_DB_CONTAINER = f"{COMPOSE_PROJECT_NAME}-casdoor-db-test-1"
MONGO_CONTAINER = f"{COMPOSE_PROJECT_NAME}-mongo-test-1"
REDIS_CONTAINER = f"{COMPOSE_PROJECT_NAME}-redis-test-1"

# Docker compose file path
DOCKER_COMPOSE_FILE = str((ROBOT_TESTS_DIR / "docker-compose-test.yml").absolute())
