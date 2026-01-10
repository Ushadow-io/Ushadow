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
    let worktree_path = PathBuf::from(&worktrees_dir).join(&name);

    // Create new branch from base
    let branch_name = format!("{}/main", name);
    let base = base_branch.unwrap_or_else(|| "main".to_string());

    let output = Command::new("git")
        .args(["worktree", "add", "-b", &branch_name, worktree_path.to_str().unwrap(), &base])
        .current_dir(&main_repo)
        .output()
        .map_err(|e| format!("Failed to create worktree: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Git command failed: {}", stderr));
    }

    Ok(WorktreeInfo {
        path: worktree_path.to_string_lossy().to_string(),
        branch: branch_name,
        name,
    })
}

/// Open a path in VS Code
#[tauri::command]
pub async fn open_in_vscode(path: String) -> Result<(), String> {
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
