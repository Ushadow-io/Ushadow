/**
 * Casdoor OAuth2 Authentication Service
 *
 * Implements Authorization Code + PKCE flow for React Native mobile apps.
 * Uses expo-auth-session for secure OAuth2 authentication.
 *
 * Flow:
 * 1. Fetch Casdoor config from backend API
 * 2. Generate PKCE challenge
 * 3. Open browser to Casdoor login page
 * 4. User authenticates with Casdoor
 * 5. Casdoor redirects back with authorization code
 * 6. Exchange code for access token via backend proxy
 * 7. Store token and use for API requests
 */

import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

// Complete auth session for both platforms
WebBrowser.maybeCompleteAuthSession();

export interface CasdoorConfig {
  enabled: boolean;
  public_url: string;   // Browser-visible URL (e.g., "http://localhost:8082")
  mobile_url?: string;  // Direct Tailscale IP URL for mobile (e.g., "http://100.x.x.x:8082")
  organization: string; // e.g., "ushadow"
  client_id: string;    // e.g., "ushadow"
}

export interface AuthTokens {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
  token_type?: string;
}

/**
 * Fetch Casdoor configuration from a unode.
 *
 * @param backendUrl - The unode's backend URL (e.g., "https://orange.spangled-kettle.ts.net")
 * @param hostname   - The unode's hostname (e.g., "Orion") — preferred for accurate mobile_url
 */
export async function getCasdoorConfigFromUnode(
  backendUrl: string,
  hostname?: string
): Promise<CasdoorConfig | null> {
  try {
    // /{hostname}/info returns auth_config with a correct mobile_url (Tailscale IP).
    // Fall back to /api/settings/config for environments without a known hostname.
    const configUrl = hostname
      ? `${backendUrl}/api/unodes/${hostname}/info`
      : `${backendUrl}/api/settings/config`;

    const response = await Promise.race([
      fetch(configUrl, { headers: { 'Content-Type': 'application/json' } }),
      new Promise<Response>((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout after 10s')), 10000)
      ),
    ]);

    if (!response.ok) {
      if (hostname && response.status === 404) {
        console.warn(`[CasdoorAuth] UNode "${hostname}" not found, falling back to general config`);
        return getCasdoorConfigFromUnode(backendUrl);
      }
      console.warn('[CasdoorAuth] Config endpoint failed:', response.status);
      return null;
    }

    const data = await response.json();

    // /{hostname}/info returns auth_config; /api/settings/config returns { casdoor: {...} }
    const raw = hostname ? data.auth_config : data.casdoor;

    if (!raw?.client_id) {
      console.warn('[CasdoorAuth] No client_id in config response');
      return null;
    }

    const config: CasdoorConfig = {
      enabled: true,
      public_url: raw.public_url ?? '',
      mobile_url: raw.mobile_url || undefined,
      organization: raw.organization ?? '',
      client_id: raw.client_id,
    };

    console.log('[CasdoorAuth] Config:', {
      client_id: config.client_id,
      mobile_url: config.mobile_url,
      public_url: config.public_url,
      source: hostname ? `unode:${hostname}` : 'general',
    });

    return config;
  } catch (error) {
    console.error('[CasdoorAuth] Failed to fetch config:', error);
    return null;
  }
}

/**
 * Generate PKCE code verifier and challenge.
 */
async function generatePKCE() {
  const randomBytes = await Crypto.getRandomBytesAsync(32);
  const codeVerifier = base64UrlEncode(randomBytes);

  const challengeBytes = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    codeVerifier,
    { encoding: Crypto.CryptoEncoding.BASE64 }
  );

  const codeChallenge = challengeBytes
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  return { codeVerifier, codeChallenge };
}

function base64UrlEncode(bytes: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...Array.from(bytes)));
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Authenticate with Casdoor using OAuth2 Authorization Code + PKCE flow.
 *
 * @param backendUrl - The ushadow backend URL
 * @param hostname   - Optional unode hostname for multi-unode environments
 */
