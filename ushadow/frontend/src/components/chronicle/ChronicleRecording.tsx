import { useEffect, useRef } from 'react'
import { Mic, MicOff, Loader2, Zap, Archive, AlertCircle, Monitor } from 'lucide-react'
import { ChronicleRecordingReturn, RecordingStep } from '../../hooks/useChronicleRecording'

interface ChronicleRecordingProps {
  onAuthRequired?: () => void
  recording: ChronicleRecordingReturn
}

const getStepText = (step: RecordingStep): string => {
  switch (step) {
    case 'idle': return 'Ready to Record'
    case 'mic': return 'Getting Microphone Access...'
    case 'display': return 'Requesting Tab/Screen Audio...'
    case 'websocket': return 'Connecting to Chronicle...'
    case 'audio-start': return 'Initializing Audio Session...'
    case 'streaming': return 'Starting Audio Stream...'
    case 'stopping': return 'Stopping Recording...'
    case 'error': return 'Error Occurred'
    default: return 'Processing...'
  }
}

const getButtonColor = (step: RecordingStep, isRecording: boolean): string => {
  if (step === 'error') return 'bg-red-600 hover:bg-red-700'
  if (isRecording) return 'bg-red-600 hover:bg-red-700'
  if (step === 'idle') return 'bg-primary-600 hover:bg-primary-700'
  return 'bg-amber-600 hover:bg-amber-700'
}

const isProcessing = (step: RecordingStep): boolean => {
  return ['mic', 'display', 'websocket', 'audio-start', 'streaming', 'stopping'].includes(step)
}

