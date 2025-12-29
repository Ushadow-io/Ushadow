"""
Provider Registry - Loads provider definitions from YAML configuration files.

Providers implement capabilities (llm, transcription, memory) with specific
env var mappings and docker configurations. This registry loads all providers
from config/providers/*.yaml and provides query methods.
"""

import logging
from pathlib import Path
from typing import Dict, List, Optional, Any

import yaml

from src.models.provider import (
    EnvMap,
    Provider,
    Capability,
    DockerConfig,
)

logger = logging.getLogger(__name__)

# Config paths - check container mount first, then fallback to local
def _get_config_dir() -> Path:
    """Resolve config directory, handling different execution contexts."""
    # Docker container mount
    if Path("/config").exists():
        return Path("/config")
    # Running from project root
    if Path("config").exists():
        return Path("config")
    # Running from ushadow/backend
    if Path("../../config").exists():
        return Path("../../config").resolve()
    # Fallback
    return Path("config")

CONFIG_DIR = _get_config_dir()
PROVIDERS_DIR = CONFIG_DIR / "providers"
CAPABILITIES_FILE = CONFIG_DIR / "capabilities.yaml"


class ProviderRegistry:
    """
    Registry for capabilities and their providers.

    Loads from:
    - config/capabilities.yaml (capability definitions)
    - config/providers/*.yaml (provider implementations)

    Default provider selection is stored in config.defaults.yaml under selected_providers.
    """

    def __init__(self):
        self._capabilities: Dict[str, Capability] = {}
        self._providers: Dict[str, Provider] = {}
        self._providers_by_capability: Dict[str, List[Provider]] = {}
        self._loaded = False

    def _load(self) -> None:
        """Load capabilities and providers from YAML files."""
        if self._loaded:
            return

        self._load_capabilities()
        self._load_providers()
        self._loaded = True

        logger.info(
            f"ProviderRegistry loaded: {len(self._capabilities)} capabilities, "
            f"{len(self._providers)} providers"
        )

    def _load_capabilities(self) -> None:
        """Load capability definitions from capabilities.yaml."""
        try:
            if not CAPABILITIES_FILE.exists():
                logger.warning(f"Capabilities file not found: {CAPABILITIES_FILE}")
                return

            with open(CAPABILITIES_FILE, 'r') as f:
                data = yaml.safe_load(f)

            capabilities = data.get('capabilities', {})

            for cap_id, cap_data in capabilities.items():
                # Skip if no 'provides' section
                if 'provides' not in cap_data:
                    logger.debug(f"Skipping {cap_id} - no 'provides' section")
                    continue

                # Parse provides into Dict[str, str] (key -> type)
                provides = {}
                for key, key_data in cap_data.get('provides', {}).items():
                    if isinstance(key_data, dict):
                        provides[key] = key_data.get('type', 'string')
                    else:
                        provides[key] = 'string'

                capability = Capability(
                    id=cap_id,
                    description=cap_data.get('description', ''),
                    provides=provides
                )
                self._capabilities[cap_id] = capability
                self._providers_by_capability[cap_id] = []

            logger.debug(f"Loaded {len(self._capabilities)} capabilities")

        except Exception as e:
            logger.error(f"Failed to load capabilities: {e}")

    def _load_providers(self) -> None:
        """Load provider definitions from config/providers/*.yaml."""
        try:
            if not PROVIDERS_DIR.exists():
                logger.warning(f"Providers directory not found: {PROVIDERS_DIR}")
                return

            for provider_file in PROVIDERS_DIR.glob("*.yaml"):
                self._load_provider_file(provider_file)

        except Exception as e:
            logger.error(f"Failed to load providers: {e}")

    def _load_provider_file(self, file_path: Path) -> None:
        """Load providers from a single capability file."""
        try:
            with open(file_path, 'r') as f:
                data = yaml.safe_load(f)

            capability = data.get('capability')
            if not capability:
                logger.warning(f"No capability in {file_path}")
                return

            for provider_data in data.get('providers', []):
                provider = self._parse_provider(capability, provider_data)
                self._providers[provider.id] = provider

                if capability in self._providers_by_capability:
                    self._providers_by_capability[capability].append(provider)

            logger.debug(f"Loaded providers from {file_path.name}")

        except Exception as e:
            logger.error(f"Failed to load {file_path}: {e}")

    def _parse_provider(self, capability: str, data: dict) -> Provider:
        """Parse provider data into Provider model."""
        # Get capability definition to lookup credential types
        cap_def = self._capabilities.get(capability)
        cap_provides = cap_def.provides if cap_def else {}

        # Parse credentials into EnvMap list
        env_maps = []
        for key, cred_data in data.get('credentials', {}).items():
            # Get type from capability definition (now just a string)
            cred_type = cap_provides.get(key, 'string')

            if isinstance(cred_data, dict):
                # Handle backward compatibility: 'value' becomes 'default'
                default_val = cred_data.get('default') or cred_data.get('value')

                env_maps.append(EnvMap(
                    key=key,
                    env_var=cred_data.get('env_var', ''),
                    settings_path=cred_data.get('settings_path'),
                    default=default_val,
                    type=cred_type,
                    label=cred_data.get('label'),
                    link=cred_data.get('link'),
                    required=cred_data.get('required', False),
                ))
            else:
                # Simple value (e.g., api_key: "literal-value")
                env_maps.append(EnvMap(
                    key=key,
                    env_var='',
                    default=str(cred_data),
                    type=cred_type,
                ))

        # Parse docker config if present
        docker_data = data.get('docker')
        docker_config = None
        if docker_data:
            docker_config = DockerConfig(
                image=docker_data.get('image', ''),
                compose_file=docker_data.get('compose_file'),
                service_name=docker_data.get('service_name'),
                ports=docker_data.get('ports', []),
                volumes=docker_data.get('volumes', []),
                environment=docker_data.get('environment', {}),
                health=docker_data.get('health'),
            )

        # Parse UI config (inlined on Provider)
        ui_data = data.get('ui', {})

        return Provider(
            id=data['id'],
            name=data.get('name', data['id']),
            capability=capability,
            mode=data.get('mode', 'cloud'),
            description=data.get('description'),
            env_maps=env_maps,
            docker=docker_config,
            icon=ui_data.get('icon'),
            tags=ui_data.get('tags', []),
            uses=data.get('uses', []),
        )

    def reload(self) -> None:
        """Force reload all providers."""
        self._capabilities = {}
        self._providers = {}
        self._providers_by_capability = {}
        self._loaded = False
        self._load()

    # =========================================================================
    # Query Methods
    # =========================================================================

    def get_capability(self, capability_id: str) -> Optional[Capability]:
        """Get a capability definition."""
        self._load()
        return self._capabilities.get(capability_id)

    def get_capabilities(self) -> List[Capability]:
        """Get all capabilities."""
        self._load()
        return list(self._capabilities.values())

    def get_provider(self, provider_id: str) -> Optional[Provider]:
        """Get a provider by ID."""
        self._load()
        return self._providers.get(provider_id)

    def get_providers(self) -> List[Provider]:
        """Get all providers."""
        self._load()
        return list(self._providers.values())

    def find_providers(
        self,
        capability: Optional[str] = None,
        mode: Optional[str] = None
    ) -> List[Provider]:
        """
        Find providers matching criteria.

        Args:
            capability: Filter by capability (e.g., 'llm')
            mode: Filter by mode ('cloud' or 'local')

        Returns:
            List of matching providers
        """
        self._load()

        # Start with all providers or filter by capability
        if capability:
            results = self._providers_by_capability.get(capability, [])
        else:
            results = list(self._providers.values())

        # Filter by mode
        if mode:
            results = [p for p in results if p.mode == mode]

        return results

    def get_providers_for_capability(self, capability: str) -> List[Provider]:
        """Get all providers that implement a capability."""
        return self.find_providers(capability=capability)

    def get_providers_by_mode(
        self,
        capability: str,
        mode: str
    ) -> List[Provider]:
        """Get providers for a capability filtered by mode (cloud/local)."""
        return self.find_providers(capability=capability, mode=mode)

    def get_default_provider_id(
        self,
        capability: str,
        mode: str = 'cloud'
    ) -> Optional[str]:
        """
        Get the default provider ID for a capability and mode.

        NOTE: This returns hardcoded defaults. Actual user selection
        is stored in settings under selected_providers.{capability}.

        Args:
            capability: Capability ID (e.g., 'llm', 'transcription')
            mode: 'cloud' or 'local'

        Returns:
            Default provider ID or None
        """
        # Hardcoded defaults (also in config.defaults.yaml)
        defaults = {
            'llm': {'cloud': 'openai', 'local': 'ollama'},
            'transcription': {'cloud': 'deepgram', 'local': 'whisper-local'},
            'memory': {'cloud': 'mem0-cloud', 'local': 'openmemory'},
            'speaker_recognition': {'cloud': None, 'local': 'pyannote'},
        }

        cap_defaults = defaults.get(capability, {})
        return cap_defaults.get(mode)

    def get_default_provider(
        self,
        capability: str,
        mode: str = 'cloud'
    ) -> Optional[Provider]:
        """
        Get the default provider for a capability and mode.

        NOTE: This returns hardcoded defaults. Actual user selection
        is stored in settings under selected_providers.{capability}.

        Args:
            capability: Capability ID (e.g., 'llm', 'transcription')
            mode: 'cloud' or 'local'

        Returns:
            Default Provider or None
        """
        self._load()

        default_id = self.get_default_provider_id(capability, mode)
        if not default_id:
            return None

        return self._providers.get(default_id)

# Global singleton instance
_registry: Optional[ProviderRegistry] = None


def get_provider_registry() -> ProviderRegistry:
    """Get the global ProviderRegistry instance."""
    global _registry
    if _registry is None:
        _registry = ProviderRegistry()
    return _registry
