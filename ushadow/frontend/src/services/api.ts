import axios from 'axios'
import { getStorageKey } from '../utils/storage'
import type { GraphData, GraphStats } from '../types/graph'

// Get backend URL from environment or auto-detect based on current location
const getBackendUrl = () => {
  const { protocol, hostname, port } = window.location
  console.log('Location:', { protocol, hostname, port })

  const isStandardPort = (protocol === 'https:' && (port === '' || port === '443')) ||
                         (protocol === 'http:' && (port === '' || port === '80'))

  // If explicitly set in environment, use that (highest priority)
  if (import.meta.env.VITE_API_URL !== undefined && import.meta.env.VITE_API_URL !== '') {
    console.log('Using explicit VITE_API_URL:', import.meta.env.VITE_API_URL)
    return import.meta.env.VITE_API_URL
  }

  // Check if we have a base path from Vite build config (for path-based deployments)
  const viteBasePath = import.meta.env.BASE_URL
  if (viteBasePath && viteBasePath !== '/') {
    console.log('Using Vite BASE_URL for path-based routing:', viteBasePath)
    return viteBasePath.replace(/\/$/, '')
  }

  // Standard port (80/443) - use relative URLs via proxy
  if (isStandardPort) {
    console.log('Using relative URLs via proxy')
    return ''
  }

  // Development mode - Vite dev server (port 5173)
  if (port === '5173') {
    console.log('Development mode - using default backend URL')
    return 'http://localhost:8010'
  }

  // Fallback - calculate backend port from frontend port
  // Frontend runs on 3000 + offset, backend on 8000 + offset
  const frontendPort = parseInt(port)
  if (isNaN(frontendPort)) {
    // Invalid or empty port - use relative URLs as safest default
    console.log('Unknown port, using relative URLs via proxy')
    return ''
  }
  const backendPort = frontendPort - 3000 + 8000
  console.log('Calculated backend port:', backendPort)
  return `${protocol}//${hostname}:${backendPort}`
}

const BACKEND_URL = getBackendUrl()
console.log('VITE_API_URL:', import.meta.env.VITE_API_URL)
console.log('🌐 API: Backend URL configured as:', BACKEND_URL || 'Same origin (relative URLs)')

// Export BACKEND_URL for use in other components
export { BACKEND_URL }

export const api = axios.create({
  baseURL: BACKEND_URL,
  timeout: 60000,  // 60 seconds for heavy processing scenarios
})

// Add request interceptor to include auth token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(getStorageKey('token'))
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Add response interceptor to handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Only clear token and redirect on actual 401 responses, not on timeouts
    if (error.response?.status === 401) {
      const url = error.config?.url || ''

      // Don't logout on 401s from proxied services (Chronicle, etc.)
      // These services may have their own auth issues that shouldn't affect ushadow login
      const isServiceProxy = url.includes('/api/services/') && url.includes('/proxy/')

      if (isServiceProxy) {
        console.warn('🔐 API: 401 from proxied service - not logging out:', url)
        // Let the component handle the service-specific auth error
      } else {
        // Token expired or invalid on core ushadow endpoints, redirect to login
        console.warn('🔐 API: 401 Unauthorized on ushadow endpoint - clearing token and redirecting to login')
        localStorage.removeItem(getStorageKey('token'))
        window.location.href = '/login'
      }
    } else if (error.code === 'ECONNABORTED') {
      // Request timeout - don't logout, just log it
      console.warn('⏱️ API: Request timeout - server may be busy')
    } else if (!error.response) {
      // Network error - don't logout
      console.warn('🌐 API: Network error - server may be unreachable')
    }
    return Promise.reject(error)
  }
)

// API endpoints
export const authApi = {
  login: async (email: string, password: string) => {
    return api.post('/api/auth/login', { email, password })
  },
  getMe: () => api.get('/api/auth/me'),
}

export const setupApi = {
  getSetupStatus: () => api.get('/api/auth/setup/status'),
  createAdmin: (setupData: {
    display_name: string
    email: string
    password: string
    confirm_password: string
  }) => api.post('/api/auth/setup', setupData),
}

// Chronicle integration endpoints
export const chronicleApi = {
  getStatus: () => api.get('/api/chronicle/status'),
  getConversations: () => api.get('/api/chronicle/conversations'),
  getConversation: (id: string) => api.get(`/api/chronicle/conversations/${id}`),
}

// Mycelia integration endpoints
// Mycelia service name constant - ensures consistency
const MYCELIA_SERVICE = 'mycelia-backend'

export const myceliaApi = {
  // Connection info for service discovery
  getConnectionInfo: () => api.get(`/api/services/${MYCELIA_SERVICE}/connection-info`),

  getStatus: () => api.get(`/api/services/${MYCELIA_SERVICE}/proxy/health`),

  // Conversations
  getConversations: (params?: { limit?: number; skip?: number; start?: string; end?: string }) =>
    api.get(`/api/services/${MYCELIA_SERVICE}/proxy/data/conversations`, { params }),
  getConversation: (id: string) =>
    api.get(`/api/services/${MYCELIA_SERVICE}/proxy/data/conversations/${id}`),
  getConversationStats: () => api.get(`/api/services/${MYCELIA_SERVICE}/proxy/data/conversations/stats`),

  // Audio Timeline Data
  getAudioItems: (params: { start: string; end: string; resolution?: string }) =>
    api.get(`/api/services/${MYCELIA_SERVICE}/proxy/data/audio/items`, { params }),

  // Generic Resource Access (for MCP-style resources)
  callResource: (resourceName: string, body: any) =>
    api.post(`/api/services/${MYCELIA_SERVICE}/proxy/api/resource/${resourceName}`, body),
}

// MCP integration endpoints
export const mcpApi = {
  getStatus: () => api.get('/api/mcp/status'),
  getServers: () => api.get('/api/mcp/servers'),
  connectServer: (serverUrl: string) => api.post('/api/mcp/connect', { server_url: serverUrl }),
}

// Agent Zero integration endpoints
export const agentZeroApi = {
  getStatus: () => api.get('/api/agent-zero/status'),
  getAgents: () => api.get('/api/agent-zero/agents'),
  createAgent: (agentData: any) => api.post('/api/agent-zero/agents', agentData),
}

// n8n integration endpoints
export const n8nApi = {
  getStatus: () => api.get('/api/n8n/status'),
  getWorkflows: () => api.get('/api/n8n/workflows'),
  triggerWorkflow: (workflowId: string, data?: any) => api.post(`/api/n8n/workflows/${workflowId}/trigger`, data),
}

// Settings endpoints
export const settingsApi = {
  getAll: () => api.get('/api/settings'),
  getSetting: (keyPath: string) => api.get(`/api/settings/${keyPath}`),
  getConfig: () => api.get('/api/settings/config'),
  update: (updates: any) => api.put('/api/settings/config', updates),
  syncEnv: () => api.post('/api/settings/sync-env'),
  reset: () => api.post('/api/settings/reset'),
  refresh: () => api.post('/api/settings/refresh'),

  /** Get unmasked secret value by path (server-side only) */
  getSecret: (keyPath: string) => api.get<{ value: string }>(`/api/settings/secret/${keyPath}`),

  // Service-specific config namespace
  getAllServiceConfigs: () => api.get('/api/settings/service-configs'),
  getServiceConfig: (serviceId: string) => api.get(`/api/settings/service-configs/${serviceId}`),
  updateServiceConfig: (serviceId: string, updates: any) =>
    api.put(`/api/settings/service-configs/${serviceId}`, updates),
  deleteServiceConfig: (serviceId: string) => api.delete(`/api/settings/service-configs/${serviceId}`),
}

// =============================================================================
// Unified Services API - All service operations go through /api/services
// =============================================================================

