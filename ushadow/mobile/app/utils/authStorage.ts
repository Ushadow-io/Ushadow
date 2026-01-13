/**
 * Auth Storage Utility
 *
 * Manages JWT token persistence using AsyncStorage.
 * Tokens are stored securely and used for authenticating with
 * ushadow backend and chronicle WebSocket connections.
 *
 * Demo Mode Support:
 * When demo mode is enabled, this module returns demo credentials
 * instead of real stored credentials to allow App Store reviewers
 * to test the app without server connectivity.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { isDemoMode } from './demoModeStorage';
import { MOCK_AUTH_TOKEN, MOCK_USER_EMAIL, MOCK_USER_ID } from './mockData';

const AUTH_TOKEN_KEY = '@ushadow_auth_token';
const API_URL_KEY = '@ushadow_api_url';

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
 * Returns demo token if in demo mode
 */
export async function getAuthToken(): Promise<string | null> {
  // Check demo mode first
  if (await isDemoMode()) {
    console.log('[AuthStorage] Demo mode active - returning mock token');
    return MOCK_AUTH_TOKEN;
  }

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
    console.log('[AuthStorage] Token cleared');
  } catch (error) {
    console.error('[AuthStorage] Failed to clear token:', error);
    throw error;
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
 * Returns demo URL if in demo mode
 */
export async function getApiUrl(): Promise<string | null> {
  // Check demo mode first
  if (await isDemoMode()) {
    console.log('[AuthStorage] Demo mode active - returning demo URL');
    return 'https://demo.ushadow.io';
  }

  try {
    return await AsyncStorage.getItem(API_URL_KEY);
  } catch (error) {
    console.error('[AuthStorage] Failed to get API URL:', error);
    return null;
  }
}

/**
 * Check if user is authenticated (has a valid token)
 * Always returns true in demo mode
 */
export async function isAuthenticated(): Promise<boolean> {
  // Always authenticated in demo mode
  if (await isDemoMode()) {
    return true;
  }

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
 * Returns demo user info if in demo mode
 */
export async function getAuthInfo(): Promise<{ email: string; userId: string } | null> {
  // Return demo user info in demo mode
  if (await isDemoMode()) {
    return {
      email: MOCK_USER_EMAIL,
      userId: MOCK_USER_ID,
    };
  }

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
