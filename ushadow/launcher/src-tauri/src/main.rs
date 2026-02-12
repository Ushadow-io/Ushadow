#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod commands;
mod config;
mod models;

use commands::{AppState, check_prerequisites, discover_environments, get_os_type,
    discover_environments_with_config, discover_environments_v2,
    start_containers, stop_containers, get_container_status,
    start_infrastructure, stop_infrastructure, restart_infrastructure,
    start_environment, stop_environment, check_ports,
    check_backend_health, check_webui_health, open_browser, focus_window, set_project_root,
    create_environment,
    // OAuth server commands
    start_oauth_server, wait_for_oauth_callback,
    // HTTP client
    http_request,
    // Project/repo management (from repository.rs)
    get_default_project_dir, check_project_dir, clone_ushadow_repo,
    update_ushadow_repo, get_current_branch, checkout_branch, get_base_branch,
    // Worktree commands
    list_worktrees, list_git_branches, check_worktree_exists, check_environment_conflict, create_worktree, create_worktree_with_workmux,
    merge_worktree_with_rebase, list_tmux_sessions, get_tmux_window_status,
    get_environment_tmux_status, get_tmux_info, ensure_tmux_running, attach_tmux_to_worktree,
    open_in_vscode, open_in_vscode_with_tmux, remove_worktree, delete_environment,
    get_tmux_sessions, kill_tmux_window, kill_tmux_server,
    open_tmux_in_terminal, capture_tmux_pane, get_claude_status,
    // Kanban ticket commands
    create_ticket_worktree, attach_ticket_to_worktree, get_tickets_for_tmux_window, get_ticket_tmux_info,
    start_coding_agent_for_ticket,
    // Kanban ticket/epic CRUD (local storage)
    get_tickets, get_epics, create_ticket, update_ticket, delete_ticket, create_epic, update_epic, delete_epic,
    // Settings
    load_launcher_settings, save_launcher_settings, write_credentials_to_worktree,
    // Prerequisites config (from prerequisites_config.rs)
    get_prerequisites_config, get_platform_prerequisites_config,
    // Generic installer (from generic_installer.rs) - replaces all platform-specific installers
    install_prerequisite, start_prerequisite,
    // Config commands (from 4bdc-ushadow-launchge)
    load_project_config, get_current_config, check_launcher_config_exists, validate_config_file,
    // Environment scanning
    scan_env_file, scan_all_env_vars,
    // Infrastructure discovery
    get_infra_services_from_compose,
    // Permissions
    check_install_path};
use tauri::{
    CustomMenuItem, Manager, Menu, MenuItem, SystemTray,
    SystemTrayEvent, SystemTrayMenu, SystemTrayMenuItem, Submenu,
};

/// Create system tray menu
fn create_tray_menu() -> SystemTrayMenu {
    let open = CustomMenuItem::new("open".to_string(), "Open Launcher");
    let quit = CustomMenuItem::new("quit".to_string(), "Quit");

    SystemTrayMenu::new()
        .add_item(open)
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(quit)
}

/// Create application menu
fn create_app_menu() -> Menu {
    let launcher = CustomMenuItem::new("show_launcher", "Show Launcher");

    // App menu (File on Windows/Linux, App name on macOS)
    let app_menu = Submenu::new(
        "Ushadow",
        Menu::new()
            .add_item(launcher)
            .add_native_item(MenuItem::Separator)
            .add_native_item(MenuItem::Hide)
            .add_native_item(MenuItem::HideOthers)
            .add_native_item(MenuItem::ShowAll)
            .add_native_item(MenuItem::Separator)
            .add_native_item(MenuItem::Quit),
    );

    // Edit menu with all standard shortcuts
    let edit_menu = Submenu::new(
        "Edit",
        Menu::new()
            .add_native_item(MenuItem::Undo)
            .add_native_item(MenuItem::Redo)
            .add_native_item(MenuItem::Separator)
            .add_native_item(MenuItem::Cut)
            .add_native_item(MenuItem::Copy)
            .add_native_item(MenuItem::Paste)
            .add_native_item(MenuItem::SelectAll),
    );

    // View menu
    let view_menu = Submenu::new(
        "View",
        Menu::new()
            .add_native_item(MenuItem::EnterFullScreen),
    );

    // Window menu
    let window_menu = Submenu::new(
        "Window",
        Menu::new()
            .add_native_item(MenuItem::Minimize)
            .add_native_item(MenuItem::Zoom)
            .add_native_item(MenuItem::Separator)
            .add_native_item(MenuItem::CloseWindow),
    );

    Menu::new()
        .add_submenu(app_menu)
        .add_submenu(edit_menu)
        .add_submenu(view_menu)
        .add_submenu(window_menu)
}

