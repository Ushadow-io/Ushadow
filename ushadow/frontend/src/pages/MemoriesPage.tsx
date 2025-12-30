/**
 * MemoriesPage
 *
 * Main page for viewing and managing OpenMemory memories.
 * Provides search, filtering, pagination, and CRUD operations.
 */

import { useState } from 'react'
import {
  Brain,
  Search,
  Plus,
  Trash2,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { MemoryTable } from '../components/memories/MemoryTable'
import { useMemories } from '../hooks/useMemories'
import { useMemoriesStore } from '../stores/memoriesStore'

export default function MemoriesPage() {
  const {
    searchQuery,
    setSearchQuery,
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    selectedMemoryIds,
    editDialog,
    closeEditDialog,
    setEditContent,
  } = useMemoriesStore()

  const {
    memories,
    totalItems,
    totalPages,
    isLoading,
    isFetching,
    error,
    isServerAvailable,
    isCheckingHealth,
    createMemory,
    updateMemory,
    deleteMemories,
    isCreating,
    isUpdating,
    isDeleting,
    refetch,
  } = useMemories()

  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newMemoryText, setNewMemoryText] = useState('')

  // Handle search with debounce-like behavior
  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
  }

  // Handle create memory
  const handleCreateMemory = async () => {
    if (!newMemoryText.trim()) return
    await createMemory({ text: newMemoryText })
    setNewMemoryText('')
    setShowCreateDialog(false)
  }

  // Handle update memory
  const handleUpdateMemory = async () => {
    if (!editDialog.memoryId || !editDialog.content.trim()) return
    await updateMemory({ memoryId: editDialog.memoryId, content: editDialog.content })
    closeEditDialog()
  }

  // Handle bulk delete
  const handleBulkDelete = async () => {
    if (selectedMemoryIds.length === 0) return
    if (confirm(`Delete ${selectedMemoryIds.length} memories?`)) {
      await deleteMemories(selectedMemoryIds)
    }
  }

  // Pagination range display
  const startItem = (currentPage - 1) * pageSize + 1
  const endItem = Math.min(currentPage * pageSize, totalItems)

  return (
    <div data-testid="memories-page" className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-500/20 rounded-lg">
            <Brain className="w-6 h-6 text-purple-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Memories</h1>
            <p className="text-sm text-zinc-400">
              Manage your OpenMemory knowledge base
            </p>
          </div>
        </div>

        {/* Server status */}
        <div className="flex items-center gap-4">
          {isCheckingHealth ? (
            <span className="text-sm text-zinc-400">Checking server...</span>
          ) : isServerAvailable ? (
            <span className="flex items-center gap-1 text-sm text-green-400">
              <CheckCircle className="w-4 h-4" />
              Connected
            </span>
          ) : (
            <span className="flex items-center gap-1 text-sm text-red-400">
              <AlertCircle className="w-4 h-4" />
              Server unavailable
            </span>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            data-testid="memories-search"
            placeholder="Search memories..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {selectedMemoryIds.length > 0 && (
            <button
              data-testid="bulk-delete-btn"
              onClick={handleBulkDelete}
              disabled={isDeleting}
              className="flex items-center gap-2 px-3 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              Delete ({selectedMemoryIds.length})
            </button>
          )}

          <button
            data-testid="refresh-btn"
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-2 bg-zinc-800 border border-zinc-700 rounded-lg hover:bg-zinc-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 text-zinc-400 ${isFetching ? 'animate-spin' : ''}`} />
          </button>

          <button
            data-testid="create-memory-btn"
            onClick={() => setShowCreateDialog(true)}
            disabled={!isServerAvailable}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            Add Memory
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
          <p className="text-red-400">Failed to load memories: {error.message}</p>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && memories.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="p-4 bg-zinc-800 rounded-full mb-4">
            <Brain className="w-8 h-8 text-zinc-500" />
          </div>
          <h3 className="text-lg font-medium text-white mb-2">No memories found</h3>
          <p className="text-zinc-400 mb-4">
            {searchQuery
              ? 'Try adjusting your search query'
              : 'Create your first memory to get started'}
          </p>
          {!searchQuery && (
            <button
              onClick={() => setShowCreateDialog(true)}
              disabled={!isServerAvailable}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              Create Memory
            </button>
          )}
        </div>
      )}

      {/* Memory table */}
      {(isLoading || memories.length > 0) && (
        <>
          <MemoryTable memories={memories} isLoading={isLoading} />

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm text-zinc-400">Show</span>
              <select
                data-testid="page-size-select"
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-white"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
              <span className="text-sm text-zinc-400">per page</span>
            </div>

            <div className="text-sm text-zinc-400">
              Showing {startItem} to {endItem} of {totalItems} memories
            </div>

            <div className="flex items-center gap-2">
              <button
                data-testid="prev-page-btn"
                onClick={() => setCurrentPage(currentPage - 1)}
                disabled={currentPage === 1}
                className="p-2 bg-zinc-800 border border-zinc-700 rounded-lg hover:bg-zinc-700 disabled:opacity-50"
              >
                <ChevronLeft className="w-4 h-4 text-zinc-400" />
              </button>
              <span className="text-sm text-zinc-400">
                Page {currentPage} of {totalPages}
              </span>
              <button
                data-testid="next-page-btn"
                onClick={() => setCurrentPage(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="p-2 bg-zinc-800 border border-zinc-700 rounded-lg hover:bg-zinc-700 disabled:opacity-50"
              >
                <ChevronRight className="w-4 h-4 text-zinc-400" />
              </button>
            </div>
          </div>
        </>
      )}

      {/* Create Memory Dialog */}
      {showCreateDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div
            data-testid="create-memory-dialog"
            className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-full max-w-lg"
          >
            <h2 className="text-xl font-semibold text-white mb-4">Add Memory</h2>
            <textarea
              data-testid="new-memory-input"
              value={newMemoryText}
              onChange={(e) => setNewMemoryText(e.target.value)}
              placeholder="Enter a memory or fact to remember..."
              rows={4}
              className="w-full p-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 resize-none"
            />
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => {
                  setShowCreateDialog(false)
                  setNewMemoryText('')
                }}
                className="px-4 py-2 text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                data-testid="confirm-create-btn"
                onClick={handleCreateMemory}
                disabled={!newMemoryText.trim() || isCreating}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {isCreating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Memory Dialog */}
      {editDialog.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div
            data-testid="edit-memory-dialog"
            className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-full max-w-lg"
          >
            <h2 className="text-xl font-semibold text-white mb-4">Edit Memory</h2>
            <textarea
              data-testid="edit-memory-input"
              value={editDialog.content}
              onChange={(e) => setEditContent(e.target.value)}
              rows={4}
              className="w-full p-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 resize-none"
            />
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={closeEditDialog}
                className="px-4 py-2 text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                data-testid="confirm-edit-btn"
                onClick={handleUpdateMemory}
                disabled={!editDialog.content.trim() || isUpdating}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {isUpdating ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
