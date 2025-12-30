# Integration Guide for Chronicle

This guide shows how to integrate the dual-stream audio module into Chronicle's existing LiveRecord page.

## Quick Integration Steps

### 1. Update LiveRecord Page

Replace the current `useSimpleAudioRecording` hook with `useDualStreamRecording`:

```tsx
// backends/advanced/webui/src/pages/LiveRecord.tsx

import { useDualStreamRecording } from '../modules/dual-stream-audio/hooks/useDualStreamRecording'
import { ChronicleWebSocketAdapter } from '../modules/dual-stream-audio/adapters/chronicleAdapter'
import { BACKEND_URL } from '../services/api'
import { getStorageKey } from '../utils/storage'

export default function LiveRecord() {
  const wsAdapterRef = useRef<ChronicleWebSocketAdapter | null>(null)
  const [selectedMode, setSelectedMode] = useState<'microphone-only' | 'dual-stream'>('microphone-only')

  const recording = useDualStreamRecording({
    sampleRate: 16000,
    channelCount: 1,
    bufferSize: 4096,

    onAudioChunk: async (chunk) => {
      if (wsAdapterRef.current) {
        await wsAdapterRef.current.sendAudioChunk(chunk)
      }
    },

    onError: (error) => {
      console.error('Recording error:', error)
    },

    onStateChange: (state) => {
      console.log('Recording state:', state)
    }
  })

  const startRecording = async () => {
    const token = localStorage.getItem(getStorageKey('token'))
    if (!token) {
      console.error('No auth token found')
      return
    }

    // Create adapter
    const adapter = new ChronicleWebSocketAdapter({
      backendUrl: BACKEND_URL,
      token,
      deviceName: 'webui-dual-stream',
      mode: selectedMode
    })

    wsAdapterRef.current = adapter

    // Connect to WebSocket
    await adapter.connect()

    // Send audio-start message
    await adapter.sendAudioStart(selectedMode)

    // Start recording
    await recording.startRecording(selectedMode)
  }

  const stopRecording = async () => {
    recording.stopRecording()

    if (wsAdapterRef.current) {
      await wsAdapterRef.current.sendAudioStop()
      wsAdapterRef.current.close()
      wsAdapterRef.current = null
    }
  }

  return (
    <div>
      {/* Mode Selector */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">Recording Mode:</label>
        <div className="flex gap-2">
          <button
            onClick={() => setSelectedMode('microphone-only')}
            disabled={recording.isRecording}
            className={`px-4 py-2 rounded ${
              selectedMode === 'microphone-only'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200'
            }`}
          >
            🎤 Microphone Only
          </button>
          <button
            onClick={() => setSelectedMode('dual-stream')}
            disabled={recording.isRecording}
            className={`px-4 py-2 rounded ${
              selectedMode === 'dual-stream'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200'
            }`}
          >
            🎤 + 🖥️ Microphone + Meeting
          </button>
        </div>
      </div>

      {/* Recording Controls */}
      {recording.isRecording ? (
        <button onClick={stopRecording} className="bg-red-600 text-white px-6 py-3 rounded">
          Stop Recording
        </button>
      ) : (
        <button onClick={startRecording} className="bg-blue-600 text-white px-6 py-3 rounded">
          Start Recording
        </button>
      )}

      {/* Status Display */}
      {recording.isRecording && (
        <div className="mt-4">
          <p>Recording: {recording.formatDuration(recording.stats.recordingDuration)}</p>
          <p>Mode: {selectedMode}</p>
          <p>Streams: {recording.activeStreams.map(s => s.type).join(', ')}</p>
          <p>Chunks: {recording.stats.chunksProcessed}</p>
        </div>
      )}

      {/* Error Display */}
      {recording.error && (
        <div className="mt-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {recording.error.message}
        </div>
      )}
    </div>
  )
}
```

### 2. Add Dual Visualizer (Optional)

