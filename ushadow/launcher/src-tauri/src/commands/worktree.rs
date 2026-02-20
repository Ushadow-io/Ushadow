use crate::models::{WorktreeInfo, TmuxSessionInfo, TmuxWindowInfo, ClaudeStatus, EnvironmentConflict};
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Command;
use super::utils::{shell_command, silent_command};

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

    // Special case: default "ushadow" environment uses purple
    if name_lower == "ushadow" {
        return ("purple".to_string(), "purple".to_string());
    }

    for color in &color_names {
        if name_lower.contains(color) {
            return (color.to_string(), color.to_string());
        }
    }

    // Return the environment name itself so frontend can hash it
    (name.to_string(), name.to_string())
}

/// Delete a git branch (best effort - won't fail if branch doesn't exist)
fn delete_branch(main_repo: &str, branch_name: &str) {
    eprintln!("[delete_branch] Attempting to delete branch '{}'", branch_name);

    // Try to delete the branch with -D (force delete)
    let output = silent_command("git")
        .args(["branch", "-D", branch_name])
        .current_dir(main_repo)
        .output();

    match output {
        Ok(result) if result.status.success() => {
            eprintln!("[delete_branch] ✓ Successfully deleted branch '{}'", branch_name);
        }
        Ok(result) => {
            let stderr = String::from_utf8_lossy(&result.stderr);
            // Don't error if branch doesn't exist
            if !stderr.contains("not found") && !stderr.contains("does not exist") {
                eprintln!("[delete_branch] Warning: Failed to delete branch '{}': {}", branch_name, stderr);
            } else {
                eprintln!("[delete_branch] Branch '{}' already deleted or doesn't exist", branch_name);
            }
        }
        Err(e) => {
            eprintln!("[delete_branch] Warning: Failed to run git branch -D: {}", e);
        }
    }
}

