---
title: Kanban Integration
sidebar_position: 2
---


This document explains how to automatically update Kanban ticket status based on workmux/tmux events.

## Overview

The launcher includes a CLI tool (`kanban-cli`) that can be called from workmux hooks to automatically update ticket status. The most common use case is moving tickets to "In Review" when an agent stops working and the branch is ready for merge.

## Installation

### 1. Build the CLI Tool

```bash
cd ushadow/launcher/src-tauri
cargo build --release --bin kanban-cli

# The binary will be at: target/release/kanban-cli
```

### 2. Install the CLI Tool

Copy the binary to a location in your PATH:

```bash
# Option 1: System-wide installation
sudo cp target/release/kanban-cli /usr/local/bin/

# Option 2: User installation
mkdir -p ~/.local/bin
cp target/release/kanban-cli ~/.local/bin/
# Make sure ~/.local/bin is in your PATH

# Verify installation
kanban-cli --help
```

## CLI Usage

The `kanban-cli` tool provides several commands:

### Set Ticket Status

```bash
kanban-cli set-status <ticket-id> <status>
```

Statuses: `backlog`, `todo`, `in_progress`, `in_review`, `done`, `archived`

Example:
```bash
kanban-cli set-status ticket-abc123 in_review
```

### Find Tickets

```bash
# Find by worktree path
kanban-cli find-by-path /path/to/worktree

# Find by branch name
kanban-cli find-by-branch feature-branch

# Find by tmux window name
kanban-cli find-by-window ushadow-feature-branch
```

### Move to Review (Most Useful)

The `move-to-review` command is designed for use in hooks. It accepts a flexible identifier and automatically finds matching tickets:

```bash
kanban-cli move-to-review <identifier>
```

The identifier can be:
- Worktree path
- Branch name
- Tmux window name

It will:
- Find all tickets matching the identifier
- Skip tickets already in "in_review" or "done" status
- Move remaining tickets to "in_review"
- Exit cleanly even if no tickets are found (not all worktrees have tickets)

## Workmux Hook Configuration

### Option 1: Global Configuration (Recommended)

Edit `~/.config/workmux/config.yaml`:

```yaml
# Commands to run before merging
pre_merge:
  # Move associated tickets to "in_review" status
  - kanban-cli move-to-review "$WM_BRANCH_NAME"

  # Optional: Run tests before merge
  - pytest
  - cargo test
```

This applies to **all** workmux projects. The hook will:
1. Find tickets associated with the branch being merged
2. Move them to "in_review" status
3. Continue with the merge process

### Option 2: Project-Specific Configuration

Edit `.workmux.yaml` in your project root:

```yaml
pre_merge:
  - "<global>"  # Inherit global hooks
  - kanban-cli move-to-review "$WM_WORKTREE_PATH"
  # Or use branch name:
  # - kanban-cli move-to-review "$WM_BRANCH_NAME"
```

### Available Environment Variables in Hooks

Workmux provides these variables in hook scripts:

- `$WM_BRANCH_NAME`: The branch being merged (e.g., "feature-login")
- `$WM_TARGET_BRANCH`: The target branch (e.g., "main")
- `$WM_WORKTREE_PATH`: Absolute path to the worktree
- `$WM_PROJECT_ROOT`: Absolute path to the main project
- `$WM_HANDLE`: The worktree handle/window name

## Other Hook Opportunities

### Post-Create Hook

Move tickets to "in_progress" when a worktree is created:

```yaml
post_create:
  - kanban-cli move-to-review "$WM_WORKTREE_PATH"
  # Note: You'd need to add a "move-to-progress" command for this
```

### Pre-Remove Hook

Archive tickets when a worktree is removed:

```yaml
pre_remove:
  - kanban-cli set-status <ticket-id> archived
```

## Workflow Example

Here's a typical workflow with automatic status updates:

1. **Create Ticket in Kanban Board**
   - Status: Backlog
   - Create worktree for the ticket (links ticket to branch)

2. **Start Working**
   - Manually move ticket to "In Progress" in UI
   - Or add a post-create hook to do this automatically

3. **Finish Work**
   - Run `workmux merge` to merge the branch
   - **pre_merge hook automatically moves ticket to "In Review"**
   - Merge completes

4. **Review & Complete**
   - Reviewer checks the code
   - Manually move ticket to "Done" after approval

## Troubleshooting

### CLI Not Found

```bash
# Check if it's in your PATH
which kanban-cli

# If not, add ~/.local/bin to PATH in ~/.zshrc or ~/.bashrc:
export PATH="$HOME/.local/bin:$PATH"
```

### No Tickets Found

This is normal! Not all worktrees have associated Kanban tickets. The `move-to-review` command exits successfully even when no tickets are found.

To debug, manually check for tickets:

```bash
# See what workmux sees
echo "Branch: $WM_BRANCH_NAME"
echo "Path: $WM_WORKTREE_PATH"

# Check for tickets
kanban-cli find-by-branch "$WM_BRANCH_NAME"
```

### Database Not Found

The CLI looks for the Kanban database at:
- macOS: `~/Library/Application Support/com.ushadow.launcher/kanban.db`
- Linux: `~/.local/share/com.ushadow.launcher/kanban.db`
- Windows: `%APPDATA%\com.ushadow.launcher\kanban.db`

If the database doesn't exist, you need to:
1. Run the Ushadow Launcher at least once
2. Create at least one ticket (this initializes the database)

### Hook Not Running

Verify your workmux configuration:

```bash
# Check global config
cat ~/.config/workmux/config.yaml

# Check project config
cat .workmux.yaml

# Test the command manually
kanban-cli move-to-review "your-branch-name"
```

## Advanced: Custom Status Transitions

You can create custom scripts for different status transitions:

### Script: `move-to-progress.sh`

```bash
#!/bin/bash
kanban-cli set-status "$1" in_progress
```

### Script: `complete-ticket.sh`

```bash
#!/bin/bash
# Move to done and close tmux window
kanban-cli set-status "$1" done
workmux close "$WM_HANDLE"
```

Make them executable and add to your PATH:

```bash
chmod +x move-to-progress.sh complete-ticket.sh
mv *.sh ~/.local/bin/
```

## Integration with Other Tools

### Git Hooks

You can also use `kanban-cli` in git hooks:

```bash
# .git/hooks/pre-push
#!/bin/bash
BRANCH=$(git rev-parse --abbrev-ref HEAD)
kanban-cli move-to-review "$BRANCH"
```

### CI/CD

Update ticket status from CI pipelines:

```bash
# In your CI script
kanban-cli set-status "$TICKET_ID" done
```

## Future Enhancements

Potential improvements to this system:

- [ ] Auto-detect ticket ID from branch name (e.g., `ticket-123-feature`)
- [ ] Support for custom status workflows
- [ ] Slack/Discord notifications on status change
- [ ] Integration with GitHub/GitLab issues
- [ ] Web API for external integrations
- [ ] Rollback command for accidental status changes

## See Also

- [Workmux Documentation](https://github.com/joshka/workmux)
- [Launcher README](./README.md)
- [Kanban Board Usage](./README.md#managing-work-with-kanban-board)
