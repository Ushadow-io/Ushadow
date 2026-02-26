/**
 * FeedPage
 *
 * Multi-platform feed ranked by your OpenMemory knowledge graph interests.
 * Features: Social/Videos tabs, interest filter chips, ranked post cards,
 * source management, refresh.
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
  MessageSquare,
  Play,
  Cloud,
  PenLine,
} from 'lucide-react'
import BlueskyComposeModal from '../components/feed/BlueskyComposeModal'
import PostCard from '../components/feed/PostCard'
import YouTubePostCard from '../components/feed/YouTubePostCard'
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

type FeedTab = 'social' | 'bluesky' | 'following' | 'videos'

const TAB_TO_PLATFORM: Record<FeedTab, string> = {
  social: 'mastodon',
  bluesky: 'bluesky',
  following: 'bluesky_timeline',
  videos: 'youtube',
}

export default function FeedPage() {
  const [activeTab, setActiveTab] = useState<FeedTab>('social')
  const [page, setPage] = useState(1)
  const [selectedInterest, setSelectedInterest] = useState<string | undefined>()
  const [showSeen, setShowSeen] = useState(true)
  const [showAddSource, setShowAddSource] = useState(false)
  const [showCompose, setShowCompose] = useState(false)
  const [composeReplyTo, setComposeReplyTo] = useState<{ postId: string; handle: string } | undefined>()

  const platformType = TAB_TO_PLATFORM[activeTab]

  const { posts, total, totalPages, isLoading, isFetching, error, markSeen, toggleBookmark } =
    useFeedPosts(page, 20, selectedInterest, showSeen, platformType)
  const { interests } = useFeedInterests()
  const { sources, addSource, isAdding, removeSource, isRemoving } = useFeedSources()
  const { refresh, isRefreshing, lastResult } = useRefreshFeed(platformType)
  const { stats } = useFeedStats()

  // Filter sources for the active tab
  const tabSources = sources.filter((s) => s.platform_type === platformType)
  const hasTabSources = tabSources.length > 0

  // For the Following tab, pick the first bluesky_timeline source for compose
  const timelineSource = sources.find((s) => s.platform_type === 'bluesky_timeline')
  const canCompose = activeTab === 'following' && !!timelineSource

  const handleOpenCompose = () => {
    setComposeReplyTo(undefined)
    setShowCompose(true)
  }

  const handleOpenReply = (postId: string, handle: string) => {
    setComposeReplyTo({ postId, handle })
    setShowCompose(true)
  }

  const handleTabChange = (tab: FeedTab) => {
    setActiveTab(tab)
    setPage(1)
    setSelectedInterest(undefined)
  }

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
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Radio className="h-6 w-6 text-primary-500" />
          <div>
            <h1 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">Feed</h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Content ranked by your knowledge graph interests
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

          {/* Compose — only shown on the Following (bluesky_timeline) tab */}
          {canCompose && (
            <button
              onClick={handleOpenCompose}
              className="inline-flex items-center gap-2 px-3 py-2 bg-sky-500 text-white text-sm rounded-lg hover:bg-sky-600 transition-colors"
              data-testid="feed-compose"
            >
              <PenLine className="h-4 w-4" />
              Post
            </button>
          )}

          {/* Refresh — scoped to active tab's platform */}
          <button
            onClick={handleRefresh}
            disabled={isRefreshing || !hasTabSources}
            title={hasTabSources ? `Refresh ${activeTab}` : `Add a ${platformType} source first`}
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

      {/* Tab bar */}
      <div className="flex gap-1 mb-4 border-b border-neutral-200 dark:border-neutral-700" data-testid="feed-tabs">
        <button
          onClick={() => handleTabChange('social')}
          className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'social'
              ? 'border-primary-600 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300'
          }`}
          data-testid="tab-social"
        >
          <MessageSquare className="h-4 w-4" />
          Social
        </button>
        <button
          onClick={() => handleTabChange('bluesky')}
          className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'bluesky'
              ? 'border-primary-600 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300'
          }`}
          data-testid="tab-bluesky"
        >
          <Cloud className="h-4 w-4" />
          Bluesky
        </button>
        <button
          onClick={() => handleTabChange('following')}
          className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'following'
              ? 'border-sky-500 text-sky-600 dark:text-sky-400'
              : 'border-transparent text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300'
          }`}
          data-testid="tab-following"
        >
          <Cloud className="h-4 w-4" />
          Following
        </button>
        <button
          onClick={() => handleTabChange('videos')}
          className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'videos'
              ? 'border-primary-600 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300'
          }`}
          data-testid="tab-videos"
        >
          <Play className="h-4 w-4" />
          Videos
        </button>
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

      {/* Sources list — scoped to active tab */}
      <div className="mb-4 flex flex-wrap gap-2 items-center" data-testid="feed-sources-list">
        <span className="text-xs text-neutral-400 dark:text-neutral-500">Sources:</span>
        {tabSources.map((s) => (
          <span
            key={s.source_id}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300"
          >
            {s.platform_type === 'youtube' && <Play className="h-3 w-3 text-red-500" />}
            {s.platform_type === 'bluesky' && <Cloud className="h-3 w-3 text-sky-500" />}
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
        <button
          onClick={() => setShowAddSource(true)}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs border border-dashed border-neutral-300 dark:border-neutral-600 text-neutral-400 hover:text-primary-500 hover:border-primary-400 transition-colors"
          data-testid="feed-add-source-inline"
        >
          <Plus className="h-3 w-3" />
          Add {platformType === 'youtube' ? 'YouTube' : platformType === 'bluesky' ? 'Bluesky' : 'Mastodon'} source
        </button>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-16" data-testid="feed-loading">
          <Loader2 className="h-8 w-8 text-primary-500 animate-spin" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && posts.length === 0 && (
        <FeedEmptyState
          hasSources={hasTabSources}
          platformType={platformType}
          onAddSource={() => setShowAddSource(true)}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
        />
      )}

      {/* Post list — conditional card type */}
      {!isLoading && posts.length > 0 && (
        <div className="space-y-3" data-testid="feed-post-list">
          {posts.map((post) =>
            post.platform_type === 'youtube' ? (
              <YouTubePostCard
                key={post.post_id}
                post={post}
                onBookmark={toggleBookmark}
                onMarkSeen={markSeen}
              />
            ) : (
              <PostCard
                key={post.post_id}
                post={post}
                onBookmark={toggleBookmark}
                onMarkSeen={markSeen}
                onReply={canCompose ? handleOpenReply : undefined}
              />
            ),
          )}
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
        defaultPlatform={platformType as 'mastodon' | 'bluesky' | 'bluesky_timeline' | 'youtube'}
      />

      {/* Bluesky compose / reply modal */}
      {timelineSource && (
        <BlueskyComposeModal
          isOpen={showCompose}
          onClose={() => setShowCompose(false)}
          sourceId={timelineSource.source_id}
          replyTo={composeReplyTo}
        />
      )}
    </div>
  )
}
