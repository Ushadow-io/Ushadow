/**
 * Demo Mode Storage
 *
 * Manages demo mode state for App Store review testing.
 * Demo mode allows reviewers to test the app without server connectivity.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const DEMO_MODE_KEY = '@ushadow:demo_mode';
const PREVIOUS_UNODE_KEY = '@ushadow:previous_unode_id';

/**
 * Check if demo mode is currently enabled
 */
export async function isDemoMode(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(DEMO_MODE_KEY);
    const result = value === 'true';
    console.log('[DemoMode] isDemoMode check - stored value:', value, 'result:', result);
    return result;
  } catch (error) {
    console.error('[DemoMode] Failed to check demo mode:', error);
    return false;
  }
}

/**
 * Save the current active UNode ID before enabling demo mode
 */
async function savePreviousUnodeId(unodeId: string | null): Promise<void> {
  try {
    if (unodeId) {
      await AsyncStorage.setItem(PREVIOUS_UNODE_KEY, unodeId);
      console.log('[DemoMode] Saved previous UNode ID:', unodeId);
    } else {
      await AsyncStorage.removeItem(PREVIOUS_UNODE_KEY);
      console.log('[DemoMode] No previous UNode ID to save (none was active)');
    }
  } catch (error) {
    console.error('[DemoMode] Failed to save previous UNode ID:', error);
  }
}

/**
 * Get the saved previous UNode ID
 */
async function getPreviousUnodeId(): Promise<string | null> {
  try {
    const unodeId = await AsyncStorage.getItem(PREVIOUS_UNODE_KEY);
    console.log('[DemoMode] Retrieved previous UNode ID:', unodeId);
    return unodeId;
  } catch (error) {
    console.error('[DemoMode] Failed to get previous UNode ID:', error);
    return null;
  }
}

/**
 * Clear the saved previous UNode ID
 */
async function clearPreviousUnodeId(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PREVIOUS_UNODE_KEY);
    console.log('[DemoMode] Cleared previous UNode ID');
  } catch (error) {
    console.error('[DemoMode] Failed to clear previous UNode ID:', error);
  }
}

/**
 * Enable demo mode (for App Store review)
 * Saves the current active UNode ID so it can be restored later
 */
export async function enableDemoMode(currentActiveUnodeId: string | null): Promise<void> {
  try {
    // Save current active UNode before switching to demo mode
    await savePreviousUnodeId(currentActiveUnodeId);

    // Enable demo mode
    await AsyncStorage.setItem(DEMO_MODE_KEY, 'true');
    console.log('[DemoMode] Demo mode enabled');
  } catch (error) {
    console.error('[DemoMode] Failed to enable demo mode:', error);
    throw error;
  }
}

/**
 * Disable demo mode and return to normal operation
 * Returns the previous active UNode ID to restore, or null if there was none
 */
export async function disableDemoMode(): Promise<string | null> {
  try {
    // Get previous UNode ID before clearing
    const previousUnodeId = await getPreviousUnodeId();

    // Disable demo mode
    await AsyncStorage.removeItem(DEMO_MODE_KEY);
    console.log('[DemoMode] Demo mode disabled');

    // Clear the previous UNode ID storage
    await clearPreviousUnodeId();

    return previousUnodeId;
  } catch (error) {
    console.error('[DemoMode] Failed to disable demo mode:', error);
    throw error;
  }
}
