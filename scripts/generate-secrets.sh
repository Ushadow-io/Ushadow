#!/bin/bash
# Generate secrets.yaml file in config/SECRETS/
# This script ensures secrets are created before backend starts
#
# Usage: ./scripts/generate-secrets.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "🔐 Generating secrets..."

# Change to project root
cd "$PROJECT_ROOT"

# Run Python script to generate secrets (using uv to ensure pyyaml is available)
uv run --with pyyaml python - << 'EOF'
import secrets
import sys
import yaml
from pathlib import Path
from datetime import datetime, timezone

PROJECT_ROOT = Path.cwd()
config_dir = PROJECT_ROOT / "config"
secrets_dir = config_dir / "SECRETS"
secrets_file = secrets_dir / "secrets.yaml"

# Ensure directories exist
config_dir.mkdir(exist_ok=True)
secrets_dir.mkdir(exist_ok=True)

# Load existing secrets or create new
if secrets_file.exists():
    try:
        with open(secrets_file, 'r') as f:
            data = yaml.safe_load(f) or {}
        print(f"✅ Loaded existing secrets from {secrets_file}")
    except Exception as e:
        print(f"⚠️  Warning: Could not load {secrets_file}: {e}")
        data = {}
else:
    print(f"📝 Creating new secrets file at {secrets_file}")
    data = {}

# Ensure security section exists
if 'security' not in data:
    data['security'] = {}

# Generate auth_secret_key if missing
if not data['security'].get('auth_secret_key'):
    data['security']['auth_secret_key'] = secrets.token_urlsafe(32)
    print("✅ Generated auth_secret_key")
else:
    print("✓ auth_secret_key already exists")

# Generate session_secret if missing
if not data['security'].get('session_secret'):
    data['security']['session_secret'] = secrets.token_urlsafe(32)
    print("✅ Generated session_secret")
else:
    print("✓ session_secret already exists")

# Ensure api_keys section exists
if 'api_keys' not in data:
    data['api_keys'] = {
        'openai': '',
        'anthropic': '',
        'deepgram': '',
        'mistral': '',
        'pieces': ''
    }

# Ensure services section exists
if 'services' not in data:
    data['services'] = {
        'openmemory': {'api_key': ''},
        'chronicle': {'api_key': ''}
    }

# Ensure admin section exists
if 'admin' not in data:
    data['admin'] = {
        'email': 'admin@example.com',
        'name': 'admin',
        'password': None  # Will be set when admin user is created
    }

# Write secrets file
try:
    with open(secrets_file, 'w') as f:
        # Write header comment
        f.write("# Ushadow Secrets\n")
        f.write(f"# Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}\n")
        f.write("# DO NOT COMMIT - Contains sensitive credentials\n")
        f.write("# This file is gitignored\n\n")

        # Write YAML data
        yaml.dump(data, f, default_flow_style=False, sort_keys=False)

    # Set restrictive permissions (Unix only)
    try:
        secrets_file.chmod(0o600)
    except (OSError, NotImplementedError):
        pass  # Windows doesn't support chmod

    print(f"Secrets file written: ✅ {secrets_file}")

except Exception as e:
    print(f"❌ ERROR: Could not write secrets file: {e}", file=sys.stderr)
    sys.exit(1)

EOF

if [ $? -eq 0 ]; then
    echo "✅ Secrets generation complete"
else
    echo "❌ Failed to generate secrets" >&2
    exit 1
fi
