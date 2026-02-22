import { useState, useEffect } from 'react'
import {
  X,
  Save,
  GitBranch,
  GitMerge,
  Terminal,
  Folder,
  Tag,
  Plus,
  AlertCircle,
  CheckCircle,
  Code2,
  Loader2,
} from 'lucide-react'
import type { Ticket, Epic, UshadowEnvironment } from '../hooks/useTauri'
import { EnvironmentBadge } from './EnvironmentBadge'
import { NewEnvironmentDialog } from './NewEnvironmentDialog'
import { getColors } from '../utils/colors'

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
  { value: 'low', label: 'Low', color: 'bg-surface-500', textColor: 'text-text-secondary', icon: '▼' },
  { value: 'medium', label: 'Medium', color: 'bg-info-500', textColor: 'text-white', icon: '■' },
  { value: 'high', label: 'High', color: 'bg-warning-500', textColor: 'text-surface-900', icon: '▲' },
  { value: 'urgent', label: 'Urgent', color: 'bg-error-500', textColor: 'text-white', icon: '⚠' },
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
  const [showNewEnvDialog, setShowNewEnvDialog] = useState(false)
  const [showPriorityMenu, setShowPriorityMenu] = useState(false)
  const [showWorkstreamMenu, setShowWorkstreamMenu] = useState(false)
  const [showRecreateDialog, setShowRecreateDialog] = useState(false)
  const [recreatingTmux, setRecreatingTmux] = useState(false)
  const [openingTerminal, setOpeningTerminal] = useState(false)
  const [mergingWorktree, setMergingWorktree] = useState(false)

  // Load environments on mount
  useEffect(() => {
    if (isOpen) {
      loadEnvironments()
    }
  }, [isOpen])

  // Close modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest('[data-dropdown]')) {
        setShowPriorityMenu(false)
        setShowWorkstreamMenu(false)
      }
    }

    if (showPriorityMenu || showWorkstreamMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showPriorityMenu, showWorkstreamMenu])

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

      const statusChanged = status !== ticket.status

      // Stop agent when moving to todo: kill the tmux window
      if (statusChanged && status === 'todo' && ticket.tmux_window_name) {
        try {
          await tauri.killTmuxWindow(ticket.tmux_window_name)
        } catch (err) {
          console.error('[TicketDetail] Failed to kill tmux window:', err)
          // Non-fatal: continue with status update
        }
      }

      // Unassign when moving to backlog or done: clear all assignment fields
      const shouldUnassign = statusChanged && (status === 'backlog' || status === 'done')
      // For todo: only clear tmux fields (keep worktree/branch/env for reference)
      const shouldClearTmux = statusChanged && status === 'todo'

      await tauri.updateTicket(
        ticket.id,
        title !== ticket.title ? title : undefined,
        description !== ticket.description ? description : undefined,
        statusChanged ? status : undefined,
        priority !== ticket.priority ? priority : undefined,
        epicId !== ticket.epic_id ? epicId || undefined : undefined,
        JSON.stringify(tags) !== JSON.stringify(ticket.tags) ? tags : undefined,
        undefined, // order
        shouldUnassign ? '' : undefined, // worktreePath
        shouldUnassign ? '' : undefined, // branchName
        shouldUnassign || shouldClearTmux ? '' : undefined, // tmuxWindowName
        shouldUnassign || shouldClearTmux ? '' : undefined, // tmuxSessionName
        shouldUnassign ? '' : undefined, // environmentName
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

  const handleCreateWorktree = async (envName: string, branchName: string, baseBranch?: string) => {
    setError(null)
    setCreatingWorktree(true)
    setShowNewEnvDialog(false)

    try {
      const { tauri } = await import('../hooks/useTauri')

      // Note: When user provides a branch via dialog, we don't use epic's shared branch
      // The branchName from dialog is in format "envname/feature-basebranch" (for main/dev)
      // or "envname/feature" (when branching from another worktree)
      const request = {
        ticket_id: ticket.id,
        ticket_title: ticket.title,
        project_root: projectRoot,
        environment_name: envName, // Simple name for worktree directory (e.g., "staging")
        branch_name: branchName,   // Full branch name (e.g., "staging/feature-main")
        base_branch: baseBranch,   // Use the base branch from dialog (main/dev/worktree branch)
        epic_branch: undefined,    // Not using epic branch when user provides custom branch
      }

      const result = await tauri.createTicketWorktree(request)

      // Extract environment name from branch name (format: "envname/feature")
      const extractedEnvName = result.branch_name.split('/')[0]

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
        result.tmux_session_name, // tmuxSessionName
        extractedEnvName // environmentName - extract from branch name
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

      // Extract environment name from branch name (format: "envname/feature")
      const extractedEnvName = result.branch_name.split('/')[0]

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
        extractedEnvName // environmentName - extract from branch name
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

  const handleRecreateTmuxWindow = async () => {
    if (!ticket.worktree_path || !ticket.environment_name) {
      setError('Missing worktree path or environment name')
      return
    }

    setError(null)
    setRecreatingTmux(true)
    setShowRecreateDialog(false)

    try {
      const { tauri } = await import('../hooks/useTauri')

      // Recreate the tmux window using attach command
      await tauri.attachTmuxToWorktree(
        ticket.worktree_path,
        ticket.environment_name,
        ticket.tmux_window_name || undefined
      )

      setSuccessMessage('Tmux window recreated successfully')
      setTimeout(() => setSuccessMessage(null), 3000)

      // Open terminal — derive canonical window name from env_name (workmux uses dir basename)
      const windowName = ticket.environment_name
        ? `ushadow-${ticket.environment_name}`
        : ticket.tmux_window_name || ''
      if (windowName) {
        await tauri.openTmuxInTerminal(
          windowName,
          ticket.worktree_path,
          ticket.environment_name
        )
      }
    } catch (err) {
      console.error('[TicketDetail] Error recreating tmux window:', err)
      setError(err instanceof Error ? err.message : 'Failed to recreate tmux window')
    } finally {
      setRecreatingTmux(false)
    }
  }

  const handleClearAssignment = async () => {
    setShowRecreateDialog(false)

    try {
      const { tauri } = await import('../hooks/useTauri')
      await tauri.updateTicket(
        ticket.id,
        undefined, undefined, undefined, undefined, undefined, undefined, undefined,
        '', '', '', '', ''
      )
      setSuccessMessage('Environment assignment cleared')
      setTimeout(() => setSuccessMessage(null), 3000)
      onUpdated()
    } catch (clearErr) {
      setError(clearErr instanceof Error ? clearErr.message : 'Failed to clear assignment')
    }
  }

  const handleMergeAndCleanup = async () => {
    if (!ticket.environment_name || !projectRoot) {
      setError('Missing environment name or project root for merge')
      return
    }
    const confirmed = window.confirm(
      `Merge & cleanup worktree "${ticket.environment_name}"?\n\nThis will rebase onto main, delete the worktree, and close the tmux session. This cannot be undone.`
    )
    if (!confirmed) return

    setError(null)
    setMergingWorktree(true)

    try {
      const { tauri } = await import('../hooks/useTauri')
      await tauri.mergeWorktreeWithRebase(projectRoot, ticket.environment_name, true, false)

      // Mark the ticket as done and clear assignment
      await tauri.updateTicket(
        ticket.id,
        undefined, undefined, 'done', undefined, undefined, undefined, undefined,
        '', '', '', '', ''
      )

      setSuccessMessage('Worktree merged and cleaned up')
      onUpdated()
      setTimeout(() => {
        onClose()
      }, 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Merge failed')
    } finally {
      setMergingWorktree(false)
    }
  }

  if (!isOpen) return null

  const selectedEpic = epicId ? epics.find((e) => e.id === epicId) : null
  const hasAssignment = ticket.worktree_path || ticket.branch_name

  const selectedPriority = PRIORITY_OPTIONS.find(opt => opt.value === priority)

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 p-4 bg-black/70 backdrop-blur-sm font-sans"
      onClick={onClose}
      data-testid="ticket-detail-dialog"
    >
      <div
        className="rounded-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden bg-[#0f0f13] border border-white/10 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-white/5 bg-gradient-to-b from-white/[0.03] to-transparent">
          <h2 className="text-xl font-semibold text-white/90">
            Ticket Details
          </h2>
          <button
            onClick={onClose}
            className="transition-all rounded-lg p-2 hover:bg-white/5 text-white/40 hover:text-white/80"
            data-testid="ticket-detail-close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-8 space-y-8">
          {/* Success Message */}
          {successMessage && (
            <div
              className="rounded-xl p-4 flex items-start gap-3 bg-emerald-500/10 border border-emerald-500/20"
              data-testid="ticket-detail-success"
            >
              <CheckCircle className="w-5 h-5 mt-0.5 flex-shrink-0 text-emerald-400" />
              <div className="flex-1">
                <p className="text-sm text-white/70">
                  {successMessage}
                </p>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div
              className="rounded-xl p-4 flex items-start gap-3 bg-red-500/10 border border-red-500/20"
              data-testid="ticket-detail-error"
            >
              <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0 text-red-400" />
              <div className="flex-1">
                <p className="text-sm text-white/70">
                  {error}
                </p>
              </div>
            </div>
          )}

          {/* Two Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-10">
            {/* Left Column - Content */}
            <div className="space-y-6">
              {/* Title */}
              <div>
                <label className="block text-xs font-medium mb-3 tracking-wider uppercase text-white/40">
                  Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-0 py-2 text-2xl font-semibold transition-all focus:outline-none bg-transparent border-0 border-b-2 border-white/5 text-white/90 placeholder-white/20 focus:border-primary-400/50"
                  placeholder="Enter ticket title..."
                  data-testid="ticket-detail-title"
                />
              </div>

              {/* Compact Metadata Row */}
              <div className="flex flex-wrap items-center gap-3">
                {/* Priority - Compact */}
                <div className="relative" data-dropdown>
                  <button
                    type="button"
                    onClick={() => setShowPriorityMenu(!showPriorityMenu)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/10 hover:bg-white/[0.05] hover:border-white/20 transition-all"
                    data-testid="ticket-detail-priority"
                  >
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${selectedPriority?.color} ${selectedPriority?.textColor}`}>
                      <span className="text-sm">{selectedPriority?.icon}</span>
                      {selectedPriority?.label}
                    </span>
                    <svg className="w-3 h-3 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {showPriorityMenu && (
                    <div className="absolute z-10 mt-1 left-0 bg-[#1a1a21] border border-white/10 rounded-lg shadow-2xl overflow-hidden min-w-[140px]">
                      {PRIORITY_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            setPriority(opt.value as typeof priority)
                            setShowPriorityMenu(false)
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/[0.05] transition-colors border-b border-white/5 last:border-0"
                        >
                          <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${opt.color} ${opt.textColor}`}>
                            <span className="text-sm">{opt.icon}</span>
                            {opt.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Status - Compact */}
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as typeof status)}
                  className="px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/10 text-white/70 text-xs hover:bg-white/[0.05] hover:border-white/20 focus:border-primary-400/50 focus:outline-none font-medium transition-all"
                  data-testid="ticket-detail-status"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>

                {/* Epic - Compact */}
                <select
                  value={epicId}
                  onChange={(e) => setEpicId(e.target.value)}
                  className="px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/10 text-white/70 text-xs hover:bg-white/[0.05] hover:border-white/20 focus:border-primary-400/50 focus:outline-none font-medium transition-all"
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
                    className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md font-medium"
                    style={{ backgroundColor: `${selectedEpic.color}20`, color: selectedEpic.color }}
                  >
                    <Folder className="w-3 h-3" />
                    <span>{selectedEpic.base_branch}</span>
                  </div>
                )}
              </div>

              {/* Description - Now Much Larger */}
              <div>
                <label className="block text-xs font-medium mb-3 tracking-wider uppercase text-white/40">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-4 py-4 rounded-xl h-[32rem] transition-all focus:outline-none font-normal leading-relaxed bg-white/[0.03] border border-white/5 text-white/80 placeholder-white/20 focus:border-primary-400/30 focus:bg-white/[0.05] resize-none"
                  data-testid="ticket-detail-description"
                  placeholder="Describe the task, requirements, or issue in detail..."
                />
              </div>

              {/* Tags */}
              <div>
                <label className="block text-xs font-medium mb-3 tracking-wider uppercase text-white/40">
                  Tags
                </label>
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAddTag()}
                    className="flex-1 px-4 py-2.5 rounded-lg bg-white/[0.03] border border-white/10 text-white/80 placeholder-white/30 hover:bg-white/[0.05] hover:border-white/20 focus:border-primary-400/50 focus:outline-none transition-all"
                    placeholder="Add tag (press Enter)"
                    data-testid="ticket-detail-tag-input"
                  />
                  <button
                    onClick={handleAddTag}
                    className="px-3 py-2.5 rounded-lg font-medium transition-all hover:bg-white/[0.05] border border-white/10 text-white/60 hover:text-white/80 hover:border-white/20"
                    data-testid="ticket-detail-add-tag"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {tags.map((tag, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-primary-400/15 text-primary-300 border border-primary-400/20"
                        data-testid={`ticket-detail-tag-${tag}`}
                      >
                        <Tag className="w-3.5 h-3.5" />
                        {tag}
                        <button
                          onClick={() => handleRemoveTag(tag)}
                          className="ml-1 transition-colors hover:bg-white/10 rounded p-0.5 text-white/40 hover:text-white/70"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column - Workstream */}
            <div className="space-y-6">
              {/* Workstream Section Header */}
              <div>
                <h3 className="text-xs font-medium tracking-wider uppercase text-white/40 mb-6">
                  Workstream
                </h3>

                {/* Current Assignment Display */}
                {hasAssignment && ticket.environment_name && (
                  <div
                    className="p-5 rounded-xl mb-6 border"
                    style={{
                      backgroundColor: `${getColors(ticket.environment_name).primary}10`,
                      borderColor: `${getColors(ticket.environment_name).primary}30`,
                    }}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <EnvironmentBadge
                        name={ticket.environment_name}
                        variant="label"
                        showIcon={true}
                        testId="ticket-detail-assigned-env"
                      />
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400">
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Active</span>
                      </div>
                    </div>
                    {ticket.branch_name && (
                      <div className="flex items-center gap-2 text-sm mb-2 font-medium text-white/60">
                        <GitBranch className="w-4 h-4" />
                        <span className="truncate">{ticket.branch_name}</span>
                      </div>
                    )}
                    {ticket.tmux_window_name && (
                      <div className="flex items-center gap-2 text-xs font-medium text-white/40">
                        <Terminal className="w-3.5 h-3.5" />
                        <span>{ticket.tmux_window_name}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Assignment Selector */}
                <div className="mb-6">
                  <label className="block text-sm font-medium mb-3 text-white/60">
                    {hasAssignment ? 'Switch Workstream' : 'Assign to Workstream'}
                  </label>
                  {loadingEnvs ? (
                    <div className="text-sm px-4 py-3 rounded-lg bg-white/[0.02] text-white/40">
                      Loading workstreams...
                    </div>
                  ) : (
                    <div className="relative" data-dropdown>
                      <button
                        type="button"
                        onClick={() => setShowWorkstreamMenu(!showWorkstreamMenu)}
                        disabled={assigningEnv}
                        className="w-full flex items-center justify-between px-4 py-3 rounded-lg bg-white/[0.03] border border-white/10 hover:bg-white/[0.05] hover:border-white/20 transition-all text-left disabled:opacity-50"
                        data-testid="ticket-detail-assign-selector"
                      >
                        <span className="text-white/40 text-sm">
                          {environments.filter(env => env.is_worktree && env.path && env.branch).length === 0
                            ? 'No workstreams available'
                            : 'Select a workstream...'}
                        </span>
                        <svg className="w-4 h-4 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {showWorkstreamMenu && environments.filter(env => env.is_worktree && env.path && env.branch).length > 0 && (
                        <div className="absolute z-10 mt-2 w-full bg-[#1a1a21] border border-white/10 rounded-xl shadow-2xl max-h-80 overflow-y-auto">
                          {environments
                            .filter((env) => env.is_worktree && env.path && env.branch)
                            .map((env) => {
                              const envColors = getColors(env.name)
                              return (
                                <button
                                  key={env.name}
                                  type="button"
                                  onClick={() => {
                                    handleAssignToEnvironment(env)
                                    setShowWorkstreamMenu(false)
                                  }}
                                  className="w-full flex items-center justify-between p-4 hover:bg-white/[0.05] transition-all border-b border-white/5 last:border-b-0"
                                  data-testid={`ticket-detail-assign-${env.name}`}
                                >
                                  <div className="flex items-center gap-3">
                                    <div
                                      className="w-2 h-2 rounded-full flex-shrink-0"
                                      style={{ backgroundColor: env.running ? '#10b981' : '#52525b' }}
                                    />
                                    <EnvironmentBadge
                                      name={env.name}
                                      variant="text"
                                      showIcon={false}
                                      className="text-base font-medium"
                                    />
                                  </div>
                                </button>
                              )
                            })}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Create New Worktree */}
                <button
                  onClick={() => setShowNewEnvDialog(true)}
                  disabled={creatingWorktree}
                  className="w-full flex items-center justify-center gap-2.5 px-4 py-3 font-semibold rounded-lg transition-all bg-gradient-to-r from-primary-500 to-primary-400 hover:from-primary-400 hover:to-primary-300 text-white shadow-lg shadow-primary-500/20 hover:shadow-primary-500/30 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-100"
                  data-testid="ticket-detail-create-worktree"
                >
                  <GitBranch className="w-5 h-5" />
                  {creatingWorktree ? 'Creating...' : 'Create New Workstream'}
                </button>
                {selectedEpic && selectedEpic.branch_name && (
                  <p className="text-xs mt-3 font-medium text-white/40">
                    Will use epic's shared branch
                  </p>
                )}
              </div>

              {/* Action Buttons */}
              {ticket.tmux_window_name && ticket.worktree_path && (
                <div className="pt-6 space-y-4 border-t border-white/5">
                  <h3 className="text-xs font-medium tracking-wider uppercase text-white/40">
                    Actions
                  </h3>

                  {/* Terminal Button */}
                  <button
                    onClick={async () => {
                      if (openingTerminal) return
                      setOpeningTerminal(true)
                      try {
                        const { tauri } = await import('../hooks/useTauri')
                        // Window name = ushadow-{env_name}: workmux uses the worktree directory
                        // basename as its handle, not the branch name.
                        const windowName = ticket.environment_name
                          ? `ushadow-${ticket.environment_name}`
                          : ticket.tmux_window_name || ''
                        await tauri.openTmuxInTerminal(
                          windowName,
                          ticket.worktree_path!,
                          ticket.environment_name || undefined
                        )
                      } catch (err) {
                        const message = err instanceof Error ? err.message : String(err)
                        if (message.includes('no longer exists')) {
                          setShowRecreateDialog(true)
                        } else {
                          setError(message)
                        }
                      } finally {
                        setOpeningTerminal(false)
                      }
                    }}
                    disabled={openingTerminal}
                    className="w-full flex items-center justify-center gap-2.5 px-4 py-3 rounded-lg font-medium transition-all bg-teal-600/10 border border-teal-500/20 text-teal-400 hover:bg-teal-600/20 hover:border-teal-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                    data-testid="ticket-detail-open-terminal"
                  >
                    {openingTerminal
                      ? <Loader2 className="w-4.5 h-4.5 animate-spin" />
                      : <Terminal className="w-4.5 h-4.5" />
                    }
                    <span>{openingTerminal ? 'Opening…' : 'Open Terminal'}</span>
                  </button>

                  {/* VSCode Button */}
                  <button
                    onClick={async () => {
                      const { tauri } = await import('../hooks/useTauri')
                      await tauri.openInVscode(ticket.worktree_path!)
                    }}
                    className="w-full flex items-center justify-center gap-2.5 px-4 py-3 rounded-lg font-medium transition-all bg-blue-600/10 border border-blue-500/20 text-blue-400 hover:bg-blue-600/20 hover:border-blue-500/30"
                    data-testid="ticket-detail-open-vscode"
                  >
                    <Code2 className="w-4.5 h-4.5" />
                    <span>Open VSCode</span>
                  </button>

                  {/* Merge & Cleanup */}
                  {ticket.worktree_path && ticket.environment_name && (
                    <button
                      onClick={handleMergeAndCleanup}
                      disabled={mergingWorktree}
                      className="w-full flex items-center justify-center gap-2.5 px-4 py-3 rounded-lg font-medium transition-all bg-purple-600/10 border border-purple-500/20 text-purple-400 hover:bg-purple-600/20 hover:border-purple-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                      data-testid="ticket-detail-merge-cleanup"
                    >
                      {mergingWorktree
                        ? <Loader2 className="w-4.5 h-4.5 animate-spin" />
                        : <GitMerge className="w-4.5 h-4.5" />
                      }
                      <span>{mergingWorktree ? 'Merging…' : 'Merge & Cleanup'}</span>
                    </button>
                  )}

                  {/* Clear Assignment */}
                  <button
                    onClick={async () => {
                      const shouldClear = confirm(
                        'Clear this workstream assignment?\n\nThis will remove the worktree path, branch, and tmux window reference.'
                      )
                      if (shouldClear) {
                        try {
                          const { tauri } = await import('../hooks/useTauri')
                          await tauri.updateTicket(
                            ticket.id,
                            undefined, undefined, undefined, undefined, undefined, undefined, undefined,
                            '', '', '', '', ''
                          )
                          setSuccessMessage('Environment assignment cleared')
                          setTimeout(() => setSuccessMessage(null), 3000)
                          onUpdated()
                        } catch (clearErr) {
                          setError(clearErr instanceof Error ? clearErr.message : 'Failed to clear assignment')
                        }
                      }
                    }}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all hover:bg-red-500/10 border border-white/10 text-red-400 hover:border-red-500/30"
                    data-testid="ticket-detail-clear-assignment"
                  >
                    <X className="w-4 h-4" />
                    Clear Assignment
                  </button>
                </div>
              )}

              {/* Metadata */}
              <div className="pt-6 text-xs space-y-2 font-mono border-t border-white/5 text-white/30">
                <div className="flex justify-between">
                  <span className="text-white/20">ID</span>
                  <span>{ticket.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/20">Created</span>
                  <span>{new Date(ticket.created_at).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/20">Updated</span>
                  <span>{new Date(ticket.updated_at).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 px-8 py-6 border-t border-white/5 bg-gradient-to-t from-white/[0.02] to-transparent">
            <button
              onClick={onClose}
              className="px-5 py-2.5 font-medium rounded-lg transition-all hover:bg-white/5 text-white/60 hover:text-white/80"
              data-testid="ticket-detail-cancel"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !title.trim()}
              className="flex items-center gap-2 px-5 py-2.5 font-medium rounded-lg transition-all bg-gradient-to-r from-primary-500 to-primary-400 hover:from-primary-400 hover:to-primary-300 text-white shadow-lg shadow-primary-500/20 hover:shadow-primary-500/30 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-100"
              data-testid="ticket-detail-save"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>

      {/* Recreate Tmux Window Dialog */}
      {showRecreateDialog && (
        <div
          className="fixed inset-0 flex items-center justify-center z-[60] p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => setShowRecreateDialog(false)}
          data-testid="recreate-tmux-dialog"
        >
          <div
            className="rounded-2xl w-full max-w-md bg-[#0f0f13] border border-white/10 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 py-5 border-b border-white/5">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10">
                  <AlertCircle className="w-5 h-5 text-amber-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-white/90">
                    Tmux Window Missing
                  </h3>
                  <p className="text-sm text-white/50 mt-1">
                    The tmux window no longer exists (likely due to system reboot)
                  </p>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-white/60 leading-relaxed">
                The worktree still exists at <span className="font-mono text-white/80">{ticket.worktree_path}</span>, but the tmux window <span className="font-mono text-white/80">{ticket.tmux_window_name}</span> is gone.
              </p>
              <p className="text-sm text-white/60 leading-relaxed">
                What would you like to do?
              </p>
            </div>

            {/* Actions */}
            <div className="px-6 py-5 space-y-3 border-t border-white/5">
              <button
                onClick={handleRecreateTmuxWindow}
                disabled={recreatingTmux}
                className="w-full flex items-center justify-center gap-2.5 px-4 py-3 rounded-lg font-medium transition-all bg-gradient-to-r from-primary-500 to-primary-400 hover:from-primary-400 hover:to-primary-300 text-white shadow-lg shadow-primary-500/20 hover:shadow-primary-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="recreate-tmux-confirm"
              >
                <Terminal className="w-4.5 h-4.5" />
                {recreatingTmux ? 'Recreating...' : 'Recreate Tmux Window'}
              </button>

              <button
                onClick={handleClearAssignment}
                disabled={recreatingTmux}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-all bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 hover:border-red-500/30 disabled:opacity-50"
                data-testid="recreate-tmux-clear"
              >
                <X className="w-4 h-4" />
                Clear Assignment
              </button>

              <button
                onClick={() => setShowRecreateDialog(false)}
                disabled={recreatingTmux}
                className="w-full px-4 py-2.5 rounded-lg font-medium transition-all hover:bg-white/5 text-white/60 hover:text-white/80 disabled:opacity-50"
                data-testid="recreate-tmux-cancel"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Environment Dialog */}
      <NewEnvironmentDialog
        isOpen={showNewEnvDialog}
        projectRoot={projectRoot}
        onClose={() => setShowNewEnvDialog(false)}
        onLink={() => {}} // Not used in this context
        onWorktree={handleCreateWorktree}
      />
    </div>
  )
}
