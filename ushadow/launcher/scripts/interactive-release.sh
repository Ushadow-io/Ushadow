#!/bin/bash
# Interactive release script for Ushadow Launcher
# Prompts for version, release name, platforms, then triggers GitHub Actions

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAUNCHER_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(cd "$LAUNCHER_DIR/../.." && pwd)"

GITHUB_REPO="Ushadow-io/Ushadow"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

get_current_version() {
    grep '"version"' "$LAUNCHER_DIR/package.json" | head -1 | sed 's/.*"version": *"\([^"]*\)".*/\1/'
}

check_prerequisites() {
    # Check gh CLI
    if ! command -v gh &> /dev/null; then
        echo -e "${RED}Error: GitHub CLI (gh) is not installed${NC}"
        echo "Install from: https://cli.github.com/"
        exit 1
    fi

    if ! gh auth status &> /dev/null 2>&1; then
        echo -e "${RED}Error: Not authenticated with GitHub CLI${NC}"
        echo "Run: gh auth login"
        exit 1
    fi

    # Check for uncommitted changes
    cd "$REPO_ROOT"
    if [ -n "$(git status --porcelain ushadow/launcher)" ]; then
        echo -e "${YELLOW}Warning: Uncommitted changes in launcher directory${NC}"
        git status --short ushadow/launcher
        echo ""
        read -p "Continue anyway? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
}

prompt_version() {
    local current="$1"

    # Parse current version
    IFS='.' read -r major minor patch <<< "$current"

    local next_patch="$major.$minor.$((patch + 1))"
    local next_minor="$major.$((minor + 1)).0"
    local next_major="$((major + 1)).0.0"

    echo -e "${CYAN}╭─────────────────────────────────────────╮${NC}"
    echo -e "${CYAN}│${NC}  ${BOLD}Ushadow Launcher Release${NC}              ${CYAN}│${NC}"
    echo -e "${CYAN}╰─────────────────────────────────────────╯${NC}"
    echo ""
    echo -e "Current version: ${BOLD}$current${NC}"
    echo ""
    echo "Suggested versions:"
    echo -e "  ${GREEN}1)${NC} $next_patch  (patch - bug fixes)"
    echo -e "  ${GREEN}2)${NC} $next_minor  (minor - new features)"
    echo -e "  ${GREEN}3)${NC} $next_major  (major - breaking changes)"
    echo -e "  ${GREEN}4)${NC} Custom version"
    echo ""

    read -p "Select version [1]: " version_choice
    version_choice=${version_choice:-1}

    case "$version_choice" in
        1) NEW_VERSION="$next_patch" ;;
        2) NEW_VERSION="$next_minor" ;;
        3) NEW_VERSION="$next_major" ;;
        4)
            read -p "Enter version (e.g., 1.2.3): " NEW_VERSION
            if ! [[ "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
                echo -e "${RED}Invalid version format${NC}"
                exit 1
            fi
            ;;
        *)
            echo -e "${RED}Invalid choice${NC}"
            exit 1
            ;;
    esac

    echo ""
    echo -e "New version: ${GREEN}$NEW_VERSION${NC}"
}

prompt_release_name() {
    echo ""
    echo -e "Enter release name (optional, press Enter to skip):"
    echo -e "${YELLOW}Examples: 'Initial Release', 'Bug Fix Update', 'New Dashboard'${NC}"
    read -p "> " RELEASE_NAME

    if [ -z "$RELEASE_NAME" ]; then
        RELEASE_NAME="v$NEW_VERSION"
    fi

    echo -e "Release name: ${GREEN}$RELEASE_NAME${NC}"
}

