import { MessageSquare, Calendar, FileText, Brain } from 'lucide-react'
import type { Conversation } from '../../services/chronicleApi'
import type { ConversationSource } from '../../hooks/useConversations'

interface ConversationCardProps {
  conversation: Conversation
  source: ConversationSource
  onClick?: () => void
}

export default function ConversationCard({ conversation, source, onClick }: ConversationCardProps) {
  const {
    conversation_id,
    title,
    summary,
    created_at,
    segment_count,
    memory_count,
    has_memory,
  } = conversation

  // Mycelia stores data differently than Chronicle
  const myceliaConv = conversation as any

  // Extract start time - Mycelia uses timeRanges[0].start for actual conversation time
  // created_at in Mycelia is the processing timestamp, not the conversation time
  const conversationDate = myceliaConv?.timeRanges?.[0]?.start || created_at

  // Format date
  const date = conversationDate ? new Date(conversationDate) : null
  const formattedDate = date
    ? date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
      }) +
      ' ' +
      date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : 'Unknown date'

  // Source badge color
  const sourceBadgeClass =
    source === 'chronicle'
      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
      : 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300'

  return (
    <div
      className="card p-4 hover:shadow-md transition-shadow cursor-pointer"
      onClick={onClick}
      data-testid={`conversation-card-${conversation_id}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center space-x-2 flex-1 min-w-0">
          <MessageSquare className="h-4 w-4 text-neutral-400 flex-shrink-0" />
          <h3
            className="font-medium text-neutral-900 dark:text-neutral-100 truncate"
            title={title || 'Untitled conversation'}
          >
            {title || 'Untitled conversation'}
          </h3>
        </div>
        <span className={`px-2 py-0.5 rounded text-xs font-medium flex-shrink-0 ml-2 ${sourceBadgeClass}`}>
          {source}
        </span>
      </div>

      {/* Summary */}
      {summary && (
        <p className="text-sm text-neutral-600 dark:text-neutral-400 line-clamp-2 mb-3">
          {summary}
        </p>
      )}

      {/* Footer metadata */}
      <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
        <div className="flex items-center space-x-3">
          {/* Date */}
          <div className="flex items-center space-x-1">
            <Calendar className="h-3 w-3" />
            <span>{formattedDate}</span>
          </div>

          {/* Segment count */}
          {segment_count !== undefined && segment_count > 0 && (
            <div className="flex items-center space-x-1">
              <FileText className="h-3 w-3" />
              <span>{segment_count}</span>
            </div>
          )}
        </div>

        {/* Memory indicator */}
        {has_memory && memory_count !== undefined && memory_count > 0 && (
          <div className="flex items-center space-x-1 text-primary-600 dark:text-primary-400">
            <Brain className="h-3 w-3" />
            <span>{memory_count}</span>
          </div>
        )}
      </div>
    </div>
  )
}
