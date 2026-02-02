#!/usr/bin/env python3
"""
Generate Mycelia authentication token and client ID

This script creates API credentials directly in MongoDB without
needing to spin up the full Mycelia compose stack.

Usage:
    python3 mycelia-generate-token.py [--mongo-uri MONGO_URI] [--db-name DB_NAME]
"""

import argparse
import base64
import hashlib
import secrets
import sys
from datetime import datetime
from pathlib import Path

try:
    from pymongo import MongoClient
    from bson import ObjectId
    HAS_PYMONGO = True
except ImportError:
    HAS_PYMONGO = False


def load_env_file():
    """Load .env file from project root if it exists."""
    env_vars = {}
    env_file = Path(__file__).parent.parent.parent / '.env'

    if env_file.exists():
        with open(env_file) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    env_vars[key] = value.strip('"').strip("'")

    return env_vars


def generate_api_key():
    """Generate a random API key with mycelia_ prefix."""
    random_bytes = secrets.token_bytes(32)
    return f"mycelia_{base64.urlsafe_b64encode(random_bytes).decode().rstrip('=')}"


def hash_api_key(api_key: str, salt: bytes) -> str:
    """Hash an API key with salt using SHA256."""
    hasher = hashlib.sha256()
    hasher.update(salt)
    hasher.update(api_key.encode())
    return base64.b64encode(hasher.digest()).decode()


def generate_credentials_with_mongo(mongo_uri: str, db_name: str):
    """Generate credentials and store in MongoDB."""
    if not HAS_PYMONGO:
        print("ERROR: pymongo not installed. Install with: pip install pymongo")
        print("Or use the docker compose method instead:")
        print("  docker compose -f compose/mycelia-compose.yml run --rm mycelia-backend deno run -A server.ts token-create")
        sys.exit(1)

    # Generate token and salt
    api_key = generate_api_key()
    salt = secrets.token_bytes(32)
    hashed_key = hash_api_key(api_key, salt)

    # Connect to MongoDB
    try:
        client = MongoClient(mongo_uri, serverSelectionTimeoutMS=5000)
        client.admin.command('ping')  # Test connection
        db = client[db_name]

        # Create API key document
        doc = {
            'hashedKey': hashed_key,
            'salt': base64.b64encode(salt).decode(),
            'owner': 'admin',
            'name': f'ushadow_generated_{int(datetime.now().timestamp())}',
            'policies': [{'resource': '**', 'action': '**', 'effect': 'allow'}],
            'openPrefix': api_key[:16],
            'createdAt': datetime.now(),
            'isActive': True
        }

        # Insert into database
        result = db.api_keys.insert_one(doc)
        client_id = str(result.inserted_id)

        # Print credentials
        print("\n✓ Credentials generated successfully!\n")
        print(f"MYCELIA_CLIENT_ID={client_id}")
        print(f"MYCELIA_TOKEN={api_key}")
        print("\nCopy these values into the ushadow wizard or your .env file")

    except Exception as e:
        print(f"ERROR: Failed to connect to MongoDB: {e}")
        print("\nAlternatively, use the docker compose method:")
        print("  docker compose -f compose/mycelia-compose.yml run --rm mycelia-backend deno run -A server.ts token-create")
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(
        description='Generate Mycelia authentication credentials',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Use default MongoDB connection (localhost:27017)
  python3 mycelia-generate-token.py

  # Specify custom MongoDB URI
  python3 mycelia-generate-token.py --mongo-uri mongodb://localhost:27018

  # Specify custom database name
  python3 mycelia-generate-token.py --db-name my_mycelia_db

If pymongo is not installed or MongoDB is not accessible, the script will
provide instructions to use the docker compose method instead.
        """
    )

    parser.add_argument(
        '--mongo-uri',
        default=None,
        help='MongoDB connection URI (default: mongodb://localhost:27017)'
    )

    parser.add_argument(
        '--db-name',
        default='mycelia',
        help='Database name (default: mycelia)'
    )

    args = parser.parse_args()

    # Load environment variables
    env_vars = load_env_file()

    # Determine MongoDB URI
    if args.mongo_uri:
        mongo_uri = args.mongo_uri
    elif 'MONGO_URL' in env_vars:
        mongo_uri = env_vars['MONGO_URL']
    else:
        mongo_uri = 'mongodb://localhost:27017'

    # Determine database name
    db_name = env_vars.get('MYCELIA_DATABASE_NAME', args.db_name)

    print("Mycelia Token Generator")
    print("=======================\n")
    print(f"MongoDB URI: {mongo_uri}")
    print(f"Database: {db_name}\n")

    generate_credentials_with_mongo(mongo_uri, db_name)


if __name__ == '__main__':
    main()
