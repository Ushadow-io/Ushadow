import { useState, useEffect } from 'react'
import type { Epic, TicketPriority, UshadowEnvironment } from '../hooks/useTauri'

interface CreateTicketDialogProps {
  isOpen: boolean
  onClose: () => void
  onCreated: () => void
  epics: Epic[]
  projectId?: string
  projectRoot: string
  backendUrl: string
  initialEnvironment?: string // For "Create from Environment" flow
}

export function CreateTicketDialog({
  isOpen,
  onClose,
  onCreated,
  epics,
  projectId,
  projectRoot,
  backendUrl,
  initialEnvironment,
}: CreateTicketDialogProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<TicketPriority>('medium')
  const [epicId, setEpicId] = useState<string>('')
  const [tags, setTags] = useState<string>('')
  const [environment, setEnvironment] = useState<string>(initialEnvironment || '')
  const [environments, setEnvironments] = useState<UshadowEnvironment[]>([])
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load environments when dialog opens
  useEffect(() => {
    if (isOpen) {
      loadEnvironments()
    }
  }, [isOpen])

  const loadEnvironments = async () => {
    try {
      const { tauri } = await import('../hooks/useTauri')
      const discovery = await tauri.discoverEnvironments()
      setEnvironments(discovery.environments.filter(env => env.is_worktree && env.path && env.branch))
    } catch (err) {
      console.error('Failed to load environments:', err)
    }
  }

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setCreating(true)

    try {
      const { tauri } = await import('../hooks/useTauri')

      const tagsList = tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : []

      console.log('[CreateTicket] Creating ticket with Tauri command')
      console.log('[CreateTicket] Data:', { title, description, priority, epicId, tags: tagsList, projectId, environment })

      // Create the ticket first
      const ticket = await tauri.createTicket(
        title,
        description || null,
        priority,
        epicId || null,
        tagsList,
        environment || null,
        projectId || null
      )

      // If environment is selected, attach to worktree
      if (environment) {
        const env = environments.find(e => e.name === environment)
        if (env && env.path && env.branch) {
          console.log('[CreateTicket] Attaching to environment:', environment)
          const result = await tauri.attachTicketToWorktree(ticket.id, env.path, env.branch)

          // Update ticket with worktree info
          await tauri.updateTicket(
            ticket.id,
            undefined, // title
            undefined, // description
            'in_progress', // status
            undefined, // priority
            undefined, // epicId
            undefined, // tags
            undefined, // order
            result.worktree_path,
            result.branch_name,
            result.tmux_window_name,
            result.tmux_session_name,
            environment
          )

          // Start coding agent in the tmux window
          console.log('[CreateTicket] Starting coding agent for ticket:', ticket.id)
          try {
            await tauri.startCodingAgentForTicket(
              ticket.id,
              result.tmux_window_name,
              result.tmux_session_name,
              result.worktree_path
            )
            console.log('[CreateTicket] ✓ Coding agent started')
          } catch (err) {
            console.error('[CreateTicket] Failed to start coding agent:', err)
            // Don't fail the whole operation if agent fails to start
          }
        }
      }

      onCreated()
      // Reset form
      setTitle('')
      setDescription('')
      setPriority('medium')
      setEpicId('')
      setTags('')
      setEnvironment('')
    } catch (err) {
      console.error('[CreateTicket] Exception:', err)
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

          {/* Environment */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Environment (optional)
            </label>
            <select
              value={environment}
              onChange={(e) => setEnvironment(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white"
              data-testid="create-ticket-environment"
            >
              <option value="">No Environment</option>
              {environments.map((env) => (
                <option key={env.name} value={env.name}>
                  {env.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Assign this ticket to an environment immediately (will set status to In Progress)
            </p>
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
