# Dual-Stream Audio Recording Module

**Portable, zero-dependency audio recording module for capturing microphone + screen/tab audio in the browser.**

Designed to be extracted and reused across projects with minimal integration effort.

## Features

- 🎤 **Microphone capture** - Standard `getUserMedia()` audio recording
- 🖥️ **Display media capture** - Browser tab/window audio recording
- 🎛️ **Audio mixing** - Combine multiple streams with independent volume control
- 📊 **Real-time visualization** - Access to AnalyserNodes for waveform display
- 🔌 **Backend agnostic** - Works with WebSocket, HTTP, local storage, or any backend
- 🚀 **TypeScript first** - Full type safety and IntelliSense support
- 📦 **Zero dependencies** - Only uses Web Audio API and React

## Browser Support

| Feature | Chrome/Edge | Firefox | Safari |
|---------|-------------|---------|--------|
| Microphone capture | ✅ | ✅ | ✅ |
| Tab audio capture | ✅ | ✅ | ⚠️ macOS 13+ |
| Window audio capture | ✅ | ✅ | ❌ |
| Mixing & processing | ✅ | ✅ | ✅ |

## Quick Start

### 1. Copy Module to Your Project

```bash
# From this Chronicle repo
cp -r backends/advanced/webui/src/modules/dual-stream-audio /path/to/your/project/src/

# Or from the Ushadow repo (once extracted)
cp -r /repos/ushadow/dual-stream-audio /path/to/your/project/src/
```

### 2. Use in Your Component

```tsx
import { useDualStreamRecording } from './dual-stream-audio/hooks/useDualStreamRecording'
import type { AudioChunk } from './dual-stream-audio/core/types'

function MyRecorder() {
  const recording = useDualStreamRecording({
    sampleRate: 16000,
    channelCount: 1,
    bufferSize: 4096,

    // Backend integration - inject your own implementation
    onAudioChunk: async (chunk: AudioChunk) => {
      // Send to your backend (WebSocket, HTTP POST, etc.)
      console.log('Received audio chunk:', chunk.data.length, 'bytes')
    },

    // Optional callbacks
    onError: (error) => console.error('Recording error:', error),
    onStateChange: (state) => console.log('State changed:', state)
  })

  return (
    <div>
      <button onClick={() => recording.startRecording('microphone-only')}>
        Start Microphone Only
      </button>
      <button onClick={() => recording.startRecording('dual-stream')}>
        Start Dual-Stream (Mic + Tab Audio)
      </button>
      <button onClick={recording.stopRecording}>
        Stop Recording
      </button>

      {recording.isRecording && (
        <p>Recording: {recording.formatDuration(recording.stats.recordingDuration)}</p>
      )}
    </div>
  )
}
```

## Module Structure

```
dual-stream-audio/
├── core/                       # Core logic (zero dependencies)
│   ├── types.ts               # TypeScript types and interfaces
│   ├── audioMixer.ts          # Web Audio API mixing
│   ├── streamCapture.ts       # getUserMedia + getDisplayMedia
│   └── audioProcessor.ts      # PCM conversion & chunk processing
│
├── hooks/                      # React hooks
│   └── useDualStreamRecording.ts   # Main hook
│
├── utils/                      # Pure utilities
│   ├── browserCompat.ts       # Browser capability detection
│   └── audioUtils.ts          # Helper functions
│
├── adapters/                   # Backend examples (optional)
│   └── chronicleAdapter.ts    # Chronicle WebSocket example
│
└── README.md                   # This file
```

## Architecture

### Dependency Injection Pattern

The module uses **callback-based dependency injection** to remain backend-agnostic:

```tsx
// ❌ BAD - Tightly coupled to specific backend
const ws = new WebSocket('ws://my-backend/audio')
ws.send(audioData)

// ✅ GOOD - Generic callback interface
useDualStreamRecording({
  onAudioChunk: async (chunk) => {
    // YOUR backend implementation here
    // Could be WebSocket, HTTP, IndexedDB, etc.
    await myBackend.sendAudio(chunk)
  }
})
```

### Audio Flow

