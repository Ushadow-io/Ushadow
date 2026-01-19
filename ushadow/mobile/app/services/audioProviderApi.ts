/**
 * audioProviderApi.ts
 *
 * API client for fetching audio consumer configuration.
 * Mobile app is the audio INPUT (provider/source).
 * This API tells the mobile app WHERE to send audio (the consumer/destination).
 */

export interface AudioConsumerConfig {
  provider_id: string;
  name: string;
  websocket_url: string;
  protocol: string;
  format: string;
  mode?: string;
  destinations?: Array<{ name: string; url: string }>;
}

export interface AudioConsumerResponse {
  capability: 'audio_consumer';
  selected_provider: string;
  config: AudioConsumerConfig;
  available_providers: string[];
}

/**
 * Fetch the active audio consumer configuration.
 * This tells the mobile app WHERE to send its audio.
 */
export async function getActiveAudioConsumer(
  baseUrl: string,
  token: string
): Promise<AudioConsumerConfig> {
  const url = `${baseUrl}/api/providers/audio_consumer/active`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch audio consumer: ${response.statusText}`);
  }

  const data: AudioConsumerResponse = await response.json();
  return data.config;
}

/**
 * Get available audio consumers (Chronicle, Mycelia, etc.)
 */
export async function getAvailableAudioConsumers(
  baseUrl: string,
  token: string
): Promise<Array<{ id: string; name: string; description: string; mode: string }>> {
  const url = `${baseUrl}/api/providers/audio_consumer/available`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch available consumers: ${response.statusText}`);
  }

  const data = await response.json();
  return data.providers || [];
}

/**
 * Set the active audio consumer (requires admin permission)
 * Changes where mobile audio gets sent (Chronicle, Mycelia, etc.)
 */
export async function setActiveAudioConsumer(
  baseUrl: string,
  token: string,
  consumerId: string
): Promise<void> {
  const url = `${baseUrl}/api/providers/audio_consumer/active`;

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      provider_id: consumerId,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to set audio consumer: ${response.statusText}`);
  }
}

/**
 * Build full WebSocket URL with token
 */
export function buildAudioStreamUrl(
  config: AudioConsumerConfig,
  token: string
): string {
  const url = new URL(config.websocket_url);

  // Add token as query parameter
  url.searchParams.set('token', token);

  // For multi-destination relay, add destinations
  if (config.provider_id === 'multi-destination' && config.destinations) {
    url.searchParams.set(
      'destinations',
      JSON.stringify(config.destinations)
    );
  }

  return url.toString();
}

/**
 * Example usage in mobile app:
 *
 * // Mobile app is the audio INPUT source
 * // This API tells it WHERE to send audio (the consumer)
 *
 * const consumer = await getActiveAudioConsumer('https://ushadow.ts.net', jwtToken);
 * // Returns: { provider_id: "chronicle", websocket_url: "ws://chronicle:5001/chronicle/ws_pcm", ... }
 *
 * const wsUrl = buildAudioStreamUrl(consumer, jwtToken);
 * // Result: "ws://chronicle:5001/chronicle/ws_pcm?token=JWT"
 *
 * await audioStreamer.startStreaming(wsUrl, 'streaming');
 * // Mobile mic → Chronicle
 */
