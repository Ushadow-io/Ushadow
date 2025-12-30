/**
 * MemoryTable Component
 *
 * Displays memories in a table format with selection, actions, and state management.
 * Adapted from OpenMemory UI for ushadow.
 */

import { useState } from 'react'
import {
  Edit,
  MoreHorizontal,
  Trash2,
  Pause,
  Archive,
  Play,
  Loader2,
  Brain,
} from 'lucide-react'
import { useMemoriesStore } from '../../stores/memoriesStore'
import { useMemories } from '../../hooks/useMemories'
import type { Memory, MemoryCategory } from '../../types/memory'

// Category color mapping
const categoryColors: Record<MemoryCategory, string> = {
  personal: 'bg-purple-500/20 text-purple-300',
  work: 'bg-blue-500/20 text-blue-300',
  health: 'bg-green-500/20 text-green-300',
  finance: 'bg-yellow-500/20 text-yellow-300',
  travel: 'bg-orange-500/20 text-orange-300',
  education: 'bg-cyan-500/20 text-cyan-300',
  preferences: 'bg-pink-500/20 text-pink-300',
  relationships: 'bg-red-500/20 text-red-300',
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

interface MemoryTableProps {
  memories: Memory[]
  isLoading?: boolean
}

export function MemoryTable({ memories, isLoading }: MemoryTableProps) {
  const {
    selectedMemoryIds,
    selectMemory,
    deselectMemory,
    selectAllMemories,
    clearSelection,
    openEditDialog,
  } = useMemoriesStore()

  const { deleteMemories, updateMemoryState, isDeleting } = useMemories()
  const [actionMenuId, setActionMenuId] = useState<string | null>(null)

  const isAllSelected = memories.length > 0 && selectedMemoryIds.length === memories.length
  const isPartiallySelected = selectedMemoryIds.length > 0 && selectedMemoryIds.length < memories.length

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      selectAllMemories(memories.map((m) => m.id))
    } else {
      clearSelection()
    }
  }

  const handleSelectMemory = (id: string, checked: boolean) => {
    if (checked) {
      selectMemory(id)
    } else {
      deselectMemory(id)
    }
  }

  const handleDeleteMemory = async (id: string) => {
    setActionMenuId(null)
    await deleteMemories([id])
  }

  const handleUpdateState = async (id: string, newState: Memory['state']) => {
    setActionMenuId(null)
    await updateMemoryState({ memoryIds: [id], state: newState })
  }

  const handleEditMemory = (id: string, content: string) => {
    setActionMenuId(null)
    openEditDialog(id, content)
  }

  if (isLoading) {
    return (
      <div className="rounded-lg border border-zinc-700 bg-zinc-900/50">
        <div className="animate-pulse p-4 space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-zinc-800 rounded" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div
      data-testid="memory-table"
      className="rounded-lg border border-zinc-700 overflow-hidden"
    >
      <table className="w-full">
        <thead className="bg-zinc-800">
          <tr>
            <th className="w-12 px-4 py-3 text-left">
              <input
                type="checkbox"
                data-testid="select-all-checkbox"
                checked={isAllSelected}
                ref={(el) => {
                  if (el) el.indeterminate = isPartiallySelected
                }}
                onChange={(e) => handleSelectAll(e.target.checked)}
                className="rounded border-zinc-600 bg-zinc-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-zinc-900"
              />
            </th>
            <th className="px-4 py-3 text-left text-sm font-medium text-zinc-400">
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4" />
                Memory
              </div>
            </th>
            <th className="px-4 py-3 text-left text-sm font-medium text-zinc-400">
              Categories
            </th>
            <th className="w-32 px-4 py-3 text-left text-sm font-medium text-zinc-400">
              Source
            </th>
            <th className="w-32 px-4 py-3 text-left text-sm font-medium text-zinc-400">
              Created
            </th>
            <th className="w-12 px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800">
          {memories.map((memory) => (
            <tr
              key={memory.id}
              data-testid={`memory-row-${memory.id}`}
              className={`
                hover:bg-zinc-800/50 transition-colors
                ${memory.state === 'paused' || memory.state === 'archived' ? 'opacity-60' : ''}
                ${isDeleting ? 'animate-pulse opacity-50' : ''}
              `}
            >
              <td className="px-4 py-3">
                <input
                  type="checkbox"
                  data-testid={`select-memory-${memory.id}`}
                  checked={selectedMemoryIds.includes(memory.id)}
                  onChange={(e) => handleSelectMemory(memory.id, e.target.checked)}
                  disabled={memory.state === 'processing'}
                  className="rounded border-zinc-600 bg-zinc-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-zinc-900 disabled:opacity-50"
                />
              </td>
              <td className="px-4 py-3">
                {memory.state === 'processing' ? (
                  <div className="flex items-center gap-2 text-zinc-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{memory.memory}</span>
                  </div>
                ) : (
                  <div className="text-white font-medium max-w-lg truncate">
                    {memory.memory}
                  </div>
                )}
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  {memory.categories.slice(0, 3).map((cat) => (
                    <span
                      key={cat}
                      className={`px-2 py-0.5 rounded-full text-xs ${categoryColors[cat] || 'bg-zinc-700 text-zinc-300'}`}
                    >
                      {cat}
                    </span>
                  ))}
                  {memory.categories.length > 3 && (
                    <span className="px-2 py-0.5 rounded-full text-xs bg-zinc-700 text-zinc-400">
                      +{memory.categories.length - 3}
                    </span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3 text-sm text-zinc-400">
                {memory.app_name}
              </td>
              <td className="px-4 py-3 text-sm text-zinc-400">
                {formatDate(memory.created_at)}
              </td>
              <td className="px-4 py-3 relative">
                <button
                  data-testid={`memory-actions-${memory.id}`}
                  onClick={() => setActionMenuId(actionMenuId === memory.id ? null : memory.id)}
                  disabled={memory.state === 'processing'}
                  className="p-1 rounded hover:bg-zinc-700 disabled:opacity-50"
                >
                  <MoreHorizontal className="w-4 h-4 text-zinc-400" />
                </button>

                {/* Action dropdown */}
                {actionMenuId === memory.id && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setActionMenuId(null)}
                    />
                    <div className="absolute right-0 mt-1 w-40 bg-zinc-900 border border-zinc-700 rounded-lg shadow-lg z-20">
                      <button
                        data-testid={`memory-toggle-state-${memory.id}`}
                        onClick={() =>
                          handleUpdateState(
                            memory.id,
                            memory.state === 'active' ? 'paused' : 'active'
                          )
                        }
                        className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-zinc-800"
                      >
                        {memory.state === 'active' ? (
                          <>
                            <Pause className="w-4 h-4" /> Pause
                          </>
                        ) : (
                          <>
                            <Play className="w-4 h-4" /> Resume
                          </>
                        )}
                      </button>
                      <button
                        data-testid={`memory-archive-${memory.id}`}
                        onClick={() =>
                          handleUpdateState(
                            memory.id,
                            memory.state === 'archived' ? 'active' : 'archived'
                          )
                        }
                        className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-zinc-800"
                      >
                        <Archive className="w-4 h-4" />
                        {memory.state === 'archived' ? 'Unarchive' : 'Archive'}
                      </button>
                      <button
                        data-testid={`memory-edit-${memory.id}`}
                        onClick={() => handleEditMemory(memory.id, memory.memory)}
                        className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-zinc-800"
                      >
                        <Edit className="w-4 h-4" /> Edit
                      </button>
                      <hr className="border-zinc-700" />
                      <button
                        data-testid={`memory-delete-${memory.id}`}
                        onClick={() => handleDeleteMemory(memory.id)}
                        className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-zinc-800 text-red-400"
                      >
                        <Trash2 className="w-4 h-4" /> Delete
                      </button>
                    </div>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
