import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Tag, Folder } from 'lucide-react'
import { TicketCard } from './TicketCard'
import { CreateTicketDialog } from './CreateTicketDialog'
import { CreateEpicDialog } from './CreateEpicDialog'

export type TicketStatus = 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'archived'
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent'

export interface Epic {
  id: string
  title: string
  description?: string
  color: string
  branch_name?: string
  base_branch: string
  project_id?: string
  created_at: string
  updated_at: string
}

export interface Ticket {
  id: string
  title: string
  description?: string
  status: TicketStatus
  priority: TicketPriority
  epic_id?: string
  tags: string[]
  color?: string
  tmux_window_name?: string
  tmux_session_name?: string
  branch_name?: string
  worktree_path?: string
  environment_name?: string
  project_id?: string
  assigned_to?: string
  order: number
  created_at: string
  updated_at: string
}

interface KanbanBoardProps {
  projectId?: string
  backendUrl: string
  projectRoot: string
}

const COLUMNS: { status: TicketStatus; title: string }[] = [
  { status: 'backlog', title: 'Backlog' },
  { status: 'todo', title: 'To Do' },
  { status: 'in_progress', title: 'In Progress' },
  { status: 'in_review', title: 'In Review' },
  { status: 'done', title: 'Done' },
]

export function KanbanBoard({ projectId, backendUrl, projectRoot }: KanbanBoardProps) {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [epics, setEpics] = useState<Epic[]>([])
  const [initialLoading, setInitialLoading] = useState(true)
  const [showCreateTicket, setShowCreateTicket] = useState(false)
  const [showCreateEpic, setShowCreateEpic] = useState(false)
  const [selectedEpic, setSelectedEpic] = useState<string | null>(null)
  const [dragOverColumn, setDragOverColumn] = useState<TicketStatus | null>(null)
  // Keep a ref to tickets so handleDrop always sees the latest values
  const ticketsRef = useRef<Ticket[]>([])

  // Fetch tickets and epics (using Tauri commands)
  const fetchData = useCallback(async (isInitialLoad = false) => {
    try {
      // Only show loading overlay on initial load, not during background polling
      if (isInitialLoad) {
        setInitialLoading(true)
      }

      const { tauri } = await import('../hooks/useTauri')

      const [ticketsData, epicsData] = await Promise.all([
        tauri.getTickets(projectId || undefined),
        tauri.getEpics(projectId || undefined),
      ])

      setTickets(ticketsData)
      ticketsRef.current = ticketsData
      setEpics(epicsData)
    } catch (error) {
      console.error('Failed to fetch kanban data:', error)
    } finally {
      if (isInitialLoad) {
        setInitialLoading(false)
      }
    }
  }, [projectId])

  useEffect(() => {
    fetchData(true) // Initial load - show loading overlay
    // Poll every 30 seconds (background refresh - no loading overlay)
    const interval = setInterval(() => fetchData(false), 30000)
    return () => clearInterval(interval)
  }, [fetchData])

  // Group tickets by status
  const ticketsByStatus = COLUMNS.reduce((acc, col) => {
    acc[col.status] = tickets.filter(t => t.status === col.status)
    return acc
  }, {} as Record<TicketStatus, Ticket[]>)

  // Filter tickets by selected epic
  const filteredTickets = selectedEpic
    ? Object.entries(ticketsByStatus).reduce((acc, [status, tickets]) => {
        acc[status as TicketStatus] = tickets.filter(t => t.epic_id === selectedEpic)
        return acc
      }, {} as Record<TicketStatus, Ticket[]>)
    : ticketsByStatus

  const handleDrop = useCallback(async (e: React.DragEvent, targetStatus: TicketStatus) => {
    e.preventDefault()
    setDragOverColumn(null)

    const ticketId = e.dataTransfer.getData('text/plain')
    const ticket = ticketsRef.current.find(t => t.id === ticketId)
    if (!ticket || ticket.status === targetStatus) return

    try {
      const { tauri } = await import('../hooks/useTauri')

      // Stop agent when moving to todo: kill tmux window
      if (targetStatus === 'todo' && ticket.tmux_window_name) {
        try {
          await tauri.killTmuxWindow(ticket.tmux_window_name)
        } catch (err) {
          console.error('[KanbanBoard] Failed to kill tmux window:', err)
        }
      }

      // Unassign when moving to backlog or done
      const shouldUnassign = targetStatus === 'backlog' || targetStatus === 'done'
      // For todo: only clear tmux fields
      const shouldClearTmux = targetStatus === 'todo'

      await tauri.updateTicket(
        ticketId,
        undefined, undefined,
        targetStatus,
        undefined, undefined, undefined, undefined,
        shouldUnassign ? '' : undefined, // worktreePath
        shouldUnassign ? '' : undefined, // branchName
        shouldUnassign || shouldClearTmux ? '' : undefined, // tmuxWindowName
        shouldUnassign || shouldClearTmux ? '' : undefined, // tmuxSessionName
        shouldUnassign ? '' : undefined, // environmentName
      )

      fetchData(false)
    } catch (err) {
      console.error('[KanbanBoard] Failed to move ticket:', err)
    }
  }, [fetchData])

  const handleTicketCreated = () => {
    fetchData(false) // Background refresh after creation
    setShowCreateTicket(false)
  }

  const handleEpicCreated = () => {
    fetchData(false) // Background refresh after creation
    setShowCreateEpic(false)
  }

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center h-full" data-testid="kanban-loading">
        <div className="text-gray-400">Loading kanban board...</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-gray-900" data-testid="kanban-board">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-800">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-semibold text-white">Kanban Board</h1>

          {/* Epic Filter */}
          <div className="flex items-center gap-2">
            <Folder className="w-4 h-4 text-gray-400" />
            <select
              value={selectedEpic || ''}
              onChange={(e) => setSelectedEpic(e.target.value || null)}
              className="bg-gray-800 text-white px-3 py-1.5 rounded border border-gray-700 text-sm"
              data-testid="kanban-epic-filter"
            >
              <option value="">All Tickets</option>
              {epics.map((epic) => (
                <option key={epic.id} value={epic.id}>
                  {epic.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreateEpic(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded text-sm"
            data-testid="kanban-create-epic"
          >
            <Folder className="w-4 h-4" />
            New Epic
          </button>
          <button
            onClick={() => setShowCreateTicket(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm"
            data-testid="kanban-create-ticket"
          >
            <Plus className="w-4 h-4" />
            New Ticket
          </button>
        </div>
      </div>

      {/* Board Columns */}
      <div className="flex-1 flex gap-4 p-4 overflow-x-auto">
        {COLUMNS.map((column) => (
          <div
            key={column.status}
            className={`flex-shrink-0 w-80 flex flex-col rounded-lg transition-colors ${
              dragOverColumn === column.status ? 'bg-gray-700 ring-2 ring-blue-500/50' : 'bg-gray-800'
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOverColumn(column.status) }}
            onDragEnter={(e) => { e.preventDefault(); setDragOverColumn(column.status) }}
            onDragLeave={(e) => {
              // Only clear if leaving the column entirely (not entering a child)
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setDragOverColumn(null)
              }
            }}
            onDrop={(e) => handleDrop(e, column.status)}
            data-testid={`kanban-column-${column.status}`}
          >
            {/* Column Header */}
            <div className="p-3 border-b border-gray-700">
              <div className="flex items-center justify-between">
                <h2 className="font-medium text-white">{column.title}</h2>
                <span className="text-xs text-gray-400 bg-gray-700 px-2 py-1 rounded">
                  {filteredTickets[column.status]?.length || 0}
                </span>
              </div>
            </div>

            {/* Ticket List */}
            <div className="flex-1 p-2 space-y-2 overflow-y-auto" onDragOver={(e) => e.preventDefault()}>
              {filteredTickets[column.status]?.map((ticket) => (
                <TicketCard
                  key={ticket.id}
                  ticket={ticket}
                  epics={epics}
                  onUpdate={fetchData}
                  backendUrl={backendUrl}
                  projectRoot={projectRoot}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Dialogs */}
      {showCreateTicket && (
        <CreateTicketDialog
          isOpen={showCreateTicket}
          onClose={() => setShowCreateTicket(false)}
          onCreated={handleTicketCreated}
          epics={epics}
          projectId={projectId}
          projectRoot={projectRoot}
          backendUrl={backendUrl}
        />
      )}

      {showCreateEpic && (
        <CreateEpicDialog
          isOpen={showCreateEpic}
          onClose={() => setShowCreateEpic(false)}
          onCreated={handleEpicCreated}
          projectId={projectId}
          backendUrl={backendUrl}
        />
      )}
    </div>
  )
}
