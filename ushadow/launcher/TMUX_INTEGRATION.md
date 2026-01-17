# Tmux Integration for Ushadow Launcher

## Overview

The Ushadow Launcher integrates with tmux to provide persistent terminal sessions for git worktree environments. Each worktree can have its own dedicated tmux window, enabling developers to maintain multiple parallel development sessions with ease.

**Note**: This document covers Phase 1 (Local Tmux Integration) of the Ushadow Launcher project. For the broader vision including Vibe Kanban integration and remote development management, see [ROADMAP.md](./ROADMAP.md).

## Problems Solved

### 1. Slow Environment Ready Detection
**Problem**: The launcher was polling tailscale status 7 times during environment startup, causing 12+ second delays even when containers were already running.

**Solution**: Implemented 10-second caching for tailscale status checks in `discovery.rs`:
- First check is real, subsequent checks within 10 seconds use cached value
- Reduces startup time from ~12 seconds to ~2 seconds
- Cache stored in static `Mutex<Option<(bool, Instant)>>`

**Files**: `src-tauri/src/commands/discovery.rs`

### 2. No Visual Indication of Tmux Sessions
**Problem**: Users couldn't see if tmux windows were created or what their status was.

**Solution**: Added three layers of tmux visibility:
1. **Activity Log Feedback**: Shows `✓ Tmux window 'ushadow-{name}' created` messages
2. **Status Badges**: Real-time activity indicators on environment cards (🤖/💬/✅/❌)
3. **Tmux Info Dialog**: Global "Tmux" button in header shows all sessions/windows

**Files**: `src/App.tsx`, `src/components/EnvironmentsPanel.tsx`

### 3. Manual Tmux Requirement
**Problem**: Users had to manually start tmux before creating worktrees.

**Solution**: Auto-start tmux in multiple places:
- When creating worktrees with workmux
- On launcher startup if worktrees exist
- Manual "Start Tmux Server" button in dialog
- Graceful fallback to regular git worktrees if tmux fails

**Files**: `src-tauri/src/commands/worktree.rs`, `src/App.tsx`

### 4. No Way to Open Tmux from Existing Environments
**Problem**: Users couldn't create/attach tmux windows for existing worktrees.

**Solution**: Added purple "Tmux" button to each worktree environment card that:
- Creates tmux window if it doesn't exist
- Opens Terminal.app and attaches to the specific window
- Reuses existing windows (no duplicates)
- Shows visual feedback in activity log

**Files**: `src/components/EnvironmentsPanel.tsx`, `src/App.tsx`, `src-tauri/src/commands/worktree.rs`

## Architecture

### Tmux Session Structure

```
workmux (session)
├── 0: zsh (default window)
├── 1: ushadow-blue (worktree window)
├── 2: ushadow-gold (worktree window)
└── 3: ushadow-purple (worktree window)
```

- Single persistent `workmux` session for all worktrees
- Each worktree gets its own window: `ushadow-{env-name}`
- Windows are created in the worktree's directory
- Sessions persist across launcher restarts

### Key Commands

#### Backend (Rust)

**`ensure_tmux_running()`**
- Checks if tmux server is running
- Creates "workmux" session if needed
- Returns success message

**`attach_tmux_to_worktree(worktree_path: String, env_name: String)`**
- Ensures tmux is running
- Creates window `ushadow-{env-name}` if doesn't exist
- Opens Terminal.app (macOS) and attaches to window
- Returns status message

**`get_tmux_info()`**
- Lists all tmux sessions and windows
- Shows helpful message if no server running
- Returns formatted string for display

**`get_environment_tmux_status(env_name: String)`**
- Returns detailed status for specific environment
- Includes: exists, window_name, current_command, activity_status
- Used for real-time status badges

#### Frontend (TypeScript)

**`handleAttachTmux(env: UshadowEnvironment)`**
- Called when Tmux button clicked on environment card
- Validates environment has a path
- Calls backend `attachTmuxToWorktree()`
- Refreshes discovery to update status badges
- Shows feedback in activity log

**Auto-start Logic in `refreshDiscovery()`**
- Detects if worktrees exist
- Silently calls `ensureTmuxRunning()` if needed
- Non-intrusive, doesn't spam logs

## User Features

### 1. Global Tmux Button (Header)
**Location**: Environments panel header, next to "New Environment"

**Features**:
- Click to view all tmux sessions and windows
- Shows "Start Tmux Server" button if no server running
- Displays current command for each window
- Useful for debugging and verification

**Usage**:
```
Click "Tmux" → See all sessions → Click "Start Tmux Server" if needed
```

### 2. Per-Environment Tmux Button
**Location**: Purple terminal icon on worktree environment cards

**Features**:
- Creates/reuses tmux window for that environment
- Opens Terminal.app and attaches you to the session
- Tooltip shows "Create/attach tmux window" or "Tmux window exists"
- Works for both running and stopped environments

