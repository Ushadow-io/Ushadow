/**
 * ProfileScreen — Shared user profile & account management screen.
 *
 * Portable: all theming and app-specific behaviour injected via props.
 * Each host app wraps this with its own theme values and navigation.
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import {
  getAuthToken,
  getAuthInfo,
  getApiUrl,
  getIdToken,
  clearAuthToken,
  isAuthenticated,
} from './authStorage';
import { logoutFromKeycloak } from './keycloakAuth';

// ── Types ───────────────────────────────────────────────────────────

export interface ProfileTheme {
  background: string;
  card: string;
  cardBorder: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  danger: string;
  dangerBg: string;
  separator: string;
}

export interface ProfileScreenProps {
  /** Visual theme tokens. */
  theme: ProfileTheme;
  /** Called after a successful logout so the host app can reset navigation/state. */
  onLogout: () => void;
  /** Optional hostname of the connected unode (shown in the server info section). */
  hostname?: string;
  /** App display name shown in the header (e.g. "Ushadow", "nar8"). */
  appName?: string;
  /** App version string (e.g. "1.2.0"). */
  appVersion?: string;
  /** Extra sections to render below the default ones. */
  children?: React.ReactNode;
}

interface UserInfo {
  email: string;
  userId: string;
  name?: string;
  preferredUsername?: string;
  issuer?: string;
  expiresAt?: Date;
}

// ── Helpers ─────────────────────────────────────────────────────────

function parseJwtClaims(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    return JSON.parse(atob(parts[1]));
  } catch {
    return null;
  }
}

function extractUserInfo(token: string): UserInfo | null {
  const claims = parseJwtClaims(token);
  if (!claims || !claims.email || !claims.sub) return null;

  return {
    email: claims.email as string,
    userId: claims.sub as string,
    name: (claims.name as string) || undefined,
    preferredUsername: (claims.preferred_username as string) || undefined,
    issuer: (claims.iss as string) || undefined,
    expiresAt: claims.exp ? new Date((claims.exp as number) * 1000) : undefined,
  };
}

function getInitials(name?: string, email?: string): string {
  if (name) {
    return name
      .split(' ')
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }
  if (email) return email[0].toUpperCase();
  return '?';
}

// ── Component ───────────────────────────────────────────────────────

export function ProfileScreen({
  theme: t,
  onLogout,
  hostname,
  appName,
  appVersion,
  children,
}: ProfileScreenProps) {
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    try {
      const authed = await isAuthenticated();
      setAuthenticated(authed);

      if (authed) {
        const token = await getAuthToken();
        if (token) {
          setUserInfo(extractUserInfo(token));
        }
        const url = await getApiUrl();
        setServerUrl(url);
      }
    } catch (error) {
      console.error('[ProfileScreen] Failed to load profile:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          setLoggingOut(true);
          try {
            // Keycloak server-side logout
            if (serverUrl) {
              try {
                const idToken = await getIdToken();
                await logoutFromKeycloak(serverUrl, idToken || undefined, hostname);
              } catch (error) {
                console.warn('[ProfileScreen] Keycloak logout failed, continuing:', error);
              }
            }
            // Clear local tokens
            await clearAuthToken();
            onLogout();
          } catch (error) {
            console.error('[ProfileScreen] Logout error:', error);
          } finally {
            setLoggingOut(false);
          }
        },
      },
    ]);
  }

  const styles = createStyles(t);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={t.accent} />
      </View>
    );
  }

  if (!authenticated || !userInfo) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyIcon}>👤</Text>
        <Text style={styles.emptyTitle}>Not signed in</Text>
        <Text style={styles.emptySubtitle}>
          Sign in from the home screen to see your profile.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Avatar + Name */}
      <View style={styles.avatarSection}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {getInitials(userInfo.name, userInfo.email)}
          </Text>
        </View>
        {userInfo.name && <Text style={styles.displayName}>{userInfo.name}</Text>}
        <Text style={styles.email}>{userInfo.email}</Text>
        {userInfo.preferredUsername && userInfo.preferredUsername !== userInfo.email && (
          <Text style={styles.username}>@{userInfo.preferredUsername}</Text>
        )}
      </View>

      {/* Account Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.card}>
          <InfoRow label="Email" value={userInfo.email} theme={t} />
          <View style={styles.separator} />
          {userInfo.preferredUsername && (
            <>
              <InfoRow label="Username" value={userInfo.preferredUsername} theme={t} />
              <View style={styles.separator} />
            </>
          )}
          <InfoRow label="User ID" value={userInfo.userId} theme={t} monospace />
          {userInfo.expiresAt && (
            <>
              <View style={styles.separator} />
              <InfoRow
                label="Session expires"
                value={userInfo.expiresAt.toLocaleString()}
                theme={t}
              />
            </>
          )}
        </View>
      </View>

      {/* Server Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Connection</Text>
        <View style={styles.card}>
          {hostname && (
            <>
              <InfoRow label="Node" value={hostname} theme={t} />
              <View style={styles.separator} />
            </>
          )}
          <InfoRow label="Server" value={serverUrl || 'Unknown'} theme={t} monospace />
          {userInfo.issuer && (
            <>
              <View style={styles.separator} />
              <InfoRow label="Auth provider" value={userInfo.issuer} theme={t} monospace />
            </>
          )}
        </View>
      </View>

      {/* App-specific extra sections */}
      {children}

      {/* App Info */}
      {(appName || appVersion) && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <View style={styles.card}>
            {appName && <InfoRow label="App" value={appName} theme={t} />}
            {appName && appVersion && <View style={styles.separator} />}
            {appVersion && <InfoRow label="Version" value={appVersion} theme={t} />}
          </View>
        </View>
      )}

      {/* Logout */}
      <TouchableOpacity
        style={styles.logoutButton}
        onPress={handleLogout}
        disabled={loggingOut}
        testID="profile-logout-button"
      >
        {loggingOut ? (
          <ActivityIndicator color={t.danger} />
        ) : (
          <Text style={styles.logoutButtonText}>Sign Out</Text>
        )}
      </TouchableOpacity>

      <View style={styles.bottomPadding} />
    </ScrollView>
  );
}

