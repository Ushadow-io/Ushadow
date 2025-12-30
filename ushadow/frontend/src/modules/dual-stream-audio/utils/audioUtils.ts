/**
 * Audio Utility Functions
 *
 * Pure utility functions for audio processing.
 * No dependencies - works anywhere.
 */

/**
 * Convert Float32Array audio samples to Int16 PCM
 */
export function float32ToInt16(float32Array: Float32Array): Int16Array {
  const int16Array = new Int16Array(float32Array.length)

  for (let i = 0; i < float32Array.length; i++) {
    // Clamp to [-1, 1] range
    const sample = Math.max(-1, Math.min(1, float32Array[i]))

    // Convert to 16-bit PCM
    int16Array[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF
  }

  return int16Array
}

/**
 * Calculate RMS (Root Mean Square) audio level
 * Returns value between 0 and 1
 */
export function calculateRMS(samples: Float32Array): number {
  let sum = 0
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i]
  }
  return Math.sqrt(sum / samples.length)
}

/**
 * Calculate peak audio level
 * Returns value between 0 and 1
 */
export function calculatePeak(samples: Float32Array): number {
  let peak = 0
  for (let i = 0; i < samples.length; i++) {
    const absSample = Math.abs(samples[i])
    if (absSample > peak) {
      peak = absSample
    }
  }
  return peak
}

/**
 * Convert audio level (0-1) to decibels
 */
export function levelToDb(level: number): number {
  if (level === 0) return -Infinity
  return 20 * Math.log10(level)
}

/**
 * Format recording duration as MM:SS
 */
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

/**
 * Format bytes to human-readable size
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes'

  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

/**
 * Mix two Float32Arrays (simple averaging)
 */
export function mixAudioBuffers(
  buffer1: Float32Array,
  buffer2: Float32Array,
  gain1: number = 1.0,
  gain2: number = 1.0
): Float32Array {
  const length = Math.min(buffer1.length, buffer2.length)
  const mixed = new Float32Array(length)

  for (let i = 0; i < length; i++) {
    mixed[i] = (buffer1[i] * gain1 + buffer2[i] * gain2) / 2
  }

  return mixed
}

/**
 * Detect if audio buffer contains speech (simple energy threshold)
 */
export function hasSpeech(samples: Float32Array, threshold: number = 0.01): boolean {
  const rms = calculateRMS(samples)
  return rms > threshold
}

/**
 * Generate a unique ID for streams
 */
export function generateStreamId(type: string): string {
  return `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Safely close AudioContext
 */
export async function closeAudioContext(ctx: AudioContext | null): Promise<void> {
  if (!ctx) return

  if (ctx.state !== 'closed') {
    try {
      await ctx.close()
    } catch (error) {
      console.warn('Failed to close AudioContext:', error)
    }
  }
}

/**
 * Safely stop MediaStream tracks
 */
export function stopMediaStream(stream: MediaStream | null): void {
  if (!stream) return

  stream.getTracks().forEach(track => {
    try {
      track.stop()
    } catch (error) {
      console.warn('Failed to stop media track:', error)
    }
  })
}

/**
 * Check if MediaStream is active
 */
export function isStreamActive(stream: MediaStream | null): boolean {
  if (!stream) return false
  return stream.getTracks().some(track => track.readyState === 'live')
}

/**
 * Get audio tracks from MediaStream
 */
export function getAudioTracks(stream: MediaStream): MediaStreamTrack[] {
  return stream.getAudioTracks()
}

/**
 * Create AnalyserNode with default settings
 */
export function createAnalyser(
  audioContext: AudioContext,
  fftSize: number = 256
): AnalyserNode {
  const analyser = audioContext.createAnalyser()
  analyser.fftSize = fftSize
  analyser.smoothingTimeConstant = 0.8
  return analyser
}

/**
 * Get frequency data from AnalyserNode
 */
export function getFrequencyData(analyser: AnalyserNode): Uint8Array {
  const bufferLength = analyser.frequencyBinCount
  const dataArray = new Uint8Array(bufferLength)
  analyser.getByteFrequencyData(dataArray)
  return dataArray
}

/**
 * Get time domain data from AnalyserNode
 */
export function getTimeDomainData(analyser: AnalyserNode): Uint8Array {
  const bufferLength = analyser.frequencyBinCount
  const dataArray = new Uint8Array(bufferLength)
  analyser.getByteTimeDomainData(dataArray)
  return dataArray
}

/**
 * Calculate average frequency magnitude
 */
export function getAverageFrequency(analyser: AnalyserNode): number {
  const data = getFrequencyData(analyser)
  let sum = 0
  for (let i = 0; i < data.length; i++) {
    sum += data[i]
  }
  return sum / data.length / 255 // Normalize to 0-1
}
