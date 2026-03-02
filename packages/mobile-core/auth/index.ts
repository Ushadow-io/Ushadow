/**
 * @ushadow/mobile-core/auth
 *
 * Authentication — Keycloak OAuth, token storage, and monitoring.
 *
 * Setup: call configureAuth() once at app startup before any auth operations.
 *
 *   import { configureAuth, refreshKeycloakToken } from '@ushadow/mobile-core/auth';
 *
 *   configureAuth({
 *     defaultServerUrl: 'https://my.server.com',
 *     oauthScheme: 'myapp',
 *     storagePrefix: '@myapp',
 *     refreshTokenFn: refreshKeycloakToken,
 *   });
 */

// Configuration
export { configureAuth, getAuthConfig } from './authConfig';
export type { AuthConfig } from './authConfig';

// Token storage
export {
  saveAuthToken,
  saveRefreshToken,
  getRefreshToken,
  getAuthToken,
  clearAuthToken,
  saveIdToken,
  getIdToken,
  saveApiUrl,
  getApiUrl,
  isAuthenticated,
  getAuthInfo,
  getUserEmail,
  appendTokenToUrl,
  getDefaultServerUrl,
  setDefaultServerUrl,
  clearDefaultServerUrl,
  getEffectiveServerUrl,
  handleUnauthorized,
} from './authStorage';

// Keycloak OAuth
export {
  getKeycloakConfigFromUnode,
  getKeycloakConfig,
  authenticateWithKeycloak,
  refreshKeycloakToken,
  logoutFromKeycloak,
  isKeycloakAvailable,
} from './keycloakAuth';
export type { KeycloakConfig, KeycloakTokens } from './keycloakAuth';

// Token monitoring hook
export { useTokenMonitor } from './useTokenMonitor';
