/**
 * @ushadow/mobile-core/auth
 *
 * Authentication — provider-agnostic OIDC, token storage, and monitoring.
 *
 * Setup: call configureAuth() once at app startup before any auth operations.
 *
 *   import { configureAuth, refreshToken } from '@ushadow/mobile-core/auth';
 *
 *   configureAuth({
 *     defaultServerUrl: 'https://my.server.com',
 *     oauthScheme: 'myapp',
 *     storagePrefix: '@myapp',
 *     refreshTokenFn: refreshToken,
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

// OIDC Authentication (provider-agnostic)
export {
  authenticate,
  refreshToken,
  logout,
  isOidcAvailable,
  getOidcConfig,
  fetchOidcDiscovery,
  clearDiscoveryCache,
} from './oidcAuth';
export type { OidcProviderConfig, OidcDiscovery, OidcTokens } from './oidcAuth';

// Legacy Keycloak OAuth (retained for backward compatibility)
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

// Profile screen
export { ProfileScreen } from './ProfileScreen';
export type { ProfileTheme, ProfileScreenProps } from './ProfileScreen';
