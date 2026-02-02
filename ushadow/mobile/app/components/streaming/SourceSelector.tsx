/**
 * SourceSelector Component
 *
 * Card-based selector for choosing streaming source.
 * Shows device details (battery, connection status) at a glance.
 * Tapping opens selection modal.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  FlatList,
  SafeAreaView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, theme, spacing, borderRadius, fontSize } from '../../theme';
import { SavedOmiDevice } from '../../_utils/omiDeviceStorage';

// Discriminated union for stream source
export type StreamSource =
  | { type: 'microphone' }
  | { type: 'omi'; deviceId: string; deviceName: string };

interface SourceSelectorProps {
  selectedSource: StreamSource;
  omiDevices: SavedOmiDevice[];
  connectedOmiDeviceId: string | null;
  omiConnectionStatus: 'disconnected' | 'connecting' | 'connected';
  batteryLevel: number; // -1 if unknown
  onSourceChange: (source: StreamSource) => void;
  onAddDevice: () => void;
  onRemoveDevice: (deviceId: string) => void;
  disabled?: boolean;
  testID?: string;
}

export const SourceSelector: React.FC<SourceSelectorProps> = ({
  selectedSource,
  omiDevices,
  connectedOmiDeviceId,
  omiConnectionStatus,
  batteryLevel,
  onSourceChange,
  onAddDevice,
  onRemoveDevice,
  disabled = false,
  testID = 'source-selector',
}) => {
  const [showPicker, setShowPicker] = useState(false);

  const handleSelect = useCallback((source: StreamSource) => {
    onSourceChange(source);
    setShowPicker(false);
  }, [onSourceChange]);

  const handleLongPressDevice = useCallback((device: SavedOmiDevice) => {
    Alert.alert(
      'Remove Device',
      `Remove "${device.name}" from saved devices?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => onRemoveDevice(device.id),
        },
      ]
    );
  }, [onRemoveDevice]);

  // Get battery icon based on level
  const getBatteryIcon = (level: number): string => {
    if (level < 0) return 'battery-dead-outline';
    if (level <= 20) return 'battery-dead';
    if (level <= 50) return 'battery-half';
    if (level <= 80) return 'battery-three-quarters';
    return 'battery-full';
  };

  const getBatteryColor = (level: number): string => {
    if (level < 0) return theme.textMuted;
    if (level <= 20) return colors.error.default;
    if (level <= 50) return colors.warning.default;
    return colors.success.default;
  };

  // Render the selected source card content
  const renderSelectedCard = () => {
    if (selectedSource.type === 'microphone') {
      return (
        <View style={styles.cardContent}>
          <View style={styles.cardIconContainer}>
            <Ionicons name="mic" size={24} color={colors.primary[400]} />
          </View>
          <View style={styles.cardDetails}>
            <Text style={styles.cardTitle}>Phone Microphone</Text>
            <Text style={styles.cardSubtitle}>Built-in audio input</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
        </View>
      );
    }

    // OMI device selected
    const isConnected = connectedOmiDeviceId === selectedSource.deviceId;
    const isConnecting = omiConnectionStatus === 'connecting';

    return (
      <View style={styles.cardContent}>
        <View style={[styles.cardIconContainer, styles.cardIconOmi]}>
          <Ionicons name="bluetooth" size={24} color={colors.accent[400]} />
        </View>
        <View style={styles.cardDetails}>
          <Text style={styles.cardTitle}>{selectedSource.deviceName}</Text>
          <View style={styles.cardStatusRow}>
            {/* Connection status */}
            <View style={styles.statusBadge}>
              <View style={[
                styles.statusDot,
                {
                  backgroundColor: isConnected
                    ? colors.success.default
                    : isConnecting
                    ? colors.warning.default
                    : theme.textMuted,
                },
              ]} />
              <Text style={styles.statusText}>
                {isConnected ? 'Connected' : isConnecting ? 'Connecting...' : 'Disconnected'}
              </Text>
            </View>

            {/* Battery level (if connected and known) */}
            {isConnected && batteryLevel >= 0 && (
              <View style={styles.batteryBadge}>
                <Ionicons
                  name={getBatteryIcon(batteryLevel) as any}
                  size={14}
                  color={getBatteryColor(batteryLevel)}
                />
                <Text style={[styles.batteryText, { color: getBatteryColor(batteryLevel) }]}>
                  {batteryLevel}%
                </Text>
              </View>
            )}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
      </View>
    );
  };

  const renderSourceOption = useCallback(({ item }: { item: StreamSource | 'add' }) => {
    if (item === 'add') {
      return (
        <TouchableOpacity
          style={styles.addOption}
          onPress={() => {
            setShowPicker(false);
            onAddDevice();
          }}
          testID={`${testID}-add-device`}
        >
          <View style={styles.addIconContainer}>
            <Ionicons name="add" size={20} color={colors.primary[400]} />
          </View>
          <Text style={styles.addOptionText}>Add OMI Device</Text>
        </TouchableOpacity>
      );
    }

    const source = item as StreamSource;
    const isSelected =
      (source.type === 'microphone' && selectedSource.type === 'microphone') ||
      (source.type === 'omi' && selectedSource.type === 'omi' && source.deviceId === selectedSource.deviceId);

    const isConnected = source.type === 'omi' && source.deviceId === connectedOmiDeviceId;

    return (
      <TouchableOpacity
        style={[styles.option, isSelected && styles.optionSelected]}
        onPress={() => handleSelect(source)}
        onLongPress={source.type === 'omi' ? () => {
          const device = omiDevices.find(d => d.id === source.deviceId);
          if (device) handleLongPressDevice(device);
        } : undefined}
        testID={`${testID}-option-${source.type === 'microphone' ? 'mic' : source.deviceId}`}
      >
        <View style={styles.optionLeft}>
          <View style={[
            styles.optionIcon,
            source.type === 'omi' && styles.optionIconOmi,
          ]}>
            <Ionicons
              name={source.type === 'microphone' ? 'mic' : 'bluetooth'}
              size={20}
              color={source.type === 'microphone' ? colors.primary[400] : colors.accent[400]}
            />
          </View>
          <View style={styles.optionTextContainer}>
            <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
              {source.type === 'microphone' ? 'Phone Microphone' : source.deviceName}
            </Text>
            {source.type === 'omi' && (
              <Text style={styles.optionSubtext}>
                {isConnected ? 'Connected' : 'Bluetooth device'}
              </Text>
            )}
            {source.type === 'microphone' && (
              <Text style={styles.optionSubtext}>Built-in audio input</Text>
            )}
          </View>
        </View>
        {isSelected && (
          <Ionicons name="checkmark-circle" size={22} color={colors.primary[400]} />
        )}
        {source.type === 'omi' && isConnected && !isSelected && (
          <View style={styles.connectedIndicator}>
            <View style={styles.connectedDot} />
          </View>
        )}
      </TouchableOpacity>
    );
  }, [selectedSource, connectedOmiDeviceId, omiDevices, handleSelect, handleLongPressDevice, onAddDevice, testID]);

  // Build list data: microphone + OMI devices + add button
  const listData: (StreamSource | 'add')[] = [
    { type: 'microphone' },
    ...omiDevices.map(device => ({
      type: 'omi' as const,
      deviceId: device.id,
      deviceName: device.name,
    })),
    'add',
  ];

  return (
    <View style={styles.container} testID={testID}>
      <Text style={styles.label}>Audio Source</Text>

      {/* Selected Source Card */}
      <TouchableOpacity
        style={[styles.card, disabled && styles.cardDisabled]}
        onPress={() => !disabled && setShowPicker(true)}
        disabled={disabled}
        activeOpacity={0.7}
        testID={`${testID}-card`}
      >
        {renderSelectedCard()}
      </TouchableOpacity>

      {/* Selection Modal */}
      <Modal
        visible={showPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowPicker(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Audio Source</Text>
            <TouchableOpacity
              onPress={() => setShowPicker(false)}
              style={styles.closeButton}
              testID={`${testID}-close`}
            >
              <Ionicons name="close" size={24} color={theme.textPrimary} />
            </TouchableOpacity>
          </View>

          <FlatList
            data={listData}
            renderItem={renderSourceOption}
            keyExtractor={(item) =>
              item === 'add' ? 'add' :
              item.type === 'microphone' ? 'mic' :
              item.deviceId
            }
            contentContainerStyle={styles.optionsList}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.lg,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: theme.textSecondary,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: theme.backgroundCard,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.border,
    overflow: 'hidden',
  },
  cardDisabled: {
    opacity: 0.6,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  cardIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary[400] + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  cardIconOmi: {
    backgroundColor: colors.accent[400] + '20',
  },
  cardDetails: {
    flex: 1,
  },
  cardTitle: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: theme.textPrimary,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: fontSize.sm,
    color: theme.textMuted,
  },
  cardStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: fontSize.sm,
    color: theme.textSecondary,
  },
  batteryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  batteryText: {
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: theme.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  closeButton: {
    padding: spacing.xs,
  },
  optionsList: {
    padding: spacing.md,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.backgroundCard,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  optionSelected: {
    backgroundColor: colors.primary[400] + '15',
    borderWidth: 1,
    borderColor: colors.primary[400],
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary[400] + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionIconOmi: {
    backgroundColor: colors.accent[400] + '20',
  },
  optionTextContainer: {
    flex: 1,
  },
  optionText: {
    fontSize: fontSize.base,
    color: theme.textPrimary,
    fontWeight: '500',
  },
  optionTextSelected: {
    color: colors.primary[400],
  },
  optionSubtext: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
    marginTop: 2,
  },
  connectedIndicator: {
    paddingHorizontal: spacing.sm,
  },
  connectedDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.success.default,
  },
  addOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: theme.border,
    borderStyle: 'dashed',
  },
  addIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary[400] + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addOptionText: {
    fontSize: fontSize.base,
    color: colors.primary[400],
    fontWeight: '500',
  },
  separator: {
    height: spacing.sm,
  },
});

export default SourceSelector;
