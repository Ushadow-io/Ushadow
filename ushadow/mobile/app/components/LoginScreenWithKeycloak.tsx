/**
 * Login Screen Component with Keycloak Support
 *
 * Uses Keycloak OAuth2 (Authorization Code + PKCE) for authentication.
 * The component auto-detects if Keycloak is available on the backend.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { colors, theme, spacing, borderRadius, fontSize } from '../theme';
import { saveAuthToken, saveRefreshToken, saveIdToken, saveApiUrl, getDefaultServerUrl, setDefaultServerUrl } from '../_utils/authStorage';
import {
  isKeycloakAvailable,
  authenticateWithKeycloak,
  KeycloakTokens,
} from '../services/keycloakAuth';

interface LoginScreenProps {
  visible: boolean;
  onClose: () => void;
  onLoginSuccess: (token: string, apiUrl: string) => void;
  initialApiUrl?: string;
  hostname?: string;  // UNode hostname for fetching Keycloak config
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  visible,
  onClose,
  onLoginSuccess,
  initialApiUrl = '',
  hostname,
}) => {
  const [apiUrl, setApiUrl] = useState(initialApiUrl || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveAsDefault, setSaveAsDefault] = useState(false);

  // Keycloak availability detection
  const [checkingKeycloak, setCheckingKeycloak] = useState(false);
  const [keycloakEnabled, setKeycloakEnabled] = useState<boolean | null>(null);

  // Debug logging
  console.log('[LoginScreen] Props:', { visible, initialApiUrl, hostname });

  // Load the default server URL when modal opens
  useEffect(() => {
    if (visible) {
      console.log('[LoginScreen] Modal opened, initialApiUrl:', initialApiUrl, 'hostname:', hostname);
      if (initialApiUrl) {
        setApiUrl(initialApiUrl);
      } else {
        getDefaultServerUrl().then((defaultUrl) => {
          console.log('[LoginScreen] Loaded default URL:', defaultUrl);
          setApiUrl(defaultUrl);
        });
      }
    }
  }, [visible, initialApiUrl, hostname]);

  // Check if Keycloak is available when API URL changes
  useEffect(() => {
    console.log('[LoginScreen] apiUrl changed:', apiUrl, 'hostname:', hostname);
    if (apiUrl.trim()) {
      checkKeycloakAvailability();
    }
  }, [apiUrl, hostname]);

  const checkKeycloakAvailability = async () => {
    const url = extractBaseUrl(apiUrl);
    if (!url) return;

    setCheckingKeycloak(true);
    try {
      const available = await isKeycloakAvailable(url, hostname);
      setKeycloakEnabled(available);
      console.log('[Login] Keycloak available:', available, hostname ? `(unode: ${hostname})` : '');
    } catch (error) {
      console.error('[Login] Failed to check Keycloak:', error);
      setKeycloakEnabled(false);
    } finally {
      setCheckingKeycloak(false);
    }
  };

  /**
   * Extract base URL from a URL that might contain an API path.
   * Examples:
   * - "https://example.com/api/unodes/Orion/info" -> "https://example.com"
   * - "https://example.com" -> "https://example.com"
   */
  const extractBaseUrl = (url: string): string => {
    const trimmed = url.trim().replace(/\/$/, '');
    // Remove any /api/... path to get the base URL
    return trimmed.replace(/\/api\/.*$/, '');
  };

  const handleKeycloakLogin = async () => {
    const baseUrl = extractBaseUrl(apiUrl);
    if (!baseUrl) {
      setError('Please enter a server URL');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log('[Login] Starting Keycloak authentication...', hostname ? `(unode: ${hostname})` : '');

      const tokens = await authenticateWithKeycloak(baseUrl, hostname);

      if (!tokens || !tokens.access_token) {
        throw new Error('Authentication cancelled or failed');
      }

      console.log('[Login] Keycloak authentication successful');
      console.log('[Login] Received tokens:', {
        hasAccessToken: !!tokens.access_token,
        hasIdToken: !!tokens.id_token,
        hasRefreshToken: !!tokens.refresh_token,
      });

      // Save tokens and API URL
      await saveAuthToken(tokens.access_token);
      if (tokens.refresh_token) {
        await saveRefreshToken(tokens.refresh_token);
        console.log('[Login] Refresh token saved for automatic token refresh');
      } else {
        console.warn('[Login] No refresh token received - token refresh will not work');
      }
      if (tokens.id_token) {
        await saveIdToken(tokens.id_token);
        console.log('[Login] ID token saved for logout');
      } else {
        console.warn('[Login] No ID token received - logout may require additional configuration');
      }
      await saveApiUrl(baseUrl);

      // Optionally save as default server URL
      if (saveAsDefault) {
        await setDefaultServerUrl(baseUrl);
        console.log('[Login] Saved as default server URL');
      }

      // Clear form
      setSaveAsDefault(false);

      // Notify parent
      onLoginSuccess(tokens.access_token, baseUrl);
    } catch (err) {
      console.error('[Login] Keycloak error:', err);
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  // Legacy email/password login removed - Keycloak only

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      testID="login-modal"
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              testID="close-login"
            >
              <Text style={styles.closeButtonText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Login</Text>
            <View style={styles.headerSpacer} />
          </View>

          {/* Form */}
          <View style={styles.form}>
            <Text style={styles.formTitle}>Sign in to Ushadow</Text>
            <Text style={styles.formSubtitle}>
              Enter your server URL to connect to your leader node
            </Text>

            {/* API URL */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Server URL</Text>
              <TextInput
                style={styles.input}
                value={apiUrl}
                onChangeText={setApiUrl}
                placeholder="https://your-server.ts.net"
                placeholderTextColor={theme.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                testID="login-api-url"
              />
              {/* Save as default checkbox */}
              <TouchableOpacity
                style={styles.checkboxRow}
                onPress={() => setSaveAsDefault(!saveAsDefault)}
                testID="login-save-default"
              >
                <View style={[styles.checkbox, saveAsDefault && styles.checkboxChecked]}>
                  {saveAsDefault && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <Text style={styles.checkboxLabel}>Save as default server</Text>
              </TouchableOpacity>
            </View>

            {/* Loading indicator while checking Keycloak */}
            {checkingKeycloak && (
              <View style={styles.checkingContainer}>
                <ActivityIndicator size="small" color={theme.primaryButton} />
                <Text style={styles.checkingText}>Checking authentication methods...</Text>
              </View>
            )}

            {/* Keycloak Login Button */}
            {keycloakEnabled && !checkingKeycloak && (
              <TouchableOpacity
                style={[styles.loginButton, loading && styles.loginButtonDisabled]}
                onPress={handleKeycloakLogin}
                disabled={loading}
                testID="login-keycloak"
              >
                {loading ? (
                  <ActivityIndicator color={theme.primaryButtonText} />
                ) : (
                  <Text style={styles.loginButtonText}>Sign In with Keycloak</Text>
                )}
              </TouchableOpacity>
            )}

            {/* Show message if Keycloak is not available */}
            {keycloakEnabled === false && !checkingKeycloak && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>
                  Keycloak authentication is not available on this server. Please check your server configuration.
                </Text>
              </View>
            )}

            {/* Error */}
            {error && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Help Text */}
            <Text style={styles.helpText}>
              Don't have an account? Scan the QR code from your Ushadow dashboard to connect automatically.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  scrollContent: {
    flexGrow: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: 60,
    paddingBottom: spacing.lg,
    backgroundColor: theme.backgroundCard,
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  closeButton: {
    padding: spacing.sm,
  },
  closeButtonText: {
    color: theme.link,
    fontSize: fontSize.base,
  },
  headerSpacer: {
    width: 60,
  },
  form: {
    padding: spacing.xl,
    flex: 1,
  },
  formTitle: {
    fontSize: fontSize['2xl'],
    fontWeight: '700',
    color: theme.textPrimary,
    marginBottom: spacing.sm,
  },
  formSubtitle: {
    fontSize: fontSize.base,
    color: theme.textSecondary,
    marginBottom: spacing['2xl'],
  },
  inputGroup: {
    marginBottom: spacing.lg,
  },
  inputLabel: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: theme.textSecondary,
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: theme.backgroundInput,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    color: theme.textPrimary,
    fontSize: fontSize.base,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: theme.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  checkboxChecked: {
    backgroundColor: theme.primaryButton,
    borderColor: theme.primaryButton,
  },
  checkmark: {
    color: theme.primaryButtonText,
    fontSize: 12,
    fontWeight: 'bold',
  },
  checkboxLabel: {
    fontSize: fontSize.sm,
    color: theme.textSecondary,
  },
  checkingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  checkingText: {
    color: theme.textSecondary,
    fontSize: fontSize.sm,
    marginLeft: spacing.sm,
  },
  errorContainer: {
    backgroundColor: colors.error.bgSolid,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  errorText: {
    color: colors.error.light,
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  loginButton: {
    backgroundColor: theme.primaryButton,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  loginButtonDisabled: {
    opacity: 0.7,
  },
  loginButtonText: {
    color: theme.primaryButtonText,
    fontSize: fontSize.base,
    fontWeight: '600',
  },
  alternativeButton: {
    padding: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  alternativeButtonText: {
    color: theme.link,
    fontSize: fontSize.sm,
    textDecorationLine: 'underline',
  },
  helpText: {
    fontSize: fontSize.sm,
    color: theme.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default LoginScreen;
