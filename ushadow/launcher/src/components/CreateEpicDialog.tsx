import { useState } from 'react'

interface CreateEpicDialogProps {
  isOpen: boolean
  onClose: () => void
  onCreated: () => void
  projectId?: string
  backendUrl: string
}

const PRESET_COLORS = [
  '#3B82F6', // blue
  '#8B5CF6', // purple
  '#EC4899', // pink
  '#F59E0B', // amber
  '#10B981', // green
  '#06B6D4', // cyan
  '#F97316', // orange
  '#EF4444', // red
]

export function CreateEpicDialog({
  isOpen,
  onClose,
  onCreated,
  projectId,
  backendUrl,
}: CreateEpicDialogProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState(PRESET_COLORS[0])
  const [baseBranch, setBaseBranch] = useState('main')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setCreating(true)

    try {
      const { tauri } = await import('../hooks/useTauri')

      await tauri.createEpic(
        title,
        description || null,
        color,
        baseBranch,
        null, // branch_name (not set during creation)
        projectId || null
      )

      onCreated()
      // Reset form
      setTitle('')
      setDescription('')
      setColor(PRESET_COLORS[0])
      setBaseBranch('main')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create epic')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={onClose}
      data-testid="create-epic-dialog"
    >
      <div
        className="bg-gray-800 rounded-lg p-6 w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-semibold text-white mb-4">Create New Epic</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white"
              placeholder="Epic title"
              required
              data-testid="create-epic-title"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white h-24"
              placeholder="Epic description"
              data-testid="create-epic-description"
            />
          </div>

          {/* Color */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Team Color
            </label>
            <div className="flex gap-2 flex-wrap">
              {PRESET_COLORS.map((presetColor) => (
                <button
                  key={presetColor}
                  type="button"
                  onClick={() => setColor(presetColor)}
                  className={`w-10 h-10 rounded border-2 ${
                    color === presetColor ? 'border-white' : 'border-gray-700'
                  }`}
                  style={{ backgroundColor: presetColor }}
                  data-testid={`create-epic-color-${presetColor}`}
                />
              ))}
            </div>
          </div>

          {/* Base Branch */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Base Branch
            </label>
            <input
              type="text"
              value={baseBranch}
              onChange={(e) => setBaseBranch(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white"
              placeholder="main"
              data-testid="create-epic-base-branch"
            />
            <p className="text-xs text-gray-500 mt-1">
              New branches for tickets in this epic will be created from this branch
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="text-sm text-red-400" data-testid="create-epic-error">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded"
              data-testid="create-epic-cancel"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating || !title.trim()}
              className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded"
              data-testid="create-epic-submit"
            >
              {creating ? 'Creating...' : 'Create Epic'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
