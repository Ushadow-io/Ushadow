"""
LLM Client Service - Unified interface for LLM providers using LiteLLM.

Uses the capability system to get credentials for the selected provider,
then calls LiteLLM with the appropriate model format.

Provider mapping:
- openai -> openai/gpt-4o-mini (or configured model)
- anthropic -> anthropic/claude-3-5-sonnet-20241022
- ollama -> ollama/llama3.1:latest
- openai-compatible -> openai/<model> with custom base_url
"""

import logging
from typing import AsyncIterator, List, Optional, Dict, Any

import litellm
from litellm import acompletion

from src.services.provider_registry import get_provider_registry
from src.config.omegaconf_settings import get_settings_store

logger = logging.getLogger(__name__)

# Map our provider IDs to litellm provider prefixes
PROVIDER_PREFIX_MAP = {
    "openai": "openai",
    "anthropic": "anthropic",
    "ollama": "ollama",
    "openai-compatible": "openai",  # Uses OpenAI format with custom base_url
}


class LLMClient:
    """
    Unified LLM client that uses the capability system for credentials.

    Supports streaming and non-streaming completions across all configured
    LLM providers (OpenAI, Anthropic, Ollama, OpenAI-compatible).
    """

    def __init__(self):
        self._settings = get_settings_store()
        self._provider_registry = get_provider_registry()

    async def get_llm_config(self) -> Dict[str, Any]:
        """
        Get the current LLM configuration from the capability system.

        Returns:
            Dict with keys: provider_id, model, api_key, base_url
        """
        # Get selected provider for 'llm' capability
        selected_provider_id = await self._settings.get("selected_providers.llm", "openai")
        provider = self._provider_registry.get_provider(selected_provider_id)

        if not provider:
            raise ValueError(f"LLM provider '{selected_provider_id}' not found")

        # Build config from provider's env_maps
        config = {
            "provider_id": selected_provider_id,
            "provider_prefix": PROVIDER_PREFIX_MAP.get(selected_provider_id, "openai"),
        }

        for env_map in provider.env_maps:
            # Get value from settings or use default
            value = None
            if env_map.settings_path:
                value = await self._settings.get(env_map.settings_path)
            if value is None and env_map.default:
                value = env_map.default

            # Map to our config keys
            if env_map.key == "api_key":
                config["api_key"] = value
            elif env_map.key == "base_url":
                config["base_url"] = value
            elif env_map.key == "model":
                config["model"] = value

        return config

    def _build_litellm_model(self, config: Dict[str, Any]) -> str:
        """
        Build the litellm model string from config.

        Format: provider/model (e.g., openai/gpt-4o-mini, anthropic/claude-3-5-sonnet)
        """
        prefix = config.get("provider_prefix", "openai")
        model = config.get("model", "gpt-4o-mini")

        # For ollama, the model already includes the tag (e.g., llama3.1:latest)
        # For others, just use the model name
        return f"{prefix}/{model}"

    async def completion(
        self,
        messages: List[Dict[str, str]],
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Non-streaming completion.

        Args:
            messages: List of message dicts with 'role' and 'content'
            temperature: Optional temperature override
            max_tokens: Optional max tokens override
            **kwargs: Additional litellm parameters

        Returns:
            LiteLLM response dict
        """
        config = await self.get_llm_config()
        model = self._build_litellm_model(config)

        # Get temperature from settings if not provided
        if temperature is None:
            temperature = await self._settings.get("llm.chat_temperature", 0.7)

        # Build litellm kwargs
        litellm_kwargs = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            **kwargs
        }

        # Add API key if present
        if config.get("api_key"):
            litellm_kwargs["api_key"] = config["api_key"]

        # Add base URL for custom endpoints
        if config.get("base_url"):
            litellm_kwargs["api_base"] = config["base_url"]

        if max_tokens:
            litellm_kwargs["max_tokens"] = max_tokens

        logger.info(f"LLM completion: model={model}")

        response = await acompletion(**litellm_kwargs)
        return response

    async def stream_completion(
        self,
        messages: List[Dict[str, str]],
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        **kwargs
    ) -> AsyncIterator[str]:
        """
        Streaming completion - yields content chunks.

        Args:
            messages: List of message dicts with 'role' and 'content'
            temperature: Optional temperature override
            max_tokens: Optional max tokens override
            **kwargs: Additional litellm parameters

        Yields:
            Content string chunks as they arrive
        """
        config = await self.get_llm_config()
        model = self._build_litellm_model(config)

        # Get temperature from settings if not provided
        if temperature is None:
            temperature = await self._settings.get("llm.chat_temperature", 0.7)

        # Build litellm kwargs
        litellm_kwargs = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "stream": True,
            **kwargs
        }

        # Add API key if present
        if config.get("api_key"):
            litellm_kwargs["api_key"] = config["api_key"]

        # Add base URL for custom endpoints
        if config.get("base_url"):
            litellm_kwargs["api_base"] = config["base_url"]

        if max_tokens:
            litellm_kwargs["max_tokens"] = max_tokens

        logger.info(f"LLM streaming: model={model}")

        response = await acompletion(**litellm_kwargs)

        async for chunk in response:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    async def is_configured(self) -> bool:
        """Check if LLM is properly configured with required credentials."""
        try:
            config = await self.get_llm_config()
            provider_id = config.get("provider_id", "")

            # Ollama doesn't need an API key
            if provider_id == "ollama":
                return bool(config.get("base_url"))

            # Cloud providers need an API key
            return bool(config.get("api_key"))
        except Exception as e:
            logger.warning(f"LLM config check failed: {e}")
            return False


# Global singleton
_llm_client: Optional[LLMClient] = None


def get_llm_client() -> LLMClient:
    """Get the global LLMClient instance."""
    global _llm_client
    if _llm_client is None:
        _llm_client = LLMClient()
    return _llm_client
