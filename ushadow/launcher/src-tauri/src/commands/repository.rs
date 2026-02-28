/// Repository and Git operations for Ushadow project management
///
/// This module handles:
/// - Project directory management (default paths, validation)
/// - Git repository operations (clone, update, branch management)
/// - Git ancestry checking (determine base branch)

use super::utils::{silent_command, expand_tilde};
use super::permissions::check_path_permissions;
use crate::models::ProjectStatus;
use std::path::Path;
use std::fs;

const USHADOW_REPO_URL: &str = "https://github.com/Ushadow-io/ushadow.git";

// ============================================
// Project Directory Management
// ============================================

/// Get default project directory based on platform
#[tauri::command]
pub fn get_default_project_dir() -> Result<String, String> {
    use std::path::PathBuf;

    #[cfg(target_os = "windows")]
    {
        // Windows: Use user's home directory
        if let Ok(userprofile) = std::env::var("USERPROFILE") {
            let mut path = PathBuf::from(userprofile);
            path.push("Ushadow");
            return Ok(path.to_string_lossy().to_string());
        }
        Ok("C:\\Ushadow".to_string())
    }

    #[cfg(target_os = "macos")]
    {
        if let Ok(home) = std::env::var("HOME") {
            let mut path = PathBuf::from(home);
            path.push("ushadow");
            return Ok(path.to_string_lossy().to_string());
        }
        Ok("/Users/Shared/ushadow".to_string())
    }

    #[cfg(target_os = "linux")]
    {
        if let Ok(home) = std::env::var("HOME") {
            let mut path = PathBuf::from(home);
            path.push("Ushadow");
            return Ok(path.to_string_lossy().to_string());
        }
        Ok("/opt/Ushadow".to_string())
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        Ok("./Ushadow".to_string())
    }
}

/// Check if a directory contains a valid Ushadow project
#[tauri::command]
pub fn check_project_dir(path: String) -> Result<ProjectStatus, String> {
    let project_path = Path::new(&path);

    if !project_path.exists() {
        return Ok(ProjectStatus {
            path: Some(path),
            exists: false,
            is_valid_repo: false,
        });
    }

    // Check for key files that indicate a valid Ushadow repo
    let go_sh = project_path.join("go.sh");
    let compose_dir = project_path.join("compose");
    let git_dir = project_path.join(".git");

    let is_valid = go_sh.exists() && compose_dir.exists() && git_dir.exists();

    Ok(ProjectStatus {
        path: Some(path),
        exists: true,
        is_valid_repo: is_valid,
    })
}

// ============================================
// Git Repository Operations
// ============================================

/// Clone the Ushadow repository
#[tauri::command]
pub async fn clone_ushadow_repo(target_dir: String, branch: Option<String>) -> Result<String, String> {
    // Expand ~ to home directory
    let expanded_dir = expand_tilde(&target_dir);
    let target_path = Path::new(&expanded_dir);

    // STEP 1: Check permissions BEFORE attempting anything (use expanded path)
    let (permissions_ok, error_msg, suggestion) = check_path_permissions(&expanded_dir);
    if !permissions_ok {
        let mut err = error_msg.unwrap_or_else(|| "Permission denied".to_string());
        if let Some(sug) = suggestion {
            err.push_str(&format!("\n\n{}", sug));
        }
        return Err(err);
    }

    // STEP 2: Check if directory already exists
    if target_path.exists() {
        // If it exists and has content, don't try to clone
        if target_path.read_dir().map(|mut d| d.next().is_some()).unwrap_or(false) {
            return Err(format!("Directory {} already exists and is not empty", target_dir));
        }
    }

    // Create parent directory if it doesn't exist
    if let Some(parent) = target_path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create directory: {}", e))?;
        }
    }

    // Build clone command with optional branch
    let mut args = vec!["clone", "--depth", "1"];
    if let Some(ref b) = branch {
        args.extend(&["--branch", b.as_str()]);
    }
    args.extend(&[USHADOW_REPO_URL, &target_dir]);

    // Clone the repository
    let output = silent_command("git")
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to run git clone: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);

        // Git uses stderr for both progress ("Cloning into...") and real errors.
        // Filter to only the fatal/error lines so we don't include progress noise.
        let error_lines: Vec<&str> = stderr
            .lines()
            .filter(|l| l.starts_with("fatal:") || l.starts_with("error:") || l.starts_with("remote: error"))
            .collect();

        let git_error = if error_lines.is_empty() {
            stderr.trim().to_string()
        } else {
            error_lines.join("\n")
        };

        // Provide actionable messages for common failure modes
        return Err(if git_error.contains("Could not resolve host") || git_error.contains("resolve host") {
            format!(
                "Network error: Could not connect to GitHub. Please check your internet connection and try again.\n\nDetails: {}",
                git_error
            )
        } else if git_error.contains("Permission denied") || git_error.to_lowercase().contains("access denied") {
            format!(
                "Permission denied cloning to {}. Please check you have write access to that directory.\n\nDetails: {}",
                target_dir, git_error
            )
        } else if git_error.contains("already exists") {
            format!("Target directory already exists and is not empty: {}", target_dir)
        } else {
            format!("Git clone failed: {}", git_error)
        });
    }

    // Verify the clone actually worked by checking for .git directory
    let git_dir = target_path.join(".git");
    if !git_dir.exists() {
        return Err(format!("Clone reported success but .git directory not found at {}", target_dir));
    }

    // Verify key Ushadow files exist
    let go_sh = target_path.join("go.sh");
    if !go_sh.exists() {
        return Err(format!("Clone completed but go.sh not found - may not be a valid Ushadow repo"));
    }

    let branch_msg = branch.map(|b| format!(" (branch: {})", b)).unwrap_or_default();
    Ok(format!("Successfully cloned Ushadow to {}{}", target_dir, branch_msg))
}

