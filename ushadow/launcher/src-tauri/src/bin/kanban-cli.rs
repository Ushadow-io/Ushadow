use rusqlite::{Connection, params};
use std::path::PathBuf;
use std::env;

#[derive(Debug)]
#[allow(dead_code)]
struct Ticket {
    id: String,
    title: String,
    status: String,
    worktree_path: Option<String>,
    branch_name: Option<String>,
    tmux_window_name: Option<String>,
}

/// Get the path to the SQLite database
fn get_db_path() -> Result<PathBuf, String> {
    let data_dir = dirs::data_dir().ok_or("Failed to get data directory")?;
    let launcher_dir = data_dir.join("com.ushadow.launcher");

    if !launcher_dir.exists() {
        return Err(format!("Launcher data directory does not exist: {:?}", launcher_dir));
    }

    Ok(launcher_dir.join("kanban.db"))
}

/// Get a database connection
fn get_db_connection() -> Result<Connection, String> {
    let db_path = get_db_path()?;
    Connection::open(&db_path)
        .map_err(|e| format!("Failed to open database: {}", e))
}

/// Find tickets by worktree path
fn find_tickets_by_worktree(worktree_path: &str) -> Result<Vec<Ticket>, String> {
    let conn = get_db_connection()?;

    let mut stmt = conn.prepare(
        "SELECT id, title, status, worktree_path, branch_name, tmux_window_name
         FROM tickets
         WHERE worktree_path = ?"
    ).map_err(|e| format!("Failed to prepare statement: {}", e))?;

    let tickets = stmt.query_map([worktree_path], |row| {
        Ok(Ticket {
            id: row.get(0)?,
            title: row.get(1)?,
            status: row.get(2)?,
            worktree_path: row.get(3)?,
            branch_name: row.get(4)?,
            tmux_window_name: row.get(5)?,
        })
    })
    .map_err(|e| format!("Failed to query tickets: {}", e))?
    .filter_map(|r| r.ok())
    .collect();

    Ok(tickets)
}

/// Find tickets by branch name
fn find_tickets_by_branch(branch_name: &str) -> Result<Vec<Ticket>, String> {
    let conn = get_db_connection()?;

    let mut stmt = conn.prepare(
        "SELECT id, title, status, worktree_path, branch_name, tmux_window_name
         FROM tickets
         WHERE branch_name = ?"
    ).map_err(|e| format!("Failed to prepare statement: {}", e))?;

    let tickets = stmt.query_map([branch_name], |row| {
        Ok(Ticket {
            id: row.get(0)?,
            title: row.get(1)?,
            status: row.get(2)?,
            worktree_path: row.get(3)?,
            branch_name: row.get(4)?,
            tmux_window_name: row.get(5)?,
        })
    })
    .map_err(|e| format!("Failed to query tickets: {}", e))?
    .filter_map(|r| r.ok())
    .collect();

    Ok(tickets)
}

/// Find tickets by tmux window name
fn find_tickets_by_tmux_window(window_name: &str) -> Result<Vec<Ticket>, String> {
    let conn = get_db_connection()?;

    let mut stmt = conn.prepare(
        "SELECT id, title, status, worktree_path, branch_name, tmux_window_name
         FROM tickets
         WHERE tmux_window_name = ?"
    ).map_err(|e| format!("Failed to prepare statement: {}", e))?;

    let tickets = stmt.query_map([window_name], |row| {
        Ok(Ticket {
            id: row.get(0)?,
            title: row.get(1)?,
            status: row.get(2)?,
            worktree_path: row.get(3)?,
            branch_name: row.get(4)?,
            tmux_window_name: row.get(5)?,
        })
    })
    .map_err(|e| format!("Failed to query tickets: {}", e))?
    .filter_map(|r| r.ok())
    .collect();

    Ok(tickets)
}

/// Update ticket status
fn update_ticket_status(ticket_id: &str, new_status: &str) -> Result<(), String> {
    // Validate status
    let valid_statuses = ["backlog", "todo", "in_progress", "in_review", "done", "archived"];
    if !valid_statuses.contains(&new_status) {
        return Err(format!(
            "Invalid status '{}'. Must be one of: {}",
            new_status,
            valid_statuses.join(", ")
        ));
    }

    let conn = get_db_connection()?;
    let now = chrono::Utc::now().to_rfc3339();

    let rows_affected = conn.execute(
        "UPDATE tickets SET status = ?, updated_at = ? WHERE id = ?",
        params![new_status, &now, ticket_id],
    ).map_err(|e| format!("Failed to update ticket: {}", e))?;

    if rows_affected == 0 {
        return Err(format!("Ticket not found: {}", ticket_id));
    }

    Ok(())
}