export const servicesApi = {
  // -------------------------------------------------------------------------
  // Discovery
  // -------------------------------------------------------------------------

  /** List installed services */
  getInstalled: () => api.get<ComposeService[]>('/api/services/'),

  /** List all available services (catalog) */
  getCatalog: () => api.get<ComposeService[]>('/api/services/catalog'),

  /** Get service details */
  getService: (name: string, includeEnv: boolean = false) =>
    api.get(`/api/services/${name}`, { params: { include_env: includeEnv } }),

  /** Get services by capability */
  getByCapability: (capability: string) =>
    api.get<ComposeService[]>(`/api/services/by-capability/${capability}`),

  // -------------------------------------------------------------------------
  // Status
  // -------------------------------------------------------------------------

  /** Check Docker daemon availability */
  getDockerStatus: () => api.get<{ available: boolean; message: string }>('/api/services/docker-status'),

  /** Get lightweight status for all services (optimized for polling) */
  getAllStatuses: () => api.get<Record<string, { name: string; status: string; health?: string }>>('/api/services/status'),

  /** Get status for a single service */
  getServiceStatus: (name: string) => api.get(`/api/services/${name}/status`),

  /** Get Docker container details for a service */
  getDockerDetails: (name: string) => api.get(`/api/services/${name}/docker`),

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /** Pre-flight check before starting a service (checks for port conflicts) */
  preflightCheck: (name: string) => api.get<{
    can_start: boolean
    port_conflicts: Array<{
      port: number
      env_var: string | null
      used_by: string
      suggested_port: number
    }>
    message: string | null
  }>(`/api/services/${name}/preflight`),

  /** Set a port override for a service */
  setPortOverride: (name: string, envVar: string, port: number) =>
    api.post<{ success: boolean; message: string }>(`/api/services/${name}/port-override`, {
      env_var: envVar,
      port
    }),

  /** Get connection info for a service (URL with resolved port) */
  getConnectionInfo: (name: string) =>
    api.get<{
      service: string
      url: string | null
      port: number | null
      env_var: string | null
      default_port: number | null
    }>(`/api/services/${name}/connection-info`),

  /** Start a service container */
  startService: (name: string) => api.post<{ success: boolean; message: string }>(`/api/services/${name}/start`),

  /** Stop a service container */
  stopService: (name: string) => api.post<{ success: boolean; message: string }>(`/api/services/${name}/stop`),

  /** Restart a service container */
  restartService: (name: string) => api.post<{ success: boolean; message: string }>(`/api/services/${name}/restart`),

  /** Get logs from a service container */
  getLogs: (name: string, tail: number = 100) =>
    api.get<{ success: boolean; logs: string }>(`/api/services/${name}/logs`, { params: { tail } }),

  // -------------------------------------------------------------------------
  // Configuration
  // -------------------------------------------------------------------------

  /** Get enabled state for a service */
  getEnabledState: (name: string) => api.get(`/api/services/${name}/enabled`),

  /** Enable or disable a service */
  setEnabled: (name: string, enabled: boolean) =>
    api.put(`/api/services/${name}/enabled`, { enabled }),

  /** Get full service configuration */
  getConfig: (name: string) => api.get(`/api/services/${name}/config`),

  /** Get environment variable configuration with suggestions */
  getEnvConfig: (name: string, deployTarget?: string) => api.get<{
    service_id: string
    service_name: string
    compose_file: string
    requires: string[]
    required_env_vars: EnvVarInfo[]
    optional_env_vars: EnvVarInfo[]
  }>(`/api/services/${name}/env${deployTarget ? `?deploy_target=${encodeURIComponent(deployTarget)}` : ''}`),

  /** Save environment variable configuration */
  updateEnvConfig: (name: string, envVars: EnvVarConfig[]) =>
    api.put(`/api/services/${name}/env`, { env_vars: envVars }),

  /** Resolve environment variables for runtime injection */
  resolveEnv: (name: string) => api.get<{
    service_id: string
    ready: boolean
    resolved: Record<string, string>
    missing: string[]
    compose_file: string
  }>(`/api/services/${name}/resolve`),

  // -------------------------------------------------------------------------
  // Installation
  // -------------------------------------------------------------------------

  /** Install a service from the catalog */
  install: (name: string) =>
    api.post<{ service_id: string; service_name: string; installed: boolean; message: string }>(
      `/api/services/${name}/install`
    ),

  /** Uninstall a service */
  uninstall: (name: string) =>
    api.post<{ service_id: string; service_name: string; installed: boolean; message: string }>(
      `/api/services/${name}/uninstall`
    ),

  /** Register a dynamic service */
  register: (config: {
    service_name: string
    description?: string
    service_type?: string
    endpoints?: Array<{ url: string; integration_type?: string }>
    user_controllable?: boolean
    compose_file?: string
    metadata?: Record<string, any>
  }) => api.post<{ success: boolean; message: string }>('/api/services/register', config),

  /** Generate Mycelia authentication token */
  generateMyceliaToken: () => api.post<{ token: string; client_id: string }>('/api/services/mycelia/generate-token'),
}

// Compose service configuration endpoints
export interface EnvVarConfig {
  name: string
  // Old sources: 'setting' | 'new_setting' | 'literal' | 'default'
  // New v2 sources: 'config_default' | 'compose_default' | 'env_file' | 'capability' | 'deploy_env' | 'user_override' | 'not_found'
  source: string
  setting_path?: string      // For source='setting' - existing setting to map
  new_setting_path?: string  // For source='new_setting' - new setting path to create
  value?: string             // For source='literal' or 'new_setting', or resolved value
  locked?: boolean           // For provider-supplied values that cannot be edited
  provider_name?: string     // Name of the provider supplying this value
}

export interface EnvVarSuggestion {
  path: string
  label: string
  has_value: boolean
  value?: string  // Masked for secrets
  capability?: string
  provider_name?: string
}

export interface EnvVarInfo {
  name: string
  is_required: boolean
  source: string
  setting_path?: string
  resolved_value?: string
  suggestions: EnvVarSuggestion[]
  locked?: boolean
  provider_name?: string
}

/** Missing key that needs to be configured for a provider */
export interface MissingKey {
  key: string
  label: string
  settings_path?: string
  link?: string
  type: 'secret' | 'url' | 'string'
}

/** Capability requirement with provider info and missing keys */
export interface CapabilityRequirement {
  id: string
  selected_provider?: string
  provider_name?: string
  provider_mode?: 'cloud' | 'local'
  configured: boolean
  missing_keys: MissingKey[]
  error?: string
}

/** Service info with display name for wizard */
export interface ServiceInfo {
  name: string  // Technical name (e.g., "mem0")
  display_name: string  // Human-readable name (e.g., "OpenMemory")
  description?: string
}

/** Quickstart wizard response - aggregated capability requirements */
export interface QuickstartConfig {
  required_capabilities: CapabilityRequirement[]
  services: ServiceInfo[]  // Full service info, not just names
  all_configured: boolean
}

export interface PortMapping {
  host?: string       // Resolved host port (with overrides applied)
  container?: string  // Container port
  env_var?: string    // Environment variable name for this port
  default_port?: number // Default port from compose file
}

export interface ComposeService {
  service_id: string
  service_name: string
  compose_file: string
  image?: string
  description?: string
  requires: string[]
  depends_on: string[]
  ports: PortMapping[]
  enabled: boolean
  required_env_count: number
  optional_env_count: number
  needs_setup: boolean
  installed?: boolean  // For catalog view - whether service is installed
  status?: string      // Container status (running, stopped, etc.)
  health?: string      // Container health (healthy, unhealthy, etc.)
  profiles?: string[]  // Docker compose profiles
  wizard?: string      // ID of setup wizard if available (e.g., "mycelia")
}

// Quickstart wizard endpoints (kept separate from services)
export const quickstartApi = {
  /** Get quickstart config - capability requirements for default services */
  getConfig: () => api.get<QuickstartConfig>('/api/wizard/quickstart'),

  /** Save quickstart config - save key values (settings_path -> value) */
  saveConfig: (keyValues: Record<string, string>) =>
    api.post<{ success: boolean; saved: number; message: string }>('/api/wizard/quickstart', keyValues),
}

