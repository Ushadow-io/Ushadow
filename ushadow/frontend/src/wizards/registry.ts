/**
 * Wizard Registry
 *
 * Central registry of all available wizards with their metadata.
 * Used by WizardStartPage to dynamically list all wizards.
 */

export interface WizardMetadata {
  id: string
  path: string
  label: string
  description: string
}

/**
 * All available wizards in the application.
 * Add new wizards here when creating them.
 */
export const wizardRegistry: WizardMetadata[] = [
  {
    id: 'quickstart',
    path: '/wizard/quickstart',
    label: 'Quickstart',
    description: 'Configure API keys',
  },
  {
    id: 'local',
    path: '/wizard/local',
    label: 'Local Services',
    description: 'Local LLM & transcription',
  },
  {
    id: 'chronicle',
    path: '/wizard/chronicle',
    label: 'Chronicle',
    description: 'Conversation engine setup',
  },
  {
    id: 'memory',
    path: '/wizard/memory',
    label: 'Memory',
    description: 'OpenMemory setup',
  },
  {
    id: 'tailscale',
    path: '/wizard/tailscale',
    label: 'Tailscale',
    description: 'Secure remote access',
  },
  {
    id: 'speaker-recognition',
    path: '/wizard/speaker-recognition',
    label: 'Speaker ID',
    description: 'Speaker diarization & identification',
  },
]

/**
 * Get all wizard metadata
 */
export function getAllWizards(): WizardMetadata[] {
  return wizardRegistry
}

/**
 * Get wizard by ID
 */
export function getWizardById(id: string): WizardMetadata | undefined {
  return wizardRegistry.find((w) => w.id === id)
}