export default function ChronicleRecording({ onAuthRequired, recording }: ChronicleRecordingProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>()

  // Audio visualizer - depends on both analyser and isRecording to handle timing
  useEffect(() => {
    // Wait for both analyser to be ready AND canvas to be rendered (requires isRecording=true)
    if (!recording.analyser || !recording.isRecording || !canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const analyser = recording.analyser
    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)

    const draw = () => {
      // Stop if no longer recording
      if (!recording.isRecording) return

      animationRef.current = requestAnimationFrame(draw)

      analyser.getByteFrequencyData(dataArray)

      ctx.fillStyle = 'rgb(23, 23, 23)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      const barWidth = (canvas.width / bufferLength) * 2.5
      let x = 0

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height

        const hue = (i / bufferLength) * 120 + 200 // Blue to purple gradient
        ctx.fillStyle = `hsl(${hue}, 70%, 50%)`
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight)

        x += barWidth + 1
      }
    }

    draw()

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [recording.analyser, recording.isRecording])

  // Check for auth errors
  useEffect(() => {
    if (recording.error?.includes('authentication') || recording.error?.includes('token')) {
      onAuthRequired?.()
    }
  }, [recording.error, onAuthRequired])

  const startButtonDisabled = !recording.canAccessMicrophone || isProcessing(recording.currentStep) || recording.isRecording

  return (
    <div className="space-y-6" data-testid="chronicle-recording">
      {/* Mode Toggle */}
      <div className="card p-4" data-testid="recording-mode-toggle">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-medium text-neutral-900 dark:text-neutral-100">Recording Mode</h3>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => recording.setMode('streaming')}
              disabled={recording.isRecording}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all
                ${recording.mode === 'streaming'
                  ? 'bg-primary-600 text-white shadow-md'
                  : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-300 dark:hover:bg-neutral-600'
                }
                ${recording.isRecording ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              `}
              data-testid="mode-streaming"
            >
              <Zap className="h-4 w-4" />
              <span>Streaming</span>
            </button>
            <button
              onClick={() => recording.setMode('batch')}
              disabled={recording.isRecording}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all
                ${recording.mode === 'batch'
                  ? 'bg-primary-600 text-white shadow-md'
                  : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-300 dark:hover:bg-neutral-600'
                }
                ${recording.isRecording ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              `}
              data-testid="mode-batch"
            >
              <Archive className="h-4 w-4" />
              <span>Batch</span>
            </button>
            {recording.canAccessDualStream && (
              <button
                onClick={() => recording.setMode('dual-stream')}
                disabled={recording.isRecording}
                className={`
                  flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all
                  ${recording.mode === 'dual-stream'
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-300 dark:hover:bg-neutral-600'
                  }
                  ${recording.isRecording ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                `}
                data-testid="mode-dual-stream"
              >
                <Monitor className="h-4 w-4" />
                <span>Dual Stream</span>
              </button>
            )}
          </div>
        </div>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          {recording.mode === 'streaming'
            ? 'Audio is sent in real-time and processed immediately.'
            : recording.mode === 'batch'
              ? 'Audio is accumulated and sent as a complete file when you stop.'
              : 'Captures both microphone AND browser tab/screen audio mixed together.'
          }
        </p>
        {recording.mode === 'dual-stream' && (
          <p className="mt-1 text-xs text-purple-600 dark:text-purple-400">
            You'll be prompted to select a browser tab or screen to capture audio from.
          </p>
        )}
      </div>

      {/* Main Recording Control */}
      <div className="card p-8" data-testid="recording-controls">
        <div className="text-center">
          {/* Control Buttons */}
          <div className="mb-6 flex justify-center space-x-4">
            {/* START Button */}
            <button
              onClick={recording.startRecording}
              disabled={startButtonDisabled}
              className={`w-24 h-24 ${recording.isRecording || isProcessing(recording.currentStep) ? 'bg-neutral-400' : getButtonColor(recording.currentStep, recording.isRecording)} text-white rounded-full flex items-center justify-center transition-all duration-200 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 active:scale-95`}
              data-testid="record-start-button"
            >
              {isProcessing(recording.currentStep) ? (
                <Loader2 className="h-10 w-10 animate-spin" />
              ) : (
                <Mic className="h-10 w-10" />
              )}
            </button>

            {/* STOP Button - only show when recording */}
            {recording.isRecording && (
              <button
                onClick={recording.stopRecording}
                className="w-24 h-24 bg-red-600 hover:bg-red-700 text-white rounded-full flex items-center justify-center transition-all duration-200 shadow-lg transform hover:scale-105 active:scale-95"
                data-testid="record-stop-button"
              >
                <MicOff className="h-10 w-10" />
              </button>
            )}
          </div>

          {/* Status Text */}
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
              {recording.isRecording ? 'Recording in Progress' : getStepText(recording.currentStep)}
            </h2>

            {/* Recording Duration */}
            {recording.isRecording && (
              <p className="text-3xl font-mono text-primary-600 dark:text-primary-400" data-testid="recording-duration">
                {recording.formatDuration(recording.recordingDuration)}
              </p>
            )}

            {/* Action Text */}
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              {recording.isRecording
                ? 'Click the red STOP button to end recording'
                : recording.currentStep === 'idle'
                  ? 'Click the blue START button to begin recording'
                  : recording.currentStep === 'error'
                    ? 'Click START to try again'
                    : 'Please wait while setting up...'}
            </p>

            {/* Error Message */}
            {recording.error && (
              <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center justify-center space-x-2" data-testid="recording-error">
                <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                <span className="text-sm text-red-700 dark:text-red-300">{recording.error}</span>
              </div>
            )}

            {/* Security Warning */}
            {!recording.canAccessMicrophone && (
              <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg" data-testid="https-warning">
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  <strong>Secure Access Required:</strong> Microphone access requires HTTPS or localhost
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Audio Visualizer */}
      {recording.isRecording && (
        <div className="card p-4" data-testid="audio-visualizer">
          <h3 className="font-medium text-neutral-900 dark:text-neutral-100 mb-3">Audio Waveform</h3>
          <canvas
            ref={canvasRef}
            width={600}
            height={100}
            className="w-full h-24 rounded-lg bg-neutral-900"
          />
        </div>
      )}

      {/* Debug Stats */}
      {(recording.isRecording || recording.debugStats.chunksSent > 0) && (
        <div className="card p-4" data-testid="recording-debug-stats">
          <h3 className="font-medium text-neutral-900 dark:text-neutral-100 mb-3">Recording Stats</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-neutral-500 dark:text-neutral-400">Chunks Sent</span>
              <p className="font-mono text-neutral-900 dark:text-neutral-100">{recording.debugStats.chunksSent}</p>
            </div>
            <div>
              <span className="text-neutral-500 dark:text-neutral-400">Messages Received</span>
              <p className="font-mono text-neutral-900 dark:text-neutral-100">{recording.debugStats.messagesReceived}</p>
            </div>
            <div>
              <span className="text-neutral-500 dark:text-neutral-400">Connection Attempts</span>
              <p className="font-mono text-neutral-900 dark:text-neutral-100">{recording.debugStats.connectionAttempts}</p>
            </div>
            <div>
              <span className="text-neutral-500 dark:text-neutral-400">Session Started</span>
              <p className="font-mono text-neutral-900 dark:text-neutral-100">
                {recording.debugStats.sessionStartTime?.toLocaleTimeString() || '-'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-lg p-4">
        <h3 className="font-medium text-primary-800 dark:text-primary-200 mb-2">
          📝 How it Works
        </h3>
        <ul className="text-sm text-primary-700 dark:text-primary-300 space-y-1">
          <li>• <strong>Streaming:</strong> Real-time audio sent immediately for instant processing</li>
          <li>• <strong>Batch:</strong> Audio accumulated and sent when you stop recording</li>
          {recording.canAccessDualStream && (
            <li>• <strong>Dual Stream:</strong> Record microphone + browser tab audio together (great for meetings/videos)</li>
          )}
          <li>• <strong>High quality audio:</strong> 16kHz mono with noise suppression and echo cancellation</li>
          <li>• <strong>View results:</strong> Check the Conversations tab for transcribed content and memories</li>
        </ul>
      </div>
    </div>
  )
}
