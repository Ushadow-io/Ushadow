"""
Tests for the unified YAML parser.
"""

import pytest
from pathlib import Path
import tempfile
import os

# Add src to path for imports
import sys
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from config.yaml_parser import (
    BaseYAMLParser,
    ComposeParser,
    ComposeEnvVar,
    ComposeService,
    ParsedCompose,
)


class TestBaseYAMLParser:
    """Tests for BaseYAMLParser."""

    def test_get_nested(self):
        parser = BaseYAMLParser()
        data = {
            "services": {
                "mem0": {
                    "image": "test:latest",
                    "environment": ["FOO=bar"]
                }
            }
        }

        assert parser.get_nested(data, "services.mem0.image") == "test:latest"
        assert parser.get_nested(data, "services.mem0.missing", "default") == "default"
        assert parser.get_nested(data, "nonexistent.path") is None

    def test_set_nested(self):
        parser = BaseYAMLParser()
        data = {}

        parser.set_nested(data, "services.mem0.enabled", True)
        assert data == {"services": {"mem0": {"enabled": True}}}

    def test_merge(self):
        parser = BaseYAMLParser()
        base = {"a": 1, "b": {"c": 2, "d": 3}}
        overlay = {"b": {"c": 20, "e": 5}, "f": 6}

        result = parser.merge(base, overlay)
        assert result == {"a": 1, "b": {"c": 20, "d": 3, "e": 5}, "f": 6}


class TestComposeParser:
    """Tests for ComposeParser."""

    def test_parse_env_var_bare(self):
        """Bare variable name is required."""
        parser = ComposeParser()
        result = parser._parse_env_item("OPENAI_API_KEY")

        assert result.name == "OPENAI_API_KEY"
        assert result.is_required is True
        assert result.has_default is False
        assert result.default_value is None

    def test_parse_env_var_with_value(self):
        """Variable with plain value has default."""
        parser = ComposeParser()
        result = parser._parse_env_item("QDRANT_HOST=qdrant")

        assert result.name == "QDRANT_HOST"
        assert result.is_required is False
        assert result.has_default is True
        assert result.default_value == "qdrant"

    def test_parse_env_var_with_interpolation_and_default(self):
        """Variable with ${VAR:-default} has default."""
        parser = ComposeParser()
        result = parser._parse_env_item("QDRANT_HOST=${QDRANT_HOST:-qdrant}")

        assert result.name == "QDRANT_HOST"
        assert result.is_required is False
        assert result.has_default is True
        assert result.default_value == "qdrant"

    def test_parse_env_var_with_interpolation_no_default(self):
        """Variable with ${VAR} (no default) is required."""
        parser = ComposeParser()
        result = parser._parse_env_item("API_KEY=${API_KEY}")

        assert result.name == "API_KEY"
        assert result.is_required is True
        assert result.has_default is False

    def test_parse_env_var_with_empty_default(self):
        """Variable with ${VAR:-} (empty default) is required."""
        parser = ComposeParser()
        result = parser._parse_env_item("API_KEY=${API_KEY:-}")

        assert result.name == "API_KEY"
        assert result.is_required is True
        assert result.has_default is False
        assert result.default_value is None

    def test_parse_env_var_empty_value(self):
        """Variable with empty value is required."""
        parser = ComposeParser()
        result = parser._parse_env_item("OPENAI_API_KEY=")

        assert result.name == "OPENAI_API_KEY"
        assert result.is_required is True
        assert result.has_default is False

    def test_parse_env_vars_list_format(self):
        """Parse list format environment section."""
        parser = ComposeParser()
        env_list = [
            "REQUIRED_VAR",
            "WITH_DEFAULT=${VAR:-default}",
            "PLAIN_VALUE=value",
        ]

        result = parser._parse_env_vars(env_list)

        assert len(result) == 3
        assert result[0].name == "REQUIRED_VAR"
        assert result[0].is_required is True
        assert result[1].name == "WITH_DEFAULT"
        assert result[1].default_value == "default"
        assert result[2].name == "PLAIN_VALUE"
        assert result[2].default_value == "value"

    def test_parse_env_vars_dict_format(self):
        """Parse dict format environment section."""
        parser = ComposeParser()
        env_dict = {
            "REQUIRED_VAR": None,
            "WITH_DEFAULT": "${VAR:-default}",
            "PLAIN_VALUE": "value",
        }

        result = parser._parse_env_vars(env_dict)

        assert len(result) == 3
        # Find each by name since dict order may vary
        required = next(e for e in result if e.name == "REQUIRED_VAR")
        with_default = next(e for e in result if e.name == "WITH_DEFAULT")
        plain = next(e for e in result if e.name == "PLAIN_VALUE")

        assert required.is_required is True
        assert with_default.default_value == "default"
        assert plain.default_value == "value"

    def test_parse_depends_on_short_form(self):
        """Parse short form depends_on."""
        parser = ComposeParser()
        result = parser._parse_depends_on(["qdrant", "neo4j"])
        assert result == ["qdrant", "neo4j"]

    def test_parse_depends_on_long_form(self):
        """Parse long form depends_on."""
        parser = ComposeParser()
        result = parser._parse_depends_on({
            "qdrant": {"condition": "service_healthy"},
            "neo4j": {"condition": "service_started"},
        })
        assert set(result) == {"qdrant", "neo4j"}

    def test_parse_ports(self):
        """Parse various port formats."""
        parser = ComposeParser()

        result = parser._parse_ports([
            "8080:80",
            "8765:8765/tcp",
            "${PORT:-3000}:3000",
        ])

        assert len(result) == 3
        assert result[0] == {"host": "8080", "container": "80"}
        assert result[1] == {"host": "8765", "container": "8765"}
        assert result[2] == {"host": "${PORT:-3000}", "container": "3000"}

    def test_parse_full_compose(self):
        """Parse a complete compose file."""
        parser = ComposeParser()

        compose_content = """
x-ushadow:
  mem0:
    requires: [llm]
  mem0-ui:
    requires: []

services:
  mem0:
    image: ghcr.io/ushadow-io/u-mem0-api:latest
    environment:
      - OPENAI_API_KEY
      - OPENAI_BASE_URL
      - QDRANT_HOST=${QDRANT_HOST:-qdrant}
    ports:
      - "8765:8765"
    depends_on:
      qdrant:
        condition: service_healthy

  mem0-ui:
    image: ghcr.io/ushadow-io/u-mem0-ui:latest
    profiles:
      - ui
    ports:
      - "3002:3000"
    depends_on:
      - mem0

networks:
  ushadow-network:
    external: true

volumes:
  mem0_data:
"""

        # Write to temp file
        with tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False) as f:
            f.write(compose_content)
            temp_path = f.name

        try:
            result = parser.parse(temp_path)

            # Check structure
            assert len(result.services) == 2
            assert "mem0" in result.services
            assert "mem0-ui" in result.services

            # Check mem0 service
            mem0 = result.services["mem0"]
            assert mem0.image == "ghcr.io/ushadow-io/u-mem0-api:latest"
            assert mem0.requires == ["llm"]
            assert len(mem0.env_vars) == 3
            assert len(mem0.required_env_vars) == 2  # OPENAI_API_KEY, OPENAI_BASE_URL
            assert len(mem0.optional_env_vars) == 1  # QDRANT_HOST
            assert mem0.depends_on == ["qdrant"]

            # Check mem0-ui service
            mem0_ui = result.services["mem0-ui"]
            assert mem0_ui.profiles == ["ui"]
            assert mem0_ui.requires == []
            assert mem0_ui.depends_on == ["mem0"]

            # Check networks and volumes
            assert "ushadow-network" in result.networks
            assert "mem0_data" in result.volumes

        finally:
            os.unlink(temp_path)

    def test_get_services_requiring(self):
        """Test filtering services by capability."""
        parser = ComposeParser()

        compose_content = """
x-ushadow:
  service1:
    requires: [llm]
  service2:
    requires: [llm, transcription]
  service3:
    requires: [transcription]

services:
  service1:
    image: test1
  service2:
    image: test2
  service3:
    image: test3
"""

        with tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False) as f:
            f.write(compose_content)
            temp_path = f.name

        try:
            result = parser.parse(temp_path)

            llm_services = result.get_services_requiring("llm")
            assert len(llm_services) == 2
            assert {s.name for s in llm_services} == {"service1", "service2"}

            transcription_services = result.get_services_requiring("transcription")
            assert len(transcription_services) == 2
            assert {s.name for s in transcription_services} == {"service2", "service3"}

        finally:
            os.unlink(temp_path)


