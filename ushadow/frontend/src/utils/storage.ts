/**
 * Helper to get environment-specific localStorage keys
 * Each environment (ushadow, ushadow-blue, ushadow-gold, etc.) gets its own token storage
 * This prevents token conflicts when running multiple worktree environments simultaneously
 */
export const getStorageKey = (key: string): string => {
  const basePath = import.meta.env.BASE_URL || '/'
  // Normalize: /ushadow-gold/ -> ushadow-gold, / -> root
  const envName = basePath.replace(/^\/|\/$/g, '') || 'ushadow'
  return `${envName}_${key}`
}
