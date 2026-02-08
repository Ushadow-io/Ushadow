/**
 * Auth Storage Utility
 *
 * Manages JWT token persistence using AsyncStorage.
 * Tokens are stored securely and used for authenticating with
 * ushadow backend and chronicle WebSocket connections.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import AppConfig from '../config';

const AUTH_TOKEN_KEY = '@ushadow_auth_token';
const ID_TOKEN_KEY = '@ushadow_id_token';
const API_URL_KEY = '@ushadow_api_url';
const DEFAULT_SERVER_URL_KEY = '@ushadow_default_server_url';

/**
 * Store the auth token
 */
export async function saveAuthToken(token: string): Promise<void> {
  try {
    await AsyncStorage.setItem(AUTH_TOKEN_KEY, token);
    console.log('[AuthStorage] Token saved');
  } catch (error) {
    console.error('[AuthStorage] Failed to save token:', error);
    throw error;
  }
}

/**
 * Get the stored auth token
 */
export async function getAuthToken(): Promise<string | null> {
  try {
    const token = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
    return token;
  } catch (error) {
    console.error('[AuthStorage] Failed to get token:', error);
    return null;
  }
}

/**
 * Remove the stored auth token (logout)
 */
export async function clearAuthToken(): Promise<void> {
  try {
    await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
    await AsyncStorage.removeItem(ID_TOKEN_KEY);
    console.log('[AuthStorage] Token cleared');
  } catch (error) {
    console.error('[AuthStorage] Failed to clear token:', error);
    throw error;
  }
}

/**
 * Store the ID token (for Keycloak logout)
 */
export async function saveIdToken(idToken: string): Promise<void> {
  try {
    await AsyncStorage.setItem(ID_TOKEN_KEY, idToken);
    console.log('[AuthStorage] ID token saved');
  } catch (error) {
    console.error('[AuthStorage] Failed to save ID token:', error);
    throw error;
  }
}

/**
 * Get the stored ID token
 */
export async function getIdToken(): Promise<string | null> {
  try {
    const token = await AsyncStorage.getItem(ID_TOKEN_KEY);
    return token;
  } catch (error) {
    console.error('[AuthStorage] Failed to get ID token:', error);
    return null;
  }
}

/**
 * Store the API URL (for manual login)
 */
export async function saveApiUrl(url: string): Promise<void> {
  try {
    await AsyncStorage.setItem(API_URL_KEY, url);
    console.log('[AuthStorage] API URL saved');
  } catch (error) {
    console.error('[AuthStorage] Failed to save API URL:', error);
    throw error;
  }
}

/**
 * Get the stored API URL
 */
export async function getApiUrl(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(API_URL_KEY);
  } catch (error) {
    console.error('[AuthStorage] Failed to get API URL:', error);
    return null;
  }
}

/**
 * Check if user is authenticated (has a valid token)
 */
export async function isAuthenticated(): Promise<boolean> {
  const token = await getAuthToken();
  if (!token) return false;

  // Basic JWT expiration check (decode without verification)
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;

    const payload = JSON.parse(atob(parts[1]));
    const exp = payload.exp;

    if (exp && Date.now() / 1000 > exp) {
      console.log('[AuthStorage] Token expired');
      return false;
    }

    return true;
  } catch {
    console.log('[AuthStorage] Invalid token format');
    return false;
  }
}

/**
 * Get auth info from token
 */
export async function getAuthInfo(): Promise<{ email: string; userId: string } | null> {
  const token = await getAuthToken();
  if (!token) return null;

  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = JSON.parse(atob(parts[1]));
    return {
      email: payload.email || 'Unknown',
      userId: payload.sub || 'Unknown',
    };
  } catch {
    return null;
  }
}

/**
 * Get user email from token (for OpenMemory user_id)
 */
export async function getUserEmail(): Promise<string | null> {
  const info = await getAuthInfo();
  return info?.email || null;
}

/**
 * Append auth token to WebSocket URL
 */
export function appendTokenToUrl(wsUrl: string, token: string): string {
  const separator = wsUrl.includes('?') ? '&' : '?';
  return `${wsUrl}${separator}token=${token}`;
}

/**
 * Get the default server URL.
 * Returns user-configured default if set, otherwise returns app config default.
 */
export async function getDefaultServerUrl(): Promise<string> {
  try {
    const customDefault = await AsyncStorage.getItem(DEFAULT_SERVER_URL_KEY);
    if (customDefault) {
      return customDefault;
    }
  } catch (error) {
    console.error('[AuthStorage] Failed to get default server URL:', error);
  }
  return AppConfig.DEFAULT_SERVER_URL;
}

/**
 * Set a custom default server URL.
 * This will be used instead of the app config default.
 */
export async function setDefaultServerUrl(url: string): Promise<void> {
  try {
    await AsyncStorage.setItem(DEFAULT_SERVER_URL_KEY, url);
    console.log('[AuthStorage] Default server URL saved:', url);
  } catch (error) {
    console.error('[AuthStorage] Failed to save default server URL:', error);
    throw error;
  }
}

/**
 * Clear the custom default server URL (revert to app config default).
 */
export async function clearDefaultServerUrl(): Promise<void> {
  try {
    await AsyncStorage.removeItem(DEFAULT_SERVER_URL_KEY);
    console.log('[AuthStorage] Default server URL cleared');
  } catch (error) {
    console.error('[AuthStorage] Failed to clear default server URL:', error);
    throw error;
  }
}

/**
 * Get the effective server URL to use.
 * Priority: stored API URL > custom default > app config default
 */
export async function getEffectiveServerUrl(): Promise<string> {
  // First check if there's a stored API URL from login
  const storedUrl = await getApiUrl();
  if (storedUrl) {
    return storedUrl;
  }
  // Otherwise return the default
  return getDefaultServerUrl();
}
