/// Utilities for finding bundled startup resources
/// Bundled resources are version-locked with the launcher to ensure stability

use std::path::{Path, PathBuf};

/// Get the path to bundled resources directory
/// Tries multiple locations in order:
/// 1. Next to executable (production)
/// 2. In bundled/ relative to src-tauri (development)
pub fn get_bundled_resources_dir() -> Option<PathBuf> {
    // Try next to executable (production)
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            // macOS: bundled/ next to exe
            let bundled_path = exe_dir.join("bundled");
            if bundled_path.exists() {
                return Some(bundled_path);
            }

            // Windows: bundled/ in resources subdirectory
            let resources_bundled = exe_dir.join("resources").join("bundled");
            if resources_bundled.exists() {
                return Some(resources_bundled);
            }
        }
    }

    // Development: src-tauri/bundled
    let dev_bundled = PathBuf::from("bundled");
    if dev_bundled.exists() {
        return Some(dev_bundled);
    }

    // Development: parent directory
    let parent_bundled = PathBuf::from("../bundled");
    if parent_bundled.exists() {
        return Some(parent_bundled);
    }

    None
}

/// Get path to bundled setup scripts
/// Returns the bundled version if available, otherwise falls back to repo version
pub fn get_setup_dir(repo_root: &str) -> PathBuf {
    if let Some(bundled) = get_bundled_resources_dir() {
        let setup_path = bundled.join("setup");
        if setup_path.exists() {
            eprintln!("Using bundled setup scripts from: {:?}", setup_path);
            return setup_path;
        }
    }

    // Fallback to repo version
    let repo_setup = Path::new(repo_root).join("setup");
    eprintln!("Using repo setup scripts from: {:?}", repo_setup);
    repo_setup
}

/// Get path to bundled docker-compose files
/// Returns the bundled version if available, otherwise falls back to repo version
pub fn get_compose_file(repo_root: &str, filename: &str) -> PathBuf {
    if let Some(bundled) = get_bundled_resources_dir() {
        let compose_path = bundled.join("compose").join(filename);
        if compose_path.exists() {
            eprintln!("Using bundled compose file: {:?}", compose_path);
            return compose_path;
        }
    }

    // Fallback to repo version
    let repo_compose = Path::new(repo_root).join("compose").join(filename);
    eprintln!("Using repo compose file: {:?}", repo_compose);
    repo_compose
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_bundled_resources_attempts_multiple_paths() {
        // Should not panic even if nothing exists
        let _ = get_bundled_resources_dir();
    }
}
