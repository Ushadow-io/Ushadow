/**
 * Wizard Components
 *
 * All wizards follow a consistent pattern using the WizardShell base component.
 * Each wizard handles its own step content and business logic while the shell
 * provides navigation, progress tracking, and consistent styling.
 */

// Export individual wizards
export { default as TailscaleWizard } from './TailscaleWizard'
export { default as ChronicleWizard } from './ChronicleWizard'
export { default as MemoryWizard } from './MemoryWizard'
export { default as QuickstartWizard } from './QuickstartWizard'
export { default as LocalServicesWizard } from './LocalServicesWizard'
export { default as SpeakerRecognitionWizard } from './SpeakerRecognitionWizard'

// Export wizard registry for dynamic discovery
export { wizardRegistry, getAllWizards, getWizardById } from './registry'
export type { WizardMetadata } from './registry'
