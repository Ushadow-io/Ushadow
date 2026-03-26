# Method/Function Analysis

## Python Backend Methods

### ushadow/backend/main.py
- `check_stale_unodes_task`
- `lifespan`
- `root`

### ushadow/backend/src/routers/unodes.py
- `get_join_script`
- `get_join_script_powershell`
- `get_bootstrap_script`
- `get_bootstrap_script_powershell`
- `register_unode`
- `unode_heartbeat`
- `list_unodes`
- `discover_peers`
- `claim_node`
- `get_manager_versions`
- `version_sort_key`
- `get_unode`
- `create_join_token`
- `remove_unode`
- `release_unode`
- `update_unode_status`
- `image`
- `upgrade_unode`
- `upgrade_all_unodes`

### ushadow/backend/src/routers/auth.py
- `login`
- `get_setup_status`
- `create_initial_admin`
- `get_current_user_info`
- `get_service_token`
- `logout`

### ushadow/backend/src/routers/services.py
- `build_compose_service_response`
- `get_installed_services`
- `get_service_enabled`
- `set_service_enabled`

### ushadow/backend/src/routers/compose_services.py
- `build_service_response`
- `get_installed_service_names`
- `service_matches_installed`
- `list_compose_services`
- `list_catalog_services`
- `get_compose_service`
- `get_services_by_capability`
- `get_service_env_config`
- `find_auto_match`
- `resolve_env_value`
- `update_service_env_config`
- `resolve_service_env_vars`
- `install_service`
- `uninstall_service`

### ushadow/backend/src/routers/health.py
- `health_check`

### ushadow/backend/src/routers/feature_flags.py
- `get_feature_flags_status`
- `check_feature_flag`
- `toggle_feature_flag`

### ushadow/backend/src/routers/docker.py
- `get_docker_status`
- `get_services_status`
- `list_services`
- `get_service`
- `start_service`
- `stop_service`
- `restart_service`
- `get_service_logs`
- `register_dynamic_service`

### ushadow/backend/src/routers/providers.py
- `check_local_provider_available`
- `get_missing_fields`
- `list_providers`
- `get_providers_by_capability`
- `list_capabilities`
- `get_provider`
- `get_provider_missing`
- `find_providers`
- `get_selected`
- `update_selected`
- `apply_defaults`

### ushadow/backend/src/routers/wizard.py
- `mask_key`
- `get_wizard_api_keys`
- `update_wizard_api_keys`
- `complete_wizard`
- `get_huggingface_status`
- `check_huggingface_models`
- `get_quickstart_config`
- `save_quickstart_config`
- `get_setup_state`
- `save_setup_state`

### ushadow/backend/src/routers/kubernetes.py
- `add_cluster`
- `list_clusters`
- `get_cluster`
- `remove_cluster`

### ushadow/backend/src/routers/tailscale.py
- `get_environment_name`
- `get_tailscale_hostname`
- `get_tailscale_container_name`
- `get_tailscale_volume_name`
- `get_environment_info`
- `detect_platform`
- `get_installation_guide`
- `_read_config`
- `get_config`
- `save_config`
- `generate_tailscale_config`
- `generate_serve_config`
- `generate_caddyfile`
- `get_access_urls`
- `test_connection`
- `exec_in_container`
- `get_container_status`
- `start_tailscale_container`
- `get_auth_url`
- `provision_cert_in_container`
- `configure_tailscale_serve`
- `complete_setup`

### ushadow/backend/src/routers/docker_events.py
- `docker_events_stream`
- `event_generator`
- `get_next_event`

### ushadow/backend/src/routers/settings.py
- `get_settings_info`
- `get_config`
- `update_config`
- `get_all_service_configs`
- `get_service_config`
- `update_service_config`
- `delete_service_config`
- `reset_config`
- `refresh_config`

### ushadow/backend/src/routers/deployments.py
- `create_service_definition`
- `list_service_definitions`
- `get_service_definition`
- `update_service_definition`
- `delete_service_definition`
- `deploy_service`
- `list_deployments`
- `get_deployment`
- `stop_deployment`
- `restart_deployment`
- `remove_deployment`
- `get_deployment_logs`

### ushadow/backend/src/routers/chronicle.py
- `get_chronicle_status`
- `get_conversations`
- `search_memories`

### ushadow/backend/src/middleware/app_middleware.py
- `_get_tailscale_hostname`
- `setup_cors_middleware`
- `should_log_request`
- `should_log_response_body`
- `dispatch`
- `setup_exception_handlers`
- `database_exception_handler`
- `connection_exception_handler`
- `http_exception_handler`
- `setup_middleware`

### ushadow/backend/src/memory/adapters/factory.py
- `create_adapter`
- `register_adapter`
- `get_supported_types`