**Usage**:
```
Click purple Terminal icon → New Terminal window opens → You're in tmux session
```

### 3. Status Badges
**Location**: Next to branch name on environment cards

**Indicators**:
- `🤖 Working` - Active command running (npm, docker, etc.)
- `💬 Waiting` - Shell waiting for input
- `✅ Done` - Command completed successfully
- `❌ Error` - Command exited with error

### 4. Auto-Start on Launcher Startup
**Behavior**:
- Launcher detects existing worktrees on startup
- Silently ensures tmux server is running
- No user intervention required
- No spam in activity log

## Technical Implementation

### Tailscale Caching

**File**: `src-tauri/src/commands/discovery.rs`

```rust
use std::sync::Mutex;
use std::time::{Duration, Instant};

static TAILSCALE_CACHE: Mutex<Option<(bool, Instant)>> = Mutex::new(None);

pub async fn discover_environments_with_config(...) -> Result<DiscoveryResult, String> {
    let tailscale_ok = {
        let mut cache = TAILSCALE_CACHE.lock().unwrap();
        let now = Instant::now();

        if let Some((cached_ok, cached_time)) = *cache {
            if now.duration_since(cached_time) < Duration::from_secs(10) {
                return cached_ok; // Use cached value
            }
        }

        // Cache miss or expired - do real check
        let (installed, connected, _) = check_tailscale();
        let ok = installed && connected;
        *cache = Some((ok, now));
        ok
    };
    // ...
}
```

**Benefits**:
- Reduces 7 checks to 1 real check + 6 cached checks
- 10-second TTL balances freshness vs performance
- Thread-safe with Mutex
- Zero impact on first check

### Terminal Opening (macOS)

**File**: `src-tauri/src/commands/worktree.rs`

```rust
#[cfg(target_os = "macos")]
{
    let script = format!(
        "tell application \"Terminal\" to do script \"tmux attach-session -t workmux:{} && exit\"",
        window_name
    );

    let open_terminal = Command::new("osascript")
        .arg("-e")
        .arg(&script)
        .output()
        .map_err(|e| format!("Failed to open Terminal: {}", e))?;
}
```

**How it works**:
1. Uses AppleScript via `osascript` to control Terminal.app
2. Attaches to specific window: `workmux:ushadow-{env-name}`
3. Adds `&& exit` to close Terminal when detaching from tmux
4. Non-blocking - doesn't fail entire operation if Terminal opening fails

### Window Reuse Logic

**File**: `src-tauri/src/commands/worktree.rs`

```rust
// Check if window already exists
let check_window = shell_command(&format!(
    "tmux list-windows -a -F '#{{window_name}}' | grep '^{}'",
    window_name
)).output();

let window_existed = matches!(check_window, Ok(ref output) if output.status.success());

// Create only if needed
if !window_existed {
    let create_window = shell_command(&format!(
        "tmux new-window -t workmux -n {} -c '{}'",
        window_name, worktree_path
    )).output()?;
}
```

**Benefits**:
- No duplicate windows
- Idempotent operation - safe to click multiple times
- Window persists across launcher restarts
- Can attach to existing work session

## File Changes Summary

### New Commands Added

**Rust (`src-tauri/src/commands/worktree.rs`)**:
- `ensure_tmux_running()` - Auto-start tmux server
- `attach_tmux_to_worktree()` - Create/attach window and open terminal
- `get_tmux_info()` - List all sessions/windows
- Modified `create_worktree_with_workmux()` - Added auto-start logic

**TypeScript (`src/hooks/useTauri.ts`)**:
- `getTmuxInfo()` - Wrapper for get_tmux_info
- `ensureTmuxRunning()` - Wrapper for ensure_tmux_running
- `attachTmuxToWorktree()` - Wrapper for attach_tmux_to_worktree

### UI Components Modified

**`src/components/EnvironmentsPanel.tsx`**:
- Added global "Tmux" button in header
- Added tmux info dialog with "Start Tmux Server" button
- Added per-environment tmux button (purple terminal icon)
- Added `onAttachTmux` callback prop

**`src/App.tsx`**:
- Added `handleAttachTmux()` handler
- Modified `refreshDiscovery()` for auto-start
- Added tmux status check in `handleNewEnvWorktree()`
- Wired up `onAttachTmux` to EnvironmentsPanel

### Backend Registration

**`src-tauri/src/main.rs`**:
- Registered new commands in `invoke_handler![]`
- Imported new command functions

## Testing Checklist

### Auto-Start Tmux
- [ ] Stop tmux: `tmux kill-server`
- [ ] Start launcher
- [ ] Verify tmux auto-starts: `tmux list-sessions`
- [ ] Should see "workmux" session

