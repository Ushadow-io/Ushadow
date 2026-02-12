use crate::models::{Epic, Ticket, TicketPriority, TicketStatus};
use super::worktree::create_worktree_with_workmux;
use super::utils::shell_command;
use std::path::PathBuf;
use std::fs;
use serde::{Deserialize, Serialize};
use tauri::api::path::data_dir;

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

    // Create a unique window name for this ticket (include ticket ID to ensure uniqueness)
    let ticket_id_short = &request.ticket_id[request.ticket_id.len().saturating_sub(6)..]; // Last 6 chars
    let tmux_window_name = format!("ushadow-{}-{}", branch_name, ticket_id_short);
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
        eprintln!("[attach_ticket_to_worktree] ERROR: Worktree path does not exist: {}", worktree_path);
        return Err(format!("Worktree path does not exist: {}", worktree_path));
    }

    // Create a unique window name for this ticket (include ticket ID to ensure uniqueness)
    let ticket_id_short = &ticket_id[ticket_id.len().saturating_sub(6)..]; // Last 6 chars
    let tmux_window_name = format!("ushadow-{}-{}", branch_name, ticket_id_short);
    let tmux_session_name = "workmux".to_string();

    // Ensure tmux server is running
    shell_command("tmux start-server")
        .output()
        .map_err(|e| format!("Failed to start tmux server: {}", e))?;

    // Check if the workmux session exists
    let check_session = shell_command("tmux has-session -t workmux")
        .output();

    if check_session.is_err() || !check_session.unwrap().status.success() {
        eprintln!("[attach_ticket_to_worktree] Creating workmux session...");
        shell_command("tmux new-session -d -s workmux")
            .output()
            .map_err(|e| format!("Failed to create workmux session: {}", e))?;
    }

    // Check if tmux window exists
    let check_window = shell_command(&format!(
        "tmux list-windows -t {} -F '#W'",
        tmux_session_name
    ))
    .output()
    .map_err(|e| format!("Failed to check tmux windows: {}", e))?;

    let stdout = String::from_utf8_lossy(&check_window.stdout);
    let window_exists = stdout.lines().any(|line| line == tmux_window_name);

    if window_exists {
        eprintln!("[attach_ticket_to_worktree] ✓ Found existing tmux window: {}", tmux_window_name);
    } else {
        eprintln!("[attach_ticket_to_worktree] Creating tmux window: {}", tmux_window_name);

        // Create the tmux window
        let create_result = shell_command(&format!(
            "tmux new-window -t {} -n {} -c '{}'",
            tmux_session_name, tmux_window_name, worktree_path
        ))
        .output()
        .map_err(|e| format!("Failed to create tmux window: {}", e))?;

        if !create_result.status.success() {
            let stderr = String::from_utf8_lossy(&create_result.stderr);
            return Err(format!("Failed to create tmux window: {}", stderr));
        }

        eprintln!("[attach_ticket_to_worktree] ✓ Created tmux window: {}", tmux_window_name);
    }

    eprintln!("[attach_ticket_to_worktree] ✓ Ticket attached to worktree with tmux window: {}", tmux_window_name);

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

// ============================================================================
// Local Ticket & Epic Storage (SQLite-based)
// ============================================================================

use rusqlite::{Connection, params};

/// Get the path to the SQLite database
fn get_db_path() -> Result<PathBuf, String> {
    let data_dir = data_dir().ok_or("Failed to get data directory")?;
    let launcher_dir = data_dir.join("com.ushadow.launcher");

    // Create directory if it doesn't exist
    if !launcher_dir.exists() {
        fs::create_dir_all(&launcher_dir)
            .map_err(|e| format!("Failed to create launcher data directory: {}", e))?;
    }

    Ok(launcher_dir.join("kanban.db"))
}

