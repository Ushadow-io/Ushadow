#!/usr/bin/env bash
# Quick helper to register a single worktree with workmux
# Usage: ./register-one-worktree.sh blue

set -euo pipefail

if [[ $# -ne 1 ]]; then
    echo "Usage: $0 <worktree-name>"
    echo "Example: $0 blue"
    exit 1
fi

WORKTREE_NAME="$1"
WORKTREE_PATH="/Users/stu/repos/worktrees/ushadow/$WORKTREE_NAME"

if [[ ! -d "$WORKTREE_PATH" ]]; then
    echo "❌ Worktree not found: $WORKTREE_PATH"
    exit 1
fi

if [[ -z "${TMUX:-}" ]]; then
    echo "❌ Must be run from inside a tmux session"
    echo "   Run: tmux attach -t workmux"
    exit 1
fi

echo "📝 Registering worktree: $WORKTREE_NAME"
cd "$WORKTREE_PATH"

if workmux open "$WORKTREE_NAME" 2>&1 | tee /tmp/workmux-open.log | grep -q "Opened tmux window"; then
    echo "✅ Successfully registered!"
    echo "   Run 'workmux list' to verify"
else
    echo "❌ Failed to register. Error:"
    cat /tmp/workmux-open.log
    exit 1
fi
