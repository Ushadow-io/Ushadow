/**
 * OMI Device Section Component
 *
 * Self-contained section for managing OMI Bluetooth devices.
 * Includes device list, scanner modal, and streaming controls.
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  SafeAreaView,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme, colors, spacing, borderRadius, fontSize } from '../theme';
import { OmiDeviceScanner } from './OmiDeviceScanner';
import { OmiDeviceCard } from './OmiDeviceCard';
import {
  SavedOmiDevice,
  getSavedOmiDevices,
  getActiveOmiDeviceId,
  setActiveOmiDevice,
  clearActiveOmiDevice,
} from '../utils/omiDeviceStorage';

interface OmiDeviceSectionProps {
  webSocketUrl: string;
  authToken: string | null;
  onDeviceConnected?: (deviceId: string) => void;
  onDeviceDisconnected?: () => void;
  onStreamingChange?: (isStreaming: boolean, deviceId: string | null) => void;
  testID?: string;
}

export const OmiDeviceSection: React.FC<OmiDeviceSectionProps> = ({
  webSocketUrl,
  authToken,
  onDeviceConnected,
  onDeviceDisconnected,
  onStreamingChange,
  testID,
}) => {
  const [devices, setDevices] = useState<SavedOmiDevice[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [streamingDeviceId, setStreamingDeviceId] = useState<string | null>(null);

  // Load saved devices on mount
  useEffect(() => {
    loadDevices();
  }, []);

  const loadDevices = useCallback(async () => {
    const savedDevices = await getSavedOmiDevices();
    setDevices(savedDevices);

    const activeId = await getActiveOmiDeviceId();
    setActiveDeviceId(activeId);
  }, []);

  const handleDeviceSaved = useCallback(async (device: SavedOmiDevice) => {
    setShowScanner(false);
    await loadDevices();
    setActiveDeviceId(device.id);
    await setActiveOmiDevice(device.id);
  }, [loadDevices]);

  const handleDeviceRemoved = useCallback(async () => {
    await loadDevices();
    // Clear active device if it was removed
    const savedDevices = await getSavedOmiDevices();
    const activeId = await getActiveOmiDeviceId();
    if (activeId && !savedDevices.find(d => d.id === activeId)) {
      await clearActiveOmiDevice();
      setActiveDeviceId(null);
      onDeviceDisconnected?.();
    }
  }, [loadDevices, onDeviceDisconnected]);

  const handleDeviceUpdated = useCallback(() => {
    loadDevices();
  }, [loadDevices]);

  const handleSetActive = useCallback(async (deviceId: string) => {
    setActiveDeviceId(deviceId);
    await setActiveOmiDevice(deviceId);
    onDeviceConnected?.(deviceId);
  }, [onDeviceConnected]);

  const handleStreamingStateChange = useCallback((isStreaming: boolean, deviceId: string) => {
    setStreamingDeviceId(prevId => {
      if (isStreaming) {
        return deviceId;
      } else if (prevId === deviceId) {
        return null;
      }
      return prevId;
    });
    onStreamingChange?.(isStreaming, isStreaming ? deviceId : null);
  }, [onStreamingChange]);

  const renderDevice = useCallback(
    ({ item }: { item: SavedOmiDevice }) => (
      <OmiDeviceCard
        device={item}
        isActive={item.id === activeDeviceId}
        webSocketUrl={webSocketUrl}
        authToken={authToken}
        onDeviceRemoved={handleDeviceRemoved}
        onDeviceUpdated={handleDeviceUpdated}
        onSetActive={handleSetActive}
        onStreamingStateChange={(isStreaming) => handleStreamingStateChange(isStreaming, item.id)}
        testID={`omi-device-card-${item.id}`}
      />
    ),
    [
      activeDeviceId,
      webSocketUrl,
      authToken,
      handleDeviceRemoved,
      handleDeviceUpdated,
      handleSetActive,
      handleStreamingStateChange,
    ]
  );

  return (
    <View style={styles.container} testID={testID}>
      {/* Section Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerLeft}
          onPress={() => setIsCollapsed(!isCollapsed)}
          testID={`${testID}-toggle`}
        >
          <Ionicons
            name={isCollapsed ? 'chevron-forward' : 'chevron-down'}
            size={18}
            color={theme.textMuted}
          />
          <View style={styles.titleContainer}>
            <Text style={styles.sectionTitle}>OMI Devices</Text>
            {devices.length > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{devices.length}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowScanner(true)}
          testID={`${testID}-add`}
        >
          <Ionicons name="add" size={20} color={colors.primary[400]} />
          <Text style={styles.addButtonText}>Add Device</Text>
        </TouchableOpacity>
      </View>

      {/* Device List */}
      {!isCollapsed && (
        <View style={styles.content}>
          {devices.length === 0 ? (
            <TouchableOpacity
              style={styles.emptyState}
              onPress={() => setShowScanner(true)}
              testID={`${testID}-empty-add`}
            >
              <Ionicons name="bluetooth-outline" size={32} color={theme.textMuted} />
              <Text style={styles.emptyStateTitle}>No OMI Devices</Text>
              <Text style={styles.emptyStateText}>
                Tap to scan and add your OMI device
              </Text>
            </TouchableOpacity>
          ) : (
            <FlatList
              data={devices}
              renderItem={renderDevice}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              contentContainerStyle={styles.deviceList}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
            />
          )}
        </View>
      )}

      {/* Streaming Indicator */}
      {streamingDeviceId && (
        <View style={styles.streamingBanner}>
          <View style={styles.streamingDot} />
          <Text style={styles.streamingBannerText}>
            Streaming from {devices.find(d => d.id === streamingDeviceId)?.name || 'OMI Device'}
          </Text>
        </View>
      )}

      {/* Scanner Modal */}
      <Modal
        visible={showScanner}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowScanner(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <OmiDeviceScanner
              onDeviceSaved={handleDeviceSaved}
              onCancel={() => setShowScanner(false)}
              testID={`${testID}-scanner`}
            />
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  badge: {
    backgroundColor: colors.primary[400],
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  badgeText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: theme.background,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  addButtonText: {
    fontSize: fontSize.sm,
    color: colors.primary[400],
    fontWeight: '500',
  },
  content: {},
  emptyState: {
    alignItems: 'center',
    padding: spacing.xl,
    backgroundColor: theme.backgroundCard,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.border,
    borderStyle: 'dashed',
  },
  emptyStateTitle: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: theme.textPrimary,
    marginTop: spacing.md,
  },
  emptyStateText: {
    fontSize: fontSize.sm,
    color: theme.textMuted,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  deviceList: {
    gap: spacing.md,
  },
  separator: {
    height: spacing.md,
  },
  streamingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.success.bg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    marginTop: spacing.md,
  },
  streamingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success.default,
  },
  streamingBannerText: {
    fontSize: fontSize.sm,
    color: colors.success.default,
    fontWeight: '500',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: theme.background,
  },
  modalContent: {
    flex: 1,
    padding: spacing.lg,
  },
});

export default OmiDeviceSection;
