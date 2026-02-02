/**
 * Chronicle Backend Adapter
 *
 * Example adapter showing how to integrate the dual-stream module
 * with Chronicle's WebSocket + Wyoming protocol backend.
 *
 * This file demonstrates the integration pattern but is NOT required
 * for the core module to work - it's just an example!
 */

import type { AudioChunk, RecordingMode } from '../core/types'

export interface ChronicleWebSocketConfig {
  backendUrl: string
  token: string
  deviceName?: string
  mode?: RecordingMode
}

export class ChronicleWebSocketAdapter {
  private ws: WebSocket | null = null
  private config: ChronicleWebSocketConfig
  private isConnected: boolean = false
  private messageQueue: any[] = []

  constructor(config: ChronicleWebSocketConfig) {
    this.config = config
  }

  /**
   * Connect to Chronicle WebSocket
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const { backendUrl, token, deviceName = 'webui-dual-stream' } = this.config

      // Build WebSocket URL
      // Determine protocol from the backend URL, not the current page
      let wsUrl: string

      if (backendUrl && backendUrl.startsWith('http')) {
        // Extract protocol from backendUrl (https:// -> wss://, http:// -> ws://)
        const protocol = backendUrl.startsWith('https://') ? 'wss:' : 'ws:'
        const host = backendUrl.replace(/^https?:\/\//, '')
        wsUrl = `${protocol}//${host}/ws_pcm?token=${token}&device_name=${deviceName}`
      } else if (backendUrl && backendUrl !== '') {
        // Relative URL - use current page's protocol
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        wsUrl = `${protocol}//${window.location.host}${backendUrl}/ws_pcm?token=${token}&device_name=${deviceName}`
      } else {
        // Fallback to current page
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        wsUrl = `${protocol}//${window.location.host}/ws_pcm?token=${token}&device_name=${deviceName}`
      }

      console.log('🔗 Connecting to Chronicle WebSocket:', wsUrl)

      this.ws = new WebSocket(wsUrl)

      this.ws.onopen = () => {
        console.log('✅ Chronicle WebSocket connected')

        // Send stabilization delay
        setTimeout(() => {
          this.isConnected = true

          // Flush queued messages
          while (this.messageQueue.length > 0) {
            const msg = this.messageQueue.shift()
            this.send(msg)
          }

          resolve()
        }, 100)
      }

      this.ws.onerror = (error) => {
        console.error('❌ Chronicle WebSocket error:', error)
        reject(new Error('WebSocket connection failed'))
      }

      this.ws.onclose = () => {
        console.log('🔌 Chronicle WebSocket disconnected')
        this.isConnected = false
      }

      this.ws.onmessage = (event) => {
        console.log('📨 Received from Chronicle:', event.data)
      }
    })
  }

  /**
   * Send audio-start message (Wyoming protocol)
   */
  async sendAudioStart(mode: RecordingMode = 'microphone-only'): Promise<void> {
    const startMessage = {
      type: 'audio-start',
      data: {
        rate: 16000,
        width: 2,
        channels: 1,
        mode: mode === 'dual-stream' ? 'batch' : 'streaming'
      },
      payload_length: null
    }

    this.send(JSON.stringify(startMessage) + '\n')
    console.log('📤 Sent audio-start message (mode:', mode, ')')
  }

  /**
   * Send audio chunk (Wyoming protocol)
   */
  async sendAudioChunk(chunk: AudioChunk): Promise<void> {
    console.log('🔧 sendAudioChunk called, isConnected:', this.isConnected, 'ws state:', this.ws?.readyState)

    if (!this.isConnected || !this.ws) {
      console.warn('⚠️  WebSocket not connected, chunk NOT queued (would be lost)')
      return
    }

    // Set binary type if not already set
    if (this.ws.binaryType !== 'arraybuffer') {
      this.ws.binaryType = 'arraybuffer'
    }

    // Send chunk header (Wyoming protocol)
    const chunkHeader = {
      type: 'audio-chunk',
      data: {
        rate: chunk.metadata.sampleRate,
        width: 2,
        channels: chunk.metadata.channelCount
      },
      payload_length: chunk.data.byteLength
    }

    this.send(JSON.stringify(chunkHeader) + '\n')

    // Send binary PCM data
    this.send(
      new Uint8Array(chunk.data.buffer, chunk.data.byteOffset, chunk.data.byteLength)
    )

    console.log('✅ Chunk sent to Chronicle:', chunk.data.byteLength, 'bytes')
  }

  /**
   * Send audio-stop message (Wyoming protocol)
   */
  async sendAudioStop(): Promise<void> {
    const stopMessage = {
      type: 'audio-stop',
      data: { timestamp: Date.now() },
      payload_length: null
    }

    this.send(JSON.stringify(stopMessage) + '\n')
    console.log('📤 Sent audio-stop message')
  }

  /**
   * Send data to WebSocket (with queuing if not connected)
   */
  private send(data: string | Uint8Array): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      if (typeof data === 'string') {
        this.messageQueue.push(data)
      }
      return
    }

    this.ws.send(data)
  }

  /**
   * Close WebSocket connection
   */
  close(): void {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.isConnected = false
    this.messageQueue = []
  }

  /**
   * Check if connected
   */
  isOpen(): boolean {
    return this.isConnected && this.ws?.readyState === WebSocket.OPEN
  }
}

/**
 * Create a Chronicle-compatible onAudioChunk callback
 *
 * Usage example:
 * ```tsx
 * const adapter = new ChronicleWebSocketAdapter({ ... })
 * await adapter.connect()
 * await adapter.sendAudioStart('dual-stream')
 *
 * const recording = useDualStreamRecording({
 *   sampleRate: 16000,
 *   onAudioChunk: createChronicleCallback(adapter),
 *   // ... other config
 * })
 * ```
 */
export function createChronicleCallback(adapter: ChronicleWebSocketAdapter) {
  return async (chunk: AudioChunk) => {
    await adapter.sendAudioChunk(chunk)
  }
}
