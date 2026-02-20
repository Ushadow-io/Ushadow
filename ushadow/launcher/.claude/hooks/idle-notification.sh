#!/bin/bash
# Claude Code Notification hook - fires on idle_prompt
# Move ticket to in_review when agent is waiting for user input

# Log for debugging
echo "[$(date)] idle-notification hook fired in $(pwd)" >> /tmp/claude-kanban-hooks.log

# Use worktree path (more reliable than branch name)
WORKTREE_PATH="$(pwd)"

if command -v kanban-cli >/dev/null 2>&1; then
    kanban-cli move-to-review "$WORKTREE_PATH" 2>/dev/null
    echo "[$(date)] Moved ticket at $WORKTREE_PATH to review" >> /tmp/claude-kanban-hooks.log
fi

exit 0
