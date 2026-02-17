#!/bin/bash
# Claude Code SessionStart hook - agent session just started
# Move ticket to in_progress

# Use worktree path (more reliable than branch name)
WORKTREE_PATH="$(pwd)"

if command -v kanban-cli >/dev/null 2>&1; then
    kanban-cli move-to-progress "$WORKTREE_PATH" 2>/dev/null
fi

exit 0
