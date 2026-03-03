/**
 * OIDC Authentication — Provider-agnostic OAuth2/OpenID Connect.
 *
 * Works with any OIDC-compliant provider (Keycloak, Authentik, Auth0, etc.)
 * by using standard OIDC Discovery to resolve endpoints dynamically.
 *
 * The mobile app never talks to the provider's token endpoint directly —
 * it gets the auth code from the browser then sends it to the backend
 * (/api/auth/token) which proxies the exchange. This keeps secrets server-side.
 */

import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { getAuthConfig } from './authConfig';

WebBrowser.maybeCompleteAuthSession();

// ── Types ───────────────────────────────────────────────────────────

/** Provider config returned by /api/auth/config or /api/unodes/{hostname}/info */
export interface OidcProviderConfig {
  /** OIDC issuer URL (e.g. https://auth.example.com/application/o/ushadow/) */
  issuer_url: string;
  /** OAuth client ID for this app */
  client_id: string;
  /** Optional display name for the provider (e.g. "Authentik", "Keycloak") */
  provider_name?: string;
}

/** Standard OIDC Discovery document (subset of fields we use) */
export interface OidcDiscovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
  end_session_endpoint?: string;
  jwks_uri: string;
}

/** Token response from the backend proxy */
export interface OidcTokens {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
  token_type?: string;
}

// ── Discovery cache ─────────────────────────────────────────────────

const _discoveryCache = new Map<string, { doc: OidcDiscovery; fetchedAt: number }>();
const DISCOVERY_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Fetch OIDC Discovery document for an issuer.
 * Cached for 10 minutes per issuer URL.
 */
export async function fetchOidcDiscovery(issuerUrl: string): Promise<OidcDiscovery> {
  const normalised = issuerUrl.replace(/\/+$/, '');
  const cached = _discoveryCache.get(normalised);

  if (cached && Date.now() - cached.fetchedAt < DISCOVERY_TTL_MS) {
    return cached.doc;
  }

  const wellKnownUrl = `${normalised}/.well-known/openid-configuration`;
  console.log('[OIDC] Fetching discovery from:', wellKnownUrl);

  const response = await Promise.race([
    fetch(wellKnownUrl, { headers: { Accept: 'application/json' } }),
    new Promise<Response>((_, reject) =>
      setTimeout(() => reject(new Error('OIDC discovery timeout (10s)')), 10000)
    ),
  ]);

  if (!response.ok) {
    throw new Error(`OIDC discovery failed: ${response.status} ${response.statusText}`);
  }

  const doc: OidcDiscovery = await response.json();

  if (!doc.authorization_endpoint || !doc.token_endpoint) {
    throw new Error('OIDC discovery document missing required endpoints');
  }

  console.log('[OIDC] Discovery OK:', {
    issuer: doc.issuer,
    authorization_endpoint: doc.authorization_endpoint,
    end_session_endpoint: doc.end_session_endpoint ? 'present' : 'absent',
  });

  _discoveryCache.set(normalised, { doc, fetchedAt: Date.now() });
  return doc;
}

/** Clear the discovery cache (e.g. on logout or provider change). */
export function clearDiscoveryCache(): void {
  _discoveryCache.clear();
}

// ── Fetch provider config from backend ──────────────────────────────

/**
 * Fetch OIDC provider configuration from the backend.
 *
 * Tries /api/unodes/{hostname}/info first (QR-scan path), then /api/auth/config.
 */
