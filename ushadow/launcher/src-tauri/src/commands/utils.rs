use std::process::Command;

/// Create a new Command that won't open a console window on Windows.
/// This is essential for background polling commands that shouldn't flash windows.
pub fn silent_command(program: &str) -> Command {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let mut cmd = Command::new(program);
        // CREATE_NO_WINDOW = 0x08000000
        // This prevents a console window from being created
        cmd.creation_flags(0x08000000);
        return cmd;
    }

    #[cfg(not(target_os = "windows"))]
    {
        Command::new(program)
    }
}

/// Create a shell command that works cross-platform with proper environment loading
///
/// On Windows: uses PowerShell which properly loads both System and User PATH
/// On macOS/Linux: uses the user's default shell ($SHELL) with login flag to load profile
///
/// This ensures we can find programs installed by package managers (Homebrew, Chocolatey, etc.)
/// that add themselves to user's PATH but may not be in the system PATH yet.
pub fn shell_command(command: &str) -> Command {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        // Use PowerShell for better environment variable handling
        // -NoProfile: Skip loading profile for speed (environment vars are still loaded)
        // -WindowStyle Hidden: Don't show the PowerShell window
        // -NonInteractive: Don't wait for user input
        // -Command: Execute the command
        let mut cmd = Command::new("powershell");
        cmd.args(["-NoProfile", "-WindowStyle", "Hidden", "-NonInteractive", "-Command", command]);
        // CREATE_NO_WINDOW = 0x08000000
        // This prevents the console window from being created in the first place
        cmd.creation_flags(0x08000000);
        return cmd;
    }

    #[cfg(not(target_os = "windows"))]
    {
        use std::env;

        // Use the user's actual shell (zsh, bash, fish, etc.)
        // Fall back to sh if $SHELL is not set (POSIX standard)
        let shell = env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string());

        let mut cmd = Command::new(shell);
        // -l: login shell (loads ~/.zprofile, ~/.bash_profile, etc.)
        // -c: run this command and exit
        cmd.args(["-l", "-c", command]);
        return cmd;
    }
}

/// Normalize path separators to the platform standard
///
/// On Windows: Converts all forward slashes to backslashes
/// On Unix: Returns path unchanged
///
/// This is critical for paths coming from JavaScript/frontend which always use forward slashes
pub fn normalize_path(path: &str) -> String {
    #[cfg(target_os = "windows")]
    {
        path.replace('/', "\\")
    }

    #[cfg(not(target_os = "windows"))]
    {
        path.to_string()
    }
}

/// Expand ~ in paths to the user's home directory
/// Example: ~/ushadow -> /Users/username/ushadow
///
/// On Windows, automatically normalizes path separators to backslashes
pub fn expand_tilde(path: &str) -> String {
    if path.starts_with("~/") || path == "~" {
        if let Ok(home) = std::env::var("HOME") {
            return path.replacen("~", &home, 1);
        }
        // Windows fallback
        #[cfg(target_os = "windows")]
        if let Ok(userprofile) = std::env::var("USERPROFILE") {
            // Replace tilde and normalize to backslashes
            let expanded = path.replacen("~", &userprofile, 1);
            return expanded.replace('/', "\\");
        }
    }
    path.to_string()
}

/// Quote a path for safe use in shell commands
/// Handles paths with spaces, special characters, etc.
///
/// On Windows (PowerShell): Uses single quotes and escapes internal single quotes
/// On Unix: Uses single quotes and escapes internal single quotes
///
/// Example: C:/Program Files/App -> 'C:/Program Files/App'
pub fn quote_path(path: &str) -> String {
    // Escape single quotes by replacing ' with ''  (PowerShell and bash compatible)
    let escaped = path.replace('\'', "''");
    format!("'{}'", escaped)
}

/// Quote a path from a PathBuf for safe use in shell commands
/// Convenience wrapper around quote_path()
pub fn quote_path_buf(path: &std::path::Path) -> String {
    quote_path(&path.to_string_lossy())
}
