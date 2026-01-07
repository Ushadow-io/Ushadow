#!/bin/bash
# Version management script for Ushadow Launcher
# Updates version in package.json, tauri.conf.json, and Cargo.toml

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAUNCHER_DIR="$(dirname "$SCRIPT_DIR")"

# File paths
PACKAGE_JSON="$LAUNCHER_DIR/package.json"
TAURI_CONF="$LAUNCHER_DIR/src-tauri/tauri.conf.json"
CARGO_TOML="$LAUNCHER_DIR/src-tauri/Cargo.toml"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

get_current_version() {
    grep '"version"' "$PACKAGE_JSON" | head -1 | sed 's/.*"version": *"\([^"]*\)".*/\1/'
}

show_usage() {
    echo "Usage: $0 <command> [version]"
    echo ""
    echo "Commands:"
    echo "  get              Show current version"
    echo "  set <version>    Set version (e.g., 1.0.0)"
    echo "  bump <type>      Bump version (major|minor|patch)"
    echo ""
    echo "Examples:"
    echo "  $0 get"
    echo "  $0 set 1.2.0"
    echo "  $0 bump patch"
}

bump_version() {
    local version="$1"
    local type="$2"

    IFS='.' read -r major minor patch <<< "$version"

    case "$type" in
        major)
            major=$((major + 1))
            minor=0
            patch=0
            ;;
        minor)
            minor=$((minor + 1))
            patch=0
            ;;
        patch)
            patch=$((patch + 1))
            ;;
        *)
            echo -e "${RED}Error: Invalid bump type: $type${NC}"
            echo "Valid types: major, minor, patch"
            exit 1
            ;;
    esac

    echo "$major.$minor.$patch"
}

set_version() {
    local new_version="$1"

    # Validate version format
    if ! [[ "$new_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        echo -e "${RED}Error: Invalid version format. Use semver (e.g., 1.2.3)${NC}"
        exit 1
    fi

    echo -e "${YELLOW}Updating version to $new_version...${NC}"

    # Update package.json
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$new_version\"/" "$PACKAGE_JSON"
    else
        sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$new_version\"/" "$PACKAGE_JSON"
    fi
    echo -e "${GREEN}✓ Updated package.json${NC}"

    # Update tauri.conf.json (inside "package" object)
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$new_version\"/g" "$TAURI_CONF"
    else
        sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$new_version\"/g" "$TAURI_CONF"
    fi
    echo -e "${GREEN}✓ Updated tauri.conf.json${NC}"

    # Update Cargo.toml (only the package version line)
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s/^version = \"[^\"]*\"/version = \"$new_version\"/" "$CARGO_TOML"
    else
        sed -i "s/^version = \"[^\"]*\"/version = \"$new_version\"/" "$CARGO_TOML"
    fi
    echo -e "${GREEN}✓ Updated Cargo.toml${NC}"

    echo -e "${GREEN}Version updated to $new_version${NC}"
}

# Main logic
case "${1:-}" in
    get)
        get_current_version
        ;;
    set)
        if [ -z "${2:-}" ]; then
            echo -e "${RED}Error: Version required${NC}"
            show_usage
            exit 1
        fi
        set_version "$2"
        ;;
    bump)
        if [ -z "${2:-}" ]; then
            echo -e "${RED}Error: Bump type required (major|minor|patch)${NC}"
            show_usage
            exit 1
        fi
        current=$(get_current_version)
        new_version=$(bump_version "$current" "$2")
        echo "Bumping from $current to $new_version"
        set_version "$new_version"
        ;;
    *)
        show_usage
        exit 1
        ;;
esac