/// Get a database connection and ensure schema is initialized
fn get_db_connection() -> Result<Connection, String> {
    let db_path = get_db_path()?;
    let conn = Connection::open(&db_path)
        .map_err(|e| format!("Failed to open database: {}", e))?;

    // Create tables if they don't exist
    conn.execute(
        "CREATE TABLE IF NOT EXISTS epics (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT,
            color TEXT NOT NULL,
            branch_name TEXT,
            base_branch TEXT NOT NULL,
            project_id TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )",
        [],
    ).map_err(|e| format!("Failed to create epics table: {}", e))?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS tickets (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT,
            status TEXT NOT NULL,
            priority TEXT NOT NULL,
            epic_id TEXT,
            tags TEXT NOT NULL,
            color TEXT,
            tmux_window_name TEXT,
            tmux_session_name TEXT,
            branch_name TEXT,
            worktree_path TEXT,
            environment_name TEXT,
            project_id TEXT,
            assigned_to TEXT,
            \"order\" INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (epic_id) REFERENCES epics (id) ON DELETE SET NULL
        )",
        [],
    ).map_err(|e| format!("Failed to create tickets table: {}", e))?;

    // Create indexes for common queries
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status)",
        [],
    ).map_err(|e| format!("Failed to create index: {}", e))?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_tickets_project ON tickets(project_id)",
        [],
    ).map_err(|e| format!("Failed to create index: {}", e))?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_epics_project ON epics(project_id)",
        [],
    ).map_err(|e| format!("Failed to create index: {}", e))?;

    Ok(conn)
}

/// Get all tickets, optionally filtered by project
#[tauri::command]
pub async fn get_tickets(project_id: Option<String>) -> Result<Vec<Ticket>, String> {
    let conn = get_db_connection()?;

    // Build query based on filter
    let query = if project_id.is_some() {
        "SELECT * FROM tickets WHERE project_id = ? ORDER BY \"order\""
    } else {
        "SELECT * FROM tickets ORDER BY \"order\""
    };

    let mut stmt = conn.prepare(query)
        .map_err(|e| format!("Failed to prepare statement: {}", e))?;

    // Helper function to map row to Ticket
    let map_row = |row: &rusqlite::Row| -> Result<Ticket, rusqlite::Error> {
        Ok(Ticket {
            id: row.get(0)?,
            title: row.get(1)?,
            description: row.get(2)?,
            status: match row.get::<_, String>(3)?.as_str() {
                "backlog" => TicketStatus::Backlog,
                "todo" => TicketStatus::Todo,
                "in_progress" => TicketStatus::InProgress,
                "in_review" => TicketStatus::InReview,
                "done" => TicketStatus::Done,
                "archived" => TicketStatus::Archived,
                _ => TicketStatus::Backlog,
            },
            priority: match row.get::<_, String>(4)?.as_str() {
                "low" => TicketPriority::Low,
                "medium" => TicketPriority::Medium,
                "high" => TicketPriority::High,
                "urgent" => TicketPriority::Urgent,
                _ => TicketPriority::Medium,
            },
            epic_id: row.get(5)?,
            tags: serde_json::from_str(&row.get::<_, String>(6)?).unwrap_or_default(),
            color: row.get(7)?,
            tmux_window_name: row.get(8)?,
            tmux_session_name: row.get(9)?,
            branch_name: row.get(10)?,
            worktree_path: row.get(11)?,
            environment_name: row.get(12)?,
            project_id: row.get(13)?,
            assigned_to: row.get(14)?,
            order: row.get(15)?,
            created_at: row.get(16)?,
            updated_at: row.get(17)?,
        })
    };

    // Execute query with or without parameter
    let tickets: Vec<Ticket> = if let Some(pid) = project_id {
        stmt.query_map([pid], map_row)
            .map_err(|e| format!("Failed to query tickets: {}", e))?
            .filter_map(|r| r.ok())
            .collect()
    } else {
        stmt.query_map([], map_row)
            .map_err(|e| format!("Failed to query tickets: {}", e))?
            .filter_map(|r| r.ok())
            .collect()
    };

    Ok(tickets)
}

/// Get all epics, optionally filtered by project
#[tauri::command]
pub async fn get_epics(project_id: Option<String>) -> Result<Vec<Epic>, String> {
    let conn = get_db_connection()?;

    // Build query based on filter
    let query = if project_id.is_some() {
        "SELECT * FROM epics WHERE project_id = ? ORDER BY created_at DESC"
    } else {
        "SELECT * FROM epics ORDER BY created_at DESC"
    };

    let mut stmt = conn.prepare(query)
        .map_err(|e| format!("Failed to prepare statement: {}", e))?;

    // Helper function to map row to Epic
    let map_row = |row: &rusqlite::Row| -> Result<Epic, rusqlite::Error> {
        Ok(Epic {
            id: row.get(0)?,
            title: row.get(1)?,
            description: row.get(2)?,
            color: row.get(3)?,
            branch_name: row.get(4)?,
            base_branch: row.get(5)?,
            project_id: row.get(6)?,
            created_at: row.get(7)?,
            updated_at: row.get(8)?,
        })
    };

    // Execute query with or without parameter
    let epics: Vec<Epic> = if let Some(pid) = project_id {
        stmt.query_map([pid], map_row)
            .map_err(|e| format!("Failed to query epics: {}", e))?
            .filter_map(|r| r.ok())
            .collect()
    } else {
        stmt.query_map([], map_row)
            .map_err(|e| format!("Failed to query epics: {}", e))?
            .filter_map(|r| r.ok())
            .collect()
    };

    Ok(epics)
}

