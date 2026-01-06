#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod commands;
mod models;

use commands::{AppState, check_prerequisites, get_os_type, discover_environments,
    start_containers, stop_containers, get_container_status,
    start_infrastructure, stop_infrastructure, restart_infrastructure,
    start_environment, stop_environment,
    check_backend_health, check_webui_health, open_browser, set_project_root,
    create_environment, install_docker_via_brew, start_docker_desktop_macos,
    start_docker_desktop_windows, start_docker_service_linux,
    // Package manager installers
    install_homebrew, check_brew,
    install_docker_windows, install_tailscale_windows, install_tailscale_macos,
    // Project/repo management
    get_default_project_dir, check_project_dir, clone_ushadow_repo,
    update_ushadow_repo, install_git_windows, install_git_macos};
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
            // Legacy (for compatibility)
            start_containers,
            stop_containers,
            get_container_status,
            check_backend_health,
            check_webui_health,
            open_browser,
            discover_environments,
            create_environment,
            // Package manager installers
            install_homebrew,
            check_brew,
            // Docker/Tailscale management
            install_docker_via_brew,
            install_docker_windows,
            start_docker_desktop_macos,
            start_docker_desktop_windows,
            start_docker_service_linux,
            install_tailscale_windows,
            install_tailscale_macos,
            // Project/repo management
            get_default_project_dir,
            check_project_dir,
            clone_ushadow_repo,
            update_ushadow_repo,
            install_git_windows,
            install_git_macos,
        ])
        .setup(|app| {
            let window = app.get_window("main").unwrap();
            window.show().unwrap();
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
