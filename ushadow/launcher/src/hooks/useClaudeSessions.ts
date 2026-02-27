import { useState, useEffect, useCallback } from 'react'
import { tauri, type ClaudeSessionEvent, type UshadowEnvironment } from './useTauri'

/** Mirrors Claude Island's status model */
export type ClaudeSessionStatus =
  | 'Processing'      // Claude received input / digesting tool output
  | 'Working'         // Actively running a tool (PreToolUse in-flight)
  | 'WaitingForInput' // Idle, waiting for user (Stop, SessionStart, idle_prompt)
  | 'WaitingForApproval' // Permission needed (PermissionRequest)
  | 'Compacting'      // Context compaction in progress
  | 'Ended'           // SessionEnd — session is truly over

export interface ClaudeSession {
  session_id: string
  cwd: string
  status: ClaudeSessionStatus
  last_event_at: string
  started_at: string
  /** What the user asked Claude to do (from UserPromptSubmit) */
  user_message: string | null
  /** Tool currently/last running */
  current_tool: string | null
  /** Human-readable description of the tool action */
  current_tool_description: string | null
  /** File path involved, for Read/Edit/Write/Glob */
  current_tool_path: string | null
  /** Latest notification/stop message */
  last_message: string | null
  /** Matched environment, if any */
  environment: UshadowEnvironment | null
  /** 20 most recent events for the detail view */
  events: ClaudeSessionEvent[]
}

function deriveStatus(events: ClaudeSessionEvent[]): ClaudeSessionStatus {
  if (events.length === 0) return 'WaitingForInput'

  const last = events[events.length - 1]
  const nowMs = Date.now()

  if (last.event_type === 'SessionEnd') return 'Ended'
  if (last.event_type === 'PreCompact') return 'Compacting'

  // Idle notification = waiting for user input
  const lastNotif = [...events].reverse().find(e => e.event_type === 'Notification')
  if (lastNotif) {
    const d = lastNotif.data as { type?: string }
    if (d?.type === 'permission_prompt') return 'WaitingForApproval'
    if (d?.type === 'idle_prompt') {
      // Only "waiting" if idle_prompt came after the last tool use
      const lastTool = [...events].reverse().find(e => e.event_type === 'PreToolUse')
      const notifTime = new Date(lastNotif.timestamp).getTime()
      const toolTime = lastTool ? new Date(lastTool.timestamp).getTime() : 0
      if (notifTime >= toolTime) return 'WaitingForInput'
    }
  }

  if (last.event_type === 'Stop' || last.event_type === 'SubagentStop') return 'WaitingForInput'
  if (last.event_type === 'SessionStart') return 'WaitingForInput'

  // PreToolUse without a matching PostToolUse = tool still running
  const lastPre = [...events].reverse().find(e => e.event_type === 'PreToolUse')
  const lastPost = [...events].reverse().find(e => e.event_type === 'PostToolUse')
  if (lastPre) {
    const preTime = new Date(lastPre.timestamp).getTime()
    const postTime = lastPost ? new Date(lastPost.timestamp).getTime() : 0
    const preAge = nowMs - preTime
    if (preTime > postTime && preAge < 5 * 60_000) return 'Working'
    // PostToolUse happened after PreToolUse → Claude is processing the result
    if (postTime >= preTime) {
      const postAge = nowMs - postTime
      if (postAge < 5 * 60_000) return 'Processing'
    }
  }

  // UserPromptSubmit recently = Claude is processing
  const lastPrompt = [...events].reverse().find(e => e.event_type === 'UserPromptSubmit')
  if (lastPrompt) {
    const ageMs = nowMs - new Date(lastPrompt.timestamp).getTime()
    if (ageMs < 5 * 60_000) return 'Processing'
  }

  return 'WaitingForInput'
}

