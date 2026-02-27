---
title: Kanban Hooks
sidebar_position: 3
---


This document walks through a complete example of using Kanban hooks to automatically update ticket status.

## Scenario

You're working on a new feature called "Add User Authentication". You want:
1. A Kanban ticket to track the work
2. A dedicated worktree and tmux window for development
3. **Automatic status updates** when you finish and merge the work

## Step-by-Step Walkthrough

### 1. Setup (One-Time)

Install the kanban-cli tool and configure workmux hooks:

```bash
cd ushadow/launcher
./install-kanban-hooks.sh
```

This will:
- Build and install `kanban-cli` to `~/.local/bin/`
- Configure workmux to automatically update ticket status on merge

### 2. Create a Ticket

Open the Ushadow Launcher and go to the **Kanban** tab:

1. Click "New Ticket"
2. Enter details:
   - Title: "Add User Authentication"
   - Description: "Implement JWT-based authentication with login/logout"
   - Priority: High
3. Click "Create"

The ticket starts in **Backlog** status.

### 3. Create a Worktree for the Ticket

In the **Environments** tab:

1. Click "New Environment"
2. Select "Worktree"
3. Enter name: `auth-feature`
4. Enter branch: `feature/user-auth`
5. Click "Create"

This creates:
- A git worktree at `/path/to/worktrees/auth-feature`
- A tmux window named `ushadow-auth-feature`
- Containers running on dedicated ports

### 4. Link the Ticket to the Worktree

Back in the **Kanban** tab:

1. Click on your ticket to open details
2. In the "Environment" dropdown, select `auth-feature`
3. The ticket is now linked to the worktree

Move the ticket to **In Progress** status (drag and drop to the column).

### 5. Do the Work

Click the purple terminal icon on the environment card to open tmux:

```bash
# You're now in the worktree directory
pwd
# /path/to/worktrees/auth-feature

# Start coding
git status
# On branch feature/user-auth

# Make changes, commit them
git add .
git commit -m "Add JWT authentication endpoints"
git push
```

### 6. Finish and Merge

When you're done and ready for review:

```bash
# Use workmux to merge the branch
workmux merge auth-feature
```

**What happens automatically:**

1. **Pre-merge hook runs** (configured in `~/.config/workmux/config.yaml`):
   ```yaml
   pre_merge:
     - kanban-cli move-to-review "$WM_BRANCH_NAME"
   ```

2. **kanban-cli executes**:
   - Looks for tickets linked to branch `feature/user-auth`
   - Finds your "Add User Authentication" ticket
   - Updates its status from "In Progress" to **"In Review"**

3. **Merge continues**:
   - Branch is rebased onto main
   - Branch is merged
   - Worktree is deleted
   - Tmux window is closed

4. **Result**:
   - Your code is merged to main ✅
   - Ticket is automatically in "In Review" status ✅
   - Environment is cleaned up ✅

### 7. Complete the Ticket

After code review and approval, manually move the ticket to **Done** in the Kanban board.

## Behind the Scenes

### What the Hook Does

When you run `workmux merge auth-feature`, workmux sets these environment variables:

```bash
WM_BRANCH_NAME="feature/user-auth"
WM_WORKTREE_PATH="/path/to/worktrees/auth-feature"
WM_HANDLE="auth-feature"
WM_PROJECT_ROOT="/path/to/project"
WM_TARGET_BRANCH="main"
```

Then it runs the pre-merge hook:

```bash
kanban-cli move-to-review "$WM_BRANCH_NAME"
# Equivalent to: kanban-cli move-to-review "feature/user-auth"
```

The CLI:
1. Opens the SQLite database: `~/Library/Application Support/com.ushadow.launcher/kanban.db`
2. Searches for tickets where `branch_name = "feature/user-auth"`
3. For each ticket found:
   - Checks current status
   - If status is not "in_review" or "done", updates to "in_review"
4. Exits successfully (even if no tickets found)

### Database Schema

The Kanban database stores ticket metadata:

```sql
CREATE TABLE tickets (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    status TEXT NOT NULL,  -- backlog, todo, in_progress, in_review, done, archived
    branch_name TEXT,      -- Links ticket to git branch
    worktree_path TEXT,    -- Links ticket to worktree location
    tmux_window_name TEXT, -- Links ticket to tmux window
    -- ... other fields
);
```

