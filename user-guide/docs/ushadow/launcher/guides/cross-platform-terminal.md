---
title: Cross-Platform Terminal
sidebar_position: 5
---


## Current State (v0.5.1)

### What Works
- **macOS**: `osascript` to open Terminal.app and attach to tmux ✅
- **Linux**: Placeholder using `x-terminal-emulator` (Debian-only, untested) ⚠️
- **Windows**: Same placeholder, will NOT work ❌

### The Problem

```rust
#[cfg(not(target_os = "macos"))]
{
    // This won't work on most systems!
    let _open_terminal = Command::new("x-terminal-emulator")
        .arg("-e")
        .arg(format!("tmux attach-session -t workmux:{}", window_name))
        .spawn();
}
```

**Issues**:
- `x-terminal-emulator` only exists on Debian/Ubuntu (alternatives system)
- Doesn't exist on Fedora, Arch, RHEL, etc.
- Doesn't exist on Windows at all
- No error handling
- Ignores user's preferred terminal

## Cross-Platform Solutions

### Option 1: Tauri Shell Plugin (Recommended)

Use Tauri's shell plugin to open user's default terminal.

**Pros**:
- Built into Tauri
- Respects user's default terminal
- Cross-platform out of the box
- Already in use for other commands

**Cons**:
- Can't directly attach to tmux (just opens terminal)
- User has to manually run `tmux attach` command

**Implementation**:
```rust
use tauri::api::shell;

// Generate a shell script that attaches to tmux
let script = format!(
    "tmux attach-session -t workmux:{} || tmux new-session -s workmux -n {}",
    window_name, window_name
);

#[cfg(target_os = "macos")]
shell::open("terminal://", None)?;

#[cfg(target_os = "linux")]
shell::open(&format!("x-terminal-emulator -e '{}'", script), None)?;

#[cfg(target_os = "windows")]
shell::open(&format!("wt.exe -w 0 nt bash -c '{}'", script), None)?;
```

### Option 2: Platform-Specific Terminal Detection

Detect which terminal emulator is installed and use its CLI.

**macOS**:
- Terminal.app (default) - via osascript ✅
- iTerm2 - via osascript or iTerm CLI
- Alacritty - via `alacritty -e tmux attach`
- Kitty - via `kitty tmux attach`

**Linux**:
```bash
# Try terminals in order of preference
gnome-terminal -- tmux attach -t workmux:$window
konsole -e tmux attach -t workmux:$window
xfce4-terminal -e "tmux attach -t workmux:$window"
alacritty -e tmux attach -t workmux:$window
xterm -e tmux attach -t workmux:$window
```

**Windows**:
```powershell
# Try Windows Terminal first, fallback to others
wt.exe -w 0 nt bash -c "tmux attach -t workmux:$window"
# or
cmd.exe /c start bash -c "tmux attach -t workmux:$window"
```

**Pros**:
- Works with most popular terminals
- Can directly attach to tmux
- Fallback chain ensures something works

**Cons**:
- Lots of platform-specific code
- Need to test each terminal emulator
- Hard to maintain

**Implementation**:
```rust
#[cfg(target_os = "linux")]
fn open_terminal_linux(window_name: &str) -> Result<(), String> {
    let terminals = [
        ("gnome-terminal", vec!["--", "tmux", "attach", "-t", &format!("workmux:{}", window_name)]),
        ("konsole", vec!["-e", "tmux", "attach", "-t", &format!("workmux:{}", window_name)]),
        ("xfce4-terminal", vec!["-e", &format!("tmux attach -t workmux:{}", window_name)]),
        ("alacritty", vec!["-e", "tmux", "attach", "-t", &format!("workmux:{}", window_name)]),
        ("xterm", vec!["-e", "tmux", "attach", "-t", &format!("workmux:{}", window_name)]),
    ];

    for (terminal, args) in terminals {
        if which::which(terminal).is_ok() {
            let result = Command::new(terminal)
                .args(&args)
                .spawn();

            if result.is_ok() {
                return Ok(());
            }
        }
    }

    Err("No supported terminal emulator found".to_string())
}

#[cfg(target_os = "windows")]
fn open_terminal_windows(window_name: &str) -> Result<(), String> {
    // Try Windows Terminal (modern)
    if which::which("wt.exe").is_ok() {
        let result = Command::new("wt.exe")
            .args(&["-w", "0", "nt", "bash", "-c", &format!("tmux attach -t workmux:{}", window_name)])
            .spawn();

        if result.is_ok() {
            return Ok(());
        }
    }

    // Fallback to cmd.exe + WSL bash
    Command::new("cmd.exe")
        .args(&["/c", "start", "bash", "-c", &format!("tmux attach -t workmux:{}", window_name)])
        .spawn()
        .map_err(|e| format!("Failed to open terminal: {}", e))?;

    Ok(())
}
```