export async function getOidcConfig(
  backendUrl: string,
  hostname?: string
): Promise<OidcProviderConfig | null> {
  try {
    // Path 1: unode-specific config
    if (hostname) {
      const infoUrl = `${backendUrl}/api/unodes/${hostname}/info`;
      console.log('[OIDC] Fetching config from unode:', infoUrl);

      const response = await Promise.race([
        fetch(infoUrl, { headers: { 'Content-Type': 'application/json' } }),
        new Promise<Response>((_, reject) =>
          setTimeout(() => reject(new Error('Request timeout (10s)')), 10000)
        ),
      ]);

      if (response.ok) {
        const data = await response.json();

        // New style: oidc_config
        if (data.oidc_config?.issuer_url && data.oidc_config?.client_id) {
          console.log('[OIDC] Got config from unode oidc_config');
          return data.oidc_config;
        }

        // Legacy: keycloak_config → synthesize OIDC config
        if (data.keycloak_config?.realm) {
          const kc = data.keycloak_config;
          const kcUrl = kc.mobile_url || kc.public_url;
          return {
            issuer_url: `${kcUrl}/realms/${kc.realm}`,
            client_id: kc.mobile_client_id || kc.frontend_client_id,
            provider_name: 'Keycloak',
          };
        }
      } else if (response.status === 404) {
        console.warn(`[OIDC] UNode "${hostname}" not found, trying generic config`);
      }
    }

    // Path 2: generic auth config
    const configUrl = `${backendUrl}/api/auth/config`;
    console.log('[OIDC] Fetching config from:', configUrl);

    const response = await Promise.race([
      fetch(configUrl, { headers: { 'Content-Type': 'application/json' } }),
      new Promise<Response>((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout (10s)')), 10000)
      ),
    ]);

    if (!response.ok) {
      // Fallback: try legacy /api/keycloak/config
      return await getOidcConfigFromLegacyKeycloak(backendUrl);
    }

    const data = await response.json();
    if (data.issuer_url && data.client_id) {
      console.log('[OIDC] Got config from /api/auth/config');
      return data;
    }

    return null;
  } catch (error) {
    console.error('[OIDC] Failed to fetch provider config:', error);
    return null;
  }
}

/** Backward compat: synthesize OidcProviderConfig from legacy /api/keycloak/config */
async function getOidcConfigFromLegacyKeycloak(
  backendUrl: string
): Promise<OidcProviderConfig | null> {
  try {
    const response = await fetch(`${backendUrl}/api/keycloak/config`, {
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) return null;

    const kc = await response.json();
    if (!kc.realm || !kc.public_url) return null;

    console.log('[OIDC] Synthesized config from legacy /api/keycloak/config');
    return {
      issuer_url: `${kc.public_url}/realms/${kc.realm}`,
      client_id: kc.frontend_client_id,
      provider_name: 'Keycloak',
    };
  } catch {
    return null;
  }
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
 * Check if an OIDC provider is available for a given backend.
 */
export async function isOidcAvailable(
  backendUrl: string,
  hostname?: string
): Promise<boolean> {
  const config = await getOidcConfig(backendUrl, hostname);
  return config !== null;
}

/**
 * Authenticate using OIDC Authorization Code + PKCE flow.
 *
 * 1. Fetches provider config from backend
 * 2. Fetches OIDC discovery to get authorization_endpoint
 * 3. Opens browser for user login
 * 4. Sends auth code to backend /api/auth/token for server-side exchange
 */
export async function authenticate(
  backendUrl: string,
  hostname?: string
): Promise<OidcTokens | null> {
  try {
    // 1. Get provider config
    const providerConfig = await getOidcConfig(backendUrl, hostname);
    if (!providerConfig) {
      console.log('[OIDC] No OIDC provider available');
      return null;
    }

    // 2. Fetch OIDC discovery
    const discovery = await fetchOidcDiscovery(providerConfig.issuer_url);
    const scheme = getAuthConfig().oauthScheme;

    // 3. Generate PKCE
    const { codeVerifier, codeChallenge } = await generatePKCE();
    console.log('[OIDC] Generated PKCE challenge');

    const redirectUri = AuthSession.makeRedirectUri({
      scheme,
      path: 'oauth/callback',
      useProxy: false,
    });

    console.log('[OIDC] ========== OAuth Flow ==========');
    console.log('[OIDC] Provider:', providerConfig.provider_name || 'OIDC');
    console.log('[OIDC] Platform:', Platform.OS);
    console.log('[OIDC] Redirect URI:', redirectUri);
    console.log('[OIDC] Client ID:', providerConfig.client_id);
    console.log('[OIDC] Authorization endpoint:', discovery.authorization_endpoint);

    const authRequestParams: AuthSession.AuthRequestConfig = {
      clientId: providerConfig.client_id,
      scopes: ['openid', 'profile', 'email', 'offline_access'],
      redirectUri,
      usePKCE: false, // We handle PKCE manually for cross-provider compat
      extraParams: {
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      },
    };

    const authRequest = new AuthSession.AuthRequest(authRequestParams);

    // 4. Open browser
    const authResult = await authRequest.promptAsync(
      {
        authorizationEndpoint: discovery.authorization_endpoint,
        tokenEndpoint: discovery.token_endpoint,
      },
      {
        preferEphemeralSession: false,
        showInRecents: false,
      }
    );

    console.log('[OIDC] Auth result type:', authResult.type);

    if (authResult.type !== 'success') {
      console.log('[OIDC] Auth cancelled or failed:', authResult.type);
      try { await WebBrowser.dismissBrowser(); } catch {}
      return null;
    }

    const { code } = authResult.params;
    if (!code) {
      console.error('[OIDC] No authorization code received');
      return null;
    }

    // 5. Exchange code via backend proxy
    console.log('[OIDC] Authorization code received, exchanging via backend...');

    const tokenResponse = await fetch(`${backendUrl}/api/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        code_verifier: codeVerifier,
        redirect_uri: redirectUri,
        client_id: providerConfig.client_id,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('[OIDC] Token exchange failed:', tokenResponse.status, errorText);
      throw new Error(`Token exchange failed: ${tokenResponse.status}`);
    }

    const tokens: OidcTokens = await tokenResponse.json();
    console.log('[OIDC] Authentication successful');
    return tokens;
  } catch (error) {
    console.error('[OIDC] Authentication error:', error);
    throw error;
  }
}

// ── Token refresh ───────────────────────────────────────────────────

/**
 * Refresh access token via the backend proxy.
 */
export async function refreshToken(
  backendUrl: string,
  refreshTokenValue: string
): Promise<OidcTokens | null> {
  try {
    console.log('[OIDC] Refreshing access token...');

    const response = await fetch(`${backendUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshTokenValue }),
    });

    if (!response.ok) {
      console.error('[OIDC] Token refresh failed:', response.status);
      return null;
    }

    const tokens: OidcTokens = await response.json();
    console.log('[OIDC] Token refreshed successfully');
    return tokens;
  } catch (error) {
    console.error('[OIDC] Token refresh error:', error);
    return null;
  }
}

// ── Logout ──────────────────────────────────────────────────────────

/**
 * Logout from the OIDC provider session.
 *
 * Uses the end_session_endpoint from OIDC discovery (works for any provider).
 * Falls back to local-only logout if end_session_endpoint is not available.
 */
export async function logout(
  backendUrl: string,
  idToken?: string,
  hostname?: string
): Promise<void> {
  try {
    const providerConfig = await getOidcConfig(backendUrl, hostname);
    if (!providerConfig) {
      console.log('[OIDC] No provider config, skipping provider logout');
      return;
    }

    const discovery = await fetchOidcDiscovery(providerConfig.issuer_url);

    if (!discovery.end_session_endpoint) {
      console.log('[OIDC] Provider has no end_session_endpoint, skipping provider logout');
      return;
    }

    const scheme = getAuthConfig().oauthScheme;
    const redirectUri = AuthSession.makeRedirectUri({
      scheme,
      path: 'logout/callback',
      useProxy: false,
    });

    const params = new URLSearchParams({
      client_id: providerConfig.client_id,
      post_logout_redirect_uri: redirectUri,
    });

    if (idToken) {
      params.append('id_token_hint', idToken);
    } else {
      console.warn('[OIDC] No id_token provided — logout may fail');
    }

    const logoutUrl = `${discovery.end_session_endpoint}?${params.toString()}`;
    console.log('[OIDC] Logging out from provider session...');

    await WebBrowser.openAuthSessionAsync(logoutUrl, redirectUri, {
      preferEphemeralSession: true,
      showInRecents: false,
    });

    // Clear cached discovery on logout
    clearDiscoveryCache();
    console.log('[OIDC] Logged out from provider');
  } catch (error) {
    console.error('[OIDC] Logout error:', error);
  }
}
