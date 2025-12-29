"""
Pydantic schema for secrets.yaml structure.

Separates sensitive configuration (API keys, passwords) from general config.
"""

from pydantic import BaseModel, Field

from advanced_omi_backend.settings_models import ApiKeysSettings


class AuthSecrets(BaseModel):
    """Authentication secrets."""

    secret_key: str = Field(
        default="",
        description="JWT signing key (auto-generated if empty)"
    )
    admin_password_hash: str = Field(
        default="",
        description="Bcrypt password hash (never store plaintext)"
    )


class SecretsConfig(BaseModel):
    """
    Root configuration model for secrets.yaml.

    Contains all sensitive information that should never be committed to version control.
    """

    # API Keys
    api_keys: ApiKeysSettings = Field(
        default_factory=ApiKeysSettings,
        description="External service API keys"
    )

    # Authentication secrets
    auth: AuthSecrets = Field(
        default_factory=AuthSecrets,
        description="Authentication secrets"
    )
