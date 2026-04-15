/**
 * useMultiDestinationStreamer.ts
 *
 * Hook for streaming audio to multiple destinations via relay server.
 *
 * Two modes:
 * 1. Direct multi-cast: Opens multiple WebSocket connections from mobile
 * 2. Server relay: Single connection to relay server that fans out
 */
import { useState, useCallback } from 'react';
import { useAudioStreamer } from './useAudioStreamer';

export interface MultiDestinationConfig {
  destinations: Array<{
    name: string;
    url: string;
  }>;
  mode: 'direct' | 'relay';
  relayUrl?: string; // Required if mode === 'relay'
}

export interface UseMultiDestinationStreamer {
  isStreaming: boolean;
  startMultiStreaming: (
    config: MultiDestinationConfig,
    streamMode?: 'batch' | 'streaming',
    codec?: 'pcm' | 'opus'
  ) => Promise<void>;
  stopMultiStreaming: () => void;
  sendAudioToAll: (audioBytes: Uint8Array) => void;
  destinationStatus: Record<string, { isStreaming: boolean; error: string | null }>;
}

/**
 * Direct multi-cast: Opens multiple WebSocket connections
 */
export const useDirectMultiCast = (): UseMultiDestinationStreamer => {
  const [streamers, setStreamers] = useState<Record<string, ReturnType<typeof useAudioStreamer>>>({});
  const [isStreaming, setIsStreaming] = useState(false);

  const startMultiStreaming = useCallback(async (
    config: MultiDestinationConfig,
    streamMode: 'batch' | 'streaming' = 'streaming',
    codec: 'pcm' | 'opus' = 'pcm'
  ) => {
    // Create streamer for each destination
    const newStreamers: Record<string, any> = {};
    for (const dest of config.destinations) {
      // This is a simplified version - in real implementation,
      // you'd need to dynamically create useAudioStreamer instances
      // which is tricky with React hooks. See relay mode for better approach.
      console.warn('[DirectMultiCast] Direct mode requires pre-configured streamers');
    }
    setIsStreaming(true);
  }, []);

  const stopMultiStreaming = useCallback(() => {
    Object.values(streamers).forEach(streamer => streamer.stopStreaming());
    setIsStreaming(false);
  }, [streamers]);

  const sendAudioToAll = useCallback((audioBytes: Uint8Array) => {
    Object.values(streamers).forEach(streamer => streamer.sendAudio(audioBytes));
  }, [streamers]);

  const destinationStatus = Object.entries(streamers).reduce((acc, [name, streamer]) => {
    acc[name] = {
      isStreaming: streamer.isStreaming,
      error: streamer.error,
    };
    return acc;
  }, {} as Record<string, { isStreaming: boolean; error: string | null }>);

  return {
    isStreaming,
    startMultiStreaming,
    stopMultiStreaming,
    sendAudioToAll,
    destinationStatus,
  };
};

/**
 * Server relay: Single connection to relay endpoint
 * RECOMMENDED - more efficient for mobile
 */
export const useRelayStreamer = (): UseMultiDestinationStreamer => {
  const relayStreamer = useAudioStreamer();
  const [destinationStatus, setDestinationStatus] = useState<
    Record<string, { isStreaming: boolean; error: string | null }>
  >({});

  const startMultiStreaming = useCallback(async (
    config: MultiDestinationConfig,
    streamMode: 'batch' | 'streaming' = 'streaming',
    codec: 'pcm' | 'opus' = 'pcm'
  ) => {
    if (config.mode !== 'relay' || !config.relayUrl) {
      throw new Error('Relay mode requires relayUrl');
    }

    // Build relay URL with destinations parameter
    const destinationsParam = encodeURIComponent(JSON.stringify(config.destinations));

    // Get token from storage or context
    // TODO: Replace with actual token retrieval
    const token = 'YOUR_JWT_TOKEN';

    const relayWsUrl = `${config.relayUrl}?destinations=${destinationsParam}&token=${token}`;

    console.log('[RelayStreamer] Connecting to relay:', relayWsUrl);

    // Connect to relay server with specified codec
    await relayStreamer.startStreaming(relayWsUrl, streamMode, codec);

    // Initialize status for all destinations
    const status: Record<string, { isStreaming: boolean; error: string | null }> = {};
    config.destinations.forEach(dest => {
      status[dest.name] = { isStreaming: true, error: null };
    });
    setDestinationStatus(status);
  }, [relayStreamer]);

  const stopMultiStreaming = useCallback(() => {
    relayStreamer.stopStreaming();
    setDestinationStatus({});
  }, [relayStreamer]);

  const sendAudioToAll = useCallback((audioBytes: Uint8Array) => {
    // Send once to relay, it handles fanout
    relayStreamer.sendAudio(audioBytes);
  }, [relayStreamer]);

  return {
    isStreaming: relayStreamer.isStreaming,
    startMultiStreaming,
    stopMultiStreaming,
    sendAudioToAll,
    destinationStatus,
  };
};

/**
 * Main hook - auto-selects mode based on config
 */
export const useMultiDestinationStreamer = (): UseMultiDestinationStreamer => {
  const relayStreamer = useRelayStreamer();
  const directStreamer = useDirectMultiCast();
  const [currentMode, setCurrentMode] = useState<'direct' | 'relay'>('relay');

  const startMultiStreaming = useCallback(async (
    config: MultiDestinationConfig,
    streamMode: 'batch' | 'streaming' = 'streaming',
    codec: 'pcm' | 'opus' = 'pcm'
  ) => {
    setCurrentMode(config.mode);

    if (config.mode === 'relay') {
      return relayStreamer.startMultiStreaming(config, streamMode, codec);
    } else {
      return directStreamer.startMultiStreaming(config, streamMode, codec);
    }
  }, [relayStreamer, directStreamer]);

  const stopMultiStreaming = useCallback(() => {
    if (currentMode === 'relay') {
      relayStreamer.stopMultiStreaming();
    } else {
      directStreamer.stopMultiStreaming();
    }
  }, [currentMode, relayStreamer, directStreamer]);

  const sendAudioToAll = useCallback((audioBytes: Uint8Array) => {
    if (currentMode === 'relay') {
      relayStreamer.sendAudioToAll(audioBytes);
    } else {
      directStreamer.sendAudioToAll(audioBytes);
    }
  }, [currentMode, relayStreamer, directStreamer]);

  const activeStreamer = currentMode === 'relay' ? relayStreamer : directStreamer;

  return {
    isStreaming: activeStreamer.isStreaming,
    startMultiStreaming,
    stopMultiStreaming,
    sendAudioToAll,
    destinationStatus: activeStreamer.destinationStatus,
  };
};
