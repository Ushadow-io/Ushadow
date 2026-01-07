#!/bin/bash
# Ushadow Development Mode
#
# Starts with hot-reload enabled for frontend development.
# For production mode, use: ./go.sh
#
# Usage:
#   ./dev.sh

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

exec python3 setup/run.py --dev "$@"
