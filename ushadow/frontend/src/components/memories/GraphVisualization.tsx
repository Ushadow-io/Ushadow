/**
 * GraphVisualization Component
 *
 * Interactive knowledge graph visualization using Neo4j NVL.
 * Shows memory nodes and their relationships.
 */

import { useRef, useState } from 'react'
import { InteractiveNvlWrapper } from '@neo4j-nvl/react'
import type { NvlOptions } from '@neo4j-nvl/base'
import {
  Search,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Loader2,
  X,
} from 'lucide-react'
import type { GraphNode, GraphRelationship } from '../../types/graph'

interface GraphVisualizationProps {
  nodes: GraphNode[]
  relationships: GraphRelationship[]
  loading?: boolean
  onSearch?: (query: string) => void
}

export function GraphVisualization({
  nodes,
  relationships,
  loading = false,
  onSearch,
}: GraphVisualizationProps) {
  const nvlRef = useRef<any>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)

  // Convert our data format to NVL format
  const nvlNodes = nodes.map((node) => {
    // Try to find a good caption from properties
    const captionText =
      (node.properties.name as string) ||
      (node.properties.title as string) ||
      (node.properties.user_id as string) ||
      node.labels[0] ||
      'Node'

    const captionStr = String(captionText)
    const captionLength = captionStr.length

    // Calculate node size based on caption length
    const baseSize = 30
    const sizeMultiplier = Math.max(1, Math.min(3, captionLength / 10))

    // Format caption for display (handle underscores)
    const maxLineLength = 15
    let displayCaption = captionStr

    if (captionLength > maxLineLength && captionStr.includes('_')) {
      const parts = captionStr.split('_')
      const lines: string[] = []
      let currentLine = ''

      for (const part of parts) {
        if (!part) continue
        const separator = currentLine ? ' ' : ''
        const testLine = currentLine + separator + part

        if (testLine.length > maxLineLength && currentLine.length > 0) {
          lines.push(currentLine)
          currentLine = part
        } else {
          currentLine = testLine
        }
      }

      if (currentLine) {
        lines.push(currentLine)
      }

      displayCaption = lines.join('\n')
    } else if (captionStr.includes('_')) {
      displayCaption = captionStr.replace(/_/g, ' ')
    }

    return {
      id: node.id,
      labels: node.labels,
      properties: node.properties,
      caption: displayCaption,
      size: baseSize * sizeMultiplier,
    }
  })

  const nvlRelationships = relationships.map((rel) => ({
    id: rel.id,
    from: rel.source,
    to: rel.target,
    type: rel.type,
    properties: rel.properties,
    caption: rel.type,
  }))

  const nvlOptions: NvlOptions = {
    layout: 'd3Force',
    initialZoom: 0.8,
    allowDynamicMinZoom: true,
    maxZoom: 3,
    minZoom: 0.05,
    instanceId: 'memory-graph-viz',
    renderer: 'canvas', // Use canvas for better text rendering
  }

  const handleNodeClick = (node: any) => {
    const originalNode = nodes.find((n) => n.id === node.id)
    if (originalNode) {
      setSelectedNode(originalNode)
    }
  }

  const handleSearch = () => {
    if (searchQuery && onSearch) {
      onSearch(searchQuery)
    }
  }

  const handleZoomIn = () => {
    if (nvlRef.current) {
      const currentZoom = nvlRef.current.getZoom?.() || 1
      nvlRef.current.setZoom?.(currentZoom * 1.2)
    }
  }

  const handleZoomOut = () => {
    if (nvlRef.current) {
      const currentZoom = nvlRef.current.getZoom?.() || 1
      nvlRef.current.setZoom?.(currentZoom * 0.8)
    }
  }

  const handleFitToView = () => {
    if (nvlRef.current) {
      const allNodeIds = nodes.map((n) => n.id)
      if (allNodeIds.length > 0) {
        nvlRef.current.zoomToNodes?.(allNodeIds)
      }
    }
  }

  return (
    <div data-testid="graph-visualization" className="flex gap-4 h-full">
      {/* Main Graph Area */}
      <div className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg relative overflow-hidden">
        {/* Search Bar */}
        <div className="absolute top-4 left-4 z-10 flex gap-2">
          <input
            type="text"
            data-testid="graph-search-input"
            placeholder="Search nodes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="w-64 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
          />
          <button
            data-testid="graph-search-btn"
            onClick={handleSearch}
            disabled={!searchQuery || loading}
            className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg hover:bg-zinc-700 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
            ) : (
              <Search className="w-4 h-4 text-zinc-400" />
            )}
          </button>
        </div>

        {/* Zoom Controls */}
        <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
          <button
            data-testid="graph-zoom-in"
            onClick={handleZoomIn}
            className="p-2 bg-zinc-800 border border-zinc-700 rounded-lg hover:bg-zinc-700"
            title="Zoom in"
          >
            <ZoomIn className="w-4 h-4 text-zinc-400" />
          </button>
          <button
            data-testid="graph-zoom-out"
            onClick={handleZoomOut}
            className="p-2 bg-zinc-800 border border-zinc-700 rounded-lg hover:bg-zinc-700"
            title="Zoom out"
          >
            <ZoomOut className="w-4 h-4 text-zinc-400" />
          </button>
          <button
            data-testid="graph-fit-view"
            onClick={handleFitToView}
            className="p-2 bg-zinc-800 border border-zinc-700 rounded-lg hover:bg-zinc-700"
            title="Fit to view"
          >
            <Maximize2 className="w-4 h-4 text-zinc-400" />
          </button>
        </div>

        {/* Graph Visualization */}
        <div className="w-full h-full min-h-[500px] flex flex-col">
          {loading && (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
            </div>
          )}
          {!loading && nodes.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <p className="text-zinc-400">No graph data available</p>
            </div>
          )}
          {!loading && nodes.length > 0 && (
            <>
              <div className="p-4 text-sm text-zinc-400">
                {nvlNodes.length} nodes, {nvlRelationships.length} relationships
              </div>
              <div className="flex-1 min-h-0" style={{ position: 'relative' }}>
                <InteractiveNvlWrapper
                  ref={nvlRef}
                  nodes={nvlNodes}
                  rels={nvlRelationships}
                  nvlOptions={nvlOptions}
                  mouseEventCallbacks={{
                    onNodeClick: handleNodeClick,
                    onPan: () => true,
                    onZoom: () => true,
                  }}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Node Details Panel */}
      {selectedNode && (
        <div
          data-testid="node-details-panel"
          className="w-80 bg-zinc-900 border border-zinc-700 rounded-lg p-4 overflow-auto"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Node Details</h3>
              <button
                onClick={() => setSelectedNode(null)}
                className="p-1 hover:bg-zinc-800 rounded"
              >
                <X className="w-4 h-4 text-zinc-400" />
              </button>
            </div>

            <div>
              <h4 className="text-sm font-medium text-zinc-400 mb-2">Labels</h4>
              <div className="flex gap-2 flex-wrap">
                {selectedNode.labels.map((label) => (
                  <span
                    key={label}
                    className="px-2 py-1 bg-zinc-800 text-zinc-300 rounded text-xs"
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-sm font-medium text-zinc-400 mb-2">Properties</h4>
              <div className="space-y-2">
                {Object.entries(selectedNode.properties).map(([key, value]) => (
                  <div key={key} className="text-sm">
                    <span className="text-zinc-500">{key}:</span>
                    <span className="text-zinc-300 ml-2 break-words">
                      {typeof value === 'object'
                        ? JSON.stringify(value)
                        : String(value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
