import { useEffect, useRef } from 'react'

/**
 * Hook to subscribe to Docker container events via Server-Sent Events (SSE).
 *
 * Listens for container lifecycle events (start, stop, die, restart) and
 * calls the provided callback when relevant events occur.
 *
 * @param onContainerEvent - Callback fired with the event action string
 * @param enabled - Whether to enable the SSE connection (default: true)
 *
 * @example
 * useDockerEvents((action) => {
 *   if (action === 'start') {
 *     console.log('Container started!')
 *     refreshData()
 *   }
 * })
 */
export function useDockerEvents(
  onContainerEvent: (action: string, containerName: string) => void,
  enabled: boolean = true
): void {
  const callbackRef = useRef(onContainerEvent)

  // Keep callback ref updated without triggering effect
  useEffect(() => {
    callbackRef.current = onContainerEvent
  }, [onContainerEvent])

  useEffect(() => {
    if (!enabled) return

    const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:8100'
    const eventSource = new EventSource(`${backendUrl}/api/docker/events`, {
      withCredentials: true,
    })

    const handleContainerEvent = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data)
        console.log('Docker event:', data.action, data.container_name)

        // Only fire callback for lifecycle events
        if (['start', 'stop', 'die', 'restart'].includes(data.action)) {
          callbackRef.current(data.action, data.container_name)
        }
      } catch (error) {
        console.error('Failed to parse Docker event:', error)
      }
    }

    const handleError = (error: Event) => {
      console.error('SSE connection error:', error)
      // Don't close - let it auto-reconnect
    }

    eventSource.addEventListener('container', handleContainerEvent)
    eventSource.addEventListener('error', handleError)

    return () => {
      eventSource.removeEventListener('container', handleContainerEvent)
      eventSource.removeEventListener('error', handleError)
      eventSource.close()
    }
  }, [enabled])
}
