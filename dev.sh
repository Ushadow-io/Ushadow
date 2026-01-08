#!/bin/bash
# Ushadow Development Mode
#
# Starts with hot-reload enabled for frontend development.
# For production mode, use: ./go.sh

set -e

# Install uv if needed
bash scripts/install.sh

# Run with uv (automatically manages venv and dependencies)
exec uv run --with pyyaml setup/run.py --dev "$@"