/// Create a new ticket
#[tauri::command]
pub async fn create_ticket(
    title: String,
    description: Option<String>,
    priority: String,
    epic_id: Option<String>,
    tags: Vec<String>,
    environment_name: Option<String>,
    project_id: Option<String>,
) -> Result<Ticket, String> {
    let conn = get_db_connection()?;

    // Parse priority
    let priority_enum = match priority.as_str() {
        "low" => TicketPriority::Low,
        "medium" => TicketPriority::Medium,
        "high" => TicketPriority::High,
        "urgent" => TicketPriority::Urgent,
        _ => TicketPriority::Medium,
    };

    // Generate sequential ticket ID (e.g., ush-1, ush-2, etc.)
    let prefix = "ush";
    let next_number = get_next_ticket_number(&conn, prefix)?;
    let id = format!("{}-{}", prefix, next_number);

    // Get current timestamp
    let now = chrono::Utc::now().to_rfc3339();

    // Calculate order (highest + 1 for backlog status)
    let max_order: i32 = conn.query_row(
        "SELECT COALESCE(MAX(\"order\"), -1) FROM tickets WHERE status = 'backlog'",
        [],
        |row| row.get(0),
    ).unwrap_or(-1);

    let order = max_order + 1;

    // Serialize tags to JSON
    let tags_json = serde_json::to_string(&tags)
        .map_err(|e| format!("Failed to serialize tags: {}", e))?;

    // Insert ticket into database
    conn.execute(
        "INSERT INTO tickets (id, title, description, status, priority, epic_id, tags, color, tmux_window_name, tmux_session_name, branch_name, worktree_path, environment_name, project_id, assigned_to, \"order\", created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)",
        params![
            &id,
            &title,
            &description,
            "backlog",
            &priority,
            &epic_id,
            &tags_json,
            None::<String>,  // color
            None::<String>,  // tmux_window_name
            None::<String>,  // tmux_session_name
            None::<String>,  // branch_name
            None::<String>,  // worktree_path
            &environment_name,
            &project_id,
            None::<String>,  // assigned_to
            order,
            &now,
            &now,
        ],
    ).map_err(|e| format!("Failed to insert ticket: {}", e))?;

    Ok(Ticket {
        id,
        title,
        description,
        status: TicketStatus::Backlog,
        priority: priority_enum,
        epic_id,
        tags,
        color: None,
        tmux_window_name: None,
        tmux_session_name: None,
        branch_name: None,
        worktree_path: None,
        environment_name,
        project_id,
        assigned_to: None,
        order,
        created_at: now.clone(),
        updated_at: now,
    })
}

