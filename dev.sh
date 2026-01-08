#!/bin/bash
# Ushadow Development Mode
#
# Starts with hot-reload enabled for frontend development.
# For production mode, use: ./go.sh
#
# Usage:
#   ./dev.sh

set -e

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Auto-install uv if not present
if ! command -v uv &> /dev/null; then
    echo "📦 Installing uv (Python package manager)..."
    if [ -f "$SCRIPT_DIR/scripts/install-uv.sh" ]; then
        bash "$SCRIPT_DIR/scripts/install-uv.sh" || {
            echo "⚠️  uv installation failed, falling back to pip"
            USE_PIP=1
        }
        # Add uv to PATH for current session
        export PATH="$HOME/.cargo/bin:$PATH"
    else
        echo "⚠️  uv installer not found, falling back to pip"
        USE_PIP=1
    fi
fi

# Ensure setup dependencies are installed
if ! python3 -c "import yaml" 2>/dev/null; then
    echo "📦 Installing setup dependencies..."

    if [ -z "$USE_PIP" ] && command -v uv &> /dev/null; then
        # Use uv to install to system Python
        uv pip install --system -q -r "$SCRIPT_DIR/setup/requirements.txt"
    else
        # Fallback to pip
        python3 -m pip install -q -r "$SCRIPT_DIR/setup/requirements.txt"
    fi
fi

# Use uv run if available (runs in proper environment), otherwise use python3
if [ -z "$USE_PIP" ] && command -v uv &> /dev/null; then
    exec uv run python3 setup/run.py --dev "$@"
else
    exec python3 setup/run.py --dev "$@"
fi
