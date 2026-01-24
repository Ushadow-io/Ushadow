# Audio Provider System - Corrected Architecture

## Summary

Audio is now a proper provider capability system with **two separate capabilities**:

1. **`audio_input`** - Audio SOURCES (mobile, Omi, desktop, file, UNode)
2. **`audio_consumer`** - Audio DESTINATIONS (Chronicle, Mycelia, relay, webhooks)

## Architecture

```
┌─────────────────────┐            ┌──────────────────────┐
│  Audio INPUT        │            │  Audio CONSUMER      │
│  (Source/Provider)  │  ────────> │  (Destination)       │
└─────────────────────┘            └──────────────────────┘

 • Mobile App Mic                   • Chronicle
 • Omi Device                       • Mycelia
 • Desktop Mic                      • Multi-Destination
 • Audio File Upload                • Custom WebSocket
 • UNode Device                     • Webhook
```

## Files Created/Modified

### Configuration Files
- ✅ `config/capabilities.yaml` - Added `audio_input` and `audio_consumer` capabilities
- ✅ `config/providers/audio_input.yaml` - 5 input providers (mobile, omi, desktop, file, unode)
- ✅ `config/providers/audio_consumer.yaml` - 5 consumer providers (chronicle, mycelia, multi-dest, custom, webhook)
- ✅ `config/config.defaults.yaml` - Default selections

### Backend API
- ✅ `ushadow/backend/src/routers/audio_provider.py` - Audio consumer API
  - `GET /api/providers/audio_consumer/active` - Get where to send audio
  - `GET /api/providers/audio_consumer/available` - List consumers
  - `PUT /api/providers/audio_consumer/active` - Switch consumer
- ✅ `ushadow/backend/src/routers/audio_relay.py` - Multi-destination relay
  - `WS /ws/audio/relay` - Fanout to multiple consumers
- ✅ `ushadow/backend/main.py` - Registered routers

### Mobile App Integration
- ✅ `ushadow/mobile/app/services/audioProviderApi.ts` - Consumer discovery API
- ✅ `ushadow/mobile/app/hooks/useMultiDestinationStreamer.ts` - Multi-cast support

### Documentation
- ✅ `docs/AUDIO_PROVIDER_ARCHITECTURE.md` - Complete architecture guide
- ✅ `MULTI_DESTINATION_AUDIO_EXAMPLE.md` - Relay examples

## How It Works

### Mobile App (Audio Input Provider)

```typescript
// 1. Mobile app asks: "Where should I send my audio?"
const consumer = await getActiveAudioConsumer(baseUrl, token);
// Returns: { provider_id: "chronicle", websocket_url: "ws://chronicle:5001/...", ...}

// 2. Mobile app connects to that consumer
const wsUrl = buildAudioStreamUrl(consumer, token);
await audioStreamer.startStreaming(wsUrl, 'streaming');

// 3. Mobile app sends audio
recorder.startRecording((audioData) => {
  audioStreamer.sendAudio(audioData); // Goes to Chronicle
});
```

### Configuration Examples

**Send to Chronicle** (default):
```yaml
selected_providers:
  audio_consumer: chronicle
```

**Send to Mycelia**:
```yaml
selected_providers:
  audio_consumer: mycelia
```

**Send to BOTH (multi-destination)**:
```yaml
selected_providers:
  audio_consumer: multi-destination

audio_consumer:
  multi_dest_destinations: '[
    {"name":"chronicle","url":"ws://chronicle:5001/chronicle/ws_pcm"},
    {"name":"mycelia","url":"ws://mycelia:5173/ws_pcm"}
  ]'
```

## Testing

```bash
# Start backend
cd ushadow/backend
uvicorn main:app --reload

# Test API
curl http://localhost:8000/api/providers/audio_consumer/active

# Response:
{
  "capability": "audio_consumer",
  "selected_provider": "chronicle",
  "config": {
    "provider_id": "chronicle",
    "websocket_url": "ws://chronicle-backend:5001/chronicle/ws_pcm",
    "protocol": "wyoming",
    "format": "pcm_s16le_16khz_mono"
  }
}

# Switch to Mycelia
curl -X PUT http://localhost:8000/api/providers/audio_consumer/active \
  -H "Authorization: Bearer TOKEN" \
  -d '{"provider_id":"mycelia"}'
```

## Key Benefits

✅ **Correct Semantics**: Audio sources are inputs, processors are consumers
✅ **Flexible Routing**: Any source → any consumer(s)
✅ **No Hardcoding**: Mobile app discovers consumer dynamically
✅ **Multi-Destination**: Built-in fanout support
✅ **Follows Pattern**: Same structure as LLM/transcription providers
✅ **Provider Discovery**: Mobile apps query API instead of hardcoded URLs

## Next Steps

1. **Configure default consumer** in `config/config.defaults.yaml`
2. **Mobile app integration** - Use `getActiveAudioConsumer()` to discover endpoint
3. **Test routing** - Send mobile audio to Chronicle, then switch to Mycelia
4. **Try multi-destination** - Send audio to both simultaneously
