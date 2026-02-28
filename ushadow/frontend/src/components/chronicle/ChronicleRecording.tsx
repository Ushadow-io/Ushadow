import { useEffect, useRef } from 'react'
import { Mic, MicOff, Loader2, Zap, Archive, AlertCircle, Monitor, Info } from 'lucide-react'
import { Link } from 'react-router-dom'
import { WebRecordingReturn, RecordingStep } from '../../hooks/useWebRecording'

interface ChronicleRecordingProps {
  onAuthRequired?: () => void
  recording: WebRecordingReturn
}

const getStepText = (step: RecordingStep): string => {
  switch (step) {
    case 'idle': return 'Ready to Record'
    case 'mic': return 'Getting Microphone Access...'
    case 'display': return 'Requesting Tab/Screen Audio...'
    case 'websocket': return 'Connecting to Audio Services...'
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

  const startButtonDisabled =
    !recording.canAccessMicrophone ||
    isProcessing(recording.currentStep) ||
    recording.isRecording ||
    recording.selectedDestinationIds.length === 0

  return (
    <div className="space-y-6" data-testid="chronicle-recording">
      {/* Audio Source Selection */}
      {recording.availableAudioDevices.length > 0 && (
        <div className="card p-4" data-testid="audio-source-selection">
          <h3 className="font-medium text-neutral-900 dark:text-neutral-100 mb-3">Audio Source</h3>
          <select
            value={recording.selectedAudioDeviceId || ''}
            onChange={(e) => recording.setSelectedAudioDevice(e.target.value)}
            disabled={recording.isRecording}
            className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="audio-device-select"
          >
            {recording.availableAudioDevices.map(device => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Microphone ${device.deviceId.substring(0, 8)}`}
              </option>
            ))}
          </select>
          {recording.isOmiDevice && (
            <p className="mt-2 text-sm text-purple-600 dark:text-purple-400">
              🎤 OMI device detected - using Opus format (/ws_omi)
            </p>
          )}
          {!recording.isOmiDevice && recording.selectedAudioDeviceId && (
            <p className="mt-2 text-sm text-blue-600 dark:text-blue-400">
              🎤 Phone microphone - using PCM format (/ws_pcm)
            </p>
          )}
        </div>
      )}

      {/* Destination Selection */}
      <div className="card p-4" data-testid="destination-selection">
        <h3 className="font-medium text-neutral-900 dark:text-neutral-100 mb-3">Audio Destinations</h3>

        {recording.availableDestinations.length > 0 ? (
          <>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-3">
              Select where to send audio (multi-select):
            </p>
            <div className="space-y-2">
              {recording.availableDestinations.map(dest => (
                <label
                  key={dest.instance_id}
                  className="flex items-center gap-3 p-2 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
                  data-testid={`destination-${dest.instance_id}`}
                >
                  <input
                    type="checkbox"
                    checked={recording.selectedDestinationIds.includes(dest.instance_id)}
                    onChange={() => recording.toggleDestination(dest.instance_id)}
                    disabled={recording.isRecording}
                    className="w-4 h-4 text-primary-600 rounded focus:ring-2 focus:ring-primary-500"
                  />
                  <span className="text-neutral-900 dark:text-neutral-100 font-medium">
                    {dest.instance_name}
                  </span>
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">
                    ({dest.metadata?.protocol || 'unknown'} • {dest.metadata?.data || 'unknown'})
                  </span>
                  {dest.status === 'running' && (
                    <span className="text-xs text-green-600 dark:text-green-400">●</span>
                  )}
                </label>
              ))}
            </div>
            {recording.selectedDestinationIds.length === 0 && (
              <p className="mt-2 text-sm text-amber-600 dark:text-amber-400">
                ⚠️ Select at least one destination to record
              </p>
            )}
          </>
        ) : (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4" data-testid="no-destinations-info">
            <div className="flex items-start space-x-3">
              <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
                  No Audio Destinations Available
                </h4>
                <p className="text-sm text-blue-700 dark:text-blue-300 mb-3">
                  No running services are currently exposing audio intake endpoints. To record audio, you need to deploy and start an audio consumer service like Chronicle or Mycelia.
                </p>
                <div className="space-y-2">
                  <p className="text-sm text-blue-700 dark:text-blue-300 font-medium">Quick Setup:</p>
                  <ol className="text-sm text-blue-700 dark:text-blue-300 space-y-1 list-decimal list-inside">
                    <li>Go to <Link to="/services" className="underline hover:text-blue-800 dark:hover:text-blue-200">Services</Link> and install Chronicle or Mycelia</li>
                    <li>Make sure the service is deployed and running (status: "running")</li>
                    <li>Return to this page to select the audio destination</li>
                  </ol>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

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
          <div className="mt-2 text-xs text-purple-600 dark:text-purple-400 space-y-1">
            <p className="font-semibold">⚠️ Important: Select "Chrome Tab" (not "Your Entire Screen")</p>
            <ol className="list-decimal list-inside space-y-0.5 pl-2">
              <li>Click "Chrome Tab" at the top of the picker</li>
              <li>Select the tab with audio (YouTube, meeting, etc.)</li>
              <li>Check "Share tab audio" at the bottom</li>
              <li>Click Share</li>
            </ol>
          </div>
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

      {/* Live Transcript */}
      {recording.liveTranscript.some(e => e.finalText || e.interimText) && (
        <div className="card p-4" data-testid="live-transcript">
          <h3 className="font-medium text-neutral-900 dark:text-neutral-100 mb-3">Live Transcript</h3>
          <div className="space-y-3">
            {recording.liveTranscript.map(entry => (
              <div key={entry.source} data-testid={`transcript-source-${entry.source}`}>
                <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
                  {entry.source}
                </span>
                <p className="mt-1 text-sm text-neutral-900 dark:text-neutral-100 leading-relaxed">
                  {entry.finalText}
                  {entry.interimText && (
                    <span className="italic text-neutral-500 dark:text-neutral-400">
                      {entry.interimText}
                    </span>
                  )}
                </p>
              </div>
            ))}
          </div>
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
