"""
Configuration Parser
Manages config.yml file for ushadow configuration
"""

import logging
import os
from pathlib import Path
from typing import Dict, Any, Optional

import yaml
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class ApiKeysConfig(BaseModel):
    """API keys configuration."""
    openai_api_key: Optional[str] = Field(default=None, description="OpenAI API key")
    anthropic_api_key: Optional[str] = Field(default=None, description="Anthropic API key")
    deepgram_api_key: Optional[str] = Field(default=None, description="Deepgram API key")
    mistral_api_key: Optional[str] = Field(default=None, description="Mistral API key")


class IntegrationConfig(BaseModel):
    """Integration settings."""
    mcp_enabled: bool = Field(default=False, description="Enable MCP integration")
    agent_zero_enabled: bool = Field(default=False, description="Enable Agent Zero")
    n8n_enabled: bool = Field(default=False, description="Enable n8n workflows")


class UshadowConfig(BaseModel):
    """Main ushadow configuration."""
    api_keys: ApiKeysConfig = Field(default_factory=ApiKeysConfig)
    integrations: IntegrationConfig = Field(default_factory=IntegrationConfig)
    custom_settings: Dict[str, Any] = Field(default_factory=dict, description="Custom user settings")


class ConfigParser:
    """
    Configuration file parser for config.yml.
    Manages loading, saving, and validating configuration.
    """

    def __init__(self, config_path: Optional[Path] = None):
        """
        Initialize config parser.

        Args:
            config_path: Path to config.yml. Defaults to ./config.yml
        """
        if config_path is None:
            # Look for config.yml in current directory or one level up
            if Path("config.yml").exists():
                config_path = Path("config.yml")
            elif Path("../config.yml").exists():
                config_path = Path("../config.yml")
            else:
                config_path = Path("config.yml")

        self.config_path = config_path
        logger.info(f"Config parser initialized with path: {self.config_path}")

    async def load(self) -> UshadowConfig:
        """
        Load configuration from config.yml.

        Returns:
            UshadowConfig instance
        """
        try:
            if not self.config_path.exists():
                logger.warning(f"Config file not found: {self.config_path}, using defaults")
                return UshadowConfig()

            with open(self.config_path, 'r') as f:
                data = yaml.safe_load(f) or {}

            # Parse into config model
            config = UshadowConfig(**data)
            logger.info("Configuration loaded successfully")
            return config

        except Exception as e:
            logger.error(f"Error loading config: {e}")
            logger.warning("Using default configuration")
            return UshadowConfig()

    async def save(self, config: UshadowConfig) -> None:
        """
        Save configuration to config.yml.

        Args:
            config: UshadowConfig instance to save
        """
        try:
            # Ensure parent directory exists
            self.config_path.parent.mkdir(parents=True, exist_ok=True)

            # Convert to dict, excluding None values
            data = config.model_dump(exclude_none=True)

            # Write to file with nice formatting
            with open(self.config_path, 'w') as f:
                yaml.safe_dump(
                    data,
                    f,
                    default_flow_style=False,
                    sort_keys=False,
                    indent=2
                )

            logger.info(f"Configuration saved to {self.config_path}")

        except Exception as e:
            logger.error(f"Error saving config: {e}")
            raise

    async def get_value(self, key: str) -> Optional[Any]:
        """
        Get a configuration value by key.

        Args:
            key: Dot-notation key (e.g., 'api_keys.openai_api_key')

        Returns:
            Configuration value or None
        """
        config = await self.load()

        # Navigate nested keys
        parts = key.split('.')
        value = config.model_dump()

        for part in parts:
            if isinstance(value, dict) and part in value:
                value = value[part]
            else:
                return None

        return value

    async def set_value(self, key: str, value: Any) -> None:
        """
        Set a configuration value by key.

        Args:
            key: Dot-notation key (e.g., 'api_keys.openai_api_key')
            value: Value to set
        """
        config = await self.load()
        data = config.model_dump()

        # Navigate and set nested value
        parts = key.split('.')
        current = data

        for part in parts[:-1]:
            if part not in current:
                current[part] = {}
            current = current[part]

        current[parts[-1]] = value

        # Save updated config
        updated_config = UshadowConfig(**data)
        await self.save(updated_config)


# Singleton instance
_config_parser: Optional[ConfigParser] = None


def get_config_parser() -> ConfigParser:
    """
    Get or create the global config parser instance.

    Returns:
        ConfigParser singleton
    """
    global _config_parser
    if _config_parser is None:
        _config_parser = ConfigParser()
    return _config_parser
