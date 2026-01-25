/**
 * Wizard Registry
 *
 * Central registry of all available wizards with their metadata.
 * Used by WizardStartPage to dynamically list all wizards.
 */

import { LucideIcon, Sparkles, Shield, Smartphone, Mic, CheckCircle2, Wand2, Server, MessageSquare, Brain, Database } from 'lucide-react'

export interface WizardMetadata {
  id: string
  path: string
  label: string
  description: string
  /** Setup level (1-4 for main flow, undefined for additional wizards) */
  level?: number
  /** Brief completion message shown when level is done */
  completionMessage?: string
  /** Icon for the wizard */
  icon?: LucideIcon
}

/**
 * All available wizards in the application.
 * Main setup flow has levels 1-4:
 *   Level 1: Quickstart (API keys & core services)
 *   Level 2: Tailscale (secure remote access)
 *   Level 3: Mobile App (connect phone via QR)
 *   Level 4: Speaker Recognition (voice ID)
 */
export const wizardRegistry: WizardMetadata[] = [
  // === Main Setup Flow (Levels 1-4) ===
  {
    id: 'quickstart',
    path: '/wizard/quickstart',
    label: 'Quickstart',
    description: 'Configure API keys',
    level: 1,
    completionMessage: 'Core services configured',
    icon: Sparkles,
  },
  {
    id: 'tailscale',
    path: '/wizard/tailscale',
    label: 'Tailscale',
    description: 'Secure remote access',
    level: 2,
    completionMessage: 'Secure network enabled',
    icon: Shield,
  },
  {
    id: 'mobile-app',
    path: '/wizard/mobile-app',
    label: 'Mobile App',
    description: 'Connect via QR code',
    level: 3,
    completionMessage: 'Mobile app connected',
    icon: Smartphone,
  },
  {
    id: 'speaker-recognition',
    path: '/wizard/speaker-recognition',
    label: 'Speaker ID',
    description: 'Speaker diarization & identification',
    level: 4,
    completionMessage: 'Speaker recognition enabled',
    icon: Mic,
  },
  // === Additional Wizards (no level) ===
  {
    id: 'local',
    path: '/wizard/local',
    label: 'Local Services',
    description: 'Local LLM & transcription',
    icon: Server,
  },
  {
    id: 'chronicle',
    path: '/wizard/chronicle',
    label: 'Chronicle',
    description: 'Conversation engine setup',
    icon: MessageSquare,
  },
  {
    id: 'memory',
    path: '/wizard/memory',
    label: 'Memory',
    description: 'OpenMemory setup',
    icon: Brain,
  },
  {
    id: 'mycelia',
    path: '/wizard/mycelia',
    label: 'Mycelia',
    description: 'AI memory and timeline',
    icon: Database,
  },
]

/** Icon to show when all wizards are complete */
export const completedIcon = CheckCircle2

/** Default icon for unknown wizard levels */
export const defaultWizardIcon = Wand2

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

/**
 * Get main setup flow wizards (those with levels), sorted by level
 */
export function getMainFlowWizards(): WizardMetadata[] {
  return wizardRegistry
    .filter((w) => w.level !== undefined)
    .sort((a, b) => (a.level ?? 0) - (b.level ?? 0))
}

/**
 * Get wizard by level number
 */
export function getWizardByLevel(level: number): WizardMetadata | undefined {
  return wizardRegistry.find((w) => w.level === level)
}

/**
 * Get the next wizard in the main setup flow
 */
export function getNextLevelWizard(currentLevel: number): WizardMetadata | undefined {
  return getWizardByLevel(currentLevel + 1)
}

/**
 * Get icon for a wizard level (1-4), or completed/default icon
 */
export function getIconForLevel(level: number): LucideIcon {
  if (level > 4) return completedIcon
  const wizard = getWizardByLevel(level)
  return wizard?.icon ?? defaultWizardIcon
}
