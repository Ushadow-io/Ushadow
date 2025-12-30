import { useState, useEffect, useRef } from 'react'
import {
  MessageSquare,
  RefreshCw,
  Calendar,
  User,
  Play,
  Pause,
  MoreVertical,
  RotateCcw,
  Zap,
  ChevronDown,
  ChevronUp,
  Trash2,
  AlertCircle
} from 'lucide-react'
import {
  chronicleConversationsApi,
  getChronicleAudioUrl,
  chronicleAuthApi,
  Conversation
} from '../../services/chronicleApi'

// Speaker color palette for consistent colors across conversations
const SPEAKER_COLOR_PALETTE = [
  'text-blue-600 dark:text-blue-400',
  'text-green-600 dark:text-green-400',
  'text-purple-600 dark:text-purple-400',
  'text-orange-600 dark:text-orange-400',
  'text-pink-600 dark:text-pink-400',
  'text-indigo-600 dark:text-indigo-400',
  'text-red-600 dark:text-red-400',
  'text-yellow-600 dark:text-yellow-400',
  'text-teal-600 dark:text-teal-400',
  'text-cyan-600 dark:text-cyan-400',
]

interface ChronicleConversationsProps {
  onAuthRequired?: () => void
}

export default function ChronicleConversations({ onAuthRequired }: ChronicleConversationsProps) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [debugMode, setDebugMode] = useState(false)

  // Transcript expand/collapse state
  const [expandedTranscripts, setExpandedTranscripts] = useState<Set<string>>(new Set())
  const [expandedDetailedSummaries, setExpandedDetailedSummaries] = useState<Set<string>>(new Set())

  // Audio playback state
  const [playingSegment, setPlayingSegment] = useState<string | null>(null)
  const audioRefs = useRef<{ [key: string]: HTMLAudioElement }>({})
  const segmentTimerRef = useRef<number | null>(null)

  // Dropdown and action state
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const [reprocessingTranscript, setReprocessingTranscript] = useState<Set<string>>(new Set())
  const [reprocessingMemory, setReprocessingMemory] = useState<Set<string>>(new Set())
  const [deletingConversation, setDeletingConversation] = useState<Set<string>>(new Set())

  const loadConversations = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await chronicleConversationsApi.getAll()
      const conversationsList = response.data.conversations || []
      setConversations(conversationsList)
    } catch (err: any) {
      if (err.response?.status === 401) {
        onAuthRequired?.()
        setError('Authentication required. Please log in to Chronicle.')
      } else {
        setError(err.message || 'Failed to load conversations')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (chronicleAuthApi.isAuthenticated()) {
      loadConversations()
    } else {
      setLoading(false)
      setError('Please log in to Chronicle to view conversations.')
    }
  }, [])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setOpenDropdown(null)
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  const formatDate = (timestamp: number | string) => {
    if (typeof timestamp === 'string') {
      const isoString = timestamp.endsWith('Z') || timestamp.includes('+')
        ? timestamp
        : timestamp + 'Z'
      return new Date(isoString).toLocaleString()
    }
    if (timestamp === 0) return 'Unknown date'
    return new Date(timestamp * 1000).toLocaleString()
  }

  const handleReprocessTranscript = async (conversation: Conversation) => {
    if (!conversation.conversation_id) {
      setError('Cannot reprocess: Conversation ID is missing.')
      return
    }

    try {
      setReprocessingTranscript(prev => new Set(prev).add(conversation.conversation_id!))
      setOpenDropdown(null)
      await chronicleConversationsApi.reprocessTranscript(conversation.conversation_id)
      await loadConversations()
    } catch (err: any) {
      setError(`Error reprocessing transcript: ${err.message || 'Unknown error'}`)
    } finally {
      if (conversation.conversation_id) {
        setReprocessingTranscript(prev => {
          const newSet = new Set(prev)
          newSet.delete(conversation.conversation_id!)
          return newSet
        })
      }
    }
  }

  const handleReprocessMemory = async (conversation: Conversation) => {
    if (!conversation.conversation_id) {
      setError('Cannot reprocess: Conversation ID is missing.')
      return
    }

    try {
      setReprocessingMemory(prev => new Set(prev).add(conversation.conversation_id!))
      setOpenDropdown(null)
      await chronicleConversationsApi.reprocessMemory(conversation.conversation_id)
      await loadConversations()
    } catch (err: any) {
      setError(`Error reprocessing memory: ${err.message || 'Unknown error'}`)
    } finally {
      if (conversation.conversation_id) {
        setReprocessingMemory(prev => {
          const newSet = new Set(prev)
          newSet.delete(conversation.conversation_id!)
          return newSet
        })
      }
    }
  }

  const handleDeleteConversation = async (conversationId: string) => {
    if (!window.confirm('Are you sure you want to delete this conversation?')) return

    try {
      setDeletingConversation(prev => new Set(prev).add(conversationId))
      setOpenDropdown(null)
      await chronicleConversationsApi.delete(conversationId)
      await loadConversations()
    } catch (err: any) {
      setError(`Error deleting conversation: ${err.message || 'Unknown error'}`)
    } finally {
      setDeletingConversation(prev => {
        const newSet = new Set(prev)
        newSet.delete(conversationId)
        return newSet
      })
    }
  }

  const toggleDetailedSummary = async (conversationId: string) => {
    if (expandedDetailedSummaries.has(conversationId)) {
      setExpandedDetailedSummaries(prev => {
        const newSet = new Set(prev)
        newSet.delete(conversationId)
        return newSet
      })
      return
    }

    const conversation = conversations.find(c => c.conversation_id === conversationId)
    if (!conversation?.conversation_id) return

    if (conversation.detailed_summary) {
      setExpandedDetailedSummaries(prev => new Set(prev).add(conversationId))
      return
    }

    try {
      const response = await chronicleConversationsApi.getById(conversation.conversation_id)
      if (response.status === 200 && response.data.conversation) {
        setConversations(prev => prev.map(c =>
          c.conversation_id === conversationId
            ? { ...c, detailed_summary: response.data.conversation.detailed_summary }
            : c
        ))
        setExpandedDetailedSummaries(prev => new Set(prev).add(conversationId))
      }
    } catch (err: any) {
      setError(`Failed to load detailed summary: ${err.message || 'Unknown error'}`)
    }
  }

  const toggleTranscriptExpansion = async (conversationId: string) => {
    if (expandedTranscripts.has(conversationId)) {
      setExpandedTranscripts(prev => {
        const newSet = new Set(prev)
        newSet.delete(conversationId)
        return newSet
      })
      return
    }

    const conversation = conversations.find(c => c.conversation_id === conversationId)
    if (!conversation?.conversation_id) return

    if (conversation.segments && conversation.segments.length > 0) {
      setExpandedTranscripts(prev => new Set(prev).add(conversationId))
      return
    }

    try {
      const response = await chronicleConversationsApi.getById(conversation.conversation_id)
      if (response.status === 200 && response.data.conversation) {
        setConversations(prev => prev.map(c =>
          c.conversation_id === conversationId
            ? { ...c, ...response.data.conversation }
            : c
        ))
        setExpandedTranscripts(prev => new Set(prev).add(conversationId))
      }
    } catch (err: any) {
      setError(`Failed to load transcript: ${err.message || 'Unknown error'}`)
    }
  }

  const handleSegmentPlayPause = (conversationId: string, segmentIndex: number, segment: any, useCropped: boolean) => {
    const segmentId = `${conversationId}-${segmentIndex}`
    const audioKey = `${conversationId}-${useCropped ? 'cropped' : 'original'}`

    if (playingSegment === segmentId) {
      const audio = audioRefs.current[audioKey]
      if (audio) audio.pause()
      if (segmentTimerRef.current) {
        window.clearTimeout(segmentTimerRef.current)
        segmentTimerRef.current = null
      }
      setPlayingSegment(null)
      return
    }

    if (playingSegment) {
      Object.values(audioRefs.current).forEach(audio => audio.pause())
      if (segmentTimerRef.current) {
        window.clearTimeout(segmentTimerRef.current)
        segmentTimerRef.current = null
      }
    }

    let audio = audioRefs.current[audioKey]

    if (!audio || audio.error) {
      const audioUrl = getChronicleAudioUrl(conversationId, useCropped)
      audio = new Audio(audioUrl)
      audioRefs.current[audioKey] = audio
      audio.addEventListener('ended', () => setPlayingSegment(null))
    }

    audio.currentTime = segment.start
    audio.play().then(() => {
      setPlayingSegment(segmentId)
      const duration = (segment.end - segment.start) * 1000
      segmentTimerRef.current = window.setTimeout(() => {
        audio.pause()
        setPlayingSegment(null)
        segmentTimerRef.current = null
      }, duration)
    }).catch(err => {
      console.error('Error playing audio segment:', err)
      setPlayingSegment(null)
    })
  }

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      Object.values(audioRefs.current).forEach(audio => audio.pause())
      if (segmentTimerRef.current) window.clearTimeout(segmentTimerRef.current)
    }
  }, [])

  if (loading) {
    return (
      <div data-testid="chronicle-conversations-loading" className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        <span className="ml-2 text-neutral-600 dark:text-neutral-400">Loading conversations...</span>
      </div>
    )
  }

  if (error && !chronicleAuthApi.isAuthenticated()) {
    return (
      <div data-testid="chronicle-conversations-auth-required" className="text-center py-12">
        <AlertCircle className="h-12 w-12 mx-auto mb-4 text-amber-500" />
        <p className="text-neutral-600 dark:text-neutral-400 mb-4">{error}</p>
        <button
          onClick={onAuthRequired}
          className="btn-primary"
        >
          Log in to Chronicle
        </button>
      </div>
    )
  }

  if (error) {
    return (
      <div data-testid="chronicle-conversations-error" className="text-center py-12">
        <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-500" />
        <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
        <button onClick={loadConversations} className="btn-primary">
          Try Again
        </button>
      </div>
    )
  }

  return (
    <div data-testid="chronicle-conversations">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center space-x-2">
          <MessageSquare className="h-6 w-6 text-primary-600 dark:text-primary-400" />
          <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
            Conversations
          </h2>
          <span className="text-sm text-neutral-500">({conversations.length})</span>
        </div>
        <div className="flex items-center space-x-4">
          <label className="flex items-center space-x-2 text-sm">
            <input
              type="checkbox"
              checked={debugMode}
              onChange={(e) => setDebugMode(e.target.checked)}
              className="rounded border-neutral-300"
            />
            <span className="text-neutral-700 dark:text-neutral-300">Debug</span>
          </label>
          <button
            onClick={loadConversations}
            className="btn-secondary flex items-center space-x-2"
            data-testid="refresh-conversations"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Conversations List */}
      <div className="space-y-4">
        {conversations.length === 0 ? (
          <div data-testid="no-conversations" className="text-center text-neutral-500 dark:text-neutral-400 py-12">
            <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No conversations found</p>
          </div>
        ) : (
          conversations.map((conversation) => (
            <div
              key={conversation.conversation_id || conversation.audio_uuid}
              data-testid={`conversation-${conversation.conversation_id || conversation.audio_uuid}`}
              className={`card p-4 ${
                conversation.deleted
                  ? 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700'
                  : ''
              }`}
            >
              {/* Deleted Warning */}
              {conversation.deleted && (
                <div className="mb-3 p-2 bg-red-100 dark:bg-red-900/40 rounded border border-red-300 dark:border-red-700">
                  <div className="flex items-center space-x-2">
                    <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" />
                    <span className="text-sm text-red-700 dark:text-red-300">
                      Processing failed: {conversation.deletion_reason || 'Unknown reason'}
                    </span>
                  </div>
                </div>
              )}

              {/* Header Row */}
              <div className="flex justify-between items-start mb-3">
                <div className="flex-1">
                  <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">
                    {conversation.title || "Untitled Conversation"}
                  </h3>
                  {conversation.summary && (
                    <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1 italic">
                      {conversation.summary}
                    </p>
                  )}
                  {/* Detailed Summary Toggle */}
                  {conversation.conversation_id && (
                    <button
                      onClick={() => toggleDetailedSummary(conversation.conversation_id!)}
                      className="text-xs text-primary-600 dark:text-primary-400 hover:underline mt-1 flex items-center space-x-1"
                    >
                      <span>{expandedDetailedSummaries.has(conversation.conversation_id) ? '▼' : '▶'} Details</span>
                    </button>
                  )}
                  {expandedDetailedSummaries.has(conversation.conversation_id!) && conversation.detailed_summary && (
                    <div className="mt-2 p-2 bg-primary-50 dark:bg-primary-900/20 rounded text-sm">
                      {conversation.detailed_summary}
                    </div>
                  )}
                  {/* Metadata */}
                  <div className="flex items-center space-x-4 mt-2 text-xs text-neutral-500">
                    <span className="flex items-center space-x-1">
                      <Calendar className="h-3 w-3" />
                      <span>{formatDate(conversation.created_at || '')}</span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <User className="h-3 w-3" />
                      <span>{conversation.client_id}</span>
                    </span>
                    {conversation.duration_seconds && conversation.duration_seconds > 0 && (
                      <span>
                        {Math.floor(conversation.duration_seconds / 60)}:{(conversation.duration_seconds % 60).toFixed(0).padStart(2, '0')} min
                      </span>
                    )}
                    {conversation.segment_count && <span>{conversation.segment_count} segments</span>}
                  </div>
                </div>

                {/* Actions Dropdown */}
                <div className="relative">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      const key = conversation.conversation_id || conversation.audio_uuid
                      setOpenDropdown(openDropdown === key ? null : key)
                    }}
                    className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700"
                    data-testid={`conversation-menu-${conversation.conversation_id}`}
                  >
                    <MoreVertical className="h-4 w-4 text-neutral-500" />
                  </button>

                  {openDropdown === (conversation.conversation_id || conversation.audio_uuid) && (
                    <div className="absolute right-0 top-8 w-44 bg-white dark:bg-neutral-800 rounded-lg shadow-lg border border-neutral-200 dark:border-neutral-700 py-1 z-10">
                      <button
                        onClick={() => handleReprocessTranscript(conversation)}
                        disabled={!conversation.conversation_id || reprocessingTranscript.has(conversation.conversation_id)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center space-x-2 disabled:opacity-50"
                      >
                        {reprocessingTranscript.has(conversation.conversation_id!) ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <RotateCcw className="h-4 w-4" />
                        )}
                        <span>Reprocess Transcript</span>
                      </button>
                      <button
                        onClick={() => handleReprocessMemory(conversation)}
                        disabled={!conversation.conversation_id || reprocessingMemory.has(conversation.conversation_id)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center space-x-2 disabled:opacity-50"
                      >
                        {reprocessingMemory.has(conversation.conversation_id!) ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <Zap className="h-4 w-4" />
                        )}
                        <span>Reprocess Memory</span>
                      </button>
                      <hr className="my-1 border-neutral-200 dark:border-neutral-700" />
                      <button
                        onClick={() => conversation.conversation_id && handleDeleteConversation(conversation.conversation_id)}
                        disabled={!conversation.conversation_id || deletingConversation.has(conversation.conversation_id!)}
                        className="w-full text-left px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center space-x-2 disabled:opacity-50"
                      >
                        {deletingConversation.has(conversation.conversation_id!) ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                        <span>Delete</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Audio Player */}
              {(conversation.audio_path || conversation.cropped_audio_path) && conversation.conversation_id && (
                <div className="mb-3">
                  <audio
                    controls
                    className="w-full h-8"
                    preload="metadata"
                    src={getChronicleAudioUrl(conversation.conversation_id, !debugMode)}
                  >
                    Your browser does not support audio.
                  </audio>
                </div>
              )}

              {/* Transcript Section */}
              <div>
                <div
                  className="flex items-center justify-between cursor-pointer p-2 rounded hover:bg-neutral-100 dark:hover:bg-neutral-700"
                  onClick={() => conversation.conversation_id && toggleTranscriptExpansion(conversation.conversation_id)}
                >
                  <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Transcript {conversation.segment_count && `(${conversation.segment_count} segments)`}
                  </span>
                  {conversation.conversation_id && expandedTranscripts.has(conversation.conversation_id) ? (
                    <ChevronUp className="h-4 w-4 text-neutral-500" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-neutral-500" />
                  )}
                </div>

                {conversation.conversation_id && expandedTranscripts.has(conversation.conversation_id) && (
                  <div className="mt-2 p-3 bg-neutral-50 dark:bg-neutral-800 rounded border border-neutral-200 dark:border-neutral-700">
                    {conversation.segments && conversation.segments.length > 0 ? (
                      <div className="space-y-1">
                        {(() => {
                          const speakerColorMap: { [key: string]: string } = {}
                          let colorIndex = 0
                          conversation.segments!.forEach(segment => {
                            const speaker = segment.speaker || 'Unknown'
                            if (!speakerColorMap[speaker]) {
                              speakerColorMap[speaker] = SPEAKER_COLOR_PALETTE[colorIndex % SPEAKER_COLOR_PALETTE.length]
                              colorIndex++
                            }
                          })

                          return conversation.segments!.map((segment, index) => {
                            const speaker = segment.speaker || 'Unknown'
                            const speakerColor = speakerColorMap[speaker]
                            const conversationKey = conversation.conversation_id || conversation.audio_uuid
                            const segmentId = `${conversationKey}-${index}`
                            const isPlaying = playingSegment === segmentId
                            const useCropped = !debugMode && !!conversation.cropped_audio_path

                            return (
                              <div
                                key={index}
                                className={`text-sm flex items-start space-x-2 py-1 px-2 rounded ${
                                  isPlaying ? 'bg-primary-50 dark:bg-primary-900/20' : 'hover:bg-neutral-100 dark:hover:bg-neutral-700'
                                }`}
                              >
                                {(conversation.audio_path || conversation.cropped_audio_path) && (
                                  <button
                                    onClick={() => handleSegmentPlayPause(conversationKey, index, segment, useCropped)}
                                    className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5 ${
                                      isPlaying
                                        ? 'bg-primary-600 text-white'
                                        : 'bg-neutral-200 dark:bg-neutral-600 text-neutral-600 dark:text-neutral-300'
                                    }`}
                                  >
                                    {isPlaying ? <Pause className="w-2.5 h-2.5" /> : <Play className="w-2.5 h-2.5 ml-0.5" />}
                                  </button>
                                )}
                                <div className="flex-1">
                                  {debugMode && (
                                    <span className="text-xs text-neutral-400 mr-2">
                                      [{segment.start.toFixed(1)}s - {segment.end.toFixed(1)}s]
                                    </span>
                                  )}
                                  <span className={`font-medium ${speakerColor}`}>{speaker}:</span>
                                  <span className="text-neutral-900 dark:text-neutral-100 ml-1">{segment.text}</span>
                                </div>
                              </div>
                            )
                          })
                        })()}
                      </div>
                    ) : (
                      <p className="text-sm text-neutral-500 italic">No transcript available</p>
                    )}
                  </div>
                )}
              </div>

              {/* Debug Info */}
              {debugMode && (
                <div className="mt-3 pt-3 border-t border-neutral-200 dark:border-neutral-700">
                  <p className="text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Debug Info:</p>
                  <div className="text-xs text-neutral-500 space-y-0.5">
                    <div>ID: {conversation.conversation_id || 'N/A'}</div>
                    <div>Audio UUID: {conversation.audio_uuid}</div>
                    <div>Audio: {conversation.audio_path || 'N/A'}</div>
                    <div>Cropped: {conversation.cropped_audio_path || 'N/A'}</div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
