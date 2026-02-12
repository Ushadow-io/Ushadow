/**
 * FeedPage
 *
 * Personalized fediverse feed ranked by your OpenMemory knowledge graph interests.
 * Features: interest filter chips, ranked post cards, source management, refresh.
 */

import { useState } from 'react'
import {
  Radio,
  RefreshCw,
  Plus,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  Trash2,
  Eye,
  EyeOff,
} from 'lucide-react'
import PostCard from '../components/feed/PostCard'
import InterestChip from '../components/feed/InterestChip'
import AddSourceModal from '../components/feed/AddSourceModal'
import FeedEmptyState from '../components/feed/FeedEmptyState'
import {
  useFeedPosts,
  useFeedInterests,
  useFeedSources,
  useRefreshFeed,
  useFeedStats,
} from '../hooks/useFeed'

export default function FeedPage() {
  const [page, setPage] = useState(1)
  const [selectedInterest, setSelectedInterest] = useState<string | undefined>()
  const [showSeen, setShowSeen] = useState(true)
  const [showAddSource, setShowAddSource] = useState(false)

  const { posts, total, totalPages, isLoading, isFetching, error, markSeen, toggleBookmark } =
    useFeedPosts(page, 20, selectedInterest, showSeen)
  const { interests } = useFeedInterests()
  const { sources, addSource, isAdding, removeSource, isRemoving } = useFeedSources()
  const { refresh, isRefreshing, lastResult } = useRefreshFeed()
  const { stats } = useFeedStats()

  const handleRefresh = async () => {
    try {
      await refresh()
      setPage(1)
    } catch {
      // error is available via useRefreshFeed().error
    }
  }

  const handleInterestClick = (name: string) => {
    setSelectedInterest((prev) => (prev === name ? undefined : name))
    setPage(1)
  }

  return (
    <div data-testid="feed-page">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Radio className="h-6 w-6 text-primary-500" />
          <div>
            <h1 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">Feed</h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Posts ranked by your knowledge graph interests
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Stats pills */}
          {stats && (
            <div className="hidden sm:flex items-center gap-2 mr-2 text-xs text-neutral-500 dark:text-neutral-400">
              <span>{stats.total_posts} posts</span>
              <span className="text-neutral-300 dark:text-neutral-600">|</span>
              <span>{stats.unseen_posts} unseen</span>
              <span className="text-neutral-300 dark:text-neutral-600">|</span>
              <span>{stats.sources_count} sources</span>
            </div>
          )}

          {/* Toggle seen */}
          <button
            onClick={() => { setShowSeen(!showSeen); setPage(1) }}
            className={`p-2 rounded-lg transition-colors ${
              showSeen
                ? 'text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700'
                : 'text-primary-500 bg-primary-50 dark:bg-primary-900/20'
            }`}
            title={showSeen ? 'Hide seen posts' : 'Show all posts'}
            data-testid="feed-toggle-seen"
          >
            {showSeen ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </button>

          {/* Add source */}
          <button
            onClick={() => setShowAddSource(true)}
            className="p-2 rounded-lg text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
            title="Add source"
            data-testid="feed-add-source"
          >
            <Plus className="h-4 w-4" />
          </button>

          {/* Refresh */}
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="inline-flex items-center gap-2 px-3 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
            data-testid="feed-refresh"
          >
            {isRefreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Refresh
          </button>
        </div>
      </div>

      {/* Refresh result banner */}
      {lastResult && (
        <div
          className="mb-4 p-3 rounded-lg bg-primary-50 dark:bg-primary-900/20 text-sm text-primary-700 dark:text-primary-300"
          data-testid="feed-refresh-result"
        >
          Fetched {lastResult.posts_fetched} posts, {lastResult.posts_new} new &middot;{' '}
          {lastResult.interests_count} interests used
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-sm text-red-600 dark:text-red-400 flex items-center gap-2" data-testid="feed-error">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {(error as Error).message || 'Failed to load feed'}
        </div>
      )}

      {/* Interest chips */}
      {interests.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4" data-testid="feed-interests">
          <button
            onClick={() => { setSelectedInterest(undefined); setPage(1) }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              !selectedInterest
                ? 'bg-primary-600 text-white'
                : 'bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-600'
            }`}
            data-testid="interest-chip-all"
          >
            All
          </button>
          {interests.map((interest) => (
            <InterestChip
              key={interest.name}
              interest={interest}
              active={selectedInterest === interest.name}
              onClick={() => handleInterestClick(interest.name)}
            />
          ))}
        </div>
      )}

      {/* Sources list (collapsible) */}
      {sources.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2 items-center" data-testid="feed-sources-list">
          <span className="text-xs text-neutral-400 dark:text-neutral-500">Sources:</span>
          {sources.map((s) => (
            <span
              key={s.source_id}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300"
            >
              {s.name}
              <button
                onClick={() => removeSource(s.source_id)}
                disabled={isRemoving}
                className="ml-0.5 p-0.5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-600 text-neutral-400 hover:text-red-500 transition-colors"
                title="Remove source"
                data-testid={`feed-remove-source-${s.source_id}`}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-16" data-testid="feed-loading">
          <Loader2 className="h-8 w-8 text-primary-500 animate-spin" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && posts.length === 0 && (
        <FeedEmptyState
          hasSources={sources.length > 0}
          onAddSource={() => setShowAddSource(true)}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
        />
      )}

      {/* Post list */}
      {!isLoading && posts.length > 0 && (
        <div className="space-y-3" data-testid="feed-post-list">
          {posts.map((post) => (
            <PostCard
              key={post.post_id}
              post={post}
              onBookmark={toggleBookmark}
              onMarkSeen={markSeen}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-neutral-200 dark:border-neutral-700" data-testid="feed-pagination">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-neutral-300 dark:border-neutral-600 disabled:opacity-40 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors"
            data-testid="feed-page-prev"
          >
            <ChevronLeft className="h-4 w-4" />
            Prev
          </button>
          <span className="text-sm text-neutral-500 dark:text-neutral-400">
            Page {page} of {totalPages} &middot; {total} posts
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-neutral-300 dark:border-neutral-600 disabled:opacity-40 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors"
            data-testid="feed-page-next"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Fetching indicator (background refetch) */}
      {isFetching && !isLoading && (
        <div className="fixed bottom-20 right-6 px-3 py-1.5 bg-neutral-800 text-white text-xs rounded-full shadow-lg flex items-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin" />
          Updating...
        </div>
      )}

      {/* Add source modal */}
      <AddSourceModal
        isOpen={showAddSource}
        onClose={() => setShowAddSource(false)}
        onAdd={addSource}
        isAdding={isAdding}
      />
    </div>
  )
}
