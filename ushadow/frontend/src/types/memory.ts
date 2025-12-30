/**
 * Memory Types
 *
 * Types for the OpenMemory integration in ushadow.
 * Adapted from mem0/openmemory UI.
 */

/** Memory categories for classification */
export type MemoryCategory =
  | "personal"
  | "work"
  | "health"
  | "finance"
  | "travel"
  | "education"
  | "preferences"
  | "relationships"

/** Source applications that create memories */
export type MemoryClient =
  | "chrome"
  | "chatgpt"
  | "cursor"
  | "windsurf"
  | "terminal"
  | "api"
  | "openmemory"
  | "chronicle"

/** Memory state lifecycle */
export type MemoryState = "active" | "paused" | "archived" | "deleted" | "processing"

/** Core memory entity */
export interface Memory {
  id: string
  memory: string
  metadata: Record<string, unknown>
  client: MemoryClient
  categories: MemoryCategory[]
  created_at: number
  app_name: string
  state: MemoryState
}

/** API response item shape */
export interface ApiMemoryItem {
  id: string
  content: string
  created_at: string
  state: string
  app_id: string
  categories: string[]
  metadata_?: Record<string, unknown>
  app_name: string
}

/** Paginated API response */
export interface MemoriesApiResponse {
  items: ApiMemoryItem[]
  total: number
  page: number
  size: number
  pages: number
}

/** Filter options for fetching memories */
export interface MemoryFilters {
  apps?: string[]
  categories?: string[]
  sortColumn?: string
  sortDirection?: 'asc' | 'desc'
  showArchived?: boolean
}

/** Access log entry for memory audit trail */
export interface MemoryAccessLog {
  id: string
  app_name: string
  accessed_at: string
}

/** Memory stats summary */
export interface MemoryStats {
  total: number
  active: number
  paused: number
  archived: number
  by_category: Record<MemoryCategory, number>
  by_app: Record<string, number>
}
