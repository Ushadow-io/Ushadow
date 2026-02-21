use std::path::Path;
use std::fs;
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DetectedPort {
    pub name: String,
    pub default_value: Option<String>,
    pub base_port: Option<u16>,
    pub is_database: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DetectedEnvVar {
    pub name: String,
    pub default_value: Option<String>,
    pub is_port: bool,
    pub is_database_port: bool,
    pub should_append_env_name: bool,  // For DB names, user names, etc.
}

/// Scan .env.template, .env.example, or .env for port-related variables
#[tauri::command]
pub fn scan_env_file(project_root: String) -> Result<Vec<DetectedPort>, String> {
    let project_path = Path::new(&project_root);

    // Try different env file names in order of preference
    let env_files = vec![
        ".env.template",
        ".env.example",
        ".env.sample",
        ".env",
    ];

    let mut found_file = None;
    for file_name in &env_files {
        let file_path = project_path.join(file_name);
        if file_path.exists() {
            found_file = Some(file_path);
            break;
        }
    }

    let env_file = found_file.ok_or("No .env file found in project root")?;

    eprintln!("[scan_env_file] Scanning: {:?}", env_file);

    let content = fs::read_to_string(&env_file)
        .map_err(|e| format!("Failed to read env file: {}", e))?;

    let mut detected_ports = Vec::new();

    for line in content.lines() {
        let line = line.trim();

        // Skip comments and empty lines
        if line.starts_with('#') || line.is_empty() {
            continue;
        }

        // Parse VAR=value format
        if let Some((key, value)) = line.split_once('=') {
            let key = key.trim();
            let value = value.trim().trim_matches('"').trim_matches('\'');

            // Check if this looks like a port variable
            if is_port_variable(key) {
                let base_port = value.parse::<u16>().ok();
                let is_database = is_database_port(key);

                detected_ports.push(DetectedPort {
                    name: key.to_string(),
                    default_value: Some(value.to_string()),
                    base_port,
                    is_database,
                });
            }
        }
    }

    eprintln!("[scan_env_file] Detected {} port variables", detected_ports.len());

    Ok(detected_ports)
}

/// Scan all environment variables from .env files
#[tauri::command]
pub fn scan_all_env_vars(project_root: String) -> Result<Vec<DetectedEnvVar>, String> {
    let project_path = Path::new(&project_root);

    // Try different env file names in order of preference
    let env_files = vec![
        ".env.template",
        ".env.example",
        ".env.sample",
        ".env",
    ];

    let mut found_file = None;
    for file_name in &env_files {
        let file_path = project_path.join(file_name);
        if file_path.exists() {
            found_file = Some(file_path);
            break;
        }
    }

    let env_file = found_file.ok_or("No .env file found in project root")?;

    eprintln!("[scan_all_env_vars] Scanning: {:?}", env_file);

    let content = fs::read_to_string(&env_file)
        .map_err(|e| format!("Failed to read env file: {}", e))?;

    let mut detected_vars = Vec::new();

    for line in content.lines() {
        let line = line.trim();

        // Skip comments and empty lines
        if line.starts_with('#') || line.is_empty() {
            continue;
        }

        // Parse VAR=value format
        if let Some((key, value)) = line.split_once('=') {
            let key = key.trim();
            let value = value.trim().trim_matches('"').trim_matches('\'');

            let is_port = is_port_variable(key);
            let is_database_port = is_database_port(key);
            let should_append_env_name = should_append_env_name(key);

            detected_vars.push(DetectedEnvVar {
                name: key.to_string(),
                default_value: Some(value.to_string()),
                is_port,
                is_database_port,
                should_append_env_name,
            });
        }
    }

    eprintln!("[scan_all_env_vars] Detected {} variables", detected_vars.len());

    Ok(detected_vars)
}

/// Check if a variable name looks like a port variable
fn is_port_variable(key: &str) -> bool {
    let key_upper = key.to_uppercase();

    // Explicit port variables
    if key_upper.contains("PORT") {
        return true;
    }

    // Common database/service port patterns
    let patterns = [
        "POSTGRES", "MYSQL", "MONGODB", "MONGO", "REDIS", "MEMCACHED",
        "ELASTICSEARCH", "RABBITMQ", "KAFKA", "CASSANDRA",
        "BACKEND", "API", "WEBUI", "FRONTEND", "WEB",
    ];

    for pattern in &patterns {
        if key_upper.contains(pattern) && key_upper.contains("PORT") {
            return true;
        }
    }

    false
}

/// Check if a port variable is for a database
fn is_database_port(key: &str) -> bool {
    let key_upper = key.to_uppercase();

    let db_keywords = [
        "POSTGRES", "MYSQL", "MONGODB", "MONGO", "REDIS", "MEMCACHED",
        "ELASTICSEARCH", "CASSANDRA", "MARIADB", "MSSQL", "ORACLE",
        "DB", "DATABASE",
    ];

    db_keywords.iter().any(|kw| key_upper.contains(kw))
}

/// Check if a variable should have the environment name appended
/// (e.g., database names, user names, bucket names)
fn should_append_env_name(key: &str) -> bool {
    let key_upper = key.to_uppercase();

    // Variables that typically need env-specific values
    let patterns = [
        "DB_NAME", "DATABASE_NAME", "POSTGRES_DB", "MYSQL_DATABASE", "MONGO_DATABASE",
        "DB_USER", "DATABASE_USER", "POSTGRES_USER", "MYSQL_USER",
        "BUCKET_NAME", "QUEUE_NAME", "TOPIC_NAME", "STREAM_NAME",
        "SCHEMA_NAME", "TENANT_", "NAMESPACE",
    ];

    patterns.iter().any(|pattern| key_upper.contains(pattern))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_port_variable() {
        assert!(is_port_variable("BACKEND_PORT"));
        assert!(is_port_variable("postgres_port"));
        assert!(is_port_variable("REDIS_PORT"));
        assert!(is_port_variable("API_PORT"));
        assert!(!is_port_variable("API_KEY"));
        assert!(!is_port_variable("DATABASE_URL"));
    }

    #[test]
    fn test_is_database_port() {
        assert!(is_database_port("POSTGRES_PORT"));
        assert!(is_database_port("REDIS_PORT"));
        assert!(is_database_port("MONGODB_PORT"));
        assert!(!is_database_port("BACKEND_PORT"));
        assert!(!is_database_port("WEBUI_PORT"));
    }

    #[test]
    fn test_should_append_env_name() {
        assert!(should_append_env_name("POSTGRES_DB"));
        assert!(should_append_env_name("DB_NAME"));
        assert!(should_append_env_name("DATABASE_NAME"));
        assert!(should_append_env_name("BUCKET_NAME"));
        assert!(should_append_env_name("POSTGRES_USER"));
        assert!(!should_append_env_name("POSTGRES_PASSWORD"));
        assert!(!should_append_env_name("API_KEY"));
    }
}
