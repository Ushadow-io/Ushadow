/**
 * Chronicle API Client
 *
 * This service provides direct communication with the Chronicle backend
 * for conversations and queue management functionality.
 *
 * Authentication: Chronicle and ushadow share the same AUTH_SECRET_KEY,
 * so the ushadow JWT token can be used directly with Chronicle.
 */
import axios from 'axios'
import { getStorageKey } from '../utils/storage'
import { api } from './api'

// Connection info from generic services endpoint
export interface ChronicleConnectionInfo {
  service: string
  url: string | null
  port: number | null
  env_var: string | null
  default_port: number | null
  available: boolean
}

// Get Chronicle backend URL from localStorage or environment
const getChronicleUrl = (): string => {
  // Check localStorage first (from Settings page or connection info)
  const storedUrl = localStorage.getItem(getStorageKey('chronicle_url'))
  if (storedUrl) {
    return storedUrl
  }

  // Check environment variable
  if (import.meta.env.VITE_CHRONICLE_URL) {
    return import.meta.env.VITE_CHRONICLE_URL
  }

  // Default to localhost:8080 (Chronicle's default port)
  return 'http://localhost:8080'
}

// Create Chronicle-specific axios instance
export const createChronicleApi = () => {
  const baseURL = getChronicleUrl()

  const instance = axios.create({
    baseURL,
    timeout: 60000,
  })

  // Add request interceptor for Chronicle auth token
  instance.interceptors.request.use((config) => {
    const token = localStorage.getItem(getStorageKey('chronicle_token'))
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  })

  // Response interceptor for error handling
  instance.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response?.status === 401) {
        console.warn('Chronicle API: 401 Unauthorized - token may be expired')
        // Don't redirect, just reject - let the component handle it
      } else if (error.code === 'ECONNABORTED') {
        console.warn('Chronicle API: Request timeout')
      } else if (!error.response) {
        console.warn('Chronicle API: Network error - Chronicle backend may be unreachable')
      }
      return Promise.reject(error)
    }
  )

  return instance
}

// Get the Chronicle API instance (recreates each time to pick up URL changes)
export const getChronicleApi = () => createChronicleApi()

// Export the base URL for audio URLs
export const getChronicleBaseUrl = () => getChronicleUrl()

// Conversation types
export interface Conversation {
  conversation_id?: string
  audio_uuid: string
  title?: string
  summary?: string
  detailed_summary?: string
  created_at?: string
  client_id: string
  segment_count?: number
  memory_count?: number
  audio_path?: string
  cropped_audio_path?: string
  duration_seconds?: number
  has_memory?: boolean
  transcript?: string
  segments?: Array<{
    text: string
    speaker: string
    start: number
    end: number
    confidence?: number
  }>
  active_transcript_version?: string
  active_memory_version?: string
  transcript_version_count?: number
  memory_version_count?: number
  deleted?: boolean
  deletion_reason?: string
  deleted_at?: string
}

// Queue types
export interface QueueStats {
  total_jobs: number
  queued_jobs: number
  processing_jobs: number
  completed_jobs: number
  failed_jobs: number
  cancelled_jobs: number
  deferred_jobs: number
  timestamp: string
}

export interface StreamingSession {
  session_id: string
  user_id: string
  client_id: string
  provider: string
  mode: string
  status: string
  chunks_published: number
  started_at: number
  last_chunk_at: number
  age_seconds: number
  idle_seconds: number
  conversation_count?: number
  last_event?: string
  speech_detected_at?: string
  speaker_check_status?: string
  identified_speakers?: string
}

export interface CompletedSession {
  session_id: string
  client_id: string
  conversation_id: string | null
  has_conversation: boolean
  action: string
  reason: string
  completed_at: number
  audio_file: string
}

export interface StreamHealth {
  stream_length?: number
  consumer_groups?: Array<{
    name: string
    consumers: Array<{ name: string; pending: number; idle_ms: number }>
    pending: number
  }>
  total_pending?: number
  error?: string
  exists?: boolean
}

export interface StreamingStatus {
  active_sessions: StreamingSession[]
  completed_sessions: CompletedSession[]
  stream_health: {
    [streamKey: string]: StreamHealth & { stream_age_seconds?: number }
  }
  rq_queues: {
    [queue: string]: { count: number; failed_count: number }
  }
  timestamp: number
}

