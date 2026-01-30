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
    pub containers: ContainersConfig,
    pub ports: PortsConfig,
    pub worktrees: WorktreesConfig,
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
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct SetupConfig {
    pub command: String,
    #[serde(default)]
    pub env_vars: Vec<String>,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct InfrastructureConfig {
    pub compose_file: String,
    pub project_name: String,
    pub profile: Option<String>,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct ContainersConfig {
    pub naming_pattern: String,
    pub primary_service: String,
    pub health_endpoint: String,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct PortsConfig {
    #[serde(default = "default_allocation_strategy")]
    pub allocation_strategy: String, // "hash", "sequential", "random"
    pub base_port: u16,
    pub offset: PortOffset,
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

        // Validate setup command
        if self.setup.command.is_empty() {
            return Err("setup.command cannot be empty".to_string());
        }

        // Validate port ranges
        if self.ports.base_port == 0 {
            return Err("ports.base_port must be greater than 0".to_string());
        }

        if self.ports.offset.max > 60000 {
            return Err(format!(
                "ports.offset.max ({}) too large - max allowed is 60000 to prevent exceeding port 65535",
                self.ports.offset.max
            ));
        }

        // Validate container naming pattern contains required variables
        if !self.containers.naming_pattern.contains("{project_name}") {
            return Err("containers.naming_pattern must contain {project_name}".to_string());
        }

        if !self.containers.naming_pattern.contains("{service_name}") {
            return Err("containers.naming_pattern must contain {service_name}".to_string());
        }

        // Validate infrastructure config
        if self.infrastructure.compose_file.is_empty() {
            return Err("infrastructure.compose_file cannot be empty".to_string());
        }

        Ok(())
    }

    /// Expand variables in a string template using provided context
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

        self.containers
            .naming_pattern
            .replace("{project_name}", &self.project.name)
            .replace("{env_name}", &env_suffix)
            .replace("{service_name}", service_name)
            .replace("--", "-") // Clean up double dashes
    }

    /// Calculate port for an environment given the base port and env name
    pub fn calculate_port(&self, env_name: &str) -> u16 {
        if env_name == "default" || env_name == "main" || env_name.is_empty() {
            return self.ports.base_port;
        }

        match self.ports.allocation_strategy.as_str() {
            "hash" => {
                let hash: u32 = env_name.bytes().map(|b| b as u32).sum();
                let offset_steps = (self.ports.offset.max - self.ports.offset.min) / self.ports.offset.step;
                let offset = ((hash % offset_steps as u32) * self.ports.offset.step as u32) as u16;
                self.ports.base_port + offset
            }
            "sequential" => {
                // For sequential, would need to track allocated ports in state
                // For now, fall back to hash
                let hash: u32 = env_name.bytes().map(|b| b as u32).sum();
                let offset_steps = (self.ports.offset.max - self.ports.offset.min) / self.ports.offset.step;
                let offset = ((hash % offset_steps as u32) * self.ports.offset.step as u32) as u16;
                self.ports.base_port + offset
            }
            _ => self.ports.base_port, // Default/random strategy
        }
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
            containers: ContainersConfig {
                naming_pattern: "{project_name}{env_name}-{service_name}".to_string(),
                primary_service: "backend".to_string(),
                health_endpoint: "/health".to_string(),
            },
            prerequisites: PrerequisitesConfig {
                required: vec![],
                optional: vec![],
            },
            setup: SetupConfig {
                command: "setup.sh".to_string(),
                env_vars: vec![],
            },
            infrastructure: InfrastructureConfig {
                compose_file: "docker-compose.yml".to_string(),
                project_name: "infra".to_string(),
                profile: None,
            },
            ports: PortsConfig {
                allocation_strategy: "hash".to_string(),
                base_port: 8000,
                offset: PortOffset {
                    min: 0,
                    max: 500,
                    step: 10,
                },
            },
            worktrees: WorktreesConfig {
                default_parent: "~/repos".to_string(),
                branch_prefix: "".to_string(),
            },
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
            project: ProjectConfig {
                name: "test".to_string(),
                display_name: "Test".to_string(),
            },
            prerequisites: PrerequisitesConfig {
                required: vec![],
                optional: vec![],
            },
            setup: SetupConfig {
                command: "setup.sh {ENV_NAME} {PORT}".to_string(),
                env_vars: vec![],
            },
            containers: ContainersConfig {
                naming_pattern: "test-{service_name}".to_string(),
                primary_service: "backend".to_string(),
                health_endpoint: "/health".to_string(),
            },
            infrastructure: InfrastructureConfig {
                compose_file: "docker-compose.yml".to_string(),
                project_name: "infra".to_string(),
                profile: None,
            },
            ports: PortsConfig {
                allocation_strategy: "hash".to_string(),
                base_port: 8000,
                offset: PortOffset {
                    min: 0,
                    max: 500,
                    step: 10,
                },
            },
            worktrees: WorktreesConfig {
                default_parent: "~/repos".to_string(),
                branch_prefix: "".to_string(),
            },
        };

        let mut vars = HashMap::new();
        vars.insert("ENV_NAME".to_string(), "staging".to_string());
        vars.insert("PORT".to_string(), "8080".to_string());

        let expanded = config.expand_variables(&config.setup.command, &vars);
        assert_eq!(expanded, "setup.sh staging 8080");
    }

    #[test]
    fn test_port_calculation() {
        let config = LauncherConfig {
            project: ProjectConfig {
                name: "test".to_string(),
                display_name: "Test".to_string(),
            },
            prerequisites: PrerequisitesConfig {
                required: vec![],
                optional: vec![],
            },
            setup: SetupConfig {
                command: "setup.sh".to_string(),
                env_vars: vec![],
            },
            containers: ContainersConfig {
                naming_pattern: "test-{service_name}".to_string(),
                primary_service: "backend".to_string(),
                health_endpoint: "/health".to_string(),
            },
            infrastructure: InfrastructureConfig {
                compose_file: "docker-compose.yml".to_string(),
                project_name: "infra".to_string(),
                profile: None,
            },
            ports: PortsConfig {
                allocation_strategy: "hash".to_string(),
                base_port: 8000,
                offset: PortOffset {
                    min: 0,
                    max: 500,
                    step: 10,
                },
            },
            worktrees: WorktreesConfig {
                default_parent: "~/repos".to_string(),
                branch_prefix: "".to_string(),
            },
        };

        // Default environment gets base port
        assert_eq!(config.calculate_port("default"), 8000);
        assert_eq!(config.calculate_port("main"), 8000);

        // Other environments get offset ports (deterministic hash)
        let staging_port = config.calculate_port("staging");
        assert!(staging_port >= 8000 && staging_port <= 8500);

        // Same env name should always give same port
        assert_eq!(staging_port, config.calculate_port("staging"));
    }
}
