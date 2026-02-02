/**
 * MemoryCard Component
 *
 * Displays a memory item in a card format with category badges, source attribution,
 * and click interaction. Used in conversation detail page and memory list views.
 */

import { Brain, ExternalLink } from 'lucide-react'
import type { ConversationMemory } from '../../services/api'

interface MemoryCardProps {
  memory: ConversationMemory
  onClick?: () => void
  showSource?: boolean
  testId?: string
}

// Category color mapping (matching MemoryTable)
const categoryColors: Record<string, string> = {
  personal: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  work: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  health: 'bg-green-500/20 text-green-300 border-green-500/30',
  finance: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  travel: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  education: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  preferences: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
  relationships: 'bg-red-500/20 text-red-300 border-red-500/30',
}

// Source color mapping
const sourceColors: Record<ConversationMemory['source'], string> = {
  openmemory: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  chronicle: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  mycelia: 'bg-green-500/20 text-green-300 border-green-500/30',
}

function formatDate(dateString: string): string {
  // Handle both Unix timestamp strings and ISO date strings
  const timestamp = dateString.includes('T')
    ? new Date(dateString).getTime()
    : parseInt(dateString) * 1000

  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function MemoryCard({ memory, onClick, showSource = true, testId }: MemoryCardProps) {
  const categories = memory.metadata?.categories || []

  return (
    <div
      className={`
        group
        p-4
        bg-zinc-900/50
        border border-zinc-700
        rounded-lg
        hover:bg-zinc-800/50
        hover:border-zinc-600
        transition-all
        ${onClick ? 'cursor-pointer' : ''}
      `}
      onClick={onClick}
      data-testid={testId || `memory-card-${memory.id}`}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="flex-shrink-0 p-2 bg-purple-500/20 rounded-lg">
          <Brain className="w-4 h-4 text-purple-400" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-2">
          {/* Memory content */}
          <p className="text-sm text-zinc-200 line-clamp-3 group-hover:text-white transition-colors">
            {memory.content}
          </p>

          {/* Metadata row */}
          <div className="flex items-center justify-between gap-3">
            {/* Categories and source */}
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              {/* Categories */}
              {categories.slice(0, 3).map((category: string, idx: number) => (
                <span
                  key={idx}
                  className={`
                    px-2 py-0.5
                    text-xs
                    rounded-full
                    border
                    ${categoryColors[category.toLowerCase()] || 'bg-zinc-700/50 text-zinc-300 border-zinc-600'}
                  `}
                >
                  {category}
                </span>
              ))}

              {categories.length > 3 && (
                <span className="px-2 py-0.5 text-xs bg-zinc-700/50 text-zinc-400 rounded-full border border-zinc-600">
                  +{categories.length - 3}
                </span>
              )}

              {/* Source badge */}
              {showSource && (
                <span
                  className={`
                    px-2 py-0.5
                    text-xs
                    rounded-full
                    border
                    ${sourceColors[memory.source]}
                  `}
                >
                  {memory.source}
                </span>
              )}
            </div>

            {/* Created date and action hint */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-xs text-zinc-500">
                {formatDate(memory.created_at)}
              </span>
              {onClick && (
                <ExternalLink className="w-3 h-3 text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
