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

# Detect OS for logging
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
        echo "Detected: $(uname -s)"
        ;;
esac

# Use official one-liner installer
echo "Running: curl -LsSf https://astral.sh/uv/install.sh | sh"
curl -LsSf https://astral.sh/uv/install.sh | sh

# Add to PATH for current session
echo "Adding uv to PATH for current session..."
export PATH="$HOME/.cargo/bin:$PATH"

# Verify installation
echo "Verifying installation..."
if command -v uv &> /dev/null; then
    echo "✓ uv installed successfully: $(uv --version)"
    echo ""
    echo "Note: You may need to restart your shell or run:"
    echo "  source \$HOME/.cargo/env"
else
    echo "✗ uv installation may have failed. Please check the output above."
    echo "Or install manually: https://docs.astral.sh/uv/getting-started/installation/"
    exit 1
fi
