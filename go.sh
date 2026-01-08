#!/bin/bash
# Ushadow Quick Start - Zero-prompt startup with defaults
#
# This runs production mode with:
# - Default settings (env: ushadow, port offset: 0)
# - No prompts
# - Production build (no hot-reload)
#
# For development mode with hot-reload: ./dev.sh

set -e

# Install uv if needed
bash scripts/install.sh

# Run with uv (automatically manages venv and dependencies)
exec uv run --with pyyaml setup/run.py --quick --prod --skip-admin --open-browser "$@"
