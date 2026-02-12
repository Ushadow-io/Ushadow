#!/bin/bash
# Claude Code hook for automatic Kanban status updates
#
# This script is called by Claude Code hooks to automatically update
# ticket status based on agent activity.

# Get current branch name
BRANCH=$(git branch --show-current 2>/dev/null)

if [ -z "$BRANCH" ]; then
    # Not in a git repository or no branch, skip
    exit 0
fi

# Function to update status via kanban-cli
update_status() {
    local status="$1"
    local command="$2"

    if command -v kanban-cli >/dev/null 2>&1; then
        kanban-cli "$command" "$BRANCH" 2>/dev/null
    fi
}

# Determine which hook triggered this script
case "$CLAUDE_HOOK_NAME" in
    "SessionStart")
        # Agent session started - move to in_progress
        update_status "in_progress" "move-to-progress"
        ;;
    "UserPromptSubmit")
        # User just submitted a response - agent resuming work
        update_status "in_progress" "move-to-progress"
        ;;
    "AssistantWaitingForUser")
        # Agent is waiting for user input - move to in_review
        update_status "in_review" "move-to-review"
        ;;
    "SessionEnd")
        # Agent session ended - move to in_review
        update_status "in_review" "move-to-review"
        ;;
esac

exit 0
