/**
 * OMI Device Storage Utility
 *
 * Manages saved OMI Bluetooth devices with custom names.
 * Persists device ID -> name mappings using AsyncStorage.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const OMI_DEVICES_KEY = '@ushadow_omi_devices';
const ACTIVE_OMI_DEVICE_KEY = '@ushadow_active_omi_device';

export interface SavedOmiDevice {
  id: string;           // Bluetooth device ID
  name: string;         // User-given name
  originalName: string; // Original Bluetooth advertised name
  lastConnected?: number; // Timestamp of last connection
}

/**
 * Get all saved OMI devices
 */
export async function getSavedOmiDevices(): Promise<SavedOmiDevice[]> {
  try {
    const json = await AsyncStorage.getItem(OMI_DEVICES_KEY);
    if (json) {
      return JSON.parse(json);
    }
    return [];
  } catch (error) {
    console.error('[OmiDeviceStorage] Failed to get devices:', error);
    return [];
  }
}

/**
 * Save a new OMI device or update existing one
 */
export async function saveOmiDevice(device: SavedOmiDevice): Promise<void> {
  try {
    const devices = await getSavedOmiDevices();
    const existingIndex = devices.findIndex((d) => d.id === device.id);

    if (existingIndex >= 0) {
      // Update existing device
      devices[existingIndex] = {
        ...devices[existingIndex],
        ...device,
        lastConnected: Date.now(),
      };
    } else {
      // Add new device
      devices.push({
        ...device,
        lastConnected: Date.now(),
      });
    }

    await AsyncStorage.setItem(OMI_DEVICES_KEY, JSON.stringify(devices));
    console.log('[OmiDeviceStorage] Device saved:', device.name);
  } catch (error) {
    console.error('[OmiDeviceStorage] Failed to save device:', error);
    throw error;
  }
}

/**
 * Update device name
 */
export async function updateOmiDeviceName(deviceId: string, newName: string): Promise<void> {
  try {
    const devices = await getSavedOmiDevices();
    const device = devices.find((d) => d.id === deviceId);

    if (device) {
      device.name = newName;
      await AsyncStorage.setItem(OMI_DEVICES_KEY, JSON.stringify(devices));
      console.log('[OmiDeviceStorage] Device renamed:', newName);
    }
  } catch (error) {
    console.error('[OmiDeviceStorage] Failed to rename device:', error);
    throw error;
  }
}

/**
 * Remove a saved OMI device
 */
export async function removeOmiDevice(deviceId: string): Promise<void> {
  try {
    const devices = await getSavedOmiDevices();
    const filtered = devices.filter((d) => d.id !== deviceId);
    await AsyncStorage.setItem(OMI_DEVICES_KEY, JSON.stringify(filtered));

    // Clear active device if it was the one removed
    const activeId = await getActiveOmiDeviceId();
    if (activeId === deviceId) {
      await AsyncStorage.removeItem(ACTIVE_OMI_DEVICE_KEY);
    }

    console.log('[OmiDeviceStorage] Device removed:', deviceId);
  } catch (error) {
    console.error('[OmiDeviceStorage] Failed to remove device:', error);
    throw error;
  }
}

/**
 * Get a saved device by Bluetooth ID
 */
export async function getOmiDeviceById(deviceId: string): Promise<SavedOmiDevice | null> {
  const devices = await getSavedOmiDevices();
  return devices.find((d) => d.id === deviceId) || null;
}

/**
 * Set the active OMI device ID
 */
export async function setActiveOmiDevice(deviceId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(ACTIVE_OMI_DEVICE_KEY, deviceId);
    console.log('[OmiDeviceStorage] Active device set:', deviceId);
  } catch (error) {
    console.error('[OmiDeviceStorage] Failed to set active device:', error);
    throw error;
  }
}

/**
 * Get the active OMI device ID
 */
export async function getActiveOmiDeviceId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(ACTIVE_OMI_DEVICE_KEY);
  } catch (error) {
    console.error('[OmiDeviceStorage] Failed to get active device:', error);
    return null;
  }
}

/**
 * Get the active OMI device details
 */
export async function getActiveOmiDevice(): Promise<SavedOmiDevice | null> {
  const activeId = await getActiveOmiDeviceId();
  if (!activeId) return null;
  return getOmiDeviceById(activeId);
}

/**
 * Clear active OMI device
 */
export async function clearActiveOmiDevice(): Promise<void> {
  try {
    await AsyncStorage.removeItem(ACTIVE_OMI_DEVICE_KEY);
    console.log('[OmiDeviceStorage] Active device cleared');
  } catch (error) {
    console.error('[OmiDeviceStorage] Failed to clear active device:', error);
    throw error;
  }
}
