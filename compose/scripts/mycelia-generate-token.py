#!/usr/bin/env python3
"""
Generate Mycelia authentication token and client ID

This script creates API credentials directly in MongoDB without
needing to spin up the full Mycelia compose stack.

MongoDB URI resolution order:
  1. --mongo-uri CLI argument
  2. Ushadow OmegaConf settings (infrastructure.mongodb_uri) — works in Docker and K8s
  3. MONGODB_URI / MONGO_URL environment variable
  4. Fallback: mongodb://mongo:27017

Usage:
    python3 mycelia-generate-token.py [--mongo-uri MONGO_URI] [--db-name DB_NAME]
"""

import argparse
import base64
import hashlib
import os
import secrets
import sys
from datetime import datetime

try:
    from pymongo import MongoClient
    HAS_PYMONGO = True
except ImportError:
    HAS_PYMONGO = False


def get_mongo_uri() -> str:
    """
    Resolve MongoDB URI using the same priority chain as the ushadow backend.

    1. Ushadow OmegaConf settings (works in Docker and K8s via config mounts)
    2. MONGODB_URI / MONGO_URL environment variable
    3. Fallback to mongo:27017 (default docker-compose hostname)
    """
    # Try ushadow settings store (available when script is invoked from within the backend)
    try:
        import sys
        import os
        # Add backend src to path if available
        backend_src = os.path.join(os.path.dirname(__file__), '..', '..', 'ushadow', 'backend', 'src')
        if os.path.isdir(backend_src):
            sys.path.insert(0, os.path.abspath(backend_src))

        from config import get_settings_store
        import asyncio

        async def _read():
            store = get_settings_store()
            return await store.get("infrastructure.mongodb_uri")

        uri = asyncio.run(_read())
        if uri:
            return str(uri)
    except Exception:
        pass

    # Fall back to environment variable (K8s injects these via ConfigMap/Secret)
    uri = os.environ.get("MONGODB_URI") or os.environ.get("MONGO_URL")
    if uri:
        return uri

    return "mongodb://mongo:27017"


def generate_api_key() -> str:
    """Generate a random API key with mycelia_ prefix."""
    random_bytes = secrets.token_bytes(32)
    return f"mycelia_{base64.urlsafe_b64encode(random_bytes).decode().rstrip('=')}"


def hash_api_key(api_key: str, salt: bytes) -> str:
    """Hash an API key with salt using SHA256."""
    hasher = hashlib.sha256()
    hasher.update(salt)
    hasher.update(api_key.encode())
    return base64.b64encode(hasher.digest()).decode()


def generate_credentials(mongo_uri: str, db_name: str) -> tuple[str, str]:
    """
    Generate credentials and store in MongoDB.

    Returns:
        (MYCELIA_TOKEN, MYCELIA_CLIENT_ID)
    """
    if not HAS_PYMONGO:
        print("ERROR: pymongo not installed. Install with: pip install pymongo", file=sys.stderr)
        sys.exit(1)

    api_key = generate_api_key()
    salt = secrets.token_bytes(32)
    hashed_key = hash_api_key(api_key, salt)

    client = MongoClient(mongo_uri, serverSelectionTimeoutMS=5000)
    client.admin.command("ping")
    db = client[db_name]

    result = db.api_keys.insert_one({
        "hashedKey": hashed_key,
        "salt": base64.b64encode(salt).decode(),
        "owner": "admin",
        "name": f"ushadow_generated_{int(datetime.now().timestamp())}",
        "policies": [{"resource": "**", "action": "**", "effect": "allow"}],
        "openPrefix": api_key[:16],
        "createdAt": datetime.now(),
        "isActive": True,
    })

    return api_key, str(result.inserted_id)


def main():
    parser = argparse.ArgumentParser(description="Generate Mycelia authentication credentials")
    parser.add_argument("--mongo-uri", default=None, help="MongoDB connection URI")
    parser.add_argument("--db-name", default=None, help="Database name (default: mycelia)")
    args = parser.parse_args()

    mongo_uri = args.mongo_uri or get_mongo_uri()
    db_name = args.db_name or os.environ.get("MYCELIA_DATABASE_NAME", "mycelia")

    try:
        token, client_id = generate_credentials(mongo_uri, db_name)
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)

    # Output in a format that's easy to parse (matches deno token-create output)
    print(f"MYCELIA_TOKEN={token}")
    print(f"MYCELIA_CLIENT_ID={client_id}")


if __name__ == "__main__":
    main()
