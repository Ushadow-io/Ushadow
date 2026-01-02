/**
 * Graph Types
 *
 * Types for the memory graph visualization.
 * Based on OpenMemory's graph API.
 */

/** Node in the memory knowledge graph */
export interface GraphNode {
  id: string
  labels: string[]
  properties: Record<string, unknown>
}

/** Relationship between graph nodes */
export interface GraphRelationship {
  id: string
  type: string
  source: string
  target: string
  properties: Record<string, unknown>
}

/** Complete graph data structure */
export interface GraphData {
  nodes: GraphNode[]
  relationships: GraphRelationship[]
}

/** Statistics about the graph */
export interface GraphStats {
  node_count: number
  relationship_count: number
  node_types: Array<{ label: string; count: number }>
}