### ushadow/backend/src/memory/adapters/rest_adapter.py
- `__init__`
- `_init_client`
- `_get_auth_headers`
- `test_connection`
- `fetch_items`
- `fetch_item`
- `_build_query_params`
- `_extract_items_from_response`
- `close`
- `__del__`

### ushadow/backend/src/memory/adapters/base.py
- `__init__`
- `test_connection`
- `fetch_items`
- `fetch_item`
- `transform_to_memory`
- `_get_nested_value`
- `_apply_transform`

### ushadow/backend/src/config/infra_settings.py
- `parse_cors_origins`
- `get_infra_settings`
- `get_settings`

### ushadow/backend/src/config/omegaconf_settings.py
- `_env_resolver`
- `to_dict`
- `infer_setting_type`
- `categorize_setting`
- `mask_secret_value`
- `env_var_matches_setting`
- `__init__`
- `clear_cache`
- `_load_yaml_if_exists`
- `load_config`
- `get`
- `get_sync`
- `get_by_env_var`
- `get_by_env_var_sync`
- `_save_to_file`
- `save_to_secrets`
- `save_to_settings`
- `_is_secret_key`
- `update`
- `_filter_masked_values`
- `reset`
- `get_config_as_dict`
- `find_setting_for_env_var`
- `has_value_for_env_var`
- `get_suggestions_for_env_var`
- `save_env_var_values`
- `get_settings_store`

### ushadow/backend/src/config/secrets.py
- `_get_secrets_path`
- `_load_secrets`
- `get_auth_secret_key`
- `is_secret_key`
- `mask_value`
- `mask_if_secret`
- `mask_dict_secrets`

### ushadow/backend/src/config/yaml_parser.py
- `__init__`
- `load`
- `save`
- `get_nested`
- `set_nested`
- `merge`
- `__repr__`
- `required_env_vars`
- `optional_env_vars`
- `get_service`
- `get_services_requiring`
- `parse`
- `_parse_service`
- `_resolve_image`
- `_parse_env_vars`
- `_parse_env_item`
- `_parse_depends_on`
- `_parse_ports`
- `get_compose_parser`

### ushadow/backend/src/models/user.py
- `create_update_dict`
- `create_update_dict_superuser`
- `user_id`
- `save`
- `get_user_db`
- `get_user_by_id`
- `get_user_by_email`

### ushadow/backend/src/services/auth.py
- `parse_id`
- `on_after_register`
- `on_after_forgot_password`
- `on_after_request_verify`
- `get_user_manager`
- `get_jwt_strategy`
- `read_token`
- `validate_token_issuer`
- `generate_jwt_for_service`
- `get_user_from_token`
- `get_accessible_user_ids`
- `create_admin_user_if_needed`
- `websocket_auth`

### ushadow/backend/src/services/compose_registry.py
- `_get_compose_dir`
- `all_env_vars`
- `get_env_schema`
- `__init__`
- `_load`
- `refresh`
- `_discover_compose_files`
- `_load_compose_file`
- `reload`
- `get_services`
- `get_service`
- `get_service_by_name`
- `get_services_requiring`
- `get_compose_file`
- `get_services_in_compose`
- `get_env_schema`
- `update_env_config`
- `resolve_env_vars`
- `get_compose_registry`

### ushadow/backend/src/services/unode_manager.py
- `is_tailscale_ip`
- `__init__`
- `_init_fernet`
- `_encrypt_secret`
- `_decrypt_secret`
- `initialize`
- `_register_self_as_leader`
- `_detect_platform`
- `create_join_token`
- `_generate_bootstrap_bash`
- `_generate_bootstrap_powershell`
- `get_bootstrap_script_bash`
- `get_bootstrap_script_powershell`
- `validate_token`
- `register_unode`
- `_update_existing_unode`
- `process_heartbeat`
- `get_unode`
- `list_unodes`
- `remove_unode`
- `release_unode`
- `claim_unode`
- `update_unode_status`
- `check_stale_unodes`
- `upgrade_unode`
- `discover_tailscale_peers`
- `_probe_unode_manager`
- `_get_unode_info`
- `_get_own_tailscale_ip`
- `get_join_script`
- `get_join_script_powershell`
- `get_unode_manager`
- `init_unode_manager`

### ushadow/backend/src/services/deployment_manager.py
- `_is_local_deployment`
- `_update_tailscale_serve_route`
- `__init__`
- `initialize`
- `_get_session`
- `close`
- `create_service`
- `list_services`
- `get_service`
- `update_service`
- `delete_service`
- `deploy_service`
- `stop_deployment`
- `restart_deployment`
- `remove_deployment`
- `get_deployment`
- `list_deployments`
- `get_deployment_logs`
- `_get_node_url`
- `_get_node_secret`
- `_send_deploy_command`
- `_send_stop_command`
- `_send_restart_command`
- `_send_remove_command`
- `_send_logs_command`
- `get_deployment_manager`
- `init_deployment_manager`

