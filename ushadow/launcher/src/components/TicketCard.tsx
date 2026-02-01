import { useState } from 'react'
import { Tag, Folder, GitBranch, Terminal, Clock, AlertCircle } from 'lucide-react'
import type { Ticket, Epic } from './KanbanBoard'

interface TicketCardProps {
  ticket: Ticket
  epics: Epic[]
  onUpdate: () => void
  backendUrl: string
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

export function TicketCard({ ticket, epics, onUpdate, backendUrl }: TicketCardProps) {
  const [isDragging, setIsDragging] = useState(false)

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
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      style={getBorderStyle()}
      className={`
        bg-gray-900 rounded p-3 cursor-move hover:bg-gray-850 transition-colors
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

      {/* Epic Badge */}
      {epic && (
        <div
          className="flex items-center gap-1.5 text-xs mb-2 px-2 py-1 rounded"
          style={{ backgroundColor: `${epic.color}20`, color: epic.color }}
          data-testid="ticket-card-epic"
        >
          <Folder className="w-3 h-3" />
          <span>{epic.title}</span>
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

        {/* Tmux Window */}
        {ticket.tmux_window_name && (
          <div
            className="flex items-center gap-1 text-green-500"
            title="Tmux window active"
            data-testid="ticket-card-tmux"
          >
            <Terminal className="w-3 h-3" />
            <span>Active</span>
          </div>
        )}

        {/* ID */}
        <div className="ml-auto text-gray-600" data-testid="ticket-card-id">
          #{ticket.id.slice(-6)}
        </div>
      </div>
    </div>
  )
}
