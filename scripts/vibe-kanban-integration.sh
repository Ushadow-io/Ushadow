#!/bin/bash
# Vibe-Kanban Git Integration Script
# Automatically integrates to dev when tasks move to "inreview"
#
# Usage:
#   ./vibe-kanban-integration.sh watch    # Watch for status changes (daemon mode)
#   ./vibe-kanban-integration.sh sync     # One-time sync of all inreview tasks
#   ./vibe-kanban-integration.sh status   # Show current task/branch mapping

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Configuration
VIBE_KANBAN_PORT="${VIBE_KANBAN_PORT:-53362}"
VIBE_KANBAN_API="http://localhost:${VIBE_KANBAN_PORT}/api"
PROJECT_ID="${VIBE_KANBAN_PROJECT_ID:-b2c1d35a-fbb8-422c-ba07-6ec3e3425060}"
POLL_INTERVAL="${POLL_INTERVAL:-30}"  # seconds
STATE_FILE="/tmp/vibe-kanban-task-states.json"

# Load git workflow helpers if available
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/git-workflow-helpers.sh" ]; then
    source "$SCRIPT_DIR/git-workflow-helpers.sh" 2>/dev/null || true
fi

# ════════════════════════════════════════════════════════════════
# Helper Functions
# ════════════════════════════════════════════════════════════════

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Get all tasks from vibe-kanban
get_tasks() {
    curl -s "${VIBE_KANBAN_API}/tasks?project_id=${PROJECT_ID}" | jq -r '.data // []'
}

# Get task by ID
get_task() {
    local task_id="$1"
    curl -s "${VIBE_KANBAN_API}/tasks/${task_id}" | jq -r '.data // null'
}

# Extract branch name from worktree path (e.g., "fb9a-github-strategy" from path)
get_branch_from_task() {
    local task_id="$1"
    local task_title="$2"

    # Vibe-kanban uses first 4 chars of task ID as branch prefix
    local prefix="${task_id:0:4}"

    # Find matching worktree
    local worktree_path=$(git worktree list --porcelain | grep -B1 "branch.*${prefix}" | grep "worktree" | awk '{print $2}')

    if [ -n "$worktree_path" ]; then
        # Get the branch from the worktree
        local branch=$(git -C "$worktree_path" branch --show-current 2>/dev/null)
        echo "$branch"
    else
        # Try to find by task ID prefix in branch names
        git branch -a | grep -o "[^ ]*${prefix}[^ ]*" | head -1
    fi
}

# Find worktree path for a task
get_worktree_path() {
    local task_id="$1"
    local prefix="${task_id:0:4}"

    # Look for worktree with this prefix
    git worktree list --porcelain | grep -A2 "worktree.*${prefix}" | grep "worktree" | awk '{print $2}'
}

# Check if branch is already in dev
is_in_dev() {
    local branch="$1"

    # Check if dev contains all commits from the branch
    git fetch origin dev 2>/dev/null || true
    local behind=$(git rev-list --count "origin/dev..origin/${branch}" 2>/dev/null || echo "999")

    [ "$behind" -eq 0 ]
}

# Integrate a branch to dev
integrate_branch_to_dev() {
    local branch="$1"
    local worktree_path="$2"

    log_info "Integrating ${branch} to dev..."

    # Save current directory
    local original_dir=$(pwd)

    # If worktree path provided, work from there
    if [ -n "$worktree_path" ] && [ -d "$worktree_path" ]; then
        cd "$worktree_path"
    fi

    # Ensure branch is pushed
    git push origin "$branch" 2>/dev/null || true

    # Checkout dev and merge
    git checkout dev 2>/dev/null || git checkout -b dev origin/dev
    git pull origin dev
    git merge "$branch" --no-ff -m "Merge ${branch} into dev (vibe-kanban auto-integration)"
    git push origin dev

    # Return to original branch
    git checkout "$branch" 2>/dev/null || true

    # Return to original directory
    cd "$original_dir"

    log_success "Integrated ${branch} to dev"
}

# ════════════════════════════════════════════════════════════════
# Main Commands
# ════════════════════════════════════════════════════════════════

# Show current task status and branch mapping
cmd_status() {
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  Vibe-Kanban Task / Branch Mapping${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo ""

    local tasks=$(get_tasks)

    if [ -z "$tasks" ] || [ "$tasks" == "[]" ]; then
        log_warn "No tasks found"
        return
    fi

    echo "$tasks" | jq -r '.[] | [.id, .status, .title] | @tsv' | while IFS=$'\t' read -r id status title; do
        local branch=$(get_branch_from_task "$id" "$title")
        local worktree=$(get_worktree_path "$id")
        local in_dev=""

        if [ -n "$branch" ]; then
            if is_in_dev "$branch" 2>/dev/null; then
                in_dev="${GREEN}[in dev]${NC}"
            else
                in_dev="${YELLOW}[not in dev]${NC}"
            fi
        fi

        # Status emoji
        local status_icon=""
        case "$status" in
            "inprogress") status_icon="🔄" ;;
            "inreview")   status_icon="👀" ;;
            "done")       status_icon="✅" ;;
            "cancelled")  status_icon="❌" ;;
            *)            status_icon="❓" ;;
        esac

        echo -e "${status_icon} ${YELLOW}${status}${NC} | ${title:0:40}"
        echo -e "   ID: ${id:0:8}..."
        echo -e "   Branch: ${branch:-'(not found)'} ${in_dev}"
        echo -e "   Worktree: ${worktree:-'(not found)'}"
        echo ""
    done
}

