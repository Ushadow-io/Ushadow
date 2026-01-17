use crate::models::WorktreeInfo;
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Command;

/// Get color name for an environment name
/// Returns the color name that the frontend will use to look up hex codes
pub fn get_colors_for_name(name: &str) -> (String, String) {
    let color_names = [
        "blue", "gold", "pink", "purple", "red", "green", "indigo", "orange",
        "cyan", "teal", "lime", "brown", "silver", "coral", "salmon", "navy",
        "magenta", "violet", "maroon", "olive", "aqua", "turquoise", "crimson",
        "lavender", "mint", "peach", "rose", "ruby", "emerald", "sapphire",
        "amber", "bronze", "copper", "platinum", "slate", "charcoal",
    ];

    let name_lower = name.to_lowercase();
    for color in &color_names {
        if name_lower.contains(color) {
            return (color.to_string(), color.to_string());
        }
    }

    // Return the environment name itself so frontend can hash it
    (name.to_string(), name.to_string())
}

/// List all git worktrees in a repository
#[tauri::command]
pub async fn list_worktrees(main_repo: String) -> Result<Vec<WorktreeInfo>, String> {
    let output = Command::new("git")
        .args(["worktree", "list", "--porcelain"])
        .current_dir(&main_repo)
        .output()
        .map_err(|e| format!("Failed to list worktrees: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Git command failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut worktrees = Vec::new();
    let mut current: HashMap<String, String> = HashMap::new();

    for line in stdout.lines() {
        if line.is_empty() {
            if let Some(path) = current.get("worktree") {
                let path_buf = PathBuf::from(path);
                let name = path_buf.file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();

                let branch = current.get("branch")
                    .map(|b| b.replace("refs/heads/", ""))
                    .unwrap_or_default();

                // Skip bare repos
                if !current.contains_key("bare") {
                    worktrees.push(WorktreeInfo {
                        path: path.clone(),
                        branch,
                        name,
                    });
                }
            }
            current.clear();
        } else if line.starts_with("worktree ") {
            current.insert("worktree".to_string(), line[9..].to_string());
        } else if line.starts_with("branch ") {
            current.insert("branch".to_string(), line[7..].to_string());
        } else if line.starts_with("bare") {
            current.insert("bare".to_string(), "true".to_string());
        }
    }

    // Process last entry if exists
    if let Some(path) = current.get("worktree") {
        let path_buf = PathBuf::from(path);
        let name = path_buf.file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        let branch = current.get("branch")
            .map(|b| b.replace("refs/heads/", ""))
            .unwrap_or_default();

        if !current.contains_key("bare") {
            worktrees.push(WorktreeInfo {
                path: path.clone(),
                branch,
                name,
            });
        }
    }

    Ok(worktrees)
}

/// Create a new git worktree
#[tauri::command]
pub async fn create_worktree(
    main_repo: String,
    worktrees_dir: String,
    name: String,
    base_branch: Option<String>,
) -> Result<WorktreeInfo, String> {
    // Extract project name from main_repo path (last directory component)
    let project_name = PathBuf::from(&main_repo)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("ushadow")
        .to_string();

    // Create worktree path: worktrees_dir/project_name/name
    let project_worktrees_dir = PathBuf::from(&worktrees_dir).join(&project_name);
    let worktree_path = project_worktrees_dir.join(&name);

    // Ensure the project worktrees directory exists
    if !project_worktrees_dir.exists() {
        std::fs::create_dir_all(&project_worktrees_dir)
            .map_err(|e| format!("Failed to create project worktrees directory: {}", e))?;
        eprintln!("[create_worktree] Created project worktrees directory: {}", project_worktrees_dir.display());
    }

    // Determine the desired branch name
    let desired_branch = base_branch.clone().unwrap_or_else(|| name.clone());

    // Check if git has this worktree registered or if the branch is in use
    let list_output = Command::new("git")
        .args(["worktree", "list", "--porcelain"])
        .current_dir(&main_repo)
        .output()
        .map_err(|e| format!("Failed to list worktrees: {}", e))?;

    let worktrees_list = String::from_utf8_lossy(&list_output.stdout);
    let worktree_path_str = worktree_path.to_string_lossy();

    // Case-insensitive comparison for macOS/Windows compatibility
    let worktree_path_lower = worktree_path_str.to_lowercase();

    // Parse worktree list to find conflicts
    let mut lines = worktrees_list.lines();
    let mut conflicting_path: Option<String> = None;
    let mut is_path_registered = false;

    while let Some(line) = lines.next() {
        if line.starts_with("worktree ") {
            let path = line.trim_start_matches("worktree ");

            // Check if this exact path is registered (case-insensitive)
            if path.to_lowercase() == worktree_path_lower {
                is_path_registered = true;
                conflicting_path = Some(path.to_string());
                break;
            }

            // Check the next lines for branch info
            let mut current_worktree_path = path.to_string();
            let mut current_branch: Option<String> = None;

            for next_line in lines.by_ref() {
                if next_line.starts_with("branch ") {
                    current_branch = Some(next_line.trim_start_matches("branch ").trim_start_matches("refs/heads/").to_string());
                } else if next_line.is_empty() {
                    break;
                }
            }

            // Check if this worktree has our desired branch
            if let Some(ref branch) = current_branch {
                if branch == &desired_branch {
                    eprintln!("[create_worktree] Found existing worktree for branch '{}' at: {}", branch, current_worktree_path);
                    conflicting_path = Some(current_worktree_path);
                    break;
                }
            }
        }
    }

    let is_registered = is_path_registered || conflicting_path.is_some();

    // If the worktree is registered in git or the directory exists, clean it up
    if is_registered || worktree_path.exists() {
        eprintln!("[create_worktree] Worktree exists or is registered, attempting cleanup");

        // Use the conflicting path we found, or the target path if no conflict
        let path_to_remove = conflicting_path.unwrap_or_else(|| worktree_path_str.to_string());

        eprintln!("[create_worktree] Using path for removal: {}", path_to_remove);

        // Try to remove the worktree from git's tracking (handles both directory and registration)
        let remove_output = Command::new("git")
            .args(["worktree", "remove", "--force", &path_to_remove])
            .current_dir(&main_repo)
            .output()
            .map_err(|e| format!("Failed to remove worktree: {}", e))?;

        if remove_output.status.success() {
            eprintln!("[create_worktree] Successfully removed worktree from git tracking");
        } else {
            // If remove fails, try prune + manual directory removal
            eprintln!("[create_worktree] git worktree remove failed, trying prune + manual cleanup");

            let prune_output = Command::new("git")
                .args(["worktree", "prune"])
                .current_dir(&main_repo)
                .output()
                .map_err(|e| format!("Failed to prune worktrees: {}", e))?;

            if prune_output.status.success() {
                eprintln!("[create_worktree] Pruned stale worktree references");
            }

            // Remove the directory if it exists
            if worktree_path.exists() {
                std::fs::remove_dir_all(&worktree_path)
                    .map_err(|e| format!("Failed to remove existing worktree directory: {}", e))?;
                eprintln!("[create_worktree] Removed existing directory");
            }
        }
    }

    // Check if the desired branch exists
    let check_output = Command::new("git")
        .args(["rev-parse", "--verify", &format!("refs/heads/{}", desired_branch)])
        .current_dir(&main_repo)
        .output()
        .map_err(|e| format!("Failed to check branch: {}", e))?;

    let branch_exists = check_output.status.success();

    let (output, final_branch) = if branch_exists {
        // Branch exists - checkout directly into worktree
        let output = Command::new("git")
            .args(["worktree", "add", worktree_path.to_str().unwrap(), &desired_branch])
            .current_dir(&main_repo)
            .output()
            .map_err(|e| format!("Failed to create worktree: {}", e))?;
        (output, desired_branch)
    } else {
        // Branch doesn't exist - create new branch from main
        // If the desired branch has slashes, use it as-is for the branch name
        // Git supports slashes in branch names (e.g., feature/my-feature)
        let new_branch_name = desired_branch;

        // Create from main (or master if main doesn't exist)
        let base = "main";

        let output = Command::new("git")
            .args(["worktree", "add", "-b", &new_branch_name, worktree_path.to_str().unwrap(), base])
            .current_dir(&main_repo)
            .output()
            .map_err(|e| format!("Failed to create worktree: {}", e))?;

        (output, new_branch_name)
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Git command failed: {}", stderr));
    }

    Ok(WorktreeInfo {
        path: worktree_path.to_string_lossy().to_string(),
        branch: final_branch,
        name,
    })
}

/// Open a path in VS Code with environment-specific colors
#[tauri::command]
pub async fn open_in_vscode(path: String, env_name: Option<String>) -> Result<(), String> {
    use super::utils::shell_command;

    // If env_name is provided, set up VSCode colors using the Python utility
    if let Some(name) = env_name {
        eprintln!("[open_in_vscode] Setting up VSCode colors for environment: {}", name);

        // Run Python script to set up colors in the environment directory
        let color_setup_cmd = format!(
            "cd '{}' && uv run --with pyyaml python3 -c \"from setup.vscode_utils.colors import setup_colors_for_directory; from pathlib import Path; setup_colors_for_directory(Path('.'), '{}')\"",
            path, name
        );

        let output = shell_command(&color_setup_cmd)
            .output()
            .map_err(|e| format!("Failed to setup VSCode colors: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            eprintln!("[open_in_vscode] Warning: Color setup failed: {}", stderr);
            // Continue anyway - color setup is not critical
        } else {
            eprintln!("[open_in_vscode] VSCode colors configured successfully");
        }
    }

    // Open VS Code
    let output = Command::new("code")
        .arg(&path)
        .output()
        .map_err(|e| format!("Failed to open VS Code: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("VS Code command failed: {}", stderr));
    }

    Ok(())
}

/// Remove a git worktree
#[tauri::command]
pub async fn remove_worktree(main_repo: String, name: String) -> Result<(), String> {
    // First, find the worktree path
    let worktrees = list_worktrees(main_repo.clone()).await?;
    let worktree = worktrees.iter()
        .find(|wt| wt.name == name)
        .ok_or_else(|| format!("Worktree '{}' not found", name))?;

    // Remove the worktree
    let output = Command::new("git")
        .args(["worktree", "remove", &worktree.path])
        .current_dir(&main_repo)
        .output()
        .map_err(|e| format!("Failed to remove worktree: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Git command failed: {}", stderr));
    }

    Ok(())
}
