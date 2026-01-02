/**
 * Home Tab - Ushadow Mobile
 *
 * Main interface for managing UNode connections,
 * streaming audio, and viewing connection logs.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Image,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import {
  UNodeList,
  StreamingButton,
  StreamingDisplay,
  StreamUrlSettings,
  ConnectionLogViewer,
  LeaderDiscovery,
  LoginScreen,
  OmiDeviceSection,
} from '../components';
import { useStreaming, useConnectionLog } from '../hooks';
import { colors, theme, gradients, spacing, borderRadius, fontSize } from '../theme';
import {
  getAuthToken,
  saveAuthToken,
  clearAuthToken,
  getAuthInfo,
  appendTokenToUrl,
  isAuthenticated,
  saveApiUrl,
} from '../utils/authStorage';
import {
  UNode,
  getUnodes,
  saveUnode,
  removeUnode,
  getActiveUnodeId,
  setActiveUnode as setActiveUnodeStorage,
  getActiveUnode,
} from '../utils/unodeStorage';
import { ConnectionState, createInitialConnectionState } from '../types/connectionLog';

export default function HomeScreen() {
  // UNode state
  const [unodes, setUnodes] = useState<UNode[]>([]);
  const [activeUnodeId, setActiveUnodeId] = useState<string | null>(null);
  const [currentUnode, setCurrentUnode] = useState<UNode | null>(null);

  // Auth state
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [authInfo, setAuthInfo] = useState<{ email: string; userId: string } | null>(null);
  const [showLoginScreen, setShowLoginScreen] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  // UI state
  const [showScanner, setShowScanner] = useState(false);
  const [showLogViewer, setShowLogViewer] = useState(false);
  const [showUrlSettings, setShowUrlSettings] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    createInitialConnectionState()
  );

  // Streaming state
  const [editableStreamUrl, setEditableStreamUrl] = useState<string>(
    'wss://blue.spangled-kettle.ts.net/chronicle/ws_pcm'
  );
  const streamingStartTime = useRef<Date | null>(null);

  // Connection logging hook
  const { entries: logEntries, logEvent, clearLogs, connectionState: logConnectionState } = useConnectionLog();

  // Streaming hook
  const {
    isStreaming,
    isConnecting: isStreamConnecting,
    isRecording,
    isInitializing,
    error: streamError,
    audioLevel,
    startStreaming,
    stopStreaming,
  } = useStreaming();

  // Load saved UNodes and auth state on mount
  useEffect(() => {
    const loadState = async () => {
      try {
        // Load UNodes
        const savedUnodes = await getUnodes();
        setUnodes(savedUnodes);

        const activeId = await getActiveUnodeId();
        setActiveUnodeId(activeId);

        if (activeId) {
          const active = savedUnodes.find((u) => u.id === activeId);
          if (active) {
            setCurrentUnode(active);
            setEditableStreamUrl(active.streamUrl);
          }
        }

        // Load auth state
        const authenticated = await isAuthenticated();
        if (authenticated) {
          const token = await getAuthToken();
          const info = await getAuthInfo();
          setAuthToken(token);
          setAuthInfo(info);
          console.log('[Home] Auth loaded:', info?.email);

          // Log connection event
          logEvent('server', 'connected', 'Authenticated session restored', info?.email);
        }
      } catch (error) {
        console.error('[Home] Failed to load state:', error);
      } finally {
        setAuthLoading(false);
      }
    };
    loadState();
  }, [logEvent]);

  // Track streaming start time
  useEffect(() => {
    if (isStreaming && !streamingStartTime.current) {
      streamingStartTime.current = new Date();
      setConnectionState((prev) => ({ ...prev, websocket: 'connected' }));
      logEvent('websocket', 'connected', 'Audio streaming started');
    } else if (!isStreaming && streamingStartTime.current) {
      streamingStartTime.current = null;
      setConnectionState((prev) => ({ ...prev, websocket: 'disconnected' }));
      logEvent('websocket', 'disconnected', 'Audio streaming stopped');
    }
  }, [isStreaming, logEvent]);

  // Handle stream errors
  useEffect(() => {
    if (streamError) {
      logEvent('websocket', 'error', 'Streaming error', streamError);
    }
  }, [streamError, logEvent]);

  const handleSelectUnode = useCallback(
    async (unode: UNode) => {
      console.log('[Home] Selecting UNode:', unode.name);
      setActiveUnodeId(unode.id);
      setCurrentUnode(unode);
      setEditableStreamUrl(unode.streamUrl);
      await setActiveUnodeStorage(unode.id);

      // Save API URL for chronicle API to use
      await saveApiUrl(unode.apiUrl);

      // Update auth token if UNode has one
      if (unode.authToken) {
        await saveAuthToken(unode.authToken);
        setAuthToken(unode.authToken);
        const info = await getAuthInfo();
        setAuthInfo(info);
      }

      setConnectionState((prev) => ({ ...prev, server: 'connected' }));
      logEvent('server', 'connected', `Connected to ${unode.name}`, unode.apiUrl);
    },
    [logEvent]
  );

  const handleAddUnode = useCallback(() => {
    setShowScanner(true);
  }, []);

  const handleDeleteUnode = useCallback(
    async (id: string) => {
      await removeUnode(id);
      const updatedUnodes = await getUnodes();
      setUnodes(updatedUnodes);

      if (activeUnodeId === id) {
        setActiveUnodeId(null);
        setCurrentUnode(null);
      }

      logEvent('server', 'disconnected', 'UNode removed');
    },
    [activeUnodeId, logEvent]
  );

  const handleLeaderFound = useCallback(
    async (apiUrl: string, streamUrl: string, token?: string) => {
      console.log('[Home] Leader found:', { apiUrl, streamUrl, hasToken: !!token });

      // Create/update UNode
      const name = new URL(apiUrl).hostname.split('.')[0] || 'UNode';
      const savedUnode = await saveUnode({
        name,
        apiUrl,
        streamUrl,
        tailscaleIp: new URL(apiUrl).hostname,
        authToken: token,
      });

      // Update state
      const updatedUnodes = await getUnodes();
      setUnodes(updatedUnodes);
      setActiveUnodeId(savedUnode.id);
      setCurrentUnode(savedUnode);
      setEditableStreamUrl(streamUrl);
      await setActiveUnodeStorage(savedUnode.id);

      // Save API URL for chronicle API to use
      await saveApiUrl(apiUrl);

      if (token) {
        await saveAuthToken(token);
        setAuthToken(token);
        const info = await getAuthInfo();
        setAuthInfo(info);
      }

      setShowScanner(false);
      setConnectionState((prev) => ({ ...prev, server: 'connected' }));
      logEvent('server', 'connected', `Connected to ${name}`, apiUrl);
    },
    [logEvent]
  );

  const handleLoginSuccess = useCallback(
    async (token: string, apiUrl: string) => {
      console.log('[Home] Login success');
      setAuthToken(token);
      const info = await getAuthInfo();
      setAuthInfo(info);
      setShowLoginScreen(false);

      // Update current UNode with new token
      if (currentUnode) {
        const updatedUnode = await saveUnode({
          ...currentUnode,
          authToken: token,
          apiUrl,
        });
        const updatedUnodes = await getUnodes();
        setUnodes(updatedUnodes);
        setCurrentUnode(updatedUnode);
      }

      setConnectionState((prev) => ({ ...prev, server: 'connected' }));
      logEvent('server', 'connected', 'Login successful', info?.email);
    },
    [currentUnode, logEvent]
  );

  const handleLogout = useCallback(async () => {
    console.log('[Home] Logging out');
    await clearAuthToken();
    setAuthToken(null);
    setAuthInfo(null);
    setConnectionState((prev) => ({ ...prev, server: 'disconnected' }));
    logEvent('server', 'disconnected', 'Logged out');
  }, [logEvent]);

  const getEffectiveStreamUrl = useCallback(() => {
    const baseUrl = editableStreamUrl.trim();
    if (!baseUrl) return null;

    if (authToken) {
      return appendTokenToUrl(baseUrl, authToken);
    }
    return baseUrl;
  }, [editableStreamUrl, authToken]);

  const handleStreamingPress = useCallback(async () => {
    if (isStreaming || isRecording) {
      console.log('[Home] Stopping streaming...');
      await stopStreaming();
    } else {
      const effectiveUrl = getEffectiveStreamUrl();
      if (effectiveUrl) {
        console.log('[Home] Starting streaming...');
        try {
          await startStreaming(effectiveUrl);
        } catch (err) {
          console.error('[Home] Failed to start streaming:', err);
        }
      }
    }
  }, [isStreaming, isRecording, getEffectiveStreamUrl, startStreaming, stopStreaming]);

  // Memoized callback for OMI streaming state changes
  const handleOmiStreamingChange = useCallback((streaming: boolean, deviceId: string | null) => {
    if (streaming) {
      logEvent('bluetooth', 'connected', `OMI streaming started from ${deviceId}`);
    } else {
      logEvent('bluetooth', 'disconnected', 'OMI streaming stopped');
    }
  }, [logEvent]);

  const canStream = editableStreamUrl.trim().length > 0;

  return (
    <SafeAreaView style={styles.container} testID="home-screen">
      <StatusBar barStyle="light-content" backgroundColor={theme.background} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
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

        {/* Error Banner */}
        {streamError && (
          <View style={styles.errorBanner} testID="error-banner">
            <Ionicons name="alert-circle" size={20} color={colors.error.default} />
            <Text style={styles.errorText}>{streamError}</Text>
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

        {/* OMI Device Section */}
        <OmiDeviceSection
          webSocketUrl={editableStreamUrl.replace('/ws_pcm', '/ws_omi').replace(/\/$/, '')}
          authToken={authToken}
          onStreamingChange={handleOmiStreamingChange}
          testID="omi-device-section"
        />

        {/* UNode List */}
        <UNodeList
          unodes={unodes}
          activeUnodeId={activeUnodeId}
          onSelectUnode={handleSelectUnode}
          onAddUnode={handleAddUnode}
          onDeleteUnode={handleDeleteUnode}
          isConnecting={isStreamConnecting}
          testID="unode-list"
        />

        {/* Streaming Section */}
        <View style={styles.section} testID="streaming-section">
          {/* Section Header with URL toggle */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Audio Streaming</Text>
            <TouchableOpacity
              style={styles.urlToggleButton}
              onPress={() => setShowUrlSettings(!showUrlSettings)}
              testID="toggle-url-settings"
            >
              <Ionicons
                name={showUrlSettings ? 'chevron-up' : 'link-outline'}
                size={16}
                color={theme.textMuted}
              />
              <Text style={styles.urlToggleText}>
                {showUrlSettings ? 'Hide URL' : 'Show URL'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Stream URL Settings (Hidden by default) */}
          {showUrlSettings && (
            <StreamUrlSettings
              streamUrl={editableStreamUrl}
              onUrlChange={setEditableStreamUrl}
              isConnected={isStreaming}
              testID="stream-url-settings"
            />
          )}

          {/* Streaming Card with compact button and waveform */}
          <View style={styles.streamingCard}>
            {/* Compact Streaming Button */}
            <TouchableOpacity
              style={[
                styles.compactStreamButton,
                isStreaming && styles.compactStreamButtonActive,
                !canStream && styles.compactStreamButtonDisabled,
              ]}
              onPress={handleStreamingPress}
              disabled={!canStream || isInitializing}
              testID="streaming-button"
            >
              <Ionicons
                name={isStreaming || isRecording ? 'stop' : 'mic'}
                size={20}
                color={isStreaming ? colors.error.default : theme.primaryButtonText}
              />
              <Text style={[
                styles.compactStreamButtonText,
                isStreaming && styles.compactStreamButtonTextActive,
              ]}>
                {isInitializing
                  ? 'Starting...'
                  : isStreamConnecting
                  ? 'Connecting...'
                  : isStreaming || isRecording
                  ? 'Stop Streaming'
                  : 'Start Streaming'}
              </Text>
            </TouchableOpacity>

            {/* Streaming Display with Waveform - always visible when streaming */}
            <StreamingDisplay
              isStreaming={isStreaming}
              isConnecting={isStreamConnecting}
              audioLevel={audioLevel}
              startTime={streamingStartTime.current || undefined}
              testID="streaming-display"
            />
          </View>
        </View>
      </ScrollView>

      {/* Leader Discovery Modal */}
      <Modal
        visible={showScanner}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowScanner(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Add UNode</Text>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setShowScanner(false)}
              testID="close-scanner-button"
            >
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalContent}>
            <LeaderDiscovery onLeaderFound={handleLeaderFound} />
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Login Screen Modal */}
      <LoginScreen
        visible={showLoginScreen}
        onClose={() => setShowLoginScreen(false)}
        onLoginSuccess={handleLoginSuccess}
        initialApiUrl={currentUnode?.apiUrl || 'https://blue.spangled-kettle.ts.net'}
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  header: {
    marginBottom: spacing.xl,
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
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.error.bg,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.lg,
  },
  errorText: {
    color: colors.error.default,
    fontSize: fontSize.sm,
    marginLeft: spacing.sm,
    flex: 1,
  },
  authStatus: {
    marginBottom: spacing.lg,
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
  section: {
    marginBottom: spacing['2xl'],
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  urlToggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  urlToggleText: {
    fontSize: fontSize.sm,
    color: theme.textMuted,
  },
  streamingCard: {
    backgroundColor: theme.backgroundCard,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  compactStreamButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary[400],
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
  },
  compactStreamButtonActive: {
    backgroundColor: theme.backgroundInput,
    borderWidth: 1,
    borderColor: colors.error.default,
  },
  compactStreamButtonDisabled: {
    backgroundColor: theme.backgroundInput,
    opacity: 0.5,
  },
  compactStreamButtonText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: theme.primaryButtonText,
  },
  compactStreamButtonTextActive: {
    color: colors.error.default,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: theme.background,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  modalTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: theme.textPrimary,
  },
  modalCloseButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  modalCloseText: {
    fontSize: fontSize.base,
    color: colors.error.default,
  },
  modalContent: {
    flex: 1,
    padding: spacing.lg,
  },
});
