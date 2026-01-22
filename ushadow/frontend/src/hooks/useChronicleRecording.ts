/**
 * Chronicle Recording Hook with Dual-Stream Support
 *
 * Supports three recording modes:
 * - 'streaming': Real-time microphone audio sent immediately
 * - 'batch': Microphone audio accumulated and sent when stopped
 * - 'dual-stream': Microphone + browser tab/screen audio mixed together
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import { getChronicleWebSocketUrl, getChronicleDirectUrl } from '../services/chronicleApi'
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

export interface ChronicleRecordingReturn {
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

export const useChronicleRecording = (): ChronicleRecordingReturn => {
  // Mode state
  const [mode, setMode] = useState<RecordingMode>('streaming')

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
  const legacyStreamRef = useRef<MediaStream | null>(null)
  const legacyContextRef = useRef<AudioContext | null>(null)
  const legacyProcessorRef = useRef<ScriptProcessorNode | null>(null)
  const legacyAnalyserRef = useRef<AnalyserNode | null>(null)
  const durationIntervalRef = useRef<ReturnType<typeof setInterval>>()
  const keepAliveIntervalRef = useRef<ReturnType<typeof setInterval>>()
  const chunkCountRef = useRef(0)
  const audioProcessingStartedRef = useRef(false)

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

    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current)
      durationIntervalRef.current = undefined
    }

    if (keepAliveIntervalRef.current) {
      clearInterval(keepAliveIntervalRef.current)
      keepAliveIntervalRef.current = undefined
    }

    chunkCountRef.current = 0
  }, [])

  // Start recording (dispatches based on mode)
  const startRecording = useCallback(async () => {
    try {
      // Reset state
      chunkCountRef.current = 0
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

        // Connect WebSocket
        setLegacyStep('websocket')
        const baseWsUrl = await getChronicleWebSocketUrl('/ws_pcm')
        const wsUrl = `${baseWsUrl}?token=${token}&device_name=ushadow-recorder`

        const ws = await new Promise<WebSocket>((resolve, reject) => {
          const socket = new WebSocket(wsUrl)

          socket.onopen = () => {
            setTimeout(() => {
              legacyWsRef.current = socket

              // Start keepalive
              keepAliveIntervalRef.current = setInterval(() => {
                if (socket.readyState === WebSocket.OPEN) {
                  socket.send(JSON.stringify({ type: 'ping', payload_length: null }) + '\n')
                }
              }, 30000)

              resolve(socket)
            }, 100)
          }

          socket.onerror = () => reject(new Error('Failed to connect to Chronicle backend'))
          socket.onmessage = () => {
            setDebugStats(prev => ({ ...prev, messagesReceived: prev.messagesReceived + 1 }))
          }
        })

        // Send audio-start
        setLegacyStep('audio-start')
        ws.send(JSON.stringify({
          type: 'audio-start',
          data: { rate: 16000, width: 2, channels: 1, mode },
          payload_length: null
        }) + '\n')

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
          if (!ws || ws.readyState !== WebSocket.OPEN) return
          if (!audioProcessingStartedRef.current) return

          const inputData = event.inputBuffer.getChannelData(0)
          const pcmBuffer = new Int16Array(inputData.length)

          for (let i = 0; i < inputData.length; i++) {
            const sample = Math.max(-1, Math.min(1, inputData[i]))
            pcmBuffer[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF
          }

          try {
            if (ws.binaryType !== 'arraybuffer') {
              ws.binaryType = 'arraybuffer'
            }

            ws.send(JSON.stringify({
              type: 'audio-chunk',
              data: { rate: 16000, width: 2, channels: 1 },
              payload_length: pcmBuffer.byteLength
            }) + '\n')
            ws.send(new Uint8Array(pcmBuffer.buffer, pcmBuffer.byteOffset, pcmBuffer.byteLength))

            chunkCountRef.current++
            setDebugStats(prev => ({ ...prev, chunksSent: chunkCountRef.current }))
          } catch (error) {
            console.error('Failed to send audio chunk:', error)
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

      if (legacyWsRef.current?.readyState === WebSocket.OPEN) {
        legacyWsRef.current.send(JSON.stringify({
          type: 'audio-stop',
          data: { timestamp: Date.now() },
          payload_length: null
        }) + '\n')
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
