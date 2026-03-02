/**
 * Keycloak Auth — Re-export shim.
 *
 * Source of truth has moved to @ushadow/mobile-core/auth.
 * This file re-exports everything so existing imports keep working.
 */

export {
  getKeycloakConfigFromUnode,
  getKeycloakConfig,
  authenticateWithKeycloak,
  refreshKeycloakToken,
  logoutFromKeycloak,
  isKeycloakAvailable,
} from '../../../../packages/mobile-core/auth/keycloakAuth';

export type {
  KeycloakConfig,
  KeycloakTokens,
} from '../../../../packages/mobile-core/auth/keycloakAuth';
