/**
 * Web Recording Hook with Multi-Destination Support
 *
 * Supports three recording modes:
 * - 'streaming': Real-time microphone audio sent immediately
 * - 'batch': Microphone audio accumulated and sent when stopped
 * - 'dual-stream': Microphone + browser tab/screen audio mixed together
 *
 * Connects to wired audio consumers (Chronicle, Mycelia, etc.) based on
 * the wiring configuration in the Service Configs page.
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import { getChronicleWebSocketUrl, getChronicleDirectUrl } from '../services/chronicleApi'
import { audioApi, AudioDestination } from '../services/api'
import { getStorageKey } from '../utils/storage'
import { useDualStreamRecording } from '../modules/dual-stream-audio/hooks/useDualStreamRecording'
import { ChronicleWebSocketAdapter } from '../modules/dual-stream-audio/adapters/chronicleAdapter'
import { getBrowserCapabilities } from '../modules/dual-stream-audio/utils/browserCompat'

export type RecordingStep = 'idle' | 'mic' | 'display' | 'websocket' | 'audio-start' | 'streaming' | 'stopping' | 'error'
export type RecordingMode = 'batch' | 'streaming' | 'dual-stream'

export interface DebugStats {
  chunksSent: number
  messagesReceived: number
  lastError: string | null
  lastErrorTime: Date | null
  sessionStartTime: Date | null
  connectionAttempts: number
}

export interface WebRecordingReturn {
  // Current state
  currentStep: RecordingStep
  isRecording: boolean
  recordingDuration: number
  error: string | null
  mode: RecordingMode

  // Actions
  startRecording: () => Promise<void>
  stopRecording: () => void
  setMode: (mode: RecordingMode) => void

  // For components
  analyser: AnalyserNode | null
  debugStats: DebugStats

  // Utilities
  formatDuration: (seconds: number) => string
  canAccessMicrophone: boolean
  canAccessDualStream: boolean
}

/** @deprecated Use useWebRecording instead */
export type ChronicleRecordingReturn = WebRecordingReturn

