/**
 * Home Tab - Ushadow Mobile
 *
 * Unified streaming interface with source/destination selection,
 * waveform visualization, and streaming controls.
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Image,
  TouchableOpacity,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import {
  ConnectionLogViewer,
  LoginScreen,
  UnifiedStreamingPage,
  BackgroundTaskDebugPanel,
} from '../components';
import { useConnectionLog, useSessionTracking } from '../hooks';
import { colors, theme, gradients, spacing, borderRadius, fontSize } from '../theme';
import {
  getAuthToken,
  clearAuthToken,
  getAuthInfo,
  isAuthenticated,
  saveAuthToken,
  saveApiUrl,
  getApiUrl,
  getIdToken,
} from '../_utils/authStorage';
import { getActiveUnode } from '../_utils/unodeStorage';
import { ConnectionState, createInitialConnectionState } from '../types/connectionLog';
import { logoutFromKeycloak } from '../services/keycloakAuth';

export default function HomeScreen() {
  // Auth state
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [authInfo, setAuthInfo] = useState<{ email: string; userId: string } | null>(null);
  const [showLoginScreen, setShowLoginScreen] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [currentHostname, setCurrentHostname] = useState<string | undefined>(undefined);
  const [currentApiUrl, setCurrentApiUrl] = useState<string | undefined>(undefined);

  // UI state
  const [showLogViewer, setShowLogViewer] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    createInitialConnectionState()
  );

  // Connection logging hook
  const { entries: logEntries, connectionState: logConnectionState, logEvent, clearLogs, clearLogsByType } = useConnectionLog();

  // Session tracking hook
  const { sessions, startSession, updateSessionStatus, endSession, clearAllSessions } = useSessionTracking();

  // Load auth state and unode info on mount
  useEffect(() => {
    const loadAuthState = async () => {
      try {
        const authenticated = await isAuthenticated();
        if (authenticated) {
          const token = await getAuthToken();
          const info = await getAuthInfo();
          setAuthToken(token);
          setAuthInfo(info);
          logEvent('server', 'connected', 'Authenticated session restored', info?.email);
        }

        // Load current unode hostname and API URL for Keycloak config
        const activeUnode = await getActiveUnode();
        const apiUrl = await getApiUrl();

        console.log('[Home] Debug - activeUnode:', activeUnode);
        console.log('[Home] Debug - apiUrl:', apiUrl);

        if (activeUnode) {
          // Use stored hostname (e.g., "Orion"), fallback to name if not set
          const hostname = activeUnode.hostname || activeUnode.name;

          setCurrentHostname(hostname);
          setCurrentApiUrl(apiUrl || activeUnode.apiUrl);
          console.log('[Home] Loaded active unode hostname:', hostname);
          console.log('[Home] Loaded API URL:', apiUrl || activeUnode.apiUrl);
        } else if (apiUrl) {
          setCurrentApiUrl(apiUrl);
          console.log('[Home] Loaded API URL (no active unode):', apiUrl);
        } else {
          console.log('[Home] No active unode or API URL found');
        }
      } catch (error) {
        console.error('[Home] Failed to load auth state:', error);
      } finally {
        setAuthLoading(false);
      }
    };
    loadAuthState();
  }, [logEvent]);

  // Refresh auth state when screen regains focus (e.g., after scanning QR code)
  useFocusEffect(
    useCallback(() => {
      const refreshAuthState = async () => {
        const authenticated = await isAuthenticated();
        const activeUnode = await getActiveUnode();

        if (authenticated) {
          const token = await getAuthToken();
          const info = await getAuthInfo();
          // Only update if token changed
          if (token !== authToken) {
            setAuthToken(token);
            setAuthInfo(info);
          }
        } else {
          // Not authenticated
          if (authToken) {
            // Token was cleared or expired
            setAuthToken(null);
            setAuthInfo(null);
          }

          // Auto-show login if there's a recently saved unode (within last 5 seconds)
          // This indicates a fresh QR scan, not just an old saved connection
          if (activeUnode && !showLoginScreen && activeUnode.lastConnectedAt) {
            const lastConnected = new Date(activeUnode.lastConnectedAt).getTime();
            const now = Date.now();
            const fiveSecondsAgo = now - 5000;

            if (lastConnected > fiveSecondsAgo) {
              console.log('[Home] Recently scanned QR code - showing login screen');
              // Populate connection info from the freshly scanned unode
              setCurrentApiUrl(activeUnode.apiUrl);
              setCurrentHostname(activeUnode.hostname || activeUnode.name);
              setShowLoginScreen(true);
            }
          }
        }
      };
      refreshAuthState();
    }, [authToken, showLoginScreen])
  );

  const handleLoginSuccess = useCallback(
    async (token: string, apiUrl: string) => {
      await saveAuthToken(token);
      await saveApiUrl(apiUrl);
      setAuthToken(token);
      const info = await getAuthInfo();
      setAuthInfo(info);
      setShowLoginScreen(false);
      setConnectionState((prev) => ({ ...prev, server: 'connected' }));
      logEvent('server', 'connected', 'Login successful', info?.email);
    },
    [logEvent]
  );

  const handleLogout = useCallback(async () => {
    // Logout from Keycloak session first (if available)
    if (currentApiUrl) {
      try {
        const idToken = await getIdToken();
        console.log('[Home] Logging out with ID token:', idToken ? 'present' : 'missing');
        await logoutFromKeycloak(currentApiUrl, idToken || undefined, currentHostname);
      } catch (error) {
        console.warn('[Home] Keycloak logout failed, continuing with local logout:', error);
      }
    }

    // Clear local auth state
    await clearAuthToken();
    setAuthToken(null);
    setAuthInfo(null);
    setConnectionState((prev) => ({ ...prev, server: 'disconnected' }));
    logEvent('server', 'disconnected', 'Logged out');
  }, [logEvent, currentApiUrl, currentHostname]);

  return (
    <SafeAreaView style={styles.container} testID="home-screen">
      <StatusBar barStyle="light-content" backgroundColor={theme.background} />

      {/* Header */}
      <View style={styles.header} testID="home-header">
        <View style={styles.headerTop}>
          <Image
            source={require('../../assets/logo.png')}
            style={styles.logo}
            resizeMode="contain"
            testID="home-logo"
          />
          <LinearGradient
            colors={gradients.brand as [string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.titleGradientContainer}
          >
            <Text style={styles.title}>Ushadow</Text>
          </LinearGradient>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => setShowLogViewer(true)}
              testID="show-logs-button"
            >
              <Ionicons name="list" size={22} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>
        <Text style={styles.subtitle}>Mobile Control</Text>
      </View>

      {/* Auth Status */}
      {!authLoading && (
        <View style={styles.authStatus} testID="auth-status">
          {authToken ? (
            <View style={styles.authLoggedIn}>
              <View style={styles.authInfo}>
                <Text style={styles.authLabel}>Signed in as</Text>
                <Text style={styles.authEmail}>{authInfo?.email || 'Unknown'}</Text>
              </View>
              <TouchableOpacity
                style={styles.logoutButton}
                onPress={handleLogout}
                testID="logout-button"
              >
                <Text style={styles.logoutButtonText}>Logout</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.loginPrompt}
              onPress={() => setShowLoginScreen(true)}
              testID="login-prompt"
            >
              <Ionicons name="log-in-outline" size={18} color={theme.link} />
              <Text style={styles.loginPromptText}>Sign in to your account</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Unified Streaming Page */}
      <View style={styles.streamingContainer}>
        <UnifiedStreamingPage
          authToken={authToken}
          onAuthRequired={(opts) => {
            if (opts?.apiUrl) setCurrentApiUrl(opts.apiUrl);
            if (opts?.hostname) setCurrentHostname(opts.hostname);
            setShowLoginScreen(true);
          }}
          onWebSocketLog={(status, message, details) => logEvent('websocket', status, message, details)}
          onBluetoothLog={(status, message, details) => logEvent('bluetooth', status, message, details)}
          onSessionStart={startSession}
          onSessionUpdate={updateSessionStatus}
          onSessionEnd={endSession}
          testID="unified-streaming"
        />
      </View>

      {/* Background Task Debug Panel */}
      <View style={styles.debugPanel}>
        <BackgroundTaskDebugPanel testID="background-task-debug" />
      </View>

      {/* Login Screen Modal */}
      <LoginScreen
        visible={showLoginScreen}
        onClose={() => setShowLoginScreen(false)}
        onLoginSuccess={handleLoginSuccess}
        initialApiUrl={currentApiUrl}
        hostname={currentHostname}
      />

      {/* Connection Log Viewer Modal */}
      <ConnectionLogViewer
        visible={showLogViewer}
        onClose={() => setShowLogViewer(false)}
        entries={logEntries}
        connectionState={logConnectionState}
        sessions={sessions}
        onClearLogs={clearLogs}
        onClearLogsByType={clearLogsByType}
        onClearSessions={clearAllSessions}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    alignItems: 'center',
  },
  headerTop: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  logo: {
    width: 48,
    height: 48,
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  iconButton: {
    padding: spacing.sm,
    backgroundColor: theme.backgroundCard,
    borderRadius: borderRadius.md,
  },
  titleGradientContainer: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    flex: 1,
    marginHorizontal: spacing.md,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: 'bold',
    color: theme.background,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: theme.textSecondary,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  authStatus: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  authLoggedIn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.backgroundCard,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  authInfo: {
    flex: 1,
  },
  authLabel: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
  },
  authEmail: {
    fontSize: fontSize.sm,
    color: theme.textPrimary,
    fontWeight: '500',
  },
  logoutButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
    backgroundColor: theme.backgroundInput,
  },
  logoutButtonText: {
    color: theme.textSecondary,
    fontSize: fontSize.sm,
  },
  loginPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: theme.backgroundCard,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: theme.link,
    borderStyle: 'dashed',
  },
  loginPromptText: {
    color: theme.link,
    fontSize: fontSize.sm,
  },
  streamingContainer: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  debugPanel: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
});
