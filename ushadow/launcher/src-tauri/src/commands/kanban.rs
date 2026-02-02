use crate::models::WorktreeInfo;
use super::worktree::{create_worktree_with_workmux, create_worktree};
use super::utils::shell_command;
use std::path::PathBuf;
use serde::{Deserialize, Serialize};

/// Request to create a ticket with worktree and tmux
#[derive(Debug, Deserialize)]
pub struct CreateTicketWorktreeRequest {
    pub ticket_id: String,
    pub ticket_title: String,
    pub project_root: String,
    pub branch_name: Option<String>, // If None, will be generated from ticket_id
    pub base_branch: Option<String>, // Default to "main"
    pub epic_branch: Option<String>, // If part of epic with shared branch
}

/// Result of creating a ticket worktree
#[derive(Debug, Serialize)]
pub struct CreateTicketWorktreeResult {
    pub worktree_path: String,
    pub branch_name: String,
    pub tmux_window_name: String,
    pub tmux_session_name: String,
}

/// Create a worktree and tmux window for a kanban ticket
///
/// This command handles two scenarios:
/// 1. Ticket has its own branch (epic_branch is None)
/// 2. Ticket shares a branch with epic (epic_branch is Some)
#[tauri::command]
pub async fn create_ticket_worktree(
    request: CreateTicketWorktreeRequest,
) -> Result<CreateTicketWorktreeResult, String> {
    eprintln!("[create_ticket_worktree] Creating worktree for ticket: {}", request.ticket_title);

    // Determine branch to use
    let branch_name = if let Some(epic_branch) = request.epic_branch {
        // Use epic's shared branch
        eprintln!("[create_ticket_worktree] Using epic's shared branch: {}", epic_branch);
        epic_branch
    } else if let Some(branch_name) = request.branch_name {
        // Use provided branch name
        branch_name
    } else {
        // Generate branch name from ticket ID
        format!("ticket-{}", request.ticket_id)
    };

    let base_branch = request.base_branch.unwrap_or_else(|| "main".to_string());

    // Create worktree with tmux integration
    // The worktree name will be the branch name
    let worktree_info = create_worktree_with_workmux(
        request.project_root.clone(),
        branch_name.clone(),
        Some(base_branch),
        Some(false), // Not background
    ).await?;

    // Tmux window naming: "ushadow-{branch_name}" or "ushadow-ticket-{id}"
    let tmux_window_name = format!("ushadow-{}", branch_name);
    let tmux_session_name = "workmux".to_string(); // Default session

    eprintln!("[create_ticket_worktree] ✓ Worktree created at: {}", worktree_info.path);
    eprintln!("[create_ticket_worktree] ✓ Tmux window: {}", tmux_window_name);

    Ok(CreateTicketWorktreeResult {
        worktree_path: worktree_info.path,
        branch_name,
        tmux_window_name,
        tmux_session_name,
    })
}

/// Attach an existing ticket to an existing worktree (for epic-shared branches)
#[tauri::command]
pub async fn attach_ticket_to_worktree(
    ticket_id: String,
    worktree_path: String,
    branch_name: String,
) -> Result<CreateTicketWorktreeResult, String> {
    eprintln!("[attach_ticket_to_worktree] Attaching ticket {} to existing worktree: {}", ticket_id, worktree_path);

    // Verify worktree exists
    let path_buf = PathBuf::from(&worktree_path);
    if !path_buf.exists() {
        return Err(format!("Worktree path does not exist: {}", worktree_path));
    }

    // The tmux window should already exist for this branch
    let tmux_window_name = format!("ushadow-{}", branch_name);
    let tmux_session_name = "workmux".to_string();

    // Verify tmux window exists
    let check_window = shell_command(&format!(
        "tmux list-windows -t {} -F '#W'",
        tmux_session_name
    ))
    .output();

    let window_exists = match check_window {
        Ok(output) if output.status.success() => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            stdout.lines().any(|line| line == tmux_window_name)
        }
        _ => false,
    };

    if !window_exists {
        return Err(format!(
            "Tmux window '{}' does not exist. Expected window for shared branch.",
            tmux_window_name
        ));
    }

    eprintln!("[attach_ticket_to_worktree] ✓ Ticket attached to worktree and tmux window");

    Ok(CreateTicketWorktreeResult {
        worktree_path,
        branch_name,
        tmux_window_name,
        tmux_session_name,
    })
}

/// List all tickets associated with a specific tmux window
/// Returns ticket IDs that are using this tmux window
#[tauri::command]
pub async fn get_tickets_for_tmux_window(
    window_name: String,
) -> Result<Vec<String>, String> {
    // This will need to query the backend API
    // For now, return empty list as placeholder
    eprintln!("[get_tickets_for_tmux_window] Getting tickets for window: {}", window_name);
    Ok(vec![])
}

/// Get tmux window information for a ticket
#[tauri::command]
pub async fn get_ticket_tmux_info(
    ticket_id: String,
) -> Result<Option<CreateTicketWorktreeResult>, String> {
    // This will need to query the backend API to get ticket's tmux details
    // For now, return None as placeholder
    eprintln!("[get_ticket_tmux_info] Getting tmux info for ticket: {}", ticket_id);
    Ok(None)
}
