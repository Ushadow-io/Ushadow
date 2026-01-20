use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LauncherSettings {
    pub default_admin_email: Option<String>,
    pub default_admin_password: Option<String>,
    pub default_admin_name: Option<String>,
}

impl Default for LauncherSettings {
    fn default() -> Self {
        Self {
            default_admin_email: None,
            default_admin_password: None,
            default_admin_name: Some("Administrator".to_string()),
        }
    }
}

/// Get the path to the launcher settings file
fn get_settings_path() -> Result<PathBuf, String> {
    let home_dir = dirs::home_dir()
        .ok_or("Could not determine home directory")?;

    let config_dir = home_dir.join(".config").join("ushadow-launcher");

    // Ensure directory exists
    if !config_dir.exists() {
        fs::create_dir_all(&config_dir)
            .map_err(|e| format!("Failed to create config directory: {}", e))?;
    }

    Ok(config_dir.join("settings.json"))
}

/// Load launcher settings from disk
#[tauri::command]
pub async fn load_launcher_settings() -> Result<LauncherSettings, String> {
    let settings_path = get_settings_path()?;

    if !settings_path.exists() {
        // Return default settings if file doesn't exist
        return Ok(LauncherSettings::default());
    }

    let contents = fs::read_to_string(&settings_path)
        .map_err(|e| format!("Failed to read settings: {}", e))?;

    let settings: LauncherSettings = serde_json::from_str(&contents)
        .map_err(|e| format!("Failed to parse settings: {}", e))?;

    Ok(settings)
}

/// Save launcher settings to disk
#[tauri::command]
pub async fn save_launcher_settings(settings: LauncherSettings) -> Result<(), String> {
    let settings_path = get_settings_path()?;

    let json = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;

    fs::write(&settings_path, json)
        .map_err(|e| format!("Failed to write settings: {}", e))?;

    eprintln!("[save_launcher_settings] Saved settings to: {}", settings_path.display());

    Ok(())
}

/// Write admin credentials to a worktree's secrets.yaml file
#[tauri::command]
pub async fn write_credentials_to_worktree(
    worktree_path: String,
    admin_email: String,
    admin_password: String,
    admin_name: Option<String>,
) -> Result<(), String> {
    use std::path::Path;

    let secrets_dir = Path::new(&worktree_path).join("config").join("SECRETS");
    let secrets_file = secrets_dir.join("secrets.yaml");

    // Ensure SECRETS directory exists
    if !secrets_dir.exists() {
        fs::create_dir_all(&secrets_dir)
            .map_err(|e| format!("Failed to create SECRETS directory: {}", e))?;
    }

    // Read existing secrets.yaml or create new one
    let mut content = if secrets_file.exists() {
        fs::read_to_string(&secrets_file)
            .map_err(|e| format!("Failed to read secrets.yaml: {}", e))?
    } else {
        String::new()
    };

    // Parse YAML to check if admin section exists
    // For simplicity, we'll do basic string manipulation
    // If the file is empty or doesn't have admin section, add it

    let admin_section = format!(
        r#"admin:
  name: "{}"
  email: "{}"
  password: "{}"
"#,
        admin_name.unwrap_or_else(|| "Administrator".to_string()),
        admin_email,
        admin_password
    );

    // Check if admin section exists
    if content.contains("admin:") {
        eprintln!("[write_credentials_to_worktree] Admin section already exists in secrets.yaml, skipping");
        return Ok(());
    }

    // If file is empty or doesn't have admin section, add it
    if content.trim().is_empty() {
        content = admin_section;
    } else {
        // Append admin section
        if !content.ends_with('\n') {
            content.push('\n');
        }
        content.push_str(&admin_section);
    }

    // Write updated content
    fs::write(&secrets_file, content)
        .map_err(|e| format!("Failed to write secrets.yaml: {}", e))?;

    eprintln!("[write_credentials_to_worktree] Wrote admin credentials to: {}", secrets_file.display());

    Ok(())
}
