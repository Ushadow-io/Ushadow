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
const REFRESH_TOKEN_KEY = '@ushadow_refresh_token';
const ID_TOKEN_KEY = '@ushadow_id_token';
const API_URL_KEY = '@ushadow_api_url';
const DEFAULT_SERVER_URL_KEY = '@ushadow_default_server_url';

/**
 * Validate a JWT token (expiration and required claims)
 * @returns true if valid, false if expired/invalid (and clears token)
 */
async function validateToken(token: string): Promise<boolean> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      console.log('[AuthStorage] Invalid token format');
      await clearAuthToken();
      return false;
    }

    const payload = JSON.parse(atob(parts[1]));

    // Check expiration
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      console.log('[AuthStorage] Token expired');
      await clearAuthToken();
      return false;
    }

    // Check required claims for Keycloak tokens
    if (payload.iss && payload.iss.includes('/realms/')) {
      // It's a Keycloak token - validate required claims
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

/**
 * Check if token should be refreshed (expires within 5 minutes)
 */
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

/**
 * Attempt to refresh the access token using the refresh token
 * @returns New access token if successful, null if failed
 */
async function attemptTokenRefresh(): Promise<string | null> {
  try {
    const refreshToken = await AsyncStorage.getItem(REFRESH_TOKEN_KEY);
    const apiUrl = await getApiUrl();

    if (!refreshToken || !apiUrl) {
      console.log('[AuthStorage] Missing refresh token or API URL for refresh');
      return null;
    }

    // Import the Keycloak refresh function
    const { refreshKeycloakToken } = await import('../services/keycloakAuth');

    const tokens = await refreshKeycloakToken(apiUrl, refreshToken);

    if (!tokens || !tokens.access_token) {
      console.error('[AuthStorage] Token refresh failed');
      // Don't clear tokens yet - let validation handle it
      return null;
    }

    // Save new tokens
    await AsyncStorage.setItem(AUTH_TOKEN_KEY, tokens.access_token);
    if (tokens.refresh_token) {
      await AsyncStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token);
    }
    if (tokens.id_token) {
      await AsyncStorage.setItem(ID_TOKEN_KEY, tokens.id_token);
    }

    console.log('[AuthStorage] ✅ Token refreshed successfully');
    return tokens.access_token;
  } catch (error) {
    console.error('[AuthStorage] Token refresh error:', error);
    return null;
  }
}

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
 * Store the refresh token
 */
export async function saveRefreshToken(refreshToken: string): Promise<void> {
  try {
    await AsyncStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    console.log('[AuthStorage] Refresh token saved');
  } catch (error) {
    console.error('[AuthStorage] Failed to save refresh token:', error);
    throw error;
  }
}

/**
 * Get the stored refresh token
 */
export async function getRefreshToken(): Promise<string | null> {
  try {
    const token = await AsyncStorage.getItem(REFRESH_TOKEN_KEY);
    return token;
  } catch (error) {
    console.error('[AuthStorage] Failed to get refresh token:', error);
    return null;
  }
}

/**
 * Get the stored auth token (with automatic refresh if expiring soon)
 */
export async function getAuthToken(): Promise<string | null> {
  try {
    const token = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) return null;

    // Check if token needs refresh (expires within 5 minutes)
    const needsRefresh = await shouldRefreshToken(token);
    if (needsRefresh) {
      console.log('[AuthStorage] Token expiring soon, attempting refresh...');
      const refreshed = await attemptTokenRefresh();
      if (refreshed) {
        return refreshed; // Return fresh token
      }
      // Refresh failed, continue with validation
    }

    // Validate token and clear if expired/invalid
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

/**
 * Remove the stored auth token (logout)
 */
export async function clearAuthToken(): Promise<void> {
  try {
    await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
    await AsyncStorage.removeItem(REFRESH_TOKEN_KEY);
    await AsyncStorage.removeItem(ID_TOKEN_KEY);
    console.log('[AuthStorage] Tokens cleared (access, refresh, id)');
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
    if (parts.length !== 3) {
      console.log('[AuthStorage] Invalid token format, clearing...');
      await clearAuthToken();
      return false;
    }

    const payload = JSON.parse(atob(parts[1]));
    const exp = payload.exp;

    if (exp && Date.now() / 1000 > exp) {
      console.log('[AuthStorage] Token expired, clearing...');
      // CRITICAL: Clear expired token to force re-authentication
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

    // Validate that required claims exist
    if (!payload.sub || !payload.email) {
      console.warn('[AuthStorage] Token missing required claims (sub or email), clearing...');
      await clearAuthToken();
      return null;
    }

    return {
      email: payload.email,
      userId: payload.sub,
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

/**
 * Handle 401 Unauthorized responses by clearing auth tokens.
 * This forces the user to re-authenticate with Keycloak.
 *
 * Usage: if (response.status === 401) handleUnauthorized();
 */
export async function handleUnauthorized(): Promise<void> {
  console.log('[AuthStorage] Received 401 Unauthorized, clearing auth tokens...');
  await clearAuthToken();
}
