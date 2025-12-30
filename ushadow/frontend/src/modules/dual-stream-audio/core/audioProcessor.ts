/**
 * Audio Processor
 *
 * Handles audio processing (PCM conversion) and chunk sending.
 * Pure Web Audio API implementation with callback-based backend integration.
 */

import type { AudioChunk, AudioMetadata, StreamType } from './types'
import { float32ToInt16, calculateRMS, calculatePeak } from '../utils/audioUtils'

export interface ProcessorConfig {
  sampleRate: number
  channelCount: number
  bufferSize: number
  onAudioChunk: (chunk: AudioChunk) => void | Promise<void>
  streamTypes: StreamType[]
}

export interface ProcessorStats {
  chunksProcessed: number
  bytesProcessed: number
  averageLevel: number
  peakLevel: number
  lastChunkTime: number
}

export class AudioProcessor {
  private processor: ScriptProcessorNode | null
  private config: ProcessorConfig
  private stats: ProcessorStats
  private isProcessing: boolean
  private levelHistory: number[]
  private maxHistorySize: number = 10

  constructor(
    audioContext: AudioContext,
    config: ProcessorConfig
  ) {
    this.config = config
    this.isProcessing = false
    this.processor = null

    this.stats = {
      chunksProcessed: 0,
      bytesProcessed: 0,
      averageLevel: 0,
      peakLevel: 0,
      lastChunkTime: 0
    }

    this.levelHistory = []

    // Create processor node
    this.processor = audioContext.createScriptProcessor(
      config.bufferSize,
      config.channelCount,
      config.channelCount
    )

    // Set up audio processing callback
    this.processor.onaudioprocess = this.handleAudioProcess.bind(this)
  }

  /**
   * Handle audio processing event
   */
  private handleAudioProcess(event: AudioProcessingEvent): void {
    if (!this.isProcessing) {
      return
    }

    const inputBuffer = event.inputBuffer
    const channelData = inputBuffer.getChannelData(0) // Get first channel (mono)

    // Calculate audio levels
    const rmsLevel = calculateRMS(channelData)
    const peakLevel = calculatePeak(channelData)

    // Update level history
    this.levelHistory.push(rmsLevel)
    if (this.levelHistory.length > this.maxHistorySize) {
      this.levelHistory.shift()
    }

    // Update stats
    this.stats.averageLevel =
      this.levelHistory.reduce((sum, val) => sum + val, 0) / this.levelHistory.length
    this.stats.peakLevel = Math.max(this.stats.peakLevel, peakLevel)

    // Convert to PCM
    const pcmData = float32ToInt16(channelData)

    // Create audio chunk
    const metadata: AudioMetadata = {
      sampleRate: this.config.sampleRate,
      channelCount: this.config.channelCount,
      bufferSize: this.config.bufferSize,
      timestamp: Date.now(),
      streamTypes: this.config.streamTypes
    }

    const chunk: AudioChunk = {
      data: pcmData,
      metadata
    }

    // Update stats
    this.stats.chunksProcessed++
    this.stats.bytesProcessed += pcmData.byteLength
    this.stats.lastChunkTime = Date.now()

    // Log first few chunks for debugging
    if (this.stats.chunksProcessed <= 3) {
      console.log(`🎵 Processing audio chunk #${this.stats.chunksProcessed}`, {
        size: pcmData.byteLength,
        rmsLevel: rmsLevel.toFixed(4),
        peakLevel: peakLevel.toFixed(4),
        hasAudio: rmsLevel > 0.001
      })
    }

    // Send chunk to backend (async operation, but don't await to prevent blocking)
    this.sendChunk(chunk)
  }

  /**
   * Send audio chunk to backend
   */
  private async sendChunk(chunk: AudioChunk): Promise<void> {
    try {
      await this.config.onAudioChunk(chunk)
    } catch (error) {
      console.error('❌ Failed to send audio chunk:', error)
      // Don't stop processing on send errors - just log them
    }
  }

  /**
   * Connect processor to audio source
   */
  connect(source: AudioNode): void {
    if (!this.processor) {
      throw new Error('Processor not initialized')
    }
    source.connect(this.processor)
  }

  /**
   * Connect processor to destination
   */
  connectToDestination(destination: AudioNode): void {
    if (!this.processor) {
      throw new Error('Processor not initialized')
    }
    this.processor.connect(destination)
  }

  /**
   * Start processing audio
   */
  start(): void {
    console.log('▶️  Starting audio processing')
    this.isProcessing = true
    this.resetStats()
  }

  /**
   * Stop processing audio
   */
  stop(): void {
    console.log('⏸️  Stopping audio processing')
    this.isProcessing = false
  }

  /**
   * Check if processing is active
   */
  isActive(): boolean {
    return this.isProcessing
  }

  /**
   * Get processing statistics
   */
  getStats(): ProcessorStats {
    return { ...this.stats }
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      chunksProcessed: 0,
      bytesProcessed: 0,
      averageLevel: 0,
      peakLevel: 0,
      lastChunkTime: 0
    }
    this.levelHistory = []
  }

  /**
   * Update stream types (for metadata)
   */
  updateStreamTypes(streamTypes: StreamType[]): void {
    this.config.streamTypes = streamTypes
  }

  /**
   * Cleanup and disconnect
   */
  cleanup(): void {
    console.log('🧹 Cleaning up audio processor')

    this.stop()

    if (this.processor) {
      try {
        this.processor.disconnect()
      } catch (error) {
        console.warn('Error disconnecting processor:', error)
      }
      this.processor = null
    }

    this.resetStats()
  }
}
