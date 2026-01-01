"""
SecretStore - Encrypted secrets storage in MongoDB.

STATUS: DRAFT - Not yet implemented. See docstring for plan.

This module will replace secrets.yaml with encrypted MongoDB storage.
Secrets are encrypted at rest using Fernet (AES-128-CBC + HMAC).

Architecture
============
┌─────────────────────────────────────────────────────────────┐
│  SettingsStore (OmegaConf)                                  │
│  ├── config.defaults.yaml    → App settings, defaults       │
│  ├── config.overrides.yaml   → User preferences             │
│  └── NOT secrets                                            │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  SecretStore (this module)                                  │
│  ├── MongoDB collection: "secrets"                          │
│  ├── Encrypted with Fernet (derived from auth_secret_key)   │
│  └── API keys, passwords, tokens                            │
└─────────────────────────────────────────────────────────────┘

Security Model
==============
Level 0 (current):  secrets.yaml plaintext on disk
Level 1 (this):     secrets encrypted in MongoDB
Level 2 (future):   encryption key derived from user auth

Key Derivation
--------------
Current: SHA256(auth_secret_key) → Fernet key
    - Same pattern as kubernetes_manager.py and unode_manager.py
    - auth_secret_key still in secrets.yaml (chicken-egg problem)
    - But API keys are now encrypted in MongoDB

Future: PBKDF2(user_password + salt) → Fernet key
    - Secrets locked until user authenticates
    - Server intrusion alone can't decrypt

Migration Plan
==============
Phase 1: Create SecretStore with Fernet encryption
Phase 2: On startup, migrate secrets.yaml → MongoDB (one-time)
Phase 3: Update all consumers to use SecretStore
Phase 4: Delete secrets.yaml (keep only auth_secret_key somewhere)

Collection Schema
=================
{
    "_id": ObjectId,
    "key": "openai_api_key",           # Unique identifier
    "encrypted_value": "gAAAAABk...",  # Fernet-encrypted
    "category": "api_keys",            # For grouping in UI
    "created_at": ISODate,
    "updated_at": ISODate,
    "metadata": {                      # Optional
        "label": "OpenAI API Key",
        "provider": "openai"
    }
}

Usage (Future)
==============
```python
from src.config.secret_store import get_secret_store

secrets = get_secret_store()

# Read (returns decrypted value)
api_key = await secrets.get("openai_api_key")

# Write (encrypts and stores)
await secrets.set("openai_api_key", "sk-...")

# Check existence
exists = await secrets.has("openai_api_key")

# List keys (not values)
keys = await secrets.list_keys(category="api_keys")

# Delete
await secrets.delete("openai_api_key")

# Bulk get for service env vars
env_vars = await secrets.get_many(["openai_api_key", "anthropic_api_key"])
```

Consumers to Update
===================
- src/services/auth.py              → SECRET_KEY, ADMIN_PASSWORD
- src/services/capability_resolver.py → API key resolution
- src/services/docker_manager.py    → Env var injection
- src/routers/providers.py          → API key status
- src/routers/wizard.py             → API key saving

Open Questions
==============
1. Where does auth_secret_key live? (Still needs to be somewhere to decrypt)
   - Option A: Environment variable at container start
   - Option B: Derived from admin password on first login
   - Option C: Keep minimal secrets.yaml with just this key

2. What happens on first startup before any secrets exist?
   - Services that need API keys won't start
   - Wizard must complete before services can run

3. Key rotation strategy?
   - Re-encrypt all secrets with new key
   - Keep old key for grace period?
"""

import base64
import hashlib
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)


# =============================================================================
# SKELETON - Not yet implemented
# =============================================================================

class SecretStore:
    """
    Encrypted secret storage backed by MongoDB.

    NOT YET IMPLEMENTED - This is a design skeleton.
    """

    def __init__(self, db=None, encryption_key: Optional[str] = None):
        """
        Initialize SecretStore.

        Args:
            db: MongoDB database instance
            encryption_key: Base key for Fernet derivation.
                           If None, uses auth_secret_key from config.
        """
        self._db = db
        self._collection = None
        self._fernet: Optional[Fernet] = None
        self._encryption_key = encryption_key

    def _init_fernet(self) -> Fernet:
        """
        Initialize Fernet encryption.

        Derives 32-byte key from auth_secret_key using SHA256.
        Same pattern as kubernetes_manager.py.
        """
        if self._encryption_key:
            secret = self._encryption_key
        else:
            # Import here to avoid circular deps
            from src.config.secrets import get_auth_secret_key
            secret = get_auth_secret_key()

        # Derive 32-byte key
        key = hashlib.sha256(secret.encode()).digest()
        fernet_key = base64.urlsafe_b64encode(key)
        return Fernet(fernet_key)

    def _encrypt(self, plaintext: str) -> str:
        """Encrypt a value for storage."""
        if self._fernet is None:
            self._fernet = self._init_fernet()
        return self._fernet.encrypt(plaintext.encode()).decode()

    def _decrypt(self, ciphertext: str) -> str:
        """Decrypt a stored value."""
        if self._fernet is None:
            self._fernet = self._init_fernet()
        try:
            return self._fernet.decrypt(ciphertext.encode()).decode()
        except InvalidToken:
            logger.error("Failed to decrypt secret - invalid token or wrong key")
            return ""

    async def initialize(self, db) -> None:
        """Initialize with database connection and create indexes."""
        self._db = db
        self._collection = db.secrets
        # Create unique index on key
        await self._collection.create_index("key", unique=True)
        logger.info("SecretStore initialized")

    async def get(self, key: str) -> Optional[str]:
        """Get a decrypted secret by key."""
        raise NotImplementedError("SecretStore not yet implemented")

    async def set(self, key: str, value: str, category: str = "api_keys",
                  metadata: Optional[Dict] = None) -> None:
        """Store an encrypted secret."""
        raise NotImplementedError("SecretStore not yet implemented")

    async def has(self, key: str) -> bool:
        """Check if a secret exists."""
        raise NotImplementedError("SecretStore not yet implemented")

    async def delete(self, key: str) -> bool:
        """Delete a secret."""
        raise NotImplementedError("SecretStore not yet implemented")

    async def list_keys(self, category: Optional[str] = None) -> List[str]:
        """List all secret keys (not values)."""
        raise NotImplementedError("SecretStore not yet implemented")

    async def get_many(self, keys: List[str]) -> Dict[str, Optional[str]]:
        """Get multiple secrets at once."""
        raise NotImplementedError("SecretStore not yet implemented")


# =============================================================================
# Singleton accessor (future)
# =============================================================================

_secret_store: Optional[SecretStore] = None


def get_secret_store() -> SecretStore:
    """Get the singleton SecretStore instance."""
    global _secret_store
    if _secret_store is None:
        _secret_store = SecretStore()
    return _secret_store
