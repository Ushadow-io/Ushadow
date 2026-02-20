"""
Settings helper utilities - type inference and matching.
"""

from src.config.secrets import SENSITIVE_PATTERNS

# Patterns that indicate a URL value
URL_PATTERNS = ['url', 'endpoint', 'host', 'uri', 'server']
URL_VALUE_PATTERNS = ['http://', 'https://', 'redis://', 'mongodb://', 'postgres://', 'mysql://']


def infer_value_type(value: str) -> str:
    """Infer the type of a setting value based on its content.

    Args:
        value: The value to analyze

    Returns:
        One of: 'url', 'secret', 'bool', 'number', 'string', 'empty'
    """
    if not value:
        return 'empty'
    value_lower = value.lower().strip()

    if any(value_lower.startswith(p) for p in URL_VALUE_PATTERNS):
        return 'url'

    if value_lower.startswith('sk-') or value_lower.startswith('pk-') or '•' in value:
        return 'secret'

    if value_lower in ('true', 'false', 'yes', 'no', '1', '0'):
        return 'bool'

    try:
        float(value)
        return 'number'
    except ValueError:
        pass

    return 'string'


def infer_setting_type(name: str) -> str:
    """Infer the type of a setting from its name.

    Args:
        name: The setting name or path

    Returns:
        One of: 'secret', 'url', 'string'
    """
    name_lower = name.lower()
    if any(p in name_lower for p in SENSITIVE_PATTERNS):
        return 'secret'
    if any(p in name_lower for p in URL_PATTERNS):
        return 'url'
    return 'string'


def categorize_setting(name: str) -> str:
    """Determine which config section a setting belongs to.

    Args:
        name: The setting name

    Returns:
        Config section name: 'admin', 'api_keys', or 'security'
    """
    name_lower = name.lower()
    if 'password' in name_lower or 'admin' in name_lower:
        return 'admin'
    if any(p in name_lower for p in ['key', 'token', 'secret']):
        return 'api_keys'
    return 'security'


def env_var_matches_setting(env_name: str, setting_path: str) -> bool:
    """Check if an env var name matches a setting path.

    Treats underscores in env var as equivalent to dots in setting path.
    Also handles special prefix mappings (e.g., KC_ → keycloak.).

    Args:
        env_name: Environment variable name (e.g., "OPENAI_API_KEY")
        setting_path: Setting path (e.g., "api_keys.openai_api_key")

    Returns:
        True if they match

    Examples:
        >>> env_var_matches_setting("TRANSCRIPTION_PROVIDER", "transcription.provider")
        True
        >>> env_var_matches_setting("OPENAI_API_KEY", "api_keys.openai_api_key")
        True
        >>> env_var_matches_setting("KC_ENABLED", "keycloak.enabled")
        True
        >>> env_var_matches_setting("KC_REALM", "keycloak.realm")
        True
    """
    # Special prefix mappings for common env var conventions
    PREFIX_MAPPINGS = {
        'kc.': 'keycloak.',  # KC_* → keycloak.*
    }

    env_normalized = env_name.lower().replace('_', '.')
    path_normalized = setting_path.lower().replace('_', '.')

    # Try direct match first
    if path_normalized == env_normalized or path_normalized.endswith('.' + env_normalized):
        return True

    # Try with prefix mappings
    for env_prefix, path_prefix in PREFIX_MAPPINGS.items():
        if env_normalized.startswith(env_prefix):
            # Replace KC.* with keycloak.* and try again
            mapped_env = env_normalized.replace(env_prefix, path_prefix, 1)
            if path_normalized == mapped_env or path_normalized.endswith('.' + mapped_env):
                return True

    return False
