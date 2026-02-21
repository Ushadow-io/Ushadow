# Automatic Kanban Status Updates - Complete Guide

This document explains how ticket status automatically updates based on agent activity, combining multiple layers of automation.

## Architecture Overview

The system uses **three layers** of automatic status updates:

1. **Launcher Integration** - Updates status when starting agents
2. **Claude Code Hooks** - Updates status based on session events
3. **Workmux Hooks** - Updates status when merging branches

This approach is inspired by vibe-kanban's backend service integration but adapted to work with the ushadow launcher's architecture.

## How It Works

### Status Flow

```
User creates ticket
    ↓
Launcher starts agent for ticket → status: in_progress
    ↓
Agent working actively → status: in_progress
    ↓
Agent finishes, session ends → status: in_review
    ↓
User responds to agent → status: in_progress
    ↓
(repeat as needed)
    ↓
User merges branch → status: done
```

## Layer 1: Launcher Integration

**File**: `src-tauri/src/commands/kanban.rs`

When you start an agent for a ticket using the launcher, the `start_coding_agent_for_ticket` function automatically moves the ticket to `in_progress`.

**Code** (lines 784-806):
```rust
// Automatically move ticket to in_progress when starting agent
eprintln!("[start_coding_agent_for_ticket] Moving ticket to in_progress...");
if let Some(branch_name) = &ticket.branch_name {
    let status_update = shell_command(&format!("kanban-cli move-to-progress \"{}\"", branch_name))
        .output();
    // ... error handling ...
}
```

**When it triggers**: Immediately when starting an agent for a ticket

**What it does**: Moves ticket from `backlog` or `todo` to `in_progress`

## Layer 2: Claude Code Hooks

**Files**: `.claude/hooks/*.sh`, `.claude/settings.local.json`

Claude Code hooks automatically update status based on session lifecycle events.

### Hook Scripts

1. **session-start.sh** - Runs when Claude Code starts
   - Moves ticket to `in_progress`
   - Indicates agent is ready to work

2. **user-prompt-submit.sh** - Runs when user submits a prompt
   - Moves ticket to `in_progress`
   - Indicates agent resuming work after user responds

3. **idle-notification.sh** - Runs when Claude Code becomes idle (waiting for input)
   - Moves ticket to `in_review`
   - Indicates agent finished responding and is waiting for user
   - **This is the key hook** - fires after each agent response!

4. **session-end.sh** - Runs when Claude Code exits
   - Moves ticket to `in_review`
   - Indicates session ended, waiting for human review

### Configuration

Hooks are configured in `.claude/settings.local.json`:

```json
{
  "hooks": {
    "SessionStart": [{
      "hooks": [{
        "type": "command",
        "command": ".claude/hooks/session-start.sh",
        "async": true
      }]
    }],
    "UserPromptSubmit": [{
      "hooks": [{
        "type": "command",
        "command": ".claude/hooks/user-prompt-submit.sh",
        "async": true
      }]
    }],
    "Notification": [{
      "matcher": "idle_prompt",
      "hooks": [{
        "type": "command",
        "command": ".claude/hooks/idle-notification.sh",
        "async": true
      }]
    }],
    "SessionEnd": [{
      "hooks": [{
        "type": "command",
        "command": ".claude/hooks/session-end.sh",
        "async": true
      }]
    }]
  }
}
```

