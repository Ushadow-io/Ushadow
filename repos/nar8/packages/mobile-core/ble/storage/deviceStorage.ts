/**
 * Device Storage — Persistent storage for saved OMI/BLE devices with custom names.
 *
 * Storage key prefix is configurable to avoid collisions across apps.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export interface SavedDevice {
  id: string;           // Bluetooth device ID
  name: string;         // User-given name
  originalName: string; // Original Bluetooth advertised name
  lastConnected?: number; // Timestamp of last connection
}

const DEFAULT_PREFIX = '@ble';

function devicesKey(prefix: string) {
  return `${prefix}_devices`;
}
function activeDeviceKey(prefix: string) {
  return `${prefix}_active_device`;
}

export function createDeviceStorage(storagePrefix = DEFAULT_PREFIX) {
  const DEVICES_KEY = devicesKey(storagePrefix);
  const ACTIVE_KEY = activeDeviceKey(storagePrefix);

  async function getSavedDevices(): Promise<SavedDevice[]> {
    try {
      const json = await AsyncStorage.getItem(DEVICES_KEY);
      if (json) return JSON.parse(json);
      return [];
    } catch (error) {
      console.error('[DeviceStorage] Failed to get devices:', error);
      return [];
    }
  }

  async function saveDevice(device: SavedDevice): Promise<void> {
    try {
      const devices = await getSavedDevices();
      const existingIndex = devices.findIndex((d) => d.id === device.id);

      if (existingIndex >= 0) {
        devices[existingIndex] = { ...devices[existingIndex], ...device, lastConnected: Date.now() };
      } else {
        devices.push({ ...device, lastConnected: Date.now() });
      }

      await AsyncStorage.setItem(DEVICES_KEY, JSON.stringify(devices));
      console.log('[DeviceStorage] Device saved:', device.name);
    } catch (error) {
      console.error('[DeviceStorage] Failed to save device:', error);
      throw error;
    }
  }

  async function updateDeviceName(deviceId: string, newName: string): Promise<void> {
    try {
      const devices = await getSavedDevices();
      const device = devices.find((d) => d.id === deviceId);
      if (device) {
        device.name = newName;
        await AsyncStorage.setItem(DEVICES_KEY, JSON.stringify(devices));
        console.log('[DeviceStorage] Device renamed:', newName);
      }
    } catch (error) {
      console.error('[DeviceStorage] Failed to rename device:', error);
      throw error;
    }
  }

  async function removeDevice(deviceId: string): Promise<void> {
    try {
      const devices = await getSavedDevices();
      const filtered = devices.filter((d) => d.id !== deviceId);
      await AsyncStorage.setItem(DEVICES_KEY, JSON.stringify(filtered));

      const activeId = await getActiveDeviceId();
      if (activeId === deviceId) {
        await AsyncStorage.removeItem(ACTIVE_KEY);
      }
      console.log('[DeviceStorage] Device removed:', deviceId);
    } catch (error) {
      console.error('[DeviceStorage] Failed to remove device:', error);
      throw error;
    }
  }

  async function getDeviceById(deviceId: string): Promise<SavedDevice | null> {
    const devices = await getSavedDevices();
    return devices.find((d) => d.id === deviceId) || null;
  }

  async function setActiveDevice(deviceId: string): Promise<void> {
    try {
      await AsyncStorage.setItem(ACTIVE_KEY, deviceId);
      console.log('[DeviceStorage] Active device set:', deviceId);
    } catch (error) {
      console.error('[DeviceStorage] Failed to set active device:', error);
      throw error;
    }
  }

  async function getActiveDeviceId(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(ACTIVE_KEY);
    } catch (error) {
      console.error('[DeviceStorage] Failed to get active device:', error);
      return null;
    }
  }

  async function getActiveDevice(): Promise<SavedDevice | null> {
    const activeId = await getActiveDeviceId();
    if (!activeId) return null;
    return getDeviceById(activeId);
  }

  async function clearActiveDevice(): Promise<void> {
    try {
      await AsyncStorage.removeItem(ACTIVE_KEY);
      console.log('[DeviceStorage] Active device cleared');
    } catch (error) {
      console.error('[DeviceStorage] Failed to clear active device:', error);
      throw error;
    }
  }

  return {
    getSavedDevices,
    saveDevice,
    updateDeviceName,
    removeDevice,
    getDeviceById,
    setActiveDevice,
    getActiveDeviceId,
    getActiveDevice,
    clearActiveDevice,
  };
}

// Default instance for backwards compatibility
const defaultStorage = createDeviceStorage('@ushadow_omi');

export const getSavedDevices = defaultStorage.getSavedDevices;
export const saveDevice = defaultStorage.saveDevice;
export const updateDeviceName = defaultStorage.updateDeviceName;
export const removeDevice = defaultStorage.removeDevice;
export const getDeviceById = defaultStorage.getDeviceById;
export const setActiveDevice = defaultStorage.setActiveDevice;
export const getActiveDeviceId = defaultStorage.getActiveDeviceId;
export const getActiveDevice = defaultStorage.getActiveDevice;
export const clearActiveDevice = defaultStorage.clearActiveDevice;
