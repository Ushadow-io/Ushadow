/**
 * Audio Stream Mixer
 *
 * Handles mixing multiple MediaStreams using Web Audio API.
 * Pure Web Audio API implementation - no external dependencies.
 */

import type { StreamType, StreamInfo } from './types'
import { generateStreamId, createAnalyser, closeAudioContext } from '../utils/audioUtils'

export interface MixerStream {
  id: string
  type: StreamType
  source: MediaStreamAudioSourceNode
  gain: GainNode
  analyser: AnalyserNode
}

export class AudioStreamMixer {
  private audioContext: AudioContext
  private streams: Map<string, MixerStream>
  private merger: ChannelMergerNode | null
  private destination: MediaStreamAudioDestinationNode | null

  constructor(sampleRate: number = 16000) {
    this.audioContext = new AudioContext({ sampleRate })
    this.streams = new Map()
    this.merger = null
    this.destination = null
  }

  /**
   * Initialize the mixer (call before adding streams)
   */
  async initialize(): Promise<void> {
    // Resume audio context if suspended (required by some browsers)
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume()
    }

    // Create merger node (supports up to 6 inputs by default)
    this.merger = this.audioContext.createChannelMerger(2)

    // Create destination for mixed output
    this.destination = this.audioContext.createMediaStreamDestination()

    // Connect merger to destination
    this.merger.connect(this.destination)
  }

  /**
   * Add a MediaStream to the mixer
   */
  addStream(
    stream: MediaStream,
    type: StreamType,
    gainValue: number = 1.0
  ): string {
    if (!this.merger || !this.destination) {
      throw new Error('Mixer not initialized. Call initialize() first.')
    }

    const id = generateStreamId(type)

    // Create source from MediaStream
    const source = this.audioContext.createMediaStreamSource(stream)

    // Create gain node for volume control
    const gain = this.audioContext.createGain()
    gain.gain.value = gainValue

    // Create analyser for visualization
    const analyser = createAnalyser(this.audioContext, 256)

    // Connect: source → gain → analyser → merger
    source.connect(gain)
    gain.connect(analyser)

    // Connect to appropriate merger channel
    const channelIndex = this.streams.size
    analyser.connect(this.merger, 0, Math.min(channelIndex, 1))

    // Store stream info
    this.streams.set(id, {
      id,
      type,
      source,
      gain,
      analyser
    })

    console.log(`✅ Added ${type} stream to mixer (ID: ${id})`)

    return id
  }

  /**
   * Remove a stream from the mixer
   */
  removeStream(streamId: string): boolean {
    const mixerStream = this.streams.get(streamId)
    if (!mixerStream) {
      console.warn(`Stream ${streamId} not found in mixer`)
      return false
    }

    // Disconnect all nodes
    try {
      mixerStream.source.disconnect()
      mixerStream.gain.disconnect()
      mixerStream.analyser.disconnect()
    } catch (error) {
      console.warn('Error disconnecting stream nodes:', error)
    }

    this.streams.delete(streamId)
    console.log(`🗑️  Removed stream ${streamId} from mixer`)

    return true
  }

  /**
   * Set gain/volume for a specific stream
   */
  setStreamGain(streamId: string, value: number): boolean {
    const mixerStream = this.streams.get(streamId)
    if (!mixerStream) {
      console.warn(`Stream ${streamId} not found`)
      return false
    }

    // Clamp between 0 and 2 (allowing boost up to 200%)
    const clampedValue = Math.max(0, Math.min(2, value))
    mixerStream.gain.gain.value = clampedValue

    return true
  }

  /**
   * Get gain value for a stream
   */
  getStreamGain(streamId: string): number | null {
    const mixerStream = this.streams.get(streamId)
    return mixerStream ? mixerStream.gain.gain.value : null
  }

  /**
   * Get analyser for a stream (for visualization)
   */
  getStreamAnalyser(streamId: string): AnalyserNode | null {
    const mixerStream = this.streams.get(streamId)
    return mixerStream ? mixerStream.analyser : null
  }

  /**
   * Get analyser for a stream type
   */
  getAnalyserByType(type: StreamType): AnalyserNode | null {
    for (const stream of this.streams.values()) {
      if (stream.type === type) {
        return stream.analyser
      }
    }
    return null
  }

  /**
   * Get the mixed output stream
   */
  getMixedStream(): MediaStream | null {
    if (!this.destination) {
      console.warn('Mixer not initialized')
      return null
    }
    return this.destination.stream
  }

  /**
   * Get list of active streams
   */
  getActiveStreams(): StreamInfo[] {
    return Array.from(this.streams.values()).map(stream => ({
      id: stream.id,
      type: stream.type,
      stream: this.destination!.stream, // Mixed stream
      active: true,
      gainValue: stream.gain.gain.value
    }))
  }

  /**
   * Get audio context state
   */
  getState(): AudioContextState {
    return this.audioContext.state
  }

  /**
   * Get sample rate
   */
  getSampleRate(): number {
    return this.audioContext.sampleRate
  }

  /**
   * Resume audio context if suspended
   */
  async resume(): Promise<void> {
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume()
    }
  }

  /**
   * Cleanup and close mixer
   */
  async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up audio mixer')

    // Disconnect all streams
    for (const streamId of Array.from(this.streams.keys())) {
      this.removeStream(streamId)
    }

    // Disconnect merger and destination
    try {
      this.merger?.disconnect()
      this.destination?.disconnect()
    } catch (error) {
      console.warn('Error disconnecting mixer nodes:', error)
    }

    this.merger = null
    this.destination = null

    // Close audio context
    await closeAudioContext(this.audioContext)
  }
}
