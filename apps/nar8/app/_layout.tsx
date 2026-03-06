/**
 * nar8 Root Layout
 *
 * Sets up providers and navigation stack.
 * Uses shared mobile-core components with nar8 branding.
 */

import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ThemeProvider } from '../../../packages/mobile-core/core';
import { BluetoothProvider, OmiConnectionProvider } from '../../../packages/mobile-core/ble';
import { nar8AppTheme } from './theme/appTheme';
import { theme } from './theme';

export default function RootLayout() {
  return (
    <ThemeProvider theme={nar8AppTheme}>
      <BluetoothProvider>
        <OmiConnectionProvider>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: theme.background },
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          </Stack>
        </OmiConnectionProvider>
      </BluetoothProvider>
    </ThemeProvider>
  );
}