// Docker daemon status (minimal - only checks if Docker is available)
export const dockerApi = {
  /** Check if Docker daemon is available */
  getStatus: () => api.get<{ available: boolean; message: string }>('/api/docker/status'),
}

// Users endpoints
export const usersApi = {
  getAll: () => api.get('/api/users'),
  getById: (id: string) => api.get(`/api/users/${id}`),
  create: (userData: any) => api.post('/api/users', userData),
  update: (id: string, userData: any) => api.put(`/api/users/${id}`, userData),
  delete: (id: string) => api.delete(`/api/users/${id}`),
}

// HuggingFace status response type
export interface HuggingFaceStatus {
  connected: boolean
  username: string | null
  has_token: boolean
  error: string | null
}

// HuggingFace model access types
export interface ModelAccessStatus {
  model_id: string
  has_access: boolean
  error: string | null
}

export interface HuggingFaceModelsResponse {
  models: ModelAccessStatus[]
  all_accessible: boolean
}

// Wizard endpoints
export const wizardApi = {
  getApiKeys: () => api.get('/api/wizard/api-keys'),
  updateApiKeys: (apiKeys: {
    openai_api_key?: string
    deepgram_api_key?: string
    mistral_api_key?: string
    anthropic_api_key?: string
    hf_token?: string  // HuggingFace token for speaker-recognition
  }) => api.put('/api/wizard/api-keys', apiKeys),
  updateProviders: (providers: any) => settingsApi.update(providers),
  complete: () => api.post('/api/wizard/complete'),
  // HuggingFace validation
  getHuggingFaceStatus: () => api.get<HuggingFaceStatus>('/api/wizard/huggingface/status'),
  checkHuggingFaceModels: () => api.get<HuggingFaceModelsResponse>('/api/wizard/huggingface/models'),
}

// Cluster/UNode endpoints
export const clusterApi = {
  listUnodes: () => api.get('/api/unodes'),
  discoverPeers: () => api.get('/api/unodes/discover/peers'),
  getUnode: (hostname: string) => api.get(`/api/unodes/${hostname}`),
  removeUnode: (hostname: string) => api.delete(`/api/unodes/${hostname}`),
  releaseNode: (hostname: string) => api.post(`/api/unodes/${hostname}/release`),
  createToken: (tokenData: { role: string; max_uses: number; expires_in_hours: number }) =>
    api.post('/api/unodes/tokens', tokenData),
  claimNode: (hostname: string, tailscale_ip: string) =>
    api.post('/api/unodes/claim', { hostname, tailscale_ip }),
  probeNode: (tailscale_ip: string, port: number = 8444) =>
    api.post('/api/unodes/probe', { tailscale_ip, port }),
  // Upgrade endpoints
  upgradeNode: (hostname: string, version: string = 'latest') =>
    api.post(`/api/unodes/${hostname}/upgrade`, { version }),
  upgradeAllNodes: (version: string = 'latest') =>
    api.post('/api/unodes/upgrade-all', { version }),
  // Version management
  getManagerVersions: () => api.get<{
    versions: string[]
    latest: string
    registry: string
    image: string
  }>('/api/unodes/versions'),
  // Leader info for mobile app / cluster display
  getLeaderInfo: () => api.get<{
    hostname: string
    tailscale_ip: string
    capabilities: {
      can_run_docker: boolean
      can_run_gpu: boolean
      can_become_leader: boolean
      available_memory_mb: number
      available_cpu_cores: number
      available_disk_gb: number
    }
    api_port: number
    ws_pcm_url: string
    ws_omi_url: string
    unodes: Array<{
      id: string
      hostname: string
      tailscale_ip: string
      status: string
      role: string
      platform: string
      last_seen?: string
      capabilities?: {
        can_run_docker: boolean
        can_run_gpu: boolean
        can_become_leader: boolean
        available_memory_mb: number
        available_cpu_cores: number
        available_disk_gb: number
      }
      services?: string[]
      manager_version?: string
    }>
    services: Array<{
      name: string
      display_name: string
      status: string
      unode_hostname: string
    }>
  }>('/api/unodes/leader/info'),
}

// Kubernetes cluster endpoints
export interface KubernetesCluster {
  cluster_id: string
  name: string
  context: string
  server: string
  status: 'connected' | 'unreachable' | 'unauthorized' | 'error'
  version?: string
  node_count?: number
  namespace: string
  labels: Record<string, string>
  infra_scans?: Record<string, any>
  deployment_target_id?: string  // Unified deployment target ID: {name}.k8s.{environment}

  // Ingress configuration
  ingress_domain?: string
  ingress_class?: string
  ingress_enabled_by_default?: boolean
  tailscale_magicdns_enabled?: boolean
}

export const kubernetesApi = {
  addCluster: (data: { name: string; kubeconfig: string; context?: string; namespace?: string; labels?: Record<string, string> }) =>
    api.post<KubernetesCluster>('/api/kubernetes', data),
  listClusters: () =>
    api.get<KubernetesCluster[]>('/api/kubernetes'),
  getCluster: (clusterId: string) =>
    api.get<KubernetesCluster>(`/api/kubernetes/${clusterId}`),
  removeCluster: (clusterId: string) =>
    api.delete(`/api/kubernetes/${clusterId}`),
  updateCluster: (clusterId: string, updates: Partial<Pick<KubernetesCluster, 'name' | 'namespace' | 'labels' | 'ingress_domain' | 'ingress_class' | 'ingress_enabled_by_default' | 'tailscale_magicdns_enabled'>>) =>
    api.patch<KubernetesCluster>(`/api/kubernetes/${clusterId}`, updates),

  // Service management
  getAvailableServices: () =>
    api.get<{ services: any[] }>('/api/kubernetes/services/available'),
  getInfraServices: () =>
    api.get<{ services: any[] }>('/api/kubernetes/services/infra'),

  // Cluster operations
  scanInfraServices: (clusterId: string, namespace: string = 'default') =>
    api.post<{ cluster_id: string; namespace: string; infra_services: Record<string, any> }>(
      `/api/kubernetes/${clusterId}/scan-infra`,
      { namespace }
    ),
  createEnvmap: (clusterId: string, data: { service_name: string; namespace?: string; env_vars: Record<string, string> }) =>
    api.post<{ success: boolean; configmap: string | null; secret: string | null; namespace: string }>(
      `/api/kubernetes/${clusterId}/envmap`,
      { namespace: 'default', ...data }
    ),
  deployService: (clusterId: string, data: { service_id: string; namespace?: string; k8s_spec?: any; config_id?: string }) =>
    api.post<{ success: boolean; message: string; service_id: string; namespace: string }>(
      `/api/kubernetes/${clusterId}/deploy`,
      { namespace: 'default', ...data }
    ),

  // Pod operations
  listPods: (clusterId: string, namespace: string = 'ushadow') =>
    api.get<{ pods: Array<{ name: string; namespace: string; status: string; restarts: number; age: string; labels: Record<string, string>; node: string }>; namespace: string }>(
      `/api/kubernetes/${clusterId}/pods?namespace=${namespace}`
    ),
  getPodLogs: (clusterId: string, podName: string, namespace: string = 'ushadow', previous: boolean = false, tailLines: number = 100) =>
    api.get<{ pod_name: string; namespace: string; previous: boolean; logs: string }>(
      `/api/kubernetes/${clusterId}/pods/${podName}/logs?namespace=${namespace}&previous=${previous}&tail_lines=${tailLines}`
    ),
  getPodEvents: (clusterId: string, podName: string, namespace: string = 'ushadow') =>
    api.get<{ pod_name: string; namespace: string; events: Array<{ type: string; reason: string; message: string; count: number; first_timestamp: string | null; last_timestamp: string | null }> }>(
      `/api/kubernetes/${clusterId}/pods/${podName}/events?namespace=${namespace}`
    ),
}