**Key features**:
- Hooks run asynchronously (don't block agent)
- Automatically detect current branch
- Silently skip if not in a git repo
- Require kanban-cli to be in PATH
- **`idle_prompt` notification** detects when agent finishes each response (not just session end!)
  - This gives per-turn status updates within a long-running session
  - Similar to vibe-kanban's approach for ACP-based agents

## Layer 3: Workmux Integration

**File**: `~/.config/workmux/config.yaml`

When you merge a branch using `workmux merge`, it automatically moves tickets to `done`.

**Configuration**:
```yaml
pre_merge:
  - kanban-cli move-to-done "$WM_BRANCH_NAME"
```

**When it triggers**: Before `workmux merge` completes

**What it does**: Moves all tickets for the branch to `done`

## Installation & Setup

### Prerequisites

1. **kanban-cli must be installed**:
   ```bash
   cd ushadow/launcher/src-tauri
   cargo build --release --bin kanban-cli
   cp target/release/kanban-cli ~/.local/bin/
   ```

2. **Verify kanban-cli is in PATH**:
   ```bash
   which kanban-cli
   # Should output: /Users/username/.local/bin/kanban-cli
   ```

3. **Workmux hook configured** (should already be set):
   ```bash
   cat ~/.config/workmux/config.yaml
   # Should contain: kanban-cli move-to-done "$WM_BRANCH_NAME"
   ```

### Automatic Hook Setup

The Claude Code hooks are already configured in this repository:

✅ `.claude/hooks/session-start.sh` - Executable
✅ `.claude/hooks/user-prompt-submit.sh` - Executable
✅ `.claude/hooks/idle-notification.sh` - Executable (NEW!)
✅ `.claude/hooks/session-end.sh` - Executable
✅ `.claude/settings.local.json` - Hooks configured with idle_prompt matcher

**No additional setup needed** - hooks will run automatically when you use Claude Code in this project.

### Manual Setup (for other projects)

To add automatic status updates to another project:

1. Create `.claude/hooks/` directory
2. Copy hook scripts from this project
3. Make scripts executable: `chmod +x .claude/hooks/*.sh`
4. Add hooks configuration to `.claude/settings.local.json`

## Testing

### Test Layer 1: Launcher Integration

```bash
# Create a test ticket in the launcher UI
# Start agent for the ticket
# Check status:
kanban-cli find-by-branch "ticket-branch-name"
# Should show: in_progress
```

### Test Layer 2: Claude Code Hooks

```bash
# Start Claude Code in a ticket branch
claude

# Check status during session:
kanban-cli find-by-branch "$(git branch --show-current)"
# Should show: in_progress

# Exit Claude Code (Ctrl+C or Ctrl+D)
# Check status after exit:
kanban-cli find-by-branch "$(git branch --show-current)"
# Should show: in_review

# Start Claude Code again
# Respond to a prompt
# Should move back to: in_progress
```

### Test Layer 3: Workmux Integration

```bash
# After completing work on a ticket
workmux merge ticket-branch-name

# Check status:
kanban-cli find-by-branch "ticket-branch-name"
# Should show: done
```

### Debug Hooks

To see if hooks are running:

```bash
# Check Claude Code debug logs
tail -f ~/.claude/debug/*.log | grep -i kanban

# Check workmux hook execution
# Should see output when running: workmux merge <branch>
```

## Comparison with Vibe-Kanban

### Vibe-Kanban Approach

**Architecture**: Backend service with execution process management

**Key insights from code analysis**:
- `crates/services/src/services/container.rs`
  - `start_execution` (line 974-992): Updates to `InProgress`
  - `spawn_exit_monitor` (line 342-540): Waits for process exit or exit signal
  - `finalize_task` (line 166-213): Updates to `InReview`

**How it detects completion**:
- **For ACP-based agents** (Gemini, Qwen):
  - Uses Agent Client Protocol with awaitable `prompt()` method
  - Sends exit signal when turn completes (container.rs:486-487)
  - Status updates after each response

- **For Claude Code**:
  - Spawns **new process for each prompt**! (container.rs:363 - exit_signal is None)
  - Process exits when response complete
  - No long-running session

### Ushadow Launcher Approach

**Architecture**: Hook-based with CLI integration + idle detection

**Key components**:
- Rust CLI tool (`kanban-cli`)
- Claude Code hooks (shell scripts)
- **`idle_prompt` notification** - detects when agent waits for input
- Launcher integration (Rust code)
- Workmux hooks (YAML config)

**How it detects completion**:
- **Long-running Claude Code session**
- `Notification(idle_prompt)` hook fires when agent finishes responding
- Status updates after each response (just like vibe-kanban's ACP agents!)
- Single process for entire conversation

**Advantages over vibe-kanban's Claude Code approach**:
- ✅ **Keeps conversation context** - single long-running session
- ✅ **Per-response status updates** - via idle_prompt notification
- ✅ Works with any CLI tool (not just Claude Code)
- ✅ No backend service required
- ✅ Easy to debug (just check CLI calls)
- ✅ No process spawn overhead per prompt

**Key difference**:
- Vibe-kanban: Short-lived processes (one per prompt)
- Ushadow launcher: Long-lived session + idle detection hooks

## Troubleshooting

### Hooks Not Running

**Check if kanban-cli is in PATH**:
```bash
which kanban-cli
# If not found, install it (see Installation section)
```

**Check hook permissions**:
```bash
ls -la .claude/hooks/
# All .sh files should be executable (rwxr-xr-x)
chmod +x .claude/hooks/*.sh
```

**Check Claude Code hook configuration**:
```bash
cat .claude/settings.local.json
# Should contain hooks configuration
```

**Enable Claude Code debug logging**:
```bash
CLAUDE_DEBUG=1 claude
tail -f ~/.claude/debug/*.log
```

### Status Not Updating

**Verify ticket is linked to branch**:
```bash
kanban-cli find-by-branch "$(git branch --show-current)"
# Should return ticket(s)
```

**Manually test CLI command**:
```bash
kanban-cli move-to-progress "$(git branch --show-current)"
# Should succeed and update status
```

**Check database**:
```bash
sqlite3 ~/Library/Application\ Support/com.ushadow.launcher/kanban.db \
  "SELECT id, title, status, branch_name FROM tickets WHERE branch_name = 'your-branch'"
```

### Wrong Status After Merge

**Check workmux hook**:
```bash
cat ~/.config/workmux/config.yaml
# Should contain: kanban-cli move-to-done "$WM_BRANCH_NAME"
```

**Test hook manually**:
```bash
export WM_BRANCH_NAME="test-branch"
kanban-cli move-to-done "$WM_BRANCH_NAME"
```

## Future Enhancements

### Potential Improvements

1. **Mid-session detection**: Detect when agent is waiting for user input during a session
   - Could use tmux pane monitoring
   - Could integrate with Claude Code's message flow
   - Would enable more granular status updates

2. **Activity monitoring**: Detect if agent is actively working vs idle
   - Monitor tmux pane activity
   - Track time since last command
   - Auto-move to in_review after inactivity

3. **Web API**: Expose status updates via HTTP API
   - Allow external tools to update status
   - Enable integrations with other systems
   - Support webhooks for status changes

4. **Notifications**: Alert on status changes
   - Slack/Discord notifications
   - Desktop notifications
   - Email alerts

5. **Analytics**: Track ticket lifecycle metrics
   - Time in each status
   - Agent productivity metrics
   - Bottleneck identification

## See Also

- [AGENT_SELF_REPORTING.md](./AGENT_SELF_REPORTING.md) - Agent-side status reporting
- [KANBAN_HOOKS.md](./KANBAN_HOOKS.md) - Technical hook reference
- [KANBAN_HOOKS_EXAMPLE.md](./KANBAN_HOOKS_EXAMPLE.md) - Complete walkthrough
- [README.md](./README.md) - Launcher overview

## Implementation Notes

### Why Three Layers?

Each layer covers a different lifecycle event:

1. **Launcher**: Knows when agent starts (one-time event)
2. **Claude Code Hooks**: Knows session boundaries (start/end/resume)
3. **Workmux**: Knows when work is merged (completion event)

No single layer can cover all cases, so we use all three together.

### Why Async Hooks?

Hooks run with `"async": true` to avoid blocking:
- Agent can start immediately while status updates in background
- Prevents delays if database is slow
- Failures don't break agent workflow

### Why CLI Tool?

Using `kanban-cli` instead of direct database access:
- Consistent error handling
- Easier to debug (run manually)
- Portable (works from shell, scripts, hooks)
- Single source of truth for status logic
- Can be called from any environment
