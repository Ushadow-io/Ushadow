# Mobile Streaming Fixes Summary

## Issues Fixed

### 1. Removed Wyoming Event Log Spam ✅
**Problem**: Every audio chunk was logging the full JSON header, flooding logs with repetitive data.

**Fix**: Removed `console.log('[AudioStreamer] Sending Wyoming event:', jsonHeader.trim())` from useAudioStreamer.ts

---

### 2. Fixed Waveform Visualization ✅
**Problem**: Only showing heartbeat animation (meant for OMI device) regardless of source type.

**Fix**: Added source-specific waveform visualizations in StreamingDisplay:
- **Phone Microphone**: Real-time audio level bars that scroll left (shows actual volume)
- **OMI Device**: Heartbeat ECG-style animation

**Files Changed**:
- `StreamingDisplay.tsx`: Added `sourceType` prop and dual waveform rendering
- `UnifiedStreamingPage.tsx`: Passes `sourceType` based on selected source

**Implementation Details**:
```typescript
// Phone mic waveform - scrolls left with actual audio levels
const audioHistory = useState<number[]>(Array(MONITOR_POINTS).fill(0));

// Updates every 50ms
setAudioHistory((prev) => {
  const newHistory = [...prev.slice(1), audioLevel / 100];
  return newHistory;
});

// Renders bars with height based on actual audio level
{audioHistory.map((level, index) => {
  const height = Math.max(2, level * 50);
  return <View style={{ height, opacity: 0.4 + (level * 0.6) }} />;
})}
```

---

### 3. Added Batch and Streaming Mode Support ✅
**Problem**: Mobile only supported one mode, but web supports both batch and streaming modes.

**Fix**: Added mode parameter throughout the streaming stack:

**Files Changed**:
- `useAudioStreamer.ts`: Added `mode` parameter to `startStreaming(url, mode)`
- `useStreaming.ts`: Passes mode through to audio streamer
- `UnifiedStreamingPage.tsx`: Can now pass mode when calling `phoneStreaming.startStreaming(url, mode)`

**Mode Behavior**:
- **streaming** (default): Real-time transcription during recording
- **batch**: Post-processing transcription after recording completes

**Usage**:
```typescript
// Default to streaming mode
await phoneStreaming.startStreaming(streamUrl);

// Or explicitly set mode
await phoneStreaming.startStreaming(streamUrl, 'batch');
```

---

## Wyoming Protocol Improvements

### Changes from Previous Fix Session

1. **Removed version field** - Web doesn't send this
2. **Added mode to audio-start** - Now dynamically set based on parameter
3. **Fixed binary transmission** - Uses proper Uint8Array wrapping
4. **Mode persistence** - Stored in ref for reconnection attempts

### Current Wyoming Message Format

```json
// audio-start (sent once at beginning)
{
  "type": "audio-start",
  "data": {
    "rate": 16000,
    "width": 2,
    "channels": 1,
    "mode": "streaming"  // or "batch"
  },
  "payload_length": null
}

// audio-chunk (sent ~50 times per second)
{
  "type": "audio-chunk",
  "data": {
    "rate": 16000,
    "width": 2,
    "channels": 1
  },
  "payload_length": 2048
}
[binary PCM data: 2048 bytes]

// audio-stop (sent when recording stops)
{
  "type": "audio-stop",
  "data": {
    "timestamp": 1234567890
  },
  "payload_length": null
}
```

---

## Volume Meter Status

The volume meter SHOULD be visible when streaming. It's rendered at lines 213-237 in StreamingDisplay.tsx:

```typescript
{isStreaming && (
  <View style={styles.levelContainer}>
    <Text style={styles.levelLabel}>Level</Text>
    <View style={styles.levelBarBackground}>
      <View style={[styles.levelBarFill, { width: `${audioLevel}%` }]} />
    </View>
    <Text style={styles.levelValue}>{Math.round((audioLevel * 0.6) - 60)} dB</Text>
  </View>
)}
```

**If not visible, check**:
1. Is `isStreaming` prop actually `true`?
2. Is `audioLevel` being updated (check logs from usePhoneAudioRecorder)
3. Are the styles rendering correctly (background color contrast)?

---

## Testing Checklist

After rebuilding the app:

### Phone Microphone
- [ ] Start recording with phone mic
- [ ] See real-time audio level waveform (bars scrolling left)
- [ ] Volume meter shows and updates with speech
- [ ] Console shows: `[AudioStreamer] Sending audio-start event with mode: streaming`
- [ ] Chronicle creates session and transcribes in real-time

### OMI Device
- [ ] Connect to OMI device
- [ ] Start recording from OMI
- [ ] See heartbeat ECG-style animation
- [ ] Volume meter shows OMI audio levels
- [ ] Chronicle creates session and processes audio

### Mode Switching (Future Enhancement)
To allow users to choose between batch and streaming modes, add UI toggle and pass mode:
```typescript
const [recordingMode, setRecordingMode] = useState<'batch' | 'streaming'>('streaming');

// In handleStartStreaming:
await phoneStreaming.startStreaming(streamUrl, recordingMode);
```

---

## Architecture Notes

### Data Flow for Phone Mic Streaming

```
User taps "Record"
    ↓
UnifiedStreamingPage.handleStartStreaming()
    ↓
phoneStreaming.startStreaming(url, mode='streaming')
    ↓
useStreaming.startStreamingCombined()
    ↓
├─ useAudioStreamer.startStreaming(url, mode)
│  └─ Creates WebSocket, sends audio-start with mode
│
└─ usePhoneAudioRecorder.startRecording(callback)
   └─ AudioRecord.on('data') → decode base64 → sendAudio()
      └─ useAudioStreamer.sendAudio() → sends audio-chunk + PCM data
```

### Waveform Rendering

```
usePhoneAudioRecorder
    ↓
calculates audioLevel (0-100) from RMS of PCM samples
    ↓
passed to UnifiedStreamingPage
    ↓
passed to StreamingDisplay as prop
    ↓
if sourceType === 'microphone':
  → updates audioHistory every 50ms
  → renders scrolling bars based on audioHistory
else:
  → updates trailData with ECG pattern
  → renders heartbeat animation
```

---

## Remaining Work

1. **Verify transcription works** with streaming mode (should be real-time)
2. **Test batch mode** if needed for specific use cases
3. **Add mode selector UI** if users should be able to choose
4. **Monitor Chronicle logs** to confirm sessions are being processed correctly
5. **Check volume meter visibility** - styles may need adjustment for visibility
