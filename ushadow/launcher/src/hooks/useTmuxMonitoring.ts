import { useState, useEffect } from 'react'
import { tauri, TmuxStatus } from './useTauri'

interface TmuxMonitoringState {
  [envName: string]: TmuxStatus
}

/**
 * Hook to monitor tmux status for all environments
 * Polls every 3 seconds to detect Claude Code activity and command execution
 */
export function useTmuxMonitoring(environmentNames: string[], enabled: boolean = true) {
  const [tmuxStatuses, setTmuxStatuses] = useState<TmuxMonitoringState>({})

  useEffect(() => {
    if (!enabled || environmentNames.length === 0) {
      return
    }

    const pollTmuxStatuses = async () => {
      const statuses: TmuxMonitoringState = {}

      // Poll all environments in parallel
      await Promise.all(
        environmentNames.map(async (envName) => {
          try {
            const status = await tauri.getEnvironmentTmuxStatus(envName)
            statuses[envName] = status
          } catch (error) {
            // If tmux monitoring fails, mark as unknown
            statuses[envName] = {
              exists: false,
              window_name: null,
              current_command: null,
              activity_status: 'Unknown',
            }
          }
        })
      )

      setTmuxStatuses(statuses)
    }

    // Initial poll
    pollTmuxStatuses()

    // Poll every 3 seconds
    const interval = setInterval(pollTmuxStatuses, 3000)

    return () => clearInterval(interval)
  }, [environmentNames, enabled])

  return tmuxStatuses
}

/**
 * Get status icon for tmux activity
 */
export function getTmuxStatusIcon(status: TmuxStatus | undefined): string {
  if (!status || !status.exists) {
    return ''
  }

  switch (status.activity_status) {
    case 'Working':
      return '🤖'
    case 'Waiting':
      return '💬'
    case 'Done':
      return '✅'
    case 'Error':
      return '❌'
    default:
      return ''
  }
}

/**
 * Get status text for tmux activity
 */
export function getTmuxStatusText(status: TmuxStatus | undefined): string {
  if (!status || !status.exists) {
    return ''
  }

  const command = status.current_command || 'unknown'

  switch (status.activity_status) {
    case 'Working':
      return `Running: ${command}`
    case 'Waiting':
      return 'Shell ready'
    case 'Done':
      return 'Task complete'
    case 'Error':
      return 'Command failed'
    default:
      return ''
  }
}