/// Update a ticket
#[tauri::command]
pub async fn update_ticket(
    id: String,
    title: Option<String>,
    description: Option<String>,
    status: Option<String>,
    priority: Option<String>,
    epic_id: Option<String>,
    tags: Option<Vec<String>>,
    order: Option<i32>,
    worktree_path: Option<String>,
    branch_name: Option<String>,
    tmux_window_name: Option<String>,
    tmux_session_name: Option<String>,
    environment_name: Option<String>,
) -> Result<Ticket, String> {
    let conn = get_db_connection()?;

    // First, get the current ticket to return updated version
    let mut stmt = conn.prepare("SELECT * FROM tickets WHERE id = ?")
        .map_err(|e| format!("Failed to prepare statement: {}", e))?;

    let mut ticket = stmt.query_row([&id], |row| {
        Ok(Ticket {
            id: row.get(0)?,
            title: row.get(1)?,
            description: row.get(2)?,
            status: match row.get::<_, String>(3)?.as_str() {
                "backlog" => TicketStatus::Backlog,
                "todo" => TicketStatus::Todo,
                "in_progress" => TicketStatus::InProgress,
                "in_review" => TicketStatus::InReview,
                "done" => TicketStatus::Done,
                "archived" => TicketStatus::Archived,
                _ => TicketStatus::Backlog,
            },
            priority: match row.get::<_, String>(4)?.as_str() {
                "low" => TicketPriority::Low,
                "medium" => TicketPriority::Medium,
                "high" => TicketPriority::High,
                "urgent" => TicketPriority::Urgent,
                _ => TicketPriority::Medium,
            },
            epic_id: row.get(5)?,
            tags: serde_json::from_str(&row.get::<_, String>(6)?).unwrap_or_default(),
            color: row.get(7)?,
            tmux_window_name: row.get(8)?,
            tmux_session_name: row.get(9)?,
            branch_name: row.get(10)?,
            worktree_path: row.get(11)?,
            environment_name: row.get(12)?,
            project_id: row.get(13)?,
            assigned_to: row.get(14)?,
            order: row.get(15)?,
            created_at: row.get(16)?,
            updated_at: row.get(17)?,
        })
    }).map_err(|e| format!("Ticket not found: {}", e))?;

    // Update fields in memory
    if let Some(t) = title {
        ticket.title = t;
    }
    if let Some(d) = description {
        ticket.description = Some(d);
    }
    if let Some(s) = status {
        ticket.status = match s.as_str() {
            "backlog" => TicketStatus::Backlog,
            "todo" => TicketStatus::Todo,
            "in_progress" => TicketStatus::InProgress,
            "in_review" => TicketStatus::InReview,
            "done" => TicketStatus::Done,
            "archived" => TicketStatus::Archived,
            _ => ticket.status,
        };
    }
    if let Some(p) = priority {
        ticket.priority = match p.as_str() {
            "low" => TicketPriority::Low,
            "medium" => TicketPriority::Medium,
            "high" => TicketPriority::High,
            "urgent" => TicketPriority::Urgent,
            _ => ticket.priority,
        };
    }
    if let Some(e) = epic_id {
        ticket.epic_id = Some(e);
    }
    if let Some(t) = tags {
        ticket.tags = t;
    }
    if let Some(o) = order {
        ticket.order = o;
    }
    if let Some(wp) = worktree_path {
        ticket.worktree_path = Some(wp);
    }
    if let Some(bn) = branch_name {
        ticket.branch_name = Some(bn);
    }
    if let Some(twn) = tmux_window_name {
        ticket.tmux_window_name = Some(twn);
    }
    if let Some(tsn) = tmux_session_name {
        ticket.tmux_session_name = Some(tsn);
    }
    if let Some(en) = environment_name {
        ticket.environment_name = Some(en);
    }

    ticket.updated_at = chrono::Utc::now().to_rfc3339();

    // Serialize tags to JSON
    let tags_json = serde_json::to_string(&ticket.tags)
        .map_err(|e| format!("Failed to serialize tags: {}", e))?;

    // Convert status and priority to strings
    let status_str = match ticket.status {
        TicketStatus::Backlog => "backlog",
        TicketStatus::Todo => "todo",
        TicketStatus::InProgress => "in_progress",
        TicketStatus::InReview => "in_review",
        TicketStatus::Done => "done",
        TicketStatus::Archived => "archived",
    };

    let priority_str = match ticket.priority {
        TicketPriority::Low => "low",
        TicketPriority::Medium => "medium",
        TicketPriority::High => "high",
        TicketPriority::Urgent => "urgent",
    };

    // Update in database
    conn.execute(
        "UPDATE tickets SET title = ?1, description = ?2, status = ?3, priority = ?4, epic_id = ?5, tags = ?6, \"order\" = ?7, worktree_path = ?8, branch_name = ?9, tmux_window_name = ?10, tmux_session_name = ?11, environment_name = ?12, updated_at = ?13 WHERE id = ?14",
        params![
            &ticket.title,
            &ticket.description,
            status_str,
            priority_str,
            &ticket.epic_id,
            &tags_json,
            ticket.order,
            &ticket.worktree_path,
            &ticket.branch_name,
            &ticket.tmux_window_name,
            &ticket.tmux_session_name,
            &ticket.environment_name,
            &ticket.updated_at,
            &id,
        ],
    ).map_err(|e| format!("Failed to update ticket: {}", e))?;

    Ok(ticket)
}

/// Delete a ticket
#[tauri::command]
pub async fn delete_ticket(id: String) -> Result<(), String> {
    let conn = get_db_connection()?;

    conn.execute("DELETE FROM tickets WHERE id = ?", params![&id])
        .map_err(|e| format!("Failed to delete ticket: {}", e))?;

    Ok(())
}

