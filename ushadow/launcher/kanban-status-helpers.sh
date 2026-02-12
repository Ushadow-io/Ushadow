#!/bin/bash
# Kanban Status Helper Functions
# Source this file in your shell: source kanban-status-helpers.sh

# Get the current ticket ID from branch name or environment
get_current_ticket_id() {
    # Check if TICKET_ID is set
    if [ -n "$TICKET_ID" ]; then
        echo "$TICKET_ID"
        return 0
    fi

    # Try to get from branch name
    local branch=$(git branch --show-current 2>/dev/null)
    if [ -n "$branch" ]; then
        echo "$branch"
        return 0
    fi

    # Fallback to worktree path
    echo "$(pwd)"
}

# Agent starts working (after receiving human input)
kanban-start-working() {
    local identifier=$(get_current_ticket_id)
    echo "📝 Moving ticket to 'in_progress'..."
    kanban-cli find-by-branch "$identifier" | grep -o 'ticket-[a-f0-9-]*' | while read ticket_id; do
        kanban-cli set-status "$ticket_id" in_progress
    done
}

# Agent stops and waits for human (needs input)
kanban-waiting-for-human() {
    local identifier=$(get_current_ticket_id)
    echo "💬 Moving ticket to 'in_review' (waiting for human)..."
    kanban-cli find-by-branch "$identifier" | grep -o 'ticket-[a-f0-9-]*' | while read ticket_id; do
        kanban-cli set-status "$ticket_id" in_review
    done
}

# Mark ticket as done (usually via workmux merge hook)
kanban-mark-done() {
    local identifier=$(get_current_ticket_id)
    echo "✅ Moving ticket to 'done'..."
    kanban-cli find-by-branch "$identifier" | grep -o 'ticket-[a-f0-9-]*' | while read ticket_id; do
        kanban-cli set-status "$ticket_id" done
    done
}

# Quick status check
kanban-status() {
    local identifier=$(get_current_ticket_id)
    echo "Current identifier: $identifier"
    echo ""
    kanban-cli find-by-branch "$identifier"
}

# Aliases for convenience
alias kb-start='kanban-start-working'
alias kb-waiting='kanban-waiting-for-human'
alias kb-done='kanban-mark-done'
alias kb-status='kanban-status'

echo "✓ Kanban status helpers loaded"
echo ""
echo "Commands available:"
echo "  kanban-start-working       (or: kb-start)   - Move to 'in_progress'"
echo "  kanban-waiting-for-human   (or: kb-waiting) - Move to 'in_review'"
echo "  kanban-mark-done           (or: kb-done)    - Move to 'done'"
echo "  kanban-status              (or: kb-status)  - Check current status"
