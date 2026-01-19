# Multi-Destination Audio Streaming

Stream audio from mobile app to multiple destinations (Chronicle + Mycelia) simultaneously.

## Architecture Options

### Option 1: Client-Side Multi-Cast (Direct)
```
Mobile App
  ├─> WebSocket 1 → Chronicle /chronicle/ws_pcm
  └─> WebSocket 2 → Mycelia /ws_pcm
```

**Pros**: Simple, no server changes
**Cons**: 2x bandwidth, 2x battery usage

### Option 2: Server-Side Relay (Recommended) ✨
```
Mobile App → WebSocket → Relay Server
                            ├─> Chronicle /chronicle/ws_pcm
                            └─> Mycelia /ws_pcm
```

**Pros**:
- Single connection from mobile (saves battery/bandwidth)
- Centralized error handling
- Can add destinations without mobile app changes

**Cons**: Requires server relay endpoint

## Usage Example

```typescript
import { useRelayStreamer } from './hooks/useMultiDestinationStreamer';
import { usePhoneAudioRecorder } from './hooks/usePhoneAudioRecorder';

function MultiDestinationRecording() {
  const relay = useRelayStreamer();
  const recorder = usePhoneAudioRecorder();

  const startRecording = async () => {
    // Configure destinations
    const config = {
      mode: 'relay' as const,
      relayUrl: 'wss://your-ushadow-host.ts.net/ws/audio/relay',
      destinations: [
        {
          name: 'chronicle',
          url: 'ws://localhost:5001/chronicle/ws_pcm'
        },
        {
          name: 'mycelia',
          url: 'ws://localhost:5173/ws_pcm'
        }
      ]
    };

    // Start relay connection
    await relay.startMultiStreaming(config, 'streaming');

    // Start recording and connect audio pipeline
    await recorder.startRecording((audioData) => {
      // Send to relay (which forwards to both destinations)
      relay.sendAudioToAll(new Uint8Array(audioData));
    });
  };

  const stopRecording = async () => {
    await recorder.stopRecording();
    relay.stopMultiStreaming();
  };

  return (
    <View>
      <Button
        onPress={startRecording}
        disabled={relay.isStreaming}
        data-testid="multi-dest-start-button"
      >
        Start Recording (Chronicle + Mycelia)
      </Button>

      <Button
        onPress={stopRecording}
        disabled={!relay.isStreaming}
        data-testid="multi-dest-stop-button"
      >
        Stop
      </Button>

      {/* Status for each destination */}
      {Object.entries(relay.destinationStatus).map(([name, status]) => (
        <View key={name} data-testid={`dest-status-${name}`}>
          <Text>{name}: {status.isStreaming ? '✓' : '✗'}</Text>
          {status.error && <Text style={{ color: 'red' }}>{status.error}</Text>}
        </View>
      ))}
    </View>
  );
}
```

## Configuration via UNode Settings

You can store multi-destination config in UNode settings:

```typescript
// In unode-details.tsx or similar
const [multiDestEnabled, setMultiDestEnabled] = useState(false);
const [destinations, setDestinations] = useState([
  { name: 'chronicle', url: 'ws://localhost:5001/chronicle/ws_pcm', enabled: true },
  { name: 'mycelia', url: 'ws://localhost:5173/ws_pcm', enabled: false },
]);

// Save to UNode storage
await AsyncStorage.setItem(
  `unode_${unodeId}_multi_dest`,
  JSON.stringify({ enabled: multiDestEnabled, destinations })
);
```

## Testing the Relay

1. **Start ushadow backend** with relay endpoint:
   ```bash
   cd ushadow/backend
   uvicorn main:app --host 0.0.0.0 --port 8000
   ```

2. **Start Chronicle** (if using):
   ```bash
   cd compose
   docker-compose -f chronicle-compose.yaml up
   ```

3. **Start Mycelia**:
   ```bash
   cd mycelia/backend
   deno run -A server.ts serve --port 5173
   ```

4. **Test relay endpoint**:
   ```bash
   # Check relay status
   curl http://localhost:8000/ws/audio/relay/status

   # Response:
   {
     "endpoint": "/ws/audio/relay",
     "protocol": "Wyoming",
     "description": "Multi-destination audio relay"
   }
   ```

5. **Connect from mobile**:
   ```typescript
   const relayUrl = 'ws://localhost:8000/ws/audio/relay';
   // or via Tailscale:
   const relayUrl = 'wss://your-machine.ts.net/ws/audio/relay';
   ```

## Security Notes

- Relay endpoint requires JWT token authentication
- Token is passed to destination endpoints for their auth
- All WebSocket connections use secure WebSocket (wss://) in production
- Consider rate limiting on relay endpoint

## Performance

**Bandwidth comparison** (16kHz, 16-bit, mono):
- Direct multi-cast: 32 KB/s × 2 = **64 KB/s**
- Server relay: **32 KB/s** (mobile → server)
  - Server → destinations: 32 KB/s × 2 (server bandwidth)

**Battery impact**:
- Direct: 2x WebSocket connections = higher battery drain
- Relay: 1x WebSocket connection = standard battery usage

## Future Enhancements

1. **Dynamic destination management**: Add/remove destinations during streaming
2. **Per-destination settings**: Different audio formats or modes per destination
3. **Fallback handling**: Continue streaming if one destination fails
4. **Metrics/monitoring**: Track relay performance and destination health
5. **Compression**: Compress audio before relay to reduce bandwidth
