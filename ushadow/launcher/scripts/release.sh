#!/bin/bash
# Release script for Ushadow Launcher
# Creates a GitHub release with built artifacts

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAUNCHER_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(cd "$LAUNCHER_DIR/../.." && pwd)"
OUTPUT_DIR="$LAUNCHER_DIR/releases"

# GitHub repo
GITHUB_REPO="Ushadow-io/Ushadow"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

show_usage() {
    echo "Usage: $0 <command> [options]"
    echo ""
    echo "Commands:"
    echo "  prepare <type>    Bump version and prepare release (major|minor|patch)"
    echo "  build             Build for current platform"
    echo "  publish           Create GitHub release and upload artifacts"
    echo "  full <type>       Full release: bump, build current, publish"
    echo ""
    echo "Options:"
    echo "  --draft           Create as draft release"
    echo "  --prerelease      Mark as pre-release"
    echo ""
    echo "Examples:"
    echo "  $0 prepare patch              # Bump patch version"
    echo "  $0 build                      # Build for current platform"
    echo "  $0 publish --draft            # Publish as draft"
    echo "  $0 full patch                 # Full release workflow"
    echo ""
    echo "Environment Variables:"
    echo "  GITHUB_TOKEN      Required for publishing releases"
}

get_version() {
    grep '"version"' "$LAUNCHER_DIR/package.json" | head -1 | sed 's/.*"version": *"\([^"]*\)".*/\1/'
}

check_gh_cli() {
    if ! command -v gh &> /dev/null; then
        echo -e "${RED}Error: GitHub CLI (gh) is not installed${NC}"
        echo "Install it from: https://cli.github.com/"
        exit 1
    fi

    if ! gh auth status &> /dev/null; then
        echo -e "${RED}Error: Not authenticated with GitHub CLI${NC}"
        echo "Run: gh auth login"
        exit 1
    fi
}

check_clean_git() {
    cd "$REPO_ROOT"
    if [ -n "$(git status --porcelain ushadow/launcher)" ]; then
        echo -e "${YELLOW}Warning: There are uncommitted changes in the launcher directory${NC}"
        read -p "Continue anyway? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
}

prepare_release() {
    local bump_type="$1"

    echo -e "${BLUE}Preparing release...${NC}"

    # Bump version
    "$SCRIPT_DIR/version.sh" bump "$bump_type"

    local version=$(get_version)

    echo ""
    echo -e "${GREEN}Version bumped to $version${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Review the version changes"
    echo "  2. Run: $0 build"
    echo "  3. Run: $0 publish"
    echo ""
    echo "Or commit the version bump first:"
    echo "  git add ushadow/launcher/"
    echo "  git commit -m 'chore(launcher): bump version to $version'"
}

build_release() {
    echo -e "${BLUE}Building release...${NC}"

    "$SCRIPT_DIR/build.sh" current

    local version=$(get_version)
    echo ""
    echo -e "${GREEN}Build complete!${NC}"
    echo "Artifacts are in: $OUTPUT_DIR/v$version/"
}

publish_release() {
    local draft_flag=""
    local prerelease_flag=""

    for arg in "$@"; do
        case "$arg" in
            --draft)
                draft_flag="--draft"
                ;;
            --prerelease)
                prerelease_flag="--prerelease"
                ;;
        esac
    done

    check_gh_cli

    local version=$(get_version)
    local tag="launcher-v$version"
    local release_dir="$OUTPUT_DIR/v$version"

    echo -e "${BLUE}Publishing release $tag...${NC}"

    # Check if release directory exists and has files
    if [ ! -d "$release_dir" ] || [ -z "$(ls -A "$release_dir" 2>/dev/null)" ]; then
        echo -e "${RED}Error: No build artifacts found in $release_dir${NC}"
        echo "Run '$0 build' first"
        exit 1
    fi

    # Generate release notes
    local release_notes="## Ushadow Launcher v$version

### Downloads

Choose the appropriate installer for your platform:

