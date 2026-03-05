/**
 * Root Layout for Ushadow Mobile
 *
 * Sets up the navigation and global providers.
 * Uses tab-based navigation with Home, Conversations, and Memories.
 * Provides feature flags, Bluetooth, and OMI connection contexts.
 *
 * Configures @ushadow/mobile-core/auth with ushadow-specific settings.
 */

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { theme } from './theme';
import { BluetoothProvider, OmiConnectionProvider } from './contexts';
import { FeatureFlagProvider } from './contexts/FeatureFlagContext';
import { ThemeProvider } from '../../../packages/mobile-core/core';
import { configureAuth, refreshToken } from '../../../packages/mobile-core/auth';
import { ushadowAppTheme } from './theme/appTheme';
import AppConfig from './config';

// Initialise shared auth module with ushadow-specific settings.
// This must run before any auth operations (token reads, OAuth flows, etc.).
configureAuth({
  defaultServerUrl: AppConfig.DEFAULT_SERVER_URL,
  oauthScheme: 'ushadow',
  storagePrefix: '@ushadow',
  refreshTokenFn: refreshToken,
});

export default function RootLayout() {
  return (
    <ThemeProvider theme={ushadowAppTheme}>
      <FeatureFlagProvider>
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
      </FeatureFlagProvider>
    </ThemeProvider>
  );
}
