/**
 * Browser capture for Chronicle audio v2.
 *
 * Takes 16 kHz mono float samples, encodes 20 ms raw Opus packets with the
 * WebCodecs AudioEncoder (as Chronicle's own web UI does) and sends them as v2
 * MediaEnvelopes through the Ushadow relay.
 *
 * AudioV2Socket and contracts/ are shared with the mobile app; regenerate with
 * scripts/sync-audio-contracts.sh.
 */
import { DeliveryClass, DeviceKind, ProcessingProfile, StopReason } from './audioV2'
import { AudioV2Socket } from './audioV2Socket'

const SAMPLE_RATE = 16_000
const FRAME_SAMPLES = 320 // 20 ms at 16 kHz
const FRAME_MS = 20
const MAX_ENCODE_QUEUE = 100

/** Null when this browser can encode Opus, otherwise a reason to show the user. */
export function opusSupportError(): string | null {
  const g = globalThis as any
  if (!g.isSecureContext) return 'Recording needs HTTPS or localhost.'
  if (!g.AudioEncoder || !g.AudioData) {
    return 'Recording needs a browser with WebCodecs Opus support (Chrome, Edge or Safari 26+).'
  }
  return null
}

export interface BrowserOpusSessionOptions {
  url: string
  bearerToken: string
  displayName: string
  /** Keep packets and send them all on stop (the old "batch" mode). */
  batch?: boolean
  onTranscript?: (text: string, isFinal: boolean) => void
  onPacketsSent?: (count: number) => void
  onClosed?: () => void
}

interface QueuedPacket { sequence: number, opus: Uint8Array }

export class BrowserOpusSession {
  private readonly socket: AudioV2Socket
  private encoder: any = null
  private pending = new Float32Array(0)
  private frameTimestampUs = 0
  private sequence = 0
  private originMs = 0
  private queued: QueuedPacket[] = []
  private stopping = false

  constructor(private readonly options: BrowserOpusSessionOptions) {
    this.socket = new AudioV2Socket({
      url: options.url,
      bearerToken: options.bearerToken,
      sourceId: 'web-browser',
      displayName: options.displayName,
      deviceKind: DeviceKind.WEB_BROWSER,
      uplinkFrameDurationMs: FRAME_MS,
      onControl: control => {
        if (control.event.case === 'transcriptUpdate') {
          options.onTranscript?.(control.event.value.text, control.event.value.isFinal)
        }
      },
      onClosed: () => options.onClosed?.(),
    })
  }

  async start(): Promise<void> {
    const support = opusSupportError()
    if (support) throw new Error(support)
    await this.socket.connect()
    // SOURCE_NATIVE (no echo cancellation contract) must use capture epoch 0.
    await this.socket.beginCapture({
      captureEpoch: 0,
      processingProfile: ProcessingProfile.SOURCE_NATIVE,
      deliveryClass: DeliveryClass.LIVE,
    })
    this.originMs = Date.now()
    const Encoder = (globalThis as any).AudioEncoder
    this.encoder = new Encoder({
      output: (chunk: any) => this.onEncoded(chunk),
      error: (error: Error) => console.error('[AudioV2] Opus encoder error:', error),
    })
    this.encoder.configure({
      codec: 'opus',
      sampleRate: SAMPLE_RATE,
      numberOfChannels: 1,
      bitrate: 24_000,
      opus: { frameDuration: FRAME_MS * 1000 },
    })
  }

  /** Push 16 kHz mono float samples in [-1, 1]. */
  push(samples: Float32Array): void {
    if (!this.encoder || this.stopping) return
    if (this.encoder.encodeQueueSize > MAX_ENCODE_QUEUE) {
      console.warn('[AudioV2] Encoder is behind; dropping audio')
      return
    }
    const joined = new Float32Array(this.pending.length + samples.length)
    joined.set(this.pending)
    joined.set(samples, this.pending.length)
    const AudioDataCtor = (globalThis as any).AudioData
    let offset = 0
    while (joined.length - offset >= FRAME_SAMPLES) {
      const data = new AudioDataCtor({
        format: 'f32-planar',
        sampleRate: SAMPLE_RATE,
        numberOfFrames: FRAME_SAMPLES,
        numberOfChannels: 1,
        timestamp: this.frameTimestampUs,
        data: joined.slice(offset, offset + FRAME_SAMPLES),
      })
      this.encoder.encode(data)
      data.close()
      this.frameTimestampUs += FRAME_MS * 1000
      offset += FRAME_SAMPLES
    }
    this.pending = joined.slice(offset)
  }

  /** Push 16 kHz mono 16-bit PCM (the dual-stream mixer output). */
  pushInt16(pcm: Int16Array): void {
    const samples = new Float32Array(pcm.length)
    for (let i = 0; i < pcm.length; i++) samples[i] = pcm[i] / 0x8000
    this.push(samples)
  }

  async stop(): Promise<void> {
    if (this.stopping) return
    this.stopping = true
    try {
      if (this.encoder && this.encoder.state !== 'closed') {
        await this.encoder.flush()
        this.encoder.close()
      }
      this.queued.forEach(packet => this.send(packet))
      this.queued = []
      await this.socket.stopCapture(StopReason.USER_REQUESTED)
    } catch (error) {
      console.warn('[AudioV2] Clean stop failed:', error)
    } finally {
      this.encoder = null
      this.socket.close()
    }
  }

  private onEncoded(chunk: any): void {
    const opus = new Uint8Array(chunk.byteLength)
    chunk.copyTo(opus)
    const packet = { sequence: this.sequence, opus }
    this.sequence += 1
    if (this.options.batch) this.queued.push(packet)
    else this.send(packet)
  }

  private send(packet: QueuedPacket): void {
    if (this.socket.readyState !== WebSocket.OPEN || !this.socket.activeBinding) return
    this.socket.sendPacket({
      sequence: packet.sequence,
      capturedAtMs: this.originMs + packet.sequence * FRAME_MS,
      monotonicOffsetUs: packet.sequence * FRAME_MS * 1000,
      opus: packet.opus,
    })
    this.options.onPacketsSent?.(packet.sequence + 1)
  }
}
