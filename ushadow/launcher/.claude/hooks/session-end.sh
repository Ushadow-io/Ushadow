#!/bin/bash
# Claude Code SessionEnd hook - agent session ending
# Move ticket to in_review (waiting for human to review/respond)

BRANCH=$(git branch --show-current 2>/dev/null)

if [ -z "$BRANCH" ]; then
    exit 0
fi

if command -v kanban-cli >/dev/null 2>&1; then
    kanban-cli move-to-review "$BRANCH" 2>/dev/null
fi

exit 0