fn main() {
    let tray = SystemTray::new().with_menu(create_tray_menu());
    let menu = create_app_menu();

    tauri::Builder::default()
        .manage(AppState::new())
        .menu(menu)
        .on_menu_event(|event| {
            let window = event.window();
            match event.menu_item_id() {
                "show_launcher" => {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
                _ => {}
            }
        })
        .system_tray(tray)
        .on_system_tray_event(|app, event| match event {
            SystemTrayEvent::LeftClick { .. } => {
                if let Some(window) = app.get_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            SystemTrayEvent::MenuItemClick { id, .. } => match id.as_str() {
                "open" => {
                    if let Some(window) = app.get_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "quit" => {
                    std::process::exit(0);
                }
                _ => {}
            },
            _ => {}
        })
        .on_window_event(|_event| {
            // Allow window to close normally (quit app)
            // Previously hid window and kept in tray, but that's disabled for now
        })
        .invoke_handler(tauri::generate_handler![
            check_prerequisites,
            get_os_type,
            set_project_root,
            // Infrastructure management
            start_infrastructure,
            stop_infrastructure,
            restart_infrastructure,
            // Environment management
            start_environment,
            stop_environment,
            check_ports,
            // Legacy (for compatibility)
            start_containers,
            stop_containers,
            get_container_status,
            check_backend_health,
            check_webui_health,
            open_browser,
            focus_window,
            discover_environments,
            create_environment,
            // Project/repo management (from repository.rs)
            get_default_project_dir,
            check_project_dir,
            check_install_path,
            clone_ushadow_repo,
            update_ushadow_repo,
            get_current_branch,
            checkout_branch,
            get_base_branch,
            // Worktree management
            discover_environments_with_config,
            discover_environments_v2,
            list_worktrees,
            list_git_branches,
            check_worktree_exists,
            check_environment_conflict,
            create_worktree,
            create_worktree_with_workmux,
            merge_worktree_with_rebase,
            list_tmux_sessions,
            get_tmux_window_status,
            get_environment_tmux_status,
            get_tmux_info,
            ensure_tmux_running,
            attach_tmux_to_worktree,
            open_in_vscode,
            open_in_vscode_with_tmux,
            remove_worktree,
            delete_environment,
            get_tmux_sessions,
            kill_tmux_window,
            kill_tmux_server,
            open_tmux_in_terminal,
            capture_tmux_pane,
            get_claude_status,
            // Kanban ticket integration
            create_ticket_worktree,
            attach_ticket_to_worktree,
            get_tickets_for_tmux_window,
            get_ticket_tmux_info,
            start_coding_agent_for_ticket,
            // Kanban ticket/epic CRUD (local storage)
            get_tickets,
            get_epics,
            create_ticket,
            update_ticket,
            delete_ticket,
            create_epic,
            update_epic,
            delete_epic,
            // Settings
            load_launcher_settings,
            save_launcher_settings,
            write_credentials_to_worktree,
            // Prerequisites config
            get_prerequisites_config,
            get_platform_prerequisites_config,
            // Generic installer
            install_prerequisite,
            start_prerequisite,
            // Config management (from 4bdc-ushadow-launchge)
            load_project_config,
            get_current_config,
            check_launcher_config_exists,
            validate_config_file,
            // Environment scanning
            scan_env_file,
            scan_all_env_vars,
            // Infrastructure discovery
            get_infra_services_from_compose,
            // OAuth server
            start_oauth_server,
            wait_for_oauth_callback,
            // HTTP client
            http_request,
        ])
        .setup(|app| {
            let window = app.get_window("main").unwrap();
            window.show().unwrap();
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
