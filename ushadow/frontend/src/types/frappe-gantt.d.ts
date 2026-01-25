declare module 'frappe-gantt' {
  export interface GanttTask {
    id: string
    name: string
    start: string
    end: string
    progress?: number
    dependencies?: string
    custom_class?: string
  }

  export interface GanttOptions {
    view_mode?: 'Day' | 'Week' | 'Month' | 'Year' | 'Quarter Day' | 'Half Day'
    bar_height?: number
    bar_corner_radius?: number
    arrow_curve?: number
    padding?: number
    date_format?: string
    language?: string
    custom_popup_html?: (task: GanttTask) => string
    popup_trigger?: 'click' | 'mouseover'
    on_click?: (task: GanttTask) => void
    on_date_change?: (task: GanttTask, start: Date, end: Date) => void
    on_progress_change?: (task: GanttTask, progress: number) => void
    on_view_change?: (mode: string) => void
  }

  export default class Gantt {
    constructor(element: string | HTMLElement, tasks: GanttTask[], options?: GanttOptions)
    change_view_mode(mode: string): void
    refresh(tasks: GanttTask[]): void
  }
}
