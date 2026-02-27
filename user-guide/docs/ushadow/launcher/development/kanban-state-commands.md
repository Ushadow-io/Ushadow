---
title: Kanban State Commands
sidebar_position: 4
---


This document provides a quick reference for all available kanban state management commands and their usage in different contexts.

## Available Commands

### 1. Move to In Progress
Marks ticket(s) as actively being worked on.

```bash
kanban-cli move-to-progress <identifier>
```

**When to use:**
- Agent session starts (automatic via Claude Code SessionStart hook)
- Worktree is created (automatic via workmux post_create hook)
- Manually when picking up work

**Example:**
```bash
kanban-cli move-to-progress "feature/auth-system"
```

### 2. Move to In Review
Marks ticket(s) as waiting for human review/input.

```bash
kanban-cli move-to-review <identifier>
```

**When to use:**
- Agent session ends (automatic via Claude Code SessionEnd hook)
- Before merging branch (automatic via workmux pre_merge hook)
- Agent is blocked and needs human decision
- Work is complete and ready for code review

**Example:**
```bash
kanban-cli move-to-review "feature/auth-system"
```

### 3. Move to Done
Marks ticket(s) as completed.

```bash
kanban-cli move-to-done <identifier>
```

**When to use:**
- After successful merge and code review
- Work is fully completed and deployed
- Optionally when removing worktree (commented out in pre_remove hook)

**Example:**
```bash
kanban-cli move-to-done "feature/auth-system"
```

### 4. Set Specific Status
Manually set any valid status.

```bash
kanban-cli set-status <ticket-id> <status>
```

**Valid statuses:**
- `backlog` - Not yet scheduled
- `todo` - Scheduled but not started
- `in_progress` - Actively being worked on
- `in_review` - Waiting for review/feedback
- `done` - Completed
- `archived` - Closed/archived

**Example:**
```bash
kanban-cli set-status ticket-abc123 archived
```

## Identifier Types

The `move-to-*` commands accept flexible identifiers. They try to match tickets by:

1. **Branch name** (most common)
   ```bash
   kanban-cli move-to-review "feature/new-auth"
   ```

2. **Worktree path**
   ```bash
   kanban-cli move-to-review "/Users/dev/worktrees/ushadow/auth-feature"
   ```

3. **Tmux window name**
   ```bash
   kanban-cli move-to-review "ushadow-auth-feature"
   ```

The CLI tries all three methods until it finds matching tickets.

## Automatic State Transitions

### Claude Code Hooks (Agent Sessions)

| Hook | Trigger | Command | Status Change |
|------|---------|---------|---------------|
| SessionStart | Agent starts | `move-to-progress` | → in_progress |
| UserPromptSubmit | User responds | `move-to-progress` | → in_progress |
| SessionEnd | Agent stops | `move-to-review` | → in_review |

**Configuration:** `.claude/settings.local.json` and `.claude/hooks/*.sh`

### Workmux Hooks (Worktree Lifecycle)

| Hook | Trigger | Command | Status Change |
|------|---------|---------|---------------|
| post_create | Worktree created | `move-to-progress` | → in_progress |
| pre_merge | Before merge | `move-to-review` | → in_review |
| pre_remove | Before cleanup | `move-to-done` | → done (optional) |

**Configuration:** `.workmux.yaml`

## Environment Variables in Hooks

Workmux provides these variables for use in hooks:

```bash
$WM_BRANCH_NAME      # Branch name (e.g., "feature/auth")
$WM_TARGET_BRANCH    # Target branch (e.g., "main")
$WM_WORKTREE_PATH    # Absolute path to worktree
$WM_PROJECT_ROOT     # Absolute path to main project
$WM_HANDLE           # Worktree handle/window name
```

**Example usage in .workmux.yaml:**
```yaml
pre_merge:
  - 'kanban-cli move-to-review "$WM_BRANCH_NAME"'
```

## Complete Workflow Example

### 1. Create Ticket
- **Status:** `backlog`
- Create in Kanban Board UI
- Link to branch name (e.g., "feature/user-auth")

### 2. Create Worktree
```bash
workmux create feature/user-auth
```
- **Automatic:** `post_create` hook runs
- **Status:** `backlog` → `in_progress`

### 3. Agent Starts Working
```bash
claude  # Start Claude Code session
```
- **Automatic:** `SessionStart` hook runs
- **Status:** Remains `in_progress`

### 4. Agent Stops (Needs Human Input)
Agent finishes turn or session ends
- **Automatic:** `SessionEnd` hook runs
- **Status:** `in_progress` → `in_review`

### 5. User Responds
```bash
# User types response in Claude Code
```
- **Automatic:** `UserPromptSubmit` hook runs
- **Status:** `in_review` → `in_progress`

### 6. Ready to Merge
```bash
workmux merge feature/user-auth
```
- **Automatic:** `pre_merge` hook runs
- **Status:** `in_progress` → `in_review`
- Branch is merged to main

### 7. Manual Completion
After code review and approval:
```bash
kanban-cli move-to-done "feature/user-auth"
```
- **Status:** `in_review` → `done`

## Manual Overrides

You can manually change status at any time:

```bash
# Force a ticket back to in progress
kanban-cli move-to-progress "feature/auth"

# Mark multiple tickets done by branch
kanban-cli move-to-done "epic/auth-system"

# Set specific status
kanban-cli set-status ticket-123 archived
```

## Debugging

### Check Current Status
```bash
# Find tickets by branch
kanban-cli find-by-branch "feature/auth"

# Find tickets by worktree
kanban-cli find-by-path "$PWD"

# Find tickets by window
kanban-cli find-by-window "ushadow-auth-feature"
```

### Test Hooks Manually
```bash
# Set up environment like workmux does
export WM_BRANCH_NAME="feature/auth"

# Run the hook command
kanban-cli move-to-review "$WM_BRANCH_NAME"
```

### Check Hook Configuration
```bash
# Claude Code hooks
cat .claude/settings.local.json

# Workmux hooks
cat .workmux.yaml

# Verify kanban-cli is in PATH
which kanban-cli
```

## Error Handling

All kanban-cli commands:
- Exit successfully even if no tickets found (not all branches have tickets)
- Use `2>/dev/null || true` in hooks to prevent blocking workflow
- Log errors to stderr but don't fail the parent process

**Example safe hook usage:**
```yaml
pre_merge:
  - 'kanban-cli move-to-review "$WM_BRANCH_NAME" 2>/dev/null || true'
```

## Advanced: Custom State Transitions

Create custom scripts for team-specific workflows:

```bash
#!/bin/bash
# scripts/start-sprint-work.sh
TICKET_ID=$1
kanban-cli set-status "$TICKET_ID" in_progress
workmux create "$(git config branch.$TICKET_ID.remote)"
```

```bash
#!/bin/bash
# scripts/complete-and-deploy.sh
BRANCH=$1
kanban-cli move-to-review "$BRANCH"
workmux merge "$BRANCH"
# Deploy commands here...
kanban-cli move-to-done "$BRANCH"
```

## See Also

- [KANBAN_HOOKS.md](./KANBAN_HOOKS.md) - Complete technical documentation
- [KANBAN_HOOKS_EXAMPLE.md](./KANBAN_HOOKS_EXAMPLE.md) - Step-by-step walkthrough
- [.workmux.yaml](../../.workmux.yaml) - Workmux configuration
- [.claude/settings.local.json](./.claude/settings.local.json) - Claude Code hooks
