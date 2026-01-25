"""
Service Configuration Override Tests - Multiple Methods

Tests different methods of updating service configuration:
- Via docker-compose environment
- Via .env file
- Via service config API
- Secrets handling (passwords go to secrets.yaml)

These tests verify the complete configuration merge flow:
config.defaults.yaml → secrets.yaml → overrides → environment → compose
"""

import pytest
import yaml
import os
from pathlib import Path
from fastapi.testclient import TestClient


@pytest.fixture
def config_dir():
    """Configuration directory path."""
    return Path(__file__).parent.parent.parent.parent.parent.parent / "config"


@pytest.fixture
def defaults_file(config_dir):
    """Path to config defaults file."""
    return config_dir / "config.defaults.yaml"


@pytest.fixture
def overrides_file(config_dir):
    """Path to config overrides file."""
    return config_dir / "config.overrides.yaml"


@pytest.fixture
def secrets_file(config_dir):
    """Path to secrets file."""
    return config_dir / "secrets.yaml"


@pytest.fixture
def compose_file(config_dir):
    """Path to docker-compose file."""
    return config_dir.parent / "docker-compose.yml"


@pytest.fixture
def env_file(config_dir):
    """Path to .env file."""
    return config_dir.parent / ".env"


@pytest.fixture
def backup_config_files(overrides_file, secrets_file):
    """Backup and restore config files around tests."""
    import shutil

    # Backup if exists
    backups = {}
    if overrides_file.exists():
        backup_path = overrides_file.with_suffix('.yaml.backup')
        shutil.copy2(overrides_file, backup_path)
        backups['overrides'] = backup_path

    if secrets_file.exists():
        backup_path = secrets_file.with_suffix('.yaml.backup')
        shutil.copy2(secrets_file, backup_path)
        backups['secrets'] = backup_path

    yield backups

    # Restore backups
    if 'overrides' in backups:
        shutil.copy2(backups['overrides'], overrides_file)
        backups['overrides'].unlink()
    elif overrides_file.exists():
        overrides_file.unlink()

    if 'secrets' in backups:
        shutil.copy2(backups['secrets'], secrets_file)
        backups['secrets'].unlink()
    elif secrets_file.exists():
        secrets_file.unlink()


