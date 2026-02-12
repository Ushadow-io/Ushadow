use crate::config::LauncherConfig;
use std::path::PathBuf;
use tauri::State;

use super::docker::AppState;

/// Load project configuration from .launcher-config.yaml
#[tauri::command]
pub async fn load_project_config(
    project_root: String,
    state: State<'_, AppState>,
) -> Result<LauncherConfig, String> {
    let config = LauncherConfig::load(&PathBuf::from(&project_root))?;

    // Store the loaded config in application state
    let mut config_lock = state.config.lock().map_err(|e| e.to_string())?;
    *config_lock = Some(config.clone());

    Ok(config)
}

/// Get the currently loaded configuration
#[tauri::command]
pub async fn get_current_config(
    state: State<'_, AppState>,
) -> Result<Option<LauncherConfig>, String> {
    let config_lock = state.config.lock().map_err(|e| e.to_string())?;
    Ok(config_lock.clone())
}

/// Check if a launcher config file exists in the given directory
#[tauri::command]
pub async fn check_launcher_config_exists(project_root: String) -> Result<bool, String> {
    let config_path = PathBuf::from(&project_root).join(".launcher-config.yaml");
    Ok(config_path.exists())
}

/// Validate a config file without loading it into state
#[tauri::command]
pub async fn validate_config_file(project_root: String) -> Result<String, String> {
    match LauncherConfig::load(&PathBuf::from(&project_root)) {
        Ok(config) => Ok(format!(
            "Configuration is valid for project '{}'",
            config.project.display_name
        )),
        Err(e) => Err(e),
    }
}
