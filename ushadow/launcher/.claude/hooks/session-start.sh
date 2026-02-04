#!/bin/bash
# Claude Code SessionStart hook - agent session just started
# Move ticket to in_progress

BRANCH=$(git branch --show-current 2>/dev/null)

if [ -z "$BRANCH" ]; then
    exit 0
fi

if command -v kanban-cli >/dev/null 2>&1; then
    kanban-cli move-to-progress "$BRANCH" 2>/dev/null
fi

exit 0
