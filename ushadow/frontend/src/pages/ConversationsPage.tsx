import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageSquare, RefreshCw, AlertCircle } from 'lucide-react'
import { useMultiSourceConversations, type ConversationSource } from '../hooks/useConversations'
import ConversationCard from '../components/conversations/ConversationCard'

// Available conversation sources
const SOURCES: Array<{ id: ConversationSource; label: string; color: string }> = [
  { id: 'chronicle', label: 'Chronicle', color: 'blue' },
  { id: 'mycelia', label: 'Mycelia', color: 'purple' },
]

export default function ConversationsPage() {
  const navigate = useNavigate()
  const [selectedSources, setSelectedSources] = useState<ConversationSource[]>(['chronicle', 'mycelia'])

  const { chronicle, mycelia, anyLoading, allLoaded } = useMultiSourceConversations(selectedSources)

  // Toggle source selection
  const toggleSource = (sourceId: ConversationSource) => {
    setSelectedSources((prev) =>
      prev.includes(sourceId) ? prev.filter((s) => s !== sourceId) : [...prev, sourceId]
    )
  }

  // Refresh all enabled sources
  const handleRefresh = () => {
    if (selectedSources.includes('chronicle')) chronicle.refetch()
    if (selectedSources.includes('mycelia')) mycelia.refetch()
  }

  return (
    <div className="space-y-6" data-testid="conversations-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center space-x-2">
            <MessageSquare className="h-8 w-8 text-primary-600 dark:text-primary-400" />
            <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">Conversations</h1>
          </div>
          <p className="mt-2 text-neutral-600 dark:text-neutral-400">
            View conversations from multiple sources
          </p>
        </div>

        <button
          onClick={handleRefresh}
          disabled={anyLoading}
          className="btn btn-secondary flex items-center space-x-2"
          data-testid="conversations-refresh-button"
        >
          <RefreshCw className={`h-4 w-4 ${anyLoading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Source selector */}
      <div className="card p-4">
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
          Conversation Sources
        </label>
        <div className="flex flex-wrap gap-2" data-testid="conversation-source-selector">
          {SOURCES.map((source) => {
            const isSelected = selectedSources.includes(source.id)
            const baseColor = source.color === 'blue' ? 'blue' : 'purple'

            return (
              <button
                key={source.id}
                onClick={() => toggleSource(source.id)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  isSelected
                    ? baseColor === 'blue'
                      ? 'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600'
                      : 'bg-purple-600 text-white hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-600'
                    : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-600'
                }`}
                data-testid={`source-toggle-${source.id}`}
              >
                {source.label}
              </button>
            )
          })}
        </div>

        {selectedSources.length === 0 && (
          <p className="mt-2 text-sm text-amber-600 dark:text-amber-400 flex items-center space-x-1">
            <AlertCircle className="h-4 w-4" />
            <span>Select at least one source to view conversations</span>
          </p>
        )}
      </div>

      {/* Conversations columns */}
      {selectedSources.length > 0 && (
        <div
          className={`grid gap-6 ${
            selectedSources.length === 1 ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2'
          }`}
          data-testid="conversations-columns"
        >
          {/* Chronicle column */}
          {selectedSources.includes('chronicle') && (
            <div className="space-y-4" data-testid="chronicle-conversation-column">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 flex items-center space-x-2">
                  <span>Chronicle</span>
                  {chronicle.isLoading && (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                  )}
                </h2>
                <span className="text-sm text-neutral-500 dark:text-neutral-400">
                  {chronicle.data.length} conversations
                </span>
              </div>

              {chronicle.error && (
                <div className="card p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                  <p className="text-sm text-red-700 dark:text-red-400">
                    Failed to load Chronicle conversations. Service may be unavailable.
                  </p>
                </div>
              )}

              {!chronicle.isLoading && !chronicle.error && chronicle.data.length === 0 && (
                <div className="card p-6 text-center text-neutral-500 dark:text-neutral-400">
                  <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-20" />
                  <p>No conversations found</p>
                </div>
              )}

              <div className="space-y-3">
                {chronicle.data.map((conv) => (
                  <ConversationCard
                    key={conv.conversation_id || conv.audio_uuid}
                    conversation={conv}
                    source="chronicle"
                    onClick={() => navigate(`/conversations/${conv.conversation_id || conv.audio_uuid}?source=chronicle`)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Mycelia column */}
          {selectedSources.includes('mycelia') && (
            <div className="space-y-4" data-testid="mycelia-conversation-column">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 flex items-center space-x-2">
                  <span>Mycelia</span>
                  {mycelia.isLoading && (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-600"></div>
                  )}
                </h2>
                <span className="text-sm text-neutral-500 dark:text-neutral-400">
                  {mycelia.data.length} conversations
                </span>
              </div>

              {mycelia.error && (
                <div className="card p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                  <p className="text-sm text-red-700 dark:text-red-400">
                    Failed to load Mycelia conversations. Service may be unavailable.
                  </p>
                </div>
              )}

              {!mycelia.isLoading && !mycelia.error && mycelia.data.length === 0 && (
                <div className="card p-6 text-center text-neutral-500 dark:text-neutral-400">
                  <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-20" />
                  <p>No conversations found</p>
                </div>
              )}

              <div className="space-y-3">
                {mycelia.data.map((conv) => (
                  <ConversationCard
                    key={conv.conversation_id || conv.audio_uuid}
                    conversation={conv}
                    source="mycelia"
                    onClick={() => navigate(`/conversations/${conv.conversation_id || conv.audio_uuid}?source=mycelia`)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