```tsx
// backends/advanced/webui/src/components/audio/DualAudioVisualizer.tsx

import { useEffect, useRef } from 'react'
import type { DualStreamRecordingHook } from '../../modules/dual-stream-audio/core/types'

interface Props {
  recording: DualStreamRecordingHook
}

export function DualAudioVisualizer({ recording }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!recording.isRecording) return

    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')!
    const width = canvas.width
    const height = canvas.height

    const draw = () => {
      if (!recording.isRecording) return
      requestAnimationFrame(draw)

      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, width, height)

      // Draw microphone stream (top half)
      const micAnalyser = recording.getAnalyser('microphone')
      if (micAnalyser) {
        const bufferLength = micAnalyser.frequencyBinCount
        const dataArray = new Uint8Array(bufferLength)
        micAnalyser.getByteTimeDomainData(dataArray)

        ctx.strokeStyle = '#60a5fa' // Blue
        ctx.lineWidth = 2
        ctx.beginPath()

        for (let i = 0; i < bufferLength; i++) {
          const x = (i / bufferLength) * width
          const y = ((dataArray[i] - 128) / 128) * (height / 4) + height / 4

          if (i === 0) {
            ctx.moveTo(x, y)
          } else {
            ctx.lineTo(x, y)
          }
        }
        ctx.stroke()

        // Label
        ctx.fillStyle = '#60a5fa'
        ctx.font = '12px monospace'
        ctx.fillText('🎤 Microphone', 10, 20)
      }

      // Draw display stream (bottom half)
      const displayAnalyser = recording.getAnalyser('display')
      if (displayAnalyser) {
        const bufferLength = displayAnalyser.frequencyBinCount
        const dataArray = new Uint8Array(bufferLength)
        displayAnalyser.getByteTimeDomainData(dataArray)

        ctx.strokeStyle = '#34d399' // Green
        ctx.lineWidth = 2
        ctx.beginPath()

        for (let i = 0; i < bufferLength; i++) {
          const x = (i / bufferLength) * width
          const y = ((dataArray[i] - 128) / 128) * (height / 4) + (3 * height / 4)

          if (i === 0) {
            ctx.moveTo(x, y)
          } else {
            ctx.lineTo(x, y)
          }
        }
        ctx.stroke()

        // Label
        ctx.fillStyle = '#34d399'
        ctx.font = '12px monospace'
        ctx.fillText('🖥️ Meeting Audio', 10, height / 2 + 20)
      }
    }

    draw()
  }, [recording.isRecording])

  if (!recording.isRecording) {
    return null
  }

  return (
    <div className="mt-4">
      <canvas
        ref={canvasRef}
        width={800}
        height={200}
        className="w-full border border-gray-300 rounded"
      />
    </div>
  )
}
```

### 3. Add Volume Controls (Optional)

```tsx
// backends/advanced/webui/src/components/audio/VolumeControls.tsx

interface Props {
  recording: DualStreamRecordingHook
}

export function VolumeControls({ recording }: Props) {
  return (
    <div className="mt-4 space-y-2">
      {recording.activeStreams.map(stream => (
        <div key={stream.id} className="flex items-center gap-4">
          <span className="w-32">
            {stream.type === 'microphone' ? '🎤 Microphone' : '🖥️ Meeting'}
          </span>
          <input
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={stream.gainValue}
            onChange={(e) => recording.setStreamGain(stream.id, parseFloat(e.target.value))}
            className="flex-1"
          />
          <span className="w-12 text-right">
            {Math.round(stream.gainValue * 100)}%
          </span>
        </div>
      ))}
    </div>
  )
}
```

## Migration Checklist

- [ ] Copy `dual-stream-audio/` module to project
- [ ] Update `LiveRecord.tsx` to use `useDualStreamRecording`
- [ ] Add mode selector UI
- [ ] Optional: Add dual visualizer component
- [ ] Optional: Add volume controls component
- [ ] Test microphone-only mode (should work exactly like before)
- [ ] Test dual-stream mode with browser-based meeting (Google Meet, Zoom web)
- [ ] Update instructions/help text for users

## Backend Changes Required

**None!** The backend already handles mixed mono PCM audio. The module sends the same format that `useSimpleAudioRecording` does.

## Rollback Plan

If issues arise, keep both hooks in the codebase and allow users to toggle:

```tsx
const [useNewRecorder, setUseNewRecorder] = useState(false)

const oldRecording = useSimpleAudioRecording()
const newRecording = useDualStreamRecording({ ... })

const recording = useNewRecorder ? newRecording : oldRecording
```

## User Instructions

Update your help text to explain dual-stream mode:

```tsx
<ul>
  <li>
    <strong>Microphone Only:</strong> Records your voice through the microphone.
    Use for simple voice notes or when not in a meeting.
  </li>
  <li>
    <strong>Microphone + Meeting:</strong> Records both your voice AND the meeting audio
    (from Google Meet, Zoom, Teams, etc.). Your browser will ask you to select which
    tab/window to share - choose your meeting tab for best results.
  </li>
</ul>
```

## Testing Recommendations

1. **Microphone only**: Verify existing functionality still works
2. **Dual-stream with Google Meet**: Test in Chrome/Firefox
3. **Permission denials**: Test user declining screen share
4. **Mid-recording tab close**: Verify graceful handling
5. **Volume controls**: Test gain adjustment works
6. **Browser compatibility**: Test Chrome, Firefox, Safari

## Troubleshooting

### "Screen share permission denied"
- User clicked "Cancel" on browser prompt
- Gracefully falls back to microphone-only if implemented

### "No audio track found in display media"
- User selected a tab/window without audio
- Ask user to select the correct meeting tab

### Safari issues
- Safari support for tab audio is limited (macOS 13+ only)
- Show warning or disable dual-stream mode on Safari
