/**
 * Auth Storage — JWT token persistence using AsyncStorage.
 *
 * Portable version: uses injectable config instead of hardcoded app references.
 * Call `configureAuth()` before first use to set storage prefix, default URL, etc.
 *
 * Extracted from ushadow/mobile/app/_utils/authStorage.ts
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAuthConfig } from './authConfig';

// ── Storage key helpers ─────────────────────────────────────────────

function key(suffix: string): string {
  return `${getAuthConfig().storagePrefix}_${suffix}`;
}

const AUTH_TOKEN_KEY = () => key('auth_token');
const REFRESH_TOKEN_KEY = () => key('refresh_token');
const ID_TOKEN_KEY = () => key('id_token');
const API_URL_KEY = () => key('api_url');
const DEFAULT_SERVER_URL_KEY = () => key('default_server_url');

// ── Token validation helpers ────────────────────────────────────────

async function validateToken(token: string): Promise<boolean> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      console.log('[AuthStorage] Invalid token format');
      await clearAuthToken();
      return false;
    }

    const payload = JSON.parse(atob(parts[1]));

    if (payload.exp && Date.now() / 1000 > payload.exp) {
      console.log('[AuthStorage] Token expired');
      await clearAuthToken();
      return false;
    }

    if (payload.iss && payload.iss.includes('/realms/')) {
      if (!payload.sub || !payload.email) {
        console.warn('[AuthStorage] Keycloak token missing required claims (sub/email)');
        await clearAuthToken();
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error('[AuthStorage] Token validation error:', error);
    await clearAuthToken();
    return false;
  }
}

async function shouldRefreshToken(token: string): Promise<boolean> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;

    const payload = JSON.parse(atob(parts[1]));
    if (!payload.exp) return false;

    const now = Date.now() / 1000;
    const expiresIn = payload.exp - now;
    const REFRESH_THRESHOLD = 5 * 60; // 5 minutes

    return expiresIn < REFRESH_THRESHOLD && expiresIn > 0;
  } catch {
    return false;
  }
}

async function attemptTokenRefresh(): Promise<string | null> {
  try {
    const refreshToken = await AsyncStorage.getItem(REFRESH_TOKEN_KEY());
    const apiUrl = await getApiUrl();
    const { refreshTokenFn } = getAuthConfig();

    if (!refreshToken || !apiUrl || !refreshTokenFn) {
      console.log('[AuthStorage] Missing refresh token, API URL, or refresh function');
      return null;
    }

    const tokens = await refreshTokenFn(apiUrl, refreshToken);

    if (!tokens || !tokens.access_token) {
      console.error('[AuthStorage] Token refresh failed');
      return null;
    }

    await AsyncStorage.setItem(AUTH_TOKEN_KEY(), tokens.access_token);
    if (tokens.refresh_token) {
      await AsyncStorage.setItem(REFRESH_TOKEN_KEY(), tokens.refresh_token);
    }
    if (tokens.id_token) {
      await AsyncStorage.setItem(ID_TOKEN_KEY(), tokens.id_token);
    }

    console.log('[AuthStorage] Token refreshed successfully');
    return tokens.access_token;
  } catch (error) {
    console.error('[AuthStorage] Token refresh error:', error);
    return null;
  }
}

// ── Public API ──────────────────────────────────────────────────────

export async function saveAuthToken(token: string): Promise<void> {
  await AsyncStorage.setItem(AUTH_TOKEN_KEY(), token);
  console.log('[AuthStorage] Token saved');
}

export async function saveRefreshToken(refreshToken: string): Promise<void> {
  await AsyncStorage.setItem(REFRESH_TOKEN_KEY(), refreshToken);
  console.log('[AuthStorage] Refresh token saved');
}

export async function getRefreshToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(REFRESH_TOKEN_KEY());
  } catch (error) {
    console.error('[AuthStorage] Failed to get refresh token:', error);
    return null;
  }
}

export async function getAuthToken(): Promise<string | null> {
  try {
    const token = await AsyncStorage.getItem(AUTH_TOKEN_KEY());
    if (!token) return null;

    const needsRefresh = await shouldRefreshToken(token);
    if (needsRefresh) {
      console.log('[AuthStorage] Token expiring soon, attempting refresh...');
      const refreshed = await attemptTokenRefresh();
      if (refreshed) return refreshed;
    }

    const isValid = await validateToken(token);
    if (!isValid) {
      console.log('[AuthStorage] Token validation failed, cleared from storage');
      return null;
    }

    return token;
  } catch (error) {
    console.error('[AuthStorage] Failed to get token:', error);
    return null;
  }
}

export async function clearAuthToken(): Promise<void> {
  try {
    await AsyncStorage.removeItem(AUTH_TOKEN_KEY());
    await AsyncStorage.removeItem(REFRESH_TOKEN_KEY());
    await AsyncStorage.removeItem(ID_TOKEN_KEY());
    console.log('[AuthStorage] Tokens cleared (access, refresh, id)');
  } catch (error) {
    console.error('[AuthStorage] Failed to clear token:', error);
    throw error;
  }
}

export async function saveIdToken(idToken: string): Promise<void> {
  await AsyncStorage.setItem(ID_TOKEN_KEY(), idToken);
  console.log('[AuthStorage] ID token saved');
}

export async function getIdToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(ID_TOKEN_KEY());
  } catch (error) {
    console.error('[AuthStorage] Failed to get ID token:', error);
    return null;
  }
}

export async function saveApiUrl(url: string): Promise<void> {
  await AsyncStorage.setItem(API_URL_KEY(), url);
  console.log('[AuthStorage] API URL saved');
}

export async function getApiUrl(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(API_URL_KEY());
  } catch (error) {
    console.error('[AuthStorage] Failed to get API URL:', error);
    return null;
  }
}

export async function isAuthenticated(): Promise<boolean> {
  const token = await getAuthToken();
  if (!token) return false;

  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      await clearAuthToken();
      return false;
    }

    const payload = JSON.parse(atob(parts[1]));
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      await clearAuthToken();
      return false;
    }

    return true;
  } catch (error) {
    console.log('[AuthStorage] Invalid token format, clearing...', error);
    await clearAuthToken();
    return false;
  }
}

export async function getAuthInfo(): Promise<{ email: string; userId: string } | null> {
  const token = await getAuthToken();
  if (!token) return null;

  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = JSON.parse(atob(parts[1]));

    if (!payload.sub || !payload.email) {
      console.warn('[AuthStorage] Token missing required claims, clearing...');
      await clearAuthToken();
      return null;
    }

    return { email: payload.email, userId: payload.sub };
  } catch {
    return null;
  }
}

export async function getUserEmail(): Promise<string | null> {
  const info = await getAuthInfo();
  return info?.email || null;
}

export function appendTokenToUrl(wsUrl: string, token: string): string {
  const separator = wsUrl.includes('?') ? '&' : '?';
  return `${wsUrl}${separator}token=${token}`;
}

export async function getDefaultServerUrl(): Promise<string> {
  try {
    const customDefault = await AsyncStorage.getItem(DEFAULT_SERVER_URL_KEY());
    if (customDefault) return customDefault;
  } catch (error) {
    console.error('[AuthStorage] Failed to get default server URL:', error);
  }
  return getAuthConfig().defaultServerUrl;
}

export async function setDefaultServerUrl(url: string): Promise<void> {
  await AsyncStorage.setItem(DEFAULT_SERVER_URL_KEY(), url);
  console.log('[AuthStorage] Default server URL saved:', url);
}

export async function clearDefaultServerUrl(): Promise<void> {
  await AsyncStorage.removeItem(DEFAULT_SERVER_URL_KEY());
  console.log('[AuthStorage] Default server URL cleared');
}

export async function getEffectiveServerUrl(): Promise<string> {
  const storedUrl = await getApiUrl();
  if (storedUrl) return storedUrl;
  return getDefaultServerUrl();
}

export async function handleUnauthorized(): Promise<void> {
  console.log('[AuthStorage] Received 401 Unauthorized, clearing auth tokens...');
  await clearAuthToken();
}