// ── InfoRow sub-component ───────────────────────────────────────────

function InfoRow({
  label,
  value,
  theme: t,
  monospace,
}: {
  label: string;
  value: string;
  theme: ProfileTheme;
  monospace?: boolean;
}) {
  return (
    <View style={{ paddingVertical: 12, paddingHorizontal: 16 }}>
      <Text style={{ fontSize: 12, color: t.textMuted, marginBottom: 2 }}>{label}</Text>
      <Text
        style={{
          fontSize: 15,
          color: t.textPrimary,
          fontFamily: monospace ? 'monospace' : undefined,
        }}
        selectable
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

function createStyles(t: ProfileTheme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: t.background,
    },
    content: {
      paddingBottom: 40,
    },
    centered: {
      flex: 1,
      backgroundColor: t.background,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    emptyIcon: {
      fontSize: 48,
      marginBottom: 16,
    },
    emptyTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: t.textPrimary,
      marginBottom: 8,
    },
    emptySubtitle: {
      fontSize: 15,
      color: t.textSecondary,
      textAlign: 'center',
      lineHeight: 22,
    },

    // Avatar section
    avatarSection: {
      alignItems: 'center',
      paddingTop: 32,
      paddingBottom: 24,
    },
    avatar: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: t.accent,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 12,
    },
    avatarText: {
      fontSize: 28,
      fontWeight: '700',
      color: '#fff',
    },
    displayName: {
      fontSize: 22,
      fontWeight: '700',
      color: t.textPrimary,
      marginBottom: 4,
    },
    email: {
      fontSize: 15,
      color: t.textSecondary,
    },
    username: {
      fontSize: 14,
      color: t.textMuted,
      marginTop: 2,
    },

    // Sections
    section: {
      paddingHorizontal: 16,
      marginBottom: 24,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: '600',
      color: t.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 8,
      paddingHorizontal: 4,
    },
    card: {
      backgroundColor: t.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.cardBorder,
      overflow: 'hidden',
    },
    separator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: t.separator,
      marginHorizontal: 16,
    },

    // Logout
    logoutButton: {
      marginHorizontal: 16,
      marginTop: 8,
      backgroundColor: t.dangerBg,
      borderRadius: 12,
      padding: 16,
      alignItems: 'center',
    },
    logoutButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: t.danger,
    },
    bottomPadding: {
      height: 24,
    },
  });
}