```
┌─────────────┐         ┌──────────────┐
│ Microphone  │         │  Tab/Window  │
│   Stream    │         │    Stream    │
└──────┬──────┘         └──────┬───────┘
       │                       │
       │  getUserMedia()       │  getDisplayMedia()
       │                       │
       ▼                       ▼
┌──────────────────────────────────────┐
│        AudioStreamMixer              │
│  - Combines streams                  │
│  - Independent volume control        │
│  - Creates mixed MediaStream         │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│        AudioProcessor                │
│  - Float32 → Int16 PCM conversion   │
│  - Calls onAudioChunk callback       │
└──────────────┬───────────────────────┘
               │
               ▼
         Your Backend
    (WebSocket, HTTP, etc.)
```

## Integration Examples

### Example 1: WebSocket Backend

```tsx
import { useDualStreamRecording } from './dual-stream-audio/hooks/useDualStreamRecording'

function WebSocketRecorder() {
  const wsRef = useRef<WebSocket | null>(null)

  const recording = useDualStreamRecording({
    sampleRate: 16000,
    channelCount: 1,
    bufferSize: 4096,

    onAudioChunk: async (chunk) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        // Send PCM data via WebSocket
        wsRef.current.send(chunk.data.buffer)
      }
    }
  })

  const startRecording = async () => {
    // Connect WebSocket
    wsRef.current = new WebSocket('ws://localhost:8000/audio')
    await new Promise(resolve => {
      wsRef.current!.onopen = resolve
    })

    // Start recording
    await recording.startRecording('dual-stream')
  }

  return (
    <button onClick={startRecording}>Start Recording</button>
  )
}
```

### Example 2: HTTP POST Backend

```tsx
function HttpRecorder() {
  const chunksRef = useRef<Int16Array[]>([])

  const recording = useDualStreamRecording({
    sampleRate: 16000,
    channelCount: 1,
    bufferSize: 4096,

    onAudioChunk: async (chunk) => {
      // Buffer chunks in memory
      chunksRef.current.push(chunk.data)
    }
  })

  const stopAndUpload = async () => {
    recording.stopRecording()

    // Combine all chunks
    const totalLength = chunksRef.current.reduce((sum, arr) => sum + arr.length, 0)
    const combined = new Int16Array(totalLength)
    let offset = 0
    for (const chunk of chunksRef.current) {
      combined.set(chunk, offset)
      offset += chunk.length
    }

    // Upload to server
    const blob = new Blob([combined.buffer], { type: 'audio/pcm' })
    const formData = new FormData()
    formData.append('audio', blob, 'recording.pcm')

    await fetch('/api/upload-audio', {
      method: 'POST',
      body: formData
    })

    chunksRef.current = []
  }

  return (
    <>
      <button onClick={() => recording.startRecording('microphone-only')}>
        Start
      </button>
      <button onClick={stopAndUpload}>
        Stop & Upload
      </button>
    </>
  )
}
```

### Example 3: Chronicle Adapter (Included)

```tsx
import { useDualStreamRecording } from './dual-stream-audio/hooks/useDualStreamRecording'
import { ChronicleWebSocketAdapter, createChronicleCallback } from './dual-stream-audio/adapters/chronicleAdapter'

function ChronicleRecorder() {
  const adapterRef = useRef<ChronicleWebSocketAdapter | null>(null)

  const recording = useDualStreamRecording({
    sampleRate: 16000,
    channelCount: 1,
    bufferSize: 4096,

    onAudioChunk: async (chunk) => {
      if (adapterRef.current) {
        await adapterRef.current.sendAudioChunk(chunk)
      }
    }
  })

  const startRecording = async () => {
    // Create Chronicle adapter
    adapterRef.current = new ChronicleWebSocketAdapter({
      backendUrl: 'http://localhost:8000',
      token: localStorage.getItem('token')!,
      deviceName: 'dual-stream-recorder'
    })

    // Connect and send audio-start
    await adapterRef.current.connect()
    await adapterRef.current.sendAudioStart('dual-stream')

    // Start recording
    await recording.startRecording('dual-stream')
  }

  const stopRecording = async () => {
    recording.stopRecording()

    if (adapterRef.current) {
      await adapterRef.current.sendAudioStop()
      adapterRef.current.close()
    }
  }

  return (
    <>
      <button onClick={startRecording}>Start</button>
      <button onClick={stopRecording}>Stop</button>
    </>
  )
}
```

