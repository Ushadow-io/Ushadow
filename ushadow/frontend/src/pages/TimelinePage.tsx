import { useState, useEffect, useRef } from 'react'
import { Calendar, RefreshCw, AlertCircle, ZoomIn, ZoomOut, Database } from 'lucide-react'
import Gantt from 'frappe-gantt'
import * as d3 from 'd3'
import { memoriesApi, type MemorySource } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import type { Memory } from '../types/memory'

// =============================================================================
// Types
// =============================================================================

interface TimeRange {
  start: string
  end: string
  name?: string
}

interface TimelineMetadata extends Record<string, unknown> {
  timeRanges?: TimeRange[]
  isPerson?: boolean
  isEvent?: boolean
  isPlace?: boolean
  name?: string
}

interface MemoryWithTimeRange extends Omit<Memory, 'metadata'> {
  metadata: TimelineMetadata
}

interface GanttTask {
  id: string
  name: string
  start: string
  end: string
  progress: number
  custom_class?: string
}

interface TimelineTask {
  id: string
  name: string
  start: Date
  end: Date
  color: string
  type: 'event' | 'person' | 'place'
}

type TimelineImplementation = 'frappe' | 'mycelia'

// =============================================================================
// Demo Data
// =============================================================================

const getDemoMemories = (): MemoryWithTimeRange[] => {
  return [
    {
      id: 'demo-graduation',
      memory: 'College graduation ceremony and celebration dinner with family.',
      created_at: new Date('2024-05-20T14:00:00').getTime(),
      state: 'active',
      metadata: {
        name: 'College Graduation',
        isEvent: true,
        timeRanges: [
          { name: 'Graduation Ceremony', start: '2024-05-20T14:00:00', end: '2024-05-20T17:00:00' },
          { name: 'Celebration Dinner', start: '2024-05-20T19:00:00', end: '2024-05-20T22:00:00' }
        ]
      },
      categories: [],
      client: 'api',
      app_name: 'demo',
    },
    {
      id: 'demo-wedding',
      memory: "Sarah and Tom's wedding was a beautiful celebration.",
      created_at: new Date('2025-06-15T15:00:00').getTime(),
      state: 'active',
      metadata: {
        name: "Sarah & Tom's Wedding",
        isEvent: true,
        timeRanges: [
          { name: 'Wedding Ceremony', start: '2025-06-15T15:00:00', end: '2025-06-15T16:30:00' },
          { name: 'Reception', start: '2025-06-15T18:00:00', end: '2025-06-16T00:00:00' }
        ]
      },
      categories: [],
      client: 'api',
      app_name: 'demo',
    },
    {
      id: 'demo-conference',
      memory: 'Tech conference with keynote and workshops',
      created_at: new Date('2025-09-20T09:00:00').getTime(),
      state: 'active',
      metadata: {
        name: 'Tech Conference 2025',
        isEvent: true,
        timeRanges: [
          { name: 'Morning Keynote', start: '2025-09-20T09:00:00', end: '2025-09-20T11:00:00' },
          { name: 'Workshops', start: '2025-09-20T13:00:00', end: '2025-09-20T17:00:00' }
        ]
      },
      categories: [],
      client: 'api',
      app_name: 'demo',
    },
    {
      id: 'demo-vacation',
      memory: 'Week-long vacation at the beach house with family.',
      created_at: new Date('2026-07-01T14:00:00').getTime(),
      state: 'active',
      metadata: {
        name: 'Summer Vacation 2026',
        isPlace: true,
        timeRanges: [
          { name: 'Beach House Stay', start: '2026-07-01T14:00:00', end: '2026-07-07T12:00:00' }
        ]
      },
      categories: [],
      client: 'api',
      app_name: 'demo',
    },
    {
      id: 'demo-reunion',
      memory: 'Family reunion at the old homestead.',
      created_at: new Date('2026-12-25T12:00:00').getTime(),
      state: 'active',
      metadata: {
        name: 'Family Reunion',
        isEvent: true,
        timeRanges: [
          { name: 'Christmas Gathering', start: '2026-12-25T12:00:00', end: '2026-12-25T20:00:00' }
        ]
      },
      categories: [],
      client: 'api',
      app_name: 'demo',
    }
  ]
}

// =============================================================================
// React Tooltip Component (safe alternative to innerHTML)
// =============================================================================

interface TooltipData {
  visible: boolean
  x: number
  y: number
  name: string
  startDate: string
  endDate: string
  content?: string
}

