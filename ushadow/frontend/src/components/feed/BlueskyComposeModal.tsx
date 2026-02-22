/**
 * BlueskyComposeModal — compose and post to Bluesky, or reply to a post.
 *
 * Opened from the "Post" button (new post) or the reply button on any
 * Bluesky post card. Calls /api/feed/bluesky/post or
 * /api/feed/bluesky/reply/{post_id} depending on mode.
 */

import { useState } from 'react'
import { Cloud, Loader2 } from 'lucide-react'
import Modal from '../Modal'
import { feedApi } from '../../services/feedApi'

const CHAR_LIMIT = 300

interface BlueskyComposeModalProps {
  isOpen: boolean
  onClose: () => void
  sourceId: string
  /** When set, the modal is in reply mode — replying to this post. */
  replyTo?: { postId: string; handle: string }
}

export default function BlueskyComposeModal({
  isOpen,
  onClose,
  sourceId,
  replyTo,
}: BlueskyComposeModalProps) {
  const [text, setText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isReply = !!replyTo
  const charsRemaining = CHAR_LIMIT - text.length

  const handleClose = () => {
    setText('')
    setError(null)
    onClose()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim() || charsRemaining < 0) return

    setIsSubmitting(true)
    setError(null)
    try {
      if (isReply && replyTo) {
        await feedApi.bskyReply(replyTo.postId, { source_id: sourceId, text: text.trim() })
      } else {
        await feedApi.bskyPost({ source_id: sourceId, text: text.trim() })
      }
      handleClose()
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to post — check your app password and try again')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={isReply ? `Reply to ${replyTo?.handle}` : 'New Bluesky Post'}
      titleIcon={<Cloud className="h-5 w-5 text-sky-500" />}
      maxWidth="md"
      testId="bluesky-compose-modal"
    >
      <form onSubmit={handleSubmit} className="space-y-3">

        {/* ----------------------------------------------------------------
          TODO: Implement the compose text area below.

          The submit handler and char limit (CHAR_LIMIT = 300) are wired up.
          What we need here is the text input area and character counter.

          Things to consider:
          - When should the counter turn red? At 0? At -N (over limit)?
          - Should the textarea auto-resize as the user types, or be fixed height?
          - Should we show a reply context preview above the textarea
            when isReply=true (showing who they're replying to)?

          `text` and `setText` are already declared above.
          `charsRemaining` = 300 - text.length (negative means over limit).

          Expected testid patterns (per CLAUDE.md convention):
            data-testid="bluesky-compose-textarea"
            data-testid="bluesky-compose-char-count"
        ---------------------------------------------------------------- */}

        {error && (
          <p className="text-sm text-red-500 dark:text-red-400" data-testid="bluesky-compose-error">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-sm rounded-lg text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
            data-testid="bluesky-compose-cancel"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!text.trim() || charsRemaining < 0 || isSubmitting}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition-colors disabled:opacity-50"
            data-testid="bluesky-compose-submit"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {isReply ? 'Reply' : 'Post'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
