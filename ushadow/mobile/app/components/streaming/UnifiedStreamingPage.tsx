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
  TouchableOpacity,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, theme, spacing, borderRadius, fontSize } from '../../theme';

// Components
import { SourceSelector, StreamSource } from './SourceSelector';
import { DestinationSelector, AuthStatus } from './DestinationSelector';
import { StreamingDisplay } from './StreamingDisplay';
import { CompactStreamingButton } from './CompactStreamingButton';
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
import { AudioDestination } from '../../services/audioProviderApi';

// Types
import { SessionSource as SessionSourceType } from '../../types/streamingSession';
import { RelayStatus } from '../../hooks/useAudioStreamer';

interface UnifiedStreamingPageProps {
  authToken: string | null;
  onAuthRequired?: (opts?: { apiUrl?: string; hostname?: string }) => void;
  onWebSocketLog?: (status: 'connecting' | 'connected' | 'disconnected' | 'error', message: string, details?: string) => void;
  onBluetoothLog?: (status: 'connecting' | 'connected' | 'disconnected' | 'error', message: string, details?: string) => void;
  onSessionStart?: (source: SessionSourceType, codec: 'pcm' | 'opus') => Promise<string>;
  onSessionUpdate?: (sessionId: string, relayStatus: RelayStatus) => void;
  onSessionEnd?: (sessionId: string, error?: string, endReason?: 'manual_stop' | 'connection_lost' | 'error' | 'timeout') => void;
  testID?: string;
}

