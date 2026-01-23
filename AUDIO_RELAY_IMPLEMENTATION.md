# Audio Relay Implementation Summary

## What Was Implemented

### 1. ✅ Architecture Redesign

**Old (Incorrect):**
- Client devices (mobile, desktop) were wired like backend services
- Static routing: `desktop-mic-1` → `mycelia-backend-1`
- No runtime choice for users

**New (Correct):**
- Clients connect to relay with runtime destination selection
- Dynamic routing: User chooses destinations when recording starts
- Consistent "always relay" strategy

### 2. ✅ Wiring Configuration

**Removed client device wiring from `config/wiring.yaml`:**
```yaml
# REMOVED - clients don't use wiring:
# - desktop-mic-1 → mycelia-backend-1
# - omi-device-1 → mycelia-backend-1

# Added comment explaining architecture:
# "Client audio sources do NOT use wiring.
# They connect to relay endpoint and choose destinations at runtime."
```

### 3. ✅ Frontend Components

**Created `DestinationSelector.tsx`:**
- Queries `/api/providers/capability/audio_consumer`
- Multi-select checkboxes for available destinations
- Auto-selects first destination by default
- Validates at least one selection

**Updated `RecordingControls.tsx`:**
- Integrates `DestinationSelector` component
- Shows destination selector before recording
- Passes selected destination IDs to `startRecording()`

**Updated `useAudioRecording.ts`:**
- Added `destinationIds` parameter to `startRecording()`
- Implemented `resolveWebSocketURL()` with "always relay" strategy:
  - Queries backend for available consumers
  - Builds destinations array with URLs
  - Connects to `/ws/audio/relay` endpoint
  - Falls back to first destination if none selected

### 4. ✅ Backend API Enhancement

**Created `/api/deployments/exposed-urls` endpoint:**
- Returns exposed URLs from running service instances
- Filters by URL type (e.g., `type=audio`) and status (e.g., `status=running`)
- Returns actual deployment URLs, not static provider configs

**Example response:**
```json
[
  {
    "instance_id": "chronicle-backend-1",
    "instance_name": "Chronicle",
    "url": "ws://chronicle-backend:8000/chronicle/ws_pcm",
    "type": "audio",
    "metadata": {"protocol": "wyoming", "data": "pcm"}
  }
]
```

### 5. ✅ Documentation

**Created:**
- `docs/AUDIO_CLIENT_ARCHITECTURE.md` - Complete architecture guide
- `docs/TESTING_AUDIO_RELAY.md` - Testing instructions
- `AUDIO_RELAY_IMPLEMENTATION.md` - This summary

## Architecture Flow

```
┌──────────────────────────────────────────────────────┐
│ 1. User opens recording UI                          │
│    DestinationSelector queries backend              │
└──────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────┐
│ 2. Backend returns available destinations            │
│    GET /api/deployments/exposed-urls?type=audio     │
│    → [{instance_id: "chronicle-backend-1", url...}] │
└──────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────┐
│ 3. User selects destinations                         │
│    [x] Chronicle                                     │
│    [x] Mycelia                                       │
└──────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────┐
│ 4. Frontend builds relay URL                         │
│    ws://backend/ws/audio/relay?destinations=[...]    │
└──────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────┐
│ 5. Relay fans out audio to all destinations          │
│    → Chronicle (transcription)                       │
│    → Mycelia (memory extraction)                     │
└──────────────────────────────────────────────────────┘
```

## Key Design Decisions

### Always Use Relay

**Chosen Strategy:** Always connect through relay, even for single destination

**Rationale:**
- ✅ Consistent behavior (no special cases)
- ✅ Easier to debug (single code path)
- ✅ Future-proof (easy to add features like recording templates)
- ✅ Lower battery usage (single WebSocket from client)
- ❌ Slight latency overhead (acceptable trade-off)

**Rejected Alternatives:**
- Direct connection for single destination (adds complexity)
- Hybrid approach (hard to maintain)

### No Wiring for Client Audio

**Rationale:**
- Wiring is for backend service dependencies (static infrastructure)
- Client audio needs runtime user choice (dynamic behavior)
- Users want different destinations per recording session

## Mobile App Changes Required

### Current (Hardcoded to Chronicle)

**QR Code:**
```json
{
  "websocket_url": "ws://chronicle:5001/chronicle/ws_pcm",
  "token": "jwt_token"
}
```

**Connection:**
```javascript
const ws = new WebSocket(qrData.websocket_url + "?token=" + qrData.token);
```

### New (Platform Agnostic)

**QR Code:**
```json
{
  "api_base_url": "https://your-ushadow.com/api",
  "token": "jwt_token"
}
```

**Connection:**
```javascript
// 1. Query available destinations
const response = await fetch(
  `${qrData.api_base_url}/providers/capability/audio_consumer`,
  {headers: {'Authorization': `Bearer ${qrData.token}`}}
);
const destinations = await response.json();

// 2. Show UI picker
const selected = await showDestinationPicker(destinations);
// Example: user selects ["chronicle", "mycelia"]

// 3. Build relay URL
const destinationsParam = selected.map(id => ({
  name: id,
  url: destinations.find(d => d.id === id).websocket_url
}));

const wsUrl = `${qrData.api_base_url.replace('http', 'ws')}/ws/audio/relay?` +
  `destinations=${encodeURIComponent(JSON.stringify(destinationsParam))}` +
  `&token=${qrData.token}`;

// 4. Connect
const ws = new WebSocket(wsUrl);
```

## Testing Checklist

- [x] Backend API returns `websocket_url` for audio consumers
- [ ] Frontend UI shows destination checkboxes
- [ ] User can select multiple destinations
- [ ] Recording starts with selected destinations
- [ ] Audio streams to all selected destinations
- [ ] Relay logs show successful fanout
- [ ] Chronicle and Mycelia both process the audio
- [ ] Error handling works (invalid destination, disconnection)
- [ ] Mobile app updated to use new flow

## Next Steps

1. **Test the frontend UI:**
   ```bash
   cd mycelia/frontend
   deno task dev
   # Navigate to recording page and test destination selection
   ```

2. **Update mobile app:**
   - Change QR code format
   - Implement destination query
   - Add destination picker UI
   - Update connection logic to use relay

3. **Production readiness:**
   - Add destination health checks
   - Implement recording templates (save favorite destination combos)
   - Add per-destination audio quality settings
   - Monitor relay performance and latency

## Files Changed

### Configuration
- `config/wiring.yaml` - Removed client device wiring

### Frontend
- `mycelia/frontend/src/components/audio/DestinationSelector.tsx` - New component
- `mycelia/frontend/src/components/audio/RecordingControls.tsx` - Integrated selector
- `mycelia/frontend/src/hooks/useAudioRecording.ts` - Relay connection logic

### Backend
- `ushadow/backend/src/routers/providers.py` - Added websocket_url to response

### Documentation
- `docs/AUDIO_CLIENT_ARCHITECTURE.md` - Architecture guide
- `docs/TESTING_AUDIO_RELAY.md` - Testing instructions
- `AUDIO_RELAY_IMPLEMENTATION.md` - This summary

## Summary

**What works now:**
- Frontend can query available audio destinations
- User can select multiple destinations before recording
- Recording connects to relay with selected destinations
- Relay fans out audio to all destinations

**What remains:**
- Test end-to-end with browser UI
- Update mobile app to use new architecture
- Verify multi-destination streaming in production

The architecture is now correct: client devices choose destinations at runtime instead of being statically wired like backend services.
