#!/bin/bash
# One-time setup script for new clones

set -e

echo "🚀 Setting up repository..."

# Configure git to use committed hooks
echo "📌 Configuring git hooks..."
git config core.hooksPath .githooks

# Initialize submodules (non-recursive to avoid nested submodules)
echo "📦 Initializing submodules..."
git submodule update --init

# Run post-checkout hook to configure sparse checkout
echo "🔧 Configuring sparse checkout..."
./.githooks/post-checkout

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "  - Chronicle and Mycelia are now configured with sparse checkout"
echo "  - extras/mycelia and friend/ directories are excluded (prevents circular deps)"
echo "  - Git hooks will automatically maintain this configuration"
