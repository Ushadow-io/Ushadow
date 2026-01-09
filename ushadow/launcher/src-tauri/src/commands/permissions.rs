/// Permission checking utilities for clone/install locations
use std::path::Path;
use std::fs;
use serde::Serialize;

#[derive(Serialize)]
pub struct PermissionCheckResult {
    pub is_ok: bool,
    pub error_message: Option<String>,
    pub suggestion: Option<String>,
}

/// Check if a path is writable and safe for cloning
/// Returns (is_ok, error_message, suggestion)
pub fn check_path_permissions(target_dir: &str) -> (bool, Option<String>, Option<String>) {
    let path = Path::new(target_dir);

    // CRITICAL: Block root and system root paths first
    if target_dir == "/" || target_dir == "C:\\" || target_dir == "C:/" {
        return (
            false,
            Some("Cannot install to root directory (/).".to_string()),
            Some(format!(
                "Try: {}",
                get_safe_install_path()
            )),
        );
    }

    // Block empty or very short paths that look suspicious
    if target_dir.is_empty() || target_dir.len() < 2 {
        return (
            false,
            Some("Invalid installation path.".to_string()),
            Some(format!(
                "Try: {}",
                get_safe_install_path()
            )),
        );
    }

    // Check for problematic locations on macOS
    #[cfg(target_os = "macos")]
    {
        // System protected directories
        let protected_prefixes = [
            "/System",
            "/Library",
            "/Applications",
            "/usr",
            "/bin",
            "/sbin",
            "/var",
        ];

        for prefix in protected_prefixes {
            if target_dir.starts_with(prefix) {
                return (
                    false,
                    Some(format!(
                        "Cannot install to {}. This is a system-protected directory.",
                        prefix
                    )),
                    Some(format!(
                        "Try: {} or {}",
                        std::env::var("HOME").unwrap_or_default() + "/ushadow",
                        std::env::var("HOME").unwrap_or_default() + "/Projects/ushadow"
                    )),
                );
            }
        }

        // Warn about privacy-protected folders (macOS Catalina+)
        // These require Full Disk Access permission in System Preferences
        let privacy_folders = [
            "/Documents",
            "/Desktop",
            "/Downloads",
        ];

        for folder in privacy_folders {
            let home = std::env::var("HOME").unwrap_or_default();
            let full_path = format!("{}{}", home, folder);
            if target_dir.starts_with(&full_path) {
                return (
                    false,
                    Some(format!(
                        "Cannot install to {}. macOS protects this folder and requires Full Disk Access permission.",
                        folder
                    )),
                    Some(format!(
                        "Try: {}/ushadow or {}/Projects/ushadow instead",
                        home, home
                    )),
                );
            }
        }
    }

    // Check if parent directory exists and is writable
    if let Some(parent) = path.parent() {
        if parent.exists() {
            // Parent exists - check if we can write to it
            match fs::metadata(parent) {
                Ok(metadata) => {
                    if metadata.permissions().readonly() {
                        return (
                            false,
                            Some(format!(
                                "Cannot write to {}. Parent directory is read-only.",
                                parent.display()
                            )),
                            Some("Choose a location in your home directory".to_string()),
                        );
                    }
                }
                Err(e) => {
                    return (
                        false,
                        Some(format!(
                            "Cannot access {}. {}",
                            parent.display(),
                            e
                        )),
                        None,
                    );
                }
            }

            // Try to create a test file to verify write permissions
            let test_file = parent.join(".ushadow_permission_test");
            match fs::write(&test_file, "test") {
                Ok(_) => {
                    // Clean up test file
                    let _ = fs::remove_file(&test_file);
                }
                Err(e) => {
                    return (
                        false,
                        Some(format!(
                            "Cannot write to {}. Permission denied: {}",
                            parent.display(),
                            e
                        )),
                        Some(format!(
                            "Try: {}",
                            std::env::var("HOME").unwrap_or_default() + "/ushadow"
                        )),
                    );
                }
            }
        } else {
            // Parent doesn't exist - check if we can create it
            // Try to trace back to find the first existing parent
            let mut check_path = parent;
            while !check_path.exists() {
                if let Some(p) = check_path.parent() {
                    check_path = p;
                } else {
                    break;
                }
            }

            // Now check if we can write to the first existing parent
            if check_path.exists() {
                match fs::metadata(check_path) {
                    Ok(metadata) => {
                        if metadata.permissions().readonly() {
                            return (
                                false,
                                Some(format!(
                                    "Cannot create {}. Parent directory {} is read-only.",
                                    parent.display(),
                                    check_path.display()
                                )),
                                Some("Choose a writable location".to_string()),
                            );
                        }
                    }
                    Err(e) => {
                        return (
                            false,
                            Some(format!(
                                "Cannot access parent directory {}. {}",
                                check_path.display(),
                                e
                            )),
                            None,
                        );
                    }
                }
            }
        }
    }

    // All checks passed
    (true, None, None)
}

/// Tauri command to check path permissions from frontend
#[tauri::command]
pub fn check_install_path(path: String) -> PermissionCheckResult {
    let (is_ok, error_message, suggestion) = check_path_permissions(&path);
    PermissionCheckResult {
        is_ok,
        error_message,
        suggestion,
    }
}

/// Get a safe default installation path for the current user
pub fn get_safe_install_path() -> String {
    use std::path::PathBuf;

    if let Ok(home) = std::env::var("HOME") {
        let mut path = PathBuf::from(home);
        path.push("ushadow");
        path.to_string_lossy().to_string()
    } else {
        // Fallback
        #[cfg(target_os = "windows")]
        return "C:\\ushadow".to_string();

        #[cfg(not(target_os = "windows"))]
        return "/tmp/ushadow".to_string();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[cfg(target_os = "macos")]
    fn test_system_paths_rejected() {
        let (ok, err, _) = check_path_permissions("/System/ushadow");
        assert!(!ok);
        assert!(err.is_some());

        let (ok, err, _) = check_path_permissions("/Applications/Ushadow");
        assert!(!ok);
        assert!(err.is_some());
    }

    #[test]
    fn test_home_directory_ok() {
        if let Ok(home) = std::env::var("HOME") {
            let test_path = format!("{}/test_ushadow", home);
            let (ok, _, _) = check_path_permissions(&test_path);
            // Should be ok (assuming home directory is writable)
            assert!(ok);
        }
    }

    #[test]
    fn test_safe_install_path() {
        let path = get_safe_install_path();
        assert!(!path.is_empty());
        assert!(!path.starts_with("/System"));
        assert!(!path.starts_with("/Applications"));
    }
}
