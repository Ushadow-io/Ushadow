/**
 * MemoriesPage
 *
 * Main page for viewing and managing OpenMemory memories.
 * Features tabbed navigation between List view and Graph visualization.
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
  List,
  Share2,
  Loader2,
} from 'lucide-react'
import { MemoryTable } from '../components/memories/MemoryTable'
import { GraphVisualization } from '../components/memories/GraphVisualization'
import { useMemories } from '../hooks/useMemories'
import { useGraphApi } from '../hooks/useGraphApi'
import { useMemoriesStore } from '../stores/memoriesStore'

type Tab = 'list' | 'graph'

export default function MemoriesPage() {
  const [activeTab, setActiveTab] = useState<Tab>('list')
  const [graphLimit, setGraphLimit] = useState(100)

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
    refetch: refetchMemories,
  } = useMemories()

  const {
    graphData,
    stats,
    isLoading: isGraphLoading,
    isFetching: isGraphFetching,
    error: graphError,
    searchGraph,
    refetch: refetchGraph,
  } = useGraphApi(graphLimit)

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

  // Handle graph search
  const handleGraphSearch = async (query: string) => {
    await searchGraph(query)
  }

  // Handle limit change for graph
  const handleGraphLimitChange = (newLimit: number) => {
    setGraphLimit(newLimit)
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

      {/* Tab Navigation */}
      <div className="flex items-center gap-4 border-b border-zinc-700">
        <button
          data-testid="tab-list"
          onClick={() => setActiveTab('list')}
          className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
            activeTab === 'list'
              ? 'border-blue-500 text-white'
              : 'border-transparent text-zinc-400 hover:text-white'
          }`}
        >
          <List className="w-4 h-4" />
          List View
        </button>
        <button
          data-testid="tab-graph"
          onClick={() => setActiveTab('graph')}
          className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
            activeTab === 'graph'
              ? 'border-blue-500 text-white'
              : 'border-transparent text-zinc-400 hover:text-white'
          }`}
        >
          <Share2 className="w-4 h-4" />
          Knowledge Graph
          {stats && (
            <span className="ml-2 px-2 py-0.5 text-xs bg-zinc-800 rounded-full">
              {stats.node_count} nodes
            </span>
          )}
        </button>
      </div>

      {/* List View Tab */}
      {activeTab === 'list' && (
        <>
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
                onClick={() => refetchMemories()}
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
        </>
      )}

      {/* Graph View Tab */}
      {activeTab === 'graph' && (
        <div className="space-y-4">
          {/* Graph Stats */}
          {stats && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4">
                <div className="text-sm text-zinc-400">Total Nodes</div>
                <div className="text-2xl font-bold text-white mt-1">{stats.node_count}</div>
              </div>
              <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4">
                <div className="text-sm text-zinc-400">Total Relationships</div>
                <div className="text-2xl font-bold text-white mt-1">{stats.relationship_count}</div>
              </div>
              <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4">
                <div className="text-sm text-zinc-400">Node Types</div>
                <div className="text-2xl font-bold text-white mt-1">{stats.node_types.length}</div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {stats.node_types.slice(0, 3).map((type) => (
                    <span key={type.label} className="text-xs text-zinc-500">
                      {type.label} ({type.count})
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Graph Controls */}
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <label htmlFor="graph-limit" className="text-sm text-zinc-400">
                  Node Limit:
                </label>
                <input
                  id="graph-limit"
                  type="number"
                  min="10"
                  max="1000"
                  step="10"
                  value={graphLimit}
                  onChange={(e) => handleGraphLimitChange(Number(e.target.value))}
                  className="w-24 px-3 py-1 bg-zinc-800 border border-zinc-700 rounded text-sm text-white"
                />
              </div>
              <button
                data-testid="graph-refresh-btn"
                onClick={() => refetchGraph()}
                disabled={isGraphFetching}
                className="flex items-center gap-2 px-3 py-1 bg-zinc-800 border border-zinc-700 rounded hover:bg-zinc-700 disabled:opacity-50"
              >
                {isGraphFetching ? (
                  <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
                ) : (
                  <RefreshCw className="w-4 h-4 text-zinc-400" />
                )}
                <span className="text-sm text-zinc-300">Refresh</span>
              </button>
            </div>
          </div>

          {/* Graph Error */}
          {graphError && (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-red-400">{graphError}</p>
            </div>
          )}

          {/* Graph Visualization */}
          <div className="h-[calc(100vh-400px)] min-h-[500px]">
            <GraphVisualization
              nodes={graphData?.nodes || []}
              relationships={graphData?.relationships || []}
              loading={isGraphLoading}
              onSearch={handleGraphSearch}
            />
          </div>
        </div>
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
