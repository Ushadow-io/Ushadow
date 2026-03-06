/**
 * nar8 Theme
 *
 * Warm, focused color system for routine tracking.
 * Orange/amber primary (energy, action) with deep navy backgrounds.
 */

// ════════════════════════════════════════════════════════════════════════
// BRAND COLORS
// ════════════════════════════════════════════════════════════════════════

export const colors = {
  // Primary Orange Scale (energy, action, warmth)
  primary: {
    50: '#fff7ed',
    100: '#ffedd5',
    200: '#fed7aa',
    300: '#fdba74',
    400: '#fb923c',  // Main brand orange
    500: '#f97316',
    600: '#ea580c',
    700: '#c2410c',
    800: '#9a3412',
    900: '#7c2d12',
  },

  // Accent Teal Scale (calm, focus, clarity)
  accent: {
    50: '#f0fdfa',
    100: '#ccfbf1',
    200: '#99f6e4',
    300: '#5eead4',
    400: '#2dd4bf',
    500: '#14b8a6',  // Main accent teal
    600: '#0d9488',
    700: '#0f766e',
    800: '#115e59',
    900: '#134e4a',
  },

  // Surface Colors - Deep Navy
  surface: {
    900: '#0a0a12',  // Page background
    800: '#12121c',  // Cards
    700: '#1a1a28',  // Inputs
    600: '#242436',  // Hover states
    500: '#333348',  // Borders
    400: '#4a4a60',  // Subtle elements
  },

  // Text Colors
  text: {
    primary: '#f4f4f5',
    secondary: '#a1a1aa',
    muted: '#71717a',
  },

  // Semantic Colors
  success: {
    light: '#86efac',
    default: '#4ade80',
    dark: '#16a34a',
    bg: 'rgba(74, 222, 128, 0.1)',
  },
  error: {
    light: '#fca5a5',
    default: '#f87171',
    dark: '#dc2626',
    bg: 'rgba(248, 113, 113, 0.1)',
  },
  warning: {
    light: '#fcd34d',
    default: '#fbbf24',
    dark: '#d97706',
    bg: 'rgba(251, 191, 36, 0.1)',
  },
  info: {
    light: '#93c5fd',
    default: '#60a5fa',
    dark: '#2563eb',
    bg: 'rgba(96, 165, 250, 0.1)',
  },

  white: '#ffffff',
  black: '#000000',
  transparent: 'transparent',
};

// ════════════════════════════════════════════════════════════════════════
// GRADIENTS
// ════════════════════════════════════════════════════════════════════════

export const gradients = {
  brand: ['#fb923c', '#14b8a6'],      // Orange to Teal
  brandLight: ['#fdba74', '#5eead4'],  // Light orange to light teal
  warm: ['#fb923c', '#f97316'],        // Warm orange
};

// ════════════════════════════════════════════════════════════════════════
// SEMANTIC THEME TOKENS
// ════════════════════════════════════════════════════════════════════════

export const theme = {
  background: colors.surface[900],
  backgroundCard: colors.surface[800],
  backgroundInput: colors.surface[700],
  backgroundHover: colors.surface[600],
  border: colors.surface[500],
  borderSubtle: colors.surface[400],
  textPrimary: colors.text.primary,
  textSecondary: colors.text.secondary,
  textMuted: colors.text.muted,
  primaryButton: colors.primary[400],
  primaryButtonHover: colors.primary[300],
  primaryButtonActive: colors.primary[500],
  primaryButtonText: colors.surface[900],
};

// ════════════════════════════════════════════════════════════════════════
// SPACING & SIZING
// ════════════════════════════════════════════════════════════════════════

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
};

export const borderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
};

export const fontSize = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
};

export default { colors, gradients, theme, spacing, borderRadius, fontSize };
