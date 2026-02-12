#!/bin/bash
# Claude Code Notification hook - fires on idle_prompt
# Move ticket to in_review when agent is waiting for user input

# Log for debugging
echo "[$(date)] idle-notification hook fired" >> /tmp/claude-kanban-hooks.log

BRANCH=$(git branch --show-current 2>/dev/null)

if [ -z "$BRANCH" ]; then
    exit 0
fi

if command -v kanban-cli >/dev/null 2>&1; then
    kanban-cli move-to-review "$BRANCH" 2>/dev/null
    echo "[$(date)] Moved $BRANCH to review" >> /tmp/claude-kanban-hooks.log
fi

exit 0
