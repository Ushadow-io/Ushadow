/**
 * Dual-Stream Audio Recording Module
 *
 * Portable, zero-dependency audio recording module for capturing
 * microphone + screen/tab audio in the browser.
 *
 * Designed to be extracted and reused across projects.
 */

// ============================================================================
// Core Types
// ============================================================================

export type RecordingMode = 'microphone-only' | 'dual-stream'

export type RecordingState =
  | 'idle'
  | 'requesting-mic'
  | 'requesting-display'
  | 'setting-up-mixer'
  | 'recording'
  | 'stopping'
  | 'error'

export type StreamType = 'microphone' | 'display'

// ============================================================================
// Audio Metadata
// ============================================================================

export interface AudioMetadata {
  sampleRate: number
  channelCount: number
  bufferSize: number
  timestamp: number
  streamTypes: StreamType[]  // Which streams contributed to this chunk
}

export interface AudioChunk {
  data: Int16Array
  metadata: AudioMetadata
}

// ============================================================================
// Stream Information
// ============================================================================

export interface StreamInfo {
  id: string
  type: StreamType
  stream: MediaStream
  active: boolean
  gainValue: number
}

// ============================================================================
// Configuration
// ============================================================================

export interface AudioConstraints {
  sampleRate?: number
  channelCount?: number
  echoCancellation?: boolean
  noiseSuppression?: boolean
  autoGainControl?: boolean
}

export interface DualStreamConfig {
  // Audio processing settings
  sampleRate: number
  channelCount: number
  bufferSize: number

  // Microphone constraints
  microphoneConstraints?: AudioConstraints

  // Display media constraints
  displayConstraints?: {
    audio: AudioConstraints
    video?: boolean
  }

  // Backend integration (dependency injection)
  onAudioChunk: (chunk: AudioChunk) => void | Promise<void>
  onError?: (error: Error) => void
  onStateChange?: (state: RecordingState) => void
  onStreamAdded?: (stream: StreamInfo) => void
  onStreamRemoved?: (streamId: string) => void

  // Feature flags
  enableMixing?: boolean
  enableVisualization?: boolean
  autoStartProcessing?: boolean
}

// ============================================================================
// Recording Statistics
// ============================================================================

export interface RecordingStats {
  recordingDuration: number
  chunksProcessed: number
  bytesProcessed: number
  activeStreams: StreamType[]
  averageLevel: number
  peakLevel: number
}

// ============================================================================
// Error Types
// ============================================================================

export class AudioRecordingError extends Error {
  constructor(
    message: string,
    public code: AudioErrorCode,
    public originalError?: Error
  ) {
    super(message)
    this.name = 'AudioRecordingError'
  }
}

export type AudioErrorCode =
  | 'MICROPHONE_PERMISSION_DENIED'
  | 'DISPLAY_PERMISSION_DENIED'
  | 'AUDIO_CONTEXT_FAILED'
  | 'STREAM_CAPTURE_FAILED'
  | 'MIXING_FAILED'
  | 'PROCESSING_FAILED'
  | 'UNSUPPORTED_BROWSER'
  | 'UNKNOWN_ERROR'

// ============================================================================
// Browser Capability Detection
// ============================================================================

export interface BrowserCapabilities {
  hasGetUserMedia: boolean
  hasGetDisplayMedia: boolean
  hasAudioContext: boolean
  hasScriptProcessor: boolean
  canCaptureTabAudio: boolean
  canCaptureWindowAudio: boolean
  requiresHttps: boolean
  isSupported: boolean
}

// ============================================================================
// Export utility type for hook returns
// ============================================================================

export interface DualStreamRecordingHook {
  // State
  state: RecordingState
  mode: RecordingMode
  isRecording: boolean
  error: Error | null
  stats: RecordingStats

  // Stream management
  activeStreams: StreamInfo[]

  // Controls
  startRecording: (mode: RecordingMode, preCapturedDisplayStream?: MediaStream) => Promise<void>
  stopRecording: () => void
  setStreamGain: (streamId: string, gain: number) => void

  // Utilities
  formatDuration: (seconds: number) => string
  getAnalyser: (streamType: StreamType | 'mixed') => AnalyserNode | null
}
