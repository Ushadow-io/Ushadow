/**
 * audioProviderApi — Re-export shim.
 * Source of truth: @ushadow/mobile-core/audio
 */
export {
  getActiveAudioConsumer,
  getAvailableAudioConsumers,
  setActiveAudioConsumer,
  buildAudioStreamUrl,
  getAvailableAudioDestinations,
  buildRelayUrl,
  buildDirectUrl,
} from '../../../../packages/mobile-core/audio/services/audioProviderApi';

export type {
  AudioConsumerConfig,
  AudioConsumerResponse,
  AudioDestination,
} from '../../../../packages/mobile-core/audio/services/audioProviderApi';
