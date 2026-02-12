#!/bin/bash
# Claude Code UserPromptSubmit hook - user just submitted a prompt
# Move ticket to in_progress (agent resuming work after waiting)

BRANCH=$(git branch --show-current 2>/dev/null)

if [ -z "$BRANCH" ]; then
    exit 0
fi

if command -v kanban-cli >/dev/null 2>&1; then
    kanban-cli move-to-progress "$BRANCH" 2>/dev/null
fi

exit 0
