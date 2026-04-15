/**
 * Auth configuration — injectable settings for multi-app support.
 *
 * Each app calls `configureAuth()` once at startup to provide its
 * app-specific values (URL scheme, default server URL, storage key prefix).
 */

export interface AuthConfig {
  /** Default server URL when none is stored (e.g. 'https://ushadow.wolf-tawny.ts.net'). */
  defaultServerUrl: string;
  /** URL scheme for OAuth redirects (e.g. 'ushadow', 'nar8'). */
  oauthScheme: string;
  /** AsyncStorage key prefix — prevents cross-app collision (e.g. '@ushadow', '@nar8'). */
  storagePrefix: string;
  /** Token refresh function. Injected to break circular dependency with keycloakAuth. */
  refreshTokenFn?: (backendUrl: string, refreshToken: string) => Promise<{
    access_token: string;
    refresh_token?: string;
    id_token?: string;
  } | null>;
}

let _config: AuthConfig = {
  defaultServerUrl: '',
  oauthScheme: 'ushadow',
  storagePrefix: '@ushadow',
};

/**
 * Initialise auth configuration. Call once at app startup before any auth operations.
 */
export function configureAuth(config: Partial<AuthConfig>): void {
  _config = { ..._config, ...config };
}

/**
 * Get current auth configuration.
 */
export function getAuthConfig(): AuthConfig {
  return _config;
}