export const useWebRecording = (): WebRecordingReturn => {
  // Mode state
  const [mode, setMode] = useState<RecordingMode>('streaming')

  // Keep mode ref in sync for use in callbacks
  const currentModeRef = useRef<RecordingMode>(mode)
  useEffect(() => {
    currentModeRef.current = mode
  }, [mode])

  // Debug stats
  const [debugStats, setDebugStats] = useState<DebugStats>({
    chunksSent: 0,
    messagesReceived: 0,
    lastError: null,
    lastErrorTime: null,
    sessionStartTime: null,
    connectionAttempts: 0
  })

  // Refs for WebSocket adapter and legacy mode
  const adapterRef = useRef<ChronicleWebSocketAdapter | null>(null)
  const legacyWsRef = useRef<WebSocket | null>(null)
  // Multi-destination WebSocket connections
  const destinationWsRefs = useRef<Map<string, WebSocket>>(new Map())
  const activeDestinationsRef = useRef<AudioDestination[]>([])
  const legacyStreamRef = useRef<MediaStream | null>(null)
  const legacyContextRef = useRef<AudioContext | null>(null)
  const legacyProcessorRef = useRef<ScriptProcessorNode | null>(null)
  const legacyAnalyserRef = useRef<AnalyserNode | null>(null)
  const durationIntervalRef = useRef<ReturnType<typeof setInterval>>()
  const keepAliveIntervalRef = useRef<ReturnType<typeof setInterval>>()
  const chunkCountRef = useRef(0)
  const audioProcessingStartedRef = useRef(false)
  // Batch mode: accumulate audio chunks to send all at once when stopping
  const batchAudioChunksRef = useRef<Int16Array[]>([])

  // Legacy mode state (for streaming/batch modes)
  const [legacyStep, setLegacyStep] = useState<RecordingStep>('idle')
  const [legacyRecording, setLegacyRecording] = useState(false)
  const [legacyDuration, setLegacyDuration] = useState(0)
  const [legacyError, setLegacyError] = useState<string | null>(null)
  const [legacyAnalyser, setLegacyAnalyser] = useState<AnalyserNode | null>(null)

  // Check browser capabilities
  const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:'
  const canAccessMicrophone = isLocalhost || isHttps
  const capabilities = typeof window !== 'undefined' ? getBrowserCapabilities() : { hasGetDisplayMedia: false }
  const canAccessDualStream = canAccessMicrophone && capabilities.hasGetDisplayMedia

  // Format duration helper
  const formatDuration = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }, [])

  // Dual-stream recording hook
  const dualStream = useDualStreamRecording({
    sampleRate: 16000,
    channelCount: 1,
    bufferSize: 4096,
    onAudioChunk: async (chunk) => {
      console.log('🔊 onAudioChunk called, adapter open?', adapterRef.current?.isOpen())
      if (adapterRef.current?.isOpen()) {
        console.log('📤 Sending chunk to Chronicle via WebSocket')
        await adapterRef.current.sendAudioChunk(chunk)
        chunkCountRef.current++
        setDebugStats(prev => ({ ...prev, chunksSent: chunkCountRef.current }))
      } else {
        console.warn('⚠️ Adapter not open, chunk NOT sent')
      }
    },
    onStateChange: (state) => {
      console.log('Dual-stream state changed:', state)
    },
    onError: (error) => {
      console.error('Dual-stream error:', error)
      setDebugStats(prev => ({
        ...prev,
        lastError: error.message,
        lastErrorTime: new Date()
      }))
    }
  })

  // Map dual-stream state to RecordingStep
  const mapDualStreamState = (state: string): RecordingStep => {
    switch (state) {
      case 'idle': return 'idle'
      case 'requesting-mic': return 'mic'
      case 'requesting-display': return 'display'
      case 'setting-up-mixer': return 'audio-start'
      case 'recording': return 'streaming'
      case 'stopping': return 'stopping'
      case 'error': return 'error'
      default: return 'idle'
    }
  }

  // Legacy cleanup
  const legacyCleanup = useCallback(() => {
    console.log('Cleaning up legacy recording resources')

    audioProcessingStartedRef.current = false

    if (legacyStreamRef.current) {
      legacyStreamRef.current.getTracks().forEach(track => track.stop())
      legacyStreamRef.current = null
    }

    if (legacyContextRef.current?.state !== 'closed') {
      legacyContextRef.current?.close()
    }
    legacyContextRef.current = null
    legacyAnalyserRef.current = null
    setLegacyAnalyser(null)
    legacyProcessorRef.current = null

    if (legacyWsRef.current) {
      legacyWsRef.current.close()
      legacyWsRef.current = null
    }

    // Close all destination WebSockets
    destinationWsRefs.current.forEach((ws, id) => {
      console.log(`Closing WebSocket for destination: ${id}`)
      ws.close()
    })
    destinationWsRefs.current.clear()
    activeDestinationsRef.current = []

    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current)
      durationIntervalRef.current = undefined
    }

    if (keepAliveIntervalRef.current) {
      clearInterval(keepAliveIntervalRef.current)
      keepAliveIntervalRef.current = undefined
    }

    chunkCountRef.current = 0
    batchAudioChunksRef.current = []
  }, [])

  // Start recording (dispatches based on mode)
  const startRecording = useCallback(async () => {
    try {
      // Reset state
      chunkCountRef.current = 0
      batchAudioChunksRef.current = []
      setDebugStats(prev => ({
        ...prev,
        chunksSent: 0,
        lastError: null,
        sessionStartTime: new Date(),
        connectionAttempts: prev.connectionAttempts + 1
      }))

      // Chronicle uses unified auth with ushadow - same token works for both
      const token = localStorage.getItem(getStorageKey('token'))
      if (!token) {
        throw new Error('No authentication token found - please log in to ushadow')
      }

      if (mode === 'dual-stream') {
        // ===== DUAL-STREAM MODE =====
        console.log('Starting dual-stream recording')

        // Get Chronicle direct URL for WebSocket
        const backendUrl = await getChronicleDirectUrl()

        // Create and connect adapter
        const adapter = new ChronicleWebSocketAdapter({
          backendUrl,
          token,
          deviceName: 'ushadow-dual-stream',
          mode: 'dual-stream'
        })

        await adapter.connect()
        adapterRef.current = adapter

        // Send audio-start
        await adapter.sendAudioStart('dual-stream')

        // Start dual-stream recording
        await dualStream.startRecording('dual-stream')

        // Start duration timer
        durationIntervalRef.current = setInterval(() => {
          setLegacyDuration(prev => prev + 1)
        }, 1000)

      } else {
        // ===== LEGACY MODE (streaming/batch) =====
        console.log('Starting legacy recording in mode:', mode)

        setLegacyError(null)
        setLegacyStep('mic')

        // Get microphone
        if (!canAccessMicrophone) {
          throw new Error('Microphone access requires HTTPS or localhost')
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            sampleRate: 16000,
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        })
        legacyStreamRef.current = stream

        // Fetch wired destinations from the audio provider API
        setLegacyStep('websocket')
        let destinations: AudioDestination[] = []
        let useRelay = false
        let relayUrl: string | null = null
        try {
          const destResponse = await audioApi.getWiredDestinations()
          destinations = destResponse.data.destinations || []
          useRelay = destResponse.data.use_relay || false
          relayUrl = destResponse.data.relay_url || null
          console.log('Wired audio destinations:', { destinations, useRelay, relayUrl })
        } catch (err) {
          console.warn('Failed to fetch wired destinations, falling back to Chronicle:', err)
        }

        // If no wired destinations, fall back to Chronicle (legacy behavior)
        if (destinations.length === 0) {
          try {
            const baseWsUrl = await getChronicleWebSocketUrl('/ws_pcm')
            destinations = [{
              consumer_id: 'chronicle',
              consumer_name: 'Chronicle',
              websocket_url: baseWsUrl,
              protocol: 'wyoming',
              format: 'pcm_s16le_16khz_mono'
            }]
            console.log('No wired destinations found, using Chronicle fallback')
          } catch (err) {
            throw new Error('No audio destinations wired. Please wire desktop-mic to a service like Chronicle or Mycelia in the Service Configs page.')
          }
        }

        activeDestinationsRef.current = destinations

        // Connect to destinations - either via relay or directly
        const connectedSockets: Map<string, WebSocket> = new Map()

        if (useRelay && relayUrl) {
          // RELAY MODE: Connect to single relay endpoint, backend handles fan-out
          // Format destinations for relay: [{name: "Chronicle", url: "ws://..."}]
          const relayDestinations = destinations.map(d => ({
            name: d.consumer_name,
            url: d.websocket_url  // Internal URLs from backend
          }))

          const wsUrl = `${relayUrl}?destinations=${encodeURIComponent(JSON.stringify(relayDestinations))}&token=${token}`
          console.log('Connecting via relay:', relayUrl)
          console.log('Relay destinations:', relayDestinations)

          await new Promise<void>((resolve, reject) => {
            const socket = new WebSocket(wsUrl)

            socket.onopen = () => {
              setTimeout(() => {
                // In relay mode, use 'relay' as the socket ID
                connectedSockets.set('relay', socket)
                console.log('Connected to audio relay')
                resolve()
              }, 100)
            }

            socket.onerror = (e) => {
              console.error('Relay connection error:', e)
              reject(new Error('Failed to connect to audio relay'))
            }

            socket.onmessage = (event) => {
              setDebugStats(prev => ({ ...prev, messagesReceived: prev.messagesReceived + 1 }))
              // Log relay status messages
              try {
                const msg = JSON.parse(event.data)
                if (msg.type === 'relay_status') {
                  console.log('Relay status:', msg.data)
                } else if (msg.type === 'error') {
                  console.error('Relay error:', msg.message)
                }
              } catch {
                // Binary data, ignore
              }
            }
          })

          console.log('Connected via relay to destinations:', destinations.map(d => d.consumer_name).join(', '))

        } else {
          // DIRECT MODE: Connect to each destination individually
          const connectionPromises = destinations.map(async (dest) => {
            const wsUrl = `${dest.websocket_url}?token=${token}&device_name=ushadow-recorder`
            console.log(`Connecting to ${dest.consumer_name}:`, wsUrl)

            return new Promise<void>((resolve, reject) => {
              const socket = new WebSocket(wsUrl)

              socket.onopen = () => {
                setTimeout(() => {
                  connectedSockets.set(dest.consumer_id, socket)
                  console.log(`Connected to ${dest.consumer_name}`)
                  resolve()
                }, 100)
              }

              socket.onerror = () => {
                console.warn(`Failed to connect to ${dest.consumer_name}`)
                reject(new Error(`Failed to connect to ${dest.consumer_name}`))
              }

              socket.onmessage = () => {
                setDebugStats(prev => ({ ...prev, messagesReceived: prev.messagesReceived + 1 }))
              }
            })
          })

          // Wait for at least one connection to succeed
          const results = await Promise.allSettled(connectionPromises)
          const successfulConnections = results.filter(r => r.status === 'fulfilled').length
          const failedConnections = results
            .map((r, i) => r.status === 'rejected' ? destinations[i].consumer_name : null)
            .filter(Boolean)

          if (successfulConnections === 0) {
            const failedNames = failedConnections.join(', ')
            throw new Error(`Failed to connect to audio destinations: ${failedNames}. Make sure the services are running.`)
          }

          if (failedConnections.length > 0) {
            console.warn(`Some audio destinations unavailable: ${failedConnections.join(', ')}`)
          }
          console.log(`Connected to ${successfulConnections}/${destinations.length} audio destinations`)
        }

        destinationWsRefs.current = connectedSockets

        // Use first connected socket for legacy compatibility
        const firstSocket = connectedSockets.values().next().value
        legacyWsRef.current = firstSocket

        // Start keepalive for all sockets
        keepAliveIntervalRef.current = setInterval(() => {
          destinationWsRefs.current.forEach((socket, id) => {
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({ type: 'ping', payload_length: null }) + '\n')
            }
          })
        }, 30000)

        const ws = firstSocket!

        // Send audio-start to all connected destinations
        setLegacyStep('audio-start')
        const audioStartMsg = JSON.stringify({
          type: 'audio-start',
          data: { rate: 16000, width: 2, channels: 1, mode },
          payload_length: null
        }) + '\n'

        destinationWsRefs.current.forEach((socket, id) => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(audioStartMsg)
            console.log(`Sent audio-start to ${id}`)
          }
        })

        // Set up audio processing
        setLegacyStep('streaming')
        const audioContext = new AudioContext({ sampleRate: 16000 })
        const analyser = audioContext.createAnalyser()
        const source = audioContext.createMediaStreamSource(stream)

        analyser.fftSize = 256
        source.connect(analyser)

        if (audioContext.state === 'suspended') {
          await audioContext.resume()
        }

        legacyContextRef.current = audioContext
        legacyAnalyserRef.current = analyser
        setLegacyAnalyser(analyser)

        await new Promise(resolve => setTimeout(resolve, 100))

        const processor = audioContext.createScriptProcessor(4096, 1, 1)
        source.connect(processor)
        processor.connect(audioContext.destination)

        processor.onaudioprocess = (event) => {
          if (!audioProcessingStartedRef.current) return
          if (destinationWsRefs.current.size === 0) return

          const inputData = event.inputBuffer.getChannelData(0)
          const pcmBuffer = new Int16Array(inputData.length)

          for (let i = 0; i < inputData.length; i++) {
            const sample = Math.max(-1, Math.min(1, inputData[i]))
            pcmBuffer[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF
          }

          // BATCH MODE: Accumulate chunks to send later
          if (currentModeRef.current === 'batch') {
            batchAudioChunksRef.current.push(pcmBuffer.slice()) // Clone the buffer
            chunkCountRef.current++
            setDebugStats(prev => ({ ...prev, chunksSent: chunkCountRef.current }))
            return
          }

          // STREAMING MODE: Send immediately
          const headerMsg = JSON.stringify({
            type: 'audio-chunk',
            data: { rate: 16000, width: 2, channels: 1 },
            payload_length: pcmBuffer.byteLength
          }) + '\n'
          const audioData = new Uint8Array(pcmBuffer.buffer, pcmBuffer.byteOffset, pcmBuffer.byteLength)

          // Send to all connected destinations
          let sentToAny = false
          destinationWsRefs.current.forEach((socket) => {
            try {
              if (socket.readyState === WebSocket.OPEN) {
                if (socket.binaryType !== 'arraybuffer') {
                  socket.binaryType = 'arraybuffer'
                }
                socket.send(headerMsg)
                socket.send(audioData)
                sentToAny = true
              }
            } catch (error) {
              console.error('Failed to send audio chunk to destination:', error)
            }
          })

          if (sentToAny) {
            chunkCountRef.current++
            setDebugStats(prev => ({ ...prev, chunksSent: chunkCountRef.current }))
          }
        }

        legacyProcessorRef.current = processor
        audioProcessingStartedRef.current = true

        setLegacyRecording(true)
        setLegacyDuration(0)

        durationIntervalRef.current = setInterval(() => {
          setLegacyDuration(prev => prev + 1)
        }, 1000)
      }

    } catch (error) {
      console.error('Recording failed:', error)

      if (mode === 'dual-stream') {
        // Cleanup dual-stream
        adapterRef.current?.close()
        adapterRef.current = null
      } else {
        setLegacyStep('error')
        setLegacyError(error instanceof Error ? error.message : 'Recording failed')
        legacyCleanup()
      }

      setDebugStats(prev => ({
        ...prev,
        lastError: error instanceof Error ? error.message : 'Recording failed',
        lastErrorTime: new Date()
      }))
    }
  }, [mode, canAccessMicrophone, dualStream, legacyCleanup])

  // Stop recording
  const stopRecording = useCallback(async () => {
    console.log('Stopping recording')

    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current)
      durationIntervalRef.current = undefined
    }

    if (mode === 'dual-stream') {
      // Stop dual-stream
      dualStream.stopRecording()

      // Send audio-stop and close adapter
      if (adapterRef.current) {
        await adapterRef.current.sendAudioStop()
        adapterRef.current.close()
        adapterRef.current = null
      }

      setLegacyDuration(0)

    } else {
      // Stop legacy recording
      audioProcessingStartedRef.current = false

      // BATCH MODE: Send all accumulated audio chunks before stopping
      if (currentModeRef.current === 'batch' && batchAudioChunksRef.current.length > 0) {
        console.log(`Sending ${batchAudioChunksRef.current.length} accumulated batch chunks`)

        // Send each accumulated chunk to all destinations
        for (const pcmBuffer of batchAudioChunksRef.current) {
          const headerMsg = JSON.stringify({
            type: 'audio-chunk',
            data: { rate: 16000, width: 2, channels: 1 },
            payload_length: pcmBuffer.byteLength
          }) + '\n'
          const audioData = new Uint8Array(pcmBuffer.buffer, pcmBuffer.byteOffset, pcmBuffer.byteLength)

          destinationWsRefs.current.forEach((socket) => {
            try {
              if (socket.readyState === WebSocket.OPEN) {
                if (socket.binaryType !== 'arraybuffer') {
                  socket.binaryType = 'arraybuffer'
                }
                socket.send(headerMsg)
                socket.send(audioData)
              }
            } catch (error) {
              console.error('Failed to send batch audio chunk:', error)
            }
          })
        }

        console.log('Finished sending batch audio')
        // Clear the batch buffer
        batchAudioChunksRef.current = []
      }

      // Send audio-stop to all connected destinations
      const audioStopMsg = JSON.stringify({
        type: 'audio-stop',
        data: { timestamp: Date.now() },
        payload_length: null
      }) + '\n'

      destinationWsRefs.current.forEach((socket, id) => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(audioStopMsg)
          console.log(`Sent audio-stop to ${id}`)
        }
      })

      legacyCleanup()

      setLegacyRecording(false)
      setLegacyDuration(0)
      setLegacyStep('idle')
    }

    console.log('Recording stopped')
  }, [mode, dualStream, legacyCleanup])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      legacyCleanup()
      adapterRef.current?.close()
    }
  }, [legacyCleanup])

  // Determine current state based on mode
  const isDualStream = mode === 'dual-stream'
  const currentStep: RecordingStep = isDualStream
    ? mapDualStreamState(dualStream.state)
    : legacyStep

  const isRecording = isDualStream ? dualStream.isRecording : legacyRecording
  const recordingDuration = isDualStream ? (dualStream.isRecording ? legacyDuration : 0) : legacyDuration
  const error = isDualStream ? (dualStream.error?.message || null) : legacyError

  // Get analyser - for dual-stream, try to get from mixer
  const analyser = isDualStream
    ? dualStream.getAnalyser('microphone')
    : legacyAnalyser

  return {
    currentStep,
    isRecording,
    recordingDuration,
    error,
    mode,
    startRecording,
    stopRecording,
    setMode,
    analyser,
    debugStats,
    formatDuration,
    canAccessMicrophone,
    canAccessDualStream
  }
}

/** @deprecated Use useWebRecording instead */
export const useChronicleRecording = useWebRecording