/// Create a new epic
#[tauri::command]
pub async fn create_epic(
    title: String,
    description: Option<String>,
    color: String,
    base_branch: String,
    branch_name: Option<String>,
    project_id: Option<String>,
) -> Result<Epic, String> {
    let conn = get_db_connection()?;

    let id = format!("epic-{}", uuid::Uuid::new_v4());
    let now = chrono::Utc::now().to_rfc3339();

    // Insert epic into database
    conn.execute(
        "INSERT INTO epics (id, title, description, color, branch_name, base_branch, project_id, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            &id,
            &title,
            &description,
            &color,
            &branch_name,
            &base_branch,
            &project_id,
            &now,
            &now,
        ],
    ).map_err(|e| format!("Failed to insert epic: {}", e))?;

    Ok(Epic {
        id,
        title,
        description,
        color,
        branch_name,
        base_branch,
        project_id,
        created_at: now.clone(),
        updated_at: now,
    })
}

/// Update an epic
#[tauri::command]
pub async fn update_epic(
    id: String,
    title: Option<String>,
    description: Option<String>,
    color: Option<String>,
    branch_name: Option<String>,
) -> Result<Epic, String> {
    let conn = get_db_connection()?;

    // First, get the current epic to return updated version
    let mut stmt = conn.prepare("SELECT * FROM epics WHERE id = ?")
        .map_err(|e| format!("Failed to prepare statement: {}", e))?;

    let mut epic = stmt.query_row([&id], |row| {
        Ok(Epic {
            id: row.get(0)?,
            title: row.get(1)?,
            description: row.get(2)?,
            color: row.get(3)?,
            branch_name: row.get(4)?,
            base_branch: row.get(5)?,
            project_id: row.get(6)?,
            created_at: row.get(7)?,
            updated_at: row.get(8)?,
        })
    }).map_err(|e| format!("Epic not found: {}", e))?;

    // Update fields in memory
    if let Some(t) = title {
        epic.title = t;
    }
    if let Some(d) = description {
        epic.description = Some(d);
    }
    if let Some(c) = color {
        epic.color = c;
    }
    if let Some(b) = branch_name {
        epic.branch_name = Some(b);
    }

    epic.updated_at = chrono::Utc::now().to_rfc3339();

    // Update in database
    conn.execute(
        "UPDATE epics SET title = ?1, description = ?2, color = ?3, branch_name = ?4, updated_at = ?5 WHERE id = ?6",
        params![
            &epic.title,
            &epic.description,
            &epic.color,
            &epic.branch_name,
            &epic.updated_at,
            &id,
        ],
    ).map_err(|e| format!("Failed to update epic: {}", e))?;

    Ok(epic)
}

/// Delete an epic
#[tauri::command]
pub async fn delete_epic(id: String) -> Result<(), String> {
    let conn = get_db_connection()?;

    conn.execute("DELETE FROM epics WHERE id = ?", params![&id])
        .map_err(|e| format!("Failed to delete epic: {}", e))?;

    Ok(())
}

