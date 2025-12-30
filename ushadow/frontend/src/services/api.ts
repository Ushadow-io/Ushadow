import axios from 'axios'
import { getStorageKey } from '../utils/storage'

// Get backend URL from environment or auto-detect based on current location
const getBackendUrl = () => {
  const { protocol, hostname, port, pathname } = window.location
  console.log('Protocol:', protocol)
  console.log('Hostname:', hostname)
  console.log('Port:', port)
  console.log('Pathname:', pathname)

  const isStandardPort = (protocol === 'https:' && (port === '' || port === '443')) ||
                         (protocol === 'http:' && (port === '' || port === '80'))

  // Check if we have a base path from Vite build config
  const viteBasePath = import.meta.env.BASE_URL
  console.log('Base path from Vite:', viteBasePath)

  // Detect runtime base path from URL (e.g., /wiz/ from /wiz/settings)
  // This handles path-based routing via Caddy/nginx without rebuild
  const pathSegments = pathname.split('/').filter(Boolean)
  const runtimeBasePath = pathSegments.length > 0 && !pathSegments[0].includes('.')
    ? `/${pathSegments[0]}`
    : ''
  console.log('Runtime base path detected:', runtimeBasePath || '(none)')

  // Use Vite base path if set, otherwise use runtime detection
  const basePath = (viteBasePath && viteBasePath !== '/') ? viteBasePath : runtimeBasePath

  if (isStandardPort && basePath) {
    // We're using path-based routing - use the base path for API calls
    console.log('Using path-based routing with base path:', basePath)
    return basePath.replace(/\/$/, '')
  }

  // If explicitly set in environment, use that (for direct backend access)
  if (import.meta.env.VITE_API_URL !== undefined && import.meta.env.VITE_API_URL !== '') {
    console.log('Using explicit VITE_API_URL')
    return import.meta.env.VITE_API_URL
  }

  if (isStandardPort) {
    // We're being accessed through nginx proxy or standard proxy
    console.log('Using standard proxy - relative URLs')
    return ''
  }

  // Development mode - direct access to dev server (port 5173 is Vite's default)
  if (port === '5173') {
    console.log('Development mode - using environment backend URL or default')
    // Use VITE_API_URL if set, otherwise fallback to localhost:8000 + offset
    return import.meta.env.VITE_API_URL || 'http://localhost:8010'
  }

  // Fallback - calculate backend port from frontend port
  console.log('Fallback - calculating backend port from frontend port')
  // Frontend runs on 3000 + offset, backend on 8000 + offset
  // So if we're on 3010, backend is on 8010
  const frontendPort = parseInt(port)
  const backendPort = frontendPort - 3000 + 8000
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
      // Token expired or invalid, redirect to login
      console.warn('🔐 API: 401 Unauthorized - clearing token and redirecting to login')
      localStorage.removeItem(getStorageKey('token'))
      window.location.href = '/login'
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
  
  // Service-specific config namespace
  getAllServiceConfigs: () => api.get('/api/settings/service-configs'),
  getServiceConfig: (serviceId: string) => api.get(`/api/settings/service-configs/${serviceId}`),
  updateServiceConfig: (serviceId: string, updates: any) => 
    api.put(`/api/settings/service-configs/${serviceId}`, updates),
  deleteServiceConfig: (serviceId: string) => api.delete(`/api/settings/service-configs/${serviceId}`),
}

// Services endpoints - provides schema for wizard forms
// Actual config values are managed via settingsApi
export const servicesApi = {
  getQuickstart: () => api.get('/api/services/quickstart'),
  getByCategory: (category: string) => api.get(`/api/services/categories/${category}`),
  setEnabled: (serviceId: string, enabled: boolean) =>
    api.put(`/api/services/${serviceId}/enabled`, { enabled }),
  getEnabledState: (serviceId: string) =>
    api.get(`/api/services/${serviceId}/enabled`),
  // Catalog & Installation
  getCatalog: () => api.get('/api/services/catalog'),
  getInstalled: () => api.get('/api/services/installed'),
  installService: (serviceId: string, dockerImage?: string) =>
    api.post('/api/services/install', { service_id: serviceId, docker_image: dockerImage }),
  uninstallService: (serviceId: string) =>
    api.delete(`/api/services/${serviceId}/uninstall`),
}

// Docker service management endpoints (infrastructure containers)
export const dockerApi = {
  listServices: () => api.get('/api/docker/services'),
  getServicesStatus: () => api.get('/api/docker/services/status'),
  getServiceInfo: (serviceName: string) => api.get(`/api/docker/services/${serviceName}`),
  startService: (serviceName: string) => api.post(`/api/docker/services/${serviceName}/start`),
  stopService: (serviceName: string) => api.post(`/api/docker/services/${serviceName}/stop`),
  restartService: (serviceName: string) => api.post(`/api/docker/services/${serviceName}/restart`),
  getServiceLogs: (serviceName: string, tail: number = 100) =>
    api.get(`/api/docker/services/${serviceName}/logs`, { params: { tail } }),
}

