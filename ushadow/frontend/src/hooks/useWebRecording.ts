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
import { deploymentsApi, ExposedUrl, BACKEND_URL } from '../services/api'
import { getStorageKey } from '../utils/storage'
import { useDualStreamRecording } from '../modules/dual-stream-audio/hooks/useDualStreamRecording'
import { getBrowserCapabilities } from '../modules/dual-stream-audio/utils/browserCompat'
import { BrowserOpusSession } from '../protocol/audio-v2/browserOpusSession'
import { buildV2RelayUrl } from '../protocol/audio-v2/relayUrl'

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

export interface LiveTranscriptEntry {
  source: string
  finalText: string
  interimText: string
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
  liveTranscript: LiveTranscriptEntry[]

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
  const destinationsFetchedRef = useRef(false)

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

  // Fetch available destinations on mount (ref guard prevents StrictMode double-fetch)
  useEffect(() => {
    if (destinationsFetchedRef.current) return
    destinationsFetchedRef.current = true
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

  // Debug stats
  const [debugStats, setDebugStats] = useState<DebugStats>({
    chunksSent: 0,
    messagesReceived: 0,
    lastError: null,
    lastErrorTime: null,
    sessionStartTime: null,
    connectionAttempts: 0
  })

  // Live transcript - accumulated text from destination services (e.g. Chronicle Deepgram interim results)
  const transcriptBySourceRef = useRef<Record<string, { finalText: string; interimText: string }>>({})
  const [liveTranscript, setLiveTranscript] = useState<LiveTranscriptEntry[]>([])

  // Audio v2 session (one relay socket, Opus packets) and legacy-mode audio graph
  const sessionRef = useRef<BrowserOpusSession | null>(null)
  const activeDestinationsRef = useRef<ExposedUrl[]>([])
  const legacyStreamRef = useRef<MediaStream | null>(null)
  const legacyContextRef = useRef<AudioContext | null>(null)
  const legacyProcessorRef = useRef<ScriptProcessorNode | null>(null)
  const legacyAnalyserRef = useRef<AnalyserNode | null>(null)
  const durationIntervalRef = useRef<ReturnType<typeof setInterval>>()
  const chunkCountRef = useRef(0)
  const audioProcessingStartedRef = useRef(false)

  // Open an audio v2 session to the relay for the selected destinations
  const openSession = useCallback(async (
    token: string, destinations: ExposedUrl[], displayName: string, batch: boolean,
  ) => {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const relayBaseUrl = BACKEND_URL ? BACKEND_URL.replace(/^https?:/, wsProtocol) : `${wsProtocol}//${window.location.host}`
    const session = new BrowserOpusSession({
      url: buildV2RelayUrl(relayBaseUrl, destinations),
      bearerToken: token,
      displayName,
      batch,
      onPacketsSent: count => {
        chunkCountRef.current = count
        if (count % 25 === 0) setDebugStats(prev => ({ ...prev, chunksSent: count }))
      },
      onTranscript: (text, isFinal) => {
        setDebugStats(prev => ({ ...prev, messagesReceived: prev.messagesReceived + 1 }))
        const source = 'chronicle'
        const current = transcriptBySourceRef.current[source] || { finalText: '', interimText: '' }
        transcriptBySourceRef.current[source] = isFinal
          ? { finalText: current.finalText + (text ? text + ' ' : ''), interimText: '' }
          : { ...current, interimText: text }
        setLiveTranscript(
          Object.entries(transcriptBySourceRef.current).map(([src, entry]) => ({ source: src, ...entry }))
        )
      },
    })
    await session.start()
    sessionRef.current = session
    return session
  }, [])

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
    onAudioChunk: (chunk) => {
      sessionRef.current?.pushInt16(chunk.data)
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

    sessionRef.current?.stop()
    sessionRef.current = null
    activeDestinationsRef.current = []

    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current)
      durationIntervalRef.current = undefined
    }

    chunkCountRef.current = 0
  }, [])

  // Start recording (dispatches based on mode)
  const startRecording = useCallback(async () => {
    try {
      // Reset state
      chunkCountRef.current = 0
      transcriptBySourceRef.current = {}
      setLiveTranscript([])
      setDebugStats(prev => ({
        ...prev,
        chunksSent: 0,
        lastError: null,
        sessionStartTime: new Date(),
        connectionAttempts: prev.connectionAttempts + 1
      }))

      // Get auth token - prefer Casdoor token, fallback to legacy token
      // This matches the pattern used in api.ts request interceptor
      const casdoorToken = localStorage.getItem('casdoor_access_token')
      const legacyToken = localStorage.getItem(getStorageKey('token'))
      const token = casdoorToken || legacyToken

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

          // One audio v2 session through the relay; mixed PCM is encoded to Opus
          await openSession(token, destinations, 'ushadow-dual-stream', false)

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

        // One audio v2 session through the relay (connect + StartCapture)
        setLegacyStep('audio-start')
        await openSession(token, destinations, 'ushadow-web', mode === 'batch')

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

        // Encode to Opus and send (batch mode keeps packets until stop)
        processor.onaudioprocess = (event) => {
          if (!audioProcessingStartedRef.current) return
          sessionRef.current?.push(event.inputBuffer.getChannelData(0).slice())
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
        sessionRef.current?.stop()
        sessionRef.current = null
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
  }, [mode, canAccessMicrophone, dualStream, legacyCleanup, openSession, availableDestinations,
    selectedDestinationIds, selectedAudioDeviceId])

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

      // StopCapture and close the v2 session
      await sessionRef.current?.stop()
      sessionRef.current = null

      setLegacyDuration(0)

    } else {
      // Stop legacy recording
      audioProcessingStartedRef.current = false

      // Flush the encoder, send any batched packets, then StopCapture
      await sessionRef.current?.stop()
      sessionRef.current = null
      setDebugStats(prev => ({ ...prev, chunksSent: chunkCountRef.current }))

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
    liveTranscript,
    formatDuration,
    canAccessMicrophone,
    canAccessDualStream
  }
}

/** @deprecated Use useWebRecording instead */
export const useChronicleRecording = useWebRecording
