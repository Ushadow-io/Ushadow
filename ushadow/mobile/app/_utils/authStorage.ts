/**
 * Auth Storage — Re-export shim.
 *
 * Source of truth has moved to @ushadow/mobile-core/auth.
 * This file re-exports everything so existing imports keep working.
 */

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
} from '../../../../packages/mobile-core/auth/authStorage';
