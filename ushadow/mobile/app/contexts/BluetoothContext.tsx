/**
 * Bluetooth Context
 *
 * Provides a singleton BleManager instance to the entire app.
 * react-native-ble-plx requires only ONE BleManager instance.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Platform, PermissionsAndroid, Permission as ReactNativePermission } from 'react-native';
import { BleManager, State as BluetoothState } from 'react-native-ble-plx';

interface BluetoothContextType {
  bleManager: BleManager;
  bluetoothState: BluetoothState;
  permissionGranted: boolean;
  isPermissionsLoading: boolean;
  requestBluetoothPermission: () => Promise<boolean>;
}

const BluetoothContext = createContext<BluetoothContextType | null>(null);

// Singleton BleManager - created once for the entire app
let globalBleManager: BleManager | null = null;

const getGlobalBleManager = (): BleManager => {
  if (!globalBleManager) {
    console.log('[BluetoothContext] Creating singleton BleManager');
    globalBleManager = new BleManager();
  }
  return globalBleManager;
};

export const BluetoothProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const bleManagerRef = useRef<BleManager>(getGlobalBleManager());
  const bleManager = bleManagerRef.current;

  const [bluetoothState, setBluetoothState] = useState<BluetoothState>(BluetoothState.Unknown);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [isPermissionsLoading, setIsPermissionsLoading] = useState(true);

  useEffect(() => {
    console.log('[BluetoothContext] Setting up Bluetooth state listener');
    const subscription = bleManager.onStateChange((state) => {
      console.log(`[BluetoothContext] Bluetooth state changed: ${state}`);
      setBluetoothState(state);
    }, true);

    return () => {
      console.log('[BluetoothContext] Removing Bluetooth state listener');
      subscription.remove();
      // Note: We do NOT destroy the BleManager here - it's a singleton
    };
  }, [bleManager]);

  const checkAndRequestPermissions = useCallback(async () => {
    console.log('[BluetoothContext] checkAndRequestPermissions called');
    setIsPermissionsLoading(true);
    let allPermissionsGranted = false;

    if (Platform.OS === 'android') {
      try {
        const apiLevel = typeof Platform.Version === 'number' ? Platform.Version : parseInt(String(Platform.Version), 10);
        console.log(`[BluetoothContext] Android API Level: ${apiLevel}`);

        let permissionsToRequest: ReactNativePermission[] = [];

        if (apiLevel < 31) {
          permissionsToRequest = [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
        } else {
          permissionsToRequest = [
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN as ReactNativePermission,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT as ReactNativePermission,
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          ];
        }

        const statuses = await PermissionsAndroid.requestMultiple(permissionsToRequest);
        allPermissionsGranted = permissionsToRequest.every(
          (permission) => statuses[permission] === PermissionsAndroid.RESULTS.GRANTED
        );
      } catch (err) {
        console.error('[BluetoothContext] Error requesting Android permissions:', err);
        allPermissionsGranted = false;
      }
    } else if (Platform.OS === 'ios') {
      // iOS: if Bluetooth is powered on, permissions are handled
      const currentState = await bleManager.state();
      if (currentState === BluetoothState.PoweredOn) {
        allPermissionsGranted = true;
      }
    }

    setPermissionGranted(allPermissionsGranted);
    setIsPermissionsLoading(false);
    console.log('[BluetoothContext] Permissions granted:', allPermissionsGranted);
    return allPermissionsGranted;
  }, [bleManager]);

  // Initial permission check
  useEffect(() => {
    if (bluetoothState !== BluetoothState.Unknown) {
      checkAndRequestPermissions();
    }
  }, [bluetoothState, checkAndRequestPermissions]);

  const value: BluetoothContextType = {
    bleManager,
    bluetoothState,
    permissionGranted,
    isPermissionsLoading,
    requestBluetoothPermission: checkAndRequestPermissions,
  };

  return (
    <BluetoothContext.Provider value={value}>
      {children}
    </BluetoothContext.Provider>
  );
};

export const useBluetooth = (): BluetoothContextType => {
  const context = useContext(BluetoothContext);
  if (!context) {
    throw new Error('useBluetooth must be used within a BluetoothProvider');
  }
  return context;
};

export default BluetoothContext;
