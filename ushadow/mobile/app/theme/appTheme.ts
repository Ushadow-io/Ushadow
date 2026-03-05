/**
 * AppTheme adapter — maps ushadow's theme tokens to the AppTheme interface
 * consumed by @ushadow/mobile-core components (RoutineCard, TimelineView, etc.).
 */

import type { AppTheme } from '../../../../packages/mobile-core/core';
import { colors, gradients, spacing, borderRadius, fontSize, theme } from '../theme';

export const ushadowAppTheme: AppTheme = {
  colors: {
    primary: colors.primary,
    accent: colors.accent,
    background: theme.background,
    backgroundCard: theme.backgroundCard,
    backgroundSecondary: theme.backgroundInput,
    text: colors.text.primary,
    textSecondary: colors.text.secondary,
    textMuted: colors.text.muted,
    border: theme.border,
    success: colors.success.default,
    warning: colors.warning.default,
    error: colors.error.default,
  },
  spacing: {
    xs: spacing.xs,
    sm: spacing.sm,
    md: spacing.md,
    lg: spacing.lg,
    xl: spacing.xl,
    xxl: spacing['2xl'],
  },
  borderRadius: {
    sm: borderRadius.sm,
    md: borderRadius.md,
    lg: borderRadius.lg,
    xl: borderRadius.xl,
    full: borderRadius.full,
  },
  fontSize: {
    xs: fontSize.xs,
    sm: fontSize.sm,
    md: fontSize.base,
    lg: fontSize.lg,
    xl: fontSize.xl,
    xxl: fontSize['2xl'],
    hero: fontSize['3xl'],
  },
  gradients,
};
