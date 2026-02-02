# Platform Support - Ushadow Launcher

## Terminal Integration

### macOS
**Primary**: iTerm2 with colored tabs
- Full support for environment-specific tab colors
- Automatic tab color assignment (gold, purple, brown, etc.)
- Uses iTerm2 proprietary escape sequences for tab colors
- Creates dedicated tmux session per environment

**Fallback**: Terminal.app
- Basic window title support
- No tab color support (Terminal.app limitation)
- Creates dedicated tmux session per environment

**Implementation**: `src-tauri/src/commands/worktree.rs::open_tmux_in_terminal()`
- Uses AppleScript to control native terminal applications
- Creates temporary shell scripts to avoid quote escaping issues
- Automatically detects iTerm2 availability

### Linux
**Supported Terminal Emulators** (in order of preference):
1. GNOME Terminal (`gnome-terminal`)
2. Konsole (`konsole`)
3. XFCE Terminal (`xfce4-terminal`)
4. xterm (`xterm`)

**Features**:
- Creates dedicated tmux session per environment
- Automatically tries available terminal emulators
- Falls back to next available if one fails

**Implementation**: `src-tauri/src/commands/worktree.rs::open_tmux_in_terminal()`
- Uses `#[cfg(not(target_os = "macos"))]` guard
- Attempts to spawn each terminal emulator in sequence

### Windows
**Status**: Partial support
- Uses same terminal detection as Linux
- Requires WSL + tmux + compatible terminal emulator
- Not fully tested

## Code Organization

### Platform-Specific Guards

All platform-specific code uses Rust's conditional compilation:

```rust
#[cfg(target_os = "macos")]
{
    // macOS-specific code (iTerm2/Terminal.app)
}

#[cfg(not(target_os = "macos"))]
{
    // Linux/Windows code (gnome-terminal/konsole/xterm)
}
```

### Deprecated Code

The following modules have been **deprecated** and disabled:

#### Embedded Terminal (PTY-based)
- **Location**: `src-tauri/src/commands/terminal.rs`
- **Status**: Disabled in `src-tauri/src/commands/mod.rs`
- **Reason**: Too flaky - issues with UTF-8 encoding, key repeats, echo feedback loops
- **Replacement**: Native terminal integration (iTerm2/Terminal.app/gnome-terminal)

**Removed Commands**:
- `spawn_terminal` - Spawned embedded PTY terminal
- `terminal_write` - Wrote data to PTY
- `terminal_resize` - Resized PTY (not implemented)
- `close_terminal` - Closed PTY session
- `list_terminals` - Listed active PTY sessions

## VSCode Integration

### All Platforms
**Command**: `code <path>`
- Cross-platform VSCode CLI
- Works on macOS, Linux, Windows
- No platform-specific guards needed

**Implementation**: `src-tauri/src/commands/worktree.rs::open_in_vscode()`

## Tmux Integration

### All Platforms
**Requirements**:
- tmux installed and in PATH
- Works identically on all platforms

**Session Structure**:
- **Old**: Single `workmux` session with multiple windows (deprecated)
- **New**: Dedicated session per environment (`ushadow-<env>`)
  - `ushadow-gold` → Gold environment
  - `ushadow-purple` → Purple environment
  - `ushadow-brown` → Brown environment

**Benefits**:
- Independent sessions don't interfere with each other
- Opening new terminal doesn't affect existing terminals
- Clean separation between environments

## Testing

### macOS
- ✅ iTerm2 with colored tabs
- ✅ Terminal.app fallback
- ✅ Dedicated tmux sessions

### Linux
- ⚠️ Needs testing on Ubuntu/Debian (gnome-terminal)
- ⚠️ Needs testing on KDE (konsole)
- ⚠️ Needs testing on XFCE (xfce4-terminal)

### Windows
- ❌ Not tested
- ❌ Requires WSL + tmux setup

## Future Enhancements

1. **Windows Native Support**
   - Windows Terminal integration
   - PowerShell/CMD support without WSL

2. **Color Customization**
   - User-configurable environment colors
   - Theme support

3. **Terminal Emulator Detection**
   - Better detection of available terminals on Linux
   - User preferences for terminal selection

## Notes

- iTerm2 tab colors use RGB 0-255 format via escape sequences
- Terminal.app does not support tab colors via AppleScript
- All platforms use escape sequences for window titles (`\033]0;...\007`)
- Temporary scripts are created in `/tmp/ushadow_*` for complex commands
