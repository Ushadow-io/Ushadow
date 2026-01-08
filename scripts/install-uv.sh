#!/bin/bash
# Bootstrap script to install uv if not present
# Works on macOS, Linux, and WSL

set -e

echo "Checking for uv installation..."

if command -v uv &> /dev/null; then
    echo "✓ uv is already installed: $(uv --version)"
    exit 0
fi

echo "Installing uv..."

# Detect OS
case "$(uname -s)" in
    Darwin*)
        echo "Detected macOS"
        ;;
    Linux*)
        echo "Detected Linux"
        ;;
    MINGW*|MSYS*|CYGWIN*)
        echo "Detected Windows (Git Bash/MSYS)"
        ;;
    *)
        echo "Unknown operating system: $(uname -s)"
        echo "Please install uv manually: https://docs.astral.sh/uv/getting-started/installation/"
        exit 1
        ;;
esac

# Install using official installer (works on macOS, Linux, WSL)
curl -LsSf https://astral.sh/uv/install.sh | sh

# Add to PATH for current session if not already there
export PATH="$HOME/.cargo/bin:$PATH"

# Verify installation
if command -v uv &> /dev/null; then
    echo "✓ uv installed successfully: $(uv --version)"
    echo ""
    echo "Note: You may need to restart your shell or run:"
    echo "  source \$HOME/.cargo/env"
else
    echo "✗ uv installation may have failed. Please check the output above."
    exit 1
fi
