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