export const UnifiedStreamingPage: React.FC<UnifiedStreamingPageProps> = ({
  authToken,
  onAuthRequired,
  onWebSocketLog,
  onBluetoothLog,
  onSessionStart,
  onSessionUpdate,
  onSessionEnd,
  testID = 'unified-streaming',
}) => {
  // Source state
  const [selectedSource, setSelectedSource] = useState<StreamSource>({ type: 'microphone' });
  const [omiDevices, setOmiDevices] = useState<SavedOmiDevice[]>([]);

  // Destination state
  const [selectedUnodeId, setSelectedUnodeId] = useState<string | null>(null);
  const [unodes, setUnodes] = useState<UNode[]>([]);

  // Audio destination state (discovered services)
  const [availableDestinations, setAvailableDestinations] = useState<AudioDestination[]>([]);
  const [selectedDestinationIds, setSelectedDestinationIds] = useState<string[]>([]);
  const [isDiscoveringDestinations, setIsDiscoveringDestinations] = useState(false);

  // Auth state
  const [authStatus, setAuthStatus] = useState<AuthStatus>('unknown');
  const [authError, setAuthError] = useState<string | null>(null);

  // Modals
  const [showOmiScanner, setShowOmiScanner] = useState(false);
  const [showUnodeDiscovery, setShowUnodeDiscovery] = useState(false);

  // Streaming timing
  const streamingStartTime = useRef<Date | null>(null);
  const [startTime, setStartTime] = useState<Date | undefined>(undefined);

  // Session tracking
  const currentSessionIdRef = useRef<string | null>(null);

  // OMI connection context
  const omiConnection = useOmiConnection();

  // Phone microphone streaming hook
  const phoneStreaming = useStreaming();

  // OMI device connection with bluetooth logging
  const {
    connectedDeviceId,
    isConnecting: isOmiConnecting,
    connectToDevice: connectOmiDevice,
    disconnectFromDevice: disconnectOmiDevice,
    batteryLevel,
    getBatteryLevel,
    currentCodec, // BROKEN: codec detection unreliable, so we hardcode Opus for all OMI devices
  } = useDeviceConnection(omiConnection, {
    onLog: onBluetoothLog,
  });

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
  const omiStreamer = useAudioStreamer({
    onLog: onWebSocketLog,
    onRelayStatus: (status) => {
      if (currentSessionIdRef.current && onSessionUpdate) {
        onSessionUpdate(currentSessionIdRef.current, status);
      }
    },
  });

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

  // Monitor for permanent connection failures (when reconnection attempts exhausted)
  useEffect(() => {
    const currentError = selectedSource.type === 'microphone' ? phoneStreaming.error : omiStreamer.error;
    const currentRetrying = selectedSource.type === 'microphone' ? phoneStreaming.isRetrying : omiStreamer.isRetrying;
    const wasStreaming = selectedSource.type === 'microphone' ? phoneStreaming.isStreaming : omiStreamer.isStreaming;

    // If there's an error, not retrying anymore, and we have an active session, it means connection failed permanently
    if (currentError && !currentRetrying && !wasStreaming && currentSessionIdRef.current && onSessionEnd) {
      console.log('[UnifiedStreaming] Connection failed permanently, ending session');
      const endReason = currentError.toLowerCase().includes('timeout') ? 'timeout' : 'connection_lost';
      onSessionEnd(currentSessionIdRef.current, currentError, endReason);
      currentSessionIdRef.current = null;
    }
  }, [
    selectedSource.type,
    phoneStreaming.error,
    phoneStreaming.isRetrying,
    phoneStreaming.isStreaming,
    omiStreamer.error,
    omiStreamer.isRetrying,
    omiStreamer.isStreaming,
    onSessionEnd,
  ]);

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

        // Discover audio endpoints after successful authentication
        console.log('[UnifiedStreaming] Auth verified, discovering audio endpoints...');
        await discoverDestinations();
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
  }, [authToken, discoverDestinations]);

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

  // Discover available audio destinations
  const discoverDestinations = useCallback(async () => {
    if (!selectedUNode?.apiUrl || !authToken) {
      setAvailableDestinations([]);
      return;
    }

    setIsDiscoveringDestinations(true);
    try {
      const { getAvailableAudioDestinations } = await import('../../services/audioProviderApi');

      // Determine audio format based on source type
      // Phone microphone sends PCM (16-bit), OMI device sends Opus frames
      const audioFormat = selectedSource.type === 'microphone' ? 'pcm' : 'opus';
      console.log(`[UnifiedStreaming] Querying audio destinations for format: ${audioFormat}...`);

      const destinations = await getAvailableAudioDestinations(
        selectedUNode.apiUrl,
        authToken,
        audioFormat
      );
      setAvailableDestinations(destinations);

      console.log(`[UnifiedStreaming] Found ${destinations.length} destination(s) supporting ${audioFormat}:`,
        destinations.map(d => d.instance_name));

      // Don't show alert here - user can see the count and try again if needed
      // Alert only shown when trying to start a stream with no destinations selected
    } catch (err) {
      console.error('[UnifiedStreaming] Failed to discover destinations:', err);
      Alert.alert('Discovery Failed', err instanceof Error ? err.message : 'Failed to discover audio destinations');
      setAvailableDestinations([]);
    } finally {
      setIsDiscoveringDestinations(false);
    }
  }, [selectedUNode, authToken, selectedSource.type]);

  // Note: Destination discovery is now manual - only happens when user explicitly requests it
  // or when starting a stream. This prevents constant alerts when auth changes.
  // Removed automatic discovery on UNode/auth/source changes.

  // Build stream URL using selected destinations
  const getStreamUrl = useCallback(async (): Promise<string | null> => {
    if (!selectedUNode?.apiUrl || !authToken) return null;

    try {
      // Filter to only selected destinations
      const selectedDestinations = availableDestinations.filter(
        dest => selectedDestinationIds.includes(dest.instance_id)
      );

      if (selectedDestinations.length === 0) {
        console.warn('[UnifiedStreaming] No destinations selected');
        Alert.alert('No Destinations Selected', 'Please select at least one audio destination.');
        return null;
      }

      const { buildRelayUrl } = await import('../../services/audioProviderApi');

      // Determine audio source for codec parameter
      // mic = pcm, omi = opus
      const audioSource = selectedSource.type === 'microphone' ? 'mic' : 'omi';

      // Always use relay URL (even for single destination)
      // Mobile can't connect directly to internal Docker container names like "chronicle:5001"
      // The relay handles forwarding to internal services
      const streamUrl = buildRelayUrl(selectedUNode.apiUrl, authToken, selectedDestinations, audioSource);
      console.log('[UnifiedStreaming] Built relay URL for', selectedDestinations.length, 'destination(s) with codec:', audioSource === 'mic' ? 'pcm' : 'opus', streamUrl);

      return streamUrl;
    } catch (err) {
      console.error('[UnifiedStreaming] Failed to build stream URL:', err);
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to build stream URL');
      return null;
    }
  }, [selectedUNode, authToken, availableDestinations, selectedDestinationIds, selectedSource.type]);

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
    console.log('[UnifiedStreaming] Start button pressed');
    console.log('[UnifiedStreaming] Can stream:', {
      selectedUnodeId,
      authStatus,
      selectedDestinationIds: selectedDestinationIds.length,
      canStream,
    });

    // Discover destinations if not already done
    if (availableDestinations.length === 0 && !isDiscoveringDestinations) {
      console.log('[UnifiedStreaming] No destinations available, discovering now...');
      await discoverDestinations();
    }

    const streamUrl = await getStreamUrl();
    if (!streamUrl) {
      // Error alert already shown by getStreamUrl if needed
      console.log('[UnifiedStreaming] No stream URL - cannot start');
      return;
    }

    console.log('[UnifiedStreaming] Starting stream to:', streamUrl);

    // Start session tracking
    if (onSessionStart) {
      const sessionSource: SessionSourceType = selectedSource.type === 'omi' && selectedSource.deviceId
        ? { type: 'omi', deviceId: selectedSource.deviceId, deviceName: selectedSource.deviceName }
        : { type: 'microphone' };

      const codec = selectedSource.type === 'microphone' ? 'pcm' : 'opus';
      const sessionId = await onSessionStart(sessionSource, codec);
      currentSessionIdRef.current = sessionId;
      console.log('[UnifiedStreaming] Session started:', sessionId);
    }

    try {
      if (selectedSource.type === 'microphone') {
        // Phone microphone uses PCM
        await phoneStreaming.startStreaming(streamUrl, 'streaming', 'pcm');
      } else {
        // OMI streaming
        if (!connectedDeviceId || connectedDeviceId !== selectedSource.deviceId) {
          // Need to connect first
          await connectOmiDevice(selectedSource.deviceId);
        }

        // OMI devices always use Opus codec 21
        const codec = 'opus';
        console.log('[UnifiedStreaming] OMI device - using Opus codec');

        // Start WebSocket with codec
        await omiStreamer.startStreaming(streamUrl, 'streaming', codec);

        // Start OMI audio listener
        await startAudioListener(async (audioBytes: Uint8Array) => {
          if (audioBytes.length > 0) {
            await omiStreamer.sendAudio(audioBytes);
          }
        });
      }
    } catch (err) {
      const errorMessage = (err as Error).message || 'Failed to start streaming';
      console.error('[UnifiedStreaming] Failed to start streaming:', err);
      Alert.alert('Streaming Error', errorMessage);

      // End session with error
      if (currentSessionIdRef.current && onSessionEnd) {
        onSessionEnd(currentSessionIdRef.current, errorMessage, 'error');
        currentSessionIdRef.current = null;
      }
    }
  }, [
    selectedSource,
    getStreamUrl,
    phoneStreaming,
    connectedDeviceId,
    connectOmiDevice,
    omiStreamer,
    startAudioListener,
    onSessionStart,
    onSessionEnd,
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

      // End session (clean stop via user button)
      if (currentSessionIdRef.current && onSessionEnd) {
        onSessionEnd(currentSessionIdRef.current, undefined, 'manual_stop');
        currentSessionIdRef.current = null;
      }
    } catch (err) {
      const errorMessage = (err as Error).message || 'Failed to stop streaming';
      console.error('[UnifiedStreaming] Failed to stop streaming:', err);

      // End session with error
      if (currentSessionIdRef.current && onSessionEnd) {
        onSessionEnd(currentSessionIdRef.current, errorMessage, 'error');
        currentSessionIdRef.current = null;
      }
    }
  }, [selectedSource, phoneStreaming, stopAudioListener, omiStreamer, onSessionEnd]);

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
  const handleUnodeFound = useCallback(async (apiUrl: string, streamUrl: string, token?: string, chronicleApiUrl?: string, hostname?: string) => {
    const name = new URL(apiUrl).hostname.split('.')[0] || 'UNode';
    const savedUnode = await saveUnode({
      name,
      hostname,
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

    // If not authenticated, immediately prompt login with the new unode's connection details
    if (!authToken && onAuthRequired) {
      onAuthRequired({ apiUrl, hostname });
    }
  }, [authToken, onAuthRequired]);

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

  // Can stream check - require UNode, auth, and at least one destination
  const canStream =
    selectedUnodeId !== null &&
    authStatus === 'authenticated' &&
    selectedDestinationIds.length > 0;

  // Helper message for why button is disabled
  const getDisabledReason = (): string | undefined => {
    if (!selectedUnodeId) return 'Add a UNode first';
    if (authStatus !== 'authenticated') return 'Sign in required';
    if (selectedDestinationIds.length === 0) return 'Select a service';
    return undefined;
  };

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

        {/* Streaming Card */}
        <View style={styles.streamingCard}>
          {/* Waveform Display with overlaid button */}
          <StreamingDisplay
            isStreaming={isStreaming}
            isConnecting={isConnecting}
            audioLevel={audioLevel}
            startTime={startTime}
            sourceType={selectedSource.type === 'microphone' ? 'microphone' : 'omi'}
            onStopPress={handleStopStreaming}
            testID={`${testID}-display`}
          >
            {/* Compact start button overlaid on waveform */}
            {!isStreaming && (
              <CompactStreamingButton
                isInitializing={isInitializing}
                isConnecting={isConnecting}
                isDisabled={!canStream}
                error={error}
                onPress={handleStartStreaming}
                disabledReason={getDisabledReason()}
                testID={`${testID}-start-button`}
              />
            )}
          </StreamingDisplay>

          {/* Retry controls if retrying */}
          {isRetrying && (
            <View style={styles.retryContainer}>
              <Text style={styles.retryText}>
                Retrying... ({retryCount}/{maxRetries})
              </Text>
              <TouchableOpacity
                style={styles.cancelRetryButton}
                onPress={handleCancelRetry}
                testID={`${testID}-cancel-retry`}
              >
                <Text style={styles.cancelRetryText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Destination Selector - navigates to /unode-details on tap, shows audio destinations inline */}
        <DestinationSelector
          selectedUNodeId={selectedUnodeId}
          unodes={unodes}
          authStatus={authStatus}
          authError={authError}
          onReauthenticate={handleReauthenticate}
          disabled={isStreaming}
          testID={`${testID}-destination`}
          availableDestinations={availableDestinations}
          selectedDestinationIds={selectedDestinationIds}
          onDestinationSelectionChange={setSelectedDestinationIds}
          isLoadingDestinations={isDiscoveringDestinations}
        />
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
  retryContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    padding: spacing.sm,
    backgroundColor: colors.warning.bg,
    borderRadius: borderRadius.md,
  },
  retryText: {
    fontSize: fontSize.sm,
    color: colors.warning.default,
    fontWeight: '500',
  },
  cancelRetryButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: theme.backgroundCard,
    borderRadius: borderRadius.sm,
  },
  cancelRetryText: {
    fontSize: fontSize.sm,
    color: colors.warning.default,
    fontWeight: '600',
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
