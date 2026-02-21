#!/bin/bash
# Claude Code SessionEnd hook - agent session ending
# Move ticket to in_review (waiting for human to review/respond)

# Use worktree path (more reliable than branch name)
WORKTREE_PATH="$(pwd)"

if command -v kanban-cli >/dev/null 2>&1; then
    kanban-cli move-to-review "$WORKTREE_PATH" 2>/dev/null
fi

exit 0
