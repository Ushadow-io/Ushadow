#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Ushadow Launcher - Kanban Hooks Setup${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo

# Check if we're in the right directory
if [ ! -f "src-tauri/Cargo.toml" ]; then
    echo -e "${RED}Error: Must run from launcher directory (ushadow/launcher)${NC}"
    exit 1
fi

# Step 1: Build the CLI tool
echo -e "${YELLOW}Step 1: Building kanban-cli...${NC}"
cd src-tauri
if cargo build --release --bin kanban-cli; then
    echo -e "${GREEN}✓ Built successfully${NC}"
else
    echo -e "${RED}✗ Build failed${NC}"
    exit 1
fi
cd ..
echo

# Step 2: Install the CLI tool
echo -e "${YELLOW}Step 2: Installing kanban-cli...${NC}"
INSTALL_DIR="$HOME/.local/bin"
CLI_SOURCE="src-tauri/target/release/kanban-cli"

# Create installation directory if it doesn't exist
mkdir -p "$INSTALL_DIR"

# Copy the binary
cp "$CLI_SOURCE" "$INSTALL_DIR/"
chmod +x "$INSTALL_DIR/kanban-cli"

echo -e "${GREEN}✓ Installed to: $INSTALL_DIR/kanban-cli${NC}"

# Check if directory is in PATH
if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
    echo -e "${YELLOW}⚠  $INSTALL_DIR is not in your PATH${NC}"
    echo
    echo "Add this to your ~/.zshrc or ~/.bashrc:"
    echo -e "${BLUE}export PATH=\"\$HOME/.local/bin:\$PATH\"${NC}"
    echo
fi
echo

# Step 3: Verify installation
echo -e "${YELLOW}Step 3: Verifying installation...${NC}"
if command -v kanban-cli &> /dev/null; then
    echo -e "${GREEN}✓ kanban-cli is available in PATH${NC}"
    kanban-cli --help | head -5
else
    echo -e "${RED}✗ kanban-cli not found in PATH${NC}"
    echo "You may need to restart your shell or run:"
    echo -e "${BLUE}export PATH=\"\$HOME/.local/bin:\$PATH\"${NC}"
fi
echo

# Step 4: Configure workmux hooks
echo -e "${YELLOW}Step 4: Configuring workmux hooks...${NC}"

WORKMUX_CONFIG="$HOME/.config/workmux/config.yaml"
WORKMUX_DIR="$HOME/.config/workmux"

# Create workmux config directory if it doesn't exist
if [ ! -d "$WORKMUX_DIR" ]; then
    echo "Creating workmux config directory..."
    mkdir -p "$WORKMUX_DIR"
fi

# Check if config exists
if [ -f "$WORKMUX_CONFIG" ]; then
    echo -e "${YELLOW}⚠  Workmux config already exists${NC}"
    echo "Location: $WORKMUX_CONFIG"
    echo

    # Check if hook is already configured
    if grep -q "kanban-cli move-to-review" "$WORKMUX_CONFIG" 2>/dev/null; then
        echo -e "${GREEN}✓ Kanban hook already configured${NC}"
    else
        echo "To enable automatic status updates, add this to your pre_merge hooks:"
        echo
        echo -e "${BLUE}pre_merge:"
        echo "  - kanban-cli move-to-review \"\$WM_BRANCH_NAME\"${NC}"
        echo
    fi
else
    echo "Creating workmux config with kanban hooks..."
    cat > "$WORKMUX_CONFIG" << 'EOF'
# Workmux global configuration
# See: workmux init for all options

#-------------------------------------------------------------------------------
# Hooks
#-------------------------------------------------------------------------------

# Commands to run before merging (e.g., linting, tests).
# Aborts the merge if any command fails.
pre_merge:
  # Automatically move tickets to "in_review" status
  - kanban-cli move-to-review "$WM_BRANCH_NAME"

  # Uncomment to run tests before merge:
  # - npm test
  # - cargo test
  # - pytest

EOF
    echo -e "${GREEN}✓ Created workmux config with kanban hooks${NC}"
    echo "Location: $WORKMUX_CONFIG"
fi
echo

# Summary
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}Setup Complete!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo
echo "What's next?"
echo
echo "1. ${GREEN}Test the CLI:${NC}"
echo "   kanban-cli --help"
echo
echo "2. ${GREEN}Create a ticket in the Kanban board${NC}"
echo "   - Link it to a worktree/branch"
echo
echo "3. ${GREEN}Test the hook:${NC}"
echo "   - Make changes in the worktree"
echo "   - Run: workmux merge"
echo "   - The ticket should automatically move to 'In Review'"
echo
echo "4. ${GREEN}View documentation:${NC}"
echo "   cat KANBAN_HOOKS.md"
echo
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
