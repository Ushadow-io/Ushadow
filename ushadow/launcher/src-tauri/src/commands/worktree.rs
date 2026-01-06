use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use crate::models::WorktreeInfo;

/// Named colors for VS Code themes
fn get_named_colors() -> HashMap<&'static str, (&'static str, &'static str)> {
    let mut colors = HashMap::new();
    // (primary, dark)
    colors.insert("red", ("#c41e3a", "#731f2a"));
    colors.insert("blue", ("#0066cc", "#003366"));
    colors.insert("green", ("#2ea043", "#1f7a34"));
    colors.insert("yellow", ("#f0ad4e", "#c08a1e"));
    colors.insert("gold", ("#DAA520", "#8B6914"));
    colors.insert("orange", ("#ff6b35", "#cc5629"));
    colors.insert("purple", ("#8b3a8b", "#5c2a5c"));
    colors.insert("pink", ("#ff1493", "#c90a69"));
    colors.insert("cyan", ("#00bcd4", "#00838f"));
    colors.insert("teal", ("#009688", "#004d40"));
    colors.insert("lime", ("#76ff03", "#558b2f"));
    colors.insert("indigo", ("#3f51b5", "#283593"));
    colors.insert("coral", ("#ff7f50", "#cc6640"));
    colors.insert("navy", ("#000080", "#000050"));
    colors.insert("silver", ("#a8a8a8", "#6b6b6b"));
    colors.insert("crimson", ("#dc143c", "#b01030"));
    colors.insert("emerald", ("#50c878", "#40a060"));
    colors.insert("amber", ("#ffbf00", "#cc9900"));
    colors
}

/// Generate color from name hash
fn hash_to_color(name: &str) -> (String, String) {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut hasher = DefaultHasher::new();
    name.hash(&mut hasher);
    let hash = hasher.finish();

    let r = ((hash >> 16) & 0xFF) as u8;
    let g = ((hash >> 8) & 0xFF) as u8;
    let b = (hash & 0xFF) as u8;

    let primary = format!("#{:02x}{:02x}{:02x}", r, g, b);
    let dark = format!("#{:02x}{:02x}{:02x}",
        (r as f32 * 0.6) as u8,
        (g as f32 * 0.6) as u8,
        (b as f32 * 0.6) as u8
    );

    (primary, dark)
}

/// Get colors for an environment name
pub fn get_colors_for_name(name: &str) -> (String, String) {
    let colors = get_named_colors();
    let name_lower = name.to_lowercase();

    if let Some(&(primary, dark)) = colors.get(name_lower.as_str()) {
        (primary.to_string(), dark.to_string())
    } else {
        hash_to_color(name)
    }
}

/// List all git worktrees for the main repo
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
        } else if line == "bare" {
            current.insert("bare".to_string(), "true".to_string());
        }
    }

    // Don't forget the last entry
    if let Some(path) = current.get("worktree") {
        if !current.contains_key("bare") {
            let path_buf = PathBuf::from(path);
            let name = path_buf.file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();

            let branch = current.get("branch")
                .map(|b| b.replace("refs/heads/", ""))
                .unwrap_or_default();

            worktrees.push(WorktreeInfo {
                path: path.clone(),
                branch,
                name,
            });
        }
    }

    Ok(worktrees)
}

/// Create a new worktree with VS Code colors
#[tauri::command]
pub async fn create_worktree(
    main_repo: String,
    worktrees_dir: String,
    name: String,
    base_branch: Option<String>,
) -> Result<WorktreeInfo, String> {
    let base = base_branch.unwrap_or_else(|| "main".to_string());
    let worktree_path = PathBuf::from(&worktrees_dir).join(&name);
    let branch_name = format!("{}/{}", std::env::var("USER").unwrap_or_else(|_| "dev".to_string()), &name);

    // Create worktrees directory if needed
    fs::create_dir_all(&worktrees_dir)
        .map_err(|e| format!("Failed to create worktrees directory: {}", e))?;

    // Create the worktree
    let output = Command::new("git")
        .args([
            "worktree", "add",
            worktree_path.to_str().unwrap(),
            "-b", &branch_name,
            &base,
        ])
        .current_dir(&main_repo)
        .output()
        .map_err(|e| format!("Failed to create worktree: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Git worktree add failed: {}", stderr));
    }

    // Set up VS Code colors
    setup_vscode_colors(&worktree_path, &name)?;

    Ok(WorktreeInfo {
        path: worktree_path.to_string_lossy().to_string(),
        branch: branch_name,
        name,
    })
}

/// Set up VS Code colors for a directory
fn setup_vscode_colors(path: &Path, name: &str) -> Result<(), String> {
    let vscode_dir = path.join(".vscode");
    fs::create_dir_all(&vscode_dir)
        .map_err(|e| format!("Failed to create .vscode directory: {}", e))?;

    let settings_path = vscode_dir.join("settings.json");
    let (primary, dark) = get_colors_for_name(name);

    // Read existing settings if present
    let mut settings: serde_json::Value = if settings_path.exists() {
        let content = fs::read_to_string(&settings_path)
            .map_err(|e| format!("Failed to read settings.json: {}", e))?;
        serde_json::from_str(&content).unwrap_or(serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    // Update color customizations
    settings["workbench.colorCustomizations"] = serde_json::json!({
        "titleBar.activeBackground": primary,
        "titleBar.activeForeground": "#ffffff",
        "titleBar.inactiveBackground": dark,
        "titleBar.inactiveForeground": "#cccccc",
        "statusBar.background": primary,
        "statusBar.foreground": "#ffffff",
        "statusBar.noFolderBackground": primary,
        "activityBar.background": dark,
        "activityBar.foreground": "#ffffff",
        "activityBar.inactiveForeground": "#cccccc",
        "activityBar.activeBorder": primary,
    });

    // Write settings
    let content = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    fs::write(&settings_path, content)
        .map_err(|e| format!("Failed to write settings.json: {}", e))?;

    Ok(())
}

/// Open a worktree in VS Code
#[tauri::command]
pub async fn open_in_vscode(path: String) -> Result<(), String> {
    Command::new("code")
        .arg(&path)
        .spawn()
        .map_err(|e| format!("Failed to open VS Code: {}", e))?;

    Ok(())
}

/// Remove a worktree
#[tauri::command]
pub async fn remove_worktree(main_repo: String, path: String, force: bool) -> Result<(), String> {
    let mut args = vec!["worktree", "remove"];
    if force {
        args.push("--force");
    }
    args.push(&path);

    let output = Command::new("git")
        .args(&args)
        .current_dir(&main_repo)
        .output()
        .map_err(|e| format!("Failed to remove worktree: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Git worktree remove failed: {}", stderr));
    }

    Ok(())
}

/// Check if VS Code is installed
pub fn check_vscode() -> bool {
    Command::new("code")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Check if git is installed
pub fn check_git() -> bool {
    Command::new("git")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}
