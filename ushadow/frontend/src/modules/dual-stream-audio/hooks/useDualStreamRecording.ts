/**
 * Dual-Stream Recording Hook
 *
 * Main React hook for dual-stream audio recording.
 * Portable - works with any backend via callback injection.
 *
 * @example
 * ```tsx
 * const recording = useDualStreamRecording({
 *   sampleRate: 16000,
 *   onAudioChunk: async (chunk) => {
 *     // Send to your backend (WebSocket, HTTP, etc.)
 *     await sendToBackend(chunk)
 *   }
 * })
 *
 * // Start recording
 * await recording.startRecording('dual-stream')
 *
 * // Stop recording
 * recording.stopRecording()
 * ```
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import type {
  DualStreamConfig,
  RecordingMode,
  RecordingState,
  RecordingStats,
  StreamInfo,
  DualStreamRecordingHook
} from '../core/types'
import { AudioRecordingError } from '../core/types'
import { AudioStreamMixer } from '../core/audioMixer'
import { AudioProcessor } from '../core/audioProcessor'
import {
  captureMicrophone,
  captureDisplayMedia,
  stopStream,
  monitorStreamEnded
} from '../core/streamCapture'
import { formatDuration } from '../utils/audioUtils'
import { getBrowserCapabilities } from '../utils/browserCompat'

export function useDualStreamRecording(
  config: DualStreamConfig
): DualStreamRecordingHook {
  // State
  const [state, setState] = useState<RecordingState>('idle')
  const [mode, setMode] = useState<RecordingMode>('microphone-only')
  const [isRecording, setIsRecording] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [activeStreams, setActiveStreams] = useState<StreamInfo[]>([])

  // Refs
  const mixerRef = useRef<AudioStreamMixer | null>(null)
  const processorRef = useRef<AudioProcessor | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const displayStreamRef = useRef<MediaStream | null>(null)
  const durationIntervalRef = useRef<ReturnType<typeof setInterval>>()
  const cleanupCallbacksRef = useRef<(() => void)[]>([])

  /**
   * Cleanup all resources
   */
  const cleanup = useCallback(async () => {
    console.log('🧹 Cleaning up dual-stream recording')

    // Stop streams
    stopStream(micStreamRef.current)
    stopStream(displayStreamRef.current)
    micStreamRef.current = null
    displayStreamRef.current = null

    // Cleanup processor
    processorRef.current?.cleanup()
    processorRef.current = null

    // Cleanup mixer
    await mixerRef.current?.cleanup()
    mixerRef.current = null

    // Clear duration interval
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current)
      durationIntervalRef.current = undefined
    }

    // Run cleanup callbacks (stream monitors, etc.)
    cleanupCallbacksRef.current.forEach(cb => cb())
    cleanupCallbacksRef.current = []

    setActiveStreams([])
  }, [])

  /**
   * Start recording
   *
   * @param recordingMode - The recording mode ('microphone-only' or 'dual-stream')
   * @param preCaptur edDisplayStream - Optional pre-captured display stream (for dual-stream mode)
   *                                      This is important for browser security: getDisplayMedia()
   *                                      must be called from a user gesture, so we capture it early
   */
  const startRecording = useCallback(
    async (recordingMode: RecordingMode, preCapturedDisplayStream?: MediaStream) => {
      try {
        // Check browser compatibility
        const capabilities = getBrowserCapabilities()
        if (!capabilities.isSupported) {
          throw new AudioRecordingError(
            'Your browser does not support audio recording',
            'UNSUPPORTED_BROWSER'
          )
        }

        if (recordingMode === 'dual-stream' && !capabilities.hasGetDisplayMedia) {
          throw new AudioRecordingError(
            'Dual-stream mode is not supported in your browser',
            'UNSUPPORTED_BROWSER'
          )
        }

        setError(null)
        setMode(recordingMode)
        setState('requesting-mic')

        // Step 1: Capture microphone
        console.log('🎤 Step 1: Capturing microphone...')
        const micStream = await captureMicrophone(config.microphoneConstraints)
        micStreamRef.current = micStream

        // Monitor mic stream for ended event
        const micCleanup = monitorStreamEnded(micStream, () => {
          console.warn('⚠️  Microphone stream ended unexpectedly')
          stopRecording()
        })
        cleanupCallbacksRef.current.push(micCleanup)

        // Step 2: Capture display media (if dual-stream mode)
        let displayStream: MediaStream | null = null
        if (recordingMode === 'dual-stream') {
          if (preCapturedDisplayStream) {
            // Use pre-captured stream (already requested in user gesture context)
            console.log('🖥️  Step 2: Using pre-captured display stream')
            displayStream = preCapturedDisplayStream

            // Log stream details
            const audioTracks = displayStream.getAudioTracks()
            const videoTracks = displayStream.getVideoTracks()
            console.log('📊 Pre-captured stream status:', {
              audioTracks: audioTracks.length,
              videoTracks: videoTracks.length,
              audioEnabled: audioTracks[0]?.enabled,
              audioMuted: audioTracks[0]?.muted,
              audioReadyState: audioTracks[0]?.readyState,
              audioLabel: audioTracks[0]?.label
            })
          } else {
            // Fallback: capture display media now (may fail if not in user gesture context)
            setState('requesting-display')
            console.log('🖥️  Step 2: Capturing display media...')
            displayStream = await captureDisplayMedia(config.displayConstraints?.audio)
          }

          displayStreamRef.current = displayStream

          // Monitor display stream for ended event
          const displayCleanup = monitorStreamEnded(displayStream, () => {
            console.warn('⚠️  Display stream ended (user stopped sharing)')
            stopRecording()
          })
          cleanupCallbacksRef.current.push(displayCleanup)
        }

        // Step 3: Set up audio mixer
        setState('setting-up-mixer')
        console.log('🎛️  Step 3: Setting up audio mixer...')

        const mixer = new AudioStreamMixer(config.sampleRate)
        await mixer.initialize()
        mixerRef.current = mixer

        // Add streams to mixer
        const micStreamId = mixer.addStream(micStream, 'microphone', 1.0)
        console.log('✅ Added microphone stream to mixer:', micStreamId)

        const streamIds: string[] = [micStreamId]
        const streamTypes: Array<'microphone' | 'display'> = ['microphone']

        if (displayStream) {
          console.log('➕ Adding display stream to mixer...')
          const displayAudioTracks = displayStream.getAudioTracks()
          console.log('📊 Display stream before adding to mixer:', {
            audioTracks: displayAudioTracks.length,
            audioEnabled: displayAudioTracks[0]?.enabled,
            audioMuted: displayAudioTracks[0]?.muted,
            audioReadyState: displayAudioTracks[0]?.readyState
          })

          const displayStreamId = mixer.addStream(displayStream, 'display', 1.0)
          console.log('✅ Added display stream to mixer:', displayStreamId)
          streamIds.push(displayStreamId)
          streamTypes.push('display')
        } else {
          console.warn('⚠️  No display stream to add to mixer')
        }

        // Update active streams
        const activeStreams = mixer.getActiveStreams()
        console.log('📊 Active streams in mixer:', activeStreams)
        setActiveStreams(activeStreams)

        // Get mixed output stream
        const mixedStream = mixer.getMixedStream()
        if (!mixedStream) {
          throw new Error('Failed to get mixed stream from mixer')
        }

        // Step 4: Set up audio processor
        console.log('🔧 Step 4: Setting up audio processor...')

        const audioContext = new AudioContext({ sampleRate: config.sampleRate })
        const source = audioContext.createMediaStreamSource(mixedStream)

        const processor = new AudioProcessor(audioContext, {
          sampleRate: config.sampleRate,
          channelCount: config.channelCount,
          bufferSize: config.bufferSize,
          onAudioChunk: config.onAudioChunk,
          streamTypes
        })

        processor.connect(source)
        processor.connectToDestination(audioContext.destination)
        processorRef.current = processor

        // Wait brief moment for stabilization
        await new Promise(resolve => setTimeout(resolve, 100))

        // Start processing
        processor.start()

        // Mark as recording
        setState('recording')
        setIsRecording(true)
        setRecordingDuration(0)

        // Start duration timer
        durationIntervalRef.current = setInterval(() => {
          setRecordingDuration(prev => prev + 1)
        }, 1000)

        // Notify state change
        config.onStateChange?.('recording')

        console.log('🎉 Recording started successfully in', recordingMode, 'mode')
      } catch (err) {
        console.error('❌ Recording failed:', err)

        const recordingError =
          err instanceof AudioRecordingError
            ? err
            : new AudioRecordingError(
                err instanceof Error ? err.message : 'Recording failed',
                'UNKNOWN_ERROR',
                err as Error
              )

        setState('error')
        setError(recordingError)
        config.onError?.(recordingError)

        // Cleanup on error
        await cleanup()
      }
    },
    [config, cleanup]
  )

  /**
   * Stop recording
   */
  const stopRecording = useCallback(async () => {
    if (!isRecording) return

    console.log('🛑 Stopping recording')
    setState('stopping')

    // Stop processing
    processorRef.current?.stop()

    // Cleanup resources
    await cleanup()

    // Reset state
    setIsRecording(false)
    setRecordingDuration(0)
    setState('idle')

    // Notify state change
    config.onStateChange?.('idle')

    console.log('✅ Recording stopped')
  }, [isRecording, cleanup, config])

  /**
   * Set gain for a specific stream
   */
  const setStreamGain = useCallback((streamId: string, gain: number) => {
    if (!mixerRef.current) {
      console.warn('Mixer not initialized')
      return
    }

    const success = mixerRef.current.setStreamGain(streamId, gain)
    if (success) {
      // Update active streams with new gain value
      setActiveStreams(mixerRef.current.getActiveStreams())
    }
  }, [])

  /**
   * Get analyser for a stream type (or 'mixed' for the mixed output)
   */
  const getAnalyser = useCallback(
    (streamType: 'microphone' | 'display' | 'mixed'): AnalyserNode | null => {
      if (!mixerRef.current) return null
      if (streamType === 'mixed') {
        return mixerRef.current.getMixedAnalyser()
      }
      return mixerRef.current.getAnalyserByType(streamType)
    },
    []
  )

  /**
   * Get recording statistics
   */
  const getStats = useCallback((): RecordingStats => {
    const processorStats = processorRef.current?.getStats() || {
      chunksProcessed: 0,
      bytesProcessed: 0,
      averageLevel: 0,
      peakLevel: 0
    }

    return {
      recordingDuration,
      chunksProcessed: processorStats.chunksProcessed,
      bytesProcessed: processorStats.bytesProcessed,
      activeStreams: activeStreams.map(s => s.type),
      averageLevel: processorStats.averageLevel,
      peakLevel: processorStats.peakLevel
    }
  }, [recordingDuration, activeStreams])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup()
    }
  }, [cleanup])

  return {
    state,
    mode,
    isRecording,
    error,
    stats: getStats(),
    activeStreams,
    startRecording,
    stopRecording,
    setStreamGain,
    formatDuration,
    getAnalyser
  }
}
