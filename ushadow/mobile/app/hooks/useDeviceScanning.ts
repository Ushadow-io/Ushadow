import { useState, useEffect, useCallback, useRef } from 'react';
import { BleManager, State as BluetoothState } from 'react-native-ble-plx';
import { OmiConnection, OmiDevice } from 'friend-lite-react-native';

interface UseDeviceScanning {
  devices: OmiDevice[];
  scanning: boolean;
  startScan: () => void;
  stopScan: () => void;
  error: string | null;
}

export const useDeviceScanning = (
  bleManager: BleManager | null,
  omiConnection: OmiConnection,
  permissionGranted: boolean,
  isBluetoothOn: boolean,
  requestBluetoothPermission: () => Promise<boolean>
): UseDeviceScanning => {
  const [devices, setDevices] = useState<OmiDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stopScanFunctionRef = useRef<(() => void) | null>(null);
  const scanTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true); // Track if component is still mounted

  const handleStopScan = useCallback(() => {
    console.log('[Scanner] handleStopScan called, isMounted:', isMountedRef.current);
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
      scanTimeoutRef.current = null;
    }
    if (stopScanFunctionRef.current) {
      console.log('[Scanner] Executing stopScanFunctionRef.current()');
      try {
        stopScanFunctionRef.current();
      } catch (e: any) {
        console.error('[Scanner] Error calling stop function from omiConnection:', e);
      }
      stopScanFunctionRef.current = null;
    }
    // Only update state if component is still mounted
    if (isMountedRef.current) {
      setScanning(false);
      console.log('[Scanner] Scan stopped, scanning state set to false.');
    } else {
      console.log('[Scanner] Component unmounted, skipping state update');
    }
  }, []);

  const startScan = useCallback(async () => {
    console.log('[Scanner] startScan called');
    setError(null);
    setDevices([]);

    if (scanning) {
      console.log('[Scanner] Scan already in progress. Stopping previous scan first.');
      handleStopScan();
    }

    if (!bleManager) {
      console.error('[Scanner] BleManager not available');
      setError('Bluetooth manager not initialized.');
      return;
    }

    console.log(`[Scanner] Checking conditions: permissionGranted=${permissionGranted}, isBluetoothOn=${isBluetoothOn}`);

    if (!permissionGranted) {
      console.log('[Scanner] Permission not granted. Requesting permission...');
      const granted = await requestBluetoothPermission();
      if (!granted) {
        console.warn('[Scanner] Permission denied after request.');
        setError('Bluetooth permissions are required to scan for devices.');
        return;
      }
      console.log('[Scanner] Permission granted after request.');
    }

    if (!isBluetoothOn) {
      console.warn('[Scanner] Bluetooth is not powered on.');
      setError('Bluetooth is not enabled. Please turn on Bluetooth.');
      return;
    }

    const currentState = await bleManager.state();
    if (currentState !== BluetoothState.PoweredOn) {
        console.warn(`[Scanner] Bluetooth state is ${currentState}, not PoweredOn. Cannot scan.`);
        setError(`Bluetooth is not powered on (state: ${currentState}). Please enable Bluetooth.`);
        return;
    }

    console.log('[Scanner] Starting device scan with omiConnection');
    setScanning(true);

    try {
      stopScanFunctionRef.current = omiConnection.scanForDevices(
        (device: OmiDevice) => {
          // Only update state if still mounted
          if (!isMountedRef.current) return;

          console.log(`[Scanner] Device found: ${device.name} (${device.id}), RSSI: ${device.rssi}`);
          setDevices((prevDevices) => {
            const existingDeviceIndex = prevDevices.findIndex((d) => d.id === device.id);
            if (existingDeviceIndex === -1) {
              return [...prevDevices, device];
            } else {
              return prevDevices;
            }
          });
        }
      );

      // Set a timeout for the scan
      if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
      scanTimeoutRef.current = setTimeout(() => {
        // Only update state if still mounted
        if (!isMountedRef.current) return;

        console.log('[Scanner] Scan timeout reached (10s). Stopping scan.');
        setError('Scan timed out. No devices found or connection failed within 10 seconds.');
        handleStopScan();
      }, 10000);

    } catch (scanError: any) {
      console.error('[Scanner] Failed to initiate scan with omiConnection:', scanError);
      if (isMountedRef.current) {
        setError(`Failed to start scan: ${scanError.message || 'Unknown error'}`);
      }
      handleStopScan();
    }
  }, [
    omiConnection,
    permissionGranted,
    isBluetoothOn,
    requestBluetoothPermission,
    bleManager,
    handleStopScan,
    scanning
  ]);

  useEffect(() => {
    // Mark as mounted
    isMountedRef.current = true;

    return () => {
      console.log('[Scanner] Unmounting useDeviceScanning. Marking as unmounted.');
      // Mark as unmounted BEFORE calling handleStopScan to prevent state updates
      isMountedRef.current = false;

      // Clear timeout but DON'T call BLE stop during unmount - it may block
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
        scanTimeoutRef.current = null;
      }
      stopScanFunctionRef.current = null;
      console.log('[Scanner] Cleanup complete (skipped BLE stop)');
    };
  }, []);

  return { devices, scanning, startScan, stopScan: handleStopScan, error };
};