## API Reference

### `useDualStreamRecording(config)`

Main hook for dual-stream recording.

**Config:**
```typescript
interface DualStreamConfig {
  // Audio settings
  sampleRate: number                // Default: 16000
  channelCount: number              // Default: 1 (mono)
  bufferSize: number                // Default: 4096

  // Backend integration (REQUIRED)
  onAudioChunk: (chunk: AudioChunk) => void | Promise<void>

  // Optional callbacks
  onError?: (error: Error) => void
  onStateChange?: (state: RecordingState) => void
  onStreamAdded?: (stream: StreamInfo) => void
  onStreamRemoved?: (streamId: string) => void

  // Optional constraints
  microphoneConstraints?: AudioConstraints
  displayConstraints?: { audio: AudioConstraints }
}
```

**Returns:**
```typescript
interface DualStreamRecordingHook {
  // State
  state: RecordingState
  mode: RecordingMode
  isRecording: boolean
  error: Error | null
  stats: RecordingStats
  activeStreams: StreamInfo[]

  // Controls
  startRecording: (mode: RecordingMode) => Promise<void>
  stopRecording: () => void
  setStreamGain: (streamId: string, gain: number) => void

  // Utilities
  formatDuration: (seconds: number) => string
  getAnalyser: (streamType: StreamType) => AnalyserNode | null
}
```

### Types

```typescript
type RecordingMode = 'microphone-only' | 'dual-stream'

type RecordingState =
  | 'idle'
  | 'requesting-mic'
  | 'requesting-display'
  | 'setting-up-mixer'
  | 'recording'
  | 'stopping'
  | 'error'

interface AudioChunk {
  data: Int16Array           // PCM audio data
  metadata: AudioMetadata    // Sample rate, channels, etc.
}

interface RecordingStats {
  recordingDuration: number
  chunksProcessed: number
  bytesProcessed: number
  activeStreams: StreamType[]
  averageLevel: number       // 0-1 range
  peakLevel: number          // 0-1 range
}
```

## Visualization Example

```tsx
import { useEffect, useRef } from 'react'

function AudioVisualizer({ recording }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!recording.isRecording) return

    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')!
    const micAnalyser = recording.getAnalyser('microphone')
    const displayAnalyser = recording.getAnalyser('display')

    const draw = () => {
      requestAnimationFrame(draw)

      const width = canvas.width
      const height = canvas.height
      ctx.clearRect(0, 0, width, height)

      // Draw microphone waveform
      if (micAnalyser) {
        const bufferLength = micAnalyser.frequencyBinCount
        const dataArray = new Uint8Array(bufferLength)
        micAnalyser.getByteTimeDomainData(dataArray)

        ctx.strokeStyle = 'blue'
        ctx.beginPath()
        for (let i = 0; i < bufferLength; i++) {
          const x = (i / bufferLength) * width
          const y = (dataArray[i] / 255) * height / 2
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
        }
        ctx.stroke()
      }

      // Draw display waveform
      if (displayAnalyser) {
        const bufferLength = displayAnalyser.frequencyBinCount
        const dataArray = new Uint8Array(bufferLength)
        displayAnalyser.getByteTimeDomainData(dataArray)

        ctx.strokeStyle = 'green'
        ctx.beginPath()
        for (let i = 0; i < bufferLength; i++) {
          const x = (i / bufferLength) * width
          const y = (dataArray[i] / 255) * height / 2 + height / 2
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
        }
        ctx.stroke()
      }
    }

    draw()
  }, [recording.isRecording])

  return <canvas ref={canvasRef} width={800} height={400} />
}
```

## Extraction Checklist

When moving this module to another project:

- [ ] Copy entire `dual-stream-audio/` directory
- [ ] Update import paths to match your project structure
- [ ] Implement `onAudioChunk` callback for your backend
- [ ] Optional: Create your own adapter (see `adapters/` for example)
- [ ] Optional: Add UI components for mode selection, visualization
- [ ] Test browser compatibility for your target browsers

## License

This module is part of Chronicle and follows the same license as the parent project.

## Support

For issues or questions:
- Chronicle project: [GitHub Issues](https://github.com/yourorg/chronicle/issues)
- General Web Audio API: [MDN Web Audio API Docs](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
