#!/bin/bash

# Clean rebuild script for Ushadow Launcher
# Clears all caches and rebuilds from scratch

set -e  # Exit on error

cd "$(dirname "$0")"

# Ensure bundled resources exist
if [ ! -d "src-tauri/bundled" ]; then
    echo "📦 Bundled resources not found, running bundle-resources.sh..."
    bash bundle-resources.sh
    echo ""
fi

echo "🧹 Cleaning caches..."

# Clear Rust build cache
echo "  → Clearing Rust build cache..."
cd src-tauri
cargo clean
cd ..

# Clear Node modules cache
echo "  → Clearing Vite cache..."
rm -rf node_modules/.vite

# Clear Tauri build artifacts
echo "  → Clearing Tauri build artifacts..."
rm -rf src-tauri/target

echo ""
echo "🔨 Rebuilding..."

# Rebuild Rust backend
echo "  → Building Rust backend..."
cd src-tauri
cargo build
cd ..

echo ""
echo "✅ Clean rebuild complete!"
echo ""
echo "🚀 Starting launcher..."
npm run tauri:dev
