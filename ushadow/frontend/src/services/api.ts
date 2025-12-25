import axios from 'axios'
import { getStorageKey } from '../utils/storage'

// Get backend URL from environment or auto-detect based on current location
const getBackendUrl = () => {
  const { protocol, hostname, port } = window.location
  console.log('Protocol:', protocol)
  console.log('Hostname:', hostname)
  console.log('Port:', port)

  const isStandardPort = (protocol === 'https:' && (port === '' || port === '443')) ||
                         (protocol === 'http:' && (port === '' || port === '80'))

  // Check if we have a base path (for path-based routing)
  const basePath = import.meta.env.BASE_URL
  console.log('Base path from Vite:', basePath)

  if (isStandardPort && basePath && basePath !== '/') {
    // We're using path-based routing - use the base path
    console.log('Using path-based routing with base path')
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
  update: (updates: any) => api.put('/api/settings', { updates }),
  syncEnv: () => api.post('/api/settings/sync-env'),
}

// Services endpoints
export const servicesApi = {
  list: () => api.get('/api/services'),
  get: (serviceId: string) => api.get(`/api/services/${serviceId}`),
  create: (serviceData: any) => api.post('/api/services', serviceData),
  update: (serviceId: string, updates: any) => api.put(`/api/services/${serviceId}`, updates),
  delete: (serviceId: string) => api.delete(`/api/services/${serviceId}`),
  testConnection: (serviceId: string) => api.post(`/api/services/${serviceId}/test`),
  discoverSchema: (serviceId: string) => api.get(`/api/services/${serviceId}/schema`),
}

// Users endpoints
export const usersApi = {
  getAll: () => api.get('/api/users'),
  getById: (id: string) => api.get(`/api/users/${id}`),
  create: (userData: any) => api.post('/api/users', userData),
  update: (id: string, userData: any) => api.put(`/api/users/${id}`, userData),
  delete: (id: string) => api.delete(`/api/users/${id}`),
}

// Cluster/UNode endpoints
export const clusterApi = {
  listUnodes: () => api.get('/api/unodes'),
  getUnode: (hostname: string) => api.get(`/api/unodes/${hostname}`),
  removeUnode: (hostname: string) => api.delete(`/api/unodes/${hostname}`),
  createToken: (tokenData: { role: string; max_uses: number; expires_in_hours: number }) =>
    api.post('/api/unodes/tokens', tokenData),
}
