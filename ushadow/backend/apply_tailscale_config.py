#!/usr/bin/env python3
"""Apply updated Tailscale Serve configuration to enable HTTP (port 80) support."""

import sys
import os

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from services.tailscale_serve_config import generate_serve_config, apply_serve_config

# Get hostname from command line argument or environment
hostname = sys.argv[1] if len(sys.argv) > 1 else os.getenv('TAILSCALE_HOSTNAME')

print("Regenerating Tailscale Serve configuration...")
print(f"Hostname: {hostname}")
print("This will enable HTTP (port 80) alongside HTTPS (port 443)")

# Generate config with explicit hostname
config = generate_serve_config(hostname=hostname)
success = apply_serve_config(config)

if success:
    print("✅ Tailscale Serve configuration applied successfully!")
    print("HTTP (port 80) is now enabled for mobile app connections")
    sys.exit(0)
else:
    print("❌ Failed to apply Tailscale Serve configuration")
    print("Check the logs for details")
    sys.exit(1)
