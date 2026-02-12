import { useState, useEffect } from 'react'
import {
  X,
  Save,
  GitBranch,
  Terminal,
  Folder,
  Tag,
  Plus,
  AlertCircle,
  CheckCircle,
} from 'lucide-react'
import type { Ticket, Epic, UshadowEnvironment } from '../hooks/useTauri'
import { EnvironmentBadge } from './EnvironmentBadge'

interface TicketDetailDialogProps {
  ticket: Ticket
  epics: Epic[]
  isOpen: boolean
  onClose: () => void
  onUpdated: () => void
  projectRoot: string
  backendUrl: string
}

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low', color: 'bg-gray-600' },
  { value: 'medium', label: 'Medium', color: 'bg-blue-600' },
  { value: 'high', label: 'High', color: 'bg-orange-600' },
  { value: 'urgent', label: 'Urgent', color: 'bg-red-600' },
]

const STATUS_OPTIONS = [
  { value: 'backlog', label: 'Backlog' },
  { value: 'todo', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'in_review', label: 'In Review' },
  { value: 'done', label: 'Done' },
  { value: 'archived', label: 'Archived' },
]

export function TicketDetailDialog({
  ticket,
  epics,
  isOpen,
  onClose,
  onUpdated,
  projectRoot,
  backendUrl,
}: TicketDetailDialogProps) {
  const [title, setTitle] = useState(ticket.title)
  const [description, setDescription] = useState(ticket.description || '')
  const [priority, setPriority] = useState(ticket.priority)
  const [status, setStatus] = useState(ticket.status)
  const [epicId, setEpicId] = useState(ticket.epic_id || '')
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>(ticket.tags)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [environments, setEnvironments] = useState<UshadowEnvironment[]>([])
  const [loadingEnvs, setLoadingEnvs] = useState(false)
  const [creatingWorktree, setCreatingWorktree] = useState(false)
  const [assigningEnv, setAssigningEnv] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Load environments on mount
  useEffect(() => {
    if (isOpen) {
      loadEnvironments()
    }
  }, [isOpen])

  const loadEnvironments = async () => {
    setLoadingEnvs(true)
    try {
      const { tauri } = await import('../hooks/useTauri')
      const discovery = await tauri.discoverEnvironments()
      setEnvironments(discovery.environments)
    } catch (err) {
      console.error('Failed to load environments:', err)
    } finally {
      setLoadingEnvs(false)
    }
  }

  const handleSave = async () => {
    setError(null)
    setSaving(true)

    try {
      const { tauri } = await import('../hooks/useTauri')

      await tauri.updateTicket(
        ticket.id,
        title !== ticket.title ? title : undefined,
        description !== ticket.description ? description : undefined,
        status !== ticket.status ? status : undefined,
        priority !== ticket.priority ? priority : undefined,
        epicId !== ticket.epic_id ? epicId || undefined : undefined,
        JSON.stringify(tags) !== JSON.stringify(ticket.tags) ? tags : undefined,
        undefined // order
      )

      setSuccessMessage('Ticket updated successfully')
      setTimeout(() => setSuccessMessage(null), 3000)
      onUpdated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update ticket')
    } finally {
      setSaving(false)
    }
  }

  const handleAddTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()])
      setTagInput('')
    }
  }

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove))
  }

  const handleCreateWorktree = async () => {
    setError(null)
    setCreatingWorktree(true)

    try {
      const { tauri } = await import('../hooks/useTauri')

      // Get epic for base branch if ticket has one
      const epic = epicId ? epics.find((e) => e.id === epicId) : null

      const request = {
        ticketId: ticket.id,
        ticketTitle: ticket.title,
        projectRoot,
        branchName: undefined, // Will be auto-generated
        baseBranch: epic?.base_branch || 'main',
        epicBranch: epic?.branch_name || undefined,
      }

      const result = await tauri.createTicketWorktree(request)

      // Update ticket with worktree info
      await tauri.updateTicket(
        ticket.id,
        undefined, // title
        undefined, // description
        'in_progress', // status - move to in progress when creating worktree
        undefined, // priority
        undefined, // epicId
        undefined, // tags
        undefined, // order
        result.worktree_path, // worktreePath
        result.branch_name, // branchName
        result.tmux_window_name, // tmuxWindowName
        result.tmux_session_name // tmuxSessionName
      )

      // Start coding agent in the tmux window
      try {
        await tauri.startCodingAgentForTicket(
          ticket.id,
          result.tmux_window_name,
          result.tmux_session_name,
          result.worktree_path
        )
      } catch (agentErr) {
        console.error('[TicketDetail] Failed to start coding agent:', agentErr)
        // Don't fail the whole operation if agent fails to start
      }

      setSuccessMessage(
        `Worktree created at ${result.worktree_path} with tmux window ${result.tmux_window_name}`
      )
      setTimeout(() => setSuccessMessage(null), 5000)
      onUpdated()
      await loadEnvironments()
    } catch (err) {
      console.error('[TicketDetail] Error creating worktree:', err)
      setError(err instanceof Error ? err.message : 'Failed to create worktree')
    } finally {
      setCreatingWorktree(false)
    }
  }

  const handleAssignToEnvironment = async (env: UshadowEnvironment) => {
    if (!env.path || !env.branch) {
      console.error('[TicketDetail] Environment missing required fields:', { env })
      setError('Environment missing path or branch information')
      return
    }

    setError(null)
    setAssigningEnv(true)

    try {
      const { tauri } = await import('../hooks/useTauri')

      const result = await tauri.attachTicketToWorktree(ticket.id, env.path, env.branch)

      // Update ticket with environment info
      await tauri.updateTicket(
        ticket.id,
        undefined, // title
        undefined, // description
        'in_progress', // status - move to in progress when assigning
        undefined, // priority
        undefined, // epicId
        undefined, // tags
        undefined, // order
        result.worktree_path, // worktreePath
        result.branch_name, // branchName
        result.tmux_window_name, // tmuxWindowName
        result.tmux_session_name, // tmuxSessionName
        env.name // environmentName - save the environment name!
      )

      // Start coding agent in the tmux window
      try {
        await tauri.startCodingAgentForTicket(
          ticket.id,
          result.tmux_window_name,
          result.tmux_session_name,
          result.worktree_path
        )
      } catch (agentErr) {
        console.error('[TicketDetail] Failed to start coding agent:', agentErr)
        // Don't fail the whole operation if agent fails to start
      }

      setSuccessMessage(`Ticket assigned to environment ${env.name}`)
      setTimeout(() => setSuccessMessage(null), 3000)
      onUpdated()
    } catch (err) {
      console.error('[TicketDetail] Error assigning to environment:', err)
      setError(err instanceof Error ? err.message : 'Failed to assign to environment')
    } finally {
      setAssigningEnv(false)
    }
  }

  if (!isOpen) return null

  const selectedEpic = epicId ? epics.find((e) => e.id === epicId) : null
  const hasAssignment = ticket.worktree_path || ticket.branch_name

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
      onClick={onClose}
      data-testid="ticket-detail-dialog"
    >
      <div
        className="rounded-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto"
        style={{ backgroundColor: '#1a1a21', border: '1px solid #3d3d4a' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between p-6"
          style={{ borderBottom: '1px solid #3d3d4a' }}
        >
          <h2 className="text-xl font-semibold" style={{ color: '#f4f4f5' }}>
            Ticket Details
          </h2>
          <button
            onClick={onClose}
            className="transition-colors"
            style={{ color: '#a1a1aa' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#f4f4f5')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#a1a1aa')}
            data-testid="ticket-detail-close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Success Message */}
          {successMessage && (
            <div
              className="rounded-lg p-4 flex items-start gap-3"
              style={{
                backgroundColor: 'rgba(74, 222, 128, 0.1)',
                border: '1px solid rgba(74, 222, 128, 0.2)',
              }}
              data-testid="ticket-detail-success"
            >
              <CheckCircle className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: '#4ade80' }} />
              <div className="flex-1">
                <p className="text-sm" style={{ color: '#a1a1aa' }}>
                  {successMessage}
                </p>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div
              className="rounded-lg p-4 flex items-start gap-3"
              style={{
                backgroundColor: 'rgba(248, 113, 113, 0.1)',
                border: '1px solid rgba(248, 113, 113, 0.2)',
              }}
              data-testid="ticket-detail-error"
            >
              <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: '#f87171' }} />
              <div className="flex-1">
                <p className="text-sm" style={{ color: '#a1a1aa' }}>
                  {error}
                </p>
              </div>
            </div>
          )}

          {/* Two Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column - Basic Info */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold" style={{ color: '#f4f4f5' }}>
                Basic Information
              </h3>

              {/* Title */}
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: '#a1a1aa' }}>
                  Title *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg transition-all focus:outline-none"
                  style={{
                    backgroundColor: '#252530',
                    border: '1px solid #52525b',
                    color: '#f4f4f5',
                  }}
                  onFocus={(e) => (e.currentTarget.style.border = '1px solid #4ade80')}
                  onBlur={(e) => (e.currentTarget.style.border = '1px solid #52525b')}
                  data-testid="ticket-detail-title"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: '#a1a1aa' }}>
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg h-32 transition-all focus:outline-none"
                  style={{
                    backgroundColor: '#252530',
                    border: '1px solid #52525b',
                    color: '#f4f4f5',
                  }}
                  onFocus={(e) => (e.currentTarget.style.border = '1px solid #4ade80')}
                  onBlur={(e) => (e.currentTarget.style.border = '1px solid #52525b')}
                  data-testid="ticket-detail-description"
                />
              </div>

              {/* Priority */}
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: '#a1a1aa' }}>
                  Priority
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as typeof priority)}
                  className="w-full px-4 py-2.5 rounded-lg transition-all focus:outline-none"
                  style={{
                    backgroundColor: '#252530',
                    border: '1px solid #52525b',
                    color: '#f4f4f5',
                  }}
                  onFocus={(e) => (e.currentTarget.style.border = '1px solid #4ade80')}
                  onBlur={(e) => (e.currentTarget.style.border = '1px solid #52525b')}
                  data-testid="ticket-detail-priority"
                >
                  {PRIORITY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Status */}
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: '#a1a1aa' }}>
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as typeof status)}
                  className="w-full px-4 py-2.5 rounded-lg transition-all focus:outline-none"
                  style={{
                    backgroundColor: '#252530',
                    border: '1px solid #52525b',
                    color: '#f4f4f5',
                  }}
                  onFocus={(e) => (e.currentTarget.style.border = '1px solid #4ade80')}
                  onBlur={(e) => (e.currentTarget.style.border = '1px solid #52525b')}
                  data-testid="ticket-detail-status"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Epic */}
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: '#a1a1aa' }}>
                  Epic
                </label>
                <select
                  value={epicId}
                  onChange={(e) => setEpicId(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg transition-all focus:outline-none"
                  style={{
                    backgroundColor: '#252530',
                    border: '1px solid #52525b',
                    color: '#f4f4f5',
                  }}
                  onFocus={(e) => (e.currentTarget.style.border = '1px solid #4ade80')}
                  onBlur={(e) => (e.currentTarget.style.border = '1px solid #52525b')}
                  data-testid="ticket-detail-epic"
                >
                  <option value="">No Epic</option>
                  {epics.map((epic) => (
                    <option key={epic.id} value={epic.id}>
                      {epic.title}
                    </option>
                  ))}
                </select>
                {selectedEpic && (
                  <div
                    className="mt-2 flex items-center gap-2 text-sm px-2 py-1 rounded"
                    style={{ backgroundColor: `${selectedEpic.color}20`, color: selectedEpic.color }}
                  >
                    <Folder className="w-4 h-4" />
                    <span>Base: {selectedEpic.base_branch}</span>
                  </div>
                )}
              </div>

              {/* Tags */}
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: '#a1a1aa' }}>
                  Tags
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAddTag()}
                    className="flex-1 px-4 py-2.5 rounded-lg transition-all focus:outline-none"
                    placeholder="Add tag"
                    style={{
                      backgroundColor: '#252530',
                      border: '1px solid #52525b',
                      color: '#f4f4f5',
                    }}
                    onFocus={(e) => (e.currentTarget.style.border = '1px solid #4ade80')}
                    onBlur={(e) => (e.currentTarget.style.border = '1px solid #52525b')}
                    data-testid="ticket-detail-tag-input"
                  />
                  <button
                    onClick={handleAddTag}
                    className="px-3 py-2.5 rounded-lg font-medium transition-all"
                    style={{
                      backgroundColor: 'transparent',
                      border: '1px solid #52525b',
                      color: '#f4f4f5',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#2d2d3a'
                      e.currentTarget.style.borderColor = '#a1a1aa'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent'
                      e.currentTarget.style.borderColor = '#52525b'
                    }}
                    data-testid="ticket-detail-add-tag"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                      style={{
                        backgroundColor: 'rgba(74, 222, 128, 0.15)',
                        color: '#86efac',
                      }}
                      data-testid={`ticket-detail-tag-${tag}`}
                    >
                      <Tag className="w-3 h-3" />
                      {tag}
                      <button
                        onClick={() => handleRemoveTag(tag)}
                        className="ml-0.5 transition-colors"
                        style={{ color: '#71717a' }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = '#f4f4f5')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = '#71717a')}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Column - Environment Assignment */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold" style={{ color: '#f4f4f5' }}>
                Environment Assignment
              </h3>

              {/* Current Assignment */}
              {hasAssignment ? (
                <div
                  className="p-4 rounded-lg"
                  style={{
                    backgroundColor: '#252530',
                    border: '1px solid #3d3d4a',
                  }}
                >
                  <div className="flex items-center justify-between mb-3">
                    {ticket.environment_name && (
                      <EnvironmentBadge
                        name={ticket.environment_name}
                        variant="label"
                        showIcon={true}
                        testId="ticket-detail-assigned-env"
                      />
                    )}
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded text-xs" style={{ backgroundColor: 'rgba(74, 222, 128, 0.2)', color: '#4ade80' }}>
                      <CheckCircle className="w-3 h-3" />
                      <span>Assigned</span>
                    </div>
                  </div>
                  {ticket.branch_name && (
                    <div className="flex items-center gap-2 text-sm mb-2" style={{ color: '#71717a' }}>
                      <GitBranch className="w-3 h-3" />
                      <span>{ticket.branch_name}</span>
                    </div>
                  )}
                  {ticket.tmux_window_name && (
                    <div className="flex items-center gap-2 text-xs" style={{ color: '#71717a' }}>
                      <Terminal className="w-3 h-3" />
                      <span>{ticket.tmux_window_name}</span>
                    </div>
                  )}
                  {ticket.worktree_path && (
                    <div className="text-xs truncate mt-2" style={{ color: '#52525b' }} title={ticket.worktree_path}>
                      {ticket.worktree_path}
                    </div>
                  )}

                  {/* Action Buttons */}
                  {ticket.tmux_window_name && ticket.worktree_path && (
                    <div className="flex gap-2 mt-4 pt-3" style={{ borderTop: '1px solid #3d3d4a' }}>
                      <button
                        onClick={async () => {
                          const { tauri } = await import('../hooks/useTauri')
                          await tauri.openTmuxInTerminal(ticket.tmux_window_name!, ticket.worktree_path!)
                        }}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg font-medium transition-all"
                        style={{
                          backgroundColor: '#252530',
                          border: '1px solid #52525b',
                          color: '#f4f4f5',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#2d2d3a'
                          e.currentTarget.style.borderColor = '#a1a1aa'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = '#252530'
                          e.currentTarget.style.borderColor = '#52525b'
                        }}
                        data-testid="ticket-detail-open-terminal"
                      >
                        <Terminal className="w-4 h-4" />
                        Open Terminal
                      </button>
                      <button
                        onClick={async () => {
                          const { tauri } = await import('../hooks/useTauri')
                          await tauri.openInVscode(ticket.worktree_path!)
                        }}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg font-medium transition-all"
                        style={{
                          backgroundColor: '#252530',
                          border: '1px solid #52525b',
                          color: '#f4f4f5',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#2d2d3a'
                          e.currentTarget.style.borderColor = '#a1a1aa'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = '#252530'
                          e.currentTarget.style.borderColor = '#52525b'
                        }}
                        data-testid="ticket-detail-open-vscode"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M23.15 2.587L18.21.21a1.494 1.494 0 0 0-1.705.29l-9.46 8.63-4.12-3.128a.999.999 0 0 0-1.276.057L.327 7.261A1 1 0 0 0 .326 8.74L3.899 12 .326 15.26a1 1 0 0 0 .001 1.479L1.65 17.94a.999.999 0 0 0 1.276.057l4.12-3.128 9.46 8.63a1.492 1.492 0 0 0 1.704.29l4.942-2.377A1.5 1.5 0 0 0 24 20.06V3.939a1.5 1.5 0 0 0-.85-1.352zm-5.146 14.861L10.826 12l7.178-5.448v10.896z"/>
                        </svg>
                        Open VSCode
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div
                  className="p-4 rounded-lg text-sm"
                  style={{
                    backgroundColor: '#252530',
                    border: '1px solid #3d3d4a',
                    color: '#71717a',
                  }}
                >
                  Not assigned to any environment
                </div>
              )}

              {/* Create New Worktree */}
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: '#a1a1aa' }}>
                  {hasAssignment ? 'Or create new worktree:' : 'Create new worktree:'}
                </label>
                <button
                  onClick={handleCreateWorktree}
                  disabled={creatingWorktree}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 font-medium rounded-lg transition-all"
                  style={{
                    backgroundColor: creatingWorktree ? 'rgba(168, 85, 247, 0.4)' : '#a855f7',
                    color: creatingWorktree ? 'rgba(255, 255, 255, 0.5)' : '#ffffff',
                    cursor: creatingWorktree ? 'not-allowed' : 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    if (!creatingWorktree) e.currentTarget.style.backgroundColor = '#c084fc'
                  }}
                  onMouseLeave={(e) => {
                    if (!creatingWorktree) e.currentTarget.style.backgroundColor = '#a855f7'
                  }}
                  data-testid="ticket-detail-create-worktree"
                >
                  <GitBranch className="w-5 h-5" />
                  {creatingWorktree ? 'Creating Worktree...' : 'Create New Worktree'}
                </button>
                <p className="text-xs mt-2" style={{ color: '#71717a' }}>
                  Creates a new git worktree and tmux window for this ticket.
                  {selectedEpic && selectedEpic.branch_name && ' Will use epic\'s shared branch.'}
                </p>
              </div>

              {/* Assign to Existing Environment */}
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: '#a1a1aa' }}>
                  {hasAssignment ? 'Reassign to different environment:' : 'Or assign to existing environment:'}
                </label>
                  {loadingEnvs ? (
                    <div className="text-sm" style={{ color: '#71717a' }}>
                      Loading environments...
                    </div>
                  ) : environments.length === 0 ? (
                    <div className="text-sm" style={{ color: '#71717a' }}>
                      No environments available
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {environments
                        .filter((env) => env.is_worktree && env.path && env.branch)
                        .map((env) => (
                          <button
                            key={env.name}
                            onClick={() => handleAssignToEnvironment(env)}
                            disabled={assigningEnv}
                            className="w-full flex items-center justify-between p-3 rounded-lg text-left transition-all"
                            style={{
                              backgroundColor: '#252530',
                              border: '1px solid #3d3d4a',
                              opacity: assigningEnv ? 0.5 : 1,
                            }}
                            onMouseEnter={(e) => {
                              if (!assigningEnv) e.currentTarget.style.backgroundColor = '#2d2d3a'
                            }}
                            onMouseLeave={(e) => {
                              if (!assigningEnv) e.currentTarget.style.backgroundColor = '#252530'
                            }}
                            data-testid={`ticket-detail-assign-${env.name}`}
                          >
                            <div className="flex-1">
                              <EnvironmentBadge
                                name={env.name}
                                variant="text"
                                showIcon={false}
                                className="text-base"
                              />
                              <div className="text-xs flex items-center gap-2 mt-1" style={{ color: '#a1a1aa' }}>
                                <GitBranch className="w-3 h-3" />
                                <span>{env.branch}</span>
                              </div>
                            </div>
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: env.running ? '#4ade80' : '#52525b' }}
                            />
                          </button>
                        ))}
                    </div>
                  )}
              </div>

              {/* Metadata */}
              <div className="pt-4 text-xs space-y-1" style={{ borderTop: '1px solid #3d3d4a', color: '#71717a' }}>
                <div>ID: {ticket.id}</div>
                <div>Created: {new Date(ticket.created_at).toLocaleString()}</div>
                <div>Updated: {new Date(ticket.updated_at).toLocaleString()}</div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4" style={{ borderTop: '1px solid #3d3d4a' }}>
            <button
              onClick={onClose}
              className="px-6 py-2.5 font-medium rounded-lg transition-all"
              style={{
                backgroundColor: 'transparent',
                border: '1px solid #52525b',
                color: '#f4f4f5',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#2d2d3a'
                e.currentTarget.style.borderColor = '#a1a1aa'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent'
                e.currentTarget.style.borderColor = '#52525b'
              }}
              data-testid="ticket-detail-cancel"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !title.trim()}
              className="flex items-center gap-2 px-6 py-2.5 font-medium rounded-lg transition-all"
              style={{
                backgroundColor: saving || !title.trim() ? 'rgba(74, 222, 128, 0.4)' : '#4ade80',
                color: saving || !title.trim() ? 'rgba(15, 15, 19, 0.5)' : '#0f0f13',
                cursor: saving || !title.trim() ? 'not-allowed' : 'pointer',
              }}
              onMouseEnter={(e) => {
                if (!saving && title.trim()) e.currentTarget.style.backgroundColor = '#86efac'
              }}
              onMouseLeave={(e) => {
                if (!saving && title.trim()) e.currentTarget.style.backgroundColor = '#4ade80'
              }}
              data-testid="ticket-detail-save"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
