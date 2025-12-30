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
  Radio
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
  const [selectedJob, setSelectedJob] = useState<any | null>(null)

  const expandedSessionsRef = useRef<Set<string>>(new Set())
  const refreshingRef = useRef(false)

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
    if (chronicleAuthApi.isAuthenticated()) {
      fetchData()
    } else {
      setLoading(false)
      setError('Please log in to Chronicle to view the queue.')
    }
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

  if (loading) {
    return (
      <div data-testid="chronicle-queue-loading" className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        <span className="ml-2 text-neutral-600 dark:text-neutral-400">Loading queue data...</span>
      </div>
    )
  }

  if (error && !chronicleAuthApi.isAuthenticated()) {
    return (
      <div data-testid="chronicle-queue-auth-required" className="text-center py-12">
        <AlertCircle className="h-12 w-12 mx-auto mb-4 text-amber-500" />
        <p className="text-neutral-600 dark:text-neutral-400 mb-4">{error}</p>
        <button onClick={onAuthRequired} className="btn-primary">
          Log in to Chronicle
        </button>
      </div>
    )
  }

  if (error) {
    return (
      <div data-testid="chronicle-queue-error" className="text-center py-12">
        <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-500" />
        <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
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
                        {session.conversation_count > 0 && (
                          <span className="px-1.5 py-0.5 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded">
                            {session.conversation_count} conv
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

      {/* Jobs List */}
      {jobs && (
        <div className="card">
          <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-700">
            <h3 className="font-medium text-neutral-900 dark:text-neutral-100">Recent Jobs</h3>
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

            {/* Completed Jobs */}
            {jobs.completed && jobs.completed.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-green-700 dark:text-green-300 mb-2 flex items-center space-x-2">
                  <CheckCircle className="h-4 w-4" />
                  <span>Completed ({jobs.completed.length})</span>
                </h4>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {jobs.completed.slice(0, 20).map((job) => (
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
            )}

            {/* No Jobs */}
            {(!jobs.processing || jobs.processing.length === 0) &&
             (!jobs.queued || jobs.queued.length === 0) &&
             (!jobs.completed || jobs.completed.length === 0) && (
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