### Option 3: Embedded Terminal (Future)

Embed a terminal emulator directly in the launcher using `xterm.js` or similar.

**Pros**:
- Fully cross-platform
- Consistent UX across all OSes
- Can integrate tightly with launcher UI
- No external dependencies

**Cons**:
- Complex implementation
- Need to handle terminal rendering, input, etc.
- Larger app bundle size
- Performance concerns

**Technologies**:
- [xterm.js](https://xtermjs.org/) - Terminal emulator for web
- [Tauri plugin](https://github.com/tauri-apps/tauri-plugin-websocket) - WebSocket for terminal I/O
- [pty-rs](https://github.com/hibariya/pty-rs) - Pseudo-terminal in Rust

**Architecture**:
```
┌─────────────────────────────┐
│   Launcher UI (React)       │
│  ┌─────────────────────┐    │
│  │  Terminal Component │    │
│  │    (xterm.js)       │    │
│  └──────────┬──────────┘    │
│             │ WebSocket     │
└─────────────┼───────────────┘
              │
┌─────────────┼───────────────┐
│   Rust Backend              │
│  ┌──────────▼──────────┐    │
│  │  PTY Manager        │    │
│  │  (spawns bash/tmux) │    │
│  └─────────────────────┘    │
└─────────────────────────────┘
```

### Option 4: User-Configurable Terminal Command

Let users configure their preferred terminal in settings.

**Pros**:
- Extremely flexible
- Users know what works on their system
- Easy to implement
- No guessing needed

**Cons**:
- Requires user configuration
- Not "zero-config"
- Different syntax for each terminal

**Implementation**:
```rust
// In settings/config
#[derive(Deserialize)]
struct LauncherConfig {
    terminal_command: Option<String>,
}

// Usage
fn open_terminal(window_name: &str, config: &LauncherConfig) -> Result<(), String> {
    let command = match &config.terminal_command {
        Some(cmd) => cmd.replace("{window}", &format!("workmux:{}", window_name)),
        None => default_terminal_command(window_name)?,
    };

    shell_command(&command)
        .spawn()
        .map_err(|e| format!("Failed to open terminal: {}", e))?;

    Ok(())
}
```

**Config examples**:
```yaml
# ~/.ushadow/launcher.yml

# macOS - Terminal.app
terminal_command: "osascript -e 'tell application \"Terminal\" to do script \"tmux attach -t {window}\"'"

# macOS - iTerm2
terminal_command: "open -a iTerm tmux attach -t {window}"

# Linux - GNOME Terminal
terminal_command: "gnome-terminal -- tmux attach -t {window}"

# Linux - Alacritty
terminal_command: "alacritty -e tmux attach -t {window}"

# Windows - Windows Terminal
terminal_command: "wt.exe -w 0 nt bash -c 'tmux attach -t {window}'"
```

## Recommendation

**Short-term (v0.6)**: Implement **Option 2** (Platform-Specific Detection)
- Add terminal detection for Linux (gnome-terminal, konsole, etc.)
- Add Windows Terminal support
- Keep current macOS implementation
- Document which terminals are supported

**Medium-term (v0.7)**: Add **Option 4** (User Configuration)
- Let users override auto-detection
- Provide common templates in docs
- Fall back to auto-detection if not configured

**Long-term (v1.0)**: Consider **Option 3** (Embedded Terminal)
- For ultimate cross-platform consistency
- Better integration with launcher UI
- Could show multiple terminals in tabs/panes

## Implementation Plan

### Phase 1: Linux Support (This Week)

```rust
// Add to Cargo.toml
[dependencies]
which = "4.4"  // For detecting available terminals

// In worktree.rs
#[cfg(target_os = "linux")]
fn open_terminal_linux(window_name: &str) -> Result<(), String> {
    // Try terminals in preference order
    let terminals = [
        ("gnome-terminal", vec!["--", "tmux", "attach", "-t", &format!("workmux:{}", window_name)]),
        ("konsole", vec!["-e", "tmux", "attach", "-t", &format!("workmux:{}", window_name)]),
        ("xfce4-terminal", vec!["-e", &format!("tmux attach -t workmux:{}", window_name)]),
        ("alacritty", vec!["-e", "tmux", "attach", "-t", &format!("workmux:{}", window_name)]),
        ("kitty", vec!["tmux", "attach", "-t", &format!("workmux:{}", window_name)]),
        ("xterm", vec!["-e", "tmux", "attach", "-t", &format!("workmux:{}", window_name)]),
    ];

    for (terminal_name, args) in terminals {
        if which::which(terminal_name).is_ok() {
            eprintln!("[open_terminal_linux] Using terminal: {}", terminal_name);

            let result = Command::new(terminal_name)
                .args(&args)
                .spawn();

            match result {
                Ok(_) => return Ok(()),
                Err(e) => eprintln!("[open_terminal_linux] {} failed: {}", terminal_name, e),
            }
        }
    }

    Err("No supported terminal emulator found. Please install gnome-terminal, konsole, alacritty, or xterm".to_string())
}
```

### Phase 2: Windows Support (Next Week)

```rust
#[cfg(target_os = "windows")]
fn open_terminal_windows(window_name: &str) -> Result<(), String> {
    // Windows Terminal is the modern default
    if which::which("wt.exe").is_ok() {
        eprintln!("[open_terminal_windows] Using Windows Terminal");

        let result = Command::new("wt.exe")
            .args(&[
                "-w", "0",           // Use existing window
                "new-tab",           // Create new tab
                "--title", &format!("ushadow-{}", window_name),
                "bash",
                "-c",
                &format!("tmux attach -t workmux:{}", window_name)
            ])
            .spawn();

        if result.is_ok() {
            return Ok(());
        }
    }

    // Fallback: try WSL bash in cmd
    eprintln!("[open_terminal_windows] Falling back to cmd.exe + bash");
    Command::new("cmd.exe")
        .args(&[
            "/c", "start",
            "bash",
            "-c",
            &format!("tmux attach -t workmux:{}", window_name)
        ])
        .spawn()
        .map_err(|e| format!("Failed to open terminal: {}", e))?;

    Ok(())
}
```

### Phase 3: Configuration Support (Later)

Add to `~/.ushadow/launcher.yml`:
```yaml
terminal:
  # Auto-detect by default
  auto_detect: true

  # Override with custom command (optional)
  # Use {window} as placeholder for tmux window name
  custom_command: null

  # Example custom commands (uncomment to use):
  # custom_command: "alacritty -e tmux attach -t {window}"
  # custom_command: "wt.exe -w 0 nt bash -c 'tmux attach -t {window}'"
```

## Testing Matrix

| OS | Terminal | Command | Status |
|----|----------|---------|--------|
| macOS | Terminal.app | osascript | ✅ Tested |
| macOS | iTerm2 | osascript | 🚧 TODO |
| macOS | Alacritty | alacritty -e | 🚧 TODO |
| Linux | gnome-terminal | gnome-terminal -- | 🚧 TODO |
| Linux | konsole | konsole -e | 🚧 TODO |
| Linux | xfce4-terminal | xfce4-terminal -e | 🚧 TODO |
| Linux | alacritty | alacritty -e | 🚧 TODO |
| Linux | kitty | kitty | 🚧 TODO |
| Linux | xterm | xterm -e | 🚧 TODO |
| Windows | Windows Terminal | wt.exe | 🚧 TODO |
| Windows | cmd.exe | cmd /c start | 🚧 TODO |

## Open Questions

1. **WSL on Windows**: Should we detect WSL vs native Windows and adjust tmux commands accordingly?
2. **SSH Sessions**: What happens if user is SSH'd into the machine? Should we detect this and skip terminal opening?
3. **Headless Servers**: How to handle running launcher on a server with no GUI? Just create tmux window without opening?
4. **Terminal Preferences**: Should we remember user's successful terminal and prefer it next time?
5. **Error Messages**: What should we show users if terminal opening fails? Link to docs? Suggest installing specific terminal?

## Related Issues

- #TODO: Create GitHub issue for Linux terminal support
- #TODO: Create GitHub issue for Windows terminal support
- #TODO: Create GitHub issue for embedded terminal exploration
- #TODO: Update TESTING.md with terminal testing matrix

## References

- [Tauri Shell API](https://tauri.app/v1/api/js/shell)
- [xterm.js](https://xtermjs.org/)
- [Windows Terminal CLI](https://learn.microsoft.com/en-us/windows/terminal/command-line-arguments)
- [GNOME Terminal Man Page](https://man.archlinux.org/man/gnome-terminal.1)
- [Alacritty Man Page](https://man.archlinux.org/man/alacritty.1.en)
