#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod commands;
mod models;

use commands::{AppState, check_prerequisites, discover_environments,
    discover_environments_with_config,
    start_containers, stop_containers, get_container_status,
    check_backend_health, check_webui_health, open_browser, set_project_root,
    create_environment, list_worktrees, create_worktree, open_in_vscode,
    remove_worktree};
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

    let app_menu = Submenu::new(
        "Ushadow",
        Menu::new()
            .add_item(launcher)
            .add_native_item(MenuItem::Separator)
            .add_native_item(MenuItem::Quit),
    );

    Menu::new().add_submenu(app_menu)
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
        .on_window_event(|event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event.event() {
                // Hide window instead of closing (keep in tray)
                let _ = event.window().hide();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
            check_prerequisites,
            set_project_root,
            start_containers,
            stop_containers,
            get_container_status,
            check_backend_health,
            check_webui_health,
            open_browser,
            discover_environments,
            discover_environments_with_config,
            create_environment,
            // Worktree commands
            list_worktrees,
            create_worktree,
            open_in_vscode,
            remove_worktree,
        ])
        .setup(|app| {
            let window = app.get_window("main").unwrap();
            window.show().unwrap();
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
