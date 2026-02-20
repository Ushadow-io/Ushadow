/**
 * YouTubePostCard — renders a YouTube video card with thumbnail, stats, and actions.
 *
 * Horizontal layout: thumbnail left, metadata right.
 * Reuses bookmark/seen actions from PostCard pattern.
 */

import { Bookmark, Eye, ExternalLink, Clock, ThumbsUp, Play } from 'lucide-react'
import type { FeedPost } from '../../services/feedApi'

interface YouTubePostCardProps {
  post: FeedPost
  onBookmark: (postId: string) => void
  onMarkSeen: (postId: string) => void
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

function formatCount(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

/** Extract title from content (format: <b>title</b><br/>description). */
function extractTitle(content: string): string {
  const match = content.match(/<b>(.*?)<\/b>/)
  return match ? match[1] : content.replace(/<[^>]+>/g, '').slice(0, 100)
}

/** Extract description from content (after <br/>). */
function extractDescription(content: string): string {
  const idx = content.indexOf('<br/>')
  if (idx === -1) return ''
  return content
    .slice(idx + 5)
    .replace(/<[^>]+>/g, '')
    .trim()
}

export default function YouTubePostCard({ post, onBookmark, onMarkSeen }: YouTubePostCardProps) {
  const title = extractTitle(post.content)
  const description = extractDescription(post.content)

  return (
    <article
      className={`rounded-lg border transition-colors ${
        post.seen
          ? 'border-neutral-200 dark:border-neutral-700 opacity-75'
          : 'border-neutral-200 dark:border-neutral-700'
      }`}
      data-testid={`youtube-card-${post.post_id}`}
    >
      <div className="flex gap-4 p-4">
        {/* Thumbnail */}
        <a
          href={post.url}
          target="_blank"
          rel="noopener noreferrer"
          className="relative flex-shrink-0 w-48 aspect-video rounded-md overflow-hidden bg-neutral-200 dark:bg-neutral-700 group"
          data-testid={`youtube-card-${post.post_id}-thumbnail`}
        >
          {post.thumbnail_url ? (
            <img
              src={post.thumbnail_url}
              alt={title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Play className="h-8 w-8 text-neutral-400" />
            </div>
          )}
          {/* Duration overlay */}
          {post.duration && (
            <span className="absolute bottom-1 right-1 px-1.5 py-0.5 text-xs font-medium bg-black/80 text-white rounded">
              {post.duration}
            </span>
          )}
          {/* Hover play icon */}
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors">
            <Play className="h-10 w-10 text-white opacity-0 group-hover:opacity-80 transition-opacity fill-current" />
          </div>
        </a>

        {/* Metadata */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Title */}
          <a
            href={post.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 line-clamp-2 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
            data-testid={`youtube-card-${post.post_id}-title`}
          >
            {title}
          </a>

          {/* Channel + time */}
          <div className="flex items-center gap-2 mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            {post.channel_title && (
              <span className="font-medium" data-testid={`youtube-card-${post.post_id}-channel`}>
                {post.channel_title}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {timeAgo(post.published_at)}
            </span>
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-3 mt-1.5 text-xs text-neutral-400 dark:text-neutral-500">
            {post.view_count != null && (
              <span className="flex items-center gap-1" data-testid={`youtube-card-${post.post_id}-views`}>
                <Eye className="h-3 w-3" />
                {formatCount(post.view_count)} views
              </span>
            )}
            {post.like_count != null && (
              <span className="flex items-center gap-1" data-testid={`youtube-card-${post.post_id}-likes`}>
                <ThumbsUp className="h-3 w-3" />
                {formatCount(post.like_count)}
              </span>
            )}
          </div>

          {/* Description snippet */}
          {description && (
            <p className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400 line-clamp-2">
              {description}
            </p>
          )}

          {/* Matched interests */}
          {post.matched_interests.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2" data-testid={`youtube-card-${post.post_id}-interests`}>
              {post.matched_interests.map((name) => (
                <span
                  key={name}
                  className="px-2 py-0.5 text-xs rounded-full bg-accent-100 dark:bg-accent-900/30 text-accent-700 dark:text-accent-300"
                >
                  {name}
                </span>
              ))}
            </div>
          )}

          {/* Relevance + actions */}
          <div className="flex items-center justify-between mt-auto pt-2">
            <div className="flex items-center gap-2">
              {/* Relevance score pill */}
              {post.relevance_score > 0 && (
                <span
                  className="px-2 py-0.5 text-xs font-medium rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300"
                  title={`Relevance: ${post.relevance_score.toFixed(2)}`}
                  data-testid={`youtube-card-${post.post_id}-score`}
                >
                  {post.relevance_score.toFixed(1)}
                </span>
              )}

              {/* Bookmark */}
              <button
                onClick={() => onBookmark(post.post_id)}
                className={`p-1.5 rounded-md transition-colors ${
                  post.bookmarked
                    ? 'text-amber-500 bg-amber-50 dark:bg-amber-900/20'
                    : 'text-neutral-400 hover:text-amber-500 hover:bg-neutral-100 dark:hover:bg-neutral-700'
                }`}
                title={post.bookmarked ? 'Remove bookmark' : 'Bookmark'}
                data-testid={`youtube-card-${post.post_id}-bookmark`}
              >
                <Bookmark className={`h-4 w-4 ${post.bookmarked ? 'fill-current' : ''}`} />
              </button>

              {/* Mark seen */}
              {!post.seen && (
                <button
                  onClick={() => onMarkSeen(post.post_id)}
                  className="p-1.5 rounded-md text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
                  title="Mark as seen"
                  data-testid={`youtube-card-${post.post_id}-seen`}
                >
                  <Eye className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Link to YouTube */}
            <a
              href={post.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-neutral-400 hover:text-red-500 transition-colors"
              data-testid={`youtube-card-${post.post_id}-link`}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>Watch</span>
            </a>
          </div>
        </div>
      </div>
    </article>
  )
}
