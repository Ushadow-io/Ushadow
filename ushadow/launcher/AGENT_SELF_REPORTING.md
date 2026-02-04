# Agent Self-Reporting - Kanban Status Updates

This document explains how AI agents (like Claude Code) should automatically update Kanban ticket status as they work.

## The Workflow

### 1. Agent Starts Working (Human Provides Input)
```bash
kanban-cli move-to-progress "$BRANCH_NAME"
```
**Status:** `in_progress` 🤖

**When:** Agent receives a user response and resumes work

**Example:**
```bash
# User responds to agent's question
# Agent runs:
kanban-cli move-to-progress "generalLamcher"
# → All tickets for this branch move to "in_progress"
```

### 2. Agent Waits for Human Input
```bash
kanban-cli move-to-review "$BRANCH_NAME"
```
**Status:** `in_review` 💬

**When:** Agent has a question or needs human input

**Example:**
```bash
# Agent asks: "Should I use TypeScript or JavaScript?"
# Before showing the prompt, agent runs:
kanban-cli move-to-review "generalLamcher"
# → Tickets move to "in_review" (waiting for human)
```

### 3. Work is Merged (Automatic via Hook)
```bash
# This happens automatically when you run:
workmux merge <branch-name>
```
**Status:** `done` ✅

**When:** Human runs `workmux merge` to merge the branch

**Hook runs:** `kanban-cli move-to-done "$WM_BRANCH_NAME"`

## Complete Example Flow

```bash
# 1. User asks agent to implement a feature
# Agent starts working
kanban-cli move-to-progress "feature-auth"
# Status: in_progress 🤖

# 2. Agent encounters a decision point
# Agent asks: "Which database? PostgreSQL or MongoDB?"
kanban-cli move-to-review "feature-auth"
# Status: in_review 💬

# 3. User responds: "PostgreSQL"
# Agent resumes work
kanban-cli move-to-progress "feature-auth"
# Status: in_progress 🤖

# 4. Agent finishes, asks: "Ready to merge?"
kanban-cli move-to-review "feature-auth"
# Status: in_review 💬

# 5. User confirms and merges
workmux merge feature-auth
# Hook automatically runs: kanban-cli move-to-done "feature-auth"
# Status: done ✅
```

## Implementation in Claude Code

### Option 1: Manual Agent Commands

The agent explicitly calls these commands at appropriate times:

```bash
# In agent's workflow:
echo "[AGENT] Starting work on ticket..."
kanban-cli move-to-progress "$(git branch --show-current)"

# ... do work ...

# When needing input:
echo "[AGENT] Waiting for human response..."
kanban-cli move-to-review "$(git branch --show-current)"
```

### Option 2: Helper Scripts

Source the helper script in your shell:

```bash
# In ~/.zshrc or ~/.bashrc
source /path/to/launcher/kanban-status-helpers.sh

# Then the agent can use:
kb-start      # Start working (move to in_progress)
kb-waiting    # Wait for human (move to in_review)
kb-status     # Check current status
```

### Option 3: Agent Integration (Future)

Ideally, the agent framework itself should call these:

```python
# Pseudo-code for agent framework
class ClaudeAgent:
    def on_user_input(self, message):
        self.update_kanban_status("in_progress")
        # ... process input ...

    def ask_user(self, question):
        self.update_kanban_status("in_review")
        # ... wait for response ...
```

## Environment Variables

The agent should know which ticket it's working on. Set these:

```bash
# When creating a worktree for a ticket
export TICKET_ID="ticket-abc-123"
export BRANCH_NAME="feature-auth"

# Then the agent can use:
kanban-cli move-to-progress "$BRANCH_NAME"
```

## Detection Strategies

### How Agent Knows When to Call

**Starting Work (move to in_progress):**
- After receiving user's response to a question
- When user provides a new task/instruction
- When resuming from paused state

**Waiting for Human (move to in_review):**
- Before calling `input()` or equivalent
- When presenting options/choices
- When asking for clarification
- When work is complete and awaiting approval

**Example Patterns to Detect:**

```python
# Python agent example
def ask_user(question):
    # BEFORE asking:
    run_command("kanban-cli move-to-review $(git branch --show-current)")

    # Now ask:
    response = input(question)

    # AFTER receiving response:
    run_command("kanban-cli move-to-progress $(git branch --show-current)")

    return response
```

## Workmux Hook Configuration

The merge hook is already configured in `~/.config/workmux/config.yaml`:

```yaml
pre_merge:
  - kanban-cli move-to-done "$WM_BRANCH_NAME"
```

This runs automatically when you execute `workmux merge`.

## Testing

Test the full workflow:

```bash
# 1. Start working
kanban-cli move-to-progress "generalLamcher"
kanban-cli find-by-branch "generalLamcher"
# Should show: in_progress

# 2. Wait for human
kanban-cli move-to-review "generalLamcher"
kanban-cli find-by-branch "generalLamcher"
# Should show: in_review

# 3. Resume work
kanban-cli move-to-progress "generalLamcher"
kanban-cli find-by-branch "generalLamcher"
# Should show: in_progress

# 4. Merge (when ready)
workmux merge generalLamcher
# Should show: done
```

## Debugging

### Check Current Status
```bash
kanban-cli find-by-branch "$(git branch --show-current)"
```

### View Database
```bash
sqlite3 ~/Library/Application\ Support/com.ushadow.launcher/kanban.db \
  "SELECT id, title, status, branch_name FROM tickets"
```

### Test Hook
```bash
# See what workmux will run
cat ~/.config/workmux/config.yaml

# Test the command manually
export WM_BRANCH_NAME="test-branch"
kanban-cli move-to-done "$WM_BRANCH_NAME"
```

## Best Practices

1. **Always use branch name as identifier** - Most reliable
2. **Call move-to-progress when resuming** - Keep status accurate
3. **Call move-to-review before every prompt** - Signal waiting state
4. **Let workmux handle "done"** - Don't manually mark as done
5. **Check status with find-by-branch** - Verify updates worked

## Future Enhancements

- [ ] Auto-detect agent activity (no manual calls needed)
- [ ] Integration with agent frameworks (LangChain, etc.)
- [ ] Tmux pane monitoring for automatic detection
- [ ] Web API for external integrations
- [ ] Slack/Discord notifications on status changes

## Troubleshooting

**Commands not found:**
```bash
# Make sure kanban-cli is in PATH
which kanban-cli
# Should output: /Users/username/.local/bin/kanban-cli
```

**No tickets found:**
```bash
# Check if tickets are linked to this branch
kanban-cli find-by-branch "$(git branch --show-current)"

# Verify database exists
ls ~/Library/Application\ Support/com.ushadow.launcher/kanban.db
```

**Status not updating:**
```bash
# Run with full path
~/.local/bin/kanban-cli move-to-progress "branch-name"

# Check stderr for errors
kanban-cli move-to-progress "branch-name" 2>&1
```

## See Also

- [KANBAN_HOOKS.md](./KANBAN_HOOKS.md) - Technical reference
- [KANBAN_HOOKS_EXAMPLE.md](./KANBAN_HOOKS_EXAMPLE.md) - Complete walkthrough
- [README.md](./README.md) - Launcher overview