/// Start a coding agent in the tmux window for a ticket
#[tauri::command]
pub async fn start_coding_agent_for_ticket(
    ticket_id: String,
    tmux_window_name: String,
    tmux_session_name: String,
    worktree_path: String,
) -> Result<(), String> {
    use super::settings::load_launcher_settings;

    eprintln!("[start_coding_agent_for_ticket] Starting agent for ticket: {}", ticket_id);
    eprintln!("[start_coding_agent_for_ticket] Tmux window: {}, session: {}", tmux_window_name, tmux_session_name);
    eprintln!("[start_coding_agent_for_ticket] Worktree path: {}", worktree_path);

    // Load settings to get coding agent configuration
    let settings = load_launcher_settings().await?;

    if !settings.coding_agent.auto_start {
        eprintln!("[start_coding_agent_for_ticket] Auto-start is disabled, skipping");
        return Ok(());
    }

    // Get ticket details
    let ticket = get_ticket_by_id(&ticket_id)?;

    // Automatically move ticket to in_progress when starting agent
    eprintln!("[start_coding_agent_for_ticket] Moving ticket to in_progress...");
    if let Some(branch_name) = &ticket.branch_name {
        // Use kanban-cli to move to in_progress
        let status_update = shell_command(&format!("kanban-cli move-to-progress \"{}\"", branch_name))
            .output();

        match status_update {
            Ok(output) if output.status.success() => {
                eprintln!("[start_coding_agent_for_ticket] ✓ Ticket moved to in_progress");
            }
            Ok(output) => {
                let stderr = String::from_utf8_lossy(&output.stderr);
                eprintln!("[start_coding_agent_for_ticket] Warning: Failed to update status: {}", stderr);
            }
            Err(e) => {
                eprintln!("[start_coding_agent_for_ticket] Warning: Failed to run kanban-cli: {}", e);
            }
        }
    }

    eprintln!("[start_coding_agent_for_ticket] Found ticket: {}", ticket.title);

    // Build the agent prompt with ticket context
    let prompt = format!(
        "You are working on the following ticket:\n\nTitle: {}\n\nDescription: {}\n\nPlease help implement this feature.",
        ticket.title,
        ticket.description.as_ref().unwrap_or(&"No description".to_string())
    );

    // Build the command to send to tmux
    // Format: tmux send-keys -t session:window "command" Enter
    let agent_command = if settings.coding_agent.args.is_empty() {
        settings.coding_agent.command.clone()
    } else {
        format!("{} {}", settings.coding_agent.command, settings.coding_agent.args.join(" "))
    };

    eprintln!("[start_coding_agent_for_ticket] Running agent command: {}", agent_command);

    // First verify the tmux window exists
    let check_window = shell_command(&format!(
        "tmux list-windows -t {} -F '#{{window_name}}'",
        tmux_session_name
    ))
    .output()
    .map_err(|e| format!("Failed to check tmux windows: {}", e))?;

    let windows_output = String::from_utf8_lossy(&check_window.stdout);
    eprintln!("[start_coding_agent_for_ticket] Available windows in session {}:", tmux_session_name);
    eprintln!("{}", windows_output);

    if !windows_output.contains(&tmux_window_name) {
        return Err(format!("Tmux window '{}' not found in session '{}'", tmux_window_name, tmux_session_name));
    }

    // Send a test echo command first to verify tmux communication works
    let test_cmd = format!("tmux send-keys -t {}:{} 'echo \"[LAUNCHER] Starting coding agent...\"' Enter", tmux_session_name, tmux_window_name);
    eprintln!("[start_coding_agent_for_ticket] Test command: {}", test_cmd);
    let test_result = shell_command(&test_cmd)
        .output()
        .map_err(|e| format!("Failed to send test command: {}", e))?;

    if !test_result.status.success() {
        let stderr = String::from_utf8_lossy(&test_result.stderr);
        return Err(format!("Test command failed: {}", stderr));
    }

    std::thread::sleep(std::time::Duration::from_millis(300));

    // CD to worktree directory
    let cd_cmd = format!("tmux send-keys -t {}:{} 'cd \"{}\"' Enter", tmux_session_name, tmux_window_name, worktree_path);
    eprintln!("[start_coding_agent_for_ticket] CD command: {}", cd_cmd);
    let cd_result = shell_command(&cd_cmd)
        .output()
        .map_err(|e| format!("Failed to send cd command: {}", e))?;

    if !cd_result.status.success() {
        let stderr = String::from_utf8_lossy(&cd_result.stderr);
        return Err(format!("CD command failed: {}", stderr));
    }

    std::thread::sleep(std::time::Duration::from_millis(300));

    // Send PWD to verify we're in the right directory
    let pwd_cmd = format!("tmux send-keys -t {}:{} 'pwd' Enter", tmux_session_name, tmux_window_name);
    eprintln!("[start_coding_agent_for_ticket] PWD command: {}", pwd_cmd);
    shell_command(&pwd_cmd)
        .output()
        .map_err(|e| format!("Failed to send pwd command: {}", e))?;

    std::thread::sleep(std::time::Duration::from_millis(500));

    // Finally, start the coding agent
    let agent_cmd = format!("tmux send-keys -t {}:{} '{}' Enter", tmux_session_name, tmux_window_name, agent_command);
    eprintln!("[start_coding_agent_for_ticket] Agent command: {}", agent_cmd);
    let start_agent = shell_command(&agent_cmd)
        .output()
        .map_err(|e| format!("Failed to send agent command: {}", e))?;

    if !start_agent.status.success() {
        let stderr = String::from_utf8_lossy(&start_agent.stderr);
        return Err(format!("Failed to start coding agent: {}", stderr));
    }

    // Wait for agent to start up
    eprintln!("[start_coding_agent_for_ticket] Waiting for agent to start...");
    std::thread::sleep(std::time::Duration::from_secs(3));

    // Send the ticket context as a prompt
    // We need to escape the prompt for shell safety
    let escaped_prompt = prompt
        .replace("\\", "\\\\")
        .replace("\"", "\\\"")
        .replace("$", "\\$")
        .replace("`", "\\`");

    let prompt_cmd = format!("tmux send-keys -t {}:{} \"{}\"", tmux_session_name, tmux_window_name, escaped_prompt);
    eprintln!("[start_coding_agent_for_ticket] Sending ticket prompt to agent...");
    let send_prompt = shell_command(&prompt_cmd)
        .output()
        .map_err(|e| format!("Failed to send prompt: {}", e))?;

    if !send_prompt.status.success() {
        let stderr = String::from_utf8_lossy(&send_prompt.stderr);
        eprintln!("[start_coding_agent_for_ticket] Warning: Failed to send prompt: {}", stderr);
        // Don't fail the whole operation if prompt sending fails
    }

    // Send Enter to submit the prompt
    std::thread::sleep(std::time::Duration::from_millis(500));
    let enter_cmd = format!("tmux send-keys -t {}:{} Enter", tmux_session_name, tmux_window_name);
    shell_command(&enter_cmd)
        .output()
        .map_err(|e| format!("Failed to send Enter: {}", e))?;

    eprintln!("[start_coding_agent_for_ticket] ✓ All commands sent successfully");

    Ok(())
}

