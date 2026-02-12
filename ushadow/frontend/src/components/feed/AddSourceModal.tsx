/**
 * AddSourceModal — form to add a Mastodon-compatible server as a post source.
 */

import { useState } from 'react'
import { Radio, Loader2 } from 'lucide-react'
import Modal from '../Modal'

interface AddSourceModalProps {
  isOpen: boolean
  onClose: () => void
  onAdd: (data: { name: string; instance_url: string }) => Promise<void>
  isAdding: boolean
}

export default function AddSourceModal({ isOpen, onClose, onAdd, isAdding }: AddSourceModalProps) {
  const [name, setName] = useState('')
  const [instanceUrl, setInstanceUrl] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    let url = instanceUrl.trim()
    if (!url.startsWith('http')) {
      url = `https://${url}`
    }
    // Strip trailing slashes
    url = url.replace(/\/+$/, '')

    try {
      await onAdd({ name: name.trim() || url.replace(/^https?:\/\//, ''), instance_url: url })
      setName('')
      setInstanceUrl('')
      onClose()
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to add source')
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add Post Source"
      titleIcon={<Radio className="h-5 w-5 text-primary-500" />}
      maxWidth="sm"
      testId="add-source-modal"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="source-url" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
            Instance URL
          </label>
          <input
            id="source-url"
            type="text"
            placeholder="mastodon.social"
            value={instanceUrl}
            onChange={(e) => setInstanceUrl(e.target.value)}
            required
            className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
            data-testid="add-source-url-input"
          />
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Any Mastodon-compatible server (e.g., mastodon.social, fosstodon.org)
          </p>
        </div>

        <div>
          <label htmlFor="source-name" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
            Display Name (optional)
          </label>
          <input
            id="source-name"
            type="text"
            placeholder="Auto-detected from URL"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
            data-testid="add-source-name-input"
          />
        </div>

        {error && (
          <p className="text-sm text-red-500" data-testid="add-source-error">{error}</p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
            data-testid="add-source-cancel"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!instanceUrl.trim() || isAdding}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
            data-testid="add-source-submit"
          >
            {isAdding && <Loader2 className="h-4 w-4 animate-spin" />}
            Add Source
          </button>
        </div>
      </form>
    </Modal>
  )
}
