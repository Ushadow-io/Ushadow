# Wyoming Protocol Implementation Fixes

## Issue Summary
Mobile phone microphone streaming was creating sessions but not transcribing audio, while web streaming worked correctly.

## Root Cause Analysis

### Key Differences Found (Mobile vs Web)

1. **Version Field**
   - **Mobile (BEFORE)**: Added `version: '1.0.0'` to every Wyoming event
   - **Web**: Doesn't include version field
   - **Fix**: Removed version field from mobile

2. **Mode Field in audio-start**
   - **Mobile (BEFORE)**: Missing `mode` field in audio-start event
   - **Web**: Includes `mode: 'batch'` or `mode: 'streaming'`
   - **Fix**: Added `mode: 'batch'` for phone microphone streaming

3. **Binary Payload Transmission**
   - **Mobile (BEFORE)**: `send(payload)` directly
   - **Web**: `send(new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength))`
   - **Fix**: Updated mobile to match web implementation

## Changes Made

### File: `ushadow/mobile/app/hooks/useAudioStreamer.ts`

#### 1. Removed version field (line 90)
```typescript
// BEFORE
event.version = '1.0.0';
event.payload_length = payload ? payload.length : null;

// AFTER
// Match web implementation - don't add version field
event.payload_length = payload ? payload.length : null;
```

#### 2. Fixed binary payload transmission (line 98-100)
```typescript
// BEFORE
if (payload?.length) websocketRef.current.send(payload);

// AFTER
if (payload?.length) {
  // Send binary payload exactly like web implementation
  websocketRef.current.send(new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength));
}
```

#### 3. Added mode to audio-start (lines 48-53, 272-273)
```typescript
// Added new constant
const AUDIO_START_FORMAT = {
  rate: 16000,
  width: 2,
  channels: 1,
  mode: 'batch', // Phone mic uses batch mode (process after recording completes)
};

// Changed audio-start event to use AUDIO_START_FORMAT instead of AUDIO_FORMAT
const audioStartEvent: WyomingEvent = { type: 'audio-start', data: AUDIO_START_FORMAT };
```

#### 4. Added debugging logs (line 94)
```typescript
console.log('[AudioStreamer] Sending Wyoming event:', jsonHeader.trim());
```

## Testing Steps

1. **Rebuild the app** (required for native module changes):
   ```bash
   cd /Users/stu/repos/worktrees/ushadow/red/ushadow/mobile
   npm run android  # or npm run ios
   ```

2. **Test phone microphone streaming**:
   - Start a recording from the mobile app
   - Check logs for Wyoming protocol messages
   - Verify session is created in Chronicle
   - Confirm audio chunks are being saved
   - Wait for transcription to complete (batch mode processes after recording stops)

3. **Compare with web streaming**:
   - Record using web interface
   - Compare Chronicle logs for both sessions
   - Verify both create conversations with transcriptions

## Expected Behavior After Fix

### Wyoming Protocol Messages (Mobile)
```json
// audio-start (sent once at beginning)
{"type":"audio-start","data":{"rate":16000,"width":2,"channels":1,"mode":"batch"},"payload_length":null}

// audio-chunk (sent ~50 times per second)
{"type":"audio-chunk","data":{"rate":16000,"width":2,"channels":1},"payload_length":2048}
[binary PCM data: 2048 bytes]

// audio-stop (sent when recording stops)
{"type":"audio-stop","data":{"timestamp":1234567890},"payload_length":null}
```

### Chronicle Behavior
1. Session created in active_sessions on audio-start
2. Audio chunks added to Redis stream
3. Audio file saved to /app/audio_chunks/
4. **After recording stops**: RQ worker processes conversation for transcription
5. Transcript appears in MongoDB conversation document

## Remaining Issues to Investigate

1. **UI Components**: Volume meter should show when isStreaming=true (check StreamingDisplay rendering)
2. **Audio Storage**: Verify audio files are actually being saved (earlier check showed they were)
3. **Batch Mode Processing**: Ensure RQ workers can find conversations in MongoDB (known Chronicle backend issue)

## Web Implementation Reference

**File**: `ushadow/frontend/src/hooks/useChronicleRecording.ts`

Key lines:
- Line 277-281: audio-start with mode
- Line 323-328: audio-chunk with binary payload
- Line 396-400: audio-stop

## Chronicle Backend Endpoints

- **Phone Microphone**: `/chronicle/ws_pcm` (batch mode)
- **OMI Device**: `/chronicle/ws_omi` (streaming mode)
- **Web Browser**: `/chronicle/ws_pcm` (user selects batch/streaming mode)
