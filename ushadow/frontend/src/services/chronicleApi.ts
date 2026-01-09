/**
 * Chronicle API Client - Two-Tier Architecture
 *
 * This service uses ushadow's two-tier integration pattern:
 * 1. Control Plane (REST APIs): Proxied through ushadow backend
 * 2. Data Plane (WebSocket): Direct connection for low latency
 *
 * Authentication: Chronicle shares AUTH_SECRET_KEY with ushadow,
 * so the same JWT token works for both (unified auth).
 */
import { api } from './api'

// Connection info from generic services endpoint
export interface ChronicleConnectionInfo {
  service: string
  proxy_url: string | null  // For REST APIs
  direct_url: string | null  // For WebSocket/streaming
  internal_url: string  // Backend only
  port: number | null
  available: boolean
  usage: {
    rest_api: string
    websocket: string
    streaming: string
  }
}

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

/**
 * Get Chronicle connection information.
 * This provides both proxy_url (for REST) and direct_url (for WebSocket).
 */
let connectionInfoCache: ChronicleConnectionInfo | null = null

export async function getChronicleConnectionInfo(): Promise<ChronicleConnectionInfo> {
  if (connectionInfoCache) {
    return connectionInfoCache
  }

  const response = await api.get<ChronicleConnectionInfo>('/api/services/chronicle-backend/connection-info')
  connectionInfoCache = response.data
  return connectionInfoCache
}

/**
 * Clear connection info cache (call when service is restarted or port changes).
 */
export function clearConnectionInfoCache() {
  connectionInfoCache = null
}

/**
 * Get the proxy URL for REST API calls.
 * All REST API calls should use this (conversations, queue, config, etc.)
 */
export async function getChronicleProxyUrl(): Promise<string> {
  const info = await getChronicleConnectionInfo()
  if (!info.proxy_url) {
    throw new Error('Chronicle proxy URL not available')
  }
  return info.proxy_url
}

/**
 * Get the direct URL for WebSocket/streaming connections.
 * Use this for ws_pcm and other real-time streaming.
 */
export async function getChronicleDirectUrl(): Promise<string> {
  const info = await getChronicleConnectionInfo()
  if (!info.direct_url) {
    throw new Error('Chronicle direct URL not available')
  }
  return info.direct_url
}

/**
 * Get the port for direct WebSocket connections.
 */
export async function getChroniclePort(): Promise<number> {
  const info = await getChronicleConnectionInfo()
  if (!info.port) {
    throw new Error('Chronicle port not available')
  }
  return info.port
}

/**
 * Check if Chronicle is available.
 */
export async function isChronicleAvailable(): Promise<boolean> {
  try {
    const info = await getChronicleConnectionInfo()
    return info.available
  } catch {
    return false
  }
}

// =============================================================================
// REST APIs - All use proxy through ushadow backend
// =============================================================================

/**
 * Conversations API - All proxied through ushadow
 */
export const chronicleConversationsApi = {
  async getAll() {
    const proxyUrl = await getChronicleProxyUrl()
    return api.get(`${proxyUrl}/api/conversations`)
  },

  async getById(id: string) {
    const proxyUrl = await getChronicleProxyUrl()
    return api.get(`${proxyUrl}/api/conversations/${id}`)
  },

  async delete(id: string) {
    const proxyUrl = await getChronicleProxyUrl()
    return api.delete(`${proxyUrl}/api/conversations/${id}`)
  },

  async reprocessTranscript(conversationId: string) {
    const proxyUrl = await getChronicleProxyUrl()
    return api.post(`${proxyUrl}/api/conversations/${conversationId}/reprocess-transcript`)
  },

  async reprocessMemory(conversationId: string, transcriptVersionId: string = 'active') {
    const proxyUrl = await getChronicleProxyUrl()
    return api.post(
      `${proxyUrl}/api/conversations/${conversationId}/reprocess-memory`,
      null,
      { params: { transcript_version_id: transcriptVersionId } }
    )
  },

  async activateTranscriptVersion(conversationId: string, versionId: string) {
    const proxyUrl = await getChronicleProxyUrl()
    return api.post(`${proxyUrl}/api/conversations/${conversationId}/activate-transcript/${versionId}`)
  },

  async activateMemoryVersion(conversationId: string, versionId: string) {
    const proxyUrl = await getChronicleProxyUrl()
    return api.post(`${proxyUrl}/api/conversations/${conversationId}/activate-memory/${versionId}`)
  },

  async getVersionHistory(conversationId: string) {
    const proxyUrl = await getChronicleProxyUrl()
    return api.get(`${proxyUrl}/api/conversations/${conversationId}/versions`)
  },
}