// Auth API
export const chronicleAuthApi = {
  /**
   * Get Chronicle connection info from the generic services endpoint.
   * Returns URL, port, and availability status.
   */
  getConnectionInfo: async (): Promise<ChronicleConnectionInfo> => {
    const response = await api.get<ChronicleConnectionInfo>('/api/services/chronicle-backend/connection-info')
    return response.data
  },

  /**
   * Try to authenticate with Chronicle using the ushadow JWT token.
   * Since both services share AUTH_SECRET_KEY, the ushadow token should work.
   * Returns true if authentication succeeded.
   */
  tryUshadowToken: async (): Promise<boolean> => {
    // Note: AuthContext stores as 'token', not 'auth_token'
    const storageKey = getStorageKey('token')
    console.log('[Chronicle API] tryUshadowToken: looking for key:', storageKey)
    const ushadowToken = localStorage.getItem(storageKey)
    if (!ushadowToken) {
      console.log('[Chronicle API] tryUshadowToken: no token found at', storageKey)
      return false
    }
    console.log('[Chronicle API] tryUshadowToken: found ushadow token, attempting to use it')

    try {
      // Use the ushadow token as the Chronicle token
      localStorage.setItem(getStorageKey('chronicle_token'), ushadowToken)

      // Verify it works by calling /users/me
      const chronicleApi = getChronicleApi()
      console.log('[Chronicle API] tryUshadowToken: calling /users/me to verify token...')
      const response = await chronicleApi.get('/users/me')
      console.log('[Chronicle API] tryUshadowToken: SUCCESS - token accepted, user =', response.data?.email || response.data)

      return true
    } catch (error: any) {
      // Token didn't work, clear it
      console.log('[Chronicle API] tryUshadowToken: FAILED -', error.response?.status, error.response?.data || error.message)
      localStorage.removeItem(getStorageKey('chronicle_token'))
      return false
    }
  },

  /**
   * Initialize Chronicle with the best available URL and auth.
   * 1. Fetches connection info from backend (gets optimal URL)
   * 2. Tries to use ushadow token for auth
   * 3. Returns success status
   */
  autoConnect: async (): Promise<{ connected: boolean; url: string; needsLogin: boolean }> => {
    console.log('[Chronicle API] autoConnect: starting...')
    try {
      // Get connection info from backend
      console.log('[Chronicle API] autoConnect: fetching connection info from backend...')
      const info = await chronicleAuthApi.getConnectionInfo()
      console.log('[Chronicle API] autoConnect: connection info =', info)

      // Store the URL from backend
      if (info.url) {
        setChronicleUrl(info.url)
      }

      if (!info.available) {
        console.log('[Chronicle API] autoConnect: Chronicle not available')
        return { connected: false, url: info.url ?? null, needsLogin: false }
      }

      // Try using ushadow token (auth is always compatible when sharing AUTH_SECRET_KEY)
      console.log('[Chronicle API] autoConnect: trying ushadow token...')
      const tokenWorked = await chronicleAuthApi.tryUshadowToken()
      if (tokenWorked) {
        console.log('[Chronicle API] autoConnect: ushadow token worked!')
        return { connected: true, url: info.url ?? null, needsLogin: false }
      }
      console.log('[Chronicle API] autoConnect: ushadow token did not work')

      // Check if we have an existing Chronicle token
      console.log('[Chronicle API] autoConnect: checking for existing chronicle_token...')
      if (chronicleAuthApi.isAuthenticated()) {
        console.log('[Chronicle API] autoConnect: found existing token, verifying...')
        try {
          await chronicleAuthApi.getMe()
          console.log('[Chronicle API] autoConnect: existing token is valid')
          return { connected: true, url: info.url ?? null, needsLogin: false }
        } catch {
          // Token expired
          console.log('[Chronicle API] autoConnect: existing token expired, clearing')
          chronicleAuthApi.logout()
        }
      } else {
        console.log('[Chronicle API] autoConnect: no existing chronicle_token')
      }

      console.log('[Chronicle API] autoConnect: needs manual login')
      return { connected: false, url: info.url ?? null, needsLogin: true }
    } catch (error) {
      console.warn('[Chronicle API] autoConnect: failed to get connection info:', error)
      // Fall back to stored/default URL
      return { connected: false, url: getChronicleUrl(), needsLogin: true }
    }
  },

  login: async (email: string, password: string) => {
    const chronicleApi = getChronicleApi()
    const formData = new FormData()
    formData.append('username', email)
    formData.append('password', password)
    const response = await chronicleApi.post('/auth/jwt/login', formData)
    // Store the Chronicle token
    if (response.data?.access_token) {
      localStorage.setItem(getStorageKey('chronicle_token'), response.data.access_token)
    }
    return response
  },
  logout: () => {
    localStorage.removeItem(getStorageKey('chronicle_token'))
  },
  isAuthenticated: () => {
    return !!localStorage.getItem(getStorageKey('chronicle_token'))
  },
  getMe: () => getChronicleApi().get('/users/me'),
}

