/**
 * Multi-Destination WebSocket Adapter
 *
 * Sends audio to the relay endpoint which fans out to multiple consumers
 * (Chronicle, Mycelia, etc.) simultaneously.
 *
 * Uses the /ws/audio/relay endpoint on ushadow backend.
 */

import type { AudioChunk, RecordingMode } from '../core/types'

export interface AudioDestination {
  name: string
  url: string
}

export interface MultiDestinationConfig {
  relayUrl: string  // e.g., "ws://localhost:8000/ws/audio/relay"
  token: string
  destinations: AudioDestination[]
  deviceName?: string
  mode?: RecordingMode
}

export interface DestinationStatus {
  name: string
  connected: boolean
  errors: number
}

export class MultiDestinationAdapter {
  private ws: WebSocket | null = null
  private config: MultiDestinationConfig
  private isConnected: boolean = false
  private messageQueue: any[] = []
  private destinationStatus: DestinationStatus[] = []

  // Callbacks
  onStatusChange?: (status: DestinationStatus[]) => void
  onError?: (error: Error) => void

  constructor(config: MultiDestinationConfig) {
    this.config = config
  }

  /**
   * Connect to the relay WebSocket
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const { relayUrl, token, destinations, deviceName = 'webui-dual-stream' } = this.config

      // Build relay URL with destinations parameter
      const destinationsParam = encodeURIComponent(JSON.stringify(destinations))
      const wsUrl = `${relayUrl}?destinations=${destinationsParam}&token=${token}&device_name=${deviceName}`

      console.log('🔗 Connecting to Multi-Destination Relay:', wsUrl)
      console.log('📍 Destinations:', destinations.map(d => d.name).join(', '))

      this.ws = new WebSocket(wsUrl)

      this.ws.onopen = () => {
        console.log('✅ Multi-Destination Relay connected')

        // Send stabilization delay
        setTimeout(() => {
          this.isConnected = true

          // Flush any queued messages
          while (this.messageQueue.length > 0) {
            const msg = this.messageQueue.shift()
            this.ws?.send(msg)
          }

          resolve()
        }, 100)
      }

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)

          // Handle relay status updates
          if (data.type === 'relay_status') {
            this.handleRelayStatus(data.data)
          } else if (data.type === 'error') {
            console.error('❌ Relay error:', data.message)
            this.onError?.(new Error(data.message))
          }
        } catch (e) {
          // Non-JSON message, ignore
        }
      }

      this.ws.onerror = (error) => {
        console.error('❌ Multi-Destination Relay error:', error)
        reject(new Error('WebSocket connection failed'))
      }

      this.ws.onclose = (event) => {
        console.log('🔌 Multi-Destination Relay closed:', event.code, event.reason)
        this.isConnected = false
      }
    })
  }

  /**
   * Handle relay status updates
   */
  private handleRelayStatus(data: any) {
    if (data.destinations) {
      this.destinationStatus = data.destinations.map((d: any) => ({
        name: d.name,
        connected: d.connected,
        errors: d.errors || 0,
      }))

      console.log('📊 Relay status:', this.destinationStatus)
      this.onStatusChange?.(this.destinationStatus)
    }
  }

  /**
   * Send audio-start message (Wyoming protocol)
   */
  sendAudioStart(sampleRate: number = 16000, channels: number = 1): void {
    const message = JSON.stringify({
      type: 'audio-start',
      data: {
        rate: sampleRate,
        width: 2,  // 16-bit
        channels: channels,
        mode: this.config.mode || 'streaming',
      }
    }) + '\n'

    if (this.isConnected && this.ws) {
      this.ws.send(message)
    } else {
      this.messageQueue.push(message)
    }
  }

  /**
   * Send audio chunk (binary PCM data)
   */
  sendAudioChunk(chunk: AudioChunk): void {
    if (!this.isConnected || !this.ws) {
      console.warn('⚠️ Cannot send audio: not connected')
      return
    }

    // Send raw PCM bytes
    this.ws.send(chunk.data)
  }

  /**
   * Send audio-stop message
   */
  sendAudioStop(): void {
    const message = JSON.stringify({
      type: 'audio-stop',
      data: {
        timestamp: Date.now(),
      }
    }) + '\n'

    if (this.isConnected && this.ws) {
      this.ws.send(message)
    }
  }

  /**
   * Disconnect from relay
   */
  disconnect(): void {
    if (this.ws) {
      this.sendAudioStop()
      this.ws.close()
      this.ws = null
    }
    this.isConnected = false
  }

  /**
   * Get current destination status
   */
  getDestinationStatus(): DestinationStatus[] {
    return this.destinationStatus
  }

  /**
   * Check if connected
   */
  get connected(): boolean {
    return this.isConnected
  }
}

/**
 * Create adapter from audio consumer config
 *
 * Usage:
 * ```typescript
 * // Fetch config from API
 * const consumer = await getActiveAudioConsumer(baseUrl, token);
 *
 * // Create adapter
 * const adapter = createMultiDestinationAdapter(consumer, token);
 * await adapter.connect();
 *
 * // Start recording
 * adapter.sendAudioStart();
 * // ... send chunks ...
 * adapter.sendAudioStop();
 * adapter.disconnect();
 * ```
 */
export function createMultiDestinationAdapter(
  consumerConfig: {
    websocket_url: string
    destinations?: AudioDestination[]
  },
  token: string,
  options?: {
    deviceName?: string
    mode?: RecordingMode
  }
): MultiDestinationAdapter {
  return new MultiDestinationAdapter({
    relayUrl: consumerConfig.websocket_url,
    token,
    destinations: consumerConfig.destinations || [],
    deviceName: options?.deviceName,
    mode: options?.mode,
  })
}