export async function authenticateWithCasdoor(
  backendUrl: string,
  hostname?: string
): Promise<AuthTokens | null> {
  try {
    const config = await getCasdoorConfigFromUnode(backendUrl, hostname);

    if (!config) {
      console.log('[CasdoorAuth] Casdoor not available on this backend');
      return null;
    }

    const { client_id } = config;
    // Prefer mobile_url (direct Tailscale IP) for mobile apps
    const casdoor_url = config.mobile_url || config.public_url;

    const { codeVerifier, codeChallenge } = await generatePKCE();
    console.log('[CasdoorAuth] Generated PKCE challenge');

    const discovery = {
      authorizationEndpoint: `${casdoor_url}/login/oauth/authorize`,
      tokenEndpoint: `${casdoor_url}/api/login/oauth/access_token`,
    };

    const redirectUri = AuthSession.makeRedirectUri({
      scheme: 'ushadow',
      path: 'oauth/callback',
      useProxy: false,
    });

    console.log('[CasdoorAuth] Platform:', Platform.OS);
    console.log('[CasdoorAuth] Redirect URI:', redirectUri);
    console.log('[CasdoorAuth] Client ID:', client_id);

    const authRequestParams: AuthSession.AuthRequestConfig = {
      clientId: client_id,
      scopes: ['openid', 'profile', 'email', 'offline_access'],
      redirectUri,
      usePKCE: false,
      extraParams: {
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      },
    };

    const authRequest = new AuthSession.AuthRequest(authRequestParams);

    console.log('[CasdoorAuth] Opening browser for authentication...');

    const browserOptions: AuthSession.AuthSessionOptions = {
      preferEphemeralSession: false,
      showInRecents: false,
    };

    const authResult = await authRequest.promptAsync(discovery, browserOptions);

    console.log('[CasdoorAuth] Auth result type:', authResult.type);

    if (authResult.type !== 'success') {
      console.log('[CasdoorAuth] Auth cancelled or failed:', authResult.type);
      try {
        await WebBrowser.dismissBrowser();
      } catch (e) {
        // Ignore
      }
      return null;
    }

    const { code } = authResult.params;
    if (!code) {
      console.error('[CasdoorAuth] No authorization code received');
      return null;
    }

    console.log('[CasdoorAuth] Authorization code received, exchanging for tokens...');

    // Exchange via backend proxy (keeps client_secret server-side)
    const tokenResponse = await fetch(`${backendUrl}/api/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        code_verifier: codeVerifier,
        redirect_uri: redirectUri,
        client_id,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('[CasdoorAuth] Token exchange failed:', tokenResponse.status, errorText);
      throw new Error(`Token exchange failed: ${tokenResponse.status}`);
    }

    const tokens: AuthTokens = await tokenResponse.json();
    console.log('[CasdoorAuth] Authentication successful');

    return tokens;
  } catch (error) {
    console.error('[CasdoorAuth] Authentication error:', error);
    throw error;
  }
}

/**
 * Refresh access token using refresh token.
 */
export async function refreshCasdoorToken(
  backendUrl: string,
  refreshToken: string
): Promise<AuthTokens | null> {
  try {
    console.log('[CasdoorAuth] Refreshing access token...');

    const response = await fetch(`${backendUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!response.ok) {
      console.error('[CasdoorAuth] Token refresh failed:', response.status);
      return null;
    }

    const tokens: AuthTokens = await response.json();
    console.log('[CasdoorAuth] Token refreshed successfully');
    return tokens;
  } catch (error) {
    console.error('[CasdoorAuth] Token refresh error:', error);
    return null;
  }
}

/**
 * Logout from Casdoor session.
 *
 * @param backendUrl - The ushadow backend URL
 * @param idToken    - The ID token from login (used for id_token_hint)
 * @param hostname   - Optional unode hostname
 */
export async function logoutFromCasdoor(
  backendUrl: string,
  idToken?: string,
  hostname?: string
): Promise<void> {
  try {
    const config = await getCasdoorConfigFromUnode(backendUrl, hostname);

    if (!config) {
      console.log('[CasdoorAuth] No active Casdoor config, skipping logout');
      return;
    }

    const { client_id } = config;
    const casdoor_url = config.mobile_url || config.public_url;

    const redirectUri = AuthSession.makeRedirectUri({
      scheme: 'ushadow',
      path: 'logout/callback',
      useProxy: false,
    });

    const params = new URLSearchParams({
      client_id,
      post_logout_redirect_uri: redirectUri,
    });

    if (idToken) {
      params.append('id_token_hint', idToken);
    }

    const logoutUrl = `${casdoor_url}/login/oauth/logout?${params.toString()}`;

    console.log('[CasdoorAuth] Logging out from Casdoor...');

    await WebBrowser.openAuthSessionAsync(logoutUrl, redirectUri, {
      preferEphemeralSession: true,
      showInRecents: false,
    });

    console.log('[CasdoorAuth] Logged out from Casdoor');
  } catch (error) {
    console.error('[CasdoorAuth] Logout error:', error);
    // Don't throw — local logout still happened
  }
}

/**
 * Check if Casdoor authentication is available for a backend/unode.
 */
export async function isAuthAvailable(
  backendUrl: string,
  hostname?: string
): Promise<boolean> {
  const config = await getCasdoorConfigFromUnode(backendUrl, hostname);
  return !!(config?.client_id && config?.public_url);
}