fn print_usage() {
    eprintln!("Usage: kanban-cli <command> [options]");
    eprintln!();
    eprintln!("Commands:");
    eprintln!("  set-status <ticket-id> <status>     Update ticket status");
    eprintln!("  find-by-path <worktree-path>         Find tickets by worktree path");
    eprintln!("  find-by-branch <branch-name>         Find tickets by branch name");
    eprintln!("  find-by-window <tmux-window>         Find tickets by tmux window name");
    eprintln!("  move-to-review <identifier>          Move ticket(s) to 'in_review' status");
    eprintln!("  move-to-progress <identifier>        Move ticket(s) to 'in_progress' status");
    eprintln!("  move-to-done <identifier>            Move ticket(s) to 'done' status");
    eprintln!("                                       (identifier can be path, branch, or window)");
    eprintln!();
    eprintln!("Statuses:");
    eprintln!("  backlog, todo, in_progress, in_review, done, archived");
    eprintln!();
    eprintln!("Examples:");
    eprintln!("  # Update specific ticket");
    eprintln!("  kanban-cli set-status ticket-123 in_review");
    eprintln!();
    eprintln!("  # Find tickets by worktree path");
    eprintln!("  kanban-cli find-by-path /path/to/worktree");
    eprintln!();
    eprintln!("  # Agent self-reporting workflow");
    eprintln!("  kanban-cli move-to-progress $BRANCH_NAME  # Agent starts working");
    eprintln!("  kanban-cli move-to-review $BRANCH_NAME    # Agent waits for human");
    eprintln!("  kanban-cli move-to-done $BRANCH_NAME      # Work merged");
}

