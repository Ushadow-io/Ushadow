/**
 * ThemeProvider — Injectable theme context for multi-app support.
 *
 * Each app wraps its root with <ThemeProvider theme={myTheme}>.
 * Components from @ushadow/mobile-core consume the theme via useTheme().
 */

import React, { createContext, useContext } from 'react';
import type { AppTheme } from './types';

const ThemeContext = createContext<AppTheme | null>(null);

export interface ThemeProviderProps {
  theme: AppTheme;
  children: React.ReactNode;
}

export function ThemeProvider({ theme, children }: ThemeProviderProps) {
  return (
    <ThemeContext.Provider value={theme}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): AppTheme {
  const theme = useContext(ThemeContext);
  if (!theme) {
    throw new Error('useTheme must be used within a <ThemeProvider>');
  }
  return theme;
}
