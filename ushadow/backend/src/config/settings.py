"""
Settings Module - Compatibility layer

Re-exports from infra_settings for backward compatibility.
"""

from src.config.infra_settings import InfraSettings, get_infra_settings

# Re-export for backward compatibility
get_settings = get_infra_settings
Settings = InfraSettings

__all__ = ['get_settings', 'Settings', 'InfraSettings', 'get_infra_settings']
