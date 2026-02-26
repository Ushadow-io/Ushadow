/**
 * PostCard — renders a single fediverse post with actions and relevance info.
 */

import { Bookmark, Eye, ExternalLink, Clock, MessageCircle } from 'lucide-react'
import type { FeedPost } from '../../services/feedApi'

interface PostCardProps {
  post: FeedPost
  onBookmark: (postId: string) => void
  onMarkSeen: (postId: string) => void
  /** Called when reply button is clicked (only provided for authenticated Bluesky sources) */
  onReply?: (postId: string, handle: string) => void
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

/** Strip HTML tags for a plain-text excerpt using regex (no DOM / no innerHTML). */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export default function PostCard({ post, onBookmark, onMarkSeen, onReply }: PostCardProps) {
  const plainText = stripHtml(post.content)

  return (
    <article
      className={`p-4 rounded-lg border transition-colors ${
        post.seen
          ? 'border-neutral-200 dark:border-neutral-700 opacity-75'
          : 'border-neutral-200 dark:border-neutral-700'
      }`}
      data-testid={`post-card-${post.post_id}`}
    >
      {/* Header: author info */}
      <div className="flex items-start gap-3 mb-2">
        {post.author_avatar ? (
          <img
            src={post.author_avatar}
            alt={post.author_display_name}
            className="w-10 h-10 rounded-full flex-shrink-0"
            data-testid={`post-card-${post.post_id}-avatar`}
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-neutral-200 dark:bg-neutral-600 flex-shrink-0 flex items-center justify-center text-sm font-medium text-neutral-500 dark:text-neutral-400">
            {(post.author_display_name || post.author_handle).charAt(0).toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 truncate">
              {post.author_display_name || post.author_handle}
            </span>
            <span className="text-xs text-neutral-400 dark:text-neutral-500 truncate">
              {post.author_handle}
            </span>
          </div>
          <div className="flex items-center gap-1 text-xs text-neutral-400 dark:text-neutral-500">
            <Clock className="h-3 w-3" />
            <span>{timeAgo(post.published_at)}</span>
          </div>
        </div>
        {/* Relevance score pill */}
        {post.relevance_score > 0 && (
          <span
            className="flex-shrink-0 px-2 py-0.5 text-xs font-medium rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300"
            title={`Relevance: ${post.relevance_score.toFixed(2)}`}
            data-testid={`post-card-${post.post_id}-score`}
          >
            {post.relevance_score.toFixed(1)}
          </span>
        )}
      </div>

      {/* Content */}
      <p className="text-sm text-neutral-700 dark:text-neutral-300 mb-3 line-clamp-4 whitespace-pre-line">
        {plainText}
      </p>

      {/* Matched interests */}
      {post.matched_interests.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3" data-testid={`post-card-${post.post_id}-interests`}>
          <span className="text-xs text-neutral-400 dark:text-neutral-500">Matched:</span>
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

      {/* Hashtags */}
      {post.hashtags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {post.hashtags.slice(0, 5).map((tag) => (
            <span
              key={tag}
              className="text-xs text-primary-500 dark:text-primary-400"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-2 border-t border-neutral-100 dark:border-neutral-700">
        <div className="flex items-center gap-3">
          {/* Bookmark */}
          <button
            onClick={() => onBookmark(post.post_id)}
            className={`p-1.5 rounded-md transition-colors ${
              post.bookmarked
                ? 'text-amber-500 bg-amber-50 dark:bg-amber-900/20'
                : 'text-neutral-400 hover:text-amber-500 hover:bg-neutral-100 dark:hover:bg-neutral-700'
            }`}
            title={post.bookmarked ? 'Remove bookmark' : 'Bookmark'}
            data-testid={`post-card-${post.post_id}-bookmark`}
          >
            <Bookmark className={`h-4 w-4 ${post.bookmarked ? 'fill-current' : ''}`} />
          </button>

          {/* Mark seen */}
          {!post.seen && (
            <button
              onClick={() => onMarkSeen(post.post_id)}
              className="p-1.5 rounded-md text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
              title="Mark as seen"
              data-testid={`post-card-${post.post_id}-seen`}
            >
              <Eye className="h-4 w-4" />
            </button>
          )}

          {/* Reply — only shown when authenticated Bluesky source is available */}
          {onReply && (post.platform_type === 'bluesky' || post.platform_type === 'bluesky_timeline') && (
            <button
              onClick={() => onReply(post.post_id, post.author_handle)}
              className="p-1.5 rounded-md text-neutral-400 hover:text-sky-500 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
              title="Reply on Bluesky"
              data-testid={`post-card-${post.post_id}-reply`}
            >
              <MessageCircle className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Link to original */}
        <a
          href={post.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-neutral-400 hover:text-primary-500 transition-colors"
          data-testid={`post-card-${post.post_id}-link`}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          <span>Original</span>
        </a>
      </div>
    </article>
  )
}