// Users endpoints
export const usersApi = {
  getAll: () => api.get('/api/users'),
  getById: (id: string) => api.get(`/api/users/${id}`),
  create: (userData: any) => api.post('/api/users', userData),
  update: (id: string, userData: any) => api.put(`/api/users/${id}`, userData),
  delete: (id: string) => api.delete(`/api/users/${id}`),
}

// Wizard endpoints
export const wizardApi = {
  getStatus: () => api.get('/api/wizard/status'),
  getApiKeys: () => api.get('/api/wizard/api-keys'),
  updateApiKeys: (apiKeys: {
    openai_api_key?: string
    deepgram_api_key?: string
    mistral_api_key?: string
    anthropic_api_key?: string
  }) => api.put('/api/wizard/api-keys', apiKeys),
  updateProviders: (providers: any) => settingsApi.update(providers),
  detectEnvKeys: () => api.get('/api/wizard/detect-env-keys'),
  importEnvKeys: () => api.post('/api/wizard/import-env-keys'),
  complete: () => api.post('/api/wizard/complete'),
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

export const deploymentsApi = {
  // Service definitions
  createService: (data: Omit<ServiceDefinition, 'created_at' | 'updated_at' | 'created_by'>) =>
    api.post('/api/deployments/services', data),
  listServices: () => api.get<ServiceDefinition[]>('/api/deployments/services'),
  getService: (serviceId: string) => api.get<ServiceDefinition>(`/api/deployments/services/${serviceId}`),
  updateService: (serviceId: string, data: Partial<ServiceDefinition>) =>
    api.put(`/api/deployments/services/${serviceId}`, data),
  deleteService: (serviceId: string) => api.delete(`/api/deployments/services/${serviceId}`),

  // Deployments
  deploy: (serviceId: string, unodeHostname: string) =>
    api.post<Deployment>('/api/deployments/deploy', { service_id: serviceId, unode_hostname: unodeHostname }),
  listDeployments: (params?: { service_id?: string; unode_hostname?: string }) =>
    api.get<Deployment[]>('/api/deployments', { params }),
  getDeployment: (deploymentId: string) => api.get<Deployment>(`/api/deployments/${deploymentId}`),
  stopDeployment: (deploymentId: string) => api.post<Deployment>(`/api/deployments/${deploymentId}/stop`),
  restartDeployment: (deploymentId: string) => api.post<Deployment>(`/api/deployments/${deploymentId}/restart`),
  removeDeployment: (deploymentId: string) => api.delete(`/api/deployments/${deploymentId}`),
  getDeploymentLogs: (deploymentId: string, tail?: number) =>
    api.get<{ logs: string }>(`/api/deployments/${deploymentId}/logs`, { params: { tail: tail || 100 } }),
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
  frontend_port: number
  environments: string[]
}

export interface PlatformInfo {
  os_type: 'linux' | 'darwin' | 'windows' | 'unknown'
  os_version: string
  architecture: string
  is_docker: boolean
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
const adaptMemoryItem = (item: ApiMemoryItem): Memory => ({
  id: item.id,
  memory: item.content,
  created_at: new Date(item.created_at).getTime(),
  state: item.state as Memory['state'],
  metadata: item.metadata_ || {},
  categories: item.categories as Memory['categories'],
  client: 'api',
  app_name: item.app_name,
})

export const memoriesApi = {
  /** Get OpenMemory server URL from settings or use default */
  getServerUrl: async (): Promise<string> => {
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
    filters?: MemoryFilters
  ): Promise<{ memories: Memory[]; total: number; pages: number }> => {
    const serverUrl = await memoriesApi.getServerUrl()
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
  getMemory: async (userId: string, memoryId: string): Promise<Memory> => {
    const serverUrl = await memoriesApi.getServerUrl()
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

  /** Check if OpenMemory server is available */
  healthCheck: async (): Promise<boolean> => {
    try {
      const serverUrl = await memoriesApi.getServerUrl()
      await axios.get(`${serverUrl}/docs`, { timeout: 5000 })
      return true
    } catch {
      return false
    }
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
  getAuthUrl: () => api.get<AuthUrlResponse>('/api/tailscale/container/auth-url'),
  provisionCertInContainer: (hostname: string) =>
    api.post<CertificateStatus>('/api/tailscale/container/provision-cert', null, { params: { hostname } }),
  configureServe: (config: TailscaleConfig) =>
    api.post<{ status: string; message: string; results?: string }>('/api/tailscale/configure-serve', config),

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