### ushadow/backend/src/services/feature_flags.py
- `__init__`
- `startup`
- `shutdown`
- `_load_flags`
- `is_enabled`
- `get_flag_details`
- `list_flags`
- `update_flag`
- `create_feature_flag_service`
- `get_feature_flag_service`
- `set_feature_flag_service`

### ushadow/backend/src/services/tailscale_serve.py
- `get_tailnet_suffix`
- `get_unode_dns_name`
- `get_service_access_url`
- `get_tailscale_container_name`
- `exec_tailscale_command`
- `add_serve_route`
- `remove_serve_route`
- `reset_serve`
- `get_serve_status`
- `configure_base_routes`
- `add_service_route`
- `remove_service_route`

### ushadow/backend/src/services/capability_resolver.py
- `__init__`
- `resolve_for_service`
- `_resolve_capability`
- `_get_selected_provider`
- `_resolve_env_map`
- `_resolve_config_item`
- `_load_service_config`
- `reload`
- `validate_service`
- `get_setup_requirements`
- `get_capability_resolver`

### ushadow/backend/src/services/kubernetes_manager.py
- `__init__`
- `_init_fernet`
- `_encrypt_kubeconfig`
- `_decrypt_kubeconfig`
- `initialize`
- `add_cluster`
- `list_clusters`
- `get_cluster`
- `remove_cluster`
- `_get_kube_client`
- `deploy_to_kubernetes`
- `init_kubernetes_manager`
- `get_kubernetes_manager`

### ushadow/backend/src/services/docker_manager.py
- `__init__`
- `reload_services`
- `_template_to_service_type`
- `_build_endpoints`
- `initialize`
- `is_available`
- `validate_service_name`
- `_get_container_name`
- `get_service_info`
- `list_services`
- `start_service`
- `_build_env_vars_from_compose_config`
- `_build_env_vars_for_service`
- `_start_service_via_compose`
- `stop_service`
- `restart_service`
- `get_service_logs`
- `add_dynamic_service`
- `get_docker_manager`

### ushadow/backend/src/services/provider_registry.py
- `_get_config_dir`
- `__init__`
- `_load`
- `refresh`
- `_load_capabilities`
- `_load_providers`
- `_load_provider_file`
- `_parse_provider`
- `reload`
- `get_capability`
- `get_capabilities`
- `get_provider`
- `get_providers`
- `find_providers`
- `get_providers_for_capability`
- `get_providers_by_mode`
- `get_default_provider_id`
- `get_default_provider`
- `get_env_to_settings_mapping`
- `get_provider_registry`

---

## DUPLICATE METHODS FOUND

### High-Priority Duplicates (Same exact name, potentially confusing)

