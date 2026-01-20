#!/usr/bin/env python3
"""
Generate OpenAPI spec from running ushadow backend.

Downloads the OpenAPI schema from /openapi.json endpoint.
Falls back to importing the app if server is not running.
"""

import json
import sys
import os
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import URLError

def load_env() -> dict:
    """Load environment variables from parent .env file."""
    env_file = Path(__file__).parent.parent / ".env"
    env_vars = {}
    if env_file.exists():
        with open(env_file) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, _, value = line.partition('=')
                    env_vars[key.strip()] = value.strip()
    return env_vars

def get_base_url() -> str:
    """Get backend URL from environment."""
    env = load_env()
    port = env.get("BACKEND_PORT", os.environ.get("BACKEND_PORT", "8000"))
    host = env.get("BACKEND_HOST", os.environ.get("BACKEND_HOST", "localhost"))
    return f"http://{host}:{port}"

def download_from_server(output_file: str) -> bool:
    """Download OpenAPI spec from running server."""
    url = f"{get_base_url()}/openapi.json"
    try:
        print(f"📥 Downloading OpenAPI spec from {url}...")
        req = Request(url)
        with urlopen(req, timeout=10) as response:
            spec = json.loads(response.read().decode())

        output_path = Path(output_file)
        with open(output_path, "w") as f:
            json.dump(spec, f, indent=2)

        print(f"✅ Generated OpenAPI spec: {output_path}")
        print(f"   Title: {spec['info']['title']}")
        print(f"   Version: {spec['info']['version']}")
        print(f"   Endpoints: {len(spec['paths'])} paths")
        return True

    except URLError as e:
        print(f"⚠️  Server not accessible: {e}")
        return False
    except Exception as e:
        print(f"⚠️  Download failed: {e}")
        return False

def generate_openapi_spec(output_file: str = "openapi.json"):
    """Generate OpenAPI spec - try server first, then import."""
    # Try downloading from running server first
    if download_from_server(output_file):
        return Path(output_file)

    print("\n📝 Server not running. You have two options:")
    print("   1. Start the backend: cd ushadow && make up")
    print("   2. Run this script again once the server is up")
    sys.exit(1)

if __name__ == "__main__":
    output = sys.argv[1] if len(sys.argv) > 1 else "openapi.json"
    generate_openapi_spec(output)
