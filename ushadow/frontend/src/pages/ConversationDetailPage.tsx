import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useRef, useState, useEffect } from 'react'
import { ArrowLeft, MessageSquare, Clock, Calendar, User, AlertCircle, Play, Pause, Brain, ExternalLink } from 'lucide-react'
import { useConversationDetail } from '../hooks/useConversationDetail'
import type { ConversationSource } from '../hooks/useConversations'
import { useQuery } from '@tanstack/react-query'
import { api, unifiedMemoriesApi } from '../services/api'
import { getChronicleAudioUrl } from '../services/chronicleApi'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { MemoryCard } from '../components/memories/MemoryCard'

export default function ConversationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const source = (searchParams.get('source') || 'chronicle') as ConversationSource

  const { conversation, isLoading, error } = useConversationDetail(id!, source)

  // Fetch memories for this conversation (unified API for both Chronicle and Mycelia)
  const { data: memoriesData, isLoading: memoriesLoading } = useQuery({
    queryKey: ['conversation-memories', id, source],
    queryFn: async () => {
      if (id && (source === 'chronicle' || source === 'mycelia')) {
        const response = await unifiedMemoriesApi.getConversationMemories(id, source)
        return response.data
      }
      return null
    },
    enabled: (source === 'chronicle' || source === 'mycelia') && !!id,
  })

  // Audio playback state
  const [playingSegment, setPlayingSegment] = useState<string | null>(null)
  const [playingFullAudio, setPlayingFullAudio] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const segmentTimerRef = useRef<number | null>(null)

  // Log for debugging
  console.log('[ConversationDetailPage] Source:', source)
  console.log('[ConversationDetailPage] Conversation:', conversation)
  console.log('[ConversationDetailPage] Segments:', conversation?.segments)

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
      }
      if (segmentTimerRef.current) {
        window.clearTimeout(segmentTimerRef.current)
      }
    }
  }, [])

  // Handle segment play/pause
  const handleSegmentPlayPause = async (segmentIndex: number, segment: any) => {
    const segmentId = `segment-${segmentIndex}`

    // If this segment is playing, pause it
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

    // Stop any currently playing segment
    if (audioRef.current) {
      audioRef.current.pause()
    }
    if (segmentTimerRef.current) {
      window.clearTimeout(segmentTimerRef.current)
      segmentTimerRef.current = null
    }

    try {
      // Create or reuse audio element
      if (!audioRef.current) {
        audioRef.current = new Audio()
        audioRef.current.addEventListener('ended', () => setPlayingSegment(null))
      }

      if (source === 'chronicle') {
        // Chronicle: Use URL directly for instant playback (token in query string)
        const audioUrl = await getChronicleAudioUrl(id!, true)
        audioRef.current.src = audioUrl
        audioRef.current.currentTime = segment.start
      } else {
        // Mycelia: Fetch as blob to include auth headers
        const myceliaBackendUrl = '/api/services/mycelia-backend/proxy'
        const myceliaConv = conversation as any

        // Get conversation start time from timeRanges
        const conversationStart = myceliaConv?.timeRanges?.[0]?.start
        if (!conversationStart) {
          console.error('[ConversationDetail] No conversation start time found')
          return
        }

        // Calculate absolute timestamps for the segment
        const convStartTime = new Date(conversationStart).getTime()
        const segmentStartTime = convStartTime + (segment.start * 1000)
        const segmentEndTime = convStartTime + (segment.end * 1000)

        // Convert to Unix timestamps (seconds)
        // Use floor for start, ceil for end to avoid cutting off audio
        const startUnix = Math.floor(segmentStartTime / 1000)
        const endUnix = Math.ceil(segmentEndTime / 1000)

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
      }

      await audioRef.current.play()
      setPlayingSegment(segmentId)

      // Set timer to stop at segment end (only needed for Chronicle)
      // For Mycelia, we fetch exact chunks so the 'ended' event handles it
      if (source === 'chronicle') {
        const duration = (segment.end - segment.start) * 1000
        segmentTimerRef.current = window.setTimeout(() => {
          if (audioRef.current) {
            audioRef.current.pause()
          }
          setPlayingSegment(null)
          segmentTimerRef.current = null
        }, duration)
      }
    } catch (err) {
      console.error('[ConversationDetail] Error playing audio segment:', err)
      setPlayingSegment(null)
    }
  }

  // Handle full conversation audio play/pause
  const handleFullAudioPlayPause = async () => {
    // If full audio is playing, pause it
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
      // Create or reuse audio element
      if (!audioRef.current) {
        audioRef.current = new Audio()
        audioRef.current.addEventListener('ended', () => setPlayingFullAudio(false))
      }

      if (source === 'chronicle') {
        // Chronicle: Use URL directly for instant playback (token in query string)
        const audioUrl = await getChronicleAudioUrl(id!, true)
        audioRef.current.src = audioUrl
      } else {
        // Mycelia: Fetch as blob to include auth headers
        const myceliaConv = conversation as any
        const conversationStart = myceliaConv?.timeRanges?.[0]?.start
        const conversationEnd = myceliaConv?.timeRanges?.[0]?.end

        if (!conversationStart || !conversationEnd) {
          console.error('[ConversationDetail] No conversation time range found')
          return
        }

        // Convert to Unix timestamps (seconds)
        // Use floor for start, ceil for end to avoid cutting off audio
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
      }

      audioRef.current.currentTime = 0
      await audioRef.current.play()
      setPlayingFullAudio(true)
    } catch (err) {
      console.error('[ConversationDetail] Error playing full audio:', err)
      setPlayingFullAudio(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]" data-testid="conversation-detail-loading">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          <p className="text-neutral-600 dark:text-neutral-400">Loading conversation...</p>
        </div>
      </div>
    )
  }

  if (error || !conversation) {
    return (
      <div className="space-y-4" data-testid="conversation-detail-error">
        <button
          onClick={() => navigate('/conversations')}
          className="btn btn-secondary flex items-center space-x-2"
          data-testid="conversation-detail-back-button"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Conversations</span>
        </button>

        <div className="card p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <div className="flex items-start space-x-3">
            <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400 flex-shrink-0" />
            <div>
              <h3 className="text-lg font-semibold text-red-900 dark:text-red-100 mb-1">
                Failed to load conversation
              </h3>
              <p className="text-sm text-red-700 dark:text-red-300">
                {error ? String(error) : 'Conversation not found'}
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Mycelia stores data differently than Chronicle
  const myceliaConv = conversation as any

  // Extract title (mycelia uses 'name', chronicle uses 'title')
  const title = conversation.title || myceliaConv?.name || 'Untitled Conversation'

  // Extract summary (mycelia uses summaries array, chronicle uses summary string)
  const summary = conversation.summary ||
    (myceliaConv?.summaries && myceliaConv.summaries.length > 0
      ? myceliaConv.summaries[0].text
      : null)

  // Extract detailed summary (mycelia uses 'details', chronicle uses 'detailed_summary')
  const detailedSummary = conversation.detailed_summary || myceliaConv?.details

  // Check if segments exist (match Chronicle page logic)
  const hasValidSegments = conversation.segments && conversation.segments.length > 0

  // Extract start/end times
  const startTime = myceliaConv?.timeRanges?.[0]?.start || conversation.created_at
  const endTime = myceliaConv?.timeRanges?.[0]?.end || conversation.completed_at

  // Format duration
  const formatDuration = (seconds?: number) => {
    if (!seconds) {
      // Mycelia stores timeRanges instead of duration_seconds
      if (myceliaConv?.timeRanges && myceliaConv.timeRanges.length > 0) {
        const range = myceliaConv.timeRanges[0]
        if (range.start && range.end) {
          const start = new Date(range.start).getTime()
          const end = new Date(range.end).getTime()
          const durationMs = end - start
          const durationSec = Math.floor(durationMs / 1000)
          const mins = Math.floor(durationSec / 60)
          const secs = durationSec % 60
          return `${mins}m ${secs}s`
        }
      }
      return 'Unknown'
    }
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}m ${secs}s`
  }

  // Format date
  const formatDate = (dateString?: string) => {
    if (!dateString) {
      // Mycelia uses createdAt
      if (myceliaConv?.createdAt) {
        dateString = myceliaConv.createdAt
      } else {
        return 'Unknown'
      }
    }
    try {
      return new Date(dateString).toLocaleString()
    } catch {
      return dateString
    }
  }

  const sourceColor = source === 'chronicle' ? 'blue' : 'purple'
  const sourceLabel = source === 'chronicle' ? 'Chronicle' : 'Mycelia'

  return (
    <div className="space-y-6" data-testid="conversation-detail-page">
      {/* Header with back button */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/conversations')}
          className="btn btn-secondary flex items-center space-x-2"
          data-testid="conversation-detail-back-button"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Conversations</span>
        </button>

        {/* Source badge */}
        <span
          className={`px-3 py-1 rounded-full text-sm font-medium ${
            sourceColor === 'blue'
              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
              : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
          }`}
          data-testid="conversation-source-badge"
        >
          {sourceLabel}
        </span>
      </div>

      {/* Conversation metadata */}
      <div className="card p-6 space-y-4" data-testid="conversation-metadata">
        <div className="flex items-start space-x-3">
          <MessageSquare className="h-8 w-8 text-primary-600 dark:text-primary-400 flex-shrink-0 mt-1" />
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-2">
              {title}
            </h1>
            {summary && (
              <div className="text-neutral-700 dark:text-neutral-300 mb-4 prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {summary}
                </ReactMarkdown>
              </div>
            )}
            {detailedSummary && detailedSummary !== summary && (
              <div className="text-sm text-neutral-600 dark:text-neutral-400 italic prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {detailedSummary}
                </ReactMarkdown>
              </div>
            )}
          </div>
        </div>

        {/* Play Full Audio Button */}
        <div className="pt-4 border-t border-neutral-200 dark:border-neutral-700">
          <button
            onClick={handleFullAudioPlayPause}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              playingFullAudio
                ? 'bg-primary-600 text-white hover:bg-primary-700'
                : 'bg-primary-100 text-primary-700 hover:bg-primary-200 dark:bg-primary-900/30 dark:text-primary-300 dark:hover:bg-primary-900/50'
            }`}
            data-testid="play-full-audio-button"
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

        {/* Metadata grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-neutral-200 dark:border-neutral-700">
          {/* Start time */}
          {startTime && (
            <div className="flex items-center space-x-2">
              <Calendar className="h-4 w-4 text-neutral-500 dark:text-neutral-400" />
              <div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  {source === 'mycelia' ? 'Started' : 'Created'}
                </p>
                <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  {new Date(startTime).toLocaleString()}
                </p>
              </div>
            </div>
          )}

          {/* End time */}
          {endTime && (
            <div className="flex items-center space-x-2">
              <Calendar className="h-4 w-4 text-neutral-500 dark:text-neutral-400" />
              <div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  {source === 'mycelia' ? 'Ended' : 'Completed'}
                </p>
                <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  {new Date(endTime).toLocaleString()}
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center space-x-2">
            <Clock className="h-4 w-4 text-neutral-500 dark:text-neutral-400" />
            <div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">Duration</p>
              <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                {formatDuration(conversation.duration_seconds)}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <User className="h-4 w-4 text-neutral-500 dark:text-neutral-400" />
            <div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">Segments</p>
              <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                {hasValidSegments ? (conversation.segments?.length || 0) : 0}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <MessageSquare className="h-4 w-4 text-neutral-500 dark:text-neutral-400" />
            <div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">Memories</p>
              <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                {conversation.memory_count || 0}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Memories Section (Chronicle only) */}
      {source === 'chronicle' && (
        <div className="card p-6" data-testid="conversation-memories">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
                Memories
              </h2>
              {memoriesData && (
                <span className="px-2 py-0.5 text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full">
                  {memoriesData.count}
                </span>
              )}
            </div>
            {memoriesData && memoriesData.count > 0 && (
              <button
                onClick={() => navigate('/memories')}
                className="text-sm text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1"
                data-testid="view-all-memories-link"
              >
                View all memories
                <ExternalLink className="h-3 w-3" />
              </button>
            )}
          </div>

          {memoriesLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
            </div>
          ) : memoriesData && memoriesData.memories && memoriesData.memories.length > 0 ? (
            <div className="space-y-3">
              {memoriesData.memories.map((memory, idx: number) => (
                <MemoryCard
                  key={memory.id || idx}
                  memory={memory}
                  onClick={() => navigate(`/memories/${memory.id}`)}
                  showSource={true}
                  testId={`memory-item-${idx}`}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-neutral-500 dark:text-neutral-400">
              <Brain className="h-12 w-12 mx-auto mb-2 opacity-20" />
              <p className="text-sm">No memories extracted from this conversation</p>
            </div>
          )}
        </div>
      )}

      {/* Transcript */}
      {hasValidSegments || conversation.transcript ? (
        <div className="card p-6" data-testid="conversation-transcript">
          <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
            Transcript
          </h2>

          {/* Segmented transcript (only if segments have actual text) */}
          {hasValidSegments ? (
            <div className="space-y-4">
              {conversation.segments.map((segment, idx) => {
                const segmentId = `segment-${idx}`
                const isPlaying = playingSegment === segmentId

                return (
                  <div
                    key={idx}
                    className={`flex space-x-3 p-3 rounded-lg ${
                      isPlaying
                        ? 'bg-primary-50 dark:bg-primary-900/20'
                        : 'bg-neutral-50 dark:bg-neutral-800/50'
                    }`}
                    data-testid={`transcript-segment-${idx}`}
                  >
                    <div className="flex-shrink-0">
                      <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                        <span className="text-sm font-medium text-primary-700 dark:text-primary-300">
                          {segment.speaker?.charAt(0)?.toUpperCase() || '?'}
                        </span>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                            {segment.speaker || 'Unknown'}
                          </span>
                          <span className="text-xs text-neutral-500 dark:text-neutral-400">
                            {Math.floor(segment.start)}s - {Math.floor(segment.end)}s
                          </span>
                        </div>
                        <button
                          onClick={() => handleSegmentPlayPause(idx, segment)}
                          className={`flex items-center space-x-1 text-xs px-2 py-1 rounded ${
                            isPlaying
                              ? 'bg-primary-600 text-white hover:bg-primary-700'
                              : 'text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/30'
                          }`}
                          data-testid={`play-segment-${idx}`}
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
                      </div>
                      <div className="text-sm text-neutral-700 dark:text-neutral-300 prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {segment.text}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            /* Plain transcript */
            <div
              className="p-4 rounded-lg bg-neutral-50 dark:bg-neutral-800/50 prose prose-sm dark:prose-invert max-w-none"
              data-testid="transcript-plain"
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {conversation.transcript}
              </ReactMarkdown>
            </div>
          )}
        </div>
      ) : (
        <div className="card p-6 text-center text-neutral-500 dark:text-neutral-400">
          <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-20" />
          <p>No transcript available</p>
        </div>
      )}
    </div>
  )
}
