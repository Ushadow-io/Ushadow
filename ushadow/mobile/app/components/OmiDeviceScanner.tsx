/**
 * OMI Device Scanner Component
 *
 * Scans for nearby OMI Bluetooth devices and allows
 * users to save them with custom names.
 */

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  TextInput,
  Alert,
  Switch,
  InteractionManager,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { State as BluetoothState } from 'react-native-ble-plx';
import { OmiDevice } from 'friend-lite-react-native';
import { useDeviceScanning } from '../hooks';
import { useBluetooth, useOmiConnection } from '../contexts';
import { theme, colors, spacing, borderRadius, fontSize } from '../theme';
import {
  SavedOmiDevice,
  saveOmiDevice,
  getSavedOmiDevices,
} from '../utils/omiDeviceStorage';
import { isDemoMode } from '../utils/demoModeStorage';
import { MOCK_OMI_DEVICES } from '../utils/mockData';

interface OmiDeviceScannerProps {
  onDeviceSaved: (device: SavedOmiDevice) => void;
  onCancel: () => void;
  testID?: string;
}

export const OmiDeviceScanner: React.FC<OmiDeviceScannerProps> = ({
  onDeviceSaved,
  onCancel,
  testID,
}) => {
  // Demo mode state
  const [demoMode, setDemoMode] = useState(false);
  const [demoDevices, setDemoDevices] = useState<OmiDevice[]>([]);
  const [demoScanning, setDemoScanning] = useState(false);

  // Check demo mode on mount
  useEffect(() => {
    const checkDemoMode = async () => {
      const isDemo = await isDemoMode();
      setDemoMode(isDemo);
      if (isDemo) {
        console.log('[OmiDeviceScanner] Demo mode active - using mock devices');
        // Convert mock devices to OmiDevice format
        const mockOmiDevices: OmiDevice[] = MOCK_OMI_DEVICES.map(d => ({
          id: d.id,
          name: d.name,
          rssi: d.rssi,
        } as OmiDevice));
        setDemoDevices(mockOmiDevices);
      }
    };
    checkDemoMode();
  }, []);

  // Shared OMI Connection from context (singleton)
  const omiConnection = useOmiConnection();

  // Bluetooth from shared context (singleton BleManager)
  const {
    bleManager,
    bluetoothState,
    permissionGranted,
    requestBluetoothPermission,
    isPermissionsLoading,
  } = useBluetooth();

  // Device scanning hook (only used if not in demo mode)
  const isBluetoothOn = bluetoothState === BluetoothState.PoweredOn;
  const realScanning = useDeviceScanning(
    bleManager,
    omiConnection,
    permissionGranted,
    isBluetoothOn,
    requestBluetoothPermission
  );

  // Use demo data if in demo mode, otherwise use real scanning
  const devices = demoMode ? demoDevices : realScanning.devices;
  const scanning = demoMode ? demoScanning : realScanning.scanning;
  const startScan = demoMode ? () => {
    console.log('[OmiDeviceScanner] Demo mode - simulating scan');
    setDemoScanning(true);
    setTimeout(() => setDemoScanning(false), 2000);
  } : realScanning.startScan;
  const stopScan = demoMode ? () => setDemoScanning(false) : realScanning.stopScan;
  const error = demoMode ? null : realScanning.error;

  // UI state
  const [selectedDevice, setSelectedDevice] = useState<OmiDevice | null>(null);
  const [deviceName, setDeviceName] = useState('');
  const [savedDeviceIds, setSavedDeviceIds] = useState<string[]>([]);
  const [showOnlyOmi, setShowOnlyOmi] = useState(true); // Default to OMI-only

  // Filter devices based on toggle
  const filteredDevices = useMemo(() => {
    if (!showOnlyOmi) {
      return devices;
    }
    return devices.filter(device => {
      const name = device.name?.toLowerCase() || '';
      return name.includes('omi') || name.includes('friend');
    });
  }, [devices, showOnlyOmi]);

  // Load already saved device IDs
  useEffect(() => {
    const loadSavedDevices = async () => {
      const saved = await getSavedOmiDevices();
      setSavedDeviceIds(saved.map((d) => d.id));
    };
    loadSavedDevices();
  }, []);

  const handleSelectDevice = useCallback((device: OmiDevice) => {
    setSelectedDevice(device);
    setDeviceName(device.name || 'My OMI');
    stopScan();
  }, [stopScan]);

  const handleSaveDevice = useCallback(async () => {
    if (!selectedDevice) return;

    const trimmedName = deviceName.trim();
    if (!trimmedName) {
      Alert.alert('Name Required', 'Please enter a name for this device.');
      return;
    }

    const savedDevice: SavedOmiDevice = {
      id: selectedDevice.id,
      name: trimmedName,
      originalName: selectedDevice.name || 'Unknown OMI',
      lastConnected: Date.now(),
    };

    try {
      await saveOmiDevice(savedDevice);
    } catch (err) {
      console.error('[OmiDeviceScanner] Save failed:', err);
      Alert.alert('Save Failed', 'Could not save device. Please try again.');
      return;
    }

    onDeviceSaved(savedDevice);
  }, [selectedDevice, deviceName, onDeviceSaved]);

  const handleCancelNaming = useCallback(() => {
    setSelectedDevice(null);
    setDeviceName('');
  }, []);

  const isDeviceSaved = useCallback(
    (deviceId: string) => savedDeviceIds.includes(deviceId),
    [savedDeviceIds]
  );

  const renderDevice = useCallback(
    ({ item }: { item: OmiDevice }) => {
      const isSaved = isDeviceSaved(item.id);

      return (
        <TouchableOpacity
          style={[styles.deviceItem, isSaved && styles.deviceItemSaved]}
          onPress={() => handleSelectDevice(item)}
          testID={`omi-device-${item.id}`}
        >
          <View style={styles.deviceInfo}>
            <View style={styles.deviceIconContainer}>
              <Ionicons
                name="bluetooth"
                size={24}
                color={isSaved ? colors.success.default : colors.primary[400]}
              />
            </View>
            <View style={styles.deviceDetails}>
              <Text style={styles.deviceName}>{item.name || 'Unknown OMI'}</Text>
              <Text style={styles.deviceId}>{item.id.substring(0, 17)}...</Text>
              {item.rssi && (
                <Text style={styles.deviceRssi}>Signal: {item.rssi} dBm</Text>
              )}
            </View>
          </View>
          <View style={styles.deviceActions}>
            {isSaved ? (
              <View style={styles.savedBadge}>
                <Ionicons name="checkmark-circle" size={16} color={colors.success.default} />
                <Text style={styles.savedBadgeText}>Saved</Text>
              </View>
            ) : (
              <Ionicons name="add-circle-outline" size={24} color={theme.textMuted} />
            )}
          </View>
        </TouchableOpacity>
      );
    },
    [handleSelectDevice, isDeviceSaved]
  );

  // Bluetooth not ready states
  if (isPermissionsLoading) {
    return (
      <View style={styles.container} testID={testID}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.primary[400]} />
          <Text style={styles.statusText}>Checking Bluetooth permissions...</Text>
        </View>
      </View>
    );
  }

  if (!permissionGranted) {
    return (
      <View style={styles.container} testID={testID}>
        <View style={styles.centerContent}>
          <Ionicons name="bluetooth-outline" size={48} color={theme.textMuted} />
          <Text style={styles.statusTitle}>Bluetooth Permission Required</Text>
          <Text style={styles.statusText}>
            Please grant Bluetooth permissions to scan for OMI devices.
          </Text>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={requestBluetoothPermission}
            testID="request-permission-button"
          >
            <Text style={styles.actionButtonText}>Grant Permission</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!isBluetoothOn) {
    return (
      <View style={styles.container} testID={testID}>
        <View style={styles.centerContent}>
          <Ionicons name="bluetooth-outline" size={48} color={theme.textMuted} />
          <Text style={styles.statusTitle}>Bluetooth is Off</Text>
          <Text style={styles.statusText}>
            Please enable Bluetooth in your device settings to scan for OMI devices.
          </Text>
        </View>
      </View>
    );
  }

  // If a device is selected, show naming UI instead of device list
  if (selectedDevice) {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        testID={testID}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Name Your Device</Text>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={handleCancelNaming}
            testID="cancel-name-button"
          >
            <Text style={styles.cancelButtonText}>Back</Text>
          </TouchableOpacity>
        </View>

        {/* Naming Form */}
        <View style={styles.namingContainer}>
          <View style={styles.selectedDeviceInfo}>
            <View style={styles.deviceIconContainer}>
              <Ionicons name="bluetooth" size={32} color={colors.primary[400]} />
            </View>
            <Text style={styles.selectedDeviceName}>
              {selectedDevice.name || 'OMI Device'}
            </Text>
            <Text style={styles.selectedDeviceId}>{selectedDevice.id}</Text>
          </View>

          <Text style={styles.namingLabel}>Device Name</Text>
          <TextInput
            style={styles.nameInput}
            value={deviceName}
            onChangeText={setDeviceName}
            placeholder="Enter a name for this device"
            placeholderTextColor={theme.textMuted}
            autoFocus
            selectTextOnFocus
            testID="device-name-input"
          />

          <TouchableOpacity
            style={styles.saveButton}
            onPress={handleSaveDevice}
            testID="save-device-button"
          >
            <Ionicons name="checkmark" size={20} color={theme.primaryButtonText} />
            <Text style={styles.saveButtonText}>Save Device</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={styles.container} testID={testID}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Scan for OMI Devices</Text>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={onCancel}
          testID="cancel-scan-button"
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>

      {/* Error Banner */}
      {error && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={20} color={colors.error.default} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Scan Controls */}
      <View style={styles.scanControls}>
        <TouchableOpacity
          style={[styles.scanButton, scanning && styles.scanButtonActive]}
          onPress={scanning ? stopScan : startScan}
          testID="scan-button"
        >
          {scanning ? (
            <>
              <ActivityIndicator size="small" color={theme.primaryButtonText} />
              <Text style={styles.scanButtonText}>Scanning...</Text>
            </>
          ) : (
            <>
              <Ionicons name="search" size={20} color={theme.primaryButtonText} />
              <Text style={styles.scanButtonText}>Start Scan</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Filter Toggle */}
      <View style={styles.filterRow}>
        <Text style={styles.filterLabel}>Show only OMI/Friend devices</Text>
        <Switch
          testID="omi-filter-toggle"
          trackColor={{ false: theme.border, true: colors.primary[400] }}
          thumbColor={showOnlyOmi ? colors.primary[100] : theme.textMuted}
          ios_backgroundColor={theme.border}
          onValueChange={setShowOnlyOmi}
          value={showOnlyOmi}
        />
      </View>

      {/* Device List */}
      <View style={styles.listContainer}>
        {filteredDevices.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="radio-outline" size={40} color={theme.textMuted} />
            <Text style={styles.emptyStateText}>
              {scanning
                ? 'Searching for devices...'
                : showOnlyOmi && devices.length > 0
                ? `No OMI/Friend devices found. ${devices.length} other device(s) hidden.`
                : 'No devices found. Tap Scan to search.'}
            </Text>
            {showOnlyOmi && devices.length > 0 && (
              <TouchableOpacity
                style={styles.showAllButton}
                onPress={() => setShowOnlyOmi(false)}
              >
                <Text style={styles.showAllButtonText}>Show all devices</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <FlatList
            data={filteredDevices}
            renderItem={renderDevice}
            keyExtractor={(item) => item.id}
            style={styles.deviceList}
            contentContainerStyle={styles.deviceListContent}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: theme.textPrimary,
  },
  cancelButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  cancelButtonText: {
    fontSize: fontSize.base,
    color: colors.error.default,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  statusTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: theme.textPrimary,
    marginTop: spacing.lg,
    textAlign: 'center',
  },
  statusText: {
    fontSize: fontSize.sm,
    color: theme.textSecondary,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  actionButton: {
    marginTop: spacing.xl,
    backgroundColor: colors.primary[400],
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.md,
  },
  actionButtonText: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: theme.primaryButtonText,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.error.bg,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
  errorText: {
    color: colors.error.default,
    fontSize: fontSize.sm,
    marginLeft: spacing.sm,
    flex: 1,
  },
  scanControls: {
    marginBottom: spacing.lg,
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary[400],
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  scanButtonActive: {
    backgroundColor: colors.primary[500],
  },
  scanButtonText: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: theme.primaryButtonText,
  },
  filterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  filterLabel: {
    fontSize: fontSize.sm,
    color: theme.textSecondary,
  },
  showAllButton: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  showAllButtonText: {
    fontSize: fontSize.sm,
    color: colors.primary[400],
    fontWeight: '500',
  },
  listContainer: {
    flex: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyStateText: {
    fontSize: fontSize.sm,
    color: theme.textMuted,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  deviceList: {
    flex: 1,
  },
  deviceListContent: {
    gap: spacing.sm,
  },
  deviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.backgroundCard,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: theme.border,
  },
  deviceItemSaved: {
    borderColor: colors.success.default,
  },
  deviceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  deviceIconContainer: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.full,
    backgroundColor: theme.backgroundInput,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  deviceDetails: {
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
  deviceRssi: {
    fontSize: fontSize.xs,
    color: theme.textSecondary,
    marginTop: 2,
  },
  deviceActions: {
    marginLeft: spacing.sm,
  },
  savedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  savedBadgeText: {
    fontSize: fontSize.xs,
    color: colors.success.default,
  },
  // Naming UI styles (inline, no modal)
  namingContainer: {
    flex: 1,
    paddingTop: spacing.xl,
  },
  selectedDeviceInfo: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  selectedDeviceName: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: theme.textPrimary,
    marginTop: spacing.md,
  },
  selectedDeviceId: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
    marginTop: spacing.xs,
  },
  namingLabel: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: theme.textSecondary,
    marginBottom: spacing.sm,
  },
  nameInput: {
    backgroundColor: theme.backgroundInput,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: fontSize.base,
    color: theme.textPrimary,
    borderWidth: 1,
    borderColor: theme.border,
    marginBottom: spacing.xl,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary[400],
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  saveButtonText: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: theme.primaryButtonText,
  },
});

export default OmiDeviceScanner;