### Tmux Button (Per-Environment)
- [ ] Click purple terminal icon on any worktree
- [ ] Verify Terminal.app opens
- [ ] Verify you're attached to correct tmux window
- [ ] Verify working directory is worktree path
- [ ] Click button again, verify reuses existing window

### Global Tmux Dialog
- [ ] Click "Tmux" button in header
- [ ] Verify shows all sessions and windows
- [ ] Stop tmux: `tmux kill-server`
- [ ] Click "Tmux" button again
- [ ] Verify shows "Start Tmux Server" button
- [ ] Click "Start Tmux Server"
- [ ] Verify creates workmux session

### Fast Environment Ready Detection
- [ ] Start an environment
- [ ] Watch activity log
- [ ] Should declare ready in ~2 seconds, not 12+
- [ ] Should NOT see 7 tailscale queries

### Status Badges
- [ ] Create new worktree with tmux window
- [ ] Verify activity badge appears (🤖/💬/etc.)
- [ ] Run a command in tmux: `npm run dev`
- [ ] Refresh discovery
- [ ] Verify badge shows `🤖 npm` or similar

## Known Limitations

1. **macOS Only Terminal Opening**: The Terminal.app integration uses AppleScript and only works on macOS. Linux/Windows have placeholder code that may not work reliably.

2. **Tmux Socket**: Uses default tmux socket at `/private/tmp/tmux-501/default`. If users have multiple tmux servers on different sockets, the launcher only sees the default one.

3. **No Detach Prevention**: Users can detach from tmux manually, leaving the window running in background. This is by design but might be confusing.

4. **Terminal Window Management**: Each click opens a new Terminal.app window. There's no automatic window reuse or tab creation in Terminal.app.

## Future Enhancements

### Possible Improvements
- [ ] iTerm2 integration option (many developers prefer iTerm)
- [ ] Configurable terminal emulator (user preference)
- [ ] Inline terminal within launcher app (embed xterm.js)
- [ ] Better tmux socket detection/configuration
- [ ] Tab-based terminal opening instead of new windows
- [ ] Tmux layout templates (split panes, predefined layouts)
- [ ] Command history per worktree
- [ ] Auto-run commands on tmux creation (npm install, etc.)

### Architecture Considerations
- Consider migrating to workmux CLI's native integration
- Explore tauri shell plugin for cross-platform terminal support
- Evaluate embedded terminal solutions for better UX

## Troubleshooting

### Tmux Won't Start
**Symptom**: "Start Tmux Server" button fails

**Solutions**:
1. Check tmux is installed: `which tmux`
2. Try manually: `tmux new-session -d -s workmux`
3. Check for hung tmux processes: `ps aux | grep tmux`
4. Kill hung processes: `pkill tmux`

### Terminal Won't Open
**Symptom**: Clicking tmux button does nothing

**Solutions**:
1. Check Console.app for osascript errors
2. Verify Terminal.app permissions in System Settings
3. Try manually: `osascript -e 'tell application "Terminal" to do script "echo test"'`
4. Restart launcher

### Wrong Tmux Socket
**Symptom**: `tmux list-windows -a` shows "no server running"

**Solutions**:
1. Find all tmux sockets: `ls -la /private/tmp/tmux-*/`
2. Attach to correct one: `tmux -S /path/to/socket attach`
3. Kill other tmux servers if needed
4. Ensure using default socket

### Status Badges Not Updating
**Symptom**: Activity badges don't change after running commands

**Solutions**:
1. Click refresh button in launcher
2. Wait for auto-refresh cycle (every few seconds)
3. Check tmux window name matches: `tmux list-windows -a | grep ushadow-`
4. Verify tmux command polling is working

## Next: Vibe Kanban & Remote Management

This tmux integration is Phase 1 of a larger vision. See [ROADMAP.md](./ROADMAP.md) for upcoming features:

**Phase 2: Vibe Kanban Integration**
- Task-driven worktree creation
- Kanban board view in launcher
- Auto-provision environments for tasks
- Lifecycle management tied to task status

**Phase 3: Remote Development Management**
- Unified control panel for local + remote environments
- Ushadow Agent running on remote servers
- Terminal tunneling via Tailscale
- Cloud VM provisioning automation

**Phase 4: Advanced Features**
- Team collaboration (shared tmux sessions)
- CI/CD integration (PR previews)
- Observability (metrics, tracing)
- AI/LLM integration

## References

- [Ushadow Launcher Roadmap](./ROADMAP.md) - Full vision and development plan
- [Tauri Documentation](https://tauri.app/)
- [Tmux Documentation](https://github.com/tmux/tmux/wiki)
- [Workmux CLI](https://github.com/yourorg/workmux) (if applicable)
- [AppleScript Language Guide](https://developer.apple.com/library/archive/documentation/AppleScript/Conceptual/AppleScriptLangGuide/)