| Platform | File | Notes |
|----------|------|-------|
| macOS | \`.dmg\` | Universal binary (Intel + Apple Silicon) |
| Windows | \`.msi\` or \`.exe\` | Windows 10+ required |
| Linux | \`.deb\` or \`.AppImage\` | Requires Docker and Tailscale |

### Requirements

- Docker Desktop (or Docker Engine on Linux)
- Tailscale (for network connectivity)

### Changelog

See [CHANGELOG.md](https://github.com/$GITHUB_REPO/blob/main/ushadow/launcher/CHANGELOG.md) for details.
"

    # Collect artifacts
    local artifacts=()
    for f in "$release_dir"/*; do
        if [ -f "$f" ]; then
            artifacts+=("$f")
        fi
    done

    # Also check subdirectories (macos, windows, linux)
    for subdir in "$release_dir"/*/; do
        if [ -d "$subdir" ]; then
            for f in "$subdir"*; do
                if [ -f "$f" ]; then
                    artifacts+=("$f")
                fi
            done
        fi
    done

    if [ ${#artifacts[@]} -eq 0 ]; then
        echo -e "${RED}Error: No artifacts to upload${NC}"
        exit 1
    fi

    echo "Artifacts to upload:"
    for f in "${artifacts[@]}"; do
        echo "  - $(basename "$f")"
    done
    echo ""

    # Create the release
    cd "$REPO_ROOT"

    # Check if tag already exists
    if git rev-parse "$tag" >/dev/null 2>&1; then
        echo -e "${YELLOW}Tag $tag already exists${NC}"
        read -p "Delete and recreate? (y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            git tag -d "$tag" 2>/dev/null || true
            git push origin ":refs/tags/$tag" 2>/dev/null || true
        else
            exit 1
        fi
    fi

    # Create tag
    git tag -a "$tag" -m "Ushadow Launcher v$version"

    echo -e "${BLUE}Creating GitHub release...${NC}"

    # Build the gh release create command
    local gh_cmd="gh release create \"$tag\" --repo \"$GITHUB_REPO\" --title \"Ushadow Launcher v$version\" --notes \"$release_notes\""

    if [ -n "$draft_flag" ]; then
        gh_cmd="$gh_cmd --draft"
    fi

    if [ -n "$prerelease_flag" ]; then
        gh_cmd="$gh_cmd --prerelease"
    fi

    # Add artifacts
    for f in "${artifacts[@]}"; do
        gh_cmd="$gh_cmd \"$f\""
    done

    # Execute
    eval "$gh_cmd"

    # Push the tag
    git push origin "$tag"

    echo ""
    echo -e "${GREEN}✓ Release published successfully!${NC}"
    echo "View at: https://github.com/$GITHUB_REPO/releases/tag/$tag"
}

full_release() {
    local bump_type="$1"
    shift
    local publish_flags="$@"

    if [ -z "$bump_type" ]; then
        echo -e "${RED}Error: Bump type required (major|minor|patch)${NC}"
        show_usage
        exit 1
    fi

    check_clean_git
    check_gh_cli

    echo -e "${BLUE}Starting full release workflow...${NC}"
    echo ""

    # 1. Bump version
    "$SCRIPT_DIR/version.sh" bump "$bump_type"
    local version=$(get_version)

    # 2. Build
    build_release

    # 3. Commit version bump
    cd "$REPO_ROOT"
    git add ushadow/launcher/package.json ushadow/launcher/src-tauri/tauri.conf.json ushadow/launcher/src-tauri/Cargo.toml
    git commit -m "chore(launcher): release v$version"

    # 4. Publish
    publish_release $publish_flags

    echo ""
    echo -e "${GREEN}✓ Full release complete for v$version${NC}"
}

# Main logic
COMMAND="${1:-}"
shift 2>/dev/null || true

case "$COMMAND" in
    prepare)
        prepare_release "$@"
        ;;
    build)
        build_release
        ;;
    publish)
        publish_release "$@"
        ;;
    full)
        full_release "$@"
        ;;
    *)
        show_usage
        exit 1
        ;;
esac
