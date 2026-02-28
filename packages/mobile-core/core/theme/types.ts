/**
 * Theme type definitions for injectable theming across apps.
 *
 * Each app (ushadow, nar8, etc.) provides its own AppTheme to the ThemeProvider.
 */

export interface ColorScale {
  50: string;
  100: string;
  200: string;
  300: string;
  400: string;
  500: string;
  600: string;
  700: string;
  800: string;
  900: string;
}

export interface AppTheme {
  colors: {
    primary: ColorScale;
    accent: ColorScale;
    background: string;
    backgroundCard: string;
    backgroundSecondary: string;
    text: string;
    textSecondary: string;
    textMuted: string;
    border: string;
    success: string;
    warning: string;
    error: string;
  };
  spacing: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    xxl: number;
  };
  borderRadius: {
    sm: number;
    md: number;
    lg: number;
    xl: number;
    full: number;
  };
  fontSize: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    xxl: number;
    hero: number;
  };
  gradients: Record<string, string[]>;
}
