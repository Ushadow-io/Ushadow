use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

/// A single prerequisite definition
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PrerequisiteDefinition {
    pub id: String,
    pub name: String,
    pub display_name: String,
    pub description: String,
    pub platforms: Vec<String>,
    pub check_command: Option<String>,
    pub check_commands: Option<Vec<String>>,
    pub check_running_command: Option<String>,
    pub check_connected_command: Option<String>,
    pub fallback_paths: Option<Vec<String>>,
    pub version_filter: Option<String>,
    pub optional: bool,
    pub has_service: Option<bool>,
    pub category: String,
    #[serde(skip)]
    pub platform_specific_paths: Option<HashMap<String, Vec<String>>>,
    pub connection_validation: Option<ConnectionValidation>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ConnectionValidation {
    pub starts_with: Option<String>,
}

/// Installation method definition
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct InstallationMethod {
    pub method: String,
    pub package: Option<String>,
    pub url: Option<String>,
    pub packages: Option<HashMap<String, String>>,
}

/// Root configuration structure
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PrerequisitesConfig {
    pub prerequisites: Vec<PrerequisiteDefinition>,
    pub installation_methods: Option<HashMap<String, HashMap<String, InstallationMethod>>>,
}

impl PrerequisitesConfig {
    /// Load prerequisites configuration from YAML file
    pub fn load() -> Result<Self, String> {
        // Get the path to the prerequisites.yaml file
        // In development: src-tauri/prerequisites.yaml
        // In production: resources/prerequisites.yaml (bundled with app)
        let config_path = Self::get_config_path()?;

        let yaml_content = std::fs::read_to_string(&config_path)
            .map_err(|e| format!("Failed to read prerequisites config at {:?}: {}", config_path, e))?;

        let mut config: PrerequisitesConfig = serde_yaml::from_str(&yaml_content)
            .map_err(|e| format!("Failed to parse prerequisites config: {}", e))?;

        // Post-process: extract platform-specific paths
        for prereq in &mut config.prerequisites {
            if let Some(_fallback_paths) = &prereq.fallback_paths {
                // Check if this is a map-like structure in the YAML
                // For now, keep it simple and use the Vec<String> structure
                // In a future enhancement, we could parse platform-specific paths differently
            }
        }

        Ok(config)
    }

    /// Get the path to the prerequisites config file
    fn get_config_path() -> Result<PathBuf, String> {
        // Try development path first (during development/testing)
        let dev_path = PathBuf::from("prerequisites.yaml");
        if dev_path.exists() {
            return Ok(dev_path);
        }

        // Try relative to src-tauri directory
        let src_tauri_path = PathBuf::from("src-tauri/prerequisites.yaml");
        if src_tauri_path.exists() {
            return Ok(src_tauri_path);
        }

        // Try parent directory (when running from src-tauri/target/debug)
        let parent_path = PathBuf::from("../prerequisites.yaml");
        if parent_path.exists() {
            return Ok(parent_path);
        }

        // Try two levels up
        let parent2_path = PathBuf::from("../../prerequisites.yaml");
        if parent2_path.exists() {
            return Ok(parent2_path);
        }

        // In production, try the resources directory
        // Note: This will be available when the app is built and packaged
        // For now, we rely on the development paths above

        Err(format!(
            "Could not find prerequisites.yaml. Tried:\n  - {:?}\n  - {:?}\n  - {:?}\n  - {:?}",
            dev_path, src_tauri_path, parent_path, parent2_path
        ))
    }

    /// Get a prerequisite definition by ID
    pub fn get_prerequisite(&self, id: &str) -> Option<&PrerequisiteDefinition> {
        self.prerequisites.iter().find(|p| p.id == id)
    }

    /// Get all prerequisites for the current platform
    pub fn get_platform_prerequisites(&self, platform: &str) -> Vec<&PrerequisiteDefinition> {
        self.prerequisites
            .iter()
            .filter(|p| p.platforms.contains(&platform.to_string()))
            .collect()
    }
}

/// Tauri command to get prerequisites configuration
#[tauri::command]
pub fn get_prerequisites_config() -> Result<PrerequisitesConfig, String> {
    PrerequisitesConfig::load()
}

/// Tauri command to get prerequisites for current platform
#[tauri::command]
pub fn get_platform_prerequisites_config(platform: String) -> Result<Vec<PrerequisiteDefinition>, String> {
    let config = PrerequisitesConfig::load()?;
    let prereqs = config.get_platform_prerequisites(&platform);
    Ok(prereqs.into_iter().cloned().collect())
}
