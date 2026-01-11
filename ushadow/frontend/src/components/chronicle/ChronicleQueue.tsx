import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Layers,
  Clock,
  Play,
  Pause,
  CheckCircle,
  XCircle,
  StopCircle,
  RefreshCw,
  AlertCircle,
  RotateCcw,
  Trash2,
  ChevronDown,
  ChevronRight,
  Radio,
  Brain,
  FileText,
  FileAudio,
  Eye,
  AlertTriangle
} from 'lucide-react'
import {
  chronicleQueueApi,
  chronicleAuthApi,
  QueueStats,
  StreamingStatus,
  StreamingSession
} from '../../services/chronicleApi'

// Job type for the jobs list
interface Job {
  job_id: string
  job_type: string
  status: string
  user_id: string | null
  priority: string
  data: { description: string }
  result?: any
  meta?: any
  error_message?: string | null
  created_at: string
  started_at?: string
  ended_at?: string
  retry_count: number
  max_retries: number
  queue: string
}

interface Jobs {
  queued: Job[]
  processing: Job[]
  completed: Job[]
  failed?: Job[]  // Failed jobs may be separate or mixed with completed
}

interface ChronicleQueueProps {
  onAuthRequired?: () => void
}

export default function ChronicleQueue({ onAuthRequired }: ChronicleQueueProps) {
  const [stats, setStats] = useState<QueueStats | null>(null)
  const [streamingStatus, setStreamingStatus] = useState<StreamingStatus | null>(null)
  const [jobs, setJobs] = useState<Jobs | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<number>(Date.now())
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set())
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set())
  const [selectedJob, setSelectedJob] = useState<any | null>(null)
  const [sessionJobs, setSessionJobs] = useState<{[sessionId: string]: Job[]}>({})

  const expandedSessionsRef = useRef<Set<string>>(new Set())
  const refreshingRef = useRef(false)

  // Job type color coding
  const getJobTypeColor = (type: string, status: string) => {
    if (!type || !status) {
      return { bgColor: 'bg-neutral-400', borderColor: 'border-neutral-500' }
    }

    let bgColor = 'bg-neutral-400'
    let borderColor = 'border-neutral-500'

    // Transcription jobs - blue
    if (type.includes('transcribe') || type === 'transcribe_full_audio_job') {
      bgColor = 'bg-blue-500'
      borderColor = 'border-blue-600'
    }
    // Speaker recognition - purple
    else if (type.includes('speaker') || type.includes('recognise')) {
      bgColor = 'bg-purple-500'
      borderColor = 'border-purple-600'
    }
    // Memory jobs - pink
    else if (type.includes('memory') || type === 'process_memory_job') {
      bgColor = 'bg-pink-500'
      borderColor = 'border-pink-600'
    }
    // Conversation/open jobs - cyan
    else if (type.includes('conversation') || type.includes('open_conversation')) {
      bgColor = 'bg-cyan-500'
      borderColor = 'border-cyan-600'
    }
    // Speech detection - green
    else if (type.includes('speech') || type.includes('detect')) {
      bgColor = 'bg-green-500'
      borderColor = 'border-green-600'
    }
    // Audio processing - orange
    else if (type.includes('audio') || type.includes('persist') || type.includes('cropping')) {
      bgColor = 'bg-orange-500'
      borderColor = 'border-orange-600'
    }

    // Failed jobs - red
    if (status === 'failed') {
      bgColor = 'bg-red-500'
      borderColor = 'border-red-600'
    }
    // Processing - add pulse
    else if (status === 'processing' || status === 'started') {
      bgColor = bgColor + ' animate-pulse'
    }

    return { bgColor, borderColor }
  }

  // Job display names
  const getJobDisplayName = (jobType: string) => {
    const nameMap: { [key: string]: string } = {
      'stream_speech_detection_job': 'Speech',
      'open_conversation_job': 'Open',
      'transcribe_full_audio_job': 'Transcript',
      'recognise_speakers_job': 'Speakers',
      'process_memory_job': 'Memory',
      'audio_persistence_job': 'Audio',
      'crop_audio_job': 'Crop'
    }
    return nameMap[jobType] || jobType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  // Job type icons
  const getJobTypeIcon = (type: string) => {
    if (type.includes('transcribe')) return FileText
    if (type.includes('audio')) return FileAudio
    if (type.includes('memory') || type.includes('speech') || type.includes('speaker') || type.includes('conversation')) return Brain
    return Brain
  }

  const toggleJobExpansion = (jobId: string) => {
    const newExpanded = new Set(expandedJobs)
    if (newExpanded.has(jobId)) {
      newExpanded.delete(jobId)
    } else {
      newExpanded.add(jobId)
    }
    setExpandedJobs(newExpanded)
  }

  useEffect(() => {
    expandedSessionsRef.current = expandedSessions
  }, [expandedSessions])

  useEffect(() => {
    refreshingRef.current = refreshing
  }, [refreshing])

  const fetchData = useCallback(async () => {
    if (refreshingRef.current) return

    setRefreshing(true)
    try {
      const expandedSessionIds = Array.from(expandedSessionsRef.current)
      const response = await chronicleQueueApi.getDashboard(expandedSessionIds)
      const dashboardData = response.data

      setStats(dashboardData.stats)
      setStreamingStatus(dashboardData.streaming_status)
      setJobs(dashboardData.jobs)
      setLastUpdate(Date.now())
      setError(null)

      // Group jobs by conversation_id for timeline view
      const allJobs = [
        ...(dashboardData.jobs?.queued || []),
        ...(dashboardData.jobs?.processing || []),
        ...(dashboardData.jobs?.completed || [])
      ]

      // Build conversation grouping
      const jobsByConversation: {[convId: string]: Job[]} = {}
      const audioUuidToConvId = new Map<string, string>()

      // First pass: map audio_uuid to conversation_id
      allJobs.forEach((job: Job) => {
        const convId = job.meta?.conversation_id
        const audioUuid = job.meta?.audio_uuid
        if (convId && audioUuid) {
          audioUuidToConvId.set(audioUuid, convId)
        }
      })

      // Second pass: group jobs
      allJobs.forEach((job: Job) => {
        if (job.meta?.session_level === true) return // Skip session-level jobs

        let groupKey = job.meta?.conversation_id
        if (!groupKey && job.meta?.audio_uuid) {
          groupKey = audioUuidToConvId.get(job.meta.audio_uuid)
        }

        if (groupKey) {
          if (!jobsByConversation[groupKey]) {
            jobsByConversation[groupKey] = []
          }
          jobsByConversation[groupKey].push(job)
        }
      })

      // Merge with session_jobs from dashboard if present
      const sessionJobsData = (dashboardData as any).session_jobs
      if (sessionJobsData) {
        Object.entries(sessionJobsData).forEach(([sessionId, jobs]: [string, any]) => {
          const existing = jobsByConversation[sessionId] || []
          const existingIds = new Set(existing.map((j: Job) => j.job_id))
          const newJobs = jobs.filter((j: Job) => !existingIds.has(j.job_id))
          jobsByConversation[sessionId] = [...existing, ...newJobs]
        })
      }

      setSessionJobs(jobsByConversation)
    } catch (err: any) {
      if (err.response?.status === 401) {
        onAuthRequired?.()
        setError('Authentication required')
        setAutoRefreshEnabled(false)
      } else {
        setError(err.message || 'Failed to load queue data')
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [onAuthRequired])

  // Auto-refresh
  useEffect(() => {
    if (!autoRefreshEnabled) return
    const intervalId = setInterval(fetchData, 3000)
    return () => clearInterval(intervalId)
  }, [fetchData, autoRefreshEnabled])

  // Initial fetch
  useEffect(() => {
    // Auth is now handled automatically via ushadow proxy
    fetchData()
  }, [fetchData])

  const cleanupStuckWorkers = async () => {
    if (!window.confirm('Clean up all stuck workers and pending messages?')) return
    try {
      const response = await chronicleQueueApi.cleanupStuckWorkers()
      alert(`Cleanup complete! Cleaned ${response.data.total_cleaned} messages.`)
      fetchData()
    } catch (err: any) {
      alert(`Failed to cleanup: ${err.message}`)
    }
  }

  const cleanupOldSessions = async () => {
    if (!window.confirm('Remove old and stuck sessions from the dashboard?')) return
    try {
      const response = await chronicleQueueApi.cleanupOldSessions(3600)
      alert(`Cleaned up ${response.data.cleaned_count} old session(s)`)
      fetchData()
    } catch (err: any) {
      alert(`Failed to cleanup: ${err.message}`)
    }
  }

  const flushFailedJobs = async () => {
    if (!window.confirm('Clear all failed jobs? This cannot be undone.')) return
    try {
      // Use flush endpoint with 0 hours to clear all failed jobs regardless of age
      await chronicleQueueApi.flushJobs(false, {
        older_than_hours: 0,
        statuses: ['failed']
      })
      alert('Failed jobs cleared successfully')
      fetchData()
    } catch (err: any) {
      alert(`Failed to clear jobs: ${err.message}`)
    }
  }

  const flushCompletedJobs = async () => {
    if (!window.confirm('Clear all completed jobs? This cannot be undone.')) return
    try {
      // Use flush endpoint with 0 hours to clear all completed jobs regardless of age
      await chronicleQueueApi.flushJobs(false, {
        older_than_hours: 0,
        statuses: ['completed']
      })
      alert('Completed jobs cleared successfully')
      fetchData()
    } catch (err: any) {
      alert(`Failed to clear jobs: ${err.message}`)
    }
  }

  const flushAllJobs = async () => {
    if (!window.confirm('⚠️ WARNING: Clear ALL jobs (queued, processing, completed, failed)? This will stop all processing and cannot be undone!')) return
    try {
      // Use flush-all endpoint with both flags set to true
      await chronicleQueueApi.flushJobs(true, {
        confirm: true,
        include_failed: true,
        include_completed: true
      })
      alert('All jobs cleared successfully')
      fetchData()
    } catch (err: any) {
      alert(`Failed to clear jobs: ${err.message}`)
    }
  }

  const toggleSession = (sessionId: string) => {
    const newExpanded = new Set(expandedSessions)
    if (newExpanded.has(sessionId)) {
      newExpanded.delete(sessionId)
    } else {
      newExpanded.add(sessionId)
    }
    setExpandedSessions(newExpanded)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'queued': return 'text-amber-600 bg-amber-100 dark:bg-amber-900/30'
      case 'processing': case 'started': return 'text-blue-600 bg-blue-100 dark:bg-blue-900/30'
      case 'completed': return 'text-green-600 bg-green-100 dark:bg-green-900/30'
      case 'failed': return 'text-red-600 bg-red-100 dark:bg-red-900/30'
      case 'cancelled': return 'text-neutral-600 bg-neutral-100 dark:bg-neutral-700'
      default: return 'text-neutral-600 bg-neutral-100 dark:bg-neutral-700'
    }
  }

  const formatSeconds = (seconds: number): string => {
    if (seconds < 60) return `${Math.floor(seconds)}s`
    if (seconds < 3600) {
      const mins = Math.floor(seconds / 60)
      const secs = Math.floor(seconds % 60)
      return `${mins}m${secs}s`
    }
    const hours = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    return `${hours}h${mins}m`
  }

  const formatDuration = (job: Job) => {
    if (!job.started_at) return '-'
    const start = new Date(job.started_at).getTime()
    const end = job.ended_at
      ? new Date(job.ended_at).getTime()
      : (job.status === 'processing' || job.status === 'started' ? Date.now() : start)
    const durationMs = end - start
    if (durationMs < 1000) return `${durationMs}ms`
    if (durationMs < 60000) return `${(durationMs / 1000).toFixed(1)}s`
    if (durationMs < 3600000) return `${Math.floor(durationMs / 60000)}m ${Math.floor((durationMs % 60000) / 1000)}s`
    return `${Math.floor(durationMs / 3600000)}h ${Math.floor((durationMs % 3600000) / 60000)}m`
  }

  const formatDurationSeconds = (seconds: number) => {
    if (seconds < 1) return `${(seconds * 1000).toFixed(0)}ms`
    if (seconds < 60) return `${seconds.toFixed(1)}s`
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}m ${secs}s`
  }

  if (loading) {
    return (
      <div data-testid="chronicle-queue-loading" className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        <span className="ml-2 text-neutral-600 dark:text-neutral-400">Loading queue data...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div data-testid="chronicle-queue-error" className="text-center py-12">
        <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-500" />
        <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
        <div className="text-xs text-gray-500 dark:text-gray-400 mb-4 font-mono">
          Check browser console (F12) for detailed error logs
        </div>
        <button onClick={fetchData} className="btn-primary">Try Again</button>
      </div>
    )
  }

  return (
    <div data-testid="chronicle-queue" className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <Layers className="h-6 w-6 text-primary-600 dark:text-primary-400" />
          <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">Queue Management</h2>
          <span className="text-xs text-neutral-500">
            Updated: {new Date(lastUpdate).toLocaleTimeString()}
          </span>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setAutoRefreshEnabled(!autoRefreshEnabled)}
            className={`btn-secondary flex items-center space-x-1 text-sm ${
              autoRefreshEnabled ? 'bg-green-100 dark:bg-green-900/30' : ''
            }`}
            data-testid="toggle-auto-refresh"
          >
            {autoRefreshEnabled ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            <span>{autoRefreshEnabled ? 'Auto' : 'Paused'}</span>
          </button>
          <button
            onClick={fetchData}
            disabled={refreshing}
            className="btn-secondary flex items-center space-x-1"
            data-testid="refresh-queue"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
          <div className="card p-3">
            <div className="flex items-center space-x-2">
              <Layers className="h-4 w-4 text-neutral-600" />
              <div>
                <p className="text-xs text-neutral-500">Total</p>
                <p className="text-lg font-semibold">{stats.total_jobs}</p>
              </div>
            </div>
          </div>
          <div className="card p-3">
            <div className="flex items-center space-x-2">
              <Clock className="h-4 w-4 text-amber-600" />
              <div>
                <p className="text-xs text-neutral-500">Queued</p>
                <p className="text-lg font-semibold text-amber-600">{stats.queued_jobs}</p>
              </div>
            </div>
          </div>
          <div className="card p-3">
            <div className="flex items-center space-x-2">
              <Play className={`h-4 w-4 text-blue-600 ${stats.processing_jobs > 0 ? 'animate-pulse' : ''}`} />
              <div>
                <p className="text-xs text-neutral-500">Processing</p>
                <p className="text-lg font-semibold text-blue-600">{stats.processing_jobs}</p>
              </div>
            </div>
          </div>
          <div className="card p-3">
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <div>
                <p className="text-xs text-neutral-500">Completed</p>
                <p className="text-lg font-semibold text-green-600">{stats.completed_jobs}</p>
              </div>
            </div>
          </div>
          <div className="card p-3">
            <div className="flex items-center space-x-2">
              <XCircle className="h-4 w-4 text-red-600" />
              <div>
                <p className="text-xs text-neutral-500">Failed</p>
                <p className="text-lg font-semibold text-red-600">{stats.failed_jobs}</p>
              </div>
            </div>
          </div>
          <div className="card p-3">
            <div className="flex items-center space-x-2">
              <StopCircle className="h-4 w-4 text-neutral-600" />
              <div>
                <p className="text-xs text-neutral-500">Cancelled</p>
                <p className="text-lg font-semibold text-neutral-600">{stats.cancelled_jobs}</p>
              </div>
            </div>
          </div>
          <div className="card p-3">
            <div className="flex items-center space-x-2">
              <Pause className="h-4 w-4 text-blue-600" />
              <div>
                <p className="text-xs text-neutral-500">Deferred</p>
                <p className="text-lg font-semibold text-blue-600">{stats.deferred_jobs}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Streaming Status */}
      {streamingStatus && (
        <div className="card">
          <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-700 flex justify-between items-center">
            <h3 className="font-medium text-neutral-900 dark:text-neutral-100">Audio Streaming</h3>
            <div className="flex items-center space-x-2">
              <button
                onClick={cleanupOldSessions}
                className="btn-secondary text-xs flex items-center space-x-1"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Cleanup Old</span>
              </button>
              <button
                onClick={cleanupStuckWorkers}
                className="btn-secondary text-xs flex items-center space-x-1"
              >
                <Trash2 className="h-3 w-3" />
                <span>Cleanup Stuck</span>
              </button>
            </div>
          </div>

          <div className="p-4 space-y-4">
            {/* Active Streams */}
            {streamingStatus.stream_health && Object.keys(streamingStatus.stream_health).length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">Active Streams</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {Object.entries(streamingStatus.stream_health).map(([streamKey, health]) => {
                    const clientId = streamKey.replace('audio:stream:', '')
                    return (
                      <div key={streamKey} className="p-3 bg-neutral-50 dark:bg-neutral-800 rounded border">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-2">
                            <Radio className="h-4 w-4 text-green-500 animate-pulse" />
                            <span className="text-sm font-medium truncate">{clientId}</span>
                          </div>
                          <span className="text-xs px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded">
                            Active
                          </span>
                        </div>
                        <div className="text-xs text-neutral-500 space-y-1">
                          <div className="flex justify-between">
                            <span>Stream Length:</span>
                            <span className="font-medium">{health.stream_length}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Age:</span>
                            <span className="font-medium">{formatSeconds(health.stream_age_seconds || 0)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Pending:</span>
                            <span className={`font-medium ${(health.total_pending || 0) > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                              {health.total_pending || 0}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Active Sessions */}
            {streamingStatus.active_sessions && streamingStatus.active_sessions.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                  Active Sessions ({streamingStatus.active_sessions.length})
                </h4>
                <div className="space-y-2">
                  {streamingStatus.active_sessions.map((session: StreamingSession) => (
                    <div key={session.session_id} className="border rounded">
                      <button
                        onClick={() => toggleSession(session.session_id)}
                        className="w-full px-3 py-2 flex items-center justify-between hover:bg-neutral-50 dark:hover:bg-neutral-800"
                      >
                        <div className="flex items-center space-x-2">
                          {expandedSessions.has(session.session_id) ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                          <span className="text-sm font-medium">{session.client_id}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${getStatusColor(session.status)}`}>
                            {session.status}
                          </span>
                        </div>
                        <div className="text-xs text-neutral-500">
                          {session.chunks_published} chunks • {formatSeconds(session.age_seconds)}
                        </div>
                      </button>

                      {expandedSessions.has(session.session_id) && (
                        <div className="px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border-t text-xs space-y-1">
                          <div className="flex justify-between">
                            <span className="text-neutral-500">Provider:</span>
                            <span>{session.provider}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-neutral-500">Mode:</span>
                            <span>{session.mode}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-neutral-500">Idle:</span>
                            <span>{formatSeconds(session.idle_seconds)}</span>
                          </div>
                          {session.last_event && (
                            <div className="flex justify-between">
                              <span className="text-neutral-500">Last Event:</span>
                              <span className="font-mono">{session.last_event.split(':')[0]}</span>
                            </div>
                          )}
                          {session.speaker_check_status && (
                            <div className="flex justify-between">
                              <span className="text-neutral-500">Speaker Check:</span>
                              <span className={
                                session.speaker_check_status === 'enrolled' ? 'text-green-600' :
                                session.speaker_check_status === 'checking' ? 'text-blue-600' :
                                'text-neutral-600'
                              }>{session.speaker_check_status}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* RQ Queues */}
            {streamingStatus.rq_queues && Object.keys(streamingStatus.rq_queues).length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">RQ Queues</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {Object.entries(streamingStatus.rq_queues).map(([queue, data]) => (
                    <div key={queue} className="p-2 bg-neutral-50 dark:bg-neutral-800 rounded text-xs">
                      <div className="font-medium truncate">{queue}</div>
                      <div className="flex justify-between mt-1">
                        <span className="text-neutral-500">Count:</span>
                        <span>{data.count}</span>
                      </div>
                      {data.failed_count > 0 && (
                        <div className="flex justify-between text-red-600">
                          <span>Failed:</span>
                          <span>{data.failed_count}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Completed Sessions */}
            {streamingStatus.completed_sessions && streamingStatus.completed_sessions.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                  Completed Sessions ({streamingStatus.completed_sessions.length})
                </h4>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {streamingStatus.completed_sessions.map((session) => (
                    <div key={session.session_id} className="p-2 bg-neutral-50 dark:bg-neutral-800 rounded text-xs flex justify-between items-center">
                      <div className="flex items-center space-x-2">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        <span className="font-medium">{session.client_id}</span>
                        {session.has_conversation && (
                          <span className="px-1.5 py-0.5 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded">
                            conv
                          </span>
                        )}
                      </div>
                      <span className="text-neutral-500">
                        {new Date(session.completed_at * 1000).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Empty State */}
            {(!streamingStatus.stream_health || Object.keys(streamingStatus.stream_health).length === 0) &&
             (!streamingStatus.active_sessions || streamingStatus.active_sessions.length === 0) &&
             (!streamingStatus.completed_sessions || streamingStatus.completed_sessions.length === 0) && (
              <div className="text-center py-8 text-neutral-500">
                <Radio className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No active streams or sessions</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Active & Completed Conversations */}
      {Object.keys(sessionJobs).length > 0 && (
        <div className="card" data-testid="conversations-section">
          <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-700">
            <h3 className="font-medium text-neutral-900 dark:text-neutral-100">Conversations</h3>
          </div>

          <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Active Conversations */}
            <div>
              <h4 className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-3">Active Conversations</h4>
              {(() => {
                // Filter to only show conversations with at least one active job
                const activeConversations = Object.entries(sessionJobs).filter(([_, convJobs]) =>
                  convJobs.some(j => j.status !== 'completed' && j.status !== 'failed')
                )

                if (activeConversations.length === 0) {
                  return (
                    <div className="text-center py-8 text-neutral-500 text-sm bg-neutral-50 dark:bg-neutral-800 rounded border">
                      No active conversations
                    </div>
                  )
                }

                return (
                  <div className="space-y-2">
                    {activeConversations.map(([conversationId, convJobs]) => {
                      const isExpanded = expandedSessions.has(conversationId)
                      const openConvJob = convJobs.find(j => j.job_type === 'open_conversation_job')
                      const meta = openConvJob?.meta || convJobs.find(j => j.meta)?.meta || {}
                      const clientId = meta.client_id || 'Unknown'
                      const transcript = meta.transcript || ''
                      const speakers = meta.speakers || []
                      const wordCount = meta.word_count || 0
                      const hasFailedJob = convJobs.some(j => j.status === 'failed')
                      const failedCount = convJobs.filter(j => j.status === 'failed').length

                      return (
                        <div
                          key={conversationId}
                          data-testid={`conversation-${conversationId}`}
                          className={`rounded-lg border overflow-hidden ${hasFailedJob ? 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-800' : 'bg-cyan-50 dark:bg-cyan-900/20 border-cyan-200 dark:border-cyan-800'}`}
                        >
                          {/* Conversation Header */}
                          <div
                            className={`flex items-center justify-between p-3 cursor-pointer transition-colors ${hasFailedJob ? 'hover:bg-red-100 dark:hover:bg-red-900/30' : 'hover:bg-cyan-100 dark:hover:bg-cyan-900/30'}`}
                            onClick={() => toggleSession(conversationId)}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center space-x-2">
                                {isExpanded ? (
                                  <ChevronDown className={`w-4 h-4 ${hasFailedJob ? 'text-red-600' : 'text-cyan-600'}`} />
                                ) : (
                                  <ChevronRight className={`w-4 h-4 ${hasFailedJob ? 'text-red-600' : 'text-cyan-600'}`} />
                                )}
                                {hasFailedJob ? (
                                  <AlertTriangle className="w-4 h-4 text-red-600" />
                                ) : (
                                  <Brain className="w-4 h-4 text-cyan-600 animate-pulse" />
                                )}
                                <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{clientId}</span>
                                {hasFailedJob ? (
                                  <span className="text-xs px-2 py-0.5 bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200 rounded font-medium">
                                    {failedCount} Error{failedCount > 1 ? 's' : ''}
                                  </span>
                                ) : (
                                  <span className="text-xs px-2 py-0.5 bg-cyan-100 dark:bg-cyan-800 text-cyan-700 dark:text-cyan-200 rounded">Active</span>
                                )}
                                {speakers.length > 0 && (
                                  <span className="text-xs px-2 py-0.5 bg-purple-100 dark:bg-purple-800 text-purple-700 dark:text-purple-200 rounded">
                                    {speakers.length} speaker{speakers.length > 1 ? 's' : ''}
                                  </span>
                                )}
                              </div>
                              <div className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
                                Conversation: {conversationId.substring(0, 8)}... • Words: {wordCount}
                              </div>
                              {/* Transcript Preview */}
                              {transcript && (
                                <div className="mt-1 text-xs text-neutral-700 dark:text-neutral-300 italic truncate">
                                  "{transcript.substring(0, 100)}{transcript.length > 100 ? '...' : ''}"
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Expanded: Pipeline Timeline & Jobs */}
                          {isExpanded && (
                            <div className="border-t border-cyan-200 dark:border-cyan-800 bg-white dark:bg-neutral-900 p-3">
                              {/* Pipeline Timeline */}
                              <div className="mb-4">
                                <h5 className="text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-3">Pipeline Timeline:</h5>
                                {(() => {
                                  const jobsWithTiming = convJobs
                                    .filter(j => j.started_at)
                                    .map(job => {
                                      const startTime = new Date(job.started_at!).getTime()
                                      const endTime = job.ended_at
                                        ? new Date(job.ended_at).getTime()
                                        : (job.status === 'processing' || job.status === 'started' ? Date.now() : startTime)
                                      return {
                                        job,
                                        startTime,
                                        endTime,
                                        duration: (endTime - startTime) / 1000,
                                        name: getJobDisplayName(job.job_type),
                                        Icon: getJobTypeIcon(job.job_type)
                                      }
                                    })
                                    .sort((a, b) => a.startTime - b.startTime)

                                  if (jobsWithTiming.length === 0) {
                                    return <div className="text-xs text-neutral-500 italic">No job timing data available</div>
                                  }

                                  const earliestStart = Math.min(...jobsWithTiming.map(t => t.startTime))
                                  const latestEnd = Math.max(...jobsWithTiming.map(t => t.endTime))
                                  const totalDuration = (latestEnd - earliestStart) / 1000

                                  const timeMarkers = [0, 0.25, 0.5, 0.75, 1].map(pct => ({
                                    percent: pct * 100,
                                    time: formatDurationSeconds(totalDuration * pct)
                                  }))

                                  return (
                                    <div className="space-y-2">
                                      {/* Time axis */}
                                      <div className="relative h-4 border-b border-neutral-300 dark:border-neutral-600">
                                        {timeMarkers.map((marker, idx) => (
                                          <div
                                            key={idx}
                                            className="absolute"
                                            style={{ left: `${marker.percent}%`, transform: 'translateX(-50%)' }}
                                          >
                                            <div className="w-px h-2 bg-neutral-400"></div>
                                            <div className="text-xs text-neutral-500 mt-0.5 whitespace-nowrap">{marker.time}</div>
                                          </div>
                                        ))}
                                      </div>

                                      {/* Job timeline bars */}
                                      <div className="space-y-2 mt-6">
                                        {jobsWithTiming.map(({ job, startTime, endTime, duration, name, Icon }) => {
                                          const startPercent = ((startTime - earliestStart) / (latestEnd - earliestStart)) * 100
                                          const widthPercent = Math.max(2, ((endTime - startTime) / (latestEnd - earliestStart)) * 100)
                                          const { bgColor, borderColor } = getJobTypeColor(job.job_type, job.status)

                                          return (
                                            <div key={job.job_id} className="flex items-center space-x-2 h-8">
                                              <div className={`w-8 h-8 rounded-full border-2 ${borderColor} ${bgColor} flex items-center justify-center flex-shrink-0`}>
                                                <Icon className="w-4 h-4 text-white" />
                                              </div>
                                              <span className="text-xs text-neutral-700 dark:text-neutral-300 w-20 flex-shrink-0">{name}</span>
                                              <div className="flex-1 relative h-6 bg-neutral-100 dark:bg-neutral-700 rounded">
                                                <div
                                                  className={`absolute h-6 rounded ${bgColor} flex items-center justify-center`}
                                                  style={{ left: `${startPercent}%`, width: `${widthPercent}%` }}
                                                  title={`Started: ${new Date(startTime).toLocaleTimeString()}\nDuration: ${formatDurationSeconds(duration)}`}
                                                >
                                                  <span className="text-xs text-white font-medium px-2 truncate">
                                                    {formatDurationSeconds(duration)}
                                                  </span>
                                                </div>
                                              </div>
                                            </div>
                                          )
                                        })}
                                      </div>

                                      <div className="text-xs text-neutral-600 dark:text-neutral-400 text-right mt-2">
                                        Total: {formatDurationSeconds(totalDuration)}
                                      </div>
                                    </div>
                                  )
                                })()}
                              </div>

                              {/* Conversation Jobs List */}
                              <h5 className="text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-2">Conversation Jobs:</h5>
                              <div className="space-y-1">
                                {convJobs
                                  .filter(j => j.job_id)
                                  .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                                  .map((job, index) => {
                                    const { borderColor } = getJobTypeColor(job.job_type, job.status)
                                    const JobIcon = getJobTypeIcon(job.job_type)

                                    return (
                                      <div key={job.job_id} className={`p-2 bg-neutral-50 dark:bg-neutral-800 rounded border ${borderColor}`} style={{ borderLeftWidth: '4px' }}>
                                        <div
                                          className="flex items-center justify-between cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors rounded px-1 py-0.5"
                                          onClick={() => toggleJobExpansion(job.job_id)}
                                        >
                                          <div className="flex items-center space-x-2 min-w-0">
                                            <span className="text-xs font-mono text-neutral-500">#{index + 1}</span>
                                            <JobIcon className="w-3 h-3" />
                                            <span className="text-xs font-medium text-neutral-900 dark:text-neutral-100 truncate">{job.job_type}</span>
                                            <span className={`text-xs px-1.5 py-0.5 rounded ${getStatusColor(job.status)}`}>
                                              {job.status}
                                            </span>
                                          </div>
                                          <button
                                            onClick={(e) => { e.stopPropagation(); setSelectedJob(job) }}
                                            className="text-primary-600 hover:text-primary-800"
                                          >
                                            <Eye className="w-3 h-3" />
                                          </button>
                                        </div>

                                        {expandedJobs.has(job.job_id) && (
                                          <div className="mt-1 text-xs text-neutral-600 dark:text-neutral-400 space-y-0.5 pl-6">
                                            {job.started_at && <div>Started: {new Date(job.started_at).toLocaleTimeString()} • Duration: {formatDuration(job)}</div>}
                                            {job.meta?.transcript && (
                                              <div className="italic text-neutral-500 truncate max-w-md">"{job.meta.transcript.substring(0, 80)}..."</div>
                                            )}
                                            {job.meta?.memories_created !== undefined && (
                                              <div>Memories: <span className="font-medium">{job.meta.memories_created} created</span></div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    )
                                  })}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </div>

            {/* Completed Conversations */}
            <div>
              <h4 className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-3">Completed Conversations</h4>
              {(() => {
                const completedConversations = Object.entries(sessionJobs).filter(([_, convJobs]) =>
                  convJobs.every(j => j.status === 'completed' || j.status === 'failed')
                )

                if (completedConversations.length === 0) {
                  return (
                    <div className="text-center py-8 text-neutral-500 text-sm bg-neutral-50 dark:bg-neutral-800 rounded border">
                      No completed conversations
                    </div>
                  )
                }

                return (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {completedConversations.slice(0, 20).map(([conversationId, convJobs]) => {
                      const isExpanded = expandedSessions.has(conversationId)
                      const meta = convJobs.find(j => j.meta)?.meta || {}
                      const clientId = meta.client_id || 'Unknown'
                      const transcript = meta.transcript || meta.title || ''
                      const hasFailedJob = convJobs.some(j => j.status === 'failed')
                      const memoriesCreated = convJobs.find(j => j.job_type === 'process_memory_job')?.meta?.memories_created

                      return (
                        <div
                          key={conversationId}
                          data-testid={`completed-conversation-${conversationId}`}
                          className={`rounded-lg border overflow-hidden ${hasFailedJob ? 'bg-red-50 dark:bg-red-900/20 border-red-200' : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'}`}
                        >
                          <div
                            className="flex items-center justify-between p-3 cursor-pointer hover:bg-green-100 dark:hover:bg-green-900/30"
                            onClick={() => toggleSession(conversationId)}
                          >
                            <div className="flex items-center space-x-2 min-w-0 flex-1">
                              {isExpanded ? <ChevronDown className="w-4 h-4 text-green-600" /> : <ChevronRight className="w-4 h-4 text-green-600" />}
                              <CheckCircle className="w-4 h-4 text-green-600" />
                              <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{clientId}</span>
                              {memoriesCreated !== undefined && (
                                <span className="text-xs px-2 py-0.5 bg-pink-100 dark:bg-pink-800 text-pink-700 dark:text-pink-200 rounded">
                                  {memoriesCreated} memories
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-neutral-500">{conversationId.substring(0, 8)}...</span>
                          </div>

                          {isExpanded && (
                            <div className="border-t border-green-200 dark:border-green-800 bg-white dark:bg-neutral-900 p-3">
                              {transcript && (
                                <div className="text-xs text-neutral-700 dark:text-neutral-300 italic mb-2">
                                  "{transcript.substring(0, 200)}{transcript.length > 200 ? '...' : ''}"
                                </div>
                              )}
                              <div className="text-xs text-neutral-500">
                                {convJobs.length} jobs completed
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Jobs List */}
      {jobs && (
        <div className="card">
          <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-700 flex justify-between items-center">
            <h3 className="font-medium text-neutral-900 dark:text-neutral-100">Recent Jobs</h3>
            <button
              onClick={flushAllJobs}
              className="btn-secondary text-xs flex items-center space-x-1 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/30"
              data-testid="flush-all-jobs"
            >
              <AlertTriangle className="h-3 w-3" />
              <span>Clear All Jobs</span>
            </button>
          </div>
          <div className="p-4 space-y-4">
            {/* Processing Jobs */}
            {jobs.processing && jobs.processing.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-blue-700 dark:text-blue-300 mb-2 flex items-center space-x-2">
                  <Play className="h-4 w-4 animate-pulse" />
                  <span>Processing ({jobs.processing.length})</span>
                </h4>
                <div className="space-y-2">
                  {jobs.processing.map((job) => (
                    <div
                      key={job.job_id}
                      className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/30"
                      onClick={() => setSelectedJob(job)}
                      data-testid={`job-${job.job_id}`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="font-medium text-sm">{job.data?.description || job.job_type}</span>
                          <div className="text-xs text-neutral-500 mt-1">
                            {job.queue} • Started {job.started_at ? new Date(job.started_at).toLocaleTimeString() : 'pending'}
                          </div>
                        </div>
                        <span className="text-xs px-2 py-0.5 bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200 rounded">
                          {job.job_type.replace(/_/g, ' ')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Queued Jobs */}
            {jobs.queued && jobs.queued.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-amber-700 dark:text-amber-300 mb-2 flex items-center space-x-2">
                  <Clock className="h-4 w-4" />
                  <span>Queued ({jobs.queued.length})</span>
                </h4>
                <div className="space-y-2">
                  {jobs.queued.map((job) => (
                    <div
                      key={job.job_id}
                      className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded cursor-pointer hover:bg-amber-100 dark:hover:bg-amber-900/30"
                      onClick={() => setSelectedJob(job)}
                      data-testid={`job-${job.job_id}`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="font-medium text-sm">{job.data?.description || job.job_type}</span>
                          <div className="text-xs text-neutral-500 mt-1">
                            {job.queue} • Created {new Date(job.created_at).toLocaleTimeString()}
                          </div>
                        </div>
                        <span className="text-xs px-2 py-0.5 bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 rounded">
                          {job.job_type.replace(/_/g, ' ')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Failed Jobs */}
            {(() => {
              // Extract failed jobs from either the failed array or from completed with status === 'failed'
              const failedJobs = jobs.failed || jobs.completed?.filter(j => j.status === 'failed') || []

              if (failedJobs.length === 0) return null

              return (
                <div>
                  <h4 className="text-sm font-medium text-red-700 dark:text-red-300 mb-2 flex items-center space-x-2">
                    <XCircle className="h-4 w-4" />
                    <span>Failed ({failedJobs.length})</span>
                    <button
                      onClick={flushFailedJobs}
                      className="ml-auto btn-secondary text-xs flex items-center space-x-1 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/30"
                      data-testid="flush-failed-jobs"
                    >
                      <Trash2 className="h-3 w-3" />
                      <span>Clear Failed</span>
                    </button>
                  </h4>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {failedJobs.map((job) => (
                      <div
                        key={job.job_id}
                        className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded cursor-pointer hover:bg-red-100 dark:hover:bg-red-900/30"
                        onClick={() => setSelectedJob(job)}
                        data-testid={`job-${job.job_id}`}
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex-1 min-w-0">
                            <span className="font-medium text-sm">{job.data?.description || job.job_type}</span>
                            {job.error_message && (
                              <div className="text-xs text-red-700 dark:text-red-300 mt-0.5 truncate">
                                Error: {job.error_message}
                              </div>
                            )}
                            <div className="text-xs text-neutral-500 mt-1">
                              {job.queue} • Failed {job.ended_at ? new Date(job.ended_at).toLocaleTimeString() : 'recently'}
                              {job.retry_count > 0 && ` • ${job.retry_count}/${job.max_retries} retries`}
                            </div>
                          </div>
                          <span className="text-xs px-2 py-0.5 bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200 rounded flex-shrink-0">
                            {job.job_type.replace(/_/g, ' ')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}

            {/* Completed Jobs */}
            {(() => {
              // Filter out failed jobs since they have their own section
              const completedOnly = jobs.completed?.filter(j => j.status !== 'failed') || []

              if (completedOnly.length === 0) return null

              return (
                <div>
                  <h4 className="text-sm font-medium text-green-700 dark:text-green-300 mb-2 flex items-center space-x-2">
                    <CheckCircle className="h-4 w-4" />
                    <span>Completed ({completedOnly.length})</span>
                    <button
                      onClick={flushCompletedJobs}
                      className="ml-auto btn-secondary text-xs flex items-center space-x-1 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/30"
                      data-testid="flush-completed-jobs"
                    >
                      <Trash2 className="h-3 w-3" />
                      <span>Clear Completed</span>
                    </button>
                  </h4>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {completedOnly.slice(0, 20).map((job) => (
                    <div
                      key={job.job_id}
                      className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded cursor-pointer hover:bg-green-100 dark:hover:bg-green-900/30"
                      onClick={() => setSelectedJob(job)}
                      data-testid={`job-${job.job_id}`}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-sm">{job.data?.description || job.job_type}</span>
                          {job.meta?.title && (
                            <div className="text-xs text-neutral-700 dark:text-neutral-300 mt-0.5 truncate">
                              "{job.meta.title}"
                            </div>
                          )}
                          <div className="text-xs text-neutral-500 mt-1">
                            {job.queue} • {job.ended_at ? new Date(job.ended_at).toLocaleTimeString() : ''}
                          </div>
                        </div>
                        <span className="text-xs px-2 py-0.5 bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200 rounded flex-shrink-0">
                          {job.job_type.replace(/_/g, ' ')}
                        </span>
                      </div>
                    </div>
                    ))}
                  </div>
                </div>
              )
            })()}

            {/* No Jobs */}
            {(!jobs.processing || jobs.processing.length === 0) &&
             (!jobs.queued || jobs.queued.length === 0) &&
             (!jobs.completed || jobs.completed.length === 0) &&
             (!jobs.failed || jobs.failed.length === 0) && (
              <div className="text-center py-8 text-neutral-500">
                <Layers className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No jobs in queue</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Job Details Modal */}
      {selectedJob && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSelectedJob(null)}>
          <div className="bg-white dark:bg-neutral-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="font-medium">Job Details</h3>
              <button onClick={() => setSelectedJob(null)} className="text-neutral-500 hover:text-neutral-700">
                <XCircle className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4">
              <pre className="text-xs bg-neutral-100 dark:bg-neutral-900 p-3 rounded overflow-auto">
                {JSON.stringify(selectedJob, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
