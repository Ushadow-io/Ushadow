#!/bin/bash
set -e

# Sync version across all Ushadow packages
# Usage: ./scripts/sync-version.sh [get|set <version>|bump <major|minor|patch>]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Define all package.json locations
FRONTEND_PACKAGE="$PROJECT_ROOT/ushadow/frontend/package.json"
BACKEND_PYPROJECT="$PROJECT_ROOT/ushadow/backend/pyproject.toml"
LAUNCHER_PACKAGE="$PROJECT_ROOT/ushadow/launcher/package.json"
LAUNCHER_TAURI="$PROJECT_ROOT/ushadow/launcher/src-tauri/tauri.conf.json"
LAUNCHER_CARGO="$PROJECT_ROOT/ushadow/launcher/src-tauri/Cargo.toml"
MOBILE_PACKAGE="$PROJECT_ROOT/ushadow/mobile/package.json"

# Get current version from frontend package.json (source of truth)
get_version() {
  if [ -f "$FRONTEND_PACKAGE" ]; then
    grep -o '"version": *"[^"]*"' "$FRONTEND_PACKAGE" | head -1 | sed 's/"version": *"\(.*\)"/\1/'
  else
    echo "0.1.0"
  fi
}

# Update package.json version
update_package_json() {
  local file=$1
  local version=$2
  if [ -f "$file" ]; then
    # Use sed to update version in package.json
    if [[ "$OSTYPE" == "darwin"* ]]; then
      # macOS
      sed -i '' "s/\"version\": *\"[^\"]*\"/\"version\": \"$version\"/" "$file"
    else
      # Linux
      sed -i "s/\"version\": *\"[^\"]*\"/\"version\": \"$version\"/" "$file"
    fi
    echo "✓ Updated $file to version $version"
  fi
}

# Update pyproject.toml version
update_pyproject() {
  local file=$1
  local version=$2
  if [ -f "$file" ]; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' "s/^version = *\"[^\"]*\"/version = \"$version\"/" "$file"
    else
      sed -i "s/^version = *\"[^\"]*\"/version = \"$version\"/" "$file"
    fi
    echo "✓ Updated $file to version $version"
  fi
}

# Update Cargo.toml version
update_cargo() {
  local file=$1
  local version=$2
  if [ -f "$file" ]; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' "s/^version = *\"[^\"]*\"/version = \"$version\"/" "$file"
    else
      sed -i "s/^version = *\"[^\"]*\"/version = \"$version\"/" "$file"
    fi
    echo "✓ Updated $file to version $version"
  fi
}

# Update tauri.conf.json version
update_tauri_conf() {
  local file=$1
  local version=$2
  if [ -f "$file" ]; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' "s/\"version\": *\"[^\"]*\"/\"version\": \"$version\"/" "$file"
    else
      sed -i "s/\"version\": *\"[^\"]*\"/\"version\": \"$version\"/" "$file"
    fi
    echo "✓ Updated $file to version $version"
  fi
}

# Bump version based on semver
bump_version() {
  local current=$1
  local bump_type=$2

  IFS='.' read -ra PARTS <<< "$current"
  local major=${PARTS[0]}
  local minor=${PARTS[1]}
  local patch=${PARTS[2]}

  case $bump_type in
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
      echo "Error: Invalid bump type. Use major, minor, or patch."
      exit 1
      ;;
  esac

  echo "$major.$minor.$patch"
}

# Set version across all packages
set_version() {
  local version=$1

  echo "Setting version to $version across all packages..."
  echo ""

  update_package_json "$FRONTEND_PACKAGE" "$version"
  update_pyproject "$BACKEND_PYPROJECT" "$version"
  update_package_json "$LAUNCHER_PACKAGE" "$version"
  update_tauri_conf "$LAUNCHER_TAURI" "$version"
  update_cargo "$LAUNCHER_CARGO" "$version"
  update_package_json "$MOBILE_PACKAGE" "$version"

  echo ""
  echo "✅ All packages updated to version $version"
}

# Main script logic
case "${1:-}" in
  get)
    get_version
    ;;
  set)
    if [ -z "${2:-}" ]; then
      echo "Error: Version required. Usage: $0 set <version>"
      exit 1
    fi
    set_version "$2"
    ;;
  bump)
    if [ -z "${2:-}" ]; then
      echo "Error: Bump type required. Usage: $0 bump <major|minor|patch>"
      exit 1
    fi
    current=$(get_version)
    new_version=$(bump_version "$current" "$2")
    echo "Bumping version from $current to $new_version ($2)"
    echo ""
    set_version "$new_version"
    ;;
  *)
    echo "Ushadow Version Management"
    echo ""
    echo "Usage:"
    echo "  $0 get              - Display current version"
    echo "  $0 set <version>    - Set version across all packages"
    echo "  $0 bump <type>      - Bump version (major, minor, or patch)"
    echo ""
    echo "Current version: $(get_version)"
    exit 1
    ;;
esac