/**
 * Queue API - All proxied through ushadow
 */
export const chronicleQueueApi = {
  async getDashboard(expandedSessions: string[] = []) {
    const proxyUrl = await getChronicleProxyUrl()

    // Fetch both endpoints and combine the data
    const [queueResponse, streamingResponse] = await Promise.all([
      api.get(`${proxyUrl}/api/queue/dashboard`, {
        params: { expanded_sessions: expandedSessions.join(',') }
      }),
      api.get(`${proxyUrl}/api/streaming/status`)
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

  async getJob(jobId: string) {
    const proxyUrl = await getChronicleProxyUrl()
    return api.get(`${proxyUrl}/api/queue/jobs/${jobId}`)
  },

  async retryJob(jobId: string, force: boolean = false) {
    const proxyUrl = await getChronicleProxyUrl()
    return api.post(`${proxyUrl}/api/queue/jobs/${jobId}/retry`, { force })
  },

  async cancelJob(jobId: string) {
    const proxyUrl = await getChronicleProxyUrl()
    return api.delete(`${proxyUrl}/api/queue/jobs/${jobId}`)
  },

  async cleanupStuckWorkers() {
    const proxyUrl = await getChronicleProxyUrl()
    return api.post(`${proxyUrl}/api/streaming/cleanup`)
  },

  async cleanupOldSessions(maxAgeSeconds: number = 3600) {
    const proxyUrl = await getChronicleProxyUrl()
    return api.post(`${proxyUrl}/api/streaming/cleanup-sessions?max_age_seconds=${maxAgeSeconds}`)
  },

  async flushJobs(flushAll: boolean, body: any) {
    const proxyUrl = await getChronicleProxyUrl()
    const endpoint = flushAll ? '/api/queue/flush-all' : '/api/queue/flush'
    return api.post(`${proxyUrl}${endpoint}`, body)
  },
}

/**
 * System API - Health checks via proxy
 */
export const chronicleSystemApi = {
  async getHealth() {
    const proxyUrl = await getChronicleProxyUrl()
    return api.get(`${proxyUrl}/health`)
  },

  async getReadiness() {
    const proxyUrl = await getChronicleProxyUrl()
    return api.get(`${proxyUrl}/readiness`)
  },
}

// =============================================================================
// WebSocket/Streaming - Use direct connection
// =============================================================================

/**
 * Get WebSocket URL for real-time audio streaming (ws_pcm).
 * This uses direct connection for low latency.
 */
export async function getChronicleWebSocketUrl(path: string = '/ws_pcm'): Promise<string> {
  const info = await getChronicleConnectionInfo()
  if (!info.direct_url) {
    throw new Error('Chronicle direct URL not available')
  }

  // Use protocol from direct_url (http -> ws, https -> wss)
  const protocol = info.direct_url.startsWith('https') ? 'wss:' : 'ws:'
  const port = info.port

  return `${protocol}//localhost:${port}${path}`
}

/**
 * Get audio URL for playback.
 * Uses direct connection with token in URL.
 */
export async function getChronicleAudioUrl(conversationId: string, cropped: boolean = true): Promise<string> {
  const directUrl = await getChronicleDirectUrl()
  const token = localStorage.getItem('token') || ''  // Ushadow token
  return `${directUrl}/api/audio/get_audio/${conversationId}?cropped=${cropped}&token=${token}`
}

// =============================================================================
// Legacy compatibility exports
// =============================================================================

/**
 * @deprecated Use isChronicleAvailable() instead
 */
export const getChronicleBaseUrl = async () => {
  const proxyUrl = await getChronicleProxyUrl()
  return proxyUrl
}

/**
 * @deprecated Auth is now handled automatically via proxy
 */
export const chronicleAuthApi = {
  autoConnect: async () => {
    const available = await isChronicleAvailable()
    const info = await getChronicleConnectionInfo()
    return {
      connected: available,
      url: info.proxy_url || '',
      needsLogin: false  // Auth handled by ushadow proxy
    }
  },
  login: async (_email: string, _password: string) => {
    throw new Error('Use ushadow login instead - auth is unified')
  },
  logout: () => {
    // No-op - handled by ushadow logout
  },
  isAuthenticated: () => {
    return !!localStorage.getItem('token')
  },
  getMe: async () => {
    const proxyUrl = await getChronicleProxyUrl()
    return api.get(`${proxyUrl}/users/me`)
  },
  tryUshadowToken: async () => true,  // Always works via proxy
  getConnectionInfo: getChronicleConnectionInfo,
}
