/**
 * AddSourceModal — form to add a content source (Mastodon instance or YouTube API key).
 *
 * Platform selector at the top switches between Mastodon fields (instance URL)
 * and YouTube fields (API key via SecretInput).
 */

import { useState, useEffect } from 'react'
import { Radio, Loader2, MessageSquare, Play } from 'lucide-react'
import Modal from '../Modal'
import { SecretInput } from '../settings/SecretInput'
import type { SourceCreateData } from '../../services/feedApi'

type PlatformType = 'mastodon' | 'youtube'

interface AddSourceModalProps {
  isOpen: boolean
  onClose: () => void
  onAdd: (data: SourceCreateData) => Promise<void>
  isAdding: boolean
  defaultPlatform?: PlatformType
}

export default function AddSourceModal({ isOpen, onClose, onAdd, isAdding, defaultPlatform }: AddSourceModalProps) {
  const [platformType, setPlatformType] = useState<PlatformType>(defaultPlatform ?? 'mastodon')
  const [name, setName] = useState('')
  const [instanceUrl, setInstanceUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Sync platform when modal opens with a new default
  useEffect(() => {
    if (isOpen && defaultPlatform) {
      setPlatformType(defaultPlatform)
    }
  }, [isOpen, defaultPlatform])

  const resetForm = () => {
    setName('')
    setInstanceUrl('')
    setApiKey('')
    setError(null)
  }

  const handlePlatformChange = (type: PlatformType) => {
    setPlatformType(type)
    resetForm()
  }

  const isValid = platformType === 'mastodon'
    ? instanceUrl.trim().length > 0
    : apiKey.trim().length > 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    try {
      if (platformType === 'mastodon') {
        let url = instanceUrl.trim()
        if (!url.startsWith('http')) url = `https://${url}`
        url = url.replace(/\/+$/, '')

        await onAdd({
          name: name.trim() || url.replace(/^https?:\/\//, ''),
          platform_type: 'mastodon',
          instance_url: url,
        })
      } else {
        await onAdd({
          name: name.trim() || 'YouTube',
          platform_type: 'youtube',
          api_key: apiKey.trim(),
        })
      }

      resetForm()
      onClose()
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to add source')
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add Content Source"
      titleIcon={<Radio className="h-5 w-5 text-primary-500" />}
      maxWidth="sm"
      testId="add-source-modal"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Platform selector */}
        <div data-testid="add-source-platform-selector">
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
            Platform
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handlePlatformChange('mastodon')}
              className={`flex-1 inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                platformType === 'mastodon'
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                  : 'border-neutral-300 dark:border-neutral-600 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-700'
              }`}
              data-testid="add-source-platform-mastodon"
            >
              <MessageSquare className="h-4 w-4" />
              Mastodon
            </button>
            <button
              type="button"
              onClick={() => handlePlatformChange('youtube')}
              className={`flex-1 inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                platformType === 'youtube'
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                  : 'border-neutral-300 dark:border-neutral-600 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-700'
              }`}
              data-testid="add-source-platform-youtube"
            >
              <Play className="h-4 w-4" />
              YouTube
            </button>
          </div>
        </div>

        {/* Platform-specific fields */}
        {platformType === 'mastodon' ? (
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
        ) : (
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              YouTube Data API Key
            </label>
            <SecretInput
              id="youtube-api-key"
              name="apiKey"
              value={apiKey}
              onChange={setApiKey}
              placeholder="AIza..."
            />
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              Get one from{' '}
              <a
                href="https://console.cloud.google.com/apis/credentials"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-500 hover:underline"
                data-testid="add-source-youtube-console-link"
              >
                Google Cloud Console
              </a>
              {' '}&rarr; YouTube Data API v3
            </p>
          </div>
        )}

        {/* Display name (shared) */}
        <div>
          <label htmlFor="source-name" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
            Display Name (optional)
          </label>
          <input
            id="source-name"
            type="text"
            placeholder={platformType === 'mastodon' ? 'Auto-detected from URL' : 'YouTube'}
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
            disabled={!isValid || isAdding}
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
