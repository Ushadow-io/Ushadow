/**
 * FeedEmptyState — shown when no sources are configured or no posts are available.
 * Platform-aware: messaging adapts to whether the user is on Social or Videos tab.
 */

import { Radio, Plus, Loader2, MessageSquare, Play } from 'lucide-react'

const PLATFORM_LABELS: Record<string, { name: string; guidance: string }> = {
  mastodon: {
    name: 'Mastodon',
    guidance: 'Add a Mastodon-compatible server to start curating your personalized feed based on your knowledge graph interests.',
  },
  youtube: {
    name: 'YouTube',
    guidance: 'Add a YouTube API key to discover videos ranked by your knowledge graph interests.',
  },
}

interface FeedEmptyStateProps {
  hasSources: boolean
  platformType?: string
  onAddSource: () => void
  onRefresh: () => void
  isRefreshing: boolean
}

export default function FeedEmptyState({
  hasSources,
  platformType,
  onAddSource,
  onRefresh,
  isRefreshing,
}: FeedEmptyStateProps) {
  const label = platformType ? PLATFORM_LABELS[platformType] : undefined
  const Icon = platformType === 'youtube' ? Play : MessageSquare

  if (!hasSources) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center" data-testid="feed-empty-no-sources">
        <Icon className="h-12 w-12 text-neutral-300 dark:text-neutral-600 mb-4" />
        <h3 className="text-lg font-semibold text-neutral-700 dark:text-neutral-200 mb-2">
          No {label?.name ?? ''} sources configured
        </h3>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-6 max-w-md">
          {label?.guidance ?? 'Add a content source to get started.'}
        </p>
        <button
          onClick={onAddSource}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          data-testid="feed-empty-add-source"
        >
          <Plus className="h-4 w-4" />
          Add {label?.name ?? ''} Source
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center" data-testid="feed-empty-no-posts">
      <Icon className="h-12 w-12 text-neutral-300 dark:text-neutral-600 mb-4" />
      <h3 className="text-lg font-semibold text-neutral-700 dark:text-neutral-200 mb-2">
        No {label?.name ? `${label.name} ` : ''}posts yet
      </h3>
      <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-6 max-w-md">
        Hit refresh to fetch posts from your sources and score them against your interests.
      </p>
      <button
        onClick={onRefresh}
        disabled={isRefreshing}
        className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
        data-testid="feed-empty-refresh"
      >
        {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radio className="h-4 w-4" />}
        {isRefreshing ? 'Refreshing...' : 'Refresh Feed'}
      </button>
    </div>
  )
}