class TestWithRealComposeFile:
    """Tests using the actual compose file in the repo."""

    @pytest.fixture
    def compose_path(self):
        """Get path to the real openmemory compose file."""
        # Navigate from tests dir to compose dir
        base = Path(__file__).parent.parent.parent.parent  # wizard-framework
        compose_file = base / "compose" / "openmemory-compose.yaml"
        if compose_file.exists():
            return compose_file
        pytest.skip("Compose file not found")

    def test_parse_real_compose(self, compose_path):
        """Parse the actual openmemory compose file."""
        parser = ComposeParser()
        result = parser.parse(compose_path)

        # Should have services
        assert len(result.services) > 0

        # mem0 service should exist
        if "mem0" in result.services:
            mem0 = result.services["mem0"]
            assert mem0.image is not None
            # Should have some env vars
            assert len(mem0.env_vars) > 0
            print(f"\nmem0 service:")
            print(f"  Image: {mem0.image}")
            print(f"  Required env vars: {[e.name for e in mem0.required_env_vars]}")
            print(f"  Optional env vars: {[e.name for e in mem0.optional_env_vars]}")
            print(f"  Requires: {mem0.requires}")


if __name__ == "__main__":
    # Run a quick test
    print("Running quick validation...")

    parser = ComposeParser()

    # Test env var parsing
    tests = [
        ("BARE_VAR", True, None),
        ("WITH_VALUE=test", False, "test"),
        ("WITH_DEFAULT=${VAR:-default}", False, "default"),
        ("NO_DEFAULT=${VAR}", True, None),
        ("EMPTY_DEFAULT=${VAR:-}", True, None),  # Empty default = required
    ]

    for input_str, expected_required, expected_default in tests:
        result = parser._parse_env_item(input_str)
        assert result.is_required == expected_required, f"Failed for {input_str}"
        assert result.default_value == expected_default, f"Failed for {input_str}"
        print(f"  {input_str}")

    print("All tests passed!")