prompt_platforms() {
    echo ""
    echo "Select platforms to build:"
    echo -e "  ${GREEN}1)${NC} All platforms (macOS, Windows, Linux) ${YELLOW}[default]${NC}"
    echo -e "  ${GREEN}2)${NC} macOS only"
    echo -e "  ${GREEN}3)${NC} Windows only"
    echo -e "  ${GREEN}4)${NC} Linux only"
    echo -e "  ${GREEN}5)${NC} macOS + Windows"
    echo -e "  ${GREEN}6)${NC} macOS + Linux"
    echo -e "  ${GREEN}7)${NC} Windows + Linux"
    echo ""

    read -p "Select platforms [1]: " platform_choice
    platform_choice=${platform_choice:-1}

    case "$platform_choice" in
        1) PLATFORMS="all" ;;
        2) PLATFORMS="macos" ;;
        3) PLATFORMS="windows" ;;
        4) PLATFORMS="linux" ;;
        5) PLATFORMS="macos,windows" ;;
        6) PLATFORMS="macos,linux" ;;
        7) PLATFORMS="windows,linux" ;;
        *)
            echo -e "${RED}Invalid choice, defaulting to all${NC}"
            PLATFORMS="all"
            ;;
    esac

    echo -e "Platforms: ${GREEN}$PLATFORMS${NC}"
}

confirm_and_release() {
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════${NC}"
    echo -e "${BOLD}Release Summary${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════${NC}"
    echo -e "  Version:      ${GREEN}$NEW_VERSION${NC}"
    echo -e "  Release name: ${GREEN}$RELEASE_NAME${NC}"
    echo -e "  Platforms:    ${GREEN}$PLATFORMS${NC}"
    echo -e "  Repository:   ${GREEN}$GITHUB_REPO${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════${NC}"
    echo ""

    read -p "Proceed with release? (y/N) " -n 1 -r
    echo

    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Release cancelled."
        exit 0
    fi

    echo ""
    echo -e "${BLUE}Starting release process...${NC}"

    # 1. Update version locally
    echo -e "${YELLOW}→ Updating version files...${NC}"
    "$SCRIPT_DIR/version.sh" set "$NEW_VERSION"

    # 2. Commit version bump
    echo -e "${YELLOW}→ Committing version bump...${NC}"
    cd "$REPO_ROOT"
    git add ushadow/launcher/package.json \
            ushadow/launcher/src-tauri/tauri.conf.json \
            ushadow/launcher/src-tauri/Cargo.toml
    git commit -m "chore(launcher): release v$NEW_VERSION" || true

    # 3. Create and push tag
    local tag="launcher-v$NEW_VERSION"
    echo -e "${YELLOW}→ Creating tag $tag...${NC}"

    # Delete existing tag if present
    git tag -d "$tag" 2>/dev/null || true
    git push origin ":refs/tags/$tag" 2>/dev/null || true

    git tag -a "$tag" -m "$RELEASE_NAME"

    # 4. Push tag (triggers GitHub Actions)
    echo -e "${YELLOW}→ Pushing tag to GitHub...${NC}"
    git push origin "$tag"

    # 5. Trigger GitHub Actions workflow (if not all platforms, use workflow_dispatch)
    if [ "$PLATFORMS" != "all" ]; then
        echo -e "${YELLOW}→ Triggering GitHub Actions for selected platforms...${NC}"
        gh workflow run launcher-release.yml \
            --repo "$GITHUB_REPO" \
            -f version="$NEW_VERSION" \
            -f platforms="$PLATFORMS" \
            -f release_name="$RELEASE_NAME" \
            -f draft=false
    fi

    echo ""
    echo -e "${GREEN}╭─────────────────────────────────────────╮${NC}"
    echo -e "${GREEN}│${NC}  ${BOLD}✓ Release initiated successfully!${NC}      ${GREEN}│${NC}"
    echo -e "${GREEN}╰─────────────────────────────────────────╯${NC}"
    echo ""
    echo "The GitHub Actions workflow is now building your release."
    echo ""
    echo "Monitor progress at:"
    echo -e "  ${CYAN}https://github.com/$GITHUB_REPO/actions${NC}"
    echo ""
    echo "Release will be available at:"
    echo -e "  ${CYAN}https://github.com/$GITHUB_REPO/releases/tag/$tag${NC}"
}

# Main
check_prerequisites
CURRENT_VERSION=$(get_current_version)
prompt_version "$CURRENT_VERSION"
prompt_release_name
prompt_platforms
confirm_and_release
