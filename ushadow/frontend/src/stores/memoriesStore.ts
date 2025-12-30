/**
 * Memories Store (Zustand)
 *
 * Manages local UI state for the memories feature.
 * Server state is handled by React Query in useMemories hook.
 */

import { create } from 'zustand'
import type { Memory, MemoryFilters } from '../types/memory'

interface MemoriesState {
  // Selection state
  selectedMemoryIds: string[]
  selectedMemory: Memory | null

  // UI state
  searchQuery: string
  filters: MemoryFilters
  currentPage: number
  pageSize: number

  // Edit dialog state
  editDialog: {
    open: boolean
    memoryId: string | null
    content: string
  }

  // Actions
  selectMemory: (id: string) => void
  deselectMemory: (id: string) => void
  selectAllMemories: (ids: string[]) => void
  clearSelection: () => void
  setSelectedMemory: (memory: Memory | null) => void

  setSearchQuery: (query: string) => void
  setFilters: (filters: MemoryFilters) => void
  setCurrentPage: (page: number) => void
  setPageSize: (size: number) => void

  openEditDialog: (memoryId: string, content: string) => void
  closeEditDialog: () => void
  setEditContent: (content: string) => void

  reset: () => void
}

const initialState = {
  selectedMemoryIds: [] as string[],
  selectedMemory: null as Memory | null,
  searchQuery: '',
  filters: {} as MemoryFilters,
  currentPage: 1,
  pageSize: 10,
  editDialog: {
    open: false,
    memoryId: null as string | null,
    content: '',
  },
}

export const useMemoriesStore = create<MemoriesState>((set) => ({
  ...initialState,

  // Selection actions
  selectMemory: (id) =>
    set((state) => ({
      selectedMemoryIds: [...state.selectedMemoryIds, id],
    })),

  deselectMemory: (id) =>
    set((state) => ({
      selectedMemoryIds: state.selectedMemoryIds.filter((i) => i !== id),
    })),

  selectAllMemories: (ids) =>
    set({ selectedMemoryIds: ids }),

  clearSelection: () =>
    set({ selectedMemoryIds: [] }),

  setSelectedMemory: (memory) =>
    set({ selectedMemory: memory }),

  // Pagination & filters
  setSearchQuery: (query) =>
    set({ searchQuery: query, currentPage: 1 }),

  setFilters: (filters) =>
    set({ filters, currentPage: 1 }),

  setCurrentPage: (page) =>
    set({ currentPage: page }),

  setPageSize: (size) =>
    set({ pageSize: size, currentPage: 1 }),

  // Edit dialog
  openEditDialog: (memoryId, content) =>
    set({
      editDialog: { open: true, memoryId, content },
    }),

  closeEditDialog: () =>
    set({
      editDialog: { open: false, memoryId: null, content: '' },
    }),

  setEditContent: (content) =>
    set((state) => ({
      editDialog: { ...state.editDialog, content },
    })),

  // Reset
  reset: () => set(initialState),
}))
