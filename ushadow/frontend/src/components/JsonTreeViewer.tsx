/**
 * Collapsible JSON tree viewer component.
 * Displays JSON objects with expandable/collapsible nodes.
 */

import { useState, useCallback } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'

interface JsonTreeViewerProps {
  data: unknown
  initialExpandDepth?: number
  className?: string
}

interface JsonNodeProps {
  keyName: string | null
  value: unknown
  depth: number
  initialExpandDepth: number
  isLast: boolean
}

function JsonNode({ keyName, value, depth, initialExpandDepth, isLast }: JsonNodeProps) {
  const [isExpanded, setIsExpanded] = useState(depth < initialExpandDepth)

  const isObject = value !== null && typeof value === 'object'
  const isArray = Array.isArray(value)
  const isEmpty = isObject && Object.keys(value as object).length === 0

  const toggleExpand = useCallback(() => {
    if (isObject && !isEmpty) {
      setIsExpanded(prev => !prev)
    }
  }, [isObject, isEmpty])

  // Render primitive values
  const renderValue = (val: unknown): JSX.Element => {
    if (val === null) {
      return <span className="text-neutral-500 italic">null</span>
    }
    if (val === undefined) {
      return <span className="text-neutral-500 italic">undefined</span>
    }
    if (typeof val === 'string') {
      return <span className="text-emerald-400">"{val}"</span>
    }
    if (typeof val === 'number') {
      return <span className="text-amber-400">{val}</span>
    }
    if (typeof val === 'boolean') {
      return <span className="text-purple-400">{val.toString()}</span>
    }
    return <span>{String(val)}</span>
  }

  // Calculate indent
  const indent = depth * 16

  // Empty object/array
  if (isObject && isEmpty) {
    return (
      <div className="font-mono text-xs" style={{ paddingLeft: indent }}>
        {keyName !== null && (
          <>
            <span className="text-sky-400">{keyName}</span>
            <span className="text-neutral-500">: </span>
          </>
        )}
        <span className="text-neutral-400">{isArray ? '[]' : '{}'}</span>
        {!isLast && <span className="text-neutral-500">,</span>}
      </div>
    )
  }

  // Object or array
  if (isObject) {
    const entries = Object.entries(value as object)
    const bracket = isArray ? ['[', ']'] : ['{', '}']

    return (
      <div className="font-mono text-xs">
        <div
          className="flex items-center cursor-pointer hover:bg-neutral-700/30 rounded"
          style={{ paddingLeft: indent }}
          onClick={toggleExpand}
        >
          <span className="w-4 h-4 flex items-center justify-center text-neutral-500">
            {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </span>
          {keyName !== null && (
            <>
              <span className="text-sky-400">{keyName}</span>
              <span className="text-neutral-500">: </span>
            </>
          )}
          <span className="text-neutral-400">{bracket[0]}</span>
          {!isExpanded && (
            <>
              <span className="text-neutral-500 mx-1">
                {isArray ? `${entries.length} items` : `${entries.length} keys`}
              </span>
              <span className="text-neutral-400">{bracket[1]}</span>
              {!isLast && <span className="text-neutral-500">,</span>}
            </>
          )}
        </div>

        {isExpanded && (
          <>
            {entries.map(([k, v], idx) => (
              <JsonNode
                key={k}
                keyName={isArray ? null : k}
                value={v}
                depth={depth + 1}
                initialExpandDepth={initialExpandDepth}
                isLast={idx === entries.length - 1}
              />
            ))}
            <div style={{ paddingLeft: indent }}>
              <span className="text-neutral-400 ml-4">{bracket[1]}</span>
              {!isLast && <span className="text-neutral-500">,</span>}
            </div>
          </>
        )}
      </div>
    )
  }

  // Primitive value
  return (
    <div className="font-mono text-xs" style={{ paddingLeft: indent }}>
      <span className="w-4 inline-block" />
      {keyName !== null && (
        <>
          <span className="text-sky-400">{keyName}</span>
          <span className="text-neutral-500">: </span>
        </>
      )}
      {renderValue(value)}
      {!isLast && <span className="text-neutral-500">,</span>}
    </div>
  )
}

export function JsonTreeViewer({ data, initialExpandDepth = 1, className = '' }: JsonTreeViewerProps) {
  return (
    <div className={`bg-neutral-900 rounded-lg p-4 overflow-auto ${className}`}>
      <JsonNode
        keyName={null}
        value={data}
        depth={0}
        initialExpandDepth={initialExpandDepth}
        isLast={true}
      />
    </div>
  )
}
