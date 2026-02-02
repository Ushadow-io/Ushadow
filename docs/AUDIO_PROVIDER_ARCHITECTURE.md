# Audio Provider Architecture

## Correct Architecture

```
Audio INPUT Providers (Sources)          Audio CONSUMERS (Processing Services)
        ├─ Mobile App Mic         ─────→        ├─ Chronicle
        ├─ Omi Device            ─────→        ├─ Mycelia
        ├─ Desktop Mic           ─────→        ├─ Multi-Destination
        ├─ Audio File Upload     ─────→        └─ Custom Webhook
        └─ UNode Device          ─────→
```

## Two Separate Capabilities

### 1. `audio_input` - Audio Sources (Providers)
**What they do**: Generate/capture audio and stream it out
**Examples**: Mobile app, Omi device, desktop microphone, file upload
**Config file**: `config/providers/audio_input.yaml`

**Available Providers**:
- `mobile-app` - Mobile device microphone (iOS/Android)
- `omi-device` - Omi wearable Bluetooth device
- `desktop-mic` - Desktop/laptop microphone
- `audio-file` - Pre-recorded audio file upload
- `unode` - Remote audio streaming node (Raspberry Pi, etc.)

### 2. `audio_consumer` - Audio Processing Services (Consumers)
**What they do**: Receive audio streams and process them
**Examples**: Chronicle (transcription), Mycelia (processing), custom webhooks
**Config file**: `config/providers/audio_consumer.yaml`

**Available Providers**:
- `chronicle` - Transcription, speaker diarization, conversation tracking (default)
- `mycelia` - Audio processing, timeline storage, workflow orchestration
- `multi-destination` - Fanout to multiple consumers simultaneously
- `custom-websocket` - Any custom WebSocket endpoint
- `webhook` - HTTP POST to external API

## Configuration

### Default Selection
**File**: `config/config.defaults.yaml`

```yaml
selected_providers:
  audio_input: mobile-app      # Which audio source
  audio_consumer: chronicle    # Where audio goes
```

### Routing: Mobile App → Chronicle

```yaml
# Mobile app streams audio to Chronicle
audio_input: mobile-app
audio_consumer: chronicle
```

Mobile app connects to Chronicle's WebSocket endpoint.

### Routing: Mobile App → Mycelia

```yaml
# Mobile app streams audio to Mycelia instead
audio_input: mobile-app
audio_consumer: mycelia
```

Mobile app connects to Mycelia's WebSocket endpoint.

### Routing: Mobile App → Both (Multi-Destination)

```yaml
# Mobile app streams to BOTH Chronicle and Mycelia
audio_input: mobile-app
audio_consumer: multi-destination

# Configure destinations
audio_consumer:
  multi_dest_destinations: '[
    {"name":"chronicle","url":"ws://chronicle-backend:5001/chronicle/ws_pcm"},
    {"name":"mycelia","url":"ws://mycelia-backend:5173/ws_pcm"}
  ]'
```

Mobile app connects to relay server, which fans out to both consumers.

## How It Works

### Step 1: Audio Input Provides Audio
```typescript
// Mobile app (audio input provider)
const audioStreamer = useAudioStreamer();
const recorder = usePhoneAudioRecorder();

// Start recording
await recorder.startRecording((audioData) => {
  audioStreamer.sendAudio(new Uint8Array(audioData));
});
```

### Step 2: Get Audio Consumer Config
```typescript
// Mobile app fetches where to send audio
const consumer = await getActiveAudioConsumer(baseUrl, token);

// Returns:
// {
//   provider_id: "chronicle",
//   websocket_url: "ws://chronicle-backend:5001/chronicle/ws_pcm",
//   protocol: "wyoming",
//   format: "pcm_s16le_16khz_mono"
// }
```

### Step 3: Connect to Consumer
```typescript
// Mobile app connects to the selected consumer
const wsUrl = buildAudioStreamUrl(consumer, token);
await audioStreamer.startStreaming(wsUrl, 'streaming');

// Now audio flows: Mobile Mic → Chronicle
```

## Example Configurations

### Configuration 1: Mobile → Chronicle (Default)
```yaml
audio_input: mobile-app
audio_consumer: chronicle
```

**Flow**: Mobile microphone → Chronicle transcription
**Use case**: Standard transcription and conversation tracking

### Configuration 2: Omi Device → Mycelia
```yaml
audio_input: omi-device
audio_consumer: mycelia
```

**Flow**: Omi Bluetooth device → Mycelia processing
**Use case**: Wearable audio → custom processing workflows

