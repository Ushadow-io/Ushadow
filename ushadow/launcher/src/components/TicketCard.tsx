import { useState } from 'react'
import { Tag, Folder, GitBranch, Loader2 } from 'lucide-react'

function ClaudeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-1.227-.072L2 12.66l.063-.584.112-.05 1.603.05 2.387.097 2.339.072.79.049h.018l-.79-.658-1.943-1.702-1.724-1.578-.717-.687-.52-.585.456-.728.354-.056.505.392 1.29 1.158 1.822 1.675 1.453 1.369.79.755-.073-.875-.137-2.064-.113-2.209-.017-1.514.033-1.126.048-.042.663-.056.072.042.211 1.175.137 2.209.081 2.282v.292l.549-.6 1.498-1.53 1.661-1.595 1.13-.998.936-.768.505.546-.033.384-1.001.9-1.582 1.562-1.498 1.53-1.017 1.079.073-.024 2.404-.657 2.291-.56 1.516-.413.304-.024.16.37-.016.433-.426.15-1.549.405-2.307.559-2.485.657-.4.097z"/>
    </svg>
  )
}
import type { Ticket, Epic } from './KanbanBoard'
import { TicketDetailDialog } from './TicketDetailDialog'
import { EnvironmentBadge } from './EnvironmentBadge'

interface TicketCardProps {
  ticket: Ticket
  epics: Epic[]
  onUpdate: () => void
  backendUrl: string
  projectRoot: string
}

const PRIORITY_COLORS = {
  low: 'bg-gray-600',
  medium: 'bg-blue-600',
  high: 'bg-orange-600',
  urgent: 'bg-red-600',
}

const PRIORITY_LABELS = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
}

export function TicketCard({ ticket, epics, onUpdate, backendUrl, projectRoot }: TicketCardProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [showDetail, setShowDetail] = useState(false)
  const [openingWorkmux, setOpeningWorkmux] = useState(false)

  const handleOpenWorkmux = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!ticket.worktree_path || !ticket.environment_name || openingWorkmux) return
    setOpeningWorkmux(true)
    try {
      const { tauri } = await import('../hooks/useTauri')
      await tauri.attachTmuxToWorktree(ticket.worktree_path, ticket.environment_name, undefined)
    } catch (err) {
      console.error('[TicketCard] Failed to open workmux:', err)
    } finally {
      setOpeningWorkmux(false)
    }
  }

  // Find epic for this ticket
  const epic = ticket.epic_id ? epics.find(e => e.id === ticket.epic_id) : null

  // Determine color: ticket color > epic color > generated color
  const getCardColor = (): string => {
    if (ticket.color) return ticket.color
    if (epic?.color) return epic.color
    // Generate color from ticket ID hash
    const hash = ticket.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    const hue = hash % 360
    return `hsl(${hue}, 70%, 60%)`
  }

  const cardColor = getCardColor()

  // Convert hex/hsl to rgb for border
  const getBorderStyle = () => {
    return {
      borderLeft: `4px solid ${cardColor}`,
    }
  }

  const handleDragStart = (e: React.DragEvent) => {
    setIsDragging(true)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', ticket.id)
  }

  const handleDragEnd = () => {
    setIsDragging(false)
  }

  return (
    <>
      <div
        draggable
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onClick={() => setShowDetail(true)}
        style={getBorderStyle()}
        className={`
          bg-gray-900 rounded p-3 cursor-pointer hover:bg-gray-850 transition-colors
          ${isDragging ? 'opacity-50' : ''}
        `}
        data-testid={`ticket-card-${ticket.id}`}
      >
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <h3 className="text-sm font-medium text-white flex-1 pr-2" data-testid="ticket-card-title">
          {ticket.title}
        </h3>
        <span
          className={`text-xs px-2 py-0.5 rounded text-white ${PRIORITY_COLORS[ticket.priority]}`}
          data-testid="ticket-card-priority"
        >
          {PRIORITY_LABELS[ticket.priority]}
        </span>
      </div>

      {/* Description */}
      {ticket.description && (
        <p className="text-xs text-gray-400 mb-2 line-clamp-2" data-testid="ticket-card-description">
          {ticket.description}
        </p>
      )}

      {/* Badges Row - Epic and Environment */}
      {(epic || ticket.environment_name) && (
        <div className="flex flex-wrap gap-2 mb-2">
          {epic && (
            <div
              className="flex items-center gap-1.5 text-xs px-2 py-1 rounded"
              style={{ backgroundColor: `${epic.color}20`, color: epic.color }}
              data-testid="ticket-card-epic"
            >
              <Folder className="w-3 h-3" />
              <span>{epic.title}</span>
            </div>
          )}

          {ticket.environment_name && (
            <EnvironmentBadge
              name={ticket.environment_name}
              variant="badge"
              showIcon={true}
              testId="ticket-card-environment"
            />
          )}
        </div>
      )}

      {/* Tags */}
      {ticket.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2" data-testid="ticket-card-tags">
          {ticket.tags.map((tag, idx) => (
            <span
              key={idx}
              className="flex items-center gap-1 text-xs px-2 py-0.5 bg-gray-800 text-gray-300 rounded"
            >
              <Tag className="w-3 h-3" />
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Footer Metadata */}
      <div className="flex items-center gap-3 text-xs text-gray-500 pt-2 border-t border-gray-800">
        {/* Branch */}
        {ticket.branch_name && (
          <div className="flex items-center gap-1" data-testid="ticket-card-branch">
            <GitBranch className="w-3 h-3" />
            <span className="truncate">{ticket.branch_name}</span>
          </div>
        )}

        {/* Open Workmux */}
        {ticket.worktree_path && ticket.environment_name && (
          <button
            onClick={handleOpenWorkmux}
            disabled={openingWorkmux}
            title="Open Claude session in workmux"
            className="flex items-center text-orange-400 hover:text-orange-300 transition-colors disabled:opacity-50"
            data-testid="ticket-card-open-workmux"
          >
            {openingWorkmux
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <ClaudeIcon className="w-3.5 h-3.5" />
            }
          </button>
        )}

        {/* ID */}
        <div className="ml-auto text-gray-600" data-testid="ticket-card-id">
          #{ticket.id.slice(-6)}
        </div>
      </div>
    </div>

      {/* Detail Dialog */}
      <TicketDetailDialog
        ticket={ticket}
        epics={epics}
        isOpen={showDetail}
        onClose={() => setShowDetail(false)}
        onUpdated={() => {
          setShowDetail(false)
          onUpdate()
        }}
        projectRoot={projectRoot}
        backendUrl={backendUrl}
      />
    </>
  )
}
