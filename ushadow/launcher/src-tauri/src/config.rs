use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

/// Main launcher configuration loaded from .launcher-config.yaml
#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct LauncherConfig {
    pub project: ProjectConfig,
    pub prerequisites: PrerequisitesConfig,
    pub setup: SetupConfig,
    pub infrastructure: InfrastructureConfig,
    pub services: ServicesConfig,
    pub ports: PortsConfig,
    pub worktrees: WorktreesConfig,
    #[serde(default)]
    pub ui: UiConfig,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct ProjectConfig {
    pub name: String,
    pub display_name: String,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct PrerequisitesConfig {
    pub required: Vec<String>,
    #[serde(default)]
    pub optional: Vec<String>,
    #[serde(default)]
    pub install_scripts: HashMap<String, InstallScript>,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct InstallScript {
    pub unix: Option<String>,
    pub windows: Option<String>,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct SetupConfig {
    pub create_command: String,
    #[serde(default)]
    pub env_vars: Vec<String>,
    #[serde(default)]
    pub pre_hooks: Vec<SetupHook>,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct SetupHook {
    pub name: String,
    pub command: String,
    pub platforms: Vec<String>, // "unix", "windows", "macos", "linux"
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct InfrastructureConfig {
    pub networks: Vec<String>,
    pub compose_file: String,
    pub project_name: String,
    pub profile: Option<String>,
    pub services: Vec<InfraServiceDef>,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct InfraServiceDef {
    pub name: String,
    pub display_name: String,
    pub ports: Vec<String>,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct ServicesConfig {
    pub naming_pattern: String,
    pub definitions: Vec<ServiceDefinition>,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct ServiceDefinition {
    pub name: String,
    pub display_name: String,
    pub default_port: Option<u16>,
    #[serde(default)]
    pub port_calculation: Option<PortCalculation>,
    #[serde(default)]
    pub health_check: Option<HealthCheck>,
    #[serde(default)]
    pub optional: bool,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct PortCalculation {
    pub from: String, // Reference to another service name
    pub offset: i32,  // Can be negative (e.g., -5000)
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct HealthCheck {
    pub endpoint: String,
    pub timeout: u32,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct PortsConfig {
    #[serde(default = "default_allocation_strategy")]
    pub allocation_strategy: String, // "hash", "sequential", "random"
    pub base_backend_port: u16,
    pub base_webui_port: u16,
    pub offset: PortOffset,
    #[serde(default)]
    pub exclude: Vec<u16>,
}

fn default_allocation_strategy() -> String {
    "hash".to_string()
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct PortOffset {
    pub min: u16,
    pub max: u16,
    pub step: u16,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct WorktreesConfig {
    pub default_parent: String,
    #[serde(default)]
    pub branch_prefix: String,
}

#[derive(Deserialize, Serialize, Clone, Debug, Default)]
pub struct UiConfig {
    #[serde(default = "default_colors")]
    pub colors: Vec<String>,
    pub default_width: Option<u32>,
    pub default_height: Option<u32>,
}

fn default_colors() -> Vec<String> {
    vec![
        "blue", "gold", "pink", "purple", "red", "green", "indigo", "orange",
        "cyan", "teal", "lime", "brown", "silver", "coral", "salmon", "navy",
        "magenta", "violet", "maroon", "olive", "aqua", "turquoise", "crimson",
        "lavender", "mint", "peach", "rose", "ruby", "emerald", "sapphire",
        "amber", "bronze", "copper", "platinum", "slate", "charcoal",
    ]
    .iter()
    .map(|s| s.to_string())
    .collect()
}

impl LauncherConfig {
    /// Load configuration from .launcher-config.yaml in the project root
    pub fn load(project_root: &PathBuf) -> Result<Self, String> {
        let config_path = project_root.join(".launcher-config.yaml");

        if !config_path.exists() {
            return Err(format!(
                "Configuration file not found: {}\n\n\
                This repository is not configured for the launcher.\n\
                Please create a .launcher-config.yaml file in the repository root.",
                config_path.display()
            ));
        }

        let contents = std::fs::read_to_string(&config_path)
            .map_err(|e| format!("Failed to read config file: {}", e))?;

        let config: LauncherConfig = serde_yaml::from_str(&contents)
            .map_err(|e| format!("Failed to parse config YAML: {}", e))?;

        // Validate the configuration
        config.validate()?;

        Ok(config)
    }

    /// Validate the configuration structure and constraints
    fn validate(&self) -> Result<(), String> {
        // Validate project basics
        if self.project.name.is_empty() {
            return Err("project.name cannot be empty".to_string());
        }

        if self.services.definitions.is_empty() {
            return Err("At least one service must be defined in services.definitions".to_string());
        }

        // Validate port ranges
        if self.ports.base_backend_port == 0 {
            return Err("ports.base_backend_port must be greater than 0".to_string());
        }

        if self.ports.offset.max > 60000 {
            return Err(format!(
                "ports.offset.max ({}) too large - max allowed is 60000 to prevent exceeding port 65535",
                self.ports.offset.max
            ));
        }

        // Validate service definitions
        for service in &self.services.definitions {
            // Ensure either default_port or port_calculation is set
            if service.default_port.is_none() && service.port_calculation.is_none() && !service.optional {
                return Err(format!(
                    "Service '{}' must have either default_port or port_calculation (or be marked optional)",
                    service.name
                ));
            }

            // Validate port calculation references
            if let Some(calc) = &service.port_calculation {
                if !self.services.definitions.iter().any(|s| s.name == calc.from) {
                    return Err(format!(
                        "Service '{}' references unknown service '{}' in port_calculation",
                        service.name, calc.from
                    ));
                }

                if calc.from == service.name {
                    return Err(format!(
                        "Service '{}' cannot calculate its port from itself",
                        service.name
                    ));
                }
            }
        }

        Ok(())
    }

    /// Get the list of required services (non-optional)
    pub fn required_services(&self) -> Vec<&ServiceDefinition> {
        self.services
            .definitions
            .iter()
            .filter(|s| !s.optional)
            .collect()
    }

    /// Get the list of all service names
    pub fn all_service_names(&self) -> Vec<String> {
        self.services
            .definitions
            .iter()
            .map(|s| s.name.clone())
            .collect()
    }

    /// Expand a variable in a string using provided context
    pub fn expand_variables(&self, template: &str, vars: &HashMap<String, String>) -> String {
        let mut result = template.to_string();
        for (key, value) in vars {
            result = result.replace(&format!("{{{}}}", key), value);
        }
        result
    }

    /// Generate container name from pattern
    pub fn generate_container_name(&self, env_name: &str, service_name: &str) -> String {
        let env_suffix = if env_name == "default" || env_name.is_empty() {
            String::new()
        } else {
            format!("-{}", env_name)
        };

        self.services
            .naming_pattern
            .replace("{project_name}", &self.project.name)
            .replace("{env_name}", &env_suffix)
            .replace("{service_name}", service_name)
            .replace("--", "-") // Clean up double dashes
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_container_naming() {
        let config = LauncherConfig {
            project: ProjectConfig {
                name: "myapp".to_string(),
                display_name: "My App".to_string(),
            },
            services: ServicesConfig {
                naming_pattern: "{project_name}{env_name}-{service_name}".to_string(),
                definitions: vec![],
            },
            // ... other fields with defaults
            prerequisites: PrerequisitesConfig {
                required: vec![],
                optional: vec![],
                install_scripts: HashMap::new(),
            },
            setup: SetupConfig {
                create_command: "".to_string(),
                env_vars: vec![],
                pre_hooks: vec![],
            },
            infrastructure: InfrastructureConfig {
                networks: vec![],
                compose_file: "".to_string(),
                project_name: "".to_string(),
                profile: None,
                services: vec![],
            },
            ports: PortsConfig {
                allocation_strategy: "hash".to_string(),
                base_backend_port: 8000,
                base_webui_port: 3000,
                offset: PortOffset {
                    min: 0,
                    max: 500,
                    step: 10,
                },
                exclude: vec![],
            },
            worktrees: WorktreesConfig {
                default_parent: "~/repos".to_string(),
                branch_prefix: "".to_string(),
            },
            ui: UiConfig::default(),
        };

        assert_eq!(
            config.generate_container_name("default", "backend"),
            "myapp-backend"
        );
        assert_eq!(
            config.generate_container_name("staging", "backend"),
            "myapp-staging-backend"
        );
    }

    #[test]
    fn test_variable_expansion() {
        let config = LauncherConfig {
            // Minimal config for testing
            project: ProjectConfig {
                name: "test".to_string(),
                display_name: "Test".to_string(),
            },
            prerequisites: PrerequisitesConfig {
                required: vec![],
                optional: vec![],
                install_scripts: HashMap::new(),
            },
            setup: SetupConfig {
                create_command: "setup.sh {ENV_NAME} {PORT}".to_string(),
                env_vars: vec![],
                pre_hooks: vec![],
            },
            services: ServicesConfig {
                naming_pattern: "".to_string(),
                definitions: vec![],
            },
            infrastructure: InfrastructureConfig {
                networks: vec![],
                compose_file: "".to_string(),
                project_name: "".to_string(),
                profile: None,
                services: vec![],
            },
            ports: PortsConfig {
                allocation_strategy: "hash".to_string(),
                base_backend_port: 8000,
                base_webui_port: 3000,
                offset: PortOffset {
                    min: 0,
                    max: 500,
                    step: 10,
                },
                exclude: vec![],
            },
            worktrees: WorktreesConfig {
                default_parent: "~/repos".to_string(),
                branch_prefix: "".to_string(),
            },
            ui: UiConfig::default(),
        };

        let mut vars = HashMap::new();
        vars.insert("ENV_NAME".to_string(), "staging".to_string());
        vars.insert("PORT".to_string(), "8080".to_string());

        let expanded = config.expand_variables(&config.setup.create_command, &vars);
        assert_eq!(expanded, "setup.sh staging 8080");
    }
}
