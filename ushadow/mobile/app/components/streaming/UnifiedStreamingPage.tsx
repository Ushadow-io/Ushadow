/**
 * UnifiedStreamingPage Component
 *
 * Single-page streaming experience with:
 * - Source selection (Phone Microphone or OMI Device)
 * - Destination selection (UNode)
 * - Shared waveform visualization
 * - Unified stream control
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Modal,
  SafeAreaView,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, theme, spacing, borderRadius, fontSize } from '../../theme';

// Components
import { SourceSelector, StreamSource } from './SourceSelector';
import { DestinationSelector, AuthStatus } from './DestinationSelector';
import { StreamingDisplay } from './StreamingDisplay';
import { StreamingButton } from './StreamingButton';
import { GettingStartedCard } from './GettingStartedCard';
import { OmiDeviceScanner } from '../OmiDeviceScanner';
import { LeaderDiscovery } from '../LeaderDiscovery';

// Hooks
import { useStreaming } from '../../hooks/useStreaming';
import { useOmiConnection } from '../../contexts/OmiConnectionContext';
import { useDeviceConnection } from '../../hooks/useDeviceConnection';
import { useAudioListener } from '../../hooks/useAudioListener';
import { useAudioStreamer } from '../../hooks/useAudioStreamer';

// Storage
import {
  SavedOmiDevice,
  getSavedOmiDevices,
  removeOmiDevice,
} from '../../_utils/omiDeviceStorage';
import {
  UNode,
  getUnodes,
  saveUnode,
  removeUnode,
  getActiveUnodeId,
  setActiveUnode as setActiveUnodeStorage,
  parseStreamUrl,
} from '../../_utils/unodeStorage';
import { appendTokenToUrl, saveAuthToken } from '../../_utils/authStorage';

// API
import { verifyUnodeAuth } from '../../services/chronicleApi';

interface UnifiedStreamingPageProps {
  authToken: string | null;
  onAuthRequired?: () => void;
  testID?: string;
}

export const UnifiedStreamingPage: React.FC<UnifiedStreamingPageProps> = ({
  authToken,
  onAuthRequired,
  testID = 'unified-streaming',
}) => {
  // Source state
  const [selectedSource, setSelectedSource] = useState<StreamSource>({ type: 'microphone' });
  const [omiDevices, setOmiDevices] = useState<SavedOmiDevice[]>([]);

  // Destination state
  const [selectedUnodeId, setSelectedUnodeId] = useState<string | null>(null);
  const [unodes, setUnodes] = useState<UNode[]>([]);

  // Auth state
  const [authStatus, setAuthStatus] = useState<AuthStatus>('unknown');
  const [authError, setAuthError] = useState<string | null>(null);

  // Modals
  const [showOmiScanner, setShowOmiScanner] = useState(false);
  const [showUnodeDiscovery, setShowUnodeDiscovery] = useState(false);

  // Streaming timing
  const streamingStartTime = useRef<Date | null>(null);
  const [startTime, setStartTime] = useState<Date | undefined>(undefined);

  // OMI connection context
  const omiConnection = useOmiConnection();

  // Phone microphone streaming hook
  const phoneStreaming = useStreaming();

  // OMI device connection
  const {
    connectedDeviceId,
    isConnecting: isOmiConnecting,
    connectToDevice: connectOmiDevice,
    disconnectFromDevice: disconnectOmiDevice,
    batteryLevel,
    getBatteryLevel,
  } = useDeviceConnection(omiConnection);

  // Derive OMI connection status for SourceSelector
  const omiConnectionStatus: 'disconnected' | 'connecting' | 'connected' =
    isOmiConnecting ? 'connecting' :
    connectedDeviceId ? 'connected' : 'disconnected';

  // isConnected check for audio listener
  const isOmiConnected = useCallback(() => {
    return omiConnection.isConnected();
  }, [omiConnection]);

  // OMI audio listener
  const {
    isListeningAudio,
    audioLevel: omiAudioLevel,
    startAudioListener,
    stopAudioListener,
  } = useAudioListener(omiConnection, isOmiConnected);

  // WebSocket streamer for OMI
  const omiStreamer = useAudioStreamer();

  // Combined state
  const isStreaming = selectedSource.type === 'microphone'
    ? phoneStreaming.isStreaming
    : (isListeningAudio && omiStreamer.isStreaming);

  // Debug logging for streaming state
  useEffect(() => {
    console.log('[UnifiedStreamingPage] Streaming state:', {
      sourceType: selectedSource.type,
      isStreaming,
      phoneIsStreaming: phoneStreaming.isStreaming,
      phoneIsRecording: phoneStreaming.isRecording,
      omiIsStreaming: omiStreamer.isStreaming,
      isListeningAudio,
    });
  }, [selectedSource.type, isStreaming, phoneStreaming.isStreaming, phoneStreaming.isRecording, omiStreamer.isStreaming, isListeningAudio]);

  const isConnecting = selectedSource.type === 'microphone'
    ? phoneStreaming.isConnecting
    : (isOmiConnecting || omiStreamer.isConnecting);

  const isInitializing = selectedSource.type === 'microphone'
    ? phoneStreaming.isInitializing
    : false;

  const audioLevel = selectedSource.type === 'microphone'
    ? phoneStreaming.audioLevel
    : omiAudioLevel;

  const error = selectedSource.type === 'microphone'
    ? phoneStreaming.error
    : omiStreamer.error;

  const isRetrying = selectedSource.type === 'microphone'
    ? phoneStreaming.isRetrying
    : omiStreamer.isRetrying;

  const retryCount = selectedSource.type === 'microphone'
    ? phoneStreaming.retryCount
    : omiStreamer.retryCount;

  const maxRetries = selectedSource.type === 'microphone'
    ? phoneStreaming.maxRetries
    : omiStreamer.maxRetries;

  // Handle cancel retry
  const handleCancelRetry = useCallback(() => {
    if (selectedSource.type === 'microphone') {
      phoneStreaming.cancelRetry();
    } else {
      omiStreamer.cancelRetry();
    }
  }, [selectedSource, phoneStreaming, omiStreamer]);

  // Load saved data on mount
  useEffect(() => {
    loadSavedData();
  }, []);

  // Refresh unodes when screen regains focus (e.g., returning from unode-details)
  // Always reload to pick up any config changes (protocol, path, etc.)
  useFocusEffect(
    useCallback(() => {
      const refreshUnodes = async () => {
        const [activeId, savedUnodes] = await Promise.all([
          getActiveUnodeId(),
          getUnodes(),
        ]);
        setUnodes(savedUnodes);
        if (activeId && activeId !== selectedUnodeId) {
          setSelectedUnodeId(activeId);
        }
        console.log('[UnifiedStreamingPage] Refreshed unodes on focus');
      };
      refreshUnodes();
    }, [selectedUnodeId])
  );

  const loadSavedData = useCallback(async () => {
    try {
      // Load OMI devices
      const devices = await getSavedOmiDevices();
      setOmiDevices(devices);

      // Load UNodes
      const savedUnodes = await getUnodes();
      setUnodes(savedUnodes);

      // Load active UNode
      const activeId = await getActiveUnodeId();
      if (activeId) {
        setSelectedUnodeId(activeId);
      } else if (savedUnodes.length > 0) {
        // Auto-select first UNode if none active
        setSelectedUnodeId(savedUnodes[0].id);
      }
    } catch (err) {
      console.error('[UnifiedStreaming] Failed to load saved data:', err);
    }
  }, []);

  // Verify auth status for a UNode
  const verifyAuth = useCallback(async (unode: UNode | undefined) => {
    if (!unode) {
      setAuthStatus('unknown');
      setAuthError(null);
      return;
    }

    if (!authToken) {
      setAuthStatus('error');
      setAuthError('Not logged in');
      return;
    }

    setAuthStatus('checking');
    setAuthError(null);

    try {
      const result = await verifyUnodeAuth(unode.apiUrl, authToken);
      if (result.valid) {
        setAuthStatus('authenticated');
        setAuthError(null);
      } else {
        // Determine if expired or error based on message
        if (result.error?.includes('expired') || result.error?.includes('Session')) {
          setAuthStatus('expired');
        } else {
          setAuthStatus('error');
        }
        setAuthError(result.error || 'Authentication failed');
      }
    } catch (err) {
      console.error('[UnifiedStreaming] Auth verification failed:', err);
      setAuthStatus('error');
      setAuthError((err as Error).message || 'Verification failed');
    }
  }, [authToken]);

  // Verify auth when selected UNode changes
  useEffect(() => {
    const selectedUNode = unodes.find(u => u.id === selectedUnodeId);
    verifyAuth(selectedUNode);
  }, [selectedUnodeId, unodes, verifyAuth]);

  // Re-verify auth when authToken changes
  useEffect(() => {
    if (selectedUnodeId) {
      const selectedUNode = unodes.find(u => u.id === selectedUnodeId);
      verifyAuth(selectedUNode);
    }
  }, [authToken, selectedUnodeId, unodes, verifyAuth]);

  // Fetch battery level when OMI device connects
  useEffect(() => {
    if (connectedDeviceId && omiConnectionStatus === 'connected') {
      getBatteryLevel();
    }
  }, [connectedDeviceId, omiConnectionStatus, getBatteryLevel]);

  // Track streaming start time
  useEffect(() => {
    if (isStreaming && !streamingStartTime.current) {
      streamingStartTime.current = new Date();
      setStartTime(new Date());
    } else if (!isStreaming && streamingStartTime.current) {
      streamingStartTime.current = null;
      setStartTime(undefined);
    }
  }, [isStreaming]);

  // Get selected UNode
  const selectedUNode = unodes.find(u => u.id === selectedUnodeId);

  // Build stream URL using deployment-based discovery
  // Queries /api/deployments/exposed-urls to find running audio destinations
  const getStreamUrl = useCallback(async (): Promise<string | null> => {
    if (!selectedUNode?.apiUrl || !authToken) return null;

    try {
      // Query available audio destinations from running services
      const { getAvailableAudioDestinations, buildRelayUrl } = await import('../../services/audioProviderApi');

      console.log('[UnifiedStreaming] Querying audio destinations...');
      const destinations = await getAvailableAudioDestinations(selectedUNode.apiUrl, authToken);

      if (destinations.length === 0) {
        console.warn('[UnifiedStreaming] No audio destinations found');
        Alert.alert('No Audio Destinations', 'No running audio services found. Please start Chronicle or Mycelia.');
        return null;
      }

      console.log(`[UnifiedStreaming] Found ${destinations.length} destination(s):`, destinations.map(d => d.instance_name));

      // Build relay URL for all destinations (multi-destination streaming)
      const relayUrl = buildRelayUrl(selectedUNode.apiUrl, authToken, destinations);
      console.log('[UnifiedStreaming] Built relay URL:', relayUrl);

      return relayUrl;
    } catch (err) {
      console.error('[UnifiedStreaming] Failed to get stream URL:', err);
      Alert.alert('Discovery Failed', err instanceof Error ? err.message : 'Failed to discover audio destinations');
      return null;
    }
  }, [selectedUNode, authToken]);

  // Handle source change
  const handleSourceChange = useCallback(async (source: StreamSource) => {
    // Stop current streaming if active
    if (isStreaming) {
      if (selectedSource.type === 'microphone') {
        await phoneStreaming.stopStreaming();
      } else {
        await stopAudioListener();
        omiStreamer.stopStreaming();
      }
    }

    setSelectedSource(source);

    // Auto-connect to OMI device when selected
    if (source.type === 'omi' && connectedDeviceId !== source.deviceId) {
      try {
        await connectOmiDevice(source.deviceId);
      } catch (err) {
        console.error('[UnifiedStreaming] Failed to connect OMI device:', err);
      }
    }
  }, [
    isStreaming,
    selectedSource,
    phoneStreaming,
    stopAudioListener,
    omiStreamer,
    connectedDeviceId,
    connectOmiDevice,
  ]);

  // Handle destination change
  const handleDestinationChange = useCallback(async (unodeId: string) => {
    setSelectedUnodeId(unodeId);
    await setActiveUnodeStorage(unodeId);
  }, []);

  // Start streaming
  const handleStartStreaming = useCallback(async () => {
    const streamUrl = await getStreamUrl();
    if (!streamUrl) {
      // Error alert already shown by getStreamUrl if needed
      return;
    }

    try {
      if (selectedSource.type === 'microphone') {
        await phoneStreaming.startStreaming(streamUrl);
      } else {
        // OMI streaming
        if (!connectedDeviceId || connectedDeviceId !== selectedSource.deviceId) {
          // Need to connect first
          await connectOmiDevice(selectedSource.deviceId);
        }

        // Start WebSocket
        await omiStreamer.startStreaming(streamUrl);

        // Start OMI audio listener
        await startAudioListener(async (audioBytes: Uint8Array) => {
          if (audioBytes.length > 0) {
            await omiStreamer.sendAudio(audioBytes);
          }
        });
      }
    } catch (err) {
      console.error('[UnifiedStreaming] Failed to start streaming:', err);
      Alert.alert('Streaming Error', (err as Error).message || 'Failed to start streaming');
    }
  }, [
    selectedSource,
    getStreamUrl,
    phoneStreaming,
    connectedDeviceId,
    connectOmiDevice,
    omiStreamer,
    startAudioListener,
  ]);

  // Stop streaming
  const handleStopStreaming = useCallback(async () => {
    try {
      if (selectedSource.type === 'microphone') {
        await phoneStreaming.stopStreaming();
      } else {
        await stopAudioListener();
        omiStreamer.stopStreaming();
      }
    } catch (err) {
      console.error('[UnifiedStreaming] Failed to stop streaming:', err);
    }
  }, [selectedSource, phoneStreaming, stopAudioListener, omiStreamer]);

  // Toggle streaming
  const handleStreamingPress = useCallback(async () => {
    if (isStreaming) {
      await handleStopStreaming();
    } else {
      await handleStartStreaming();
    }
  }, [isStreaming, handleStartStreaming, handleStopStreaming]);

  // Handle OMI device saved
  const handleOmiDeviceSaved = useCallback(async (device: SavedOmiDevice) => {
    setShowOmiScanner(false);
    const devices = await getSavedOmiDevices();
    setOmiDevices(devices);

    // Auto-select the new device
    setSelectedSource({
      type: 'omi',
      deviceId: device.id,
      deviceName: device.name,
    });
  }, []);

  // Handle OMI device removed
  const handleRemoveOmiDevice = useCallback(async (deviceId: string) => {
    await removeOmiDevice(deviceId);
    const devices = await getSavedOmiDevices();
    setOmiDevices(devices);

    // If removed device was selected, switch to microphone
    if (selectedSource.type === 'omi' && selectedSource.deviceId === deviceId) {
      setSelectedSource({ type: 'microphone' });
    }
  }, [selectedSource]);

  // Handle UNode found
  const handleUnodeFound = useCallback(async (apiUrl: string, streamUrl: string, token?: string, chronicleApiUrl?: string) => {
    const name = new URL(apiUrl).hostname.split('.')[0] || 'UNode';
    const savedUnode = await saveUnode({
      name,
      apiUrl,
      chronicleApiUrl,
      streamUrl,
      tailscaleIp: new URL(apiUrl).hostname,
      authToken: token,
    });

    // Save token globally so other pages can use it
    if (token) {
      await saveAuthToken(token);
    }

    const updatedUnodes = await getUnodes();
    setUnodes(updatedUnodes);
    setSelectedUnodeId(savedUnode.id);
    await setActiveUnodeStorage(savedUnode.id);
    setShowUnodeDiscovery(false);
  }, []);

  // Handle UNode removed
  const handleRemoveUnode = useCallback(async (unodeId: string) => {
    await removeUnode(unodeId);
    const updatedUnodes = await getUnodes();
    setUnodes(updatedUnodes);

    // If removed UNode was selected, select another or clear
    if (selectedUnodeId === unodeId) {
      if (updatedUnodes.length > 0) {
        setSelectedUnodeId(updatedUnodes[0].id);
      } else {
        setSelectedUnodeId(null);
      }
    }
  }, [selectedUnodeId]);

  // Handle reauthentication request
  const handleReauthenticate = useCallback(() => {
    if (onAuthRequired) {
      onAuthRequired();
    }
  }, [onAuthRequired]);

  // Can stream check - also require valid auth
  const canStream = selectedUnodeId !== null && authStatus === 'authenticated';

  return (
    <View style={styles.container} testID={testID}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Getting Started - show when no UNodes configured */}
        {unodes.length === 0 && !isStreaming && (
          <GettingStartedCard
            onAddUNode={() => setShowUnodeDiscovery(true)}
            testID={`${testID}-getting-started`}
          />
        )}

        {/* Source Selector */}
        <SourceSelector
          selectedSource={selectedSource}
          omiDevices={omiDevices}
          connectedOmiDeviceId={connectedDeviceId}
          omiConnectionStatus={omiConnectionStatus}
          batteryLevel={batteryLevel}
          onSourceChange={handleSourceChange}
          onAddDevice={() => setShowOmiScanner(true)}
          onRemoveDevice={handleRemoveOmiDevice}
          disabled={isStreaming}
          testID={`${testID}-source`}
        />

        {/* Destination Selector - navigates to /unode-details on tap */}
        <DestinationSelector
          selectedUNodeId={selectedUnodeId}
          unodes={unodes}
          authStatus={authStatus}
          authError={authError}
          onReauthenticate={handleReauthenticate}
          disabled={isStreaming}
          testID={`${testID}-destination`}
        />

        {/* Streaming Card */}
        <View style={styles.streamingCard}>
          {/* Waveform Display */}
          <StreamingDisplay
            isStreaming={isStreaming}
            isConnecting={isConnecting}
            audioLevel={audioLevel}
            startTime={startTime}
            sourceType={selectedSource.type === 'microphone' ? 'microphone' : 'omi'}
            testID={`${testID}-display`}
          />

          {/* Stream Button */}
          <StreamingButton
            isRecording={isStreaming}
            isInitializing={isInitializing}
            isConnecting={isConnecting}
            isRetrying={isRetrying}
            retryCount={retryCount}
            maxRetries={maxRetries}
            isDisabled={!canStream}
            audioLevel={audioLevel / 100}
            error={error}
            onPress={handleStreamingPress}
            onCancelRetry={handleCancelRetry}
            testID={`${testID}-button`}
          />
        </View>
      </ScrollView>

      {/* OMI Scanner Modal */}
      <Modal
        visible={showOmiScanner}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowOmiScanner(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <OmiDeviceScanner
              onDeviceSaved={handleOmiDeviceSaved}
              onCancel={() => setShowOmiScanner(false)}
              testID={`${testID}-omi-scanner`}
            />
          </View>
        </SafeAreaView>
      </Modal>

      {/* UNode Discovery Modal */}
      <Modal
        visible={showUnodeDiscovery}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowUnodeDiscovery(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Add UNode</Text>
          </View>
          <ScrollView style={styles.modalScrollContent}>
            <LeaderDiscovery onLeaderFound={handleUnodeFound} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing['2xl'],
  },
  streamingCard: {
    backgroundColor: theme.backgroundCard,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: theme.background,
  },
  modalContent: {
    flex: 1,
    padding: spacing.lg,
  },
  modalHeader: {
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
  modalScrollContent: {
    flex: 1,
    padding: spacing.lg,
  },
});

export default UnifiedStreamingPage;