| Method Name | Files |
|------------|-------|
| `__init__` | Multiple classes (expected - constructor) |
| `get_service` | `compose_registry.py`, `deployment_manager.py`, `docker.py`, `compose_services.py`, `kubernetes.py`, `yaml_parser.py` |
| `list_services` | `deployment_manager.py`, `docker_manager.py`, `docker.py` |
| `start_service` | `docker_manager.py`, `docker.py` |
| `stop_service` | `docker_manager.py`, `docker.py` |
| `restart_service` | `docker_manager.py`, `docker.py` |
| `get_service_logs` | `docker_manager.py`, `docker.py` |
| `get_cluster` | `kubernetes_manager.py`, `routers/kubernetes.py` |
| `list_clusters` | `kubernetes_manager.py`, `routers/kubernetes.py` |
| `remove_cluster` | `kubernetes_manager.py`, `routers/kubernetes.py` |
| `add_cluster` | `kubernetes_manager.py`, `routers/kubernetes.py` |
| `get_config` | `routers/settings.py`, `routers/tailscale.py` |
| `save_config` | `routers/tailscale.py` |
| `update_config` | `routers/settings.py` |
| `get_deployment` | `deployment_manager.py`, `routers/deployments.py` |
| `list_deployments` | `deployment_manager.py`, `routers/deployments.py` |
| `stop_deployment` | `deployment_manager.py`, `routers/deployments.py` |
| `restart_deployment` | `deployment_manager.py`, `routers/deployments.py` |
| `remove_deployment` | `deployment_manager.py`, `routers/deployments.py` |
| `deploy_service` | `deployment_manager.py`, `routers/deployments.py` |
| `get_deployment_logs` | `deployment_manager.py`, `routers/deployments.py` |
| `initialize` | `unode_manager.py`, `deployment_manager.py`, `docker_manager.py`, `kubernetes_manager.py` |
| `refresh` | `compose_registry.py`, `provider_registry.py` |
| `reload` | `compose_registry.py`, `provider_registry.py`, `capability_resolver.py` |
| `get_join_script` | `routers/unodes.py`, `unode_manager.py` |
| `get_join_script_powershell` | `routers/unodes.py`, `unode_manager.py` |
| `get_bootstrap_script` | `routers/unodes.py` |
| `get_bootstrap_script_bash` | `unode_manager.py` |
| `get_bootstrap_script_powershell` | `routers/unodes.py`, `unode_manager.py` |
| `create_join_token` | `routers/unodes.py`, `unode_manager.py` |
| `register_unode` | `routers/unodes.py`, `unode_manager.py` |
| `list_unodes` | `routers/unodes.py`, `unode_manager.py` |
| `get_unode` | `routers/unodes.py`, `unode_manager.py` |
| `remove_unode` | `routers/unodes.py`, `unode_manager.py` |
| `release_unode` | `routers/unodes.py`, `unode_manager.py` |
| `update_unode_status` | `routers/unodes.py`, `unode_manager.py` |
| `upgrade_unode` | `routers/unodes.py`, `unode_manager.py` |
| `test_connection` | `rest_adapter.py`, `base.py`, `routers/tailscale.py` |
| `fetch_items` | `rest_adapter.py`, `base.py` |
| `fetch_item` | `rest_adapter.py`, `base.py` |
| `get_tailscale_container_name` | `routers/tailscale.py`, `tailscale_serve.py` |
| `get_provider` | `provider_registry.py`, `routers/providers.py` |
| `get_providers` | `provider_registry.py` |
| `find_providers` | `provider_registry.py`, `routers/providers.py` |
| `get_env_schema` | `compose_registry.py` (appears twice - class and instance) |
| `get_settings` | `infra_settings.py` |
| `get_settings_store` | `omegaconf_settings.py` |
| `mask_value` | `secrets.py`, `hooks/useServiceStatus.ts` (cross-language) |
| `is_secret_key` | `secrets.py`, `omegaconf_settings.py` (via `_is_secret_key`) |
| `close` | `rest_adapter.py`, `deployment_manager.py` |
| `get_service_config` | `routers/settings.py` |
| `update_service_config` | `routers/settings.py` |
| `delete_service_config` | `routers/settings.py` |
| `get_services_requiring` | `yaml_parser.py`, `compose_registry.py` |

### Router → Service Pattern (Expected duplicates - API calls service)
These are acceptable patterns where routers call service methods:
- `routers/kubernetes.py` calls `kubernetes_manager.py`
- `routers/deployments.py` calls `deployment_manager.py`
- `routers/docker.py` calls `docker_manager.py`
- `routers/unodes.py` calls `unode_manager.py`

### TypeScript Frontend Duplicates

| Method Name | Files |
|------------|-------|
| `getStatusColor` | `ChronicleQueue.tsx`, `KubernetesClustersPage.tsx`, `ClusterPage.tsx`, `LocalServicesWizard.tsx`, `SpeakerRecognitionWizard.tsx`, `ServiceStatusCard.tsx` |
| `getStatusIcon` | `KubernetesClustersPage.tsx`, `ClusterPage.tsx`, `LocalServicesWizard.tsx`, `SpeakerRecognitionWizard.tsx`, `ServiceStatusCard.tsx` |
| `formatDate` | `MemoryTable.tsx`, `ChronicleConversations.tsx` |
| `handleNext` | Multiple wizards |
| `handleBack` | Multiple wizards |
| `handleSubmit` | `LoginPage.tsx`, `RegistrationPage.tsx` |
| `loadConfig` | `SettingsPage.tsx` |
| `checkContainerStatus` | `TailscaleWizard.tsx`, `SpeakerRecognitionWizard.tsx` |
| `checkContainerStatuses` | `QuickstartWizard.tsx`, `LocalServicesWizard.tsx` |
| `startContainer` | Multiple wizards |
| `saveStepData` | `SpeakerRecognitionWizard.tsx`, `ChronicleWizard.tsx` |
| `canProceed` | Multiple wizards |
| `pollStatus` | Multiple wizards (inline) |
| `ServiceCard` | `LocalServicesWizard.tsx`, `ServiceCard.tsx` (component vs function) |
| `CompleteStep` | Multiple wizards |

---

## Recommendations

1. **getStatusColor/getStatusIcon** - Consider extracting to a shared utility in `utils/statusHelpers.ts`

2. **formatDate** - Create a shared date formatting utility

3. **Wizard step handlers** (handleNext, handleBack, canProceed) - Could potentially use shared hooks or base wizard class

4. **get_tailscale_container_name** - One is in router, one in service - ensure they return the same value or consolidate

5. **Container status polling** - Extract to a shared hook like `useContainerPolling`

6. **get_service patterns** - These are acceptable as they represent different layers (router vs service vs registry)
