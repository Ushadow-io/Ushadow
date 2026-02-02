/**
 * useWiringActions - Wire/unwire operations for service connections
 *
 * This hook extracts wiring business logic from ServiceConfigsPage,
 * providing clean API for connecting providers to consumers.
 */

import { useCallback, useMemo } from 'react'
import { svcConfigsApi, Wiring, WiringCreateRequest } from '../services/api'

// ============================================================================
// Types
// ============================================================================

export interface WiringConnection {
  wiring: Wiring
  sourceId: string
  sourceName?: string
  targetId: string
  targetCapability: string
}

export interface UseWiringActionsResult {
  /**
   * Create a wiring connection between a provider and consumer.
   * If a connection already exists for this target/capability, it will be replaced.
   */
  wire: (
    sourceConfigId: string,
    targetConfigId: string,
    capability: string
  ) => Promise<Wiring>

  /**
   * Remove a wiring connection by ID.
   */
  unwire: (wiringId: string) => Promise<void>

  /**
   * Remove wiring for a specific target/capability.
   * Returns true if a wiring was found and deleted.
   */
  unwireByTarget: (targetConfigId: string, capability: string) => Promise<boolean>

  /**
   * Get the current connection for a target/capability.
   * Returns null if no connection exists.
   */
  getConnection: (targetConfigId: string, capability: string) => Wiring | null

  /**
   * Get all connections for a specific target.
   */
  getTargetConnections: (targetConfigId: string) => Wiring[]

  /**
   * Get all connections from a specific source.
   */
  getSourceConnections: (sourceConfigId: string) => Wiring[]

  /**
   * Check if a target capability is wired to any provider.
   */
  isWired: (targetConfigId: string, capability: string) => boolean
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Manage wiring operations with optimistic updates.
 *
 * @param wiring - Current wiring state from parent
 * @param onUpdate - Callback to refresh wiring state after changes
 */
export function useWiringActions(
  wiring: Wiring[],
  onUpdate: () => Promise<void> | void
): UseWiringActionsResult {
  // Build lookup maps for fast access
  const { byTarget, bySource } = useMemo(() => {
    const byTarget = new Map<string, Wiring>()
    const bySource = new Map<string, Wiring[]>()

    for (const w of wiring) {
      // Key: targetId::capability
      const targetKey = `${w.target_config_id}::${w.target_capability}`
      byTarget.set(targetKey, w)

      // Source connections
      const sourceConns = bySource.get(w.source_config_id) || []
      sourceConns.push(w)
      bySource.set(w.source_config_id, sourceConns)
    }

    return { byTarget, bySource }
  }, [wiring])

  // Get connection for target/capability
  const getConnection = useCallback(
    (targetConfigId: string, capability: string): Wiring | null => {
      const key = `${targetConfigId}::${capability}`
      return byTarget.get(key) || null
    },
    [byTarget]
  )

  // Get all connections for a target
  const getTargetConnections = useCallback(
    (targetConfigId: string): Wiring[] => {
      return wiring.filter(w => w.target_config_id === targetConfigId)
    },
    [wiring]
  )

  // Get all connections from a source
  const getSourceConnections = useCallback(
    (sourceConfigId: string): Wiring[] => {
      return bySource.get(sourceConfigId) || []
    },
    [bySource]
  )

  // Check if wired
  const isWired = useCallback(
    (targetConfigId: string, capability: string): boolean => {
      return getConnection(targetConfigId, capability) !== null
    },
    [getConnection]
  )

  // Create wiring
  const wire = useCallback(
    async (
      sourceConfigId: string,
      targetConfigId: string,
      capability: string
    ): Promise<Wiring> => {
      // Check for existing connection and remove it first
      const existing = getConnection(targetConfigId, capability)
      if (existing) {
        await svcConfigsApi.deleteWiring(existing.id)
      }

      // Create new wiring
      const request: WiringCreateRequest = {
        source_config_id: sourceConfigId,
        source_capability: capability,
        target_config_id: targetConfigId,
        target_capability: capability,
      }

      const result = await svcConfigsApi.createWiring(request)

      // Trigger refresh
      await onUpdate()

      return result.data
    },
    [getConnection, onUpdate]
  )

  // Remove wiring by ID
  const unwire = useCallback(
    async (wiringId: string): Promise<void> => {
      await svcConfigsApi.deleteWiring(wiringId)
      await onUpdate()
    },
    [onUpdate]
  )

  // Remove wiring by target/capability
  const unwireByTarget = useCallback(
    async (targetConfigId: string, capability: string): Promise<boolean> => {
      const existing = getConnection(targetConfigId, capability)
      if (!existing) {
        return false
      }

      await svcConfigsApi.deleteWiring(existing.id)
      await onUpdate()
      return true
    },
    [getConnection, onUpdate]
  )

  return {
    wire,
    unwire,
    unwireByTarget,
    getConnection,
    getTargetConnections,
    getSourceConnections,
    isWired,
  }
}
