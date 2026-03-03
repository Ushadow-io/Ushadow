/**
 * Profile Tab — Ushadow Mobile
 *
 * Wraps the shared ProfileScreen from mobile-core with ushadow theming.
 */

import React, { useCallback, useState } from 'react';
import { SafeAreaView, StyleSheet, StatusBar } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ProfileScreen } from '../../../../packages/mobile-core/auth';
import type { ProfileTheme } from '../../../../packages/mobile-core/auth';
import { theme, colors } from '../theme';
import { getActiveUnode } from '../_utils/unodeStorage';

const profileTheme: ProfileTheme = {
  background: theme.background,
  card: theme.backgroundCard,
  cardBorder: theme.border,
  textPrimary: theme.textPrimary,
  textSecondary: theme.textSecondary,
  textMuted: theme.textMuted,
  accent: colors.primary[400],
  danger: colors.error.default,
  dangerBg: colors.error.bg,
  separator: theme.border,
};

export default function ProfileTab() {
  const [hostname, setHostname] = useState<string | undefined>(undefined);
  const [refreshKey, setRefreshKey] = useState(0);

  useFocusEffect(
    useCallback(() => {
      // Reload hostname each time tab gains focus
      getActiveUnode().then((unode) => {
        setHostname(unode?.hostname || unode?.name || undefined);
      });
      // Bump key to re-mount ProfileScreen so it reloads auth state
      setRefreshKey((k) => k + 1);
    }, [])
  );

  const handleLogout = useCallback(() => {
    // Bump key to re-render the profile screen into "not signed in" state
    setRefreshKey((k) => k + 1);
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.background} />
      <ProfileScreen
        key={refreshKey}
        theme={profileTheme}
        onLogout={handleLogout}
        hostname={hostname}
        appName="Ushadow"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
});
