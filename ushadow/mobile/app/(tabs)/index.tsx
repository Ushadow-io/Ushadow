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
import NetInfo from '@react-native-community/netinfo';
import {
  ConnectionLogViewer,
  LoginScreen,
  UnifiedStreamingPage,
} from '../components';
import { useConnectionLog } from '../hooks';
import { colors, theme, gradients, spacing, borderRadius, fontSize } from '../theme';
import {
  getAuthToken,
  clearAuthToken,
  getAuthInfo,
  isAuthenticated,
  saveAuthToken,
  saveApiUrl,
} from '../utils/authStorage';
import { ConnectionState, createInitialConnectionState } from '../types/connectionLog';
import { isDemoMode, disableDemoMode } from '../utils/demoModeStorage';
import { DEMO_UNODE, MOCK_OMI_DEVICES } from '../utils/mockData';
import { getUnodes, removeUnode, getActiveUnodeId, setActiveUnode, getActiveUnode } from '../utils/unodeStorage';
import { getSavedOmiDevices, removeOmiDevice } from '../utils/omiDeviceStorage';
import { cleanupDemoChatData } from '../utils/chatStorage';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function HomeScreen() {
  // Auth state
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [authInfo, setAuthInfo] = useState<{ email: string; userId: string } | null>(null);
  const [showLoginScreen, setShowLoginScreen] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [demoMode, setDemoMode] = useState(false);

  // UI state
  const [showLogViewer, setShowLogViewer] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    createInitialConnectionState()
  );
  const [loginApiUrl, setLoginApiUrl] = useState<string>('https://blue.spangled-kettle.ts.net');

  // Connection logging hook
  const { entries: logEntries, logEvent, clearLogs } = useConnectionLog();

  // Load active UNode's API URL for login
  useEffect(() => {
    const loadLoginUrl = async () => {
      const activeUnode = await getActiveUnode();

      // If no active UNode or demo UNode, use default
      if (!activeUnode || activeUnode.id === DEMO_UNODE.id) {
        setLoginApiUrl('https://blue.spangled-kettle.ts.net');
        return;
      }

      // Use real UNode URL for login
      if (activeUnode.apiUrl) {
        setLoginApiUrl(activeUnode.apiUrl);
      }
    };

    // Load when login screen is about to open
    if (showLoginScreen) {
      loadLoginUrl();
    }
  }, [showLoginScreen]);

  // Load auth state on mount and clean up any leftover demo data
  useEffect(() => {
    const loadAuthState = async () => {
      try {
        const authenticated = await isAuthenticated();
        const inDemoMode = await isDemoMode();
        setDemoMode(inDemoMode);

        // Cleanup: Remove demo UNode/devices from storage if NOT in demo mode
        if (!inDemoMode) {
          const unodes = await getUnodes();
          if (unodes.some(node => node.id === DEMO_UNODE.id)) {
            await removeUnode(DEMO_UNODE.id);
          }

          const demoDeviceIds = MOCK_OMI_DEVICES.map(d => d.id);
          const omiDevices = await getSavedOmiDevices();
          const demoDevicesToRemove = omiDevices.filter(d => demoDeviceIds.includes(d.id));
          if (demoDevicesToRemove.length > 0) {
            await Promise.all(demoDevicesToRemove.map(d => removeOmiDevice(d.id)));
          }

          // Remove demo chat sessions
          await cleanupDemoChatData();
        }

        if (authenticated) {
          const token = await getAuthToken();
          const info = await getAuthInfo();
          setAuthToken(token);
          setAuthInfo(info);
          const message = inDemoMode
            ? 'Demo mode active'
            : 'Authenticated session restored';
          logEvent('server', 'connected', message, info?.email);
        }
      } catch (error) {
        console.error('[Home] Failed to load auth state:', error);
      } finally {
        setAuthLoading(false);
      }
    };
    loadAuthState();
  }, [logEvent]);

  // Monitor network connectivity
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const isConnected = state.isConnected && state.isInternetReachable;
      const networkType = state.type || 'unknown';

      setConnectionState((prev) => ({
        ...prev,
        network: isConnected ? 'connected' : 'disconnected'
      }));

      if (isConnected) {
        logEvent(
          'network',
          'connected',
          `Network connected via ${networkType}`,
          `Type: ${networkType}, Strength: ${state.details && 'strength' in state.details ? state.details.strength : 'unknown'}`
        );
      } else {
        logEvent(
          'network',
          'disconnected',
          'Network disconnected',
          `Type: ${networkType}`
        );
      }
    });

    return () => unsubscribe();
  }, [logEvent]);

  // Refresh auth state when screen regains focus (e.g., after scanning QR code)
  useFocusEffect(
    useCallback(() => {
      const refreshAuthState = async () => {
        const authenticated = await isAuthenticated();
        if (authenticated) {
          const token = await getAuthToken();
          const info = await getAuthInfo();
          // Only update if token changed
          if (token !== authToken) {
            setAuthToken(token);
            setAuthInfo(info);
          }
        } else if (authToken) {
          // Token was cleared or expired
          setAuthToken(null);
          setAuthInfo(null);
        }

        // Update login URL from active UNode
        const activeUnode = await getActiveUnode();
        if (activeUnode?.apiUrl && activeUnode.id !== DEMO_UNODE.id) {
          setLoginApiUrl(activeUnode.apiUrl);
        }
      };
      refreshAuthState();
    }, [authToken])
  );

  const handleLoginSuccess = useCallback(
    async (token: string, apiUrl: string) => {
      // Check if demo mode was enabled during login
      const inDemoMode = await isDemoMode();
      setDemoMode(inDemoMode);

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
    // If in demo mode, disable it and restore previous UNode
    if (await isDemoMode()) {
      // Disable demo mode and get the previous UNode ID to restore
      const previousUnodeId = await disableDemoMode();

      // Remove demo UNode from storage if it exists
      const unodes = await getUnodes();
      if (unodes.some(node => node.id === DEMO_UNODE.id)) {
        await removeUnode(DEMO_UNODE.id);
      }

      // Remove demo OMI devices from storage if they exist
      const demoDeviceIds = MOCK_OMI_DEVICES.map(d => d.id);
      const omiDevices = await getSavedOmiDevices();
      const demoDevicesToRemove = omiDevices.filter(d => demoDeviceIds.includes(d.id));
      if (demoDevicesToRemove.length > 0) {
        await Promise.all(demoDevicesToRemove.map(d => removeOmiDevice(d.id)));
      }

      // Remove demo chat sessions
      await cleanupDemoChatData();

      // Restore previous UNode (or clear if there was none)
      if (previousUnodeId) {
        await setActiveUnode(previousUnodeId);
      } else {
        await AsyncStorage.removeItem('@ushadow_active_unode');
      }

      // Update demo mode state to trigger component remount
      setDemoMode(false);
    } else {
      setDemoMode(false);
    }

    // Clear auth
    await clearAuthToken();
    setAuthToken(null);
    setAuthInfo(null);
    setConnectionState((prev) => ({ ...prev, server: 'disconnected' }));
    logEvent('server', 'disconnected', 'Logged out');
  }, [logEvent]);

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
        <LinearGradient
          colors={gradients.brand as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.titleGradientContainer}
        >
          <Text style={styles.title}>Ushadow</Text>
        </LinearGradient>
        <Text style={styles.subtitle}>Mobile Control</Text>
      </View>

      {/* Demo Mode Banner */}
      {demoMode && (
        <View style={styles.demoBanner} testID="demo-mode-banner">
          <Ionicons name="information-circle" size={16} color={colors.primary[400]} />
          <Text style={styles.demoBannerText}>Demo Mode - Using Sample Data</Text>
        </View>
      )}

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
                <Text style={styles.logoutButtonText}>
                  {demoMode ? 'Exit Demo' : 'Logout'}
                </Text>
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
          key={`streaming-${demoMode ? 'demo' : 'normal'}`}
          authToken={authToken}
          onAuthRequired={() => setShowLoginScreen(true)}
          testID="unified-streaming"
          logEvent={logEvent}
        />
      </View>

      {/* Login Screen Modal */}
      <LoginScreen
        visible={showLoginScreen}
        onClose={() => setShowLoginScreen(false)}
        onLoginSuccess={handleLoginSuccess}
        initialApiUrl={loginApiUrl}
      />

      {/* Connection Log Viewer Modal */}
      <ConnectionLogViewer
        visible={showLogViewer}
        onClose={() => setShowLogViewer(false)}
        entries={logEntries}
        connectionState={connectionState}
        onClearLogs={clearLogs}
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
    marginBottom: spacing.md,
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
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    marginBottom: spacing.xs,
  },
  title: {
    fontSize: fontSize['3xl'],
    fontWeight: 'bold',
    color: theme.background,
  },
  subtitle: {
    fontSize: fontSize.base,
    color: theme.textSecondary,
    marginBottom: spacing.md,
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
  demoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.success.bgSolid,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.primary[400],
  },
  demoBannerText: {
    fontSize: fontSize.xs,
    color: colors.primary[400],
    fontWeight: '600',
  },
});
