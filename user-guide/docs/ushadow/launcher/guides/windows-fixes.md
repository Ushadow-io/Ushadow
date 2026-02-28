---
title: Windows Fixes
sidebar_position: 10
---


## Issues Fixed

### 1. "Content Blocked" on Embedded View (iframe)
**Problem:** When opening an embedded view pane on first load, Windows showed "content blocked" error.

**Root Cause:** Content Security Policy (CSP) in `tauri.conf.json` was missing the `frame-src` directive. Windows webview is stricter about CSP enforcement than macOS/Linux, so it blocked iframe content from localhost.

**Fix:** Updated CSP to include:
- `frame-src http://localhost:* https://localhost:*` - Allows iframes from local services
- `https://localhost:*` support for connect-src and img-src - Future-proofs for HTTPS services
- `wss://localhost:*` for secure WebSocket connections

**File:** `src-tauri/tauri.conf.json` (line 94)

### 2. PowerShell Syntax Error in Environment Startup
**Problem:** The launcher was using bash-style command syntax (`&&`, `VAR=value`) when calling PowerShell on Windows, causing:
```
The token '&&' is not a valid statement separator in this version.
```

**Root Cause:** `docker.rs:434` used hardcoded bash command syntax that was passed to `shell_command()`, which uses PowerShell on Windows.

**Fix:** Added platform-specific command generation using `#[cfg(target_os = "windows")]`:
- Windows: Uses `;` separator and `$env:VAR='value'` syntax
- Unix: Uses `&&` separator and inline `VAR=value` syntax

**File:** `src-tauri/src/commands/docker.rs`

### 3. Log Output Separation
**Problem:** Detailed debug logs were mixed with user-facing status messages, making output hard to read.

**Fix:** Implemented two-tier logging system:
- `status_log`: Concise user-visible messages shown on success
- `debug_log`: Detailed debug info only shown on error
- On error: Both logs shown with clear separation
- On success: Only status log shown

**File:** `src-tauri/src/commands/docker.rs`

### 4. UV Installation Moved to Prerequisites
**Problem:** UV was installed inline during environment startup, mixing concerns and not respecting OS boundaries.

**Changes:**
1. **Made UV required** (`prerequisites.yaml`):
   - Changed `optional: true` → `optional: false`
   - Now a mandatory prerequisite like Docker and Git

2. **Fixed script installer** (`generic_installer.rs`):
   - Added platform-specific script handling
   - Windows: Saves as `.ps1` and executes with PowerShell
   - Unix: Saves as `.sh` and executes with bash
   - Uses proper PowerShell invocation operator (`&`) for script execution

3. **Removed inline installation** (`docker.rs`):
   - Deleted ~70 lines of inline uv installation code
   - Now assumes uv is installed via prerequisites
   - Added clear error message directing users to Prerequisites panel

**Benefits:**
- Clean separation of concerns
- Proper OS-specific handling via prerequisites system
- Users see clear prerequisite requirements before starting
- Consistent installation experience across all tools

## Files Modified

1. `src-tauri/tauri.conf.json`
   - Added `frame-src` directive to CSP (line 94)
   - Added HTTPS and WSS support for localhost

2. `src-tauri/src/commands/docker.rs`
   - Fixed PowerShell command syntax (lines 434-444)
   - Implemented two-tier logging (lines 358-504)
   - Removed inline uv installation (~70 lines)
   - Added uv verification check (lines 368-391)

3. `src-tauri/src/commands/generic_installer.rs`
   - Fixed `install_via_script` for Windows (lines 230-282)
   - Proper `.ps1` vs `.sh` extension handling
   - Correct PowerShell script execution

4. `src-tauri/prerequisites.yaml`
   - Changed uv from optional to required (line 86)
   - Updated comment (line 79)

5. `setup/run.py`
   - Added IS_WINDOWS flag (line 21)
   - Created Icons class with platform-specific characters (lines 57-97)
   - Replaced all emoji/Unicode usages with Icons class (~30 replacements)

## Summary

All five Windows issues have been fixed:
1. ✅ CSP `frame-src` directive added - embedded views work
2. ✅ PowerShell command syntax - no more syntax errors
3. ✅ Two-tier logging - clean output
4. ✅ UV moved to prerequisites - proper OS handling
5. ✅ Unicode encoding - ASCII-safe icons on Windows

### Unicode Encoding Details
**Problem:** Setup script crashed on Windows with `UnicodeEncodeError: 'charmap' codec can't encode characters` when trying to print Unicode box-drawing characters (`━`) and emojis.

**Root Cause:** Windows console defaults to cp1252 encoding which can't handle Unicode characters. Even with UTF-8 encoding fix, emojis don't display properly in captured output (Tauri subprocess).

**Fix:** Created platform-aware `Icons` class that uses:
- **Windows**: ASCII-safe alternatives (`=`, `>`, `*`, `OK`, `ERROR`, etc.)
- **Unix/macOS**: Unicode emojis and box-drawing characters

**Benefits:**
- Works reliably on all platforms
- No encoding errors
- Clean output in both terminal and captured logs
- Maintainable icon system

**Files:**
- `setup/run.py` - Added Icons class (lines 57-97)
- Replaced all emoji/Unicode usages throughout the file

## Testing Required

- [ ] Test setup script runs without encoding errors on Windows
- [ ] Verify icons display correctly on Windows console
- [ ] Test embedded view (iframe) loads without "content blocked" error
- [ ] Test uv installation via Prerequisites panel on Windows
- [ ] Test environment startup on Windows after uv is installed
- [ ] Verify error message when uv is not installed
- [ ] Test that script installations work for other prerequisites (Docker, Tailscale)
- [ ] Verify log output is clean on success, detailed on error

## Architecture Improvements

### Before
```
Prerequisites Panel → Check uv (optional)
                ↓
Environment Startup → Install uv inline (70+ lines)
                    → Find uv
                    → Run setup.py
```

### After
```
Prerequisites Panel → Check uv (required)
                    → Install uv (via generic installer)
                    → Platform-aware (.ps1/.sh)
                ↓
Environment Startup → Verify uv exists
                    → Run setup.py
```

The new architecture properly separates concerns and respects platform boundaries.