# One-time sync: integrate all "inreview" tasks to dev
cmd_sync() {
    log_info "Syncing all 'inreview' tasks to dev..."

    local tasks=$(get_tasks)
    local count=0

    echo "$tasks" | jq -r '.[] | select(.status == "inreview") | [.id, .title] | @tsv' | while IFS=$'\t' read -r id title; do
        local branch=$(get_branch_from_task "$id" "$title")
        local worktree=$(get_worktree_path "$id")

        if [ -z "$branch" ]; then
            log_warn "No branch found for task: ${title}"
            continue
        fi

        if is_in_dev "$branch" 2>/dev/null; then
            log_info "${branch} already in dev, skipping"
            continue
        fi

        log_info "Found 'inreview' task: ${title}"
        log_info "  Branch: ${branch}"

        integrate_branch_to_dev "$branch" "$worktree"
        ((count++)) || true
    done

    log_success "Synced ${count} tasks to dev"
}

# Watch mode: poll for status changes and auto-integrate
cmd_watch() {
    log_info "Starting watch mode (polling every ${POLL_INTERVAL}s)..."
    log_info "Press Ctrl+C to stop"
    echo ""

    # Initialize state file
    if [ ! -f "$STATE_FILE" ]; then
        echo "{}" > "$STATE_FILE"
    fi

    while true; do
        local tasks=$(get_tasks)
        local current_time=$(date '+%H:%M:%S')

        echo "$tasks" | jq -r '.[] | [.id, .status, .title] | @tsv' | while IFS=$'\t' read -r id status title; do
            # Get previous status from state file
            local prev_status=$(jq -r ".\"${id}\" // \"unknown\"" "$STATE_FILE")

            # Check for transition to "inreview"
            if [ "$status" == "inreview" ] && [ "$prev_status" != "inreview" ]; then
                log_info "[${current_time}] Status change detected: ${title}"
                log_info "  ${prev_status} → ${status}"

                local branch=$(get_branch_from_task "$id" "$title")
                local worktree=$(get_worktree_path "$id")

                if [ -n "$branch" ]; then
                    if ! is_in_dev "$branch" 2>/dev/null; then
                        log_info "  Auto-integrating ${branch} to dev..."
                        integrate_branch_to_dev "$branch" "$worktree" || log_error "  Integration failed!"
                    else
                        log_info "  Already in dev, skipping"
                    fi
                else
                    log_warn "  No branch found for task"
                fi
            fi

            # Update state file
            jq ".\"${id}\" = \"${status}\"" "$STATE_FILE" > "${STATE_FILE}.tmp" && mv "${STATE_FILE}.tmp" "$STATE_FILE"
        done

        sleep "$POLL_INTERVAL"
    done
}

# Create draft PR for task moving to inreview
cmd_pr() {
    local task_id="$1"

    if [ -z "$task_id" ]; then
        log_error "Usage: $0 pr <task_id>"
        return 1
    fi

    local task=$(get_task "$task_id")

    if [ -z "$task" ] || [ "$task" == "null" ]; then
        log_error "Task not found: ${task_id}"
        return 1
    fi

    local title=$(echo "$task" | jq -r '.title')
    local description=$(echo "$task" | jq -r '.description')
    local branch=$(get_branch_from_task "$task_id" "$title")
    local worktree=$(get_worktree_path "$task_id")

    if [ -z "$branch" ]; then
        log_error "No branch found for task"
        return 1
    fi

    log_info "Creating PR for: ${title}"
    log_info "Branch: ${branch}"

    # Navigate to worktree if available
    if [ -n "$worktree" ] && [ -d "$worktree" ]; then
        cd "$worktree"
    fi

    # Push branch
    git push origin "$branch"

    # Create PR
    gh pr create --base main --head "$branch" \
        --title "${title}" \
        --body "$(cat <<EOF
## Task
${description}

## Vibe-Kanban
- Task ID: ${task_id}
- Status: inreview

## Testing
- [ ] Integrated to dev
- [ ] Tested with other features

---
🤖 Created via vibe-kanban-integration
EOF
)"

    log_success "PR created for ${branch}"
}

# ════════════════════════════════════════════════════════════════
# Main
# ════════════════════════════════════════════════════════════════

show_help() {
    cat << 'EOF'
Vibe-Kanban Git Integration

Usage:
  vibe-kanban-integration.sh <command> [args]

Commands:
  status      Show task/branch mapping and integration status
  sync        One-time sync: integrate all 'inreview' tasks to dev
  watch       Watch mode: auto-integrate when tasks move to 'inreview'
  pr <id>     Create PR for a specific task

Environment Variables:
  VIBE_KANBAN_PORT      API port (default: 53362)
  VIBE_KANBAN_PROJECT_ID  Project ID
  POLL_INTERVAL         Watch mode poll interval in seconds (default: 30)

Examples:
  # Check current status
  ./vibe-kanban-integration.sh status

  # Integrate all 'inreview' tasks now
  ./vibe-kanban-integration.sh sync

  # Run in background, auto-integrate on status change
  ./vibe-kanban-integration.sh watch &

  # Create PR for specific task
  ./vibe-kanban-integration.sh pr a56f8ccc-66ff-4663-b0cf-7c89b03fc7c1

EOF
}

case "${1:-}" in
    status)
        cmd_status
        ;;
    sync)
        cmd_sync
        ;;
    watch)
        cmd_watch
        ;;
    pr)
        cmd_pr "$2"
        ;;
    -h|--help|help|"")
        show_help
        ;;
    *)
        log_error "Unknown command: $1"
        show_help
        exit 1
        ;;
esac
