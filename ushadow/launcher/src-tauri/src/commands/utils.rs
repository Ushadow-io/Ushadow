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
        // -Command: Execute the command
        let mut cmd = Command::new("powershell");
        cmd.args(["-NoProfile", "-Command", command]);
        // CREATE_NO_WINDOW = 0x08000000
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

/// Expand ~ in paths to the user's home directory
/// Example: ~/ushadow -> /Users/username/ushadow
pub fn expand_tilde(path: &str) -> String {
    if path.starts_with("~/") || path == "~" {
        if let Ok(home) = std::env::var("HOME") {
            return path.replacen("~", &home, 1);
        }
        // Windows fallback
        #[cfg(target_os = "windows")]
        if let Ok(userprofile) = std::env::var("USERPROFILE") {
            return path.replacen("~", &userprofile, 1);
        }
    }
    path.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_silent_command_creates_command() {
        // Just verify it creates a command without panicking
        let cmd = silent_command("echo");
        // We can't easily test the creation_flags, but we can verify it's a valid Command
        assert!(format!("{:?}", cmd).contains("echo"));
    }
}
