/**
 * Web Recording Hook with Multi-Destination Support
 *
 * Supports three recording modes:
 * - 'streaming': Real-time microphone audio sent immediately
 * - 'batch': Microphone audio accumulated and sent when stopped
 * - 'dual-stream': Microphone + browser tab/screen audio mixed together
 *
 * Discovers and connects to running audio consumer services (Chronicle, Mycelia, etc.)
 * by querying /api/deployments/exposed-urls for services exposing audio intake endpoints.
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import { getChronicleWebSocketUrl, getChronicleDirectUrl } from '../services/chronicleApi'
import { deploymentsApi, ExposedUrl, BACKEND_URL } from '../services/api'
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

  // Destination selection
  availableDestinations: ExposedUrl[]
  selectedDestinationIds: string[]
  toggleDestination: (id: string) => void

  // Audio source detection
  availableAudioDevices: MediaDeviceInfo[]
  selectedAudioDeviceId: string | null
  setSelectedAudioDevice: (deviceId: string) => void
  isOmiDevice: boolean

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

  // Destination selection state
  const [availableDestinations, setAvailableDestinations] = useState<ExposedUrl[]>([])
  const [selectedDestinationIds, setSelectedDestinationIds] = useState<string[]>([])

  // Audio device selection state
  const [availableAudioDevices, setAvailableAudioDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState<string | null>(null)

  // Toggle destination selection
  const toggleDestination = useCallback((id: string) => {
    setSelectedDestinationIds(prev =>
      prev.includes(id) ? prev.filter(destId => destId !== id) : [...prev, id]
    )
  }, [])

  // Detect if selected device is an OMI device
  const isOmiDevice = availableAudioDevices
    .find(d => d.deviceId === selectedAudioDeviceId)
    ?.label.toLowerCase().includes('omi') || false

  // Check browser capabilities (needed before device enumeration)
  const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:'
  const canAccessMicrophone = isLocalhost || isHttps
  const capabilities = typeof window !== 'undefined' ? getBrowserCapabilities() : { hasGetDisplayMedia: false }
  const canAccessDualStream = canAccessMicrophone && capabilities.hasGetDisplayMedia

  // Fetch available destinations on mount
  useEffect(() => {
    const fetchDestinations = async () => {
      try {
        // Filter for audio_intake endpoints on the backend
        const response = await deploymentsApi.getExposedUrls({ name: 'audio_intake' })
        setAvailableDestinations(response.data)
        // Select all destinations by default
        setSelectedDestinationIds(response.data.map(d => d.instance_id))
      } catch (err) {
        console.warn('Failed to fetch exposed audio URLs:', err)
      }
    }
    fetchDestinations()
  }, [])

  // Enumerate audio input devices on mount
  useEffect(() => {
    const enumerateDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        const audioInputs = devices.filter(d => d.kind === 'audioinput')
        setAvailableAudioDevices(audioInputs)

        // Auto-select default device if available
        const defaultDevice = audioInputs.find(d => d.deviceId === 'default') || audioInputs[0]
        if (defaultDevice) {
          setSelectedAudioDeviceId(defaultDevice.deviceId)
        }
      } catch (err) {
        console.warn('Failed to enumerate audio devices:', err)
      }
    }

    if (canAccessMicrophone) {
      enumerateDevices()

      // Listen for device changes
      navigator.mediaDevices.addEventListener('devicechange', enumerateDevices)
      return () => {
        navigator.mediaDevices.removeEventListener('devicechange', enumerateDevices)
      }
    }
  }, [canAccessMicrophone])

  // Helper to get correct WebSocket path based on device type
  const getAudioPath = useCallback((baseUrl: string) => {
    // OMI devices use Opus format → /ws_omi
    // Phone mic uses PCM format → /ws_pcm
    const targetPath = isOmiDevice ? '/ws_omi' : '/ws_pcm'
    return baseUrl.replace(/\/ws_pcm$/, targetPath)
  }, [isOmiDevice])

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
  const activeDestinationsRef = useRef<ExposedUrl[]>([])
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

        let displayStream: MediaStream | null = null
        try {
          // IMPORTANT: Request display media FIRST while still in user gesture context
          // getDisplayMedia() must be called synchronously from a user gesture
          // Doing ANY await before this call will cause the browser to block the picker
          setLegacyStep('display')
          console.log('🖥️  Step 1: Requesting display media (MUST be first for user gesture)')
          displayStream = await navigator.mediaDevices.getDisplayMedia({
            audio: {
              sampleRate: 16000,
              channelCount: 1,
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false
            },
            video: true // Required for picker - will be stopped immediately
          })

          // IMPORTANT: Don't stop/remove video tracks - this can end the audio track too!
          // Instead, keep the video track running but we won't use it
          // The browser requires video to be requested for getDisplayMedia to work properly
          const videoTracks = displayStream.getVideoTracks()
          console.log('🎬 Keeping', videoTracks.length, 'video tracks running (required for audio)')

          // Verify we got audio
          const audioTracks = displayStream.getAudioTracks()
          console.log('🔊 Display stream audio tracks:', audioTracks.length)
          if (audioTracks.length > 0) {
            console.log('🔊 Audio track details:', {
              label: audioTracks[0].label,
              enabled: audioTracks[0].enabled,
              muted: audioTracks[0].muted,
              readyState: audioTracks[0].readyState,
              settings: audioTracks[0].getSettings()
            })
          }

          if (audioTracks.length === 0) {
            displayStream.getTracks().forEach(t => t.stop())
            throw new Error('No audio track found. When selecting a tab/window, make sure to CHECK the "Share tab audio" or "Share system audio" checkbox at the bottom of the picker!')
          }

          // Now that we have display permission, do other async operations
          // Use selected destinations from state (like streaming mode)
          const destinations: ExposedUrl[] = availableDestinations.filter(d =>
            selectedDestinationIds.includes(d.instance_id)
          )

          if (destinations.length === 0) {
            displayStream.getTracks().forEach(t => t.stop())
            throw new Error('No audio destinations selected. Please select at least one destination to record.')
          }

          console.log('Using selected audio destinations:', destinations.map(d => d.instance_name))

          // Build relay WebSocket URL (use relay instead of direct connection)
          const relayDestinations = destinations.map(dest => ({
            name: dest.instance_name,
            url: getAudioPath(dest.url)
          }))

          const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
          const relayBaseUrl = BACKEND_URL ? BACKEND_URL.replace(/^https?:/, wsProtocol) : `${wsProtocol}//${window.location.host}`
          const destinationsParam = encodeURIComponent(JSON.stringify(relayDestinations))
          const tokenParam = encodeURIComponent(token)
          const backendUrl = `${relayBaseUrl}/ws/audio/relay?destinations=${destinationsParam}&token=${tokenParam}`

          console.log('Dual-stream connecting via relay:', backendUrl.replace(token, 'REDACTED'))

          // Create and connect adapter (will use relay instead of direct connection)
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

          // Start dual-stream recording (will request microphone internally)
          console.log('🎙️  Step 3: Starting dual-stream recording (will request microphone)...')
          await dualStream.startRecording('dual-stream', displayStream)
          console.log('✅ Dual-stream recording started successfully')
        } catch (error) {
          // Cleanup display stream if it was captured
          if (displayStream) {
            console.error('❌ Dual-stream setup failed, cleaning up display stream:', error)
            displayStream.getTracks().forEach(t => t.stop())
          }
          throw error // Re-throw to be caught by outer try-catch
        }

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
            deviceId: selectedAudioDeviceId ? { exact: selectedAudioDeviceId } : undefined,
            sampleRate: 16000,
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        })
        legacyStreamRef.current = stream

        // Use selected destinations from state
        setLegacyStep('websocket')
        const destinations: ExposedUrl[] = availableDestinations.filter(d =>
          selectedDestinationIds.includes(d.instance_id)
        )

        if (destinations.length === 0) {
          throw new Error('No audio destinations selected. Please select at least one destination to record.')
        }

        console.log('Using selected audio destinations:', destinations.map(d => d.instance_name))
        activeDestinationsRef.current = destinations

        // Build relay WebSocket URL with destinations and token
        // The relay expects: /ws/audio/relay?destinations=[...]&token=...
        // Swap path based on audio source (OMI device → /ws_omi, phone mic → /ws_pcm)
        const relayDestinations = destinations.map(dest => ({
          name: dest.instance_name,
          url: getAudioPath(dest.url)
        }))

        // Build WebSocket URL for relay
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        const relayBaseUrl = BACKEND_URL ? BACKEND_URL.replace(/^https?:/, wsProtocol) : `${wsProtocol}//${window.location.host}`
        const destinationsParam = encodeURIComponent(JSON.stringify(relayDestinations))
        const tokenParam = encodeURIComponent(token)
        const relayUrl = `${relayBaseUrl}/ws/audio/relay?destinations=${destinationsParam}&token=${tokenParam}`

        console.log('Connecting to audio relay:', relayUrl.replace(token, 'REDACTED'))

        // Connect to relay (single WebSocket connection)
        const ws = await new Promise<WebSocket>((resolve, reject) => {
          const socket = new WebSocket(relayUrl)

          socket.onopen = () => {
            setTimeout(() => {
              console.log('✅ Connected to audio relay')
              resolve(socket)
            }, 100)
          }

          socket.onerror = (err) => {
            console.error('❌ WebSocket error for audio relay:', err)
            reject(new Error('Failed to connect to audio relay. Make sure the backend is running.'))
          }

          socket.onclose = () => {
            console.log('WebSocket closed for audio relay')
          }

          socket.onmessage = (event) => {
            setDebugStats(prev => ({ ...prev, messagesReceived: prev.messagesReceived + 1 }))
            console.log('Message from audio relay:', event.data)
          }
        })

        legacyWsRef.current = ws
        // Store relay socket in destinations map for compatibility with cleanup
        destinationWsRefs.current.set('relay', ws)

        // Start keepalive for relay socket
        keepAliveIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping', payload_length: null }) + '\n')
          }
        }, 30000)

        // Send audio-start to relay
        setLegacyStep('audio-start')
        const audioStartMsg = JSON.stringify({
          type: 'audio-start',
          data: { rate: 16000, width: 2, channels: 1, mode },
          payload_length: null
        }) + '\n'

        if (ws.readyState === WebSocket.OPEN) {
          ws.send(audioStartMsg)
          console.log('Sent audio-start to audio relay')
        }

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
          if (!legacyWsRef.current || legacyWsRef.current.readyState !== WebSocket.OPEN) return

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

          // STREAMING MODE: Send immediately to relay
          const headerMsg = JSON.stringify({
            type: 'audio-chunk',
            data: { rate: 16000, width: 2, channels: 1 },
            payload_length: pcmBuffer.byteLength
          }) + '\n'
          const audioData = new Uint8Array(pcmBuffer.buffer, pcmBuffer.byteOffset, pcmBuffer.byteLength)

          // Send to relay socket
          const relaySocket = legacyWsRef.current
          if (relaySocket && relaySocket.readyState === WebSocket.OPEN) {
            try {
              if (relaySocket.binaryType !== 'arraybuffer') {
                relaySocket.binaryType = 'arraybuffer'
              }
              relaySocket.send(headerMsg)
              relaySocket.send(audioData)
              chunkCountRef.current++
              setDebugStats(prev => ({ ...prev, chunksSent: chunkCountRef.current }))
            } catch (error) {
              console.error('Failed to send audio chunk to relay:', error)
            }
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
        // Set error state for dual-stream
        setLegacyStep('error')
        setLegacyError(error instanceof Error ? error.message : 'Dual-stream recording failed')
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

        const relaySocket = legacyWsRef.current
        if (relaySocket && relaySocket.readyState === WebSocket.OPEN) {
          // Send each accumulated chunk to relay
          for (const pcmBuffer of batchAudioChunksRef.current) {
            const headerMsg = JSON.stringify({
              type: 'audio-chunk',
              data: { rate: 16000, width: 2, channels: 1 },
              payload_length: pcmBuffer.byteLength
            }) + '\n'
            const audioData = new Uint8Array(pcmBuffer.buffer, pcmBuffer.byteOffset, pcmBuffer.byteLength)

            try {
              if (relaySocket.binaryType !== 'arraybuffer') {
                relaySocket.binaryType = 'arraybuffer'
              }
              relaySocket.send(headerMsg)
              relaySocket.send(audioData)
            } catch (error) {
              console.error('Failed to send batch audio chunk to relay:', error)
            }
          }

          console.log('Finished sending batch audio')
        }
        // Clear the batch buffer
        batchAudioChunksRef.current = []
      }

      // Send audio-stop to relay
      const audioStopMsg = JSON.stringify({
        type: 'audio-stop',
        data: { timestamp: Date.now() },
        payload_length: null
      }) + '\n'

      const relaySocket = legacyWsRef.current
      if (relaySocket && relaySocket.readyState === WebSocket.OPEN) {
        relaySocket.send(audioStopMsg)
        console.log('Sent audio-stop to relay')
      }

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

  // Get analyser - for dual-stream, get the mixed output analyser
  const analyser = isDualStream
    ? dualStream.getAnalyser('mixed')
    : legacyAnalyser

  return {
    currentStep,
    isRecording,
    recordingDuration,
    error,
    mode,
    availableDestinations,
    selectedDestinationIds,
    toggleDestination,
    availableAudioDevices,
    selectedAudioDeviceId,
    setSelectedAudioDevice: setSelectedAudioDeviceId,
    isOmiDevice,
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
