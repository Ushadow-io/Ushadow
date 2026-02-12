/**
 * FeedEmptyState — shown when no sources are configured or no posts are available.
 */

import { Radio, Plus, Loader2 } from 'lucide-react'

interface FeedEmptyStateProps {
  hasSources: boolean
  onAddSource: () => void
  onRefresh: () => void
  isRefreshing: boolean
}

export default function FeedEmptyState({
  hasSources,
  onAddSource,
  onRefresh,
  isRefreshing,
}: FeedEmptyStateProps) {
  if (!hasSources) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center" data-testid="feed-empty-no-sources">
        <Radio className="h-12 w-12 text-neutral-300 dark:text-neutral-600 mb-4" />
        <h3 className="text-lg font-semibold text-neutral-700 dark:text-neutral-200 mb-2">
          No sources configured
        </h3>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-6 max-w-md">
          Add a Mastodon-compatible server to start curating your personalized feed
          based on your knowledge graph interests.
        </p>
        <button
          onClick={onAddSource}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          data-testid="feed-empty-add-source"
        >
          <Plus className="h-4 w-4" />
          Add Source
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center" data-testid="feed-empty-no-posts">
      <Radio className="h-12 w-12 text-neutral-300 dark:text-neutral-600 mb-4" />
      <h3 className="text-lg font-semibold text-neutral-700 dark:text-neutral-200 mb-2">
        No posts yet
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
