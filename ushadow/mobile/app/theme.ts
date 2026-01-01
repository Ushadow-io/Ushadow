/**
 * Ushadow Mobile Theme
 *
 * Centralized color system matching the web frontend design system.
 * Colors are extracted from the Ushadow logo (green and purple).
 *
 * @see ushadow/frontend/src/components/ColorSystemPreview.tsx
 */

// ════════════════════════════════════════════════════════════════════════════
// BRAND COLORS - Extracted from the Ushadow Logo
// ════════════════════════════════════════════════════════════════════════════

export const colors = {
  // Primary Green Scale (from logo's green arm)
  primary: {
    50: '#f0fdf4',
    100: '#dcfce7',
    200: '#bbf7d0',
    300: '#86efac',
    400: '#4ade80',  // Main brand green
    500: '#22c55e',
    600: '#16a34a',
    700: '#15803d',
    800: '#166534',
    900: '#14532d',
  },

  // Accent Purple Scale (from logo's purple arm)
  accent: {
    50: '#faf5ff',
    100: '#f3e8ff',
    200: '#e9d5ff',
    300: '#d8b4fe',
    400: '#c084fc',
    500: '#a855f7',  // Main brand purple
    600: '#9333ea',
    700: '#7e22ce',
    800: '#6b21a8',
    900: '#581c87',
  },

  // ════════════════════════════════════════════════════════════════════════════
  // SURFACE COLORS - Dark Theme Background Hierarchy
  // ════════════════════════════════════════════════════════════════════════════
  surface: {
    900: '#0f0f13',  // Page background
    800: '#1a1a21',  // Cards
    700: '#252530',  // Inputs
    600: '#2d2d3a',  // Hover states
    500: '#3d3d4a',  // Borders
    400: '#52525b',  // Subtle elements
  },

  // ════════════════════════════════════════════════════════════════════════════
  // TEXT COLORS
  // ════════════════════════════════════════════════════════════════════════════
  text: {
    primary: '#f4f4f5',    // Bright - headings, important text
    secondary: '#a1a1aa',  // Medium - body text, descriptions
    muted: '#71717a',      // Dim - captions, placeholders, disabled
  },

  // ════════════════════════════════════════════════════════════════════════════
  // SEMANTIC COLORS - Feedback & Status
  // ════════════════════════════════════════════════════════════════════════════
  success: {
    light: '#86efac',
    default: '#4ade80',
    dark: '#16a34a',
    bg: 'rgba(74, 222, 128, 0.1)',
    bgSolid: '#065f46',
  },

  error: {
    light: '#fca5a5',
    default: '#f87171',
    dark: '#dc2626',
    bg: 'rgba(248, 113, 113, 0.1)',
    bgSolid: '#7f1d1d',
  },

  warning: {
    light: '#fcd34d',
    default: '#fbbf24',
    dark: '#d97706',
    bg: 'rgba(251, 191, 36, 0.1)',
    bgSolid: '#854d0e',
  },

  info: {
    light: '#93c5fd',
    default: '#60a5fa',
    dark: '#2563eb',
    bg: 'rgba(96, 165, 250, 0.1)',
    bgSolid: '#1e3a5f',
  },

  // ════════════════════════════════════════════════════════════════════════════
  // UTILITY
  // ════════════════════════════════════════════════════════════════════════════
  white: '#ffffff',
  black: '#000000',
  transparent: 'transparent',
};

// ════════════════════════════════════════════════════════════════════════════
// GRADIENTS
// ════════════════════════════════════════════════════════════════════════════

export const gradients = {
  // Brand gradient: Green to Purple (135deg)
  brand: ['#4ade80', '#a855f7'],
  brandLight: ['#86efac', '#c084fc'],
};

// ════════════════════════════════════════════════════════════════════════════
// SEMANTIC THEME TOKENS - Quick access aliases
// ════════════════════════════════════════════════════════════════════════════

export const theme = {
  // Backgrounds
  background: colors.surface[900],
  backgroundCard: colors.surface[800],
  backgroundInput: colors.surface[700],
  backgroundHover: colors.surface[600],

  // Borders
  border: colors.surface[500],
  borderSubtle: colors.surface[400],

  // Text
  textPrimary: colors.text.primary,
  textSecondary: colors.text.secondary,
  textMuted: colors.text.muted,

  // Interactive (using brand green as primary)
  primaryButton: colors.primary[400],
  primaryButtonHover: colors.primary[300],
  primaryButtonActive: colors.primary[500],
  primaryButtonText: colors.surface[900],  // Dark text on green

  // Secondary (using brand purple)
  secondaryButton: colors.accent[500],
  secondaryButtonHover: colors.accent[400],
  secondaryButtonActive: colors.accent[600],
  secondaryButtonText: colors.white,

  // Ghost/Outline buttons
  ghostButton: colors.transparent,
  ghostButtonHover: colors.surface[600],
  ghostButtonBorder: colors.surface[400],
  ghostButtonText: colors.text.primary,

  // Status indicators
  statusOnline: colors.success.default,
  statusOffline: colors.error.default,
  statusConnecting: colors.warning.default,
  statusIdle: colors.surface[400],

  // Links
  link: colors.primary[400],
  linkHover: colors.primary[300],
};

// ════════════════════════════════════════════════════════════════════════════
// SPACING & SIZING (for consistency)
// ════════════════════════════════════════════════════════════════════════════

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

export default {
  colors,
  gradients,
  theme,
  spacing,
  borderRadius,
  fontSize,
};