// Service Definition and Deployment types
export interface ServiceDefinition {
  service_id: string
  name: string
  description: string
  image: string
  ports: Record<string, number>
  environment: Record<string, string>
  volumes: string[]
  command?: string
  restart_policy: string
  network?: string
  health_check_path?: string
  health_check_port?: number
  tags: string[]
  metadata: Record<string, any>
  created_at?: string
  updated_at?: string
  created_by?: string
}

export interface Deployment {
  id: string
  service_id: string
  unode_hostname: string
  status: 'pending' | 'deploying' | 'running' | 'stopped' | 'failed' | 'removing'
  container_id?: string
  container_name?: string
  created_at?: string
  deployed_at?: string
  stopped_at?: string
  last_health_check?: string
  healthy?: boolean
  health_message?: string
  error?: string
  retry_count: number
  deployed_config?: Record<string, any>
  access_url?: string
  exposed_port?: number
}

export interface DeployTarget {
  // Core identity fields (always present)
  id: string  // deployment_target_id format: {identifier}.{type}.{environment}
  type: 'docker' | 'k8s'
  name: string  // Human-readable name
  identifier: string  // hostname (docker) or cluster_id (k8s)
  environment: string  // e.g., 'purple', 'production'

  // Status and health
  status: string  // online/offline/healthy/unknown

  // Platform-specific fields (optional)
  namespace?: string  // K8s namespace (k8s only)
  infrastructure?: Record<string, any>  // Infrastructure scan data (k8s only)

  // Common metadata
  provider?: string  // local/remote/eks/gke/aks
  region?: string  // Region or location
  is_leader?: boolean  // Is this the leader node (docker only)

  // Raw data for advanced use cases
  raw_metadata: Record<string, any>  // Original UNode or KubernetesCluster data
}

export const deploymentsApi = {
  // Deployment targets (unified)
  listTargets: () => api.get<DeployTarget[]>('/api/deployments/targets'),

  // Service definitions
  createService: (data: Omit<ServiceDefinition, 'created_at' | 'updated_at' | 'created_by'>) =>
    api.post('/api/deployments/services', data),
  listServices: () => api.get<ServiceDefinition[]>('/api/deployments/services'),
  getService: (serviceId: string) => api.get<ServiceDefinition>(`/api/deployments/services/${serviceId}`),
  updateService: (serviceId: string, data: Partial<ServiceDefinition>) =>
    api.put(`/api/deployments/services/${serviceId}`, data),
  deleteService: (serviceId: string) => api.delete(`/api/deployments/services/${serviceId}`),

  // Deployments
  deploy: (serviceId: string, unodeHostname: string, configId?: string) =>
    api.post<Deployment>('/api/deployments/deploy', { service_id: serviceId, unode_hostname: unodeHostname, config_id: configId }),
  listDeployments: (params?: { service_id?: string; unode_hostname?: string }) =>
    api.get<Deployment[]>('/api/deployments', { params }),
  getDeployment: (deploymentId: string) => api.get<Deployment>(`/api/deployments/${deploymentId}`),
  stopDeployment: (deploymentId: string) => api.post<Deployment>(`/api/deployments/${deploymentId}/stop`),
  restartDeployment: (deploymentId: string) => api.post<Deployment>(`/api/deployments/${deploymentId}/restart`),
  updateDeployment: (deploymentId: string, envVars: Record<string, string>) =>
    api.put<Deployment>(`/api/deployments/${deploymentId}`, { env_vars: envVars }),
  removeDeployment: (deploymentId: string) => api.delete(`/api/deployments/${deploymentId}`),
  getDeploymentLogs: (deploymentId: string, tail?: number) =>
    api.get<{ logs: string }>(`/api/deployments/${deploymentId}/logs`, { params: { tail: tail || 100 } }),

  // Exposed URLs for service discovery
  getExposedUrls: (params?: { type?: string; name?: string }) =>
    api.get<ExposedUrl[]>('/api/deployments/exposed-urls', { params }),
}

// Exposed URL types (for service discovery)
export interface ExposedUrl {
  instance_id: string
  instance_name: string
  url: string
  type: string  // e.g., "audio", "http", etc.
  name: string  // e.g., "audio_intake"
  metadata: Record<string, any>
  status: string  // e.g., "running"
}

// Tailscale Setup Wizard types
export interface TailscaleConfig {
  hostname: string
  deployment_mode: {
    mode: 'single' | 'multi'
    environment?: string
  }
  https_enabled: boolean
  use_caddy_proxy: boolean
  backend_port: number
  frontend_port: number | null  // null = auto-detect (5173 dev, 80 prod)
  environments: string[]
}

export interface PlatformInfo {
  os_type: 'linux' | 'darwin' | 'windows' | 'unknown'
  os_version: string
  architecture: string
  is_docker: boolean
  tailscale_installed: boolean
}

export interface EnvironmentInfo {
  name: string
  tailscale_hostname: string
  tailscale_container_name: string
  tailscale_volume_name: string
}

export interface CertificateStatus {
  provisioned: boolean
  cert_path?: string
  key_path?: string
  expires_at?: string
  error?: string
}

export interface AccessUrls {
  frontend: string
  backend: string
  environments: Record<string, { frontend: string; backend: string }>
}

export interface ContainerStatus {
  exists: boolean
  running: boolean
  authenticated: boolean
  hostname?: string
  ip_address?: string
}

export interface AuthUrlResponse {
  auth_url: string
  web_url: string
  qr_code_data: string
}

export interface TailnetSettings {
  magic_dns: {
    enabled: boolean
    suffix: string | null
    admin_url: string
  }
  https_serve: {
    enabled: boolean | null
    error: string | null
    admin_url: string
  }
}

// =============================================================================
// Provider Types (capability-based service composition)
// =============================================================================

/** Summary returned by list endpoints */
export interface ProviderSummary {
  id: string
  name: string
  capability: string
}

/** EnvMap - maps settings to environment variables */
export interface EnvMap {
  key: string
  env_var: string
  label: string | null
  type: 'string' | 'secret' | 'url' | 'boolean' | 'integer'
  required: boolean
  settings_path: string | null
  link: string | null
  default: string | null
}

/** Missing required field */
export interface MissingField {
  key: string
  label: string
  settings_path: string | null
  link: string | null
}

/** Credential with value status (from /capabilities providers) */
export interface Credential {
  key: string
  type: 'string' | 'secret' | 'url' | 'boolean' | 'integer'
  label: string
  settings_path: string | null
  link: string | null
  required: boolean
  default: string | null
  has_value: boolean
  value: string | null  // Actual value for non-secrets only
}

/** Provider with config status (from /providers/capability/{id} or /capabilities) */
export interface ProviderWithStatus {
  id: string
  name: string
  description: string | null
  mode: 'cloud' | 'local'
  icon: string | null
  tags: string[]
  configured: boolean
  missing: MissingField[]
  is_selected?: boolean
  is_default?: boolean
  credentials?: Credential[]
  /** Whether the provider's service is available/reachable (for local providers) */
  available?: boolean
  /** Whether the provider needs external setup (local providers that aren't running) */
  setup_needed?: boolean
}

/** Full provider details (from /providers/{id}) */
export interface Provider {
  id: string
  name: string
  description: string | null
  capability: string
  mode: 'cloud' | 'local'
  icon: string | null
  tags: string[]
  env_maps: EnvMap[]
  configured: boolean
  missing: MissingField[]
}

/** Capability with providers and selection status */
export interface Capability {
  id: string
  description: string
  selected_provider: string | null
  providers: ProviderWithStatus[]
}

/** Provider selection state */
export interface SelectedProviders {
  wizard_mode: 'quickstart' | 'local' | 'custom'
  selected_providers: Record<string, string>
}

/** Query parameters for finding providers */
export interface ProviderQuery {
  capability?: string
  mode?: 'cloud' | 'local'
  configured?: boolean
}