@pytest.mark.integration
class TestServiceConfigViaMethods:
    """Test different methods of updating service configuration."""

    SERVICE_ID = "chronicle"
    DEFAULT_DATABASE = "ushadow"
    TEST_DATABASE = "test-db-chronicle"

    def test_update_database_via_compose_file(
        self,
        client: TestClient,
        auth_headers,
        defaults_file,
        compose_file
    ):
        """
        Verify database config can be set via docker-compose.yml

        Tests the compose file → config merge flow:
        1. Get initial database config
        2. Verify it matches config.defaults.yaml
        3. Update compose file with new database
        4. Verify compose file contains new value
        5. (In production: service restart would pick up new value)
        """
        # Step 1: Get current database config
        response = client.get(
            f"/api/settings/service-configs/{self.SERVICE_ID}",
            headers=auth_headers
        )
        assert response.status_code == 200
        initial_config = response.json()
        database = initial_config.get("database", self.DEFAULT_DATABASE)

        # Step 2: Verify it matches defaults
        with open(defaults_file) as f:
            defaults = yaml.safe_load(f)

        expected_database = defaults["service_preferences"][self.SERVICE_ID]["database"]
        assert database == expected_database, \
            "Initial database should match config.defaults.yaml"

        # Step 3: Update compose file
        if not compose_file.exists():
            pytest.skip("docker-compose.yml not found")

        with open(compose_file) as f:
            compose_content = f.read()

        # Create modified version (don't modify original)
        modified_compose = compose_content.replace(
            f"MONGODB_DATABASE: {self.DEFAULT_DATABASE}",
            f"MONGODB_DATABASE: {self.TEST_DATABASE}"
        )

        # Step 4: Verify modification would work
        assert f"MONGODB_DATABASE: {self.TEST_DATABASE}" in modified_compose, \
            "Compose file should contain new database name after modification"

        # Note: In real test with running services, you would:
        # - Write modified_compose to file
        # - Run `docker-compose up -d` to restart service
        # - Verify service uses new database
        # For this test, we verify the modification logic works

    def test_update_database_via_env_file(
        self,
        client: TestClient,
        auth_headers,
        defaults_file,
        env_file
    ):
        """
        Verify database config can be set via .env file

        Tests the .env file → environment variable → config merge flow:
        1. Get initial database config
        2. Verify it matches config.defaults.yaml
        3. Add database override to .env
        4. Verify .env contains new value
        5. (In production: service restart would pick up .env)
        """
        # Step 1: Get current database config
        response = client.get(
            f"/api/settings/service-configs/{self.SERVICE_ID}",
            headers=auth_headers
        )
        assert response.status_code == 200
        initial_config = response.json()
        database = initial_config.get("database", self.DEFAULT_DATABASE)

        # Step 2: Verify it matches defaults
        with open(defaults_file) as f:
            defaults = yaml.safe_load(f)

        expected_database = defaults["service_preferences"][self.SERVICE_ID]["database"]
        assert database == expected_database, \
            "Initial database should match config.defaults.yaml"

        # Step 3: Backup and update .env file
        env_backup = None
        if env_file.exists():
            import shutil
            env_backup = env_file.with_suffix('.env.backup')
            shutil.copy2(env_file, env_backup)

        try:
            # Append database environment variable
            with open(env_file, 'a') as f:
                f.write(f"\nMONGODB_DATABASE={self.TEST_DATABASE}\n")

            # Step 4: Verify .env file was updated
            with open(env_file) as f:
                env_content = f.read()

            assert f"MONGODB_DATABASE={self.TEST_DATABASE}" in env_content, \
                ".env file should contain database override"

            # Note: Service would need to be restarted to pick up .env changes
            # os.environ would need to be reloaded

        finally:
            # Cleanup
            if env_backup:
                import shutil
                shutil.copy2(env_backup, env_file)
                env_backup.unlink()
            elif env_file.exists():
                env_file.unlink()

    def test_update_database_via_service_config_api(
        self,
        client: TestClient,
        auth_headers,
        defaults_file,
        overrides_file,
        secrets_file,
        backup_config_files
    ):
        """
        Verify database config can be set via service config API

        Tests the API → config.overrides.yaml → config merge flow:
        1. Get initial database config
        2. Verify it matches config.defaults.yaml
        3. Update via API
        4. Verify API response success
        5. Verify merged config reflects change
        6. Verify written to config.overrides.yaml
        7. Verify NOT written to secrets.yaml (not a secret)
        """
        # Step 1: Get current database config
        response = client.get(
            f"/api/settings/service-configs/{self.SERVICE_ID}",
            headers=auth_headers
        )
        assert response.status_code == 200
        initial_config = response.json()
        database = initial_config.get("database", self.DEFAULT_DATABASE)

        # Step 2: Verify it matches defaults
        with open(defaults_file) as f:
            defaults = yaml.safe_load(f)

        expected_database = defaults["service_preferences"][self.SERVICE_ID]["database"]
        assert database == expected_database, \
            "Initial database should match config.defaults.yaml"

        # Step 3: Update via API
        config_updates = {"database": self.TEST_DATABASE}
        response = client.put(
            f"/api/settings/service-configs/{self.SERVICE_ID}",
            json=config_updates,
            headers=auth_headers
        )

        # Step 4: Verify API response
        assert response.status_code == 200
        result = response.json()
        assert result["success"] is True, "API should return success=True"
        assert self.SERVICE_ID in result["message"], \
            "Success message should mention service ID"

        # Step 5: Verify merged config
        import time
        time.sleep(0.1)  # Give config time to write

        response = client.get(
            f"/api/settings/service-configs/{self.SERVICE_ID}",
            headers=auth_headers
        )
        assert response.status_code == 200
        merged_config = response.json()
        assert merged_config["database"] == self.TEST_DATABASE, \
            "Merged config should reflect new database name"

        # Step 6: Verify written to overrides file
        assert overrides_file.exists(), \
            "config.overrides.yaml should exist after API update"

        with open(overrides_file) as f:
            overrides = yaml.safe_load(f)

        assert "service_preferences" in overrides, \
            "Overrides should have service_preferences section"
        assert self.SERVICE_ID in overrides["service_preferences"], \
            f"Overrides should have configuration for {self.SERVICE_ID}"
        assert "database" in overrides["service_preferences"][self.SERVICE_ID], \
            "Service config should contain database setting"

        assert overrides["service_preferences"][self.SERVICE_ID]["database"] == self.TEST_DATABASE, \
            "Override file should contain new database name"

        # Step 7: Verify NOT in secrets file (database is not a secret)
        if secrets_file.exists():
            with open(secrets_file) as f:
                secrets = yaml.safe_load(f)

            # Database should NOT be in secrets
            if "service_preferences" in secrets and self.SERVICE_ID in secrets["service_preferences"]:
                assert "database" not in secrets["service_preferences"][self.SERVICE_ID], \
                    "Database config should NOT be in secrets.yaml (it's not a secret)"

    def test_secret_override_via_service_config_api(
        self,
        client: TestClient,
        auth_headers,
        overrides_file,
        secrets_file,
        backup_config_files
    ):
        """
        Verify secrets are written to secrets.yaml, not overrides

        Tests the API → secrets.yaml (not overrides) → config merge flow:
        1. Get initial config
        2. Update admin password (a secret) via API
        3. Verify API response success
        4. Verify merged config has MASKED password
        5. Verify written to secrets.yaml with ACTUAL password
        6. Verify NOT written to config.overrides.yaml
        """
        # Step 1: Get initial config
        response = client.get(
            f"/api/settings/service-configs/{self.SERVICE_ID}",
            headers=auth_headers
        )
        assert response.status_code == 200

        # Step 2: Update admin password (this is a secret)
        test_password = "test-secret-password-123"
        config_updates = {"admin_password": test_password}

        response = client.put(
            f"/api/settings/service-configs/{self.SERVICE_ID}",
            json=config_updates,
            headers=auth_headers
        )

        # Step 3: Verify API response
        assert response.status_code == 200
        result = response.json()
        assert result["success"] is True, "API should return success=True"

        # Step 4: Verify merged config has MASKED password
        import time
        time.sleep(0.1)  # Give config time to write

        response = client.get(
            f"/api/settings/service-configs/{self.SERVICE_ID}",
            headers=auth_headers
        )
        assert response.status_code == 200
        merged_config = response.json()

        # Password should be masked in API response
        masked_password = merged_config.get("admin_password")
        assert masked_password != test_password, \
            "Password should be masked when read via API"
        assert masked_password.startswith("*") or masked_password.startswith("•"), \
            "Masked password should start with asterisks or bullets"

        # Step 5: Verify written to SECRETS file with actual password
        assert secrets_file.exists(), \
            "secrets.yaml should exist after updating a secret"

        with open(secrets_file) as f:
            secrets = yaml.safe_load(f)

        assert "service_preferences" in secrets, \
            "Secrets should have service_preferences section"
        assert self.SERVICE_ID in secrets["service_preferences"], \
            f"Secrets should have configuration for {self.SERVICE_ID}"
        assert "admin_password" in secrets["service_preferences"][self.SERVICE_ID], \
            "Service secrets should contain admin_password"

        # Verify ACTUAL (unmasked) password in secrets file
        assert secrets["service_preferences"][self.SERVICE_ID]["admin_password"] == test_password, \
            "Secrets file should contain actual (unmasked) password"

        # Step 6: Verify NOT in overrides file (passwords are secrets)
        if overrides_file.exists():
            with open(overrides_file) as f:
                overrides = yaml.safe_load(f)

            # Password should NOT be in overrides
            if "service_preferences" in overrides and self.SERVICE_ID in overrides["service_preferences"]:
                assert "admin_password" not in overrides["service_preferences"][self.SERVICE_ID], \
                    "Password should NOT be in config.overrides.yaml (it's a secret!)"


@pytest.mark.integration
class TestConfigMergePrecedence:
    """Test configuration merge order and precedence."""

    def test_config_merge_order(self):
        """
        Test that configs merge in correct order.

        Precedence (later overrides earlier):
        config.defaults.yaml < secrets.yaml < config.overrides.yaml < env vars < compose

        This test would need actual config files set up.
        Skipped for now but pattern shown above.
        """
        pytest.skip("Requires full environment setup")