/// Get the next ticket number for a given prefix
fn get_next_ticket_number(conn: &rusqlite::Connection, prefix: &str) -> Result<i32, String> {
    // Query all ticket IDs that match the prefix pattern
    let pattern = format!("{}-%%", prefix);
    let mut stmt = conn.prepare("SELECT id FROM tickets WHERE id LIKE ?")
        .map_err(|e| format!("Failed to prepare statement: {}", e))?;

    let ticket_ids = stmt.query_map([&pattern], |row| {
        row.get::<_, String>(0)
    }).map_err(|e| format!("Failed to query tickets: {}", e))?;

    // Find the highest number
    let mut max_number = 0;
    for id_result in ticket_ids {
        if let Ok(id) = id_result {
            // Extract number from "ush-123" format
            if let Some(number_str) = id.strip_prefix(&format!("{}-", prefix)) {
                if let Ok(number) = number_str.parse::<i32>() {
                    if number > max_number {
                        max_number = number;
                    }
                }
            }
        }
    }

    Ok(max_number + 1)
}

/// Helper to get a ticket by ID (internal use)
fn get_ticket_by_id(id: &str) -> Result<Ticket, String> {
    let conn = get_db_connection()?;

    let mut stmt = conn.prepare("SELECT * FROM tickets WHERE id = ?")
        .map_err(|e| format!("Failed to prepare statement: {}", e))?;

    stmt.query_row([id], |row| {
        Ok(Ticket {
            id: row.get(0)?,
            title: row.get(1)?,
            description: row.get(2)?,
            status: match row.get::<_, String>(3)?.as_str() {
                "backlog" => TicketStatus::Backlog,
                "todo" => TicketStatus::Todo,
                "in_progress" => TicketStatus::InProgress,
                "in_review" => TicketStatus::InReview,
                "done" => TicketStatus::Done,
                "archived" => TicketStatus::Archived,
                _ => TicketStatus::Backlog,
            },
            priority: match row.get::<_, String>(4)?.as_str() {
                "low" => TicketPriority::Low,
                "medium" => TicketPriority::Medium,
                "high" => TicketPriority::High,
                "urgent" => TicketPriority::Urgent,
                _ => TicketPriority::Medium,
            },
            epic_id: row.get(5)?,
            tags: serde_json::from_str(&row.get::<_, String>(6)?).unwrap_or_default(),
            color: row.get(7)?,
            tmux_window_name: row.get(8)?,
            tmux_session_name: row.get(9)?,
            branch_name: row.get(10)?,
            worktree_path: row.get(11)?,
            environment_name: row.get(12)?,
            project_id: row.get(13)?,
            assigned_to: row.get(14)?,
            order: row.get(15)?,
            created_at: row.get(16)?,
            updated_at: row.get(17)?,
        })
    }).map_err(|e| format!("Ticket not found: {}", e))
}
