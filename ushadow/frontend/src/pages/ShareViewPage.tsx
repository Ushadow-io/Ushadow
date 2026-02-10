/**
 * Public page for viewing shared resources (conversations, memories, etc.)
 * Accessible without authentication unless the share requires it.
 */

import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { api } from '../services/api'
import { AlertCircle, Lock, Clock, Eye, MessageSquare, Calendar, User, Play, Pause } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface SharedResource {
  share_token: {
    token: string
    resource_type: string
    resource_id: string
    permissions: string[]
    expires_at: string | null
    max_views: number | null
    view_count: number
    require_auth: boolean
    tailscale_only: boolean
  }
  resource: {
    type: string
    id: string
    data: any
  }
  permissions: string[]
}

export default function ShareViewPage() {
  const { token } = useParams<{ token: string }>()

  const { data, isLoading, error } = useQuery<SharedResource>({
    queryKey: ['shared-resource', token],
    queryFn: async () => {
      const response = await api.get(`/api/share/${token}`)
      return response.data
    },
    enabled: !!token,
    retry: false,
  })

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading shared content...</p>
        </div>
      </div>
    )
  }

  if (error) {
    const errorMessage = (error as any)?.response?.data?.detail || 'Unable to access this shared content'
    const statusCode = (error as any)?.response?.status

    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center">
          {statusCode === 403 ? (
            <Lock className="h-16 w-16 text-yellow-500 mx-auto mb-4" />
          ) : (
            <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          )}
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            {statusCode === 403 ? 'Access Denied' : 'Share Not Found'}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            {errorMessage}
          </p>
          {statusCode === 403 && errorMessage.includes('Authentication required') && (
            <a
              href={`/login?returnTo=${encodeURIComponent(window.location.pathname)}`}
              className="inline-block px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              data-testid="share-login-button"
            >
              Log in to view
            </a>
          )}
        </div>
      </div>
    )
  }

  if (!data) {
    return null
  }

  const { share_token, resource } = data

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                Shared {resource.type}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {share_token.require_auth ? 'Private share' : 'Public share'}
              </p>
            </div>
            <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
              {share_token.expires_at && (
                <div className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  <span>Expires {new Date(share_token.expires_at).toLocaleDateString()}</span>
                </div>
              )}
              {share_token.max_views && (
                <div className="flex items-center gap-1">
                  <Eye className="h-4 w-4" />
                  <span>{share_token.view_count} / {share_token.max_views} views</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        {resource.type === 'conversation' ? (
          <SharedConversationView data={resource.data} />
        ) : resource.type === 'memory' ? (
          <SharedMemoryView data={resource.data} />
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="text-gray-600 dark:text-gray-400">
              <p>Resource type: {resource.type}</p>
              <pre className="mt-4 p-4 bg-gray-100 dark:bg-gray-900 rounded overflow-auto">
                {JSON.stringify(resource.data, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="text-center py-8 text-sm text-gray-500 dark:text-gray-400">
        Shared via ushadow
      </footer>
    </div>
  )
}

/**
 * Shared conversation view - mirrors ConversationDetailPage layout
 */
function SharedConversationView({ data }: { data: any }) {
  // Audio playback state
  const [playingFullAudio, setPlayingFullAudio] = useState(false)
  const [playingSegment, setPlayingSegment] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const segmentTimerRef = useRef<number | null>(null)

  // Handle error response
  if (data?.error) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6" data-testid="shared-conversation-error">
        <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
          <AlertCircle className="h-6 w-6" />
          <p>{data.error}</p>
        </div>
      </div>
    )
  }

  // Extract conversation fields (support both Chronicle and Mycelia formats)
  const title = data?.title || data?.name || 'Untitled Conversation'
  const summary = data?.summary || (data?.summaries?.[0]?.text)
  const detailedSummary = data?.detailed_summary || data?.details
  const segments = data?.segments || []
  const transcript = data?.transcript

  // Time handling for Mycelia format
  const startTime = data?.timeRanges?.[0]?.start || data?.created_at || data?.createdAt
  const endTime = data?.timeRanges?.[0]?.end || data?.completed_at

  // Calculate duration
  const formatDuration = () => {
    if (data?.duration_seconds) {
      const mins = Math.floor(data.duration_seconds / 60)
      const secs = Math.floor(data.duration_seconds % 60)
      return `${mins}m ${secs}s`
    }
    if (data?.timeRanges?.[0]?.start && data?.timeRanges?.[0]?.end) {
      const start = new Date(data.timeRanges[0].start).getTime()
      const end = new Date(data.timeRanges[0].end).getTime()
      const durationSec = Math.floor((end - start) / 1000)
      const mins = Math.floor(durationSec / 60)
      const secs = durationSec % 60
      return `${mins}m ${secs}s`
    }
    return null
  }

  // Check if we have time range data for audio playback
  const hasAudioData = data?.timeRanges?.[0]?.start && data?.timeRanges?.[0]?.end

  // Handle full audio play/pause
  const handleFullAudioPlayPause = async () => {
    if (playingFullAudio) {
      if (audioRef.current) {
        audioRef.current.pause()
      }
      setPlayingFullAudio(false)
      return
    }

    // Stop any segment that's playing
    if (playingSegment) {
      if (audioRef.current) {
        audioRef.current.pause()
      }
      if (segmentTimerRef.current) {
        window.clearTimeout(segmentTimerRef.current)
        segmentTimerRef.current = null
      }
      setPlayingSegment(null)
    }

    try {
      if (!audioRef.current) {
        audioRef.current = new Audio()
        audioRef.current.addEventListener('ended', () => setPlayingFullAudio(false))
      }

      // Mycelia audio endpoint
      const conversationStart = data?.timeRanges?.[0]?.start
      const conversationEnd = data?.timeRanges?.[0]?.end

      if (!conversationStart || !conversationEnd) {
        console.error('[SharedConversation] No conversation time range found')
        return
      }

      const startUnix = Math.floor(new Date(conversationStart).getTime() / 1000)
      const endUnix = Math.ceil(new Date(conversationEnd).getTime() / 1000)

      const myceliaBackendUrl = '/api/services/mycelia-backend/proxy'
      const audioUrl = `${myceliaBackendUrl}/api/audio/stream?start=${startUnix}&end=${endUnix}`

      // Fetch with auth headers via axios
      const response = await api.get(audioUrl, { responseType: 'blob' })
      const audioBlob = response.data
      const objectUrl = URL.createObjectURL(audioBlob)

      // Clean up old object URL
      if (audioRef.current.src.startsWith('blob:')) {
        URL.revokeObjectURL(audioRef.current.src)
      }

      audioRef.current.src = objectUrl
      audioRef.current.currentTime = 0
      await audioRef.current.play()
      setPlayingFullAudio(true)
    } catch (err) {
      console.error('[SharedConversation] Error playing full audio:', err)
      setPlayingFullAudio(false)
    }
  }

  // Handle segment play/pause
  const handleSegmentPlayPause = async (segmentIndex: number, segment: any) => {
    const segmentId = `segment-${segmentIndex}`

    if (playingSegment === segmentId) {
      if (audioRef.current) {
        audioRef.current.pause()
      }
      if (segmentTimerRef.current) {
        window.clearTimeout(segmentTimerRef.current)
        segmentTimerRef.current = null
      }
      setPlayingSegment(null)
      return
    }

    // Stop any currently playing audio
    if (audioRef.current) {
      audioRef.current.pause()
    }
    if (segmentTimerRef.current) {
      window.clearTimeout(segmentTimerRef.current)
      segmentTimerRef.current = null
    }
    setPlayingFullAudio(false)

    try {
      if (!audioRef.current) {
        audioRef.current = new Audio()
        audioRef.current.addEventListener('ended', () => setPlayingSegment(null))
      }

      // Get conversation start time from timeRanges
      const conversationStart = data?.timeRanges?.[0]?.start
      if (!conversationStart) {
        console.error('[SharedConversation] No conversation start time found')
        return
      }

      // Calculate absolute timestamps for the segment
      const convStartTime = new Date(conversationStart).getTime()
      const segmentStartTime = convStartTime + (segment.start * 1000)
      const segmentEndTime = convStartTime + (segment.end * 1000)

      const startUnix = Math.floor(segmentStartTime / 1000)
      const endUnix = Math.ceil(segmentEndTime / 1000)

      const myceliaBackendUrl = '/api/services/mycelia-backend/proxy'
      const audioUrl = `${myceliaBackendUrl}/api/audio/stream?start=${startUnix}&end=${endUnix}`

      // Fetch with auth headers via axios
      const response = await api.get(audioUrl, { responseType: 'blob' })
      const audioBlob = response.data
      const objectUrl = URL.createObjectURL(audioBlob)

      // Clean up old object URL
      if (audioRef.current.src.startsWith('blob:')) {
        URL.revokeObjectURL(audioRef.current.src)
      }

      audioRef.current.src = objectUrl
      await audioRef.current.play()
      setPlayingSegment(segmentId)
    } catch (err) {
      console.error('[SharedConversation] Error playing audio segment:', err)
      setPlayingSegment(null)
    }
  }

  const duration = formatDuration()
  const hasValidSegments = segments && segments.length > 0

  return (
    <div className="space-y-6" data-testid="shared-conversation-view">
      {/* Conversation metadata card */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-4">
        <div className="flex items-start space-x-3">
          <MessageSquare className="h-8 w-8 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-1" />
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              {title}
            </h1>
            {summary && (
              <div className="text-gray-700 dark:text-gray-300 mb-4 prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {summary}
                </ReactMarkdown>
              </div>
            )}
            {detailedSummary && detailedSummary !== summary && (
              <div className="text-sm text-gray-600 dark:text-gray-400 italic prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {detailedSummary}
                </ReactMarkdown>
              </div>
            )}
          </div>
        </div>

        {/* Play Full Audio Button */}
        {hasAudioData && (
          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={handleFullAudioPlayPause}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                playingFullAudio
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50'
              }`}
              data-testid="shared-play-full-audio-button"
            >
              {playingFullAudio ? (
                <>
                  <Pause className="h-5 w-5" />
                  <span>Pause Audio</span>
                </>
              ) : (
                <>
                  <Play className="h-5 w-5" />
                  <span>Play Full Audio</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Metadata grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          {startTime && (
            <div className="flex items-center space-x-2">
              <Calendar className="h-4 w-4 text-gray-500 dark:text-gray-400" />
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Started</p>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {new Date(startTime).toLocaleString()}
                </p>
              </div>
            </div>
          )}

          {endTime && (
            <div className="flex items-center space-x-2">
              <Calendar className="h-4 w-4 text-gray-500 dark:text-gray-400" />
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Ended</p>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {new Date(endTime).toLocaleString()}
                </p>
              </div>
            </div>
          )}

          {duration && (
            <div className="flex items-center space-x-2">
              <Clock className="h-4 w-4 text-gray-500 dark:text-gray-400" />
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Duration</p>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {duration}
                </p>
              </div>
            </div>
          )}

          {hasValidSegments && (
            <div className="flex items-center space-x-2">
              <User className="h-4 w-4 text-gray-500 dark:text-gray-400" />
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Segments</p>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {segments.length}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Transcript */}
      {(hasValidSegments || transcript) && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6" data-testid="shared-conversation-transcript">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Transcript
          </h2>

          {hasValidSegments ? (
            <div className="space-y-4">
              {segments.map((segment: any, idx: number) => {
                const segmentId = `segment-${idx}`
                const isPlaying = playingSegment === segmentId

                return (
                  <div
                    key={idx}
                    className={`flex space-x-3 p-3 rounded-lg ${
                      isPlaying
                        ? 'bg-blue-50 dark:bg-blue-900/20'
                        : 'bg-gray-50 dark:bg-gray-700/50'
                    }`}
                    data-testid={`shared-transcript-segment-${idx}`}
                  >
                    <div className="flex-shrink-0">
                      <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                        <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                          {segment.speaker?.charAt(0)?.toUpperCase() || '?'}
                        </span>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {segment.speaker || 'Unknown'}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {Math.floor(segment.start)}s - {Math.floor(segment.end)}s
                          </span>
                        </div>
                        {hasAudioData && (
                          <button
                            onClick={() => handleSegmentPlayPause(idx, segment)}
                            className={`flex items-center space-x-1 text-xs px-2 py-1 rounded ${
                              isPlaying
                                ? 'bg-blue-600 text-white hover:bg-blue-700'
                                : 'text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30'
                            }`}
                            data-testid={`shared-play-segment-${idx}`}
                          >
                            {isPlaying ? (
                              <>
                                <Pause className="h-3 w-3" />
                                <span>Pause</span>
                              </>
                            ) : (
                              <>
                                <Play className="h-3 w-3" />
                                <span>Play</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                      <div className="text-sm text-gray-700 dark:text-gray-300 prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {segment.text}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : transcript ? (
            <div
              className="p-4 rounded-lg bg-gray-50 dark:bg-gray-700/50 prose prose-sm dark:prose-invert max-w-none"
              data-testid="shared-transcript-plain"
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {transcript}
              </ReactMarkdown>
            </div>
          ) : null}
        </div>
      )}

      {/* No transcript message */}
      {!hasValidSegments && !transcript && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 text-center text-gray-500 dark:text-gray-400">
          <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-20" />
          <p>No transcript available</p>
        </div>
      )}
    </div>
  )
}

/**
 * Shared memory view
 */
function SharedMemoryView({ data }: { data: any }) {
  // Handle error response
  if (data?.error) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6" data-testid="shared-memory-error">
        <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
          <AlertCircle className="h-6 w-6" />
          <p>{data.error}</p>
        </div>
      </div>
    )
  }

  const content = data?.text || data?.content || ''
  const createdAt = data?.created_at || data?.createdAt
  const metadata = data?.metadata_ || data?.metadata || {}

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-4" data-testid="shared-memory-view">
      <div className="prose prose-sm dark:prose-invert max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {content}
        </ReactMarkdown>
      </div>

      {createdAt && (
        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Created: {new Date(createdAt).toLocaleString()}
          </p>
        </div>
      )}

      {Object.keys(metadata).length > 0 && (
        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Metadata:</p>
          <pre className="text-xs p-2 bg-gray-100 dark:bg-gray-900 rounded overflow-auto">
            {JSON.stringify(metadata, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}
