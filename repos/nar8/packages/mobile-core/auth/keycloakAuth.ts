/**
 * Keycloak OAuth2 Authentication Service
 *
 * Portable version: URL scheme is injected via getAuthConfig().oauthScheme.
 *
 * Implements Authorization Code + PKCE flow for React Native mobile apps.
 * Uses expo-auth-session for secure OAuth2 authentication.
 *
 * Extracted from ushadow/mobile/app/services/keycloakAuth.ts
 */

import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { getAuthConfig } from './authConfig';

WebBrowser.maybeCompleteAuthSession();

export interface KeycloakConfig {
  enabled: boolean;
  public_url: string;
  mobile_url?: string;
  realm: string;
  frontend_client_id: string;
  mobile_client_id: string;
  backend_client_id: string;
}

export interface KeycloakTokens {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
  token_type?: string;
}

/**
 * Fetch Keycloak configuration from a unode.
 */
export async function getKeycloakConfigFromUnode(
  backendUrl: string,
  hostname?: string
): Promise<KeycloakConfig | null> {
  try {
    const configUrl = hostname
      ? `${backendUrl}/api/unodes/${hostname}/info`
      : `${backendUrl}/api/keycloak/config`;

    const response = await Promise.race([
      fetch(configUrl, { headers: { 'Content-Type': 'application/json' } }),
      new Promise<Response>((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout after 10s')), 10000)
      ),
    ]);

    if (!response.ok) {
      if (hostname && response.status === 404) {
        console.warn(`[Keycloak] UNode "${hostname}" not found, falling back to general config`);
        return getKeycloakConfigFromUnode(backendUrl);
      }
      console.warn('[Keycloak] Config endpoint failed:', response.status);
      return null;
    }

    const data = await response.json();
    const raw = hostname ? data.keycloak_config : data;

    if (!raw?.realm) {
      console.warn('[Keycloak] No realm in config response');
      return null;
    }

    const resolveUrl = (url: string): string => {
      if (!url || hostname) return url;
      if (url.includes('localhost') || url.includes('127.0.0.1')) {
        const kcPort = new URL(url).port || '8081';
        return `http://${new URL(backendUrl).hostname}:${kcPort}`;
      }
      return url;
    };

    const config: KeycloakConfig = {
      enabled: true,
      public_url: resolveUrl(raw.public_url ?? ''),
      mobile_url: raw.mobile_url ? resolveUrl(raw.mobile_url) : undefined,
      realm: raw.realm,
      frontend_client_id: raw.frontend_client_id || 'ushadow-frontend',
      mobile_client_id: raw.mobile_client_id || 'ushadow-mobile',
      backend_client_id: raw.backend_client_id || '',
    };

    console.log('[Keycloak] Config:', {
      realm: config.realm,
      mobile_url: config.mobile_url,
      public_url: config.public_url,
      source: hostname ? `unode:${hostname}` : 'general',
    });

    return config;
  } catch (error) {
    console.error('[Keycloak] Failed to fetch config:', error);
    return null;
  }
}

/** @deprecated Use getKeycloakConfigFromUnode() instead */
export async function getKeycloakConfig(backendUrl: string): Promise<KeycloakConfig | null> {
  return getKeycloakConfigFromUnode(backendUrl);
}

// ── PKCE helpers ────────────────────────────────────────────────────

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
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ── Core auth flow ──────────────────────────────────────────────────

/**
 * Authenticate with Keycloak using OAuth2 Authorization Code + PKCE flow.
 */
export async function authenticateWithKeycloak(
  backendUrl: string,
  hostname?: string
): Promise<KeycloakTokens | null> {
  try {
    const config = await getKeycloakConfigFromUnode(backendUrl, hostname);
    if (!config) {
      console.log('[Keycloak] Keycloak not available on this backend');
      return null;
    }

    const { realm, mobile_client_id } = config;
    const keycloak_url = config.mobile_url || config.public_url;
    const scheme = getAuthConfig().oauthScheme;

    const { codeVerifier, codeChallenge } = await generatePKCE();
    console.log('[Keycloak] Generated PKCE challenge');

    const discovery = {
      authorizationEndpoint: `${keycloak_url}/realms/${realm}/protocol/openid-connect/auth`,
      tokenEndpoint: `${keycloak_url}/realms/${realm}/protocol/openid-connect/token`,
    };

    const redirectUri = AuthSession.makeRedirectUri({
      scheme,
      path: 'oauth/callback',
      useProxy: false,
    });

    console.log('[Keycloak] ========== OAuth Flow Debug ==========');
    console.log('[Keycloak] Platform:', Platform.OS);
    console.log('[Keycloak] Redirect URI:', redirectUri);
    console.log('[Keycloak] Scheme:', scheme);
    console.log('[Keycloak] Using DEDICATED MOBILE CLIENT:', mobile_client_id);

    const authRequestParams: AuthSession.AuthRequestConfig = {
      clientId: mobile_client_id,
      scopes: ['openid', 'profile', 'email', 'offline_access'],
      redirectUri,
      usePKCE: false,
      extraParams: {
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      },
    };

    const authRequest = new AuthSession.AuthRequest(authRequestParams);

    console.log('[Keycloak] Opening browser for authentication...');

    try {
      const authUrl = await authRequest.makeAuthUrlAsync(discovery);
      console.log('[Keycloak] Built authorization URL:', authUrl);
    } catch (error) {
      console.error('[Keycloak] Failed to build auth URL:', error);
    }

    const browserOptions: AuthSession.AuthSessionOptions = {
      preferEphemeralSession: false,
      showInRecents: false,
    };

    const authResult = await authRequest.promptAsync(discovery, browserOptions);

    console.log('[Keycloak] Auth result type:', authResult.type);

    if (authResult.type !== 'success') {
      console.log('[Keycloak] Auth cancelled or failed:', authResult.type);
      try { await WebBrowser.dismissBrowser(); } catch {}
      return null;
    }

    const { code } = authResult.params;
    if (!code) {
      console.error('[Keycloak] No authorization code received');
      return null;
    }

    console.log('[Keycloak] Authorization code received, exchanging for tokens...');

    const tokenResponse = await fetch(`${backendUrl}/api/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        code_verifier: codeVerifier,
        redirect_uri: redirectUri,
        client_id: mobile_client_id,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('[Keycloak] Token exchange failed:', tokenResponse.status, errorText);
      throw new Error(`Token exchange failed: ${tokenResponse.status}`);
    }

    const tokens: KeycloakTokens = await tokenResponse.json();
    console.log('[Keycloak] Authentication successful');
    return tokens;
  } catch (error) {
    console.error('[Keycloak] Authentication error:', error);
    throw error;
  }
}

/**
 * Refresh access token using refresh token.
 */
export async function refreshKeycloakToken(
  backendUrl: string,
  refreshToken: string
): Promise<KeycloakTokens | null> {
  try {
    console.log('[Keycloak] Refreshing access token...');

    const response = await fetch(`${backendUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!response.ok) {
      console.error('[Keycloak] Token refresh failed:', response.status);
      return null;
    }

    const tokens: KeycloakTokens = await response.json();
    console.log('[Keycloak] Token refreshed successfully');
    return tokens;
  } catch (error) {
    console.error('[Keycloak] Token refresh error:', error);
    return null;
  }
}

/**
 * Logout from Keycloak session.
 */
export async function logoutFromKeycloak(
  backendUrl: string,
  idToken?: string,
  hostname?: string
): Promise<void> {
  try {
    const config = await getKeycloakConfigFromUnode(backendUrl, hostname);
    if (!config) {
      console.log('[Keycloak] No active Keycloak config, skipping logout');
      return;
    }

    const { realm, mobile_client_id } = config;
    const keycloak_url = config.mobile_url || config.public_url;
    const scheme = getAuthConfig().oauthScheme;

    const redirectUri = AuthSession.makeRedirectUri({
      scheme,
      path: 'logout/callback',
      useProxy: false,
    });

    const params = new URLSearchParams({
      client_id: mobile_client_id,
      post_logout_redirect_uri: redirectUri,
    });

    if (idToken) {
      params.append('id_token_hint', idToken);
    } else {
      console.warn('[Keycloak] No id_token provided — logout may fail');
    }

    const logoutUrl = `${keycloak_url}/realms/${realm}/protocol/openid-connect/logout?${params.toString()}`;

    console.log('[Keycloak] Logging out from Keycloak session...');

    await WebBrowser.openAuthSessionAsync(logoutUrl, redirectUri, {
      preferEphemeralSession: true,
      showInRecents: false,
    });

    console.log('[Keycloak] Logged out from Keycloak');
  } catch (error) {
    console.error('[Keycloak] Logout error:', error);
  }
}

/**
 * Check if Keycloak is available for a backend/unode.
 */
export async function isKeycloakAvailable(
  backendUrl: string,
  hostname?: string
): Promise<boolean> {
  const config = await getKeycloakConfigFromUnode(backendUrl, hostname);
  return !!(config?.realm);
}