// Conversations API
export const chronicleConversationsApi = {
  getAll: () => getChronicleApi().get('/api/conversations'),
  getById: (id: string) => getChronicleApi().get(`/api/conversations/${id}`),
  delete: (id: string) => getChronicleApi().delete(`/api/conversations/${id}`),
  reprocessTranscript: (conversationId: string) =>
    getChronicleApi().post(`/api/conversations/${conversationId}/reprocess-transcript`),
  reprocessMemory: (conversationId: string, transcriptVersionId: string = 'active') =>
    getChronicleApi().post(`/api/conversations/${conversationId}/reprocess-memory`, null, {
      params: { transcript_version_id: transcriptVersionId }
    }),
  activateTranscriptVersion: (conversationId: string, versionId: string) =>
    getChronicleApi().post(`/api/conversations/${conversationId}/activate-transcript/${versionId}`),
  activateMemoryVersion: (conversationId: string, versionId: string) =>
    getChronicleApi().post(`/api/conversations/${conversationId}/activate-memory/${versionId}`),
  getVersionHistory: (conversationId: string) =>
    getChronicleApi().get(`/api/conversations/${conversationId}/versions`),
}

// Queue API
export const chronicleQueueApi = {
  getDashboard: async (expandedSessions: string[] = []) => {
    // Fetch both endpoints and combine the data
    const api = getChronicleApi()
    const [queueResponse, streamingResponse] = await Promise.all([
      api.get('/api/queue/dashboard', {
        params: { expanded_sessions: expandedSessions.join(',') }
      }),
      api.get('/api/streaming/status')
    ])

    // Compute stats from rq_queues
    const rqQueues = streamingResponse.data.rq_queues || {}
    const stats: QueueStats = {
      total_jobs: 0,
      queued_jobs: 0,
      processing_jobs: 0,
      completed_jobs: 0,
      failed_jobs: 0,
      cancelled_jobs: 0,
      deferred_jobs: 0,
      timestamp: new Date().toISOString()
    }

    // Sum up stats from all queues
    Object.values(rqQueues).forEach((queue: any) => {
      stats.queued_jobs += queue.queued || 0
      stats.processing_jobs += queue.processing || 0
      stats.completed_jobs += queue.completed || 0
      stats.failed_jobs += queue.failed || 0
      stats.cancelled_jobs += queue.cancelled || 0
      stats.deferred_jobs += queue.deferred || 0
    })
    stats.total_jobs = stats.queued_jobs + stats.processing_jobs + stats.completed_jobs +
                       stats.failed_jobs + stats.cancelled_jobs + stats.deferred_jobs

    // Transform streaming response to match expected format
    const streamingStatus: StreamingStatus = {
      active_sessions: streamingResponse.data.active_sessions || [],
      completed_sessions: streamingResponse.data.completed_sessions || [],
      stream_health: streamingResponse.data.stream_health || {},
      rq_queues: Object.fromEntries(
        Object.entries(rqQueues).map(([name, data]: [string, any]) => [
          name,
          { count: data.queued + data.processing, failed_count: data.failed }
        ])
      ),
      timestamp: streamingResponse.data.timestamp || Date.now()
    }

    return {
      data: {
        jobs: queueResponse.data.jobs,
        stats,
        streaming_status: streamingStatus
      }
    }
  },
  getJob: (jobId: string) => getChronicleApi().get(`/api/queue/jobs/${jobId}`),
  retryJob: (jobId: string, force: boolean = false) =>
    getChronicleApi().post(`/api/queue/jobs/${jobId}/retry`, { force }),
  cancelJob: (jobId: string) => getChronicleApi().delete(`/api/queue/jobs/${jobId}`),
  cleanupStuckWorkers: () => getChronicleApi().post('/api/streaming/cleanup'),
  cleanupOldSessions: (maxAgeSeconds: number = 3600) =>
    getChronicleApi().post(`/api/streaming/cleanup-sessions?max_age_seconds=${maxAgeSeconds}`),
  flushJobs: (flushAll: boolean, body: any) => {
    const endpoint = flushAll ? '/api/queue/flush-all' : '/api/queue/flush'
    return getChronicleApi().post(endpoint, body)
  },
}

// System API
export const chronicleSystemApi = {
  getHealth: () => getChronicleApi().get('/health'),
  getReadiness: () => getChronicleApi().get('/readiness'),
}

// Helper to set Chronicle URL
export const setChronicleUrl = (url: string) => {
  localStorage.setItem(getStorageKey('chronicle_url'), url)
}

// Helper to get audio URL with token
export const getChronicleAudioUrl = (conversationId: string, cropped: boolean = true): string => {
  const baseUrl = getChronicleBaseUrl()
  const token = localStorage.getItem(getStorageKey('chronicle_token')) || ''
  return `${baseUrl}/api/audio/get_audio/${conversationId}?cropped=${cropped}&token=${token}`
}
