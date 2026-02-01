import { useState } from 'react'
import type { Epic, TicketPriority } from './KanbanBoard'

interface CreateTicketDialogProps {
  isOpen: boolean
  onClose: () => void
  onCreated: () => void
  epics: Epic[]
  projectId?: string
  backendUrl: string
  initialEnvironment?: string // For "Create from Environment" flow
}

export function CreateTicketDialog({
  isOpen,
  onClose,
  onCreated,
  epics,
  projectId,
  backendUrl,
  initialEnvironment,
}: CreateTicketDialogProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<TicketPriority>('medium')
  const [epicId, setEpicId] = useState<string>('')
  const [tags, setTags] = useState<string>('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setCreating(true)

    try {
      const payload = {
        title,
        description: description || undefined,
        priority,
        epic_id: epicId || undefined,
        tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        project_id: projectId,
        environment_name: initialEnvironment,
      }

      const response = await fetch(`${backendUrl}/api/kanban/tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error('Failed to create ticket')
      }

      onCreated()
      // Reset form
      setTitle('')
      setDescription('')
      setPriority('medium')
      setEpicId('')
      setTags('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create ticket')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={onClose}
      data-testid="create-ticket-dialog"
    >
      <div
        className="bg-gray-800 rounded-lg p-6 w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-semibold text-white mb-4">Create New Ticket</h2>

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
              placeholder="Ticket title"
              required
              data-testid="create-ticket-title"
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
              placeholder="Ticket description"
              data-testid="create-ticket-description"
            />
          </div>

          {/* Priority */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Priority
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as TicketPriority)}
              className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white"
              data-testid="create-ticket-priority"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>

          {/* Epic */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Epic (optional)
            </label>
            <select
              value={epicId}
              onChange={(e) => setEpicId(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white"
              data-testid="create-ticket-epic"
            >
              <option value="">No Epic</option>
              {epics.map((epic) => (
                <option key={epic.id} value={epic.id}>
                  {epic.title}
                </option>
              ))}
            </select>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Tags (comma-separated)
            </label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white"
              placeholder="feature, bug, documentation"
              data-testid="create-ticket-tags"
            />
          </div>

          {/* Environment (if provided) */}
          {initialEnvironment && (
            <div className="text-sm text-gray-400">
              Linked to environment: <span className="text-white">{initialEnvironment}</span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="text-sm text-red-400" data-testid="create-ticket-error">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded"
              data-testid="create-ticket-cancel"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating || !title.trim()}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded"
              data-testid="create-ticket-submit"
            >
              {creating ? 'Creating...' : 'Create Ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
