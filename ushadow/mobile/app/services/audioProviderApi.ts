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
 * // Returns: { provider_id: "chronicle", websocket_url: "wss://host/ws/audio/relay", ... }
 *
 * const wsUrl = buildAudioStreamUrl(consumer, jwtToken);
 * // Result: "wss://host/ws/audio/relay?destinations=[...]&token=JWT"
 *
 * await audioStreamer.startStreaming(wsUrl, 'streaming');
 * // Mobile mic → Audio Relay → Chronicle/Mycelia
 */

// =============================================================================
// New Deployment-Based Discovery (Multi-Destination Support)
// =============================================================================

export interface AudioDestination {
  instance_id: string;
  instance_name: string;
  url: string;
  type: string;
  name: string;
  metadata?: {
    protocol?: string;
    data?: string;
  };
  status: string;
}

/**
 * Get available audio destinations from running service instances.
 * Uses deployment-based discovery instead of provider registry.
 * This supports multi-destination streaming via relay.
 *
 * @param baseUrl - The base URL of the ushadow backend
 * @param token - JWT authentication token
 * @param format - Optional audio format filter ('pcm', 'opus', etc.)
 */
export async function getAvailableAudioDestinations(
  baseUrl: string,
  token: string,
  format?: string
): Promise<AudioDestination[]> {
  // Build query parameters
  const params = new URLSearchParams({
    type: 'audio',
    status: 'running',
  });

  if (format) {
    params.append('format', format);
  }

  const url = `${baseUrl}/api/deployments/exposed-urls?${params.toString()}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch audio destinations: ${response.statusText}`);
  }

  const destinations: AudioDestination[] = await response.json();
  return destinations;
}

/**
 * Build relay WebSocket URL with multiple destinations.
 * Connects to relay endpoint which fans out to all selected destinations.
 *
 * Adds codec parameter to destination URLs based on audio source:
 * - mic (device microphone) → ?codec=pcm
 * - omi (hardware device) → ?codec=opus
 */
export function buildRelayUrl(
  baseUrl: string,
  token: string,
  selectedDestinations: AudioDestination[],
  audioSource: 'mic' | 'omi' = 'mic'
): string {
  // Convert http(s) to ws(s)
  const wsBaseUrl = baseUrl.replace(/^http/, 'ws');

  // Determine codec based on audio source
  const codec = audioSource === 'omi' ? 'opus' : 'pcm';

  // Build destinations array for relay - add codec parameter if not present
  const destinations = selectedDestinations.map(dest => {
    let destUrl = dest.url;

    // Add codec parameter if the URL doesn't already have it
    if (!destUrl.includes('codec=')) {
      const separator = destUrl.includes('?') ? '&' : '?';
      destUrl = `${destUrl}${separator}codec=${codec}`;
    }

    return {
      name: dest.instance_name,
      url: destUrl,
    };
  });

  // Create relay URL
  const url = new URL(`${wsBaseUrl}/ws/audio/relay`);
  url.searchParams.set('destinations', JSON.stringify(destinations));
  url.searchParams.set('token', token);

  return url.toString();
}

/**
 * Build direct WebSocket URL for single destination.
 *
 * DEPRECATED: Use buildRelayUrl instead, even for single destinations.
 * Mobile apps cannot connect directly to internal Docker container names.
 * The relay at /ws/audio/relay handles forwarding to internal services.
 */
export function buildDirectUrl(
  destination: AudioDestination,
  token: string
): string {
  // Convert http(s) to ws(s) for WebSocket connection
  const wsUrl = destination.url.replace(/^http/, 'ws');
  const url = new URL(wsUrl);
  url.searchParams.set('token', token);
  return url.toString();
}