/// Check if a worktree exists for a given branch
#[tauri::command]
pub async fn check_worktree_exists(main_repo: String, branch: String) -> Result<Option<WorktreeInfo>, String> {
    let branch = branch.to_lowercase();

    let output = silent_command("git")
        .args(["worktree", "list", "--porcelain"])
        .current_dir(&main_repo)
        .output()
        .map_err(|e| format!("Failed to list worktrees: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Git command failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut current: HashMap<String, String> = HashMap::new();

    for line in stdout.lines() {
        if line.is_empty() {
            if let Some(path) = current.get("worktree") {
                let current_branch = current.get("branch")
                    .map(|b| b.replace("refs/heads/", "").to_lowercase())
                    .unwrap_or_default();

                // Check if this worktree has the branch we're looking for
                if current_branch == branch && !current.contains_key("bare") {
                    let path_buf = PathBuf::from(path);
                    let name = path_buf.file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default();

                    return Ok(Some(WorktreeInfo {
                        path: path.clone(),
                        branch: current_branch,
                        name,
                    }));
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
        let current_branch = current.get("branch")
            .map(|b| b.replace("refs/heads/", "").to_lowercase())
            .unwrap_or_default();

        if current_branch == branch && !current.contains_key("bare") {
            let path_buf = PathBuf::from(path);
            let name = path_buf.file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();

            return Ok(Some(WorktreeInfo {
                path: path.clone(),
                branch: current_branch,
                name,
            }));
        }
    }

    Ok(None)
}

/// Check if an environment with this name already exists and return conflict info
#[tauri::command]
pub async fn check_environment_conflict(
    main_repo: String,
    env_name: String,
) -> Result<Option<EnvironmentConflict>, String> {
    let env_name = env_name.to_lowercase();

    // Check if a worktree with this name exists
    let worktrees = list_worktrees(main_repo.clone()).await?;

    if let Some(worktree) = worktrees.iter().find(|wt| wt.name == env_name) {
        // Worktree exists - return conflict info
        // Note: is_running will be set to false here, but the frontend can check
        // the actual running status from its discovery data
        return Ok(Some(EnvironmentConflict {
            name: env_name,
            current_branch: worktree.branch.clone(),
            path: worktree.path.clone(),
            is_running: false,  // Frontend will populate this from discovery
        }));
    }

    Ok(None)
}

/// List all git worktrees in a repository
#[tauri::command]
pub async fn list_worktrees(main_repo: String) -> Result<Vec<WorktreeInfo>, String> {
    let output = silent_command("git")
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

/// List all git branches in a repository
#[tauri::command]
pub async fn list_git_branches(main_repo: String) -> Result<Vec<String>, String> {
    let output = silent_command("git")
        .args(["branch", "-a", "--format=%(refname:short)"])
        .current_dir(&main_repo)
        .output()
        .map_err(|e| format!("Failed to list branches: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Git command failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let branches: Vec<String> = stdout
        .lines()
        .map(|line| {
            // Remove "origin/" prefix from remote branches
            line.trim()
                .strip_prefix("origin/")
                .unwrap_or(line.trim())
                .to_string()
        })
        .filter(|b| !b.is_empty() && b != "HEAD" && !b.contains("->"))
        .collect();

    // Deduplicate branches (local and remote may have same name)
    let mut unique_branches: Vec<String> = branches.into_iter().collect();
    unique_branches.sort();
    unique_branches.dedup();

    Ok(unique_branches)
}

/// Create a new git worktree
#[tauri::command]
pub async fn create_worktree(
    main_repo: String,
    worktrees_dir: String,
    name: String,
    branch_name: Option<String>,
    base_branch: Option<String>,
) -> Result<WorktreeInfo, String> {
    // Force lowercase to avoid Docker Compose naming issues
    let name = name.to_lowercase();

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

    // Determine the desired branch name (also lowercase)
    let desired_branch = branch_name.map(|b| b.to_lowercase()).unwrap_or_else(|| name.clone());

    // Check if git has this worktree registered or if the branch is in use
    let list_output = silent_command("git")
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
            let current_worktree_path = path.to_string();
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
        let remove_output = silent_command("git")
            .args(["worktree", "remove", "--force", &path_to_remove])
            .current_dir(&main_repo)
            .output()
            .map_err(|e| format!("Failed to remove worktree: {}", e))?;

        if remove_output.status.success() {
            eprintln!("[create_worktree] Successfully removed worktree from git tracking");
        } else {
            // If remove fails, try prune + manual directory removal
            eprintln!("[create_worktree] git worktree remove failed, trying prune + manual cleanup");

            let prune_output = silent_command("git")
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
    let check_output = silent_command("git")
        .args(["rev-parse", "--verify", &format!("refs/heads/{}", desired_branch)])
        .current_dir(&main_repo)
        .output()
        .map_err(|e| format!("Failed to check branch: {}", e))?;

    let branch_exists = check_output.status.success();

    // Check for branch naming conflicts (e.g., can't create test/foo if test exists, or vice versa)
    if !branch_exists {
        // Check if any part of the branch path conflicts with existing branches
        let all_branches_output = silent_command("git")
            .args(["for-each-ref", "--format=%(refname:short)", "refs/heads/"])
            .current_dir(&main_repo)
            .output()
            .map_err(|e| format!("Failed to list branches: {}", e))?;

        let all_branches = String::from_utf8_lossy(&all_branches_output.stdout);

        for existing_branch in all_branches.lines() {
            // Check if desired_branch would conflict with existing_branch
            // Conflict cases:
            // 1. Want to create "test/foo" but "test" exists
            // 2. Want to create "test" but "test/foo" exists
            if desired_branch.starts_with(&format!("{}/", existing_branch)) {
                return Err(format!(
                    "Cannot create branch '{}' because branch '{}' already exists. Git doesn't allow 'foo' and 'foo/bar' to both exist as branches.",
                    desired_branch, existing_branch
                ));
            }
            if existing_branch.starts_with(&format!("{}/", desired_branch)) {
                return Err(format!(
                    "Cannot create branch '{}' because branch '{}' already exists. Git doesn't allow 'foo' and 'foo/bar' to both exist as branches.",
                    desired_branch, existing_branch
                ));
            }
        }
    }

    // Before creating, clean up any locked/missing worktrees at this path
    eprintln!("[create_worktree] Checking for locked/missing worktrees...");
    let _ = silent_command("git")
        .args(["worktree", "unlock", worktree_path.to_str().unwrap()])
        .current_dir(&main_repo)
        .output();
    let _ = silent_command("git")
        .args(["worktree", "prune"])
        .current_dir(&main_repo)
        .output();

    let (output, final_branch) = if branch_exists {
        // Branch exists - checkout directly into worktree
        let output = silent_command("git")
            .args(["worktree", "add", worktree_path.to_str().unwrap(), &desired_branch])
            .current_dir(&main_repo)
            .output()
            .map_err(|e| format!("Failed to create worktree: {}", e))?;
        (output, desired_branch)
    } else {
        // Branch doesn't exist - create new branch from base branch
        let new_branch_name = desired_branch.clone();

        // Determine base branch to use
        // Priority: 1) Provided base_branch parameter, 2) Derive from suffix, 3) Default to origin/main
        let base = if let Some(ref provided_base) = base_branch {
            // Use provided base branch - could be origin/main, origin/dev, or another branch like rouge/feature-dev
            if provided_base.contains('/') {
                // Already has a prefix (e.g., "origin/dev" or "rouge/feature-dev")
                provided_base.clone()
            } else {
                // Check if branch exists locally first
                let local_check = silent_command("git")
                    .args(["rev-parse", "--verify", provided_base])
                    .current_dir(&main_repo)
                    .output()
                    .ok()
                    .map(|o| o.status.success())
                    .unwrap_or(false);

                if local_check {
                    eprintln!("[create_worktree] Using local branch '{}'", provided_base);
                    provided_base.clone()  // Use local branch as-is
                } else {
                    eprintln!("[create_worktree] Local branch '{}' not found, trying origin/{}", provided_base, provided_base);
                    format!("origin/{}", provided_base)  // Try remote
                }
            }
        } else if new_branch_name.ends_with("-dev") {
            "origin/dev".to_string()
        } else if new_branch_name.ends_with("-main") {
            "origin/main".to_string()
        } else {
            // Default to origin/main if no suffix
            "origin/main".to_string()
        };

        eprintln!("[create_worktree] Creating new branch '{}' from '{}'", new_branch_name, base);

        let output = silent_command("git")
            .args(["worktree", "add", "-b", &new_branch_name, worktree_path.to_str().unwrap(), &base])
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
    open_in_vscode_impl(path, env_name, false).await
}

/// Open a path in VS Code and attach to tmux in integrated terminal
#[tauri::command]
pub async fn open_in_vscode_with_tmux(path: String, env_name: String) -> Result<(), String> {
    open_in_vscode_impl(path, Some(env_name), true).await
}

async fn open_in_vscode_impl(path: String, env_name: Option<String>, with_tmux: bool) -> Result<(), String> {
    use super::utils::shell_command;

    // If env_name is provided, set up VSCode colors using the Python utility
    if let Some(name) = &env_name {
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

    // Open VS Code (don't wait for it to finish)
    silent_command("code")
        .arg(&path)
        .spawn()
        .map_err(|e| format!("Failed to open VS Code: {}", e))?;

    // If with_tmux is true, create a shell script that VS Code can run
    if with_tmux && env_name.is_some() {
        let env_name_lower = env_name.unwrap().to_lowercase();
        // Sanitize env_name by replacing slashes (tmux doesn't allow slashes in window names)
        let sanitized_env_name = env_name_lower.replace('/', "-").replace('\\', "-");
        let window_name = format!("ushadow-{}", sanitized_env_name);

        eprintln!("[open_in_vscode] Creating tmux attach script for VS Code terminal");

        // Ensure tmux is running and window exists
        eprintln!("[open_in_vscode] Ensuring tmux is running...");
        match ensure_tmux_running().await {
            Ok(msg) => eprintln!("[open_in_vscode] {}", msg),
            Err(e) => {
                eprintln!("[open_in_vscode] ERROR: Failed to start tmux: {}", e);
                return Err(format!("Failed to start tmux: {}", e));
            }
        }

        // Check if window exists, create if not
        eprintln!("[open_in_vscode] Checking for tmux window '{}'...", window_name);
        let check_window = shell_command(&format!("tmux list-windows -a -F '#{{window_name}}' | grep '^{}'", window_name))
            .output();

        let window_exists = matches!(check_window, Ok(ref output) if output.status.success());

        // Create .tmux.conf BEFORE creating the window (so we can source it)
        let tmux_conf_path = format!("{}/.tmux.conf", path);
        let tmux_conf_content = "# User-friendly tmux configuration for Ushadow environments\n\
\n\
# Enable mouse support (scroll, select, resize panes)\n\
set -g mouse on\n\
\n\
# Increase scrollback buffer\n\
set -g history-limit 50000\n\
\n\
# Don't rename windows automatically\n\
set -g allow-rename off\n\
\n\
# Start window numbering at 1\n\
set -g base-index 1\n\
\n\
# Enable 256 colors\n\
set -g default-terminal \"screen-256color\"\n\
\n\
# Faster command sequences\n\
set -s escape-time 0\n\
\n\
# Status bar styling\n\
set -g status-style bg=default,fg=white\n\
set -g status-left-length 40\n\
set -g status-right \"#[fg=yellow]#S #[fg=white]%H:%M\"\n\
\n\
# Pane border colors\n\
set -g pane-border-style fg=colour238\n\
set -g pane-active-border-style fg=colour39\n\
\n\
# Fix mouse scrolling in terminal applications\n\
set -g terminal-overrides 'xterm*:smcup@:rmcup@'\n\
";

        std::fs::write(&tmux_conf_path, tmux_conf_content)
            .map_err(|e| format!("Failed to write .tmux.conf: {}", e))?;

        eprintln!("[open_in_vscode] Created user-friendly .tmux.conf");

        // Reload tmux config if session is already running
        let reload_config = shell_command(&format!(
            "tmux source-file '{}'",
            tmux_conf_path
        ))
            .output();

        if let Ok(output) = reload_config {
            if output.status.success() {
                eprintln!("[open_in_vscode] Reloaded tmux config for existing session");
            }
        }

        if !window_exists {
            eprintln!("[open_in_vscode] Creating tmux window '{}'...", window_name);
            // Create the window
            let create_window = shell_command(&format!(
                "cd '{}' && tmux -f .tmux.conf new-window -t workmux -n {} -c '{}'",
                path, window_name, path
            ))
                .output()
                .map_err(|e| format!("Failed to create tmux window: {}", e))?;

            if !create_window.status.success() {
                let stderr = String::from_utf8_lossy(&create_window.stderr);
                eprintln!("[open_in_vscode] ERROR: Failed to create tmux window: {}", stderr);
                return Err(format!("Failed to create tmux window: {}", stderr));
            } else {
                eprintln!("[open_in_vscode] ✓ Created tmux window '{}'", window_name);
            }
        } else {
            eprintln!("[open_in_vscode] ✓ Tmux window '{}' already exists", window_name);
        }

        // Create .vscode directory if it doesn't exist
        let vscode_dir = format!("{}/.vscode", path);
        std::fs::create_dir_all(&vscode_dir)
            .map_err(|e| format!("Failed to create .vscode directory: {}", e))?;

        // Create settings.json with tmux terminal profile
        let settings_path = format!("{}/settings.json", vscode_dir);

        // Read existing settings if any
        let mut settings: serde_json::Value = if let Ok(existing) = std::fs::read_to_string(&settings_path) {
            serde_json::from_str(&existing).unwrap_or(serde_json::json!({}))
        } else {
            serde_json::json!({})
        };

        // Add/update terminal profiles
        #[cfg(target_os = "macos")]
        {
            // Get user's shell from environment or default to zsh
            let user_shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());

            // Command that creates a NEW pane each time a new terminal is opened
            let tmux_command = format!(
                "tmux -f .tmux.conf has-session -t workmux:{} 2>/dev/null && \
                tmux -f .tmux.conf split-window -t workmux:{} || \
                tmux -f .tmux.conf attach-session -t workmux:{} || \
                exec $SHELL -l",
                window_name, window_name, window_name
            );

            settings["terminal.integrated.profiles.osx"] = serde_json::json!({
                "tmux": {
                    "path": user_shell,
                    "args": ["-l", "-c", tmux_command],
                    "icon": "terminal"
                }
            });
            settings["terminal.integrated.defaultProfile.osx"] = serde_json::json!("tmux");
        }

        #[cfg(target_os = "linux")]
        {
            let tmux_command = format!(
                "tmux -f .tmux.conf has-session -t workmux:{} 2>/dev/null && \
                tmux -f .tmux.conf split-window -t workmux:{} || \
                tmux -f .tmux.conf attach-session -t workmux:{} || \
                bash",
                window_name, window_name, window_name
            );

            settings["terminal.integrated.profiles.linux"] = serde_json::json!({
                "tmux": {
                    "path": "/bin/bash",
                    "args": ["-c", tmux_command],
                    "icon": "terminal"
                }
            });
            settings["terminal.integrated.defaultProfile.linux"] = serde_json::json!("tmux");
        }

        #[cfg(target_os = "windows")]
        {
            let tmux_command = format!(
                "tmux -f .tmux.conf has-session -t workmux:{} 2>/dev/null && \
                tmux -f .tmux.conf split-window -t workmux:{} || \
                tmux -f .tmux.conf attach-session -t workmux:{} || \
                bash",
                window_name, window_name, window_name
            );

            settings["terminal.integrated.profiles.windows"] = serde_json::json!({
                "tmux": {
                    "path": "bash.exe",
                    "args": ["-c", tmux_command],
                    "icon": "terminal"
                }
            });
            settings["terminal.integrated.defaultProfile.windows"] = serde_json::json!("tmux");
        }

        // Write back settings
        let settings_content = serde_json::to_string_pretty(&settings)
            .map_err(|e| format!("Failed to serialize settings: {}", e))?;

        std::fs::write(&settings_path, settings_content)
            .map_err(|e| format!("Failed to write settings.json: {}", e))?;

        eprintln!("[open_in_vscode] Configured VS Code to use tmux terminal by default");
        eprintln!("[open_in_vscode] Open a terminal in VS Code with Cmd+Shift+` to connect to tmux");

        // Note: We don't auto-open the terminal with AppleScript because it can
        // cause focus issues when multiple VS Code windows are open.
        // VS Code is already configured to use tmux, so users can manually open
        // the terminal with Cmd+Shift+` (or Ctrl+Shift+` on Linux/Windows)
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

    eprintln!("[remove_worktree] Removing worktree at: {}", worktree.path);

    // Store branch name for deletion after worktree removal
    let branch_name = worktree.branch.clone();

    // Try to remove the worktree
    let output = silent_command("git")
        .args(["worktree", "remove", &worktree.path])
        .current_dir(&main_repo)
        .output()
        .map_err(|e| format!("Failed to remove worktree: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);

        // If it contains modified/untracked files, use --force
        if stderr.contains("modified or untracked files") || stderr.contains("use --force") {
            eprintln!("[remove_worktree] Worktree has uncommitted changes, forcing removal...");

            let force_output = silent_command("git")
                .args(["worktree", "remove", "--force", &worktree.path])
                .current_dir(&main_repo)
                .output()
                .map_err(|e| format!("Failed to force remove worktree: {}", e))?;

            if force_output.status.success() {
                eprintln!("[remove_worktree] ✓ Successfully force-removed worktree");
                // Delete the associated branch
                delete_branch(&main_repo, &branch_name);
                return Ok(());
            } else {
                let force_stderr = String::from_utf8_lossy(&force_output.stderr);
                return Err(format!("Failed to force remove worktree: {}", force_stderr));
            }
        }

        // If it's locked or missing, try to unlock and prune
        if stderr.contains("locked") || stderr.contains("missing") {
            eprintln!("[remove_worktree] Worktree is locked/missing, attempting to unlock and prune...");

            // Try to unlock
            let _ = silent_command("git")
                .args(["worktree", "unlock", &worktree.path])
                .current_dir(&main_repo)
                .output();

            // Try to prune
            let prune_output = silent_command("git")
                .args(["worktree", "prune"])
                .current_dir(&main_repo)
                .output()
                .map_err(|e| format!("Failed to prune worktrees: {}", e))?;

            if prune_output.status.success() {
                eprintln!("[remove_worktree] ✓ Successfully pruned locked/missing worktree");
                // Delete the associated branch
                delete_branch(&main_repo, &branch_name);
                return Ok(());
            } else {
                let prune_stderr = String::from_utf8_lossy(&prune_output.stderr);
                return Err(format!("Failed to prune worktree: {}", prune_stderr));
            }
        }

        return Err(format!("Git command failed: {}", stderr));
    }

    eprintln!("[remove_worktree] ✓ Worktree removed successfully");

    // Delete the associated branch
    delete_branch(&main_repo, &branch_name);

    Ok(())
}

/// Delete an environment completely - stop containers, remove worktree, close tmux
#[tauri::command]
pub async fn delete_environment(main_repo: String, env_name: String) -> Result<String, String> {
    let env_name = env_name.to_lowercase();
    eprintln!("[delete_environment] Deleting environment '{}'", env_name);

    let mut messages = Vec::new();

    // Step 1: Stop containers (best effort - don't fail if they're already stopped)
    eprintln!("[delete_environment] Stopping containers for '{}'...", env_name);

    // Use correct compose project name (matches run.py logic)
    let compose_project_name = if env_name == "ushadow" {
        "ushadow".to_string()
    } else {
        format!("ushadow-{}", env_name)
    };

    let stop_result = shell_command(&format!("docker compose -p {} down", compose_project_name))
        .output();

    match stop_result {
        Ok(output) if output.status.success() => {
            messages.push(format!("✓ Stopped containers for '{}'", env_name));
        }
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr);
            if !stderr.contains("No such file") && !stderr.to_lowercase().contains("not found") {
                eprintln!("[delete_environment] Warning: Failed to stop containers: {}", stderr);
                messages.push(format!("⚠ Could not stop containers (may already be stopped)"));
            }
        }
        Err(e) => {
            eprintln!("[delete_environment] Warning: Failed to run docker compose down: {}", e);
            messages.push(format!("⚠ Could not stop containers (may already be stopped)"));
        }
    }

    // Step 2: Close tmux window if it exists
    // Sanitize env_name by replacing slashes (tmux doesn't allow slashes in window names)
    let sanitized_env_name = env_name.replace('/', "-").replace('\\', "-");
    let window_name = format!("ushadow-{}", sanitized_env_name);
    eprintln!("[delete_environment] Closing tmux window '{}'...", window_name);
    let close_result = shell_command(&format!("tmux kill-window -t {}", window_name))
        .output();

    match close_result {
        Ok(output) if output.status.success() => {
            messages.push(format!("✓ Closed tmux window '{}'", window_name));
        }
        Ok(_) | Err(_) => {
            // Tmux window might not exist, that's fine
            eprintln!("[delete_environment] No tmux window found for '{}'", window_name);
        }
    }

    // Step 3: Remove the worktree (if it exists)
    eprintln!("[delete_environment] Checking if worktree '{}' exists...", env_name);
    match check_worktree_exists(main_repo.clone(), env_name.clone()).await {
        Ok(Some(_)) => {
            // Worktree exists, remove it
            eprintln!("[delete_environment] Removing worktree '{}'...", env_name);
            match remove_worktree(main_repo, env_name.clone()).await {
                Ok(_) => {
                    messages.push(format!("✓ Removed worktree '{}'", env_name));
                }
                Err(e) => {
                    return Err(format!("Failed to remove worktree: {}", e));
                }
            }
        }
        Ok(None) => {
            // Worktree doesn't exist, skip removal
            eprintln!("[delete_environment] No worktree found for '{}', skipping removal", env_name);
            messages.push(format!("• No worktree to remove for '{}'", env_name));
        }
        Err(e) => {
            // Error checking worktree, log but don't fail
            eprintln!("[delete_environment] Warning: Could not check worktree existence: {}", e);
            messages.push(format!("⚠ Could not check for worktree"));
        }
    }

    Ok(messages.join("\n"))
}

/// Create a worktree using workmux (includes tmux integration)
/// Falls back to regular git worktree if tmux is not available
#[tauri::command]
pub async fn create_worktree_with_workmux(
    main_repo: String,
    name: String,
    branch_name: Option<String>,
    base_branch: Option<String>,
    _background: Option<bool>,
    custom_window_name: Option<String>,
) -> Result<WorktreeInfo, String> {
    // Force lowercase to avoid Docker Compose naming issues
    let name = name.to_lowercase();
    let branch_name = branch_name.map(|b| b.to_lowercase());
    let base_branch = base_branch.map(|b| b.to_lowercase());

    eprintln!("[create_worktree_with_workmux] Creating worktree '{}' with branch '{:?}' from base '{:?}'", name, branch_name, base_branch);

    // Hybrid approach: Create worktree manually for custom control, then register with workmux
    // Manual creation ensures: custom directory naming, ticket-based window names, lowercase enforcement
    // Workmux registration adds: dashboard visibility, lifecycle tracking
    let main_repo_path = PathBuf::from(&main_repo);

    // Calculate worktrees directory: ../worktrees (sibling to project root)
    let worktrees_dir = main_repo_path.parent()
        .ok_or("Could not determine parent directory")?
        .join("worktrees")
        .to_string_lossy()
        .to_string();

    eprintln!("[create_worktree_with_workmux] Worktrees directory: {}", worktrees_dir);

    // Create the worktree directly
    let worktree = create_worktree(main_repo.clone(), worktrees_dir, name.clone(), branch_name, base_branch).await?;

    eprintln!("[create_worktree_with_workmux] Worktree created at: {}", worktree.path);

    // Now attach tmux to the worktree
    // Ensure tmux is running
    let tmux_check = shell_command("tmux list-sessions")
        .output();

    let tmux_available = matches!(tmux_check, Ok(output) if output.status.success());

    if !tmux_available {
        eprintln!("[create_worktree_with_workmux] tmux not running, attempting to start a new session");
        let _start_tmux = shell_command("tmux new-session -d -s workmux")
            .output();
    }

    // Create tmux window for the worktree
    // Use custom window name if provided, otherwise generate from name
    let window_name = if let Some(custom_name) = custom_window_name {
        custom_name
    } else {
        // Sanitize name by replacing slashes and other special chars with dashes (tmux doesn't allow slashes in window names)
        let sanitized_name = name.replace('/', "-").replace('\\', "-");
        format!("ushadow-{}", sanitized_name)
    };
    let create_window = shell_command(&format!(
        "tmux new-window -t workmux -n {} -c '{}'",
        window_name, worktree.path
    ))
        .output();

    match create_window {
        Ok(output) if output.status.success() => {
            eprintln!("[create_worktree_with_workmux] Created tmux window '{}'", window_name);
        }
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr);
            eprintln!("[create_worktree_with_workmux] Warning: Failed to create tmux window: {}", stderr);
            // Don't fail the whole operation if tmux fails
        }
        Err(e) => {
            eprintln!("[create_worktree_with_workmux] Warning: Failed to create tmux window: {}", e);
            // Don't fail the whole operation if tmux fails
        }
    }

    // Note: We intentionally do NOT call `workmux open` here.
    // `workmux open <name>` creates a window named `ushadow-{name}` (e.g. `ushadow-beige`),
    // which would duplicate the ticket-specific window already created above (e.g.
    // `ushadow-beige-act-dashboard-dev-ush-6`). The ticket window is the source of truth;
    // workmux registration happens lazily when the user opens the terminal.

    Ok(worktree)
}

/// Merge a worktree branch and clean up using workmux
#[tauri::command]
pub async fn merge_worktree_with_rebase(
    main_repo: String,
    name: String,
    use_rebase: bool,
    keep_worktree: bool,
) -> Result<String, String> {
    // Force lowercase to match worktree naming
    let name = name.to_lowercase();

    eprintln!("[merge_worktree_with_rebase] Merging worktree '{}' (rebase: {}, keep: {})", name, use_rebase, keep_worktree);

    // Build workmux merge command
    let mut cmd_parts = vec!["workmux", "merge"];

    if use_rebase {
        cmd_parts.push("--rebase");
    }

    if keep_worktree {
        cmd_parts.push("--keep");
    }

    cmd_parts.push(&name);

    let workmux_cmd = cmd_parts.join(" ");
    eprintln!("[merge_worktree_with_rebase] Running: {}", workmux_cmd);

    // Execute workmux merge
    let output = shell_command(&workmux_cmd)
        .current_dir(&main_repo)
        .output()
        .map_err(|e| format!("Failed to run workmux merge: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        return Err(format!("Workmux merge failed:\nstdout: {}\nstderr: {}", stdout, stderr));
    }

    Ok(format!("Merged and cleaned up worktree '{}'\n{}", name, stdout))
}

/// List active tmux sessions to monitor agent status
#[tauri::command]
pub async fn list_tmux_sessions() -> Result<Vec<String>, String> {
    let output = shell_command("tmux list-sessions -F '#{session_name}'")
        .output()
        .map_err(|e| format!("Failed to list tmux sessions: {}", e))?;

    if !output.status.success() {
        // tmux returns error if no sessions exist - this is ok
        return Ok(Vec::new());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let sessions: Vec<String> = stdout
        .lines()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();

    Ok(sessions)
}

/// Get tmux window status for a specific worktree
#[tauri::command]
pub async fn get_tmux_window_status(window_name: String) -> Result<Option<String>, String> {
    // Check if window exists and get its status
    let output = shell_command(&format!("tmux list-windows -a -F '#{{window_name}} #{{pane_current_command}}' | grep '^{}'", window_name))
        .output()
        .map_err(|e| format!("Failed to check tmux window: {}", e))?;

    if !output.status.success() {
        return Ok(None); // Window doesn't exist
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let status = stdout.trim().to_string();

    Ok(Some(status))
}

/// Ensure tmux server is running and workmux session exists
#[tauri::command]
pub async fn ensure_tmux_running() -> Result<String, String> {
    // Check if tmux is running
    let tmux_check = shell_command("tmux list-sessions")
        .output();

    if matches!(tmux_check, Ok(ref output) if output.status.success()) {
        return Ok("Tmux server already running".to_string());
    }

    eprintln!("[ensure_tmux_running] Starting tmux server with workmux session");

    // Start a new detached tmux session
    let start_tmux = shell_command("tmux new-session -d -s workmux")
        .output()
        .map_err(|e| format!("Failed to start tmux: {}", e))?;

    if !start_tmux.status.success() {
        let stderr = String::from_utf8_lossy(&start_tmux.stderr);
        return Err(format!("Failed to start tmux: {}", stderr));
    }

    Ok("Tmux server started with session 'workmux'".to_string())
}

/// Get all tmux sessions and windows info (legacy string format)
#[tauri::command]
pub async fn get_tmux_info() -> Result<String, String> {
    // Check if tmux is running
    let sessions_output = shell_command("tmux list-sessions")
        .output();

    if !matches!(sessions_output, Ok(ref output) if output.status.success()) {
        return Ok("No tmux server running\n\nClick 'Start Tmux Server' to create a tmux session.".to_string());
    }

    let mut info = String::new();

    // Get sessions
    info.push_str("=== Tmux Sessions ===\n");
    if let Ok(output) = sessions_output {
        let stdout = String::from_utf8_lossy(&output.stdout);
        info.push_str(&stdout);
    }

    info.push_str("\n=== Tmux Windows ===\n");

    // Get windows with details
    let windows_output = shell_command("tmux list-windows -a -F '#{session_name}:#{window_index}:#{window_name} - #{pane_current_command}'")
        .output()
        .map_err(|e| format!("Failed to list tmux windows: {}", e))?;

    if windows_output.status.success() {
        let stdout = String::from_utf8_lossy(&windows_output.stdout);
        info.push_str(&stdout);
    } else {
        info.push_str("No windows found\n");
    }

    Ok(info)
}

/// Attach or create a tmux window for an existing worktree
#[tauri::command]
pub async fn attach_tmux_to_worktree(
    worktree_path: String,
    env_name: String,
    window_name_override: Option<String>
) -> Result<String, String> {
    eprintln!("[attach_tmux_to_worktree] Attaching to worktree at: {}", worktree_path);

    // Extract worktree name from path for workmux
    let worktree_name = std::path::Path::new(&worktree_path)
        .file_name()
        .ok_or("Invalid worktree path")?
        .to_str()
        .ok_or("Path contains invalid UTF-8")?;

    eprintln!("[attach_tmux_to_worktree] Using workmux to open worktree: {}", worktree_name);

    // Use workmux open which handles everything:
    // - Creates workmux session if needed
    // - Creates window if needed
    // - Reuses window if exists
    // - Sets up working directory correctly
    // - Registers in dashboard
    let workmux_cmd = format!("cd '{}' && workmux open {}", worktree_path, worktree_name);

    let open_result = shell_command(&workmux_cmd).output();

    match open_result {
        Ok(output) if output.status.success() => {
            eprintln!("[attach_tmux_to_worktree] ✓ Workmux window opened/reused");
        }
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr);
            eprintln!("[attach_tmux_to_worktree] Workmux open warning: {}", stderr);
        }
        Err(e) => {
            return Err(format!("Failed to open workmux window: {}", e));
        }
    }

    // Workmux has created/opened the window, now just focus iTerm
    #[cfg(target_os = "macos")]
    {
        let focus_script = r#"tell application "iTerm" to activate"#;
        let _ = Command::new("osascript")
            .arg("-e")
            .arg(focus_script)
            .output();

        eprintln!("[attach_tmux_to_worktree] Focused iTerm");
    }

    #[cfg(not(target_os = "macos"))]
    {
        // For Linux, try to focus terminal
        let _ = Command::new("wmctrl")
            .arg("-a")
            .arg("tmux")
            .spawn();
    }

    Ok(format!("Attached to worktree at {}", worktree_path))
}

/// Get comprehensive tmux status for an environment
#[tauri::command]
pub async fn get_environment_tmux_status(env_name: String) -> Result<crate::models::TmuxStatus, String> {
    use crate::models::{TmuxStatus, TmuxActivityStatus};

    // Check if tmux is running
    let tmux_check = shell_command("tmux list-sessions")
        .output();

    if !matches!(tmux_check, Ok(output) if output.status.success()) {
        // tmux not running
        return Ok(TmuxStatus {
            exists: false,
            window_name: None,
            current_command: None,
            activity_status: TmuxActivityStatus::Unknown,
        });
    }

    // Workmux prefixes windows with "ushadow-"
    // Check if the env_name already has the prefix to avoid double-prefixing
    let window_name = if env_name.starts_with("ushadow-") {
        env_name.clone()
    } else {
        format!("ushadow-{}", env_name)
    };

    // Get window info: name, current command, and pane tty
    let output = shell_command(&format!(
        "tmux list-panes -a -F '#{{window_name}} #{{pane_current_command}} #{{pane_tty}}' | grep '^{}'",
        window_name
    ))
        .output()
        .map_err(|e| format!("Failed to check tmux window: {}", e))?;

    if !output.status.success() {
        // Window doesn't exist
        return Ok(TmuxStatus {
            exists: false,
            window_name: None,
            current_command: None,
            activity_status: TmuxActivityStatus::Unknown,
        });
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let parts: Vec<&str> = stdout.trim().split_whitespace().collect();

    if parts.len() < 2 {
        return Ok(TmuxStatus {
            exists: false,
            window_name: None,
            current_command: None,
            activity_status: TmuxActivityStatus::Unknown,
        });
    }

    let current_command = parts[1].to_string();

    // Determine activity status based on current command
    let activity_status = match current_command.as_str() {
        "bash" | "zsh" | "sh" | "fish" => TmuxActivityStatus::Waiting,
        "claude" | "vim" | "nvim" | "emacs" | "nano" => TmuxActivityStatus::Working,
        "python" | "node" | "npm" | "cargo" | "make" => TmuxActivityStatus::Working,
        _ => {
            // For other commands, check if they're long-running processes
            if current_command.starts_with("python") || current_command.starts_with("node") {
                TmuxActivityStatus::Working
            } else {
                TmuxActivityStatus::Unknown
            }
        }
    };

    Ok(TmuxStatus {
        exists: true,
        window_name: Some(window_name),
        current_command: Some(current_command),
        activity_status,
    })
}

/// Get all tmux sessions with their windows
#[tauri::command]
pub async fn get_tmux_sessions() -> Result<Vec<TmuxSessionInfo>, String> {
    // Check if tmux is running
    let check = shell_command("tmux list-sessions")
        .output()
        .map_err(|e| format!("Failed to check tmux: {}", e))?;

    if !check.status.success() {
        // No tmux server running
        return Ok(vec![]);
    }

    // Get session list
    let sessions_output = shell_command("tmux list-sessions -F '#{session_name}'")
        .output()
        .map_err(|e| format!("Failed to list sessions: {}", e))?;

    let session_names: Vec<String> = String::from_utf8_lossy(&sessions_output.stdout)
        .lines()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();

    let mut sessions = Vec::new();

    for session_name in session_names {
        // Get windows for this session
        let windows_output = shell_command(&format!(
            "tmux list-windows -t {} -F '#{{window_index}}|#{{window_name}}|#{{window_active}}|#{{window_panes}}'",
            session_name
        ))
            .output()
            .map_err(|e| format!("Failed to list windows: {}", e))?;

        let windows: Vec<TmuxWindowInfo> = String::from_utf8_lossy(&windows_output.stdout)
            .lines()
            .filter_map(|line| {
                let parts: Vec<&str> = line.split('|').collect();
                if parts.len() >= 4 {
                    Some(TmuxWindowInfo {
                        index: parts[0].to_string(),
                        name: parts[1].to_string(),
                        active: parts[2] == "1",
                        panes: parts[3].parse().unwrap_or(1),
                    })
                } else {
                    None
                }
            })
            .collect();

        sessions.push(TmuxSessionInfo {
            name: session_name,
            window_count: windows.len(),
            windows,
        });
    }

    Ok(sessions)
}

/// Kill a specific tmux window
#[tauri::command]
pub async fn kill_tmux_window(window_name: String) -> Result<String, String> {
    let output = shell_command(&format!("tmux kill-window -t {}", window_name))
        .output()
        .map_err(|e| format!("Failed to kill window: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to kill window '{}': {}", window_name, stderr));
    }

    Ok(format!("Killed tmux window '{}'", window_name))
}

/// Kill the entire tmux server (all sessions and windows)
#[tauri::command]
pub async fn kill_tmux_server() -> Result<String, String> {
    let output = shell_command("tmux kill-server")
        .output()
        .map_err(|e| format!("Failed to kill tmux server: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to kill tmux server: {}", stderr));
    }

    Ok("Killed tmux server".to_string())
}

/// Open a tmux window in iTerm2 (falls back to Terminal.app if not available)
#[tauri::command]
pub async fn open_tmux_in_terminal(
    window_name: String,
    worktree_path: String,
    environment_name: Option<String>,
) -> Result<String, String> {
    eprintln!("[open_tmux_in_terminal] Opening tmux window: {} at path: {}", window_name, worktree_path);
    if let Some(ref env) = environment_name {
        eprintln!("[open_tmux_in_terminal] Environment name: {}", env);
    }

    // STEP 1: Use workmux to ensure window exists (idempotent)
    // Extract worktree name from path (e.g., "gold" from "/Users/stu/repos/worktrees/ushadow/gold")
    let worktree_name = std::path::Path::new(&worktree_path)
        .file_name()
        .ok_or("Invalid worktree path")?
        .to_str()
        .ok_or("Path contains invalid UTF-8")?;

    // Ensure the specific named window exists in the workmux session.
    // We use direct tmux commands rather than `workmux open` to avoid creating a
    // second window with the workmux naming convention (ushadow-{worktree_name})
    // alongside the ticket-specific window (ushadow-{branch}-{ticket_id}).
    // Note: `tmux has-window` does not exist; use list-windows + grep instead.
    let window_exists = shell_command(&format!(
        "tmux list-windows -t workmux -F '#{{window_name}}' 2>/dev/null | grep -Fx '{}'",
        window_name
    ))
    .output()
    .map(|o| o.status.success() && !String::from_utf8_lossy(&o.stdout).trim().is_empty())
    .unwrap_or(false);

    if !window_exists {
        eprintln!("[open_tmux_in_terminal] Window '{}' not found, creating it", window_name);
        match shell_command(&format!(
            "tmux new-window -t workmux -n {} -c '{}'",
            window_name, worktree_path
        ))
        .output()
        {
            Ok(output) if output.status.success() => {
                eprintln!("[open_tmux_in_terminal] ✓ Created tmux window '{}'", window_name);
            }
            Ok(output) => {
                let stderr = String::from_utf8_lossy(&output.stderr);
                eprintln!("[open_tmux_in_terminal] Warning: Failed to create window: {}", stderr);
            }
            Err(e) => {
                eprintln!("[open_tmux_in_terminal] Warning: Failed to create window: {}", e);
            }
        }
    } else {
        eprintln!("[open_tmux_in_terminal] ✓ Window '{}' already exists", window_name);
    }

    // The window name passed in is the authoritative name (ticket-specific or env-specific).
    // We ensured it exists above, so use it directly.
    let actual_window_name = window_name.clone();

    // Pre-select the window in the tmux session. This makes `tmux attach-session -t workmux`
    // (without a window spec) land on the right window. It also handles the case where
    // multiple windows share a name — select-window picks the first match, and the attach
    // script doesn't need to resolve the ambiguity.
    let _ = shell_command(&format!(
        "tmux select-window -t workmux:{}",
        actual_window_name
    ))
    .output();
    eprintln!("[open_tmux_in_terminal] Selected window '{}'", actual_window_name);

    // Spawn agent start/resume in the background so it doesn't delay iTerm opening.
    // check_and_resume_agent sleeps for several seconds waiting for Claude to load,
    // so running it inline would make the button feel slow.
    {
        let window = actual_window_name.clone();
        let wpath = worktree_path.clone();
        tauri::async_runtime::spawn(async move {
            let _ = check_and_resume_agent("workmux", &window, &wpath).await;
        });
    }

    eprintln!("[open_tmux_in_terminal] Checking if window is already being viewed");

    // Check if any client is currently viewing this specific window
    // Use the format '#{client_session}:#{window_name}' to get accurate window info per client
    let check_clients = shell_command(&format!(
        "tmux list-clients -F '#{{client_session}}:#{{window_name}}' 2>/dev/null | grep -x 'workmux:{}'",
        actual_window_name
    ))
    .output();

    let has_clients = match &check_clients {
        Ok(output) if output.status.success() => {
            let clients = String::from_utf8_lossy(&output.stdout);
            eprintln!("[open_tmux_in_terminal] Clients viewing window: {}", clients.trim());
            true
        }
        _ => {
            eprintln!("[open_tmux_in_terminal] No clients viewing window");
            false
        }
    };

    if has_clients {
        eprintln!("[open_tmux_in_terminal] Window is already being viewed, checking if iTerm has visible windows");
        // Someone is already viewing this window, but check if iTerm actually has windows
        #[cfg(target_os = "macos")]
        {
            // Check if iTerm has any windows
            let count_windows = Command::new("osascript")
                .arg("-e")
                .arg(r#"tell application "iTerm" to count windows"#)
                .output();

            let has_iterm_windows = count_windows
                .ok()
                .and_then(|o| String::from_utf8(o.stdout).ok())
                .and_then(|s| s.trim().parse::<i32>().ok())
                .map(|count| count > 0)
                .unwrap_or(false);

            if !has_iterm_windows {
                eprintln!("[open_tmux_in_terminal] Tmux clients exist but no iTerm windows - creating new window");
                // Fall through to create a new window
            } else {
                eprintln!("[open_tmux_in_terminal] iTerm has windows, attempting to focus");
                // First, activate iTerm
                let focus_script = r#"tell application "iTerm" to activate"#;
                let _ = Command::new("osascript")
                    .arg("-e")
                    .arg(focus_script)
                    .output();

                // Give iTerm time to activate
                std::thread::sleep(std::time::Duration::from_millis(200));

                // Try to select the window that's attached to this tmux session
                let select_script = format!(
                    r#"tell application "iTerm"
    repeat with aWindow in windows
        try
            tell current session of aWindow
                if name contains "{}" then
                    select aWindow
                    return
                end if
            end tell
        end try
    end repeat
end tell"#,
                    actual_window_name
                );
                let _ = Command::new("osascript")
                    .arg("-e")
                    .arg(&select_script)
                    .output();

                return Ok(format!("Focused iTerm window for '{}'", actual_window_name));
            }
        }
        #[cfg(not(target_os = "macos"))]
        {
            return Ok(format!("Tmux window '{}' is already open", actual_window_name));
        }
    }

    eprintln!("[open_tmux_in_terminal] No clients viewing this window, will open new terminal");

    #[cfg(target_os = "macos")]
    {
        // Check if iTerm2 is installed and available
        let iterm_check = Command::new("osascript")
            .arg("-e")
            .arg("application \"iTerm\" is running")
            .output();

        let iterm_available = iterm_check
            .map(|o| o.status.success())
            .unwrap_or(false);

        if iterm_available {
            eprintln!("[open_tmux_in_terminal] Using iTerm2");

            // Use provided environment name for display and coloring
            // Fall back to extracting from window name if not provided
            let env_name = environment_name
                .as_deref()
                .unwrap_or_else(|| window_name.strip_prefix("ushadow-").unwrap_or(&window_name));
            let display_name = format!("Ushadow: {}", env_name);

            // Map env names to RGB colors (0-255)
            let (r, g, b) = match env_name {
                "gold" | "yellow" => (255, 215, 0),      // Gold/Yellow
                "green" => (0, 255, 0),                  // Green
                "red" => (255, 0, 0),                    // Red
                "purple" | "pink" => (255, 0, 255),      // Purple/Magenta
                "orange" => (255, 165, 0),               // Orange
                "blue" => (0, 0, 255),                   // Blue
                "cyan" => (0, 255, 255),                 // Cyan
                "brown" => (165, 42, 42),                // Brown
                _ => (128, 128, 128),                    // Gray for unknown
            };

            // Create temp script file with color sequences to avoid quote escaping hell
            use std::fs;
            let temp_script = format!("/tmp/ushadow_iterm_{}.sh", window_name.replace("/", "_"));

            let script_content = format!(
                "#!/bin/bash\nprintf '\\033]0;{}\\007\\033]6;1;bg;red;brightness;{}\\007\\033]6;1;bg;green;brightness;{}\\007\\033]6;1;bg;blue;brightness;{}\\007'\n# Attach to workmux session - window was pre-selected by the launcher\nexec tmux attach-session -t workmux\n",
                display_name,
                r, g, b,
            );
            fs::write(&temp_script, script_content)
                .map_err(|e| format!("Failed to write temp script: {}", e))?;

            shell_command(&format!("chmod +x {}", temp_script))
                .output()
                .map_err(|e| format!("Failed to chmod: {}", e))?;

            // iTerm2 AppleScript - simplified to just create a new window
            // The check above already ensures we don't create duplicates
            let applescript = format!(
                r#"tell application "iTerm"
    activate
    set newWindow to (create window with default profile)
    tell current session of newWindow
        set name to "{}"
        write text "{} && exit"
    end tell
end tell"#,
                display_name,
                temp_script
            );

            let output = Command::new("osascript")
                .arg("-e")
                .arg(&applescript)
                .output()
                .map_err(|e| format!("Failed to run iTerm2 AppleScript: {}", e))?;

            if output.status.success() {
                eprintln!("[open_tmux_in_terminal] iTerm2 success");
                return Ok(format!("Opened tmux window '{}' in iTerm2", actual_window_name));
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr);
                eprintln!("[open_tmux_in_terminal] iTerm2 failed: {}, falling back to Terminal.app", stderr);
            }
        } else {
            eprintln!("[open_tmux_in_terminal] iTerm2 not available, using Terminal.app");
        }

        // Fallback to Terminal.app (macOS default terminal)
        let env_name = environment_name
            .as_deref()
            .unwrap_or_else(|| actual_window_name.strip_prefix("ushadow-").unwrap_or(&actual_window_name));
        let display_name = format!("Ushadow: {}", env_name);

        // Create temp script for Terminal.app (simpler than iTerm2, no tab colors)
        use std::fs;
        let temp_script = format!("/tmp/ushadow_terminal_{}.sh", actual_window_name.replace("/", "_"));
        let script_content = format!(
            "#!/bin/bash\nprintf '\\033]0;{}\\007'\n# Attach to workmux session - window was pre-selected by the launcher\nexec tmux attach-session -t workmux\n",
            display_name
        );
        fs::write(&temp_script, script_content)
            .map_err(|e| format!("Failed to write temp script: {}", e))?;

        shell_command(&format!("chmod +x {}", temp_script))
            .output()
            .map_err(|e| format!("Failed to chmod: {}", e))?;

        let applescript = format!(
            r#"tell application "Terminal"
    activate
    do script "{}"
end tell"#,
            temp_script
        );

        let output = Command::new("osascript")
            .arg("-e")
            .arg(&applescript)
            .output()
            .map_err(|e| format!("Failed to run AppleScript: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Failed to open Terminal: {}", stderr));
        }

        eprintln!("[open_tmux_in_terminal] Terminal.app success");
        Ok(format!("Opened tmux window '{}' in Terminal.app", actual_window_name))
    }

    #[cfg(not(target_os = "macos"))]
    {
        // For Linux/Windows - create dedicated tmux session per environment
        // Try common terminal emulators in order of preference
        let _env_name = window_name.strip_prefix("ushadow-").unwrap_or(&window_name);

        // Create the tmux session if it doesn't exist
        let _ = shell_command(&format!(
            "tmux has-session -t {} 2>/dev/null || tmux new-session -d -s {} -c '{}'",
            window_name, window_name, worktree_path
        )).output();

        // Create tmux commands before the array to extend their lifetime
        let xfce_cmd = format!("tmux attach-session -t {}", window_name);
        let xterm_cmd = format!("tmux attach-session -t {}", window_name);

        // Try different terminal emulators
        let terminals = vec![
            ("gnome-terminal", vec!["--", "tmux", "attach-session", "-t", &window_name]),
            ("konsole", vec!["-e", "tmux", "attach-session", "-t", &window_name]),
            ("xfce4-terminal", vec!["-e", xfce_cmd.as_str()]),
            ("xterm", vec!["-e", xterm_cmd.as_str()]),
        ];

        for (terminal, args) in terminals {
            if let Ok(_) = Command::new(terminal).args(&args).spawn() {
                eprintln!("[open_tmux_in_terminal] Opened {} for session {}", terminal, window_name);
                return Ok(format!("Opened tmux session '{}' in {}", window_name, terminal));
            }
        }

        Err("No supported terminal emulator found. Please install gnome-terminal, konsole, xfce4-terminal, or xterm.".to_string())
    }
}

/// Check if Claude agent is running in a tmux window; start or resume it if not.
///
/// Always tries `claude --resume` first so the user gets their last conversation back.
/// If Claude starts fresh (no prior session), and there's a ticket for this worktree,
/// sends the ticket title + description as initial context.
pub async fn check_and_resume_agent(
    tmux_session_name: &str,
    tmux_window_name: &str,
    worktree_path: &str,
) -> Result<bool, String> {
    use super::kanban::get_ticket_by_worktree_path;

    eprintln!("[check_and_resume_agent] Checking agent status for window {}", tmux_window_name);

    // 1. Check the current foreground process in the pane — this is reliable because
    //    Claude's startup banner stays in the scrollback after it exits, so scanning
    //    pane text gives false positives.
    let current_command = shell_command(&format!(
        "tmux display-message -t {}:{} -p '#{{pane_current_command}}'",
        tmux_session_name, tmux_window_name
    ))
    .output()
    .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
    .unwrap_or_default();

    eprintln!("[check_and_resume_agent] Current pane command: '{}'", current_command);

    // Shells indicate Claude is not running; anything else (claude, node, python…) is.
    let is_shell = matches!(current_command.as_str(), "zsh" | "bash" | "sh" | "fish" | "");
    if !is_shell {
        eprintln!("[check_and_resume_agent] Agent already running ({}), no action needed", current_command);
        return Ok(false);
    }

    // 2. Check if Claude has prior session files for this worktree.
    //    If yes, resume — the user gets their conversation back.
    //    If no, start fresh and pass the ticket context as a CLI argument
    //    so there's no timing dependency or risk of text landing on the wrong prompt.
    let home_dir = std::env::var("HOME").unwrap_or_default();
    let encoded_path = worktree_path.replace('/', "-");
    let sessions_dir = format!("{}/.claude/projects/{}", home_dir, encoded_path);
    let has_sessions = std::fs::read_dir(&sessions_dir)
        .map(|entries| entries.filter_map(|e| e.ok()).any(|e| {
            e.path().extension().map(|x| x == "jsonl").unwrap_or(false)
        }))
        .unwrap_or(false);

    let claude_cmd = if has_sessions {
        eprintln!("[check_and_resume_agent] Session files found — resuming");
        "claude --resume --dangerously-skip-permissions".to_string()
    } else {
        // Fresh start: look up the ticket and embed context directly in the command.
        // claude "initial message" starts an interactive session pre-loaded with that message.
        let ticket = get_ticket_by_worktree_path(worktree_path);
        if let Some(ticket) = ticket {
            eprintln!("[check_and_resume_agent] No sessions — starting fresh with ticket context: {}", ticket.title);
            let prompt = format!(
                "You are working on the following ticket:\n\nTitle: {}\n\nDescription: {}\n\nPlease help implement this feature.",
                ticket.title,
                ticket.description.as_ref().unwrap_or(&"No description".to_string())
            );
            // Single-quote escape for the outer shell command
            let escaped = prompt.replace('\'', "'\\''");
            format!("claude --dangerously-skip-permissions '{}'", escaped)
        } else {
            eprintln!("[check_and_resume_agent] No sessions, no ticket — starting plain Claude");
            "claude --dangerously-skip-permissions".to_string()
        }
    };

    eprintln!("[check_and_resume_agent] Running: {}", claude_cmd);
    let result = shell_command(&format!(
        "tmux send-keys -t {}:{} '{}' Enter",
        tmux_session_name, tmux_window_name, claude_cmd
    ))
    .output();

    if let Err(e) = result {
        eprintln!("[check_and_resume_agent] Failed to start Claude: {}", e);
        return Ok(false);
    }

    Ok(true)
}

/// Capture the visible content of a tmux pane
#[tauri::command]
pub async fn capture_tmux_pane(window_name: String) -> Result<String, String> {
    // Capture the last 100 lines from the pane
    let output = shell_command(&format!(
        "tmux capture-pane -t {} -p -S -100",
        window_name
    ))
        .output()
        .map_err(|e| format!("Failed to capture pane: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to capture pane: {}", stderr));
    }

    let content = String::from_utf8_lossy(&output.stdout).to_string();
    Ok(content)
}

/// Get Claude Code status from a tmux window
#[tauri::command]
pub async fn get_claude_status(window_name: String) -> Result<ClaudeStatus, String> {
    // First check if the window exists
    let status = get_environment_tmux_status(window_name.clone()).await?;

    if !status.exists {
        return Ok(ClaudeStatus {
            is_running: false,
            current_task: None,
            last_output: None,
        });
    }

    // Always capture the pane content to check for Claude patterns
    // (Claude might be running inside a shell, so pane_current_command shows "zsh" not "claude")
    let pane_content = capture_tmux_pane(window_name).await?;

    // Check if the output contains Claude-specific patterns
    let is_claude_running = pane_content.contains("Claude Code")
        || pane_content.contains("claude-code")
        || pane_content.contains("╭─ You")
        || pane_content.contains("╭─ Claude")
        || pane_content.contains("╰─")
        || pane_content.contains("★ Insight")
        || pane_content.contains("antml:function_calls")
        || pane_content.contains("<invoke")
        || pane_content.contains("antml:thinking")
        || pane_content.contains("Tool use:")
        || pane_content.contains("Calling tool")
        || (pane_content.contains("function_calls") && pane_content.contains("invoke"))
        || (pane_content.contains("You:") && pane_content.contains("Claude:"))
        || pane_content.contains("Assistant:");

    if !is_claude_running {
        return Ok(ClaudeStatus {
            is_running: false,
            current_task: None,
            last_output: None,
        });
    }

    // Parse the output to find Claude's current task
    let current_task = parse_claude_task(&pane_content);

    // Get the last few lines as "last output"
    let lines: Vec<&str> = pane_content.lines().collect();
    let last_output = if lines.len() > 5 {
        lines[lines.len() - 5..].join("\n")
    } else {
        pane_content.clone()
    };

    Ok(ClaudeStatus {
        is_running: true,
        current_task,
        last_output: Some(last_output),
    })
}

/// Parse Claude Code output to extract current task
fn parse_claude_task(output: &str) -> Option<String> {
    // Look for common Claude Code patterns
    let lines: Vec<&str> = output.lines().collect();

    eprintln!("[parse_claude_task] Parsing {} lines of output", lines.len());

    // Print last few lines for debugging
    for line in lines.iter().rev().take(5) {
        eprintln!("[parse_claude_task] Recent line: {}", line);
    }

    // Look for the most recent non-empty, meaningful line
    for line in lines.iter().rev() {
        let trimmed = line.trim();

        // Skip empty lines, shell prompts, and very short lines
        if trimmed.is_empty()
            || trimmed.starts_with("$")
            || trimmed.starts_with("#")
            || trimmed.starts_with(">")
            || trimmed.contains("───")
            || trimmed.len() < 15 {
            continue;
        }

        // Look for Claude's action indicators
        if trimmed.contains("I'll")
            || trimmed.contains("I'm")
            || trimmed.contains("I am")
            || trimmed.contains("Let me")
            || trimmed.contains("I will") {
            if trimmed.len() < 200 {
                eprintln!("[parse_claude_task] Found action: {}", trimmed);
                return Some(trimmed.to_string());
            }
        }

        // Look for tool usage
        if (trimmed.contains("Using") || trimmed.contains("Running") || trimmed.contains("Calling"))
            && trimmed.len() < 150 {
            eprintln!("[parse_claude_task] Found tool usage: {}", trimmed);
            return Some(trimmed.to_string());
        }

        // Look for file operations (but skip generic commands)
        if (trimmed.contains("Reading") || trimmed.contains("Writing") || trimmed.contains("Editing"))
            && (trimmed.contains(".") || trimmed.contains("/"))
            && trimmed.len() < 150 {
            eprintln!("[parse_claude_task] Found file op: {}", trimmed);
            return Some(trimmed.to_string());
        }
    }

    // Look for "You:" prompt to show last user request
    for line in lines.iter().rev() {
        if line.trim().starts_with("You:") {
            let text = line.trim().strip_prefix("You:")?.trim();
            if !text.is_empty() && text.len() < 150 {
                eprintln!("[parse_claude_task] Found user prompt: {}", text);
                return Some(format!("💬 {}", text));
            }
        }
    }

    eprintln!("[parse_claude_task] No meaningful task found");
    None
}