function buildSession(
  session_id: string,
  events: ClaudeSessionEvent[],
  environments: UshadowEnvironment[]
): ClaudeSession {
  const sorted = [...events].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )

  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const cwd = first?.cwd ?? ''

  // Longest prefix match wins (handles nested worktrees)
  const environment =
    environments
      .filter(env => env.path && cwd.startsWith(env.path))
      .sort((a, b) => (b.path?.length ?? 0) - (a.path?.length ?? 0))[0] ?? null

  // Most recent user message (what the user asked Claude to do)
  const lastPromptEvent = [...sorted].reverse().find(e => e.event_type === 'UserPromptSubmit')
  const user_message = (lastPromptEvent?.data as { message?: string })?.message ?? null

  // Most recent tool event
  const lastToolEvent = [...sorted].reverse().find(e => e.event_type === 'PreToolUse')
  const toolData = lastToolEvent?.data as { tool?: string; description?: string; path?: string } | undefined
  const current_tool = toolData?.tool ?? null
  const current_tool_description = toolData?.description ?? null
  const current_tool_path = toolData?.path ?? null

  // Latest notification/stop message
  const lastMessageEvent = [...sorted]
    .reverse()
    .find(e => e.event_type === 'Notification' || e.event_type === 'Stop')
  const last_message = lastMessageEvent
    ? ((lastMessageEvent.data as { message?: string; last_message?: string })?.message ??
       (lastMessageEvent.data as { last_message?: string })?.last_message ??
       null)
    : null

  return {
    session_id,
    cwd,
    status: deriveStatus(sorted),
    last_event_at: last?.timestamp ?? first?.timestamp ?? '',
    started_at: first?.timestamp ?? '',
    user_message,
    current_tool,
    current_tool_description,
    current_tool_path,
    last_message,
    environment,
    events: sorted.slice(-20),
  }
}

export function useClaudeSessions(
  projectRoot: string,
  environments: UshadowEnvironment[],
  enabled = true
) {
  const [sessions, setSessions] = useState<ClaudeSession[]>([])
  const [hooksInstalled, setHooksInstalled] = useState<boolean | null>(null)
  const [installing, setInstalling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [installSuccess, setInstallSuccess] = useState<string | null>(null)

  const checkHooks = useCallback(async () => {
    try {
      const installed = await tauri.getHooksInstalled()
      setHooksInstalled(installed)
    } catch {
      setHooksInstalled(false)
    }
  }, [])

  const installHooks = useCallback(async () => {
    setInstalling(true)
    setError(null)
    setInstallSuccess(null)
    try {
      const msg = await tauri.installClaudeHooks()
      setHooksInstalled(true)
      setInstallSuccess(msg ?? 'Hooks updated')
    } catch (e) {
      setError(String(e))
    } finally {
      setInstalling(false)
    }
  }, [])

  const fetchSessions = useCallback(async () => {
    if (!enabled) return
    try {
      const events = await tauri.readClaudeSessions(projectRoot)

      const grouped = new Map<string, ClaudeSessionEvent[]>()
      for (const event of events) {
        if (!grouped.has(event.session_id)) grouped.set(event.session_id, [])
        grouped.get(event.session_id)!.push(event)
      }

      const built = Array.from(grouped.entries()).map(([id, evts]) =>
        buildSession(id, evts, environments)
      )

      // Sort: waiting-for-attention first, then by most recent state change
      built.sort((a, b) => {
        const order: Record<ClaudeSessionStatus, number> = {
          WaitingForApproval: 0, WaitingForInput: 1,
          Working: 2, Processing: 3, Compacting: 4, Ended: 5,
        }
        const diff = order[a.status] - order[b.status]
        if (diff !== 0) return diff
        return new Date(b.last_event_at).getTime() - new Date(a.last_event_at).getTime()
      })

      setSessions(built)
    } catch {
      // Silently ignore read errors (file may not exist yet)
    }
  }, [projectRoot, environments, enabled])

  useEffect(() => { checkHooks() }, [checkHooks])

  useEffect(() => {
    if (!enabled) return
    fetchSessions()
    const interval = setInterval(fetchSessions, 2000)
    return () => clearInterval(interval)
  }, [fetchSessions, enabled])

  return { sessions, hooksInstalled, installing, error, installSuccess, installHooks }
}
