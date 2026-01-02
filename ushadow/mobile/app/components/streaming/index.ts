/**
 * Streaming Components
 *
 * Unified streaming experience with source/destination selection,
 * waveform visualization, and streaming controls.
 */

export { StreamingDisplay } from './StreamingDisplay';
export { StreamingButton } from './StreamingButton';
export { SourceSelector } from './SourceSelector';
export { DestinationSelector } from './DestinationSelector';
export { UnifiedStreamingPage } from './UnifiedStreamingPage';

// Types
export type { StreamSource } from './SourceSelector';

// Re-export for backward compatibility
export { StreamingDisplay as default } from './StreamingDisplay';
