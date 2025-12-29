"""
Config Parser - Simple YAML-based configuration management.

Manages two separate files:
- config.yaml: Non-sensitive configuration
- secrets.yaml: Sensitive data (API keys, passwords)
"""

import shutil
from pathlib import Path
from typing import Optional
from ruamel.yaml import YAML
from pydantic import BaseModel

from .config_schema import ChronicleConfig
from .secrets_schema import SecretsConfig

yaml = YAML()
yaml.default_flow_style = False
yaml.preserve_quotes = True
yaml.width = 400  # Set wider column width (default is 80)


class CombinedConfig(BaseModel):
    """
    Combined configuration that merges config.yaml and secrets.yaml.

    Provides backward compatibility by exposing secrets at the top level.
    """

    # From config.yaml
    version: str
    wizard_completed: bool
    auth: object  # Will merge with secrets
    speech_detection: object
    conversation: object
    audio_processing: object
    diarization: object
    llm: object
    providers: object
    network: object
    infrastructure: object
    misc: object

    # From secrets.yaml
    api_keys: object

    class Config:
        arbitrary_types_allowed = True


class ConfigParser:
    """Configuration parser that manages config.yaml and secrets.yaml."""

    def __init__(
        self,
        config_path: str = "config/config.yaml",
        secrets_path: str = "config/secrets.yaml",
        config_defaults: str = None,
        secrets_defaults: str = None
    ):
        self.config_path = Path(config_path)
        self.secrets_path = Path(secrets_path)

        # Auto-determine defaults paths
        if config_defaults is None:
            config_defaults = str(self.config_path.parent / "config.defaults.yaml")
        if secrets_defaults is None:
            secrets_defaults = str(self.secrets_path.parent / "secrets.defaults.yaml")

        self.config_defaults = Path(config_defaults)
        self.secrets_defaults = Path(secrets_defaults)

    async def load(self) -> CombinedConfig:
        """Load and merge configuration from both YAML files."""
        # Load main config
        if not self.config_path.exists():
            if self.config_defaults.exists():
                shutil.copy(self.config_defaults, self.config_path)
                config = ChronicleConfig()
            else:
                config = ChronicleConfig()
        else:
            with open(self.config_path) as f:
                data = yaml.load(f) or {}
            config = ChronicleConfig(**data)

        # Load secrets
        if not self.secrets_path.exists():
            if self.secrets_defaults.exists():
                shutil.copy(self.secrets_defaults, self.secrets_path)
                secrets = SecretsConfig()
            else:
                secrets = SecretsConfig()
        else:
            with open(self.secrets_path) as f:
                data = yaml.load(f) or {}
            secrets = SecretsConfig(**data)

        # Merge into combined config
        combined = CombinedConfig(
            version=config.version,
            wizard_completed=config.wizard_completed,
            auth=self._merge_auth(config.auth, secrets.auth),
            speech_detection=config.speech_detection,
            conversation=config.conversation,
            audio_processing=config.audio_processing,
            diarization=config.diarization,
            llm=config.llm,
            providers=config.providers,
            network=config.network,
            infrastructure=config.infrastructure,
            misc=config.misc,
            api_keys=secrets.api_keys,
        )

        return combined

    def _merge_auth(self, config_auth, secrets_auth):
        """Merge auth config and secrets."""
        from pydantic import BaseModel

        class MergedAuth(BaseModel):
            admin_name: str
            admin_email: str
            secret_key: str
            admin_password_hash: str

            class Config:
                arbitrary_types_allowed = True

        return MergedAuth(
            admin_name=config_auth.admin_name,
            admin_email=config_auth.admin_email,
            secret_key=secrets_auth.secret_key,
            admin_password_hash=secrets_auth.admin_password_hash,
        )

    async def save(self, config: CombinedConfig) -> None:
        """Save configuration to both YAML files."""
        self.config_path.parent.mkdir(parents=True, exist_ok=True)

        # Extract and save main config
        main_config = ChronicleConfig(
            version=config.version,
            wizard_completed=config.wizard_completed,
            auth={
                "admin_name": config.auth.admin_name,
                "admin_email": config.auth.admin_email,
            },
            speech_detection=config.speech_detection,
            conversation=config.conversation,
            audio_processing=config.audio_processing,
            diarization=config.diarization,
            llm=config.llm,
            providers=config.providers,
            network=config.network,
            infrastructure=config.infrastructure,
            misc=config.misc,
        )

        with open(self.config_path, 'w') as f:
            yaml.dump(main_config.model_dump(mode='json'), f)

        # Extract and save secrets
        secrets_config = SecretsConfig(
            api_keys=config.api_keys,
            auth={
                "secret_key": config.auth.secret_key,
                "admin_password_hash": config.auth.admin_password_hash,
            }
        )

        with open(self.secrets_path, 'w') as f:
            yaml.dump(secrets_config.model_dump(mode='json'), f)

        # Invalidate app_config cache after saving
        try:
            from advanced_omi_backend.app_config import get_app_config
            app_config = get_app_config()
            app_config.reload_config()
        except Exception as e:
            # Don't fail the save if cache invalidation fails
            import logging
            logging.getLogger(__name__).warning(f"Failed to invalidate app_config cache: {e}")

    async def update(self, updates: dict) -> None:
        """Update specific config fields and save."""
        config = await self.load()

        for key, value in updates.items():
            if hasattr(config, key):
                setattr(config, key, value)

        await self.save(config)


# Global instance
_config_parser: Optional[ConfigParser] = None


def init_config_parser(config_path: str = "config.yaml") -> ConfigParser:
    """Initialize global config parser."""
    global _config_parser
    _config_parser = ConfigParser(config_path)
    return _config_parser


def get_config_parser() -> ConfigParser:
    """Get global config parser instance."""
    if _config_parser is None:
        raise RuntimeError("ConfigParser not initialized")
    return _config_parser