/// Update an existing Ushadow repository safely (stash, pull, stash pop)
#[tauri::command]
pub async fn update_ushadow_repo(project_dir: String) -> Result<String, String> {
    // Step 1: Stash any local changes
    let stash_output = silent_command("git")
        .args(["stash", "push", "-m", "ushadow-launcher-auto-stash"])
        .current_dir(&project_dir)
        .output()
        .map_err(|e| format!("Failed to run git stash: {}", e))?;

    let had_changes = if stash_output.status.success() {
        let stdout = String::from_utf8_lossy(&stash_output.stdout);
        // Check if anything was actually stashed
        !stdout.contains("No local changes to save")
    } else {
        false
    };

    // Step 2: Pull latest changes
    let pull_output = silent_command("git")
        .args(["pull", "--rebase=false"])
        .current_dir(&project_dir)
        .output()
        .map_err(|e| format!("Failed to run git pull: {}", e))?;

    if !pull_output.status.success() {
        let stderr = String::from_utf8_lossy(&pull_output.stderr);
        // Try to restore stashed changes even if pull failed
        if had_changes {
            let _ = silent_command("git")
                .args(["stash", "pop"])
                .current_dir(&project_dir)
                .output();
        }
        return Err(format!("Git pull failed: {}", stderr));
    }

    let pull_result = String::from_utf8_lossy(&pull_output.stdout).trim().to_string();

    // Step 3: Pop stashed changes if we had any
    if had_changes {
        let pop_output = silent_command("git")
            .args(["stash", "pop"])
            .current_dir(&project_dir)
            .output()
            .map_err(|e| format!("Failed to run git stash pop: {}", e))?;

        if !pop_output.status.success() {
            let stderr = String::from_utf8_lossy(&pop_output.stderr);
            return Err(format!(
                "Update pulled but failed to restore local changes: {}. Your changes are in git stash.",
                stderr
            ));
        }

        Ok(format!("Updated and restored local changes. {}", pull_result))
    } else {
        Ok(format!("Updated: {}", pull_result))
    }
}

/// Get current branch of a git repository
#[tauri::command]
pub fn get_current_branch(path: String) -> Result<String, String> {
    let output = silent_command("git")
        .args(["-C", &path, "rev-parse", "--abbrev-ref", "HEAD"])
        .output()
        .map_err(|e| format!("Failed to run git: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to get current branch: {}", stderr));
    }

    let branch = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(branch)
}

/// Checkout a branch in a git repository
#[tauri::command]
pub fn checkout_branch(path: String, branch: String) -> Result<String, String> {
    let output = silent_command("git")
        .args(["-C", &path, "checkout", &branch])
        .output()
        .map_err(|e| format!("Failed to run git: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to checkout branch: {}", stderr));
    }

    Ok(format!("Checked out branch: {}", branch))
}

/// Determine which base branch (main or dev) a worktree branch was created from
/// Uses git merge-base to check ancestry
#[tauri::command]
pub fn get_base_branch(repo_path: String, branch: String) -> Result<Option<String>, String> {
    // First check if main and dev branches exist
    let branches_output = silent_command("git")
        .args(["-C", &repo_path, "branch", "-a"])
        .output()
        .map_err(|e| format!("Failed to list branches: {}", e))?;

    if !branches_output.status.success() {
        return Ok(None);
    }

    let branches = String::from_utf8_lossy(&branches_output.stdout);
    let has_main = branches.lines().any(|l| l.contains("main") || l.contains("master"));
    let has_dev = branches.lines().any(|l| l.contains("dev") && !l.contains("develop"));

    if !has_main && !has_dev {
        return Ok(None);
    }

    // Check if current branch is exactly main or dev
    if branch == "main" || branch == "master" {
        return Ok(Some("main".to_string()));
    }
    if branch == "dev" {
        return Ok(Some("dev".to_string()));
    }

    // Check ancestry using merge-base
    // Try dev first
    if has_dev {
        let dev_check = silent_command("git")
            .args(["-C", &repo_path, "merge-base", "--is-ancestor", "dev", &branch])
            .output();

        if let Ok(output) = dev_check {
            if output.status.success() {
                // Branch has dev as ancestor, now check if it's more recent than main
                if has_main {
                    let main_base = silent_command("git")
                        .args(["-C", &repo_path, "rev-parse", "main"])
                        .output();
                    let dev_base = silent_command("git")
                        .args(["-C", &repo_path, "rev-parse", "dev"])
                        .output();

                    if let (Ok(main_out), Ok(dev_out)) = (main_base, dev_base) {
                        if main_out.status.success() && dev_out.status.success() {
                            let main_sha = String::from_utf8_lossy(&main_out.stdout).trim().to_string();
                            let dev_sha = String::from_utf8_lossy(&dev_out.stdout).trim().to_string();

                            // Check if dev is ahead of main (i.e., dev is based on main + extra commits)
                            let is_dev_ahead = silent_command("git")
                                .args(["-C", &repo_path, "merge-base", "--is-ancestor", &main_sha, &dev_sha])
                                .output();

                            if let Ok(ahead_check) = is_dev_ahead {
                                if ahead_check.status.success() {
                                    // Dev is ahead of main, so this branch is from dev
                                    return Ok(Some("dev".to_string()));
                                }
                            }
                        }
                    }
                }
                return Ok(Some("dev".to_string()));
            }
        }
    }

    // Check if main is ancestor
    if has_main {
        let main_check = silent_command("git")
            .args(["-C", &repo_path, "merge-base", "--is-ancestor", "main", &branch])
            .output();

        if let Ok(output) = main_check {
            if output.status.success() {
                return Ok(Some("main".to_string()));
            }
        }
    }

    Ok(None)
}
