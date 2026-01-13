/**
 * Stream Capture Module
 *
 * Handles capturing microphone and display media streams.
 * Pure browser API implementation - no dependencies.
 */

import type { AudioConstraints, StreamType } from './types'
import { AudioRecordingError as RecordingError } from './types'

export interface CaptureResult {
  stream: MediaStream
  type: StreamType
}

/**
 * Capture microphone audio stream
 */
export async function captureMicrophone(
  constraints?: AudioConstraints
): Promise<MediaStream> {
  try {
    console.log('🎤 Requesting microphone access...')

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: constraints?.sampleRate || 16000,
        channelCount: constraints?.channelCount || 1,
        echoCancellation: constraints?.echoCancellation ?? true,
        noiseSuppression: constraints?.noiseSuppression ?? true,
        autoGainControl: constraints?.autoGainControl ?? true
      },
      video: false
    })

    console.log('✅ Microphone access granted')
    return stream
  } catch (error) {
    console.error('❌ Microphone access denied:', error)

    if (error instanceof Error) {
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        throw new RecordingError(
          'Microphone permission denied. Please allow microphone access.',
          'MICROPHONE_PERMISSION_DENIED',
          error
        )
      }
      if (error.name === 'NotFoundError') {
        throw new RecordingError(
          'No microphone found. Please connect a microphone.',
          'STREAM_CAPTURE_FAILED',
          error
        )
      }
    }

    throw new RecordingError(
      'Failed to capture microphone audio',
      'STREAM_CAPTURE_FAILED',
      error as Error
    )
  }
}

/**
 * Capture display media (tab/window) audio stream
 */
export async function captureDisplayMedia(
  constraints?: AudioConstraints
): Promise<MediaStream> {
  try {
    console.log('🖥️  Requesting display media access...')

    // Check if getDisplayMedia is supported
    if (!navigator.mediaDevices?.getDisplayMedia) {
      throw new RecordingError(
        'Screen/tab audio capture is not supported in your browser',
        'UNSUPPORTED_BROWSER'
      )
    }

    // IMPORTANT: Many browsers don't support video: false even for audio-only capture
    // We must request video: true, then immediately stop the video track
    // This is a known browser limitation with getDisplayMedia
    const stream = await navigator.mediaDevices.getDisplayMedia({
      audio: {
        sampleRate: constraints?.sampleRate || 16000,
        channelCount: constraints?.channelCount || 1,
        echoCancellation: constraints?.echoCancellation ?? false,
        noiseSuppression: constraints?.noiseSuppression ?? false,
        autoGainControl: constraints?.autoGainControl ?? false
      },
      video: true // Must be true, even for audio-only - browsers require this
    })

    // Stop and remove video tracks immediately (we only want audio)
    const videoTracks = stream.getVideoTracks()
    videoTracks.forEach(track => {
      track.stop()
      stream.removeTrack(track)
    })
    console.log('🎥 Stopped and removed video tracks (audio-only mode)')

    // Verify we got an audio track
    const audioTracks = stream.getAudioTracks()
    if (audioTracks.length === 0) {
      throw new RecordingError(
        'No audio track found in display media. Please select a tab/window with audio.',
        'STREAM_CAPTURE_FAILED'
      )
    }

    console.log('✅ Display media access granted:', {
      audioTracks: audioTracks.length,
      label: audioTracks[0]?.label
    })

    return stream
  } catch (error) {
    console.error('❌ Display media access denied:', error)

    if (error instanceof RecordingError) {
      throw error
    }

    if (error instanceof Error) {
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        throw new RecordingError(
          'Screen/tab share permission denied. Please allow screen sharing to capture meeting audio.',
          'DISPLAY_PERMISSION_DENIED',
          error
        )
      }
      if (error.name === 'NotFoundError') {
        throw new RecordingError(
          'No audio source found. Please select a tab/window with audio.',
          'STREAM_CAPTURE_FAILED',
          error
        )
      }
    }

    throw new RecordingError(
      'Failed to capture display media audio',
      'STREAM_CAPTURE_FAILED',
      error as Error
    )
  }
}

/**
 * Capture microphone only
 */
export async function captureMicrophoneOnly(
  constraints?: AudioConstraints
): Promise<CaptureResult> {
  const stream = await captureMicrophone(constraints)
  return {
    stream,
    type: 'microphone'
  }
}

/**
 * Capture both microphone and display media
 */
export async function captureDualStream(
  micConstraints?: AudioConstraints,
  displayConstraints?: AudioConstraints
): Promise<{ microphone: MediaStream; display: MediaStream }> {
  // Capture microphone first
  const micStream = await captureMicrophone(micConstraints)

  try {
    // Then capture display media
    const displayStream = await captureDisplayMedia(displayConstraints)

    return {
      microphone: micStream,
      display: displayStream
    }
  } catch (error) {
    // If display capture fails, clean up microphone stream
    micStream.getTracks().forEach(track => track.stop())
    throw error
  }
}

/**
 * Stop a MediaStream
 */
export function stopStream(stream: MediaStream | null): void {
  if (!stream) return

  stream.getTracks().forEach(track => {
    track.stop()
    console.log(`🛑 Stopped ${track.kind} track:`, track.label)
  })
}

/**
 * Check if stream has audio tracks
 */
export function hasAudioTracks(stream: MediaStream): boolean {
  return stream.getAudioTracks().length > 0
}

/**
 * Get stream label (for debugging)
 */
export function getStreamLabel(stream: MediaStream): string {
  const audioTrack = stream.getAudioTracks()[0]
  return audioTrack?.label || 'Unknown stream'
}

/**
 * Monitor stream for track ended events
 */
export function monitorStreamEnded(
  stream: MediaStream,
  onEnded: () => void
): () => void {
  const tracks = stream.getTracks()

  const handleEnded = () => {
    console.log('⚠️  Stream track ended')
    onEnded()
  }

  // Add ended listener to all tracks
  tracks.forEach(track => {
    track.addEventListener('ended', handleEnded)
  })

  // Return cleanup function
  return () => {
    tracks.forEach(track => {
      track.removeEventListener('ended', handleEnded)
    })
  }
}