### Configuration 3: Desktop → Multi-Destination
```yaml
audio_input: desktop-mic
audio_consumer: multi-destination

audio_consumer:
  multi_dest_destinations: '[
    {"name":"chronicle","url":"ws://chronicle:5001/chronicle/ws_pcm"},
    {"name":"mycelia","url":"ws://mycelia:5173/ws_pcm"}
  ]'
```

**Flow**: Desktop mic → Relay → Chronicle + Mycelia
**Use case**: Send audio to multiple processors simultaneously

### Configuration 4: File Upload → Webhook
```yaml
audio_input: audio-file
audio_consumer: webhook

audio_consumer:
  webhook_url: "https://api.external.com/audio/process"
  webhook_api_key: "your-api-key"
```

**Flow**: Audio file → External API
**Use case**: Batch processing of audio files via external service

## API Endpoints

### Get Active Audio Consumer
```bash
GET /api/providers/audio_consumer/active

Response:
{
  "provider_id": "chronicle",
  "websocket_url": "ws://chronicle-backend:5001/chronicle/ws_pcm",
  "protocol": "wyoming",
  "format": "pcm_s16le_16khz_mono"
}
```

### Get Available Audio Consumers
```bash
GET /api/providers/audio_consumer/available

Response:
{
  "providers": [
    {"id": "chronicle", "name": "Chronicle", "mode": "local"},
    {"id": "mycelia", "name": "Mycelia", "mode": "local"},
    {"id": "multi-destination", "name": "Multi-Destination", "mode": "relay"}
  ]
}
```

### Switch Audio Consumer
```bash
PUT /api/providers/audio_consumer/active
{
  "provider_id": "mycelia"
}

Response:
{
  "success": true,
  "selected_provider": "mycelia",
  "message": "Audio consumer set to 'Mycelia'"
}
```

## Mobile App Integration

The mobile app automatically discovers and connects to the selected audio consumer:

```typescript
import { getActiveAudioConsumer, buildAudioStreamUrl } from './services/audioProviderApi';

// 1. Fetch active consumer configuration
const consumer = await getActiveAudioConsumer(baseUrl, jwtToken);

// 2. Build WebSocket URL with authentication
const wsUrl = buildAudioStreamUrl(consumer, jwtToken);
// Result: "ws://chronicle:5001/chronicle/ws_pcm?token=JWT_HERE"

// 3. Start streaming to consumer
await audioStreamer.startStreaming(wsUrl, 'streaming');

// 4. Send audio data
recorder.startRecording((audioData) => {
  audioStreamer.sendAudio(new Uint8Array(audioData));
});
```

**No hardcoded URLs!** Mobile app dynamically discovers where to send audio based on server configuration.

## Switching Consumers

### From Chronicle to Mycelia

**Before**:
```yaml
audio_consumer: chronicle
```

Mobile app streams to Chronicle endpoint.

**After**:
```yaml
audio_consumer: mycelia
```

Mobile app now streams to Mycelia endpoint (after refresh/reconnect).

### From Single to Multi-Destination

**Before**:
```yaml
audio_consumer: chronicle
```

**After**:
```yaml
audio_consumer: multi-destination

audio_consumer:
  multi_dest_destinations: '[
    {"name":"chronicle","url":"ws://chronicle:5001/chronicle/ws_pcm"},
    {"name":"mycelia","url":"ws://mycelia:5173/ws_pcm"}
  ]'
```

Mobile app connects once to relay, audio goes to both Chronicle AND Mycelia.

## Benefits

✅ **Separation of Concerns**: Input sources and processing services are separate
✅ **Flexible Routing**: Route any input to any consumer(s)
✅ **No Hardcoded URLs**: Mobile app discovers consumer endpoints dynamically
✅ **Multi-Destination**: Built-in fanout to multiple consumers
✅ **Easy Switching**: Change consumer in config, no app changes needed

## Wiring Examples

For advanced routing, use `config/wiring.yaml`:

```yaml
wiring:
  # Mobile app audio → Chronicle
  - source_instance_id: mobile-app-1
    source_capability: audio_input
    target_instance_id: chronicle-compose:chronicle-backend
    target_capability: audio_consumer

  # Omi device audio → Mycelia
  - source_instance_id: omi-device-1
    source_capability: audio_input
    target_instance_id: mycelia-compose:mycelia-backend
    target_capability: audio_consumer

  # Desktop audio → Multi-destination (Chronicle + Mycelia)
  - source_instance_id: desktop-mic-1
    source_capability: audio_input
    target_instance_id: audio-relay
    target_capability: audio_consumer
```

This allows different audio sources to route to different consumers!