// =============================================================================
// Provider API
// =============================================================================

export const providersApi = {
  /** List all providers (summary: id, name, capability) */
  listProviders: () =>
    api.get<ProviderSummary[]>('/api/providers'),

  /** Get providers for a capability with config status */
  getProvidersByCapability: (capability: string) =>
    api.get<ProviderWithStatus[]>(`/api/providers/capability/${capability}`),

  /** Get full provider details */
  getProvider: (providerId: string) =>
    api.get<Provider>(`/api/providers/${providerId}`),

  /** Get missing required fields for a provider */
  getMissingFields: (providerId: string) =>
    api.get<{ provider_id: string; configured: boolean; missing: MissingField[] }>(
      `/api/providers/${providerId}/missing`
    ),

  /** Find providers matching criteria */
  findProviders: (query: ProviderQuery) =>
    api.post<Provider[]>('/api/providers/find', query),

  /** List all capabilities with selected provider */
  getCapabilities: () =>
    api.get<Capability[]>('/api/providers/capabilities'),

  /** Get current provider selections */
  getSelected: () =>
    api.get<SelectedProviders>('/api/providers/selected'),

  /** Update provider selections */
  updateSelected: (update: {
    wizard_mode?: string
    selected_providers?: Record<string, string>
  }) => api.put<SelectedProviders>('/api/providers/selected', update),

  /** Select a single provider for a capability */
  selectProvider: (capability: string, providerId: string) =>
    api.put<SelectedProviders>('/api/providers/selected', {
      selected_providers: { [capability]: providerId }
    }),

  /** Apply default providers for a mode (cloud/local) */
  applyDefaults: (mode: 'cloud' | 'local') =>
    api.post<SelectedProviders>(`/api/providers/apply-defaults/${mode}`),
}

// =============================================================================
// OpenMemory API (connects to mem0 backend)
// =============================================================================

import type {
  Memory,
  ApiMemoryItem,
  MemoriesApiResponse,
  MemoryFilters,
  MemoryAccessLog,
  MemoryStats,
} from '../types/memory'

/** Convert API response to internal Memory format */
const adaptMemoryItem = (item: ApiMemoryItem): Memory => {
  // Handle both ISO strings and Unix timestamps (seconds or milliseconds)
  let timestamp: number
  if (typeof item.created_at === 'string') {
    // Try parsing as ISO string first
    timestamp = new Date(item.created_at).getTime()
  } else {
    // Numeric timestamp - check if it's in seconds or milliseconds
    const numericTimestamp = Number(item.created_at)
    // If timestamp is less than year 2000 in milliseconds (946684800000),
    // it's likely in seconds, so convert to milliseconds
    timestamp = numericTimestamp < 946684800000
      ? numericTimestamp * 1000
      : numericTimestamp
  }

  return {
    id: item.id,
    memory: item.content,
    created_at: timestamp,
    state: item.state as Memory['state'],
    metadata: item.metadata_ || {},
    categories: item.categories as Memory['categories'],
    client: 'api',
    app_name: item.app_name,
  }
}

export type MemorySource = 'openmemory' | 'mycelia'

export const memoriesApi = {
  /** Get memory server URL based on selected source */
  getServerUrl: async (source: MemorySource = 'openmemory'): Promise<string> => {
    if (source === 'mycelia') {
      try {
        // Get connection info from mycelia service
        const response = await servicesApi.getConnectionInfo('mycelia')
        // Use proxy_url for REST API access through backend (uses Docker service name internally)
        if (response.data?.proxy_url) {
          return response.data.proxy_url
        }
      } catch (err) {
        console.warn('Failed to get mycelia connection info:', err)
        throw new Error('Mycelia service not available')
      }
    }

    // OpenMemory (mem0) - check for mem0 service first, then fallback to settings
    if (source === 'openmemory') {
      try {
        // Try to get connection info from mem0 service (uses Docker service name internally)
        const response = await servicesApi.getConnectionInfo('mem0')
        if (response.data?.proxy_url) {
          return response.data.proxy_url
        }
      } catch (err) {
        console.warn('mem0 service not found via connection-info, trying settings/localhost')
      }
    }

    // Final fallback - use settings or default localhost
    try {
      const response = await settingsApi.getConfig()
      return response.data?.infrastructure?.openmemory_server_url || 'http://localhost:8765'
    } catch {
      return 'http://localhost:8765'
    }
  },

  /** Fetch memories with filtering and pagination */
  fetchMemories: async (
    userId: string,
    query?: string,
    page: number = 1,
    size: number = 10,
    filters?: MemoryFilters,
    source: MemorySource = 'openmemory'
  ): Promise<{ memories: Memory[]; total: number; pages: number }> => {
    const serverUrl = await memoriesApi.getServerUrl(source)
    const response = await axios.post<MemoriesApiResponse>(
      `${serverUrl}/api/v1/memories/filter`,
      {
        user_id: userId,
        page,
        size,
        search_query: query,
        app_ids: filters?.apps,
        category_ids: filters?.categories,
        sort_column: filters?.sortColumn?.toLowerCase(),
        sort_direction: filters?.sortDirection,
        show_archived: filters?.showArchived,
      }
    )
    return {
      memories: response.data.items.map(adaptMemoryItem),
      total: response.data.total,
      pages: response.data.pages,
    }
  },

  /** Get a single memory by ID */
  getMemory: async (userId: string, memoryId: string, source: MemorySource = 'openmemory'): Promise<Memory> => {
    const serverUrl = await memoriesApi.getServerUrl(source)
    const response = await axios.get<ApiMemoryItem>(
      `${serverUrl}/api/v1/memories/${memoryId}?user_id=${userId}`
    )
    return adaptMemoryItem(response.data)
  },

  /** Create a new memory */
  createMemory: async (
    userId: string,
    text: string,
    infer: boolean = true,
    app: string = 'ushadow'
  ): Promise<Memory> => {
    const serverUrl = await memoriesApi.getServerUrl()
    const response = await axios.post<ApiMemoryItem>(`${serverUrl}/api/v1/memories/`, {
      user_id: userId,
      text,
      infer,
      app,
    })
    return adaptMemoryItem(response.data)
  },

  /** Update memory content */
  updateMemory: async (userId: string, memoryId: string, content: string): Promise<void> => {
    const serverUrl = await memoriesApi.getServerUrl()
    await axios.put(`${serverUrl}/api/v1/memories/${memoryId}`, {
      memory_id: memoryId,
      memory_content: content,
      user_id: userId,
    })
  },

  /** Update memory state (pause, archive, etc.) */
  updateMemoryState: async (
    userId: string,
    memoryIds: string[],
    state: Memory['state']
  ): Promise<void> => {
    const serverUrl = await memoriesApi.getServerUrl()
    await axios.post(`${serverUrl}/api/v1/memories/actions/pause`, {
      memory_ids: memoryIds,
      all_for_app: true,
      state,
      user_id: userId,
    })
  },

  /** Delete memories */
  deleteMemories: async (userId: string, memoryIds: string[]): Promise<void> => {
    const serverUrl = await memoriesApi.getServerUrl()
    await axios.delete(`${serverUrl}/api/v1/memories/`, {
      data: { memory_ids: memoryIds, user_id: userId },
    })
  },

  /** Get access logs for a memory */
  getAccessLogs: async (
    memoryId: string,
    page: number = 1,
    pageSize: number = 10
  ): Promise<{ logs: MemoryAccessLog[]; total: number }> => {
    const serverUrl = await memoriesApi.getServerUrl()
    const response = await axios.get<{ logs: MemoryAccessLog[]; total: number }>(
      `${serverUrl}/api/v1/memories/${memoryId}/access-log?page=${page}&page_size=${pageSize}`
    )
    return response.data
  },

  /** Get related memories */
  getRelatedMemories: async (userId: string, memoryId: string): Promise<Memory[]> => {
    const serverUrl = await memoriesApi.getServerUrl()
    const response = await axios.get<MemoriesApiResponse>(
      `${serverUrl}/api/v1/memories/${memoryId}/related?user_id=${userId}`
    )
    return response.data.items.map(adaptMemoryItem)
  },

  /** Get memory statistics */
  getStats: async (userId: string): Promise<MemoryStats> => {
    const serverUrl = await memoriesApi.getServerUrl()
    const response = await axios.get<MemoryStats>(
      `${serverUrl}/api/v1/stats?user_id=${userId}`
    )
    return response.data
  },

  /** Check if memory server is available */
  healthCheck: async (source: MemorySource = 'openmemory'): Promise<boolean> => {
    try {
      const serverUrl = await memoriesApi.getServerUrl(source)
      await axios.get(`${serverUrl}/docs`, { timeout: 5000 })
      return true
    } catch {
      return false
    }
  },
}

