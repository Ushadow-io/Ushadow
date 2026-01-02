/**
 * Root Layout for Ushadow Mobile
 *
 * Sets up the navigation and global providers.
 * Uses tab-based navigation with Home, Conversations, and Memories.
 */

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { theme } from './theme';
import { BluetoothProvider, OmiConnectionProvider } from './contexts';

export default function RootLayout() {
  return (
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
  );
}
