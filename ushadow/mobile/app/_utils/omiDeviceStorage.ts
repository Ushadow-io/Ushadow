/**
 * OMI Device Storage — Re-export shim.
 *
 * Source of truth has moved to @ushadow/mobile-core/ble (deviceStorage).
 * This file re-exports with the original function names for compatibility.
 */

import { createDeviceStorage } from '../../../../packages/mobile-core/ble';
export type { SavedDevice as SavedOmiDevice } from '../../../../packages/mobile-core/ble';

// Create storage instance with ushadow-specific prefix (matches old keys)
const storage = createDeviceStorage('@ushadow_omi');

export const getSavedOmiDevices = storage.getSavedDevices;
export const saveOmiDevice = storage.saveDevice;
export const updateOmiDeviceName = storage.updateDeviceName;
export const removeOmiDevice = storage.removeDevice;
export const getOmiDeviceById = storage.getDeviceById;
export const setActiveOmiDevice = storage.setActiveDevice;
export const getActiveOmiDeviceId = storage.getActiveDeviceId;
export const getActiveOmiDevice = storage.getActiveDevice;
export const clearActiveOmiDevice = storage.clearActiveDevice;