// =============================================================================
// ServiceConfigs API (templates, instances, wiring)
// =============================================================================

/** Template source - where the template was discovered from */
export type TemplateSource = 'compose' | 'provider'

/** ServiceConfig status */
export type ServiceConfigStatus = 'pending' | 'deploying' | 'running' | 'stopped' | 'error' | 'n/a'

/** Template - discovered from compose or provider files */
export interface Template {
  id: string
  source: TemplateSource
  name: string
  description?: string
  requires: string[]
  optional: string[]
  provides?: string
  config_schema: Array<{
    key: string
    type: string
    label?: string
    required?: boolean
    default?: string
    env_var?: string
    settings_path?: string
    has_value?: boolean  // Whether settings has a value
    value?: string       // Current value (non-secrets only)
  }>
  compose_file?: string
  service_name?: string
  provider_file?: string
  mode?: 'cloud' | 'local'
  icon?: string
  tags: string[]
  configured: boolean  // Whether required config fields are set (for providers)
  running: boolean     // Whether local service is running (Docker container up)
  installed: boolean   // Whether user has added this from the registry
}

/** ServiceConfig config values */
export interface ConfigValues {
  values: Record<string, any>
}

/** ServiceConfig outputs after deployment */
export interface ServiceOutputs {
  access_url?: string
  env_vars: Record<string, string>
  capability_values: Record<string, any>
}

/** ServiceConfig - configured deployment of a template */
export interface ServiceConfig {
  id: string
  template_id: string
  name: string
  description?: string
  config: ConfigValues
  deployment_target?: string
  status: ServiceConfigStatus
  outputs: ServiceOutputs
  container_id?: string
  container_name?: string
  deployment_id?: string
  created_at?: string
  deployed_at?: string
  updated_at?: string
  error?: string
  // Integration-specific fields (present only for integrations)
  integration_type?: string
  sync_enabled?: boolean
  sync_interval?: number
  last_sync_at?: string
  last_sync_status?: string
  last_sync_items_count?: number
  last_sync_error?: string
  next_sync_at?: string
}

/** ServiceConfig summary for list views */
export interface ServiceConfigSummary {
  id: string
  template_id: string
  name: string
  status: ServiceConfigStatus
  provides?: string
  deployment_target?: string
  access_url?: string
}

/** Wiring connection between instances */
export interface Wiring {
  id: string
  source_config_id: string
  source_capability: string
  target_config_id: string
  target_capability: string
  created_at?: string
}

/** Output wiring - connects service outputs to env vars of other services */
export interface OutputWiring {
  id: string
  source_instance_id: string
  source_output_key: string  // "access_url" | "env_vars.XXX" | "capability_values.XXX"
  target_instance_id: string
  target_env_var: string     // The env var key on the target service
  created_at?: string
}

/** Request to create output wiring */
export interface OutputWiringCreateRequest {
  source_instance_id: string
  source_output_key: string
  target_instance_id: string
  target_env_var: string
}

/** Request to create an instance */
export interface ServiceConfigCreateRequest {
  id: string
  template_id: string
  name: string
  description?: string
  config?: Record<string, any>
  deployment_target?: string
}

/** Request to update an instance */
export interface ServiceConfigUpdateRequest {
  name?: string
  description?: string
  config?: Record<string, any>
  deployment_target?: string
}

/** Request to create wiring */
export interface WiringCreateRequest {
  source_config_id: string
  source_capability: string
  target_config_id: string
  target_capability: string
}

export const svcConfigsApi = {
  // Templates
  /** List all templates (compose services + providers) */
  getTemplates: (source?: TemplateSource) =>
    api.get<Template[]>('/api/svc-configs/templates', { params: source ? { source } : {} }),

  /** Get a template by ID */
  getTemplate: (templateId: string) =>
    api.get<Template>(`/api/svc-configs/templates/${templateId}`),

  /** Get env var config with suggestions for a template (same process as services) */
  getTemplateEnvConfig: (templateId: string) =>
    api.get<EnvVarInfo[]>(`/api/svc-configs/templates/${templateId}/env`),

  // ServiceConfigs
  /** List all instances */
  getServiceConfigs: () =>
    api.get<ServiceConfigSummary[]>('/api/svc-configs'),

  /** Get an instance by ID */
  getServiceConfig: (instanceId: string) =>
    api.get<ServiceConfig>(`/api/svc-configs/${instanceId}`),

  /** Create a new instance */
  createServiceConfig: (data: ServiceConfigCreateRequest) =>
    api.post<ServiceConfig>('/api/svc-configs', data),

  /** Update an instance */
  updateServiceConfig: (instanceId: string, data: ServiceConfigUpdateRequest) =>
    api.put<ServiceConfig>(`/api/svc-configs/${instanceId}`, data),

  /** Delete an instance */
  deleteServiceConfig: (instanceId: string) =>
    api.delete(`/api/svc-configs/${instanceId}`),

  /** Deploy/start an instance */
  deployServiceConfig: (instanceId: string) =>
    api.post<{ success: boolean; message: string }>(`/api/svc-configs/${instanceId}/deploy`),

  /** Undeploy/stop an instance */
  undeployServiceConfig: (instanceId: string) =>
    api.post<{ success: boolean; message: string }>(`/api/svc-configs/${instanceId}/undeploy`),

  // Wiring
  /** List all wiring connections */
  getWiring: () =>
    api.get<Wiring[]>('/api/svc-configs/wiring/all'),

  /** Get default capability mappings */
  getDefaults: () =>
    api.get<Record<string, string>>('/api/svc-configs/wiring/defaults'),

  /** Set default instance for a capability */
  setDefault: (capability: string, instanceId: string) =>
    api.put(`/api/svc-configs/wiring/defaults/${capability}`, null, { params: { config_id: instanceId } }),

  /** Create a wiring connection */
  createWiring: (data: WiringCreateRequest) =>
    api.post<Wiring>('/api/svc-configs/wiring', data),

  /** Delete a wiring connection */
  deleteWiring: (wiringId: string) =>
    api.delete(`/api/svc-configs/wiring/${wiringId}`),

  /** Get wiring for a specific instance */
  getServiceConfigWiring: (instanceId: string) =>
    api.get<Wiring[]>(`/api/svc-configs/${instanceId}/wiring`),
  // Output Wiring - connects service outputs to env vars
  /** List all output wiring connections */
  getOutputWiring: () =>
    api.get<OutputWiring[]>('/api/instances/output-wiring/all'),

  /** Create an output wiring connection */
  createOutputWiring: (data: OutputWiringCreateRequest) =>
    api.post<OutputWiring>('/api/instances/output-wiring', data),

  /** Delete an output wiring connection */
  deleteOutputWiring: (wiringId: string) =>
    api.delete(`/api/instances/output-wiring/${wiringId}`),
}

