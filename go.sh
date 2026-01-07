#!/bin/bash
# Ushadow Quick Start - Zero-prompt startup with defaults
#
# This runs production mode with:
# - Default settings (env: ushadow, port offset: 0)
# - No prompts
# - Production build (no hot-reload)
# - Opens registration page for first-time setup
#
# For development mode with hot-reload: ./dev.sh
# For interactive setup: python3 setup/run.py

# Ensure PyYAML is installed (required for setup script)
if ! python3 -c "import yaml" 2>/dev/null; then
    echo "📦 Installing setup dependencies..."

    # Try uv first (faster), fallback to pip
    if command -v uv &> /dev/null; then
        uv pip install --system -q pyyaml
    else
        python3 -m pip install -q pyyaml
    fi
fi

exec python3 setup/run.py --quick --prod --skip-admin "$@"
