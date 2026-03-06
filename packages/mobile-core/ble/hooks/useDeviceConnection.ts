/**
 * useDeviceConnection — Manage connection to a single OMI device.
 *
 * Handles connection state machine, battery level, codec queries, and callbacks.
 */

import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import { OmiConnection, BleAudioCodec, OmiDevice } from 'friend-lite-react-native';

export interface UseDeviceConnectionReturn {
  connectedDevice: OmiDevice | null;
  isConnecting: boolean;
  connectionError: string | null;
  currentCodec: BleAudioCodec | null;
  batteryLevel: number;
  connectToDevice: (deviceId: string) => Promise<void>;
  disconnectFromDevice: () => Promise<void>;
  getAudioCodec: () => Promise<void>;
  getBatteryLevel: () => Promise<void>;
  connectedDeviceId: string | null;
}

export interface UseDeviceConnectionOptions {
  onDisconnect?: () => void;
  onConnect?: () => void;
  onLog?: (status: 'connecting' | 'connected' | 'disconnected' | 'error', message: string, details?: string) => void;
}

export const useDeviceConnection = (
  omiConnection: OmiConnection,
  options?: UseDeviceConnectionOptions
): UseDeviceConnectionReturn => {
  const { onDisconnect, onConnect, onLog } = options || {};
  const [connectedDevice, setConnectedDevice] = useState<OmiDevice | null>(null);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [currentCodec, setCurrentCodec] = useState<BleAudioCodec | null>(null);
  const [batteryLevel, setBatteryLevel] = useState<number>(-1);
  const [connectedDeviceId, setConnectedDeviceId] = useState<string | null>(null);

  const handleConnectionStateChange = useCallback((id: string, state: string) => {
    console.log(`Device ${id} connection state: ${state}`);
    const isNowConnected = state === 'connected';
    setIsConnecting(false);

    if (isNowConnected) {
        setConnectedDeviceId(id);
        setConnectionError(null);
        onLog?.('connected', 'OMI device connected', `Device ID: ${id}`);
        if (onConnect) onConnect();
    } else {
        setConnectedDeviceId(null);
        setConnectedDevice(null);
        setCurrentCodec(null);
        setBatteryLevel(-1);
        onLog?.('disconnected', 'OMI device disconnected', `Device ID: ${id}`);
        if (onDisconnect) onDisconnect();
    }
  }, [onDisconnect, onConnect, onLog]);

  const disconnectFromDevice = useCallback(async () => {
    console.log('Attempting to disconnect...');
    setIsConnecting(false);
    onLog?.('disconnected', 'Disconnecting from OMI device');
    try {
      if (onDisconnect) {
        await onDisconnect();
      }
      await omiConnection.disconnect();
      console.log('Successfully disconnected.');
      setConnectedDevice(null);
      setConnectedDeviceId(null);
      setCurrentCodec(null);
      setBatteryLevel(-1);
    } catch (error) {
      console.error('Disconnect error:', error);
      onLog?.('error', 'OMI disconnect error', String(error));
      Alert.alert('Disconnect Error', String(error));
      setConnectedDevice(null);
      setConnectedDeviceId(null);
      setCurrentCodec(null);
      setBatteryLevel(-1);
    }
  }, [omiConnection, onDisconnect, onLog]);

  const connectToDevice = useCallback(async (deviceId: string) => {
    if (connectedDeviceId && connectedDeviceId !== deviceId) {
      console.log('Disconnecting from previous device before connecting to new one.');
      await disconnectFromDevice();
    }
    if (connectedDeviceId === deviceId) {
        console.log('Already connected or connecting to this device');
        return;
    }

    setIsConnecting(true);
    setConnectionError(null);
    setConnectedDevice(null);
    setCurrentCodec(null);
    setBatteryLevel(-1);
    onLog?.('connecting', 'Connecting to OMI device', `Device ID: ${deviceId}`);

    try {
      const success = await omiConnection.connect(deviceId, handleConnectionStateChange);
      if (success) {
        console.log('Successfully initiated connection to device:', deviceId);
      } else {
        setIsConnecting(false);
        const errorMsg = 'Could not connect to the device. Please try again.';
        setConnectionError(errorMsg);
        onLog?.('error', 'Failed to connect to OMI device', errorMsg);
        Alert.alert('Connection Failed', errorMsg);
      }
    } catch (error) {
      console.error('Connection error:', error);
      setIsConnecting(false);
      setConnectedDevice(null);
      setConnectedDeviceId(null);
      const errorMsg = String(error);
      setConnectionError(errorMsg);
      onLog?.('error', 'OMI connection error', errorMsg);
      Alert.alert('Connection Error', errorMsg);
    }
  }, [omiConnection, handleConnectionStateChange, connectedDeviceId, onLog, disconnectFromDevice]);

  const getAudioCodec = useCallback(async () => {
    if (!omiConnection.isConnected() || !connectedDeviceId) {
      Alert.alert('Not Connected', 'Please connect to a device first.');
      return;
    }
    try {
      const codecValue = await omiConnection.getAudioCodec();
      setCurrentCodec(codecValue);
      console.log('Audio codec:', codecValue);
    } catch (error) {
      console.error('Get codec error:', error);
      if (String(error).includes('not connected')) {
        setConnectedDevice(null);
        setConnectedDeviceId(null);
        Alert.alert('Connection Lost', 'The device appears to be disconnected. Please reconnect.');
      } else {
        Alert.alert('Error', `Failed to get audio codec: ${error}`);
      }
    }
  }, [omiConnection, connectedDeviceId]);

  const getBatteryLevel = useCallback(async () => {
    if (!omiConnection.isConnected() || !connectedDeviceId) {
      Alert.alert('Not Connected', 'Please connect to a device first.');
      return;
    }
    try {
      const level = await omiConnection.getBatteryLevel();
      setBatteryLevel(level);
      console.log('Battery level:', level);
    } catch (error) {
      console.error('Get battery level error:', error);
      if (String(error).includes('not connected')) {
        setConnectedDevice(null);
        setConnectedDeviceId(null);
        Alert.alert('Connection Lost', 'The device appears to be disconnected. Please reconnect.');
      } else {
        Alert.alert('Error', `Failed to get battery level: ${error}`);
      }
    }
  }, [omiConnection, connectedDeviceId]);

  return {
    connectedDevice,
    isConnecting,
    connectionError,
    currentCodec,
    batteryLevel,
    connectToDevice,
    disconnectFromDevice,
    getAudioCodec,
    getBatteryLevel,
    connectedDeviceId
  };
};
