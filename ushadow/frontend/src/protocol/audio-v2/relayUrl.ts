import { AUDIO_V2_SUBPROTOCOL } from './audioV2Socket'

interface AudioDestination {
  instance_name: string
  url: string
  metadata?: Record<string, any>
}

/**
 * Relay URL for an audio v2 session. The relay finds the Chronicle destination
 * by `protocol`; the others (Mycelia) still get Wyoming Opus and need ?codec=opus.
 * The login token travels in the v2 ClientHello, not in this URL.
 */
export function buildV2RelayUrl(wsBaseUrl: string, destinations: AudioDestination[]): string {
  const relayDestinations = destinations.map(dest => {
    const protocol = dest.metadata?.protocol
    const needsCodec = protocol !== AUDIO_V2_SUBPROTOCOL && !dest.url.includes('codec=')
    const url = needsCodec ? `${dest.url}${dest.url.includes('?') ? '&' : '?'}codec=opus` : dest.url
    return { name: dest.instance_name, url, protocol }
  })
  return `${wsBaseUrl}/ws/audio/relay?destinations=${encodeURIComponent(JSON.stringify(relayDestinations))}`
}
