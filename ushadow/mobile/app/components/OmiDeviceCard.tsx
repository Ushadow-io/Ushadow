/**
 * OMI Device Card Component
 *
 * Displays a saved OMI device with connection controls,
 * battery status, and streaming capabilities.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BleAudioCodec } from 'friend-lite-react-native';
import { State as BluetoothState } from 'react-native-ble-plx';
import {
  useDeviceConnection,
  useAudioListener,
  useAudioStreamer,
} from '../hooks';
import { useBluetooth, useOmiConnection } from '../contexts';
import { theme, colors, spacing, borderRadius, fontSize } from '../theme';
import {
  SavedOmiDevice,
  updateOmiDeviceName,
  removeOmiDevice,
  setActiveOmiDevice,
} from '../_utils/omiDeviceStorage';
import { appendTokenToUrl } from '../_utils/authStorage';

interface OmiDeviceCardProps {
  device: SavedOmiDevice;
  isActive: boolean;
  webSocketUrl: string;
  authToken: string | null;
  onDeviceRemoved: () => void;
  onDeviceUpdated: () => void;
  onSetActive: (deviceId: string) => void;
  onStreamingStateChange?: (isStreaming: boolean) => void;
  testID?: string;
}

export const OmiDeviceCard: React.FC<OmiDeviceCardProps> = ({
  device,
  isActive,
  webSocketUrl,
  authToken,
  onDeviceRemoved,
  onDeviceUpdated,
  onSetActive,
  onStreamingStateChange,
  testID,
}) => {
  const renderCount = useRef(0);
  renderCount.current += 1;
  console.log('[OmiDeviceCard] Render #' + renderCount.current + ' for device:', device.id);

  // Shared OMI Connection from context (singleton)
  const omiConnection = useOmiConnection();
  console.log('[OmiDeviceCard] useOmiConnection done');

  // Bluetooth from shared context (singleton BleManager)
  const { bluetoothState, permissionGranted } = useBluetooth();
  const isBluetoothOn = bluetoothState === BluetoothState.PoweredOn;
  console.log('[OmiDeviceCard] useBluetooth done, state:', bluetoothState);

  // Device connection hook
  const {
    connectedDeviceId,
    isConnecting,
    connectionError,
    batteryLevel,
    connectToDevice,
    disconnectFromDevice,
    getAudioCodec,
  } = useDeviceConnection(omiConnection);
  console.log('[OmiDeviceCard] useDeviceConnection done, connectedDeviceId:', connectedDeviceId);

  // Audio listener hook - pass isConnected callback for retry logic
  const getIsConnected = useCallback(() => omiConnection.isConnected(), [omiConnection]);
  const {
    isListeningAudio,
    audioPacketsReceived,
    startAudioListener,
    stopAudioListener,
  } = useAudioListener(omiConnection, getIsConnected);
  console.log('[OmiDeviceCard] useAudioListener done');

  // Audio streaming hook
  const audioStreamer = useAudioStreamer();
  console.log('[OmiDeviceCard] useAudioStreamer done');

  // UI state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState(device.name);
  const [isStreaming, setIsStreaming] = useState(false);

  // Check if this device is connected
  const isConnected = connectedDeviceId === device.id;
  console.log('[OmiDeviceCard] All hooks done, isConnected:', isConnected);

  // Notify parent of streaming state changes
  // Use ref to avoid infinite loop from callback changing on every render
  const onStreamingStateChangeRef = useRef(onStreamingStateChange);
  onStreamingStateChangeRef.current = onStreamingStateChange;

  useEffect(() => {
    console.log('[OmiDeviceCard] useEffect: streaming state changed, isStreaming:', isStreaming);
    onStreamingStateChangeRef.current?.(isStreaming);
    console.log('[OmiDeviceCard] useEffect: callback complete');
  }, [isStreaming]);

  /**
   * Build WebSocket URL for OMI device streaming
   * Uses ws_omi endpoint with authentication
   */
  const buildOmiWebSocketUrl = useCallback((): string => {
    let url = webSocketUrl.trim();

    // Convert HTTP to WS protocol
    if (!url.startsWith('ws')) {
      url = url.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
    }

    // Ensure ws_omi endpoint
    if (!url.includes('/ws_omi')) {
      url = url.replace(/\/$/, '') + '/ws_omi';
    }

    // Append auth token if available
    if (authToken) {
      return appendTokenToUrl(url, authToken);
    }

    return url;
  }, [webSocketUrl, authToken]);

  /**
   * Handle device connection/disconnection
   */
  const handleConnectionToggle = useCallback(async () => {
    if (isConnected) {
      // Stop streaming first if active
      if (isStreaming) {
        await stopAudioListener();
        audioStreamer.stopStreaming();
        setIsStreaming(false);
      }
      await disconnectFromDevice();
    } else {
      if (!isBluetoothOn) {
        Alert.alert('Bluetooth Required', 'Please enable Bluetooth to connect.');
        return;
      }
      if (!permissionGranted) {
        Alert.alert('Permission Required', 'Bluetooth permission is required.');
        return;
      }

      try {
        await connectToDevice(device.id);
        // Set as active device when connected
        await setActiveOmiDevice(device.id);
        onSetActive(device.id);
      } catch (error) {
        console.error('[OmiDeviceCard] Connection failed:', error);
      }
    }
  }, [
    isConnected,
    isBluetoothOn,
    permissionGranted,
    isStreaming,
    device.id,
    connectToDevice,
    disconnectFromDevice,
    stopAudioListener,
    audioStreamer,
    onSetActive,
  ]);

  /**
   * Handle audio streaming toggle
   */
  const handleStreamingToggle = useCallback(async () => {
    if (!isConnected) {
      Alert.alert('Not Connected', 'Please connect to the device first.');
      return;
    }

    if (!webSocketUrl || webSocketUrl.trim() === '') {
      Alert.alert('URL Required', 'Please configure the WebSocket URL first.');
      return;
    }

    if (isStreaming) {
      // Stop streaming
      console.log('[OmiDeviceCard] Stopping OMI audio streaming');
      await stopAudioListener();
      audioStreamer.stopStreaming();
      setIsStreaming(false);
    } else {
      // Start streaming
      try {
        const wsUrl = buildOmiWebSocketUrl();
        console.log('[OmiDeviceCard] Starting OMI audio streaming to:', wsUrl);

        // Start WebSocket connection (OMI uses Opus codec)
        await audioStreamer.startStreaming(wsUrl, 'streaming', 'opus');

        // Start OMI audio listener
        await startAudioListener(async (audioBytes: Uint8Array) => {
          if (audioBytes.length > 0 && audioStreamer.getWebSocketReadyState() === WebSocket.OPEN) {
            await audioStreamer.sendAudio(audioBytes);
          }
        });

        setIsStreaming(true);
      } catch (error) {
        console.error('[OmiDeviceCard] Failed to start streaming:', error);
        Alert.alert('Streaming Error', 'Failed to start audio streaming.');
        audioStreamer.stopStreaming();
      }
    }
  }, [
    isConnected,
    webSocketUrl,
    isStreaming,
    buildOmiWebSocketUrl,
    audioStreamer,
    startAudioListener,
    stopAudioListener,
  ]);

  /**
   * Handle device rename
   */
  const handleRename = useCallback(async () => {
    const trimmedName = editName.trim();
    if (!trimmedName) {
      Alert.alert('Name Required', 'Please enter a device name.');
      return;
    }

    try {
      await updateOmiDeviceName(device.id, trimmedName);
      setShowEditModal(false);
      onDeviceUpdated();
    } catch (error) {
      console.error('[OmiDeviceCard] Failed to rename device:', error);
      Alert.alert('Error', 'Failed to rename device.');
    }
  }, [device.id, editName, onDeviceUpdated]);

  /**
   * Handle device removal
   */
  const handleRemove = useCallback(() => {
    Alert.alert(
      'Remove Device',
      `Are you sure you want to remove "${device.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            // Disconnect if connected
            if (isConnected) {
              if (isStreaming) {
                await stopAudioListener();
                audioStreamer.stopStreaming();
              }
              await disconnectFromDevice();
            }
            await removeOmiDevice(device.id);
            onDeviceRemoved();
          },
        },
      ]
    );
  }, [
    device.id,
    device.name,
    isConnected,
    isStreaming,
    disconnectFromDevice,
    stopAudioListener,
    audioStreamer,
    onDeviceRemoved,
  ]);

  // Battery icon based on level
  const getBatteryIcon = (): string => {
    if (batteryLevel === null) return 'battery-half-outline';
    if (batteryLevel > 75) return 'battery-full';
    if (batteryLevel > 50) return 'battery-three-quarters-outline';
    if (batteryLevel > 25) return 'battery-half-outline';
    if (batteryLevel > 10) return 'battery-quarter-outline';
    return 'battery-dead-outline';
  };

  const getBatteryColor = (): string => {
    if (batteryLevel === null) return theme.textMuted;
    if (batteryLevel > 50) return colors.success.default;
    if (batteryLevel > 25) return colors.warning.default;
    return colors.error.default;
  };

  console.log('[OmiDeviceCard] About to render JSX');
  return (
    <View
      style={[styles.container, isActive && styles.containerActive]}
      testID={testID}
    >
      {/* Device Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.deviceInfo}
          onPress={() => onSetActive(device.id)}
          testID={`${testID}-info`}
        >
          <View
            style={[
              styles.iconContainer,
              isConnected && styles.iconContainerConnected,
            ]}
          >
            <Ionicons
              name="bluetooth"
              size={24}
              color={isConnected ? colors.success.default : colors.primary[400]}
            />
          </View>
          <View style={styles.nameContainer}>
            <Text style={styles.deviceName}>{device.name}</Text>
            <Text style={styles.deviceId}>{device.id.substring(0, 17)}...</Text>
            {isConnected && batteryLevel !== null && (
              <View style={styles.batteryContainer}>
                <Ionicons
                  name={getBatteryIcon() as any}
                  size={14}
                  color={getBatteryColor()}
                />
                <Text style={[styles.batteryText, { color: getBatteryColor() }]}>
                  {batteryLevel}%
                </Text>
              </View>
            )}
          </View>
        </TouchableOpacity>

        {/* Action Buttons */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => {
              setEditName(device.name);
              setShowEditModal(true);
            }}
            testID={`${testID}-edit`}
          >
            <Ionicons name="pencil-outline" size={18} color={theme.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleRemove}
            testID={`${testID}-remove`}
          >
            <Ionicons name="trash-outline" size={18} color={colors.error.default} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Connection Error */}
      {connectionError && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={16} color={colors.error.default} />
          <Text style={styles.errorText}>{connectionError}</Text>
        </View>
      )}

      {/* Control Buttons */}
      <View style={styles.controls}>
        {/* Connect/Disconnect Button */}
        <TouchableOpacity
          style={[
            styles.controlButton,
            isConnected ? styles.controlButtonDisconnect : styles.controlButtonConnect,
          ]}
          onPress={handleConnectionToggle}
          disabled={isConnecting}
          testID={`${testID}-connection-toggle`}
        >
          {isConnecting ? (
            <ActivityIndicator size="small" color={theme.primaryButtonText} />
          ) : (
            <Ionicons
              name={isConnected ? 'close-circle-outline' : 'link-outline'}
              size={18}
              color={isConnected ? colors.error.default : theme.primaryButtonText}
            />
          )}
          <Text
            style={[
              styles.controlButtonText,
              isConnected && styles.controlButtonTextDisconnect,
            ]}
          >
            {isConnecting ? 'Connecting...' : isConnected ? 'Disconnect' : 'Connect'}
          </Text>
        </TouchableOpacity>

        {/* Stream Button - Only enabled when connected */}
        <TouchableOpacity
          style={[
            styles.controlButton,
            styles.controlButtonStream,
            !isConnected && styles.controlButtonDisabled,
            isStreaming && styles.controlButtonStreaming,
          ]}
          onPress={handleStreamingToggle}
          disabled={!isConnected}
          testID={`${testID}-stream-toggle`}
        >
          {isListeningAudio && !isStreaming ? (
            <ActivityIndicator size="small" color={theme.primaryButtonText} />
          ) : (
            <Ionicons
              name={isStreaming ? 'stop' : 'radio-outline'}
              size={18}
              color={isStreaming ? colors.error.default : theme.primaryButtonText}
            />
          )}
          <Text
            style={[
              styles.controlButtonText,
              isStreaming && styles.controlButtonTextStreaming,
              !isConnected && styles.controlButtonTextDisabled,
            ]}
          >
            {isStreaming ? 'Stop Stream' : 'Start Stream'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Streaming Status */}
      {isStreaming && (
        <View style={styles.streamingStatus}>
          <View style={styles.streamingIndicator}>
            <View style={styles.streamingDot} />
            <Text style={styles.streamingText}>Streaming to server</Text>
          </View>
          <Text style={styles.packetsText}>
            {audioPacketsReceived} packets
          </Text>
        </View>
      )}

      {/* Edit Name Modal */}
      <Modal
        visible={showEditModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowEditModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Rename Device</Text>

            <TextInput
              style={styles.nameInput}
              value={editName}
              onChangeText={setEditName}
              placeholder="Device name"
              placeholderTextColor={theme.textMuted}
              autoFocus
              selectTextOnFocus
              testID={`${testID}-edit-name-input`}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalButtonCancel}
                onPress={() => setShowEditModal(false)}
                testID={`${testID}-edit-cancel`}
              >
                <Text style={styles.modalButtonCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalButtonSave}
                onPress={handleRename}
                testID={`${testID}-edit-save`}
              >
                <Text style={styles.modalButtonSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.backgroundCard,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: theme.border,
  },
  containerActive: {
    borderColor: colors.primary[400],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  deviceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.full,
    backgroundColor: theme.backgroundInput,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  iconContainerConnected: {
    backgroundColor: colors.success.bg,
  },
  nameContainer: {
    flex: 1,
  },
  deviceName: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  deviceId: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
    marginTop: 2,
  },
  batteryContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  batteryText: {
    fontSize: fontSize.xs,
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    padding: spacing.sm,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.error.bg,
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
    marginTop: spacing.md,
  },
  errorText: {
    color: colors.error.default,
    fontSize: fontSize.xs,
    marginLeft: spacing.xs,
    flex: 1,
  },
  controls: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  controlButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary[400],
  },
  controlButtonConnect: {
    backgroundColor: colors.primary[400],
  },
  controlButtonDisconnect: {
    backgroundColor: theme.backgroundInput,
    borderWidth: 1,
    borderColor: colors.error.default,
  },
  controlButtonStream: {
    backgroundColor: colors.accent[500],
  },
  controlButtonDisabled: {
    backgroundColor: theme.backgroundInput,
    opacity: 0.5,
  },
  controlButtonStreaming: {
    backgroundColor: theme.backgroundInput,
    borderWidth: 1,
    borderColor: colors.error.default,
  },
  controlButtonText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: theme.primaryButtonText,
  },
  controlButtonTextDisconnect: {
    color: colors.error.default,
  },
  controlButtonTextStreaming: {
    color: colors.error.default,
  },
  controlButtonTextDisabled: {
    color: theme.textMuted,
  },
  streamingStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  streamingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  streamingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success.default,
  },
  streamingText: {
    fontSize: fontSize.sm,
    color: colors.success.default,
  },
  packetsText: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalContent: {
    backgroundColor: theme.backgroundCard,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 340,
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: theme.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  nameInput: {
    backgroundColor: theme.backgroundInput,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: fontSize.base,
    color: theme.textPrimary,
    borderWidth: 1,
    borderColor: theme.border,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  modalButtonCancel: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: theme.backgroundInput,
    alignItems: 'center',
  },
  modalButtonCancelText: {
    fontSize: fontSize.base,
    color: theme.textSecondary,
  },
  modalButtonSave: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary[400],
    alignItems: 'center',
  },
  modalButtonSaveText: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: theme.primaryButtonText,
  },
});

export default OmiDeviceCard;
