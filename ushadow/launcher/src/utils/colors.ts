/**
 * Color utility for environment-based theming
 * Ported from setup/vscode_utils/colors.py
 */

interface ColorPair {
  primary: string
  dark: string
}

// Predefined named colors with their hex codes
const NAMED_COLORS: Record<string, ColorPair> = {
  // Primary colors
  red: { primary: '#c41e3a', dark: '#731f2a' },
  blue: { primary: '#0066cc', dark: '#003366' },
  green: { primary: '#2ea043', dark: '#1f7a34' },
  yellow: { primary: '#f0ad4e', dark: '#c08a1e' },

  // Extended colors
  gold: { primary: '#DAA520', dark: '#8B6914' },
  orange: { primary: '#ff6b35', dark: '#cc5629' },
  purple: { primary: '#8b3a8b', dark: '#5c2a5c' },
  pink: { primary: '#ff1493', dark: '#c90a69' },
  cyan: { primary: '#00bcd4', dark: '#00838f' },
  teal: { primary: '#009688', dark: '#004d40' },
  lime: { primary: '#76ff03', dark: '#558b2f' },
  indigo: { primary: '#3f51b5', dark: '#283593' },
  brown: { primary: '#795548', dark: '#4e342e' },
  grey: { primary: '#757575', dark: '#424242' },
  gray: { primary: '#757575', dark: '#424242' },
  black: { primary: '#212121', dark: '#000000' },

  // Additional colors
  silver: { primary: '#a8a8a8', dark: '#6b6b6b' },
  coral: { primary: '#ff7f50', dark: '#cc6640' },
  salmon: { primary: '#fa8072', dark: '#c8665b' },
  navy: { primary: '#000080', dark: '#000050' },
  magenta: { primary: '#ff00ff', dark: '#cc00cc' },
  violet: { primary: '#ee82ee', dark: '#be68be' },
  maroon: { primary: '#800000', dark: '#500000' },
  olive: { primary: '#808000', dark: '#505000' },
  aqua: { primary: '#00ffff', dark: '#00cccc' },
  turquoise: { primary: '#40e0d0', dark: '#33b3a6' },
  crimson: { primary: '#dc143c', dark: '#b01030' },
  lavender: { primary: '#e6e6fa', dark: '#b8b8c8' },
  mint: { primary: '#98ff98', dark: '#7acc7a' },
  peach: { primary: '#ffcba4', dark: '#cca283' },
  rose: { primary: '#ff007f', dark: '#cc0066' },
  ruby: { primary: '#e0115f', dark: '#b30d4c' },
  emerald: { primary: '#50c878', dark: '#40a060' },
  sapphire: { primary: '#0f52ba', dark: '#0c4295' },
  amber: { primary: '#ffbf00', dark: '#cc9900' },
  bronze: { primary: '#cd7f32', dark: '#a46628' },
  copper: { primary: '#b87333', dark: '#935c29' },
  platinum: { primary: '#e5e4e2', dark: '#b7b6b5' },
  slate: { primary: '#708090', dark: '#5a6673' },
  charcoal: { primary: '#36454f', dark: '#2b373f' },

  // Semantic environment names
  main: { primary: '#2ea043', dark: '#1f7a34' },
  master: { primary: '#2ea043', dark: '#1f7a34' },
  dev: { primary: '#0066cc', dark: '#003366' },
  develop: { primary: '#0066cc', dark: '#003366' },
  staging: { primary: '#f0ad4e', dark: '#c08a1e' },
  stage: { primary: '#f0ad4e', dark: '#c08a1e' },
  prod: { primary: '#c41e3a', dark: '#731f2a' },
  production: { primary: '#c41e3a', dark: '#731f2a' },
  test: { primary: '#8b3a8b', dark: '#5c2a5c' },
  qa: { primary: '#8b3a8b', dark: '#5c2a5c' },
  feature: { primary: '#00bcd4', dark: '#00838f' },
  hotfix: { primary: '#ff6b35', dark: '#cc5629' },
  bugfix: { primary: '#ff6b35', dark: '#cc5629' },
  release: { primary: '#009688', dark: '#004d40' },
  sandbox: { primary: '#76ff03', dark: '#558b2f' },
  demo: { primary: '#ff1493', dark: '#c90a69' },
  default: { primary: '#0066cc', dark: '#003366' },
}

/**
 * Simple hash function for strings
 */
function hashString(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  const hex = Math.abs(hash).toString(16).padStart(6, '0').slice(0, 6)
  return hex
}

/**
 * Generate a color from a name using hashing
 */
function hashToColor(name: string): ColorPair {
  const hashHex = hashString(name)
  const primary = `#${hashHex}`

  const r = parseInt(hashHex.slice(0, 2), 16)
  const g = parseInt(hashHex.slice(2, 4), 16)
  const b = parseInt(hashHex.slice(4, 6), 16)

  const darkR = Math.max(0, Math.floor(r * 0.6))
  const darkG = Math.max(0, Math.floor(g * 0.6))
  const darkB = Math.max(0, Math.floor(b * 0.6))

  const dark = `#${darkR.toString(16).padStart(2, '0')}${darkG.toString(16).padStart(2, '0')}${darkB.toString(16).padStart(2, '0')}`

  return { primary, dark }
}

/**
 * Get colors for a name, using named colors or generating via hash
 */
export function getColors(name: string): ColorPair {
  const nameLower = name.toLowerCase().trim()

  if (NAMED_COLORS[nameLower]) {
    return NAMED_COLORS[nameLower]
  }

  return hashToColor(name)
}

/**
 * Parse a color string to RGB values
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.test(hex) ? hex.replace('#', '') : null
  if (!result) return null
  return {
    r: parseInt(result.slice(0, 2), 16),
    g: parseInt(result.slice(2, 4), 16),
    b: parseInt(result.slice(4, 6), 16),
  }
}

/**
 * Get contrasting text color (black or white) for a background
 */
export function getContrastColor(hexColor: string): string {
  const rgb = hexToRgb(hexColor)
  if (!rgb) return '#ffffff'

  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255
  return luminance > 0.5 ? '#000000' : '#ffffff'
}

export const namedColors = Object.keys(NAMED_COLORS)