## Advanced Examples

### Multiple Tickets per Worktree

If you have multiple tickets linked to the same branch (common with epics), they'll all be moved to review:

```bash
# Both tickets linked to "epic-auth" branch
# Ticket 1: "Implement login endpoint"
# Ticket 2: "Implement logout endpoint"

workmux merge epic-auth
# → Both tickets moved to "In Review" ✅
```

### Manual CLI Usage

You can also use the CLI manually:

```bash
# Check what tickets are linked to a branch
kanban-cli find-by-branch "feature/user-auth"

# Manually move a specific ticket
kanban-cli set-status ticket-abc123 in_review

# Move tickets by worktree path
kanban-cli move-to-review "/path/to/worktrees/auth-feature"

# Move tickets by tmux window
kanban-cli move-to-review "ushadow-auth-feature"
```

### Custom Status Workflows

You can create custom scripts for different transitions:

**Script: `~/bin/start-work`**
```bash
#!/bin/bash
# Usage: start-work <branch-name>
kanban-cli move-to-review "$1"
workmux open "$1"
```

**Script: `~/bin/complete-work`**
```bash
#!/bin/bash
# Usage: complete-work <branch-name>
kanban-cli move-to-review "$1"
workmux merge "$1"
```

### Notification Integration

Add notifications to your hooks:

```yaml
# ~/.config/workmux/config.yaml
pre_merge:
  - kanban-cli move-to-review "$WM_BRANCH_NAME"
  - osascript -e 'display notification "Tickets moved to review" with title "Kanban"'
```

Or with terminal-notifier:

```bash
brew install terminal-notifier
```

```yaml
pre_merge:
  - kanban-cli move-to-review "$WM_BRANCH_NAME"
  - terminal-notifier -title "Kanban" -message "Tickets moved to review"
```

## Troubleshooting

### "No tickets found" (Not an Error!)

This is perfectly normal! Not all worktrees have Kanban tickets. The CLI is designed to exit successfully even when no tickets are found, so it doesn't break your merge process.

### Tickets Not Updating

**Check ticket linkage:**
```bash
# Open launcher → Kanban tab
# Click on ticket → Verify environment is linked
```

**Check branch name:**
```bash
# In your worktree
git branch --show-current
# Compare with ticket's branch_name in database

# Search for tickets
kanban-cli find-by-branch "$(git branch --show-current)"
```

**Check database:**
```bash
# View database location
echo ~/Library/Application\ Support/com.ushadow.launcher/kanban.db

# If using sqlite3 CLI:
sqlite3 ~/Library/Application\ Support/com.ushadow.launcher/kanban.db \
  "SELECT id, title, status, branch_name FROM tickets WHERE branch_name IS NOT NULL"
```

### Hook Not Running

**Test the hook manually:**
```bash
# Set environment variables like workmux does
export WM_BRANCH_NAME="feature/user-auth"

# Run the hook command
kanban-cli move-to-review "$WM_BRANCH_NAME"
```

**Check workmux config:**
```bash
cat ~/.config/workmux/config.yaml
# Look for pre_merge section
```

**Verify kanban-cli is in PATH:**
```bash
which kanban-cli
# Should output: /Users/yourusername/.local/bin/kanban-cli
```

## Benefits

This automated workflow provides:

1. **Reduced Manual Work**: No need to remember to update ticket status
2. **Consistent Process**: Every merge updates status automatically
3. **Better Tracking**: Always know what's in review vs. in progress
4. **Audit Trail**: Git history + ticket status updates = complete picture
5. **Team Coordination**: Team members see tickets in review immediately

## Next Steps

- [ ] Set up the hooks following this guide
- [ ] Create a test ticket and worktree
- [ ] Try the merge process
- [ ] Customize the workflow for your team's needs
- [ ] Explore other hook opportunities (post-create, pre-remove)

For more information, see:
- [KANBAN_HOOKS.md](./KANBAN_HOOKS.md) - Complete technical documentation
- [README.md](./README.md) - Launcher overview
- [Workmux Documentation](https://github.com/joshka/workmux) - Workmux features