export const graphApi = {
  /** Fetch graph data for visualization */
  fetchGraphData: async (
    userId?: string,
    limit: number = 100,
    source: MemorySource = 'openmemory'
  ): Promise<GraphData> => {
    const serverUrl = await memoriesApi.getServerUrl(source)
    const params: Record<string, string | number> = { limit }
    if (userId) params.user_id = userId

    const response = await axios.get<GraphData>(
      `${serverUrl}/api/v1/graph/data`,
      { params }
    )
    return response.data
  },

  /** Fetch graph statistics */
  fetchGraphStats: async (userId?: string, source: MemorySource = 'openmemory'): Promise<GraphStats> => {
    const serverUrl = await memoriesApi.getServerUrl(source)
    const params: Record<string, string> = {}
    if (userId) params.user_id = userId

    const response = await axios.get<GraphStats>(
      `${serverUrl}/api/v1/graph/stats`,
      { params }
    )
    return response.data
  },

  /** Search within the graph */
  searchGraph: async (
    query: string,
    userId?: string,
    limit: number = 50,
    source: MemorySource = 'openmemory'
  ): Promise<GraphData> => {
    const serverUrl = await memoriesApi.getServerUrl(source)
    const params: Record<string, string | number> = { query, limit }
    if (userId) params.user_id = userId

    const response = await axios.get<GraphData>(
      `${serverUrl}/api/v1/graph/search`,
      { params }
    )
    return response.data
  },
}

export const tailscaleApi = {
  // Environment info (for per-environment Tailscale containers)
  getEnvironment: () => api.get<EnvironmentInfo>('/api/tailscale/environment'),

  // Platform detection
  getPlatform: () => api.get<PlatformInfo>('/api/tailscale/platform'),
  getInstallationGuide: (osType: string) => api.get(`/api/tailscale/installation-guide?os_type=${osType}`),

  // Container management
  getContainerStatus: () => api.get<ContainerStatus>('/api/tailscale/container/status'),
  startContainer: () => api.post<{ status: string; message: string }>('/api/tailscale/container/start'),
  startContainerWithCaddy: () =>
    api.post<{
      status: string
      message: string
      details?: { tailscale: { status: string }; caddy: { status: string }; routing: { status: string } }
    }>('/api/tailscale/container/start-with-caddy'),
  clearAuth: () => api.post<{ status: string; message: string }>('/api/tailscale/container/clear-auth'),
  reset: () => api.post<{
    status: string
    message: string
    details: {
      routes_cleared: boolean
      certs_removed: boolean
      auth_cleared: boolean
      config_removed: boolean
    }
    errors?: string[]
    note: string
  }>('/api/tailscale/container/reset'),
  getTailnetSettings: () => api.get<TailnetSettings>('/api/tailscale/container/tailnet-settings'),
  enableHttps: () => api.post<{ status: string; message: string }>('/api/tailscale/container/enable-https'),
  getAuthUrl: (regenerate: boolean = false) =>
    api.get<AuthUrlResponse>('/api/tailscale/container/auth-url', { params: { regenerate } }),
  provisionCertInContainer: (hostname: string) =>
    api.post<CertificateStatus>('/api/tailscale/container/provision-cert', null, { params: { hostname } }),
  configureServe: (config: TailscaleConfig) =>
    api.post<{ status: string; message: string; routes?: string; hostname?: string }>('/api/tailscale/configure-serve', config),
  getServeStatus: () =>
    api.get<{ status: string; routes: string | null; error?: string }>('/api/tailscale/serve-status'),
  updateCorsOrigins: (hostname: string) =>
    api.post<{
      status: string
      origin: string
      message: string
    }>('/api/tailscale/update-cors', { hostname }),

  // Caddy management
  getCaddyStatus: () =>
    api.get<{ exists: boolean; running: boolean; status?: string; id?: string }>('/api/tailscale/caddy/status'),
  startCaddy: () => api.post<{ status: string; message: string }>('/api/tailscale/container/start-caddy'),

  // Mobile app connection - minimal data, app fetches details from /api/unodes/leader/info
  getMobileConnectionQR: () =>
    api.get<{
      qr_code_data: string
      connection_data: {
        type: string
        v: number
        hostname: string
        ip: string
        port: number
      }
      hostname: string
      tailscale_ip: string
      api_port: number
    }>('/api/tailscale/mobile/connect-qr'),

  // Configuration
  getConfig: () => api.get<TailscaleConfig | null>('/api/tailscale/config'),
  saveConfig: (config: TailscaleConfig) => api.post<TailscaleConfig>('/api/tailscale/config', config),

  // Configuration generation
  generateConfig: (config: TailscaleConfig) =>
    api.post<{ mode: string; config_file: string; content: string }>('/api/tailscale/generate-config', config),

  // Access URLs
  getAccessUrls: () => api.get<AccessUrls>('/api/tailscale/access-urls'),

  // Testing
  testConnection: (url: string) =>
    api.post<{ url: string; success: boolean; http_code?: string; error?: string }>(
      '/api/tailscale/test-connection',
      null,
      { params: { url } }
    ),

  // Setup completion
  complete: () => api.post<{ status: string; message: string }>('/api/tailscale/complete'),
}

// =============================================================================
// Chat API - WebUI Chat Interface
// =============================================================================

