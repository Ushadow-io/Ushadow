import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Brain, Calendar, Tag, MessageSquare, Edit2, Trash2, AlertCircle, Database, Copy, Check, ExternalLink } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { unifiedMemoriesApi, memoriesApi, type ConversationMemory } from '../services/api'
import { useConversationDetail } from '../hooks/useConversationDetail'
import ConfirmDialog from '../components/ConfirmDialog'

interface ConversationLink {
  conversation_id: string
  title: string
  created_at: string
  source: 'chronicle' | 'mycelia'
}

interface RelatedMemory {
  id: string
  memory: string
  categories: string[]
  created_at: number
  state: string
}

interface AccessLogEntry {
  id: string
  app_name: string
  accessed_at: string
}

export default function MemoryDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [copiedId, setCopiedId] = useState(false)

  // Fetch memory details using unified backend API
  const { data: memory, isLoading, error } = useQuery({
    queryKey: ['memory', id],
    queryFn: async () => {
      if (!id) throw new Error('Memory ID is required')
      const response = await unifiedMemoriesApi.getMemoryById(id)
      return response.data
    },
    enabled: !!id,
  })

  // Fetch related memories (only for openmemory source)
  const { data: relatedMemories, isLoading: relatedLoading } = useQuery({
    queryKey: ['related-memories', id],
    queryFn: async () => {
      if (!id || !memory) return []
      // Extract user_id from metadata
      const userId = memory.metadata?.user_id || memory.metadata?.chronicle_user_email || 'default'
      try {
        const memories = await memoriesApi.getRelatedMemories(userId, id)
        return memories
      } catch (err) {
        console.error('Failed to fetch related memories:', err)
        return []
      }
    },
    enabled: !!id && !!memory && memory.source === 'openmemory',
  })

  // Fetch access logs (only for openmemory source)
  const { data: accessLogs, isLoading: logsLoading } = useQuery({
    queryKey: ['memory-access-logs', id],
    queryFn: async () => {
      if (!id) return []
      try {
        const result = await memoriesApi.getAccessLogs(id, 1, 10)
        return result.logs
      } catch (err) {
        console.error('Failed to fetch access logs:', err)
        return []
      }
    },
    enabled: !!id && memory?.source === 'openmemory',
  })

  // Derive conversation link from metadata
  const conversationId = memory?.metadata?.source_id
  const conversationSource = memory?.metadata ? (
    memory.metadata.conversation_source ||
    (memory.metadata.app_name?.toLowerCase().includes('mycelia') ? 'mycelia' : 'chronicle')
  ) as 'chronicle' | 'mycelia' : 'chronicle'

  // Fetch full conversation details to get title and summary
  const { conversation, isLoading: conversationLoading } = useConversationDetail(
    conversationId || '',
    conversationSource,
    { enabled: !!conversationId }
  )

  const handleDelete = async () => {
    if (!id || !memory) return

    try {
      // For now, show message that delete needs implementation
      alert('Memory deletion is not yet implemented for unified memories API')
      setShowDeleteDialog(false)
    } catch (err) {
      console.error('Failed to delete memory:', err)
      alert('Failed to delete memory')
    }
  }

  const handleCopyId = async () => {
    if (id) {
      await navigator.clipboard.writeText(id)
      setCopiedId(true)
      setTimeout(() => setCopiedId(false), 2000)
    }
  }

  const formatDate = (dateString: string) => {
    const timestamp = dateString.includes('T') || dateString.includes('-')
      ? new Date(dateString).getTime()
      : parseInt(dateString) * 1000
    return new Date(timestamp).toLocaleString()
  }

  const formatAccessDate = (dateString: string) => {
    return new Date(dateString + 'Z').toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    })
  }

  // Extract categories from metadata
  // Debug: log memory object to see structure
  if (memory) {
    console.log('[MemoryDetailPage] Memory object:', memory)
    console.log('[MemoryDetailPage] Metadata:', memory.metadata)
    console.log('[MemoryDetailPage] Categories from metadata:', memory.metadata?.categories)
  }
  const categories = memory?.metadata?.categories || []
  console.log('[MemoryDetailPage] Final categories:', categories)

  // Source badge colors
  const sourceColors = {
    openmemory: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
    chronicle: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
    mycelia: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  }

  // Category colors
  const categoryColors: Record<string, string> = {
    personal: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
    work: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
    health: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
    finance: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
    travel: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
    education: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300',
    preferences: 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300',
    relationships: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]" data-testid="memory-detail-loading">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
          <p className="text-neutral-600 dark:text-neutral-400">Loading memory...</p>
        </div>
      </div>
    )
  }

  if (error || !memory) {
    return (
      <div className="space-y-4" data-testid="memory-detail-error">
        <button
          onClick={() => navigate('/memories')}
          className="btn btn-secondary flex items-center space-x-2"
          data-testid="memory-detail-back-button"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Memories</span>
        </button>

        <div className="card p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <div className="flex items-start space-x-3">
            <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400 flex-shrink-0" />
            <div>
              <h3 className="text-lg font-semibold text-red-900 dark:text-red-100 mb-1">
                Failed to load memory
              </h3>
              <p className="text-sm text-red-700 dark:text-red-300">
                {error ? String(error) : 'Memory not found'}
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4" data-testid="memory-detail-page">
      {/* Back button */}
      <button
        onClick={() => navigate('/memories')}
        className="btn btn-secondary flex items-center space-x-2"
        data-testid="memory-detail-back-button"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>Back to Memories</span>
      </button>

      {/* Main layout: 2/3 content + 1/3 sidebar */}
      <div className="flex gap-4 w-full">
        {/* Main content (2/3) */}
        <div className="w-2/3 space-y-4">
          {/* Memory card */}
          <div className="card overflow-hidden" data-testid="memory-content">
            {/* Header */}
            <div className="flex items-center justify-between p-4 bg-neutral-100 dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700">
              <div className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                  Memory
                  <span className="ml-2 text-sm font-normal text-neutral-500 dark:text-neutral-400">
                    #{id?.slice(0, 6)}
                  </span>
                </h2>
                <button
                  onClick={handleCopyId}
                  className="p-1 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded transition-colors"
                  data-testid="copy-memory-id"
                  title="Copy memory ID"
                >
                  {copiedId ? (
                    <Check className="h-3 w-3 text-green-600 dark:text-green-400" />
                  ) : (
                    <Copy className="h-3 w-3 text-neutral-500 dark:text-neutral-400" />
                  )}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigate(`/memories`)}
                  className="btn btn-secondary flex items-center space-x-2"
                  data-testid="edit-memory-button"
                >
                  <Edit2 className="h-4 w-4" />
                  <span>Edit</span>
                </button>
                <button
                  onClick={() => setShowDeleteDialog(true)}
                  className="btn bg-red-600 hover:bg-red-700 text-white flex items-center space-x-2"
                  data-testid="delete-memory-button"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Delete</span>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              {/* Memory text with accent border */}
              <div className="border-l-4 border-purple-500 pl-4 py-2">
                <p className="text-lg text-neutral-900 dark:text-neutral-100 leading-relaxed">
                  {memory.content}
                </p>
              </div>

              {/* Categories and metadata row */}
              <div className="flex items-center justify-between pt-4 border-t border-neutral-200 dark:border-neutral-700">
                {/* Categories */}
                <div className="flex items-center gap-2 flex-wrap">
                  {categories.length > 0 && (
                    <>
                      <Tag className="h-4 w-4 text-neutral-500 dark:text-neutral-400" />
                      {categories.map((category: string, idx: number) => (
                        <span
                          key={idx}
                          className={`px-3 py-1 text-sm rounded-full ${
                            categoryColors[category.toLowerCase()] ||
                            'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300'
                          }`}
                          data-testid={`category-${idx}`}
                        >
                          {category}
                        </span>
                      ))}
                    </>
                  )}
                </div>

                {/* Created by */}
                {memory.metadata?.app_name && (
                  <div className="flex items-center gap-2 bg-neutral-100 dark:bg-neutral-800 px-3 py-1.5 rounded-lg">
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">Created by:</span>
                    <Database className="h-4 w-4 text-neutral-500 dark:text-neutral-400" />
                    <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                      {memory.metadata.app_name}
                    </span>
                  </div>
                )}
              </div>

              {/* Metadata section */}
              {memory.metadata && Object.keys(memory.metadata).length > 0 && (
                <div className="pt-4 border-t border-neutral-200 dark:border-neutral-700">
                  <p className="text-xs uppercase text-neutral-500 dark:text-neutral-400 mb-2">
                    Metadata
                  </p>
                  <div className="bg-neutral-100 dark:bg-neutral-800 rounded-lg p-4 max-h-64 overflow-auto">
                    <pre className="text-sm text-neutral-700 dark:text-neutral-300 font-mono whitespace-pre-wrap">
                      {JSON.stringify(memory.metadata, null, 2)}
                    </pre>
                  </div>
                </div>
              )}

              {/* Additional info */}
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-neutral-200 dark:border-neutral-700">
                <div className="flex items-center space-x-2">
                  <Calendar className="h-4 w-4 text-neutral-500 dark:text-neutral-400" />
                  <div>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">Created</p>
                    <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                      {formatDate(memory.created_at)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Database className="h-4 w-4 text-neutral-500 dark:text-neutral-400" />
                  <div>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">Source</p>
                    <span className={`inline-block px-2 py-0.5 text-xs rounded ${sourceColors[memory.source]}`}>
                      {memory.source}
                    </span>
                  </div>
                </div>

                {memory.score !== null && memory.score !== undefined && (
                  <div className="flex items-center space-x-2">
                    <Tag className="h-4 w-4 text-neutral-500 dark:text-neutral-400" />
                    <div>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">Relevance</p>
                      <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                        {(memory.score * 100).toFixed(1)}%
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Linked Conversations */}
          {conversationId && (
            <div className="card p-6" data-testid="memory-conversations">
              <div className="flex items-center gap-2 mb-4">
                <MessageSquare className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
                  Linked Conversation
                </h2>
              </div>

              {conversationLoading ? (
                <div className="p-4 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg">
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">Loading conversation...</p>
                </div>
              ) : conversation ? (
                <div
                  className="p-4 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800/70 transition-colors cursor-pointer"
                  onClick={() => navigate(`/conversations/${conversationId}?source=${conversationSource}`)}
                  data-testid="conversation-link-0"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 space-y-2">
                      {/* Tags above title */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {categories.length > 0 && (
                          <>
                            {categories.slice(0, 3).map((category: string, idx: number) => (
                              <span
                                key={idx}
                                className={`px-2 py-0.5 text-xs rounded ${
                                  categoryColors[category.toLowerCase()] ||
                                  'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300'
                                }`}
                              >
                                {category}
                              </span>
                            ))}
                            {categories.length > 3 && (
                              <span className="px-2 py-0.5 text-xs bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 rounded">
                                +{categories.length - 3}
                              </span>
                            )}
                          </>
                        )}
                        <span className={`px-2 py-1 text-xs rounded ml-auto flex-shrink-0 ${
                          conversationSource === 'chronicle'
                            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                            : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                        }`}>
                          {conversationSource === 'chronicle' ? 'Chronicle' : 'Mycelia'}
                        </span>
                      </div>

                      {/* Title */}
                      <p className="font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                        {conversation.title || 'Untitled Conversation'}
                        <ExternalLink className="h-4 w-4 text-neutral-400" />
                      </p>

                      {/* Summary */}
                      {conversation.summary && (
                        <p className="text-sm text-neutral-600 dark:text-neutral-400 line-clamp-2">
                          {conversation.summary}
                        </p>
                      )}

                      {/* Date */}
                      <p className="text-xs text-neutral-500 dark:text-neutral-500">
                        {formatDate(conversation.created_at || memory.created_at)}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg">
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    Conversation details not available
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar (1/3) */}
        <div className="w-1/3 space-y-4">
          {/* Access Log */}
          <div className="card overflow-hidden" data-testid="access-log">
            <div className="p-4 bg-neutral-100 dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700">
              <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">Access Log</h3>
            </div>
            <div className="p-4 max-h-[450px] overflow-auto">
              {logsLoading ? (
                <p className="text-center text-neutral-500 dark:text-neutral-400 py-8">
                  Loading access logs...
                </p>
              ) : accessLogs && accessLogs.length > 0 ? (
                <div className="space-y-6">
                  {accessLogs.map((entry: AccessLogEntry, index: number) => (
                    <div key={entry.id} className="relative flex items-start gap-3">
                      <div className="relative z-10 rounded-full bg-purple-100 dark:bg-purple-900/30 w-8 h-8 flex items-center justify-center flex-shrink-0">
                        <Brain className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                      </div>
                      {index < accessLogs.length - 1 && (
                        <div className="absolute left-4 top-8 bottom-0 w-[1px] h-[calc(100%+1rem)] bg-neutral-300 dark:bg-neutral-700" />
                      )}
                      <div className="flex flex-col flex-1">
                        <span className="font-medium text-neutral-900 dark:text-neutral-100">
                          {entry.app_name}
                        </span>
                        <span className="text-sm text-neutral-500 dark:text-neutral-400">
                          {formatAccessDate(entry.accessed_at)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-neutral-500 dark:text-neutral-400 py-8">
                  No access logs available
                </p>
              )}
            </div>
          </div>

          {/* Related Memories */}
          <div className="card overflow-hidden" data-testid="related-memories">
            <div className="p-4 bg-neutral-100 dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700">
              <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">Related Memories</h3>
            </div>
            <div className="p-4 max-h-[450px] overflow-auto">
              {relatedLoading ? (
                <p className="text-center text-neutral-500 dark:text-neutral-400 py-8">
                  Loading related memories...
                </p>
              ) : relatedMemories && relatedMemories.length > 0 ? (
                <div className="space-y-4">
                  {relatedMemories.map((relMem: RelatedMemory) => (
                    <div
                      key={relMem.id}
                      className="border-l-2 border-neutral-300 dark:border-neutral-700 pl-4 py-2 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors cursor-pointer"
                      onClick={() => navigate(`/memories/${relMem.id}`)}
                      data-testid={`related-memory-${relMem.id}`}
                    >
                      <p className="text-sm text-neutral-900 dark:text-neutral-100 mb-2 line-clamp-2">
                        {relMem.memory}
                      </p>
                      <div className="flex items-center gap-2 flex-wrap">
                        {relMem.categories.slice(0, 2).map((cat, idx) => (
                          <span
                            key={idx}
                            className={`px-2 py-0.5 text-xs rounded-full ${
                              categoryColors[cat.toLowerCase()] ||
                              'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300'
                            }`}
                          >
                            {cat}
                          </span>
                        ))}
                        {relMem.state !== 'active' && (
                          <span className="px-2 py-0.5 text-xs rounded-full border border-yellow-600 text-yellow-600 bg-yellow-400/10">
                            {relMem.state}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-neutral-500 dark:text-neutral-400 py-8">
                  No related memories found
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteDialog}
        onCancel={() => setShowDeleteDialog(false)}
        onConfirm={handleDelete}
        title="Delete Memory?"
        message="Are you sure you want to delete this memory? This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  )
}
