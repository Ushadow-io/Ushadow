#!/bin/bash
# Build script for Ushadow Launcher
# Builds Tauri app for specified platforms

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAUNCHER_DIR="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="$LAUNCHER_DIR/releases"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Ensure bundled resources exist
if [ ! -d "$LAUNCHER_DIR/src-tauri/bundled" ]; then
    echo -e "${YELLOW}📦 Bundled resources not found, running bundle-resources.sh...${NC}"
    cd "$LAUNCHER_DIR"
    bash bundle-resources.sh
    echo ""
fi

show_usage() {
    echo "Usage: $0 <platform> [--debug]"
    echo ""
    echo "Platforms:"
    echo "  macos       Build for macOS (universal binary: Intel + Apple Silicon)"
    echo "  windows     Build for Windows x64"
    echo "  linux       Build for Linux x64"
    echo "  current     Build for current platform only"
    echo "  all         Build for all platforms (requires cross-compilation setup)"
    echo ""
    echo "Options:"
    echo "  --debug     Build debug version instead of release"
    echo ""
    echo "Examples:"
    echo "  $0 macos"
    echo "  $0 current --debug"
    echo "  $0 all"
}

get_version() {
    grep '"version"' "$LAUNCHER_DIR/package.json" | head -1 | sed 's/.*"version": *"\([^"]*\)".*/\1/'
}

setup_output_dir() {
    local version="$1"
    local platform="$2"
    local dest="$OUTPUT_DIR/v$version/$platform"
    mkdir -p "$dest"
    echo "$dest"
}

build_macos() {
    local debug_flag="${1:-}"
    echo -e "${BLUE}Building for macOS (universal binary)...${NC}"

    cd "$LAUNCHER_DIR"

    if [ "$debug_flag" = "--debug" ]; then
        npm run build:debug -- --target universal-apple-darwin
    else
        npm run build -- --target universal-apple-darwin
    fi

    local version=$(get_version)
    local dest=$(setup_output_dir "$version" "macos")

    # Copy artifacts
    local bundle_dir="$LAUNCHER_DIR/src-tauri/target/universal-apple-darwin/release/bundle"
    if [ -d "$bundle_dir" ]; then
        cp -r "$bundle_dir/dmg/"*.dmg "$dest/" 2>/dev/null || true
        cp -r "$bundle_dir/macos/"*.app "$dest/" 2>/dev/null || true
    fi

    echo -e "${GREEN}✓ macOS build complete: $dest${NC}"
}

build_windows() {
    local debug_flag="${1:-}"
    echo -e "${BLUE}Building for Windows...${NC}"

    cd "$LAUNCHER_DIR"

    # Check if we're on Windows or have cross-compilation set up
    if [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]] || [[ "$OSTYPE" == "win32" ]]; then
        if [ "$debug_flag" = "--debug" ]; then
            npm run build:debug
        else
            npm run build
        fi
    else
        echo -e "${YELLOW}Note: Cross-compiling to Windows from non-Windows requires additional setup${NC}"
        echo "Consider using GitHub Actions for Windows builds"

        if [ "$debug_flag" = "--debug" ]; then
            npm run build:debug -- --target x86_64-pc-windows-msvc
        else
            npm run build -- --target x86_64-pc-windows-msvc
        fi
    fi

    local version=$(get_version)
    local dest=$(setup_output_dir "$version" "windows")

    # Copy artifacts
    local bundle_dir="$LAUNCHER_DIR/src-tauri/target/x86_64-pc-windows-msvc/release/bundle"
    if [ -d "$bundle_dir" ]; then
        cp "$bundle_dir/msi/"*.msi "$dest/" 2>/dev/null || true
        cp "$bundle_dir/nsis/"*.exe "$dest/" 2>/dev/null || true
    fi

    # Also check default target if cross-compile failed
    bundle_dir="$LAUNCHER_DIR/src-tauri/target/release/bundle"
    if [ -d "$bundle_dir" ]; then
        cp "$bundle_dir/msi/"*.msi "$dest/" 2>/dev/null || true
        cp "$bundle_dir/nsis/"*.exe "$dest/" 2>/dev/null || true
    fi

    echo -e "${GREEN}✓ Windows build complete: $dest${NC}"
}

build_linux() {
    local debug_flag="${1:-}"
    echo -e "${BLUE}Building for Linux...${NC}"

    cd "$LAUNCHER_DIR"

    if [ "$debug_flag" = "--debug" ]; then
        npm run build:debug -- --target x86_64-unknown-linux-gnu
    else
        npm run build -- --target x86_64-unknown-linux-gnu
    fi

    local version=$(get_version)
    local dest=$(setup_output_dir "$version" "linux")

    # Copy artifacts
    local bundle_dir="$LAUNCHER_DIR/src-tauri/target/x86_64-unknown-linux-gnu/release/bundle"
    if [ -d "$bundle_dir" ]; then
        cp "$bundle_dir/deb/"*.deb "$dest/" 2>/dev/null || true
        cp "$bundle_dir/appimage/"*.AppImage "$dest/" 2>/dev/null || true
    fi

    # Check default target too
    bundle_dir="$LAUNCHER_DIR/src-tauri/target/release/bundle"
    if [ -d "$bundle_dir" ]; then
        cp "$bundle_dir/deb/"*.deb "$dest/" 2>/dev/null || true
        cp "$bundle_dir/appimage/"*.AppImage "$dest/" 2>/dev/null || true
    fi

    echo -e "${GREEN}✓ Linux build complete: $dest${NC}"
}

build_current() {
    local debug_flag="${1:-}"
    echo -e "${BLUE}Building for current platform...${NC}"

    cd "$LAUNCHER_DIR"

    if [ "$debug_flag" = "--debug" ]; then
        npm run build:debug
    else
        npm run build
    fi

    local version=$(get_version)
    local dest=$(setup_output_dir "$version" "current")

    # Copy all artifacts
    local bundle_dir="$LAUNCHER_DIR/src-tauri/target/release/bundle"
    if [ -d "$bundle_dir" ]; then
        cp -r "$bundle_dir"/* "$dest/" 2>/dev/null || true
    fi

    echo -e "${GREEN}✓ Build complete: $dest${NC}"
}

# Parse arguments
PLATFORM="${1:-}"
DEBUG_FLAG=""

for arg in "$@"; do
    if [ "$arg" = "--debug" ]; then
        DEBUG_FLAG="--debug"
    fi
done

# Main logic
case "$PLATFORM" in
    macos)
        build_macos "$DEBUG_FLAG"
        ;;
    windows)
        build_windows "$DEBUG_FLAG"
        ;;
    linux)
        build_linux "$DEBUG_FLAG"
        ;;
    current)
        build_current "$DEBUG_FLAG"
        ;;
    all)
        echo -e "${YELLOW}Building for all platforms...${NC}"
        echo -e "${YELLOW}Note: Cross-platform builds may require additional toolchains${NC}"
        echo ""
        build_macos "$DEBUG_FLAG"
        build_linux "$DEBUG_FLAG"
        build_windows "$DEBUG_FLAG"
        echo ""
        echo -e "${GREEN}All builds complete!${NC}"
        ;;
    *)
        show_usage
        exit 1
        ;;
esac
