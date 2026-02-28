#!/bin/bash

# Function to add frontmatter to a markdown file
add_frontmatter() {
    local source="$1"
    local dest="$2"
    local title="$3"
    local position="$4"

    # Extract content (skip first # heading line if it exists)
    content=$(tail -n +2 "$source")

    # Create file with frontmatter
    cat > "$dest" << EOF
---
title: $title
sidebar_position: $position
---

$content
EOF
}

# Getting Started
add_frontmatter "../ushadow/launcher/DOCS_QUICKSTART.md" "docs/ushadow/launcher/getting-started/quickstart.md" "Quickstart Guide" 1
add_frontmatter "../ushadow/launcher/PLATFORM_SUPPORT.md" "docs/ushadow/launcher/getting-started/platform-support.md" "Platform Support" 2

# Concepts
cat > "docs/ushadow/launcher/concepts/worktrees.md" << 'EOF'
---
title: Git Worktrees
sidebar_position: 1
---

## What are Git Worktrees?

Git worktrees allow you to check out multiple branches simultaneously in separate directories. This is perfect for parallel development where you need to work on multiple features or bug fixes at the same time.

## Benefits

- **No context switching**: Keep your work in progress without git stash
- **Parallel development**: Work on multiple features simultaneously
- **Independent environments**: Each worktree can have its own containers and ports
- **Quick switching**: Jump between different branches instantly

## How the Launcher Uses Worktrees

The launcher automatically:
- Creates worktrees in a dedicated directory
- Sets up tmux windows for each worktree
- Configures environment-specific Docker containers
- Manages port allocation to avoid conflicts

## Creating a Worktree

1. Click "New Environment" in the Environments tab
2. Choose "Worktree"
3. Enter a branch name (or select existing branch)
4. The launcher will:
   - Create the worktree directory
   - Set up a tmux window
   - Configure default credentials
   - Start environment containers

## Best Practices

- Use descriptive names: `fix-login-bug`, `add-auth-feature`
- Keep worktrees focused on single tasks
- Merge and delete when done to save disk space
- Regularly pull main to avoid conflicts
EOF

cat > "docs/ushadow/launcher/concepts/environments.md" << 'EOF'
---
title: Environments
sidebar_position: 2
---

## What are Environments?

In the launcher, an "environment" is a complete development setup that includes:
- A directory (worktree or linked folder)
- A tmux session/window
- Docker containers with unique ports
- Environment-specific configuration

## Environment Types

### Worktree Environments
Git worktrees managed by the launcher. These are recommended for most development workflows.

**Benefits:**
- Automatic setup
- Integrated with Kanban tickets
- One-click merge back to main
- Clean separation between features

### Linked Environments
Existing directories you want to manage through the launcher without creating a worktree.

**Use cases:**
- Main development directory
- External projects
- Legacy setups

## Environment Lifecycle

1. **Creation**: Launcher sets up directory, tmux, and containers
2. **Development**: Work in the environment, use tmux sessions
3. **Monitoring**: Real-time status badges show activity
4. **Cleanup**: Merge and delete when work is complete

## Multi-Environment Workflows

The launcher excels at managing multiple environments simultaneously:

- Work on feature A in one worktree
- Fix bug B in another worktree
- Review PR in a third worktree
- All with independent containers and tmux sessions

## Environment Status

Each environment shows real-time status:
- 🟢 **Green**: All systems operational
- 🟡 **Yellow**: Partial (some services down)
- 🔴 **Red**: Stopped or error state
- 🔵 **Blue**: Tmux activity indicator
EOF

# Guides
add_frontmatter "../ushadow/launcher/TMUX_INTEGRATION.md" "docs/ushadow/launcher/guides/tmux-integration.md" "Tmux Integration" 1
add_frontmatter "../ushadow/launcher/KANBAN_HOOKS.md" "docs/ushadow/launcher/guides/kanban-integration.md" "Kanban Integration" 2
add_frontmatter "../ushadow/launcher/KANBAN_HOOKS_EXAMPLE.md" "docs/ushadow/launcher/guides/kanban-hooks.md" "Kanban Hooks" 3
add_frontmatter "../ushadow/launcher/KANBAN_AUTO_STATUS.md" "docs/ushadow/launcher/guides/kanban-auto-status.md" "Auto Status Updates" 4
add_frontmatter "../ushadow/launcher/CROSS_PLATFORM_TERMINAL.md" "docs/ushadow/launcher/guides/cross-platform-terminal.md" "Cross-Platform Terminal" 5
add_frontmatter "../ushadow/launcher/CUSTOM_PROJECT_GUIDE.md" "docs/ushadow/launcher/guides/custom-projects.md" "Custom Projects" 6
add_frontmatter "../ushadow/launcher/DOCUMENTATION_PLATFORMS.md" "docs/ushadow/launcher/guides/documentation-platforms.md" "Documentation Platforms" 7
add_frontmatter "../ushadow/launcher/DOCS_QUICKSTART.md" "docs/ushadow/launcher/guides/docs-quickstart.md" "Documentation Quick Start" 8
add_frontmatter "../ushadow/launcher/GENERIC_INSTALLER.md" "docs/ushadow/launcher/guides/generic-installer.md" "Generic Installer" 9
add_frontmatter "../ushadow/launcher/WINDOWS_FIXES.md" "docs/ushadow/launcher/guides/windows-fixes.md" "Windows Fixes" 10

# Development
add_frontmatter "../ushadow/launcher/TESTING.md" "docs/ushadow/launcher/development/testing.md" "Testing" 1
add_frontmatter "../ushadow/launcher/RELEASING.md" "docs/ushadow/launcher/development/releasing.md" "Releasing" 2
add_frontmatter "../ushadow/launcher/AGENT_SELF_REPORTING.md" "docs/ushadow/launcher/development/agent-self-reporting.md" "Agent Self-Reporting" 3
add_frontmatter "../ushadow/launcher/KANBAN_STATE_COMMANDS.md" "docs/ushadow/launcher/development/kanban-state-commands.md" "Kanban State Commands" 4

# Root level docs
add_frontmatter "../ushadow/launcher/CHANGELOG.md" "docs/ushadow/launcher/changelog.md" "Changelog" 100
add_frontmatter "../ushadow/launcher/ROADMAP.md" "docs/ushadow/launcher/roadmap.md" "Roadmap" 101

echo "✅ Documentation copied successfully to ushadow/launcher/ subdirectory!"