function Tooltip({ data }: { data: TooltipData }) {
  if (!data.visible) return null

  return (
    <div
      className="fixed pointer-events-none bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3 z-50"
      style={{ left: data.x + 10, top: data.y - 10, maxWidth: '300px' }}
      data-testid="timeline-tooltip"
    >
      <div className="font-semibold text-sm mb-1">{data.name}</div>
      <div className="text-xs text-gray-600 dark:text-gray-300">
        <div><strong>Start:</strong> {data.startDate}</div>
        <div><strong>End:</strong> {data.endDate}</div>
      </div>
      {data.content && (
        <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-300">
          {data.content}
        </div>
      )}
    </div>
  )
}

// =============================================================================
// Frappe Gantt Timeline Component
// =============================================================================

function FrappeGanttTimeline({
  memories,
  loading,
  error,
  useDemoData,
  onRefresh,
  onToggleDemo
}: {
  memories: MemoryWithTimeRange[]
  loading: boolean
  error: string | null
  useDemoData: boolean
  onRefresh: () => void
  onToggleDemo: () => void
}) {
  const [currentViewMode, setCurrentViewMode] = useState<string>('Week')
  const [zoomScale, setZoomScale] = useState(1)
  const [tooltip, setTooltip] = useState<TooltipData>({ visible: false, x: 0, y: 0, name: '', startDate: '', endDate: '' })
  const ganttContainerRef = useRef<HTMLDivElement>(null)
  const ganttInstance = useRef<Gantt | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  const startX = useRef(0)
  const scrollLeft = useRef(0)

  const convertMemoriesToGanttTasks = (mems: MemoryWithTimeRange[]): GanttTask[] => {
    const tasks: GanttTask[] = []
    mems.forEach((memory) => {
      const timeRanges = memory.metadata?.timeRanges || []
      timeRanges.forEach((range, index) => {
        const taskName = range.name || memory.metadata?.name || memory.memory.substring(0, 50)
        let customClass = 'default'
        if (memory.metadata?.isEvent) customClass = 'event'
        else if (memory.metadata?.isPerson) customClass = 'person'
        else if (memory.metadata?.isPlace) customClass = 'place'

        tasks.push({
          id: `${memory.id}-${index}`,
          name: taskName,
          start: range.start,
          end: range.end,
          progress: 100,
          custom_class: customClass
        })
      })
    })
    return tasks
  }

  useEffect(() => {
    const displayMemories = useDemoData ? getDemoMemories() : memories
    if (!ganttContainerRef.current || displayMemories.length === 0) return

    const tasks = convertMemoriesToGanttTasks(displayMemories)
    if (tasks.length === 0) return

    try {
      if (ganttInstance.current) {
        ganttContainerRef.current.innerHTML = ''
      }

      // Note: Frappe Gantt requires custom_popup_html but we'll disable popups
      // and use our React tooltip instead by handling bar clicks/hovers manually
      ganttInstance.current = new Gantt(ganttContainerRef.current, tasks, {
        view_mode: currentViewMode as 'Day' | 'Week' | 'Month' | 'Year',
        bar_height: 30,
        bar_corner_radius: 3,
        arrow_curve: 5,
        padding: 18,
        date_format: 'YYYY-MM-DD',
        language: 'en',
        popup_trigger: 'click', // Only show on click, not hover
        on_click: (task: GanttTask) => {
          const memory = displayMemories.find(m => task.id.startsWith(m.id))
          const startDate = new Date(task.start)
          const endDate = new Date(task.end)
          const fmt: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }

          // Find the clicked element position for tooltip
          const bar = ganttContainerRef.current?.querySelector(`[data-id="${task.id}"]`)
          if (bar) {
            const rect = bar.getBoundingClientRect()
            setTooltip({
              visible: true,
              x: rect.right,
              y: rect.top,
              name: task.name,
              startDate: startDate.toLocaleDateString('en-US', fmt),
              endDate: endDate.toLocaleDateString('en-US', fmt),
              content: memory?.memory
            })
          }
        }
      } as any)

      // Add click-away listener to close tooltip
      const handleClickAway = (e: MouseEvent) => {
        if (!(e.target as Element).closest('.bar-wrapper')) {
          setTooltip(prev => ({ ...prev, visible: false }))
        }
      }
      document.addEventListener('click', handleClickAway)

      return () => {
        document.removeEventListener('click', handleClickAway)
      }
    } catch (err) {
      console.error('Error creating Gantt chart:', err)
    }

    return () => {
      if (ganttInstance.current && ganttContainerRef.current) {
        ganttContainerRef.current.innerHTML = ''
        ganttInstance.current = null
      }
    }
  }, [memories, useDemoData, currentViewMode])

  // Drag-to-scroll
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('.bar-wrapper') || target.closest('button')) return
      isDragging.current = true
      startX.current = e.pageX
      scrollLeft.current = container.scrollLeft
      container.style.cursor = 'grabbing'
      e.preventDefault()
    }
    const handleMouseLeave = () => { isDragging.current = false; container.style.cursor = 'grab' }
    const handleMouseUp = () => { isDragging.current = false; container.style.cursor = 'grab' }
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return
      e.preventDefault()
      container.scrollLeft = scrollLeft.current - (e.pageX - startX.current) * 1.5
    }

    container.addEventListener('mousedown', handleMouseDown, true)
    container.addEventListener('mouseleave', handleMouseLeave)
    container.addEventListener('mouseup', handleMouseUp)
    container.addEventListener('mousemove', handleMouseMove)

    return () => {
      container.removeEventListener('mousedown', handleMouseDown, true)
      container.removeEventListener('mouseleave', handleMouseLeave)
      container.removeEventListener('mouseup', handleMouseUp)
      container.removeEventListener('mousemove', handleMouseMove)
    }
  }, [])

  const viewModes = [
    { value: 'Quarter Day', label: 'Quarter Day' },
    { value: 'Half Day', label: 'Half Day' },
    { value: 'Day', label: 'Day' },
    { value: 'Week', label: 'Week' },
    { value: 'Month', label: 'Month' }
  ]

  const zoomIn = () => setZoomScale(prev => Math.min(prev + 0.25, 3))
  const zoomOut = () => setZoomScale(prev => Math.max(prev - 0.25, 0.5))

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12" data-testid="timeline-frappe-loading">
        <RefreshCw className="h-5 w-5 animate-spin mr-3" />
        <span>Loading timeline data...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12 text-red-500" data-testid="timeline-frappe-error">
        <AlertCircle className="h-5 w-5 mr-3" />
        <span>{error}</span>
      </div>
    )
  }

  const displayMemories = useDemoData ? getDemoMemories() : memories

  if (displayMemories.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4" data-testid="timeline-frappe-empty">
        <Calendar className="h-16 w-16 text-gray-300 dark:text-gray-600" />
        <div className="text-center">
          <h3 className="text-lg font-medium mb-2">No Timeline Events</h3>
          <p className="text-gray-500 dark:text-gray-400">
            No memories with time information found. Try the demo to see how it works.
          </p>
        </div>
        <button
          onClick={onToggleDemo}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          data-testid="timeline-frappe-show-demo-btn"
        >
          Show Demo
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4" data-testid="timeline-frappe-container">
      {/* React-based tooltip */}
      <Tooltip data={tooltip} />

      {/* Controls */}
      <div className="flex items-center justify-end space-x-3">
        <button
          onClick={onToggleDemo}
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
            useDemoData
              ? 'bg-gray-600 text-white hover:bg-gray-700'
              : 'bg-green-600 text-white hover:bg-green-700'
          }`}
          data-testid="timeline-frappe-toggle-demo-btn"
        >
          <Calendar className="h-4 w-4" />
          <span>{useDemoData ? 'Show Real Data' : 'Show Demo'}</span>
        </button>

        <div className="flex items-center border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
          <button
            onClick={zoomIn}
            disabled={zoomScale >= 3}
            className="px-3 py-2 bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 disabled:opacity-50"
            data-testid="timeline-frappe-zoom-in-btn"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <div className="px-2 bg-white dark:bg-gray-700 text-sm font-medium min-w-[3.5rem] text-center">
            {Math.round(zoomScale * 100)}%
          </div>
          <button
            onClick={zoomOut}
            disabled={zoomScale <= 0.5}
            className="px-3 py-2 bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 disabled:opacity-50"
            data-testid="timeline-frappe-zoom-out-btn"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
        </div>

        <select
          value={currentViewMode}
          onChange={(e) => setCurrentViewMode(e.target.value)}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
          data-testid="timeline-frappe-view-mode-select"
        >
          {viewModes.map(mode => (
            <option key={mode.value} value={mode.value}>{mode.label}</option>
          ))}
        </select>

        <button
          onClick={onRefresh}
          className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          data-testid="timeline-frappe-refresh-btn"
        >
          <RefreshCw className="h-4 w-4" />
          <span>Refresh</span>
        </button>
      </div>

      {/* Gantt Chart */}
      <div
        ref={scrollContainerRef}
        className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 overflow-auto"
        style={{ cursor: 'grab', minHeight: `${Math.min(200 * zoomScale, 500)}px`, maxHeight: '600px' }}
        data-testid="timeline-frappe-chart"
      >
        <div
          ref={ganttContainerRef}
          style={{ transform: `scale(${zoomScale})`, transformOrigin: 'top left', transition: 'transform 0.2s' }}
        />
      </div>

      {/* Help text */}
      <div className="flex items-center justify-center space-x-6 text-xs text-gray-500 dark:text-gray-400">
        <span>💡 Drag to scroll horizontally</span>
        <span>🔍 Use zoom controls to adjust scale</span>
        <span>🖱️ Click bars for details</span>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center space-x-6 text-sm">
        <div className="flex items-center space-x-2">
          <div className="w-4 h-4 bg-blue-500 rounded"></div>
          <span>Event</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-4 h-4 bg-green-500 rounded"></div>
          <span>Person</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-4 h-4 bg-orange-500 rounded"></div>
          <span>Place</span>
        </div>
      </div>

      {/* Gantt chart custom styles */}
      <style>{`
        .gantt .bar-wrapper .bar.event { fill: #3b82f6; }
        .gantt .bar-wrapper .bar.person { fill: #10b981; }
        .gantt .bar-wrapper .bar.place { fill: #f97316; }
        .gantt .bar-wrapper .bar.default { fill: #6b7280; }
        .dark .gantt { background: #1f2937; }
        .dark .gantt .grid-row { fill: transparent; }
        .dark .gantt .grid-row:nth-child(even) { fill: rgba(255, 255, 255, 0.02); }
        .dark .gantt .row-line { stroke: #374151; }
        .dark .gantt .tick { stroke: #374151; }
        .dark .gantt text { fill: #d1d5db; }
        .gantt .popup-wrapper { display: none; }
      `}</style>
    </div>
  )
}

// =============================================================================
// Mycelia D3 Timeline Component
// =============================================================================

function MyceliaTimeline({
  memories,
  loading,
  error,
  useDemoData,
  onRefresh,
  onToggleDemo
}: {
  memories: MemoryWithTimeRange[]
  loading: boolean
  error: string | null
  useDemoData: boolean
  onRefresh: () => void
  onToggleDemo: () => void
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 1000, height: 400 })
  const [tooltip, setTooltip] = useState<TooltipData>({ visible: false, x: 0, y: 0, name: '', startDate: '', endDate: '' })

  const convertToTasks = (mems: MemoryWithTimeRange[]): TimelineTask[] => {
    const tasks: TimelineTask[] = []
    mems.forEach((memory) => {
      const timeRanges = memory.metadata?.timeRanges || []
      timeRanges.forEach((range, index) => {
        let type: 'event' | 'person' | 'place' = 'event'
        let color = '#3b82f6'
        if (memory.metadata?.isEvent) { type = 'event'; color = '#3b82f6' }
        else if (memory.metadata?.isPerson) { type = 'person'; color = '#10b981' }
        else if (memory.metadata?.isPlace) { type = 'place'; color = '#f59e0b' }

        tasks.push({
          id: `${memory.id}-${index}`,
          name: range.name || memory.metadata?.name || memory.memory.substring(0, 30),
          start: new Date(range.start),
          end: new Date(range.end),
          color,
          type
        })
      })
    })
    return tasks
  }

  // Handle container resize
  useEffect(() => {
    if (!containerRef.current) return
    const resizeObserver = new ResizeObserver(([entry]) => {
      setDimensions({ width: entry.contentRect.width, height: 400 })
    })
    resizeObserver.observe(containerRef.current)
    return () => resizeObserver.disconnect()
  }, [])

  // D3 visualization
  useEffect(() => {
    const displayMemories = useDemoData ? getDemoMemories() : memories
    if (!svgRef.current || displayMemories.length === 0) return

    const tasks = convertToTasks(displayMemories)
    if (tasks.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const margin = { top: 60, right: 40, bottom: 60, left: 150 }
    const width = dimensions.width - margin.left - margin.right
    const height = dimensions.height - margin.top - margin.bottom

    const allDates = tasks.flatMap(t => [t.start, t.end])
    const minDate = d3.min(allDates)!
    const maxDate = d3.max(allDates)!

    const xScale = d3.scaleTime().domain([minDate, maxDate]).range([0, width])
    const yScale = d3.scaleBand().domain(tasks.map(t => t.id)).range([0, height]).padding(0.3)

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)
      .attr('class', 'zoomable')

    // X axis
    const xAxis = d3.axisBottom(xScale).ticks(6).tickFormat(d3.timeFormat('%b %d, %Y') as any)
    g.append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${height})`)
      .call(xAxis)
      .selectAll('text')
      .style('fill', 'currentColor')

    // Bars
    const bars = g.append('g').attr('class', 'bars').selectAll('rect').data(tasks).enter()

    bars.append('rect')
      .attr('x', d => xScale(d.start))
      .attr('y', d => yScale(d.id)!)
      .attr('width', d => Math.max(2, xScale(d.end) - xScale(d.start)))
      .attr('height', yScale.bandwidth())
      .attr('fill', d => d.color)
      .attr('rx', 4)
      .style('opacity', 0.8)
      .style('cursor', 'pointer')
      .on('mouseover', function(event, d) {
        d3.select(this).style('opacity', 1)
        const fmt: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
        setTooltip({
          visible: true,
          x: event.clientX,
          y: event.clientY,
          name: d.name,
          startDate: d.start.toLocaleDateString('en-US', fmt),
          endDate: d.end.toLocaleDateString('en-US', fmt)
        })
      })
      .on('mousemove', function(event) {
        setTooltip(prev => ({ ...prev, x: event.clientX, y: event.clientY }))
      })
      .on('mouseout', function() {
        d3.select(this).style('opacity', 0.8)
        setTooltip(prev => ({ ...prev, visible: false }))
      })

    // Labels
    g.append('g').attr('class', 'labels')
      .selectAll('text').data(tasks).enter()
      .append('text')
      .attr('x', -10)
      .attr('y', d => yScale(d.id)! + yScale.bandwidth() / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', 'end')
      .text(d => d.name)
      .style('fill', 'currentColor')
      .style('font-size', '12px')

    // Zoom
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 5])
      .on('zoom', (event) => {
        const newXScale = event.transform.rescaleX(xScale)
        g.select<SVGGElement>('.x-axis').call(
          d3.axisBottom(newXScale).ticks(6).tickFormat(d3.timeFormat('%b %d, %Y') as any) as any
        )
        g.selectAll<SVGRectElement, TimelineTask>('.bars rect')
          .attr('x', d => newXScale(d.start))
          .attr('width', d => Math.max(2, newXScale(d.end) - newXScale(d.start)))
      })

    svg.call(zoom as any)
  }, [memories, dimensions, useDemoData])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12" data-testid="timeline-mycelia-loading">
        <RefreshCw className="h-5 w-5 animate-spin mr-3" />
        <span>Loading timeline data...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12 text-red-500" data-testid="timeline-mycelia-error">
        <AlertCircle className="h-5 w-5 mr-3" />
        <span>{error}</span>
      </div>
    )
  }

  const displayMemories = useDemoData ? getDemoMemories() : memories

  if (displayMemories.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4" data-testid="timeline-mycelia-empty">
        <Calendar className="h-16 w-16 text-gray-300 dark:text-gray-600" />
        <div className="text-center">
          <h3 className="text-lg font-medium mb-2">No Timeline Events</h3>
          <p className="text-gray-500 dark:text-gray-400">
            No memories with time information found. Try the demo to see how it works.
          </p>
        </div>
        <button
          onClick={onToggleDemo}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          data-testid="timeline-mycelia-show-demo-btn"
        >
          Show Demo
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4 relative" data-testid="timeline-mycelia-container">
      {/* React-based tooltip */}
      <Tooltip data={tooltip} />

      {/* Controls */}
      <div className="flex items-center justify-end space-x-3">
        <button
          onClick={onToggleDemo}
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
            useDemoData
              ? 'bg-gray-600 text-white hover:bg-gray-700'
              : 'bg-green-600 text-white hover:bg-green-700'
          }`}
          data-testid="timeline-mycelia-toggle-demo-btn"
        >
          <Calendar className="h-4 w-4" />
          <span>{useDemoData ? 'Show Real Data' : 'Show Demo'}</span>
        </button>
        <button
          onClick={onRefresh}
          className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          data-testid="timeline-mycelia-refresh-btn"
        >
          <RefreshCw className="h-4 w-4" />
          <span>Refresh</span>
        </button>
      </div>

      {/* D3 Chart */}
      <div
        ref={containerRef}
        className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4"
        data-testid="timeline-mycelia-chart"
      >
        <svg
          ref={svgRef}
          width={dimensions.width}
          height={dimensions.height}
          className="w-full"
          style={{ touchAction: 'none', userSelect: 'none' }}
        />
      </div>

      {/* Help text */}
      <div className="flex items-center justify-center space-x-6 text-xs text-gray-500 dark:text-gray-400">
        <span>💡 Scroll to zoom, drag to pan</span>
        <span>👆 Hover for info</span>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center space-x-6 text-sm">
        <div className="flex items-center space-x-2">
          <div className="w-4 h-4 bg-blue-500 rounded"></div>
          <span>Event</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-4 h-4 bg-green-500 rounded"></div>
          <span>Person</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-4 h-4 bg-orange-500 rounded"></div>
          <span>Place</span>
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// Main Timeline Page Component
// =============================================================================

export default function TimelinePage() {
  const [memories, setMemories] = useState<MemoryWithTimeRange[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [useDemoData, setUseDemoData] = useState(false)
  const [activeImplementation, setActiveImplementation] = useState<TimelineImplementation>('frappe')
  const [memorySource, setMemorySource] = useState<MemorySource>('openmemory')
  const { user } = useAuth()

  const loadMemories = async () => {
    if (!user?.id) return

    try {
      setLoading(true)
      setError(null)
      const result = await memoriesApi.fetchMemories(user.id, undefined, 1, 100, undefined, memorySource)

      // Filter memories that have timeRanges in metadata
      const memoriesWithTime = result.memories.filter((m): m is MemoryWithTimeRange => {
        const meta = m.metadata as TimelineMetadata | undefined
        return Boolean(meta?.timeRanges && Array.isArray(meta.timeRanges) && meta.timeRanges.length > 0)
      })

      setMemories(memoriesWithTime)
    } catch (err: any) {
      console.error('Timeline loading error:', err)
      setError(err.message || 'Failed to load timeline data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!useDemoData) {
      loadMemories()
    } else {
      setMemories(getDemoMemories())
    }
  }, [user?.id, useDemoData, memorySource])

  const handleToggleDemo = () => {
    setUseDemoData(!useDemoData)
  }

  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="timeline-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2" data-testid="timeline-page-title">
            <Calendar className="w-8 h-8" />
            Timeline
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Visualize your memories on an interactive timeline
          </p>
        </div>

        {/* Memory Source Toggle */}
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-gray-500 dark:text-gray-400" />
          <select
            value={memorySource}
            onChange={(e) => setMemorySource(e.target.value as MemorySource)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
            data-testid="timeline-source-select"
          >
            <option value="openmemory">OpenMemory</option>
            <option value="mycelia">Mycelia</option>
          </select>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex space-x-8" aria-label="Timeline implementations" data-testid="timeline-tabs">
          <button
            onClick={() => setActiveImplementation('frappe')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeImplementation === 'frappe'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400'
            }`}
            data-testid="tab-frappe"
          >
            Frappe Gantt
            <span className="ml-2 text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
              Default
            </span>
          </button>
          <button
            onClick={() => setActiveImplementation('mycelia')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeImplementation === 'mycelia'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400'
            }`}
            data-testid="tab-mycelia"
          >
            Mycelia D3
            <span className="ml-2 text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-1 rounded">
              Interactive
            </span>
          </button>
        </nav>
      </div>

      {/* Timeline Implementation */}
      <div data-testid="timeline-content">
        {activeImplementation === 'frappe' && (
          <FrappeGanttTimeline
            memories={memories}
            loading={loading}
            error={error}
            useDemoData={useDemoData}
            onRefresh={loadMemories}
            onToggleDemo={handleToggleDemo}
          />
        )}
        {activeImplementation === 'mycelia' && (
          <MyceliaTimeline
            memories={memories}
            loading={loading}
            error={error}
            useDemoData={useDemoData}
            onRefresh={loadMemories}
            onToggleDemo={handleToggleDemo}
          />
        )}
      </div>
    </div>
  )
}