export interface ChatMessage {
  id?: string
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface ChatStatus {
  configured: boolean
  provider: string | null
  model: string | null
  memory_available: boolean
  error: string | null
}

export interface ChatRequest {
  messages: ChatMessage[]
  system?: string
  use_memory?: boolean
  user_id?: string
  temperature?: number
  max_tokens?: number
}

export const chatApi = {
  /** Get chat configuration status */
  getStatus: () => api.get<ChatStatus>('/api/chat/status'),

  /** Non-streaming chat completion */
  sendMessage: (request: ChatRequest) =>
    api.post<ChatMessage>('/api/chat/simple', request),

  /** Get the streaming endpoint URL (for direct fetch) */
  getStreamUrl: () => `${BACKEND_URL}/api/chat`,
}

// =============================================================================
// Integration API - Integration sync and connection management
// =============================================================================

export interface IntegrationSyncResult {
  success: boolean
  items_synced?: number
  last_sync_at?: string
  error?: string
}

export interface IntegrationSyncStatus {
  integration_id: string
  integration_type: string
  sync_enabled: boolean | null
  sync_interval: number | null
  last_sync_at: string | null
  last_sync_status: string
  last_sync_items_count: number | null
  last_sync_error: string | null
  next_sync_at: string | null
}

export interface IntegrationConnectionResult {
  success: boolean
  message: string
}

export const integrationApi = {
  /** Test connection to an integration */
  testConnection: (instanceId: string) =>
    api.post<IntegrationConnectionResult>(`/api/svc-configs/${instanceId}/test-connection`),

  /** Manually trigger sync for an integration */
  syncNow: (instanceId: string) =>
    api.post<IntegrationSyncResult>(`/api/svc-configs/${instanceId}/sync`),

  /** Get current sync status for an integration */
  getSyncStatus: (instanceId: string) =>
    api.get<IntegrationSyncStatus>(`/api/svc-configs/${instanceId}/sync-status`),

  /** Enable automatic syncing for an integration */
  enableAutoSync: (instanceId: string) =>
    api.post<{ success: boolean; message: string }>(`/api/svc-configs/${instanceId}/sync/enable`),

  /** Disable automatic syncing for an integration */
  disableAutoSync: (instanceId: string) =>
    api.post<{ success: boolean; message: string }>(`/api/svc-configs/${instanceId}/sync/disable`),
}

// =============================================================================
// GitHub Import API - Import docker-compose from GitHub repositories
// =============================================================================

export interface GitHubUrlInfo {
  owner: string
  repo: string
  branch: string
  path: string
}

export interface DetectedComposeFile {
  path: string
  name: string
  download_url: string
  size: number
}

export interface GitHubScanResponse {
  success: boolean
  github_info?: GitHubUrlInfo
  compose_files: DetectedComposeFile[]
  message?: string
  error?: string
}

export interface ComposeEnvVarInfo {
  name: string
  has_default: boolean
  default_value?: string
  is_required: boolean
  description?: string
}

export interface ComposeServiceInfo {
  name: string
  image?: string
  ports: Array<{ host?: string; container?: string }>
  environment: ComposeEnvVarInfo[]
  depends_on: string[]
  volumes: string[]
  networks: string[]
  command?: string
  healthcheck?: Record<string, any>
}

export interface ComposeParseResponse {
  success: boolean
  compose_path: string
  services: ComposeServiceInfo[]
  networks: string[]
  volumes: string[]
  message?: string
  error?: string
}

export interface ShadowHeaderConfig {
  enabled: boolean
  header_name: string
  header_value?: string
  route_path?: string
}

export interface EnvVarConfigItem {
  name: string
  source: 'literal' | 'setting' | 'default'
  value?: string
  setting_path?: string
  is_secret: boolean
}

export interface ImportedServiceConfig {
  service_name: string
  display_name?: string
  description?: string
  source_url: string  // GitHub URL or Docker Hub URL
  compose_path?: string
  shadow_header: ShadowHeaderConfig
  env_vars: EnvVarConfigItem[]
  enabled: boolean
  capabilities?: string[]  // Capabilities this service provides (e.g., ['llm', 'tts'])
}

export interface ImportServiceRequest {
  github_url: string
  compose_path: string
  service_name: string
  config: ImportedServiceConfig
}

export interface ImportServiceResponse {
  success: boolean
  service_id?: string
  service_name?: string
  message: string
  compose_file_path?: string
}

export interface ImportedService {
  id: string
  source_type?: 'github' | 'dockerhub'
  source_url?: string
  github_url?: string
  compose_path?: string
  compose_file: string
  docker_image?: string
  service_name: string
  display_name?: string
  description?: string
  shadow_header: ShadowHeaderConfig
  env_vars: EnvVarConfigItem[]
  ports?: PortConfig[]
  volumes?: VolumeConfig[]
  enabled: boolean
  capabilities?: string[]  // Capabilities this service provides
}

export interface PortConfig {
  host_port: number
  container_port: number
  protocol?: string
}

export interface VolumeConfig {
  name: string
  container_path: string
  is_named_volume?: boolean
}

export interface DockerHubImageInfo {
  namespace: string
  repository: string
  tag: string
  full_image_name?: string
}

export interface DockerHubScanResponse {
  success: boolean
  image_info?: DockerHubImageInfo
  description?: string
  stars?: number
  pulls?: number
  available_tags: string[]
  message?: string
  error?: string
}

export interface UnifiedScanResponse {
  success: boolean
  source_type: 'github' | 'dockerhub'
  // GitHub-specific
  github_info?: GitHubUrlInfo
  compose_files?: DetectedComposeFile[]
  // Docker Hub-specific
  dockerhub_info?: DockerHubImageInfo
  available_tags?: string[]
  image_description?: string
  // Common
  message?: string
  error?: string
}

export interface DockerHubRegisterRequest {
  service_name: string
  dockerhub_url: string
  tag?: string
  display_name?: string
  description?: string
  ports?: PortConfig[]
  volumes?: VolumeConfig[]
  env_vars?: EnvVarConfigItem[]
  shadow_header_enabled?: boolean
  shadow_header_name?: string
  shadow_header_value?: string
  route_path?: string
  capabilities?: string[]  // Capabilities this service provides
}

// =============================================================================
// Audio Provider API - Wired audio destinations
// =============================================================================

export interface AudioDestination {
  consumer_id: string
  consumer_name: string
  websocket_url: string
  protocol: string
  format: string
}

export interface WiredDestinationsResponse {
  has_destinations: boolean
  destinations: AudioDestination[]
  // Relay mode: frontend connects to relay_url, backend fans out to destinations
  use_relay: boolean
  relay_url: string | null  // e.g., wss://hostname/ws/audio/relay
}

export const audioApi = {
  /** Get wired audio destinations based on wiring configuration */
  getWiredDestinations: () =>
    api.get<WiredDestinationsResponse>('/api/providers/audio_consumer/wired-destinations'),

  /** Get active audio consumer configuration */
  getActiveConsumer: () =>
    api.get('/api/providers/audio_consumer/active'),

  /** Get available audio consumers */
  getAvailableConsumers: () =>
    api.get('/api/providers/audio_consumer/available'),
}

// =============================================================================
// Unified Memories API - Cross-source memory retrieval
// =============================================================================

export interface ConversationMemory {
  id: string
  content: string
  created_at: string
  metadata: Record<string, any>
  source: 'openmemory' | 'mycelia' | 'chronicle'
  score?: number
}

export interface ConversationMemoriesResponse {
  conversation_id: string
  conversation_source: 'chronicle' | 'mycelia'
  memories: ConversationMemory[]
  count: number
  sources_queried: string[]
}

export const unifiedMemoriesApi = {
  /** Get all memories for a conversation across all sources (OpenMemory + native backend) */
  getConversationMemories: (conversationId: string, source: 'chronicle' | 'mycelia') =>
    api.get<ConversationMemoriesResponse>(`/api/memories/by-conversation/${conversationId}`, {
      params: { conversation_source: source }
    }),

  /** Get a single memory by ID from any memory source */
  getMemoryById: (memoryId: string) =>
    api.get<ConversationMemory>(`/api/memories/${memoryId}`),
}

export const githubImportApi = {
  /** Scan a GitHub repository for docker-compose files */
  scan: (github_url: string, branch?: string, compose_path?: string) =>
    api.post<GitHubScanResponse>('/api/github-import/scan', {
      github_url,
      branch,
      compose_path
    }),

  /** Parse a docker-compose file and extract service/env information */
  parse: (github_url: string, compose_path: string) =>
    api.post<ComposeParseResponse>('/api/github-import/parse', null, {
      params: { github_url, compose_path }
    }),

  /** Register an imported service */
  register: (request: ImportServiceRequest) =>
    api.post<ImportServiceResponse>('/api/github-import/register', request),

  /** List all imported services */
  listImported: () =>
    api.get<ImportedService[]>('/api/github-import/imported'),

  /** Delete an imported service */
  deleteImported: (serviceId: string) =>
    api.delete<{ success: boolean; message: string }>(`/api/github-import/imported/${serviceId}`),

  /** Update configuration for an imported service */
  updateConfig: (serviceId: string, config: ImportedServiceConfig) =>
    api.put<{ success: boolean; message: string }>(`/api/github-import/imported/${serviceId}/config`, config),

  // Docker Hub endpoints
  /** Scan a Docker Hub image for information */
  scanDockerHub: (dockerhub_url: string, tag?: string) =>
    api.post<DockerHubScanResponse>('/api/github-import/dockerhub/scan', {
      dockerhub_url,
      tag
    }),

  /** Register a service from Docker Hub */
  registerDockerHub: (request: DockerHubRegisterRequest) =>
    api.post<ImportServiceResponse>('/api/github-import/dockerhub/register', null, {
      params: {
        service_name: request.service_name,
        dockerhub_url: request.dockerhub_url,
        tag: request.tag,
        display_name: request.display_name,
        description: request.description,
        shadow_header_enabled: request.shadow_header_enabled ?? true,
        shadow_header_name: request.shadow_header_name ?? 'X-Shadow-Service',
        shadow_header_value: request.shadow_header_value,
        route_path: request.route_path,
        ports: request.ports ? JSON.stringify(request.ports) : undefined,
        volumes: request.volumes ? JSON.stringify(request.volumes) : undefined,
        env_vars: request.env_vars ? JSON.stringify(request.env_vars) : undefined,
        capabilities: request.capabilities ? JSON.stringify(request.capabilities) : undefined,
      }
    }),

  // Unified endpoints (auto-detect source type)
  /** Scan any supported source (GitHub or Docker Hub) */
  unifiedScan: (url: string, branch?: string, tag?: string, compose_path?: string) =>
    api.post<UnifiedScanResponse>('/api/github-import/unified/scan', {
      url,
      branch,
      tag,
      compose_path
    }),
}