fn main() {
    let args: Vec<String> = env::args().collect();

    if args.len() < 2 {
        print_usage();
        std::process::exit(1);
    }

    let command = &args[1];

    let result = match command.as_str() {
        "set-status" => {
            if args.len() < 4 {
                eprintln!("Error: set-status requires ticket ID and status");
                print_usage();
                std::process::exit(1);
            }
            let ticket_id = &args[2];
            let status = &args[3];

            match update_ticket_status(ticket_id, status) {
                Ok(_) => {
                    println!("✓ Updated ticket {} to status: {}", ticket_id, status);
                    Ok(())
                }
                Err(e) => Err(e),
            }
        }
        "find-by-path" => {
            if args.len() < 3 {
                eprintln!("Error: find-by-path requires worktree path");
                print_usage();
                std::process::exit(1);
            }
            let path = &args[2];

            match find_tickets_by_worktree(path) {
                Ok(tickets) => {
                    if tickets.is_empty() {
                        println!("No tickets found for path: {}", path);
                    } else {
                        println!("Found {} ticket(s):", tickets.len());
                        for ticket in tickets {
                            println!("  {} - {} ({})", ticket.id, ticket.title, ticket.status);
                        }
                    }
                    Ok(())
                }
                Err(e) => Err(e),
            }
        }
        "find-by-branch" => {
            if args.len() < 3 {
                eprintln!("Error: find-by-branch requires branch name");
                print_usage();
                std::process::exit(1);
            }
            let branch = &args[2];

            match find_tickets_by_branch(branch) {
                Ok(tickets) => {
                    if tickets.is_empty() {
                        println!("No tickets found for branch: {}", branch);
                    } else {
                        println!("Found {} ticket(s):", tickets.len());
                        for ticket in tickets {
                            println!("  {} - {} ({})", ticket.id, ticket.title, ticket.status);
                        }
                    }
                    Ok(())
                }
                Err(e) => Err(e),
            }
        }
        "find-by-window" => {
            if args.len() < 3 {
                eprintln!("Error: find-by-window requires tmux window name");
                print_usage();
                std::process::exit(1);
            }
            let window = &args[2];

            match find_tickets_by_tmux_window(window) {
                Ok(tickets) => {
                    if tickets.is_empty() {
                        println!("No tickets found for tmux window: {}", window);
                    } else {
                        println!("Found {} ticket(s):", tickets.len());
                        for ticket in tickets {
                            println!("  {} - {} ({})", ticket.id, ticket.title, ticket.status);
                        }
                    }
                    Ok(())
                }
                Err(e) => Err(e),
            }
        }
        "move-to-review" => {
            if args.len() < 3 {
                eprintln!("Error: move-to-review requires identifier (path, branch, or window)");
                print_usage();
                std::process::exit(1);
            }
            let identifier = &args[2];

            // Try to find tickets by different methods - try all methods until we find some tickets
            let mut tickets = Vec::new();

            // Try worktree path
            if let Ok(found) = find_tickets_by_worktree(identifier) {
                if !found.is_empty() {
                    tickets = found;
                }
            }

            // If no tickets found, try branch name
            if tickets.is_empty() {
                if let Ok(found) = find_tickets_by_branch(identifier) {
                    if !found.is_empty() {
                        tickets = found;
                    }
                }
            }

            // If still no tickets, try tmux window
            if tickets.is_empty() {
                if let Ok(found) = find_tickets_by_tmux_window(identifier) {
                    tickets = found;
                }
            }

            if tickets.is_empty() {
                eprintln!("⚠ No tickets found for identifier: {}", identifier);
                eprintln!("  This is OK - not all worktrees have associated tickets");
                Ok(())
            } else {
                let mut errors = Vec::new();
                let mut updated = 0;

                for ticket in &tickets {
                    // Only update if not already in review or done
                    if ticket.status != "in_review" && ticket.status != "done" {
                        match update_ticket_status(&ticket.id, "in_review") {
                            Ok(_) => {
                                println!("✓ Moved ticket to review: {} - {}", ticket.id, ticket.title);
                                updated += 1;
                            }
                            Err(e) => {
                                errors.push(format!("Failed to update {}: {}", ticket.id, e));
                            }
                        }
                    } else {
                        println!("  Skipped {} - already in status: {}", ticket.id, ticket.status);
                    }
                }

                if !errors.is_empty() {
                    Err(errors.join("\n"))
                } else {
                    if updated > 0 {
                        println!("✓ Moved {} ticket(s) to review", updated);
                    }
                    Ok(())
                }
            }
        }
        "move-to-progress" => {
            if args.len() < 3 {
                eprintln!("Error: move-to-progress requires identifier (path, branch, or window)");
                print_usage();
                std::process::exit(1);
            }
            let identifier = &args[2];

            // Try to find tickets by different methods
            let mut tickets = Vec::new();

            if let Ok(found) = find_tickets_by_worktree(identifier) {
                if !found.is_empty() {
                    tickets = found;
                }
            }

            if tickets.is_empty() {
                if let Ok(found) = find_tickets_by_branch(identifier) {
                    if !found.is_empty() {
                        tickets = found;
                    }
                }
            }

            if tickets.is_empty() {
                if let Ok(found) = find_tickets_by_tmux_window(identifier) {
                    tickets = found;
                }
            }

            if tickets.is_empty() {
                eprintln!("⚠ No tickets found for identifier: {}", identifier);
                eprintln!("  This is OK - not all worktrees have associated tickets");
                Ok(())
            } else {
                let mut errors = Vec::new();
                let mut updated = 0;

                for ticket in &tickets {
                    match update_ticket_status(&ticket.id, "in_progress") {
                        Ok(_) => {
                            println!("✓ Moved ticket to in_progress: {} - {}", ticket.id, ticket.title);
                            updated += 1;
                        }
                        Err(e) => {
                            errors.push(format!("Failed to update {}: {}", ticket.id, e));
                        }
                    }
                }

                if !errors.is_empty() {
                    Err(errors.join("\n"))
                } else {
                    if updated > 0 {
                        println!("✓ Moved {} ticket(s) to in_progress", updated);
                    }
                    Ok(())
                }
            }
        }
        "move-to-done" => {
            if args.len() < 3 {
                eprintln!("Error: move-to-done requires identifier (path, branch, or window)");
                print_usage();
                std::process::exit(1);
            }
            let identifier = &args[2];

            // Try to find tickets by different methods
            let mut tickets = Vec::new();

            if let Ok(found) = find_tickets_by_worktree(identifier) {
                if !found.is_empty() {
                    tickets = found;
                }
            }

            if tickets.is_empty() {
                if let Ok(found) = find_tickets_by_branch(identifier) {
                    if !found.is_empty() {
                        tickets = found;
                    }
                }
            }

            if tickets.is_empty() {
                if let Ok(found) = find_tickets_by_tmux_window(identifier) {
                    tickets = found;
                }
            }

            if tickets.is_empty() {
                eprintln!("⚠ No tickets found for identifier: {}", identifier);
                eprintln!("  This is OK - not all worktrees have associated tickets");
                Ok(())
            } else {
                let mut errors = Vec::new();
                let mut updated = 0;

                for ticket in &tickets {
                    match update_ticket_status(&ticket.id, "done") {
                        Ok(_) => {
                            println!("✓ Moved ticket to done: {} - {}", ticket.id, ticket.title);
                            updated += 1;
                        }
                        Err(e) => {
                            errors.push(format!("Failed to update {}: {}", ticket.id, e));
                        }
                    }
                }

                if !errors.is_empty() {
                    Err(errors.join("\n"))
                } else {
                    if updated > 0 {
                        println!("✓ Moved {} ticket(s) to done", updated);
                    }
                    Ok(())
                }
            }
        }
        "--help" | "-h" => {
            print_usage();
            Ok(())
        }
        _ => {
            eprintln!("Error: Unknown command '{}'", command);
            print_usage();
            std::process::exit(1);
        }
    };

    if let Err(e) = result {
        eprintln!("Error: {}", e);
        std::process::exit(1);
    }
}
