"""
Provider Registry - Loads provider definitions from YAML configuration files.

Providers implement capabilities (llm, transcription, memory) with specific
credentials and docker configurations. This registry loads all providers
from config/providers/*.yaml and provides query methods.
"""

import logging
from pathlib import Path
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field

import yaml

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


@dataclass
class ProviderCredential:
    """A single credential provided by a provider."""
    key: str
    env_var: Optional[str] = None        # Env var name this credential exposes
    settings_path: Optional[str] = None  # Path in settings to get value
    value: Optional[str] = None          # Literal value
    default: Optional[str] = None        # Default if settings_path missing
    label: Optional[str] = None          # UI label
    link: Optional[str] = None           # URL to get credential
    required: bool = False
    type: str = "string"                 # string, secret, url, boolean


@dataclass
class Provider:
    """A provider that implements a capability."""
    id: str
    name: str
    capability: str
    mode: str  # 'cloud' or 'local'
    description: Optional[str] = None
    credentials: Dict[str, ProviderCredential] = field(default_factory=dict)
    docker: Optional[Dict[str, Any]] = None
    config: Dict[str, Any] = field(default_factory=dict)
    uses: List[Dict[str, Any]] = field(default_factory=list)  # Nested capabilities
    depends_on: Dict[str, List[str]] = field(default_factory=dict)
    ui: Dict[str, Any] = field(default_factory=dict)


@dataclass
class Capability:
    """A capability type with its canonical interface."""
    id: str
    description: str
    provides: Dict[str, Dict[str, Any]]  # What this capability provides
    # Note: Default providers are in config.defaults.yaml under selected_providers


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

                capability = Capability(
                    id=cap_id,
                    description=cap_data.get('description', ''),
                    provides=cap_data.get('provides', {})
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
        """Parse provider data into Provider dataclass."""
        # Get capability definition to lookup credential types
        cap_def = self._capabilities.get(capability)
        cap_provides = cap_def.provides if cap_def else {}

        # Parse credentials
        credentials = {}
        for key, cred_data in data.get('credentials', {}).items():
            # Get type from capability definition, fallback to provider, then 'string'
            cred_type = cap_provides.get(key, {}).get('type', 'string')

            if isinstance(cred_data, dict):
                credentials[key] = ProviderCredential(
                    key=key,
                    env_var=cred_data.get('env_var'),
                    settings_path=cred_data.get('settings_path'),
                    value=cred_data.get('value'),
                    default=cred_data.get('default'),
                    label=cred_data.get('label'),
                    link=cred_data.get('link'),
                    required=cred_data.get('required', False),
                    type=cred_type  # From capability definition
                )
            else:
                # Simple value
                credentials[key] = ProviderCredential(
                    key=key,
                    value=str(cred_data),
                    type=cred_type  # From capability definition
                )

        return Provider(
            id=data['id'],
            name=data.get('name', data['id']),
            capability=capability,
            mode=data.get('mode', 'cloud'),
            description=data.get('description'),
            credentials=credentials,
            docker=data.get('docker'),
            config=data.get('config', {}),
            uses=data.get('uses', []),
            depends_on=data.get('depends_on', {}),
            ui=data.get('ui', {})
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

    def get_providers_for_capability(self, capability: str) -> List[Provider]:
        """Get all providers that implement a capability."""
        self._load()
        return self._providers_by_capability.get(capability, [])

    def get_providers_by_mode(
        self,
        capability: str,
        mode: str
    ) -> List[Provider]:
        """Get providers for a capability filtered by mode (cloud/local)."""
        providers = self.get_providers_for_capability(capability)
        return [p for p in providers if p.mode == mode]

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
