/**
 * Login Screen Component
 *
 * Uses Casdoor OAuth2 (Authorization Code + PKCE) for authentication.
 * The component auto-detects if auth is available on the backend.
 */

import React, { useState, useEffect, useRef } from 'react';
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
  isAuthAvailable,
  authenticateWithCasdoor,
  AuthTokens,
} from '../services/casdoorAuth';

interface LoginScreenProps {
  visible: boolean;
  onClose: () => void;
  onLoginSuccess: (token: string, apiUrl: string) => void;
  initialApiUrl?: string;
  hostname?: string;  // UNode hostname for fetching auth config
  autoStartAuth?: boolean;  // Auto-trigger OAuth when auth is detected (e.g. QR scan)
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  visible,
  onClose,
  onLoginSuccess,
  initialApiUrl = '',
  hostname,
  autoStartAuth = false,
}) => {
  const [apiUrl, setApiUrl] = useState(initialApiUrl || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveAsDefault, setSaveAsDefault] = useState(false);

  // Auth availability detection
  const [checkingAuth, setCheckingAuth] = useState(false);
  const [authEnabled, setAuthEnabled] = useState<boolean | null>(null);

  // Guard: only auto-start once per modal open
  const autoStartedRef = useRef(false);

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

  // Check if auth is available when API URL changes
  useEffect(() => {
    console.log('[LoginScreen] apiUrl changed:', apiUrl, 'hostname:', hostname);
    if (apiUrl.trim()) {
      checkAuthAvailability();
    }
  }, [apiUrl, hostname]);

  // Reset auto-start guard when modal closes
  useEffect(() => {
    if (!visible) {
      autoStartedRef.current = false;
    }
  }, [visible]);

  // Auto-start OAuth when triggered by QR scan
  useEffect(() => {
    if (
      autoStartAuth &&
      authEnabled === true &&
      !checkingAuth &&
      !loading &&
      !autoStartedRef.current
    ) {
      autoStartedRef.current = true;
      handleLogin();
    }
  }, [autoStartAuth, authEnabled, checkingAuth, loading]);

  const checkAuthAvailability = async () => {
    const url = extractBaseUrl(apiUrl);
    if (!url) return;

    setCheckingAuth(true);
    try {
      const available = await isAuthAvailable(url, hostname);
      setAuthEnabled(available);
      console.log('[Login] Auth available:', available, hostname ? `(unode: ${hostname})` : '');
    } catch (error) {
      console.error('[Login] Failed to check auth:', error);
      setAuthEnabled(false);
    } finally {
      setCheckingAuth(false);
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

  const handleLogin = async () => {
    const baseUrl = extractBaseUrl(apiUrl);
    if (!baseUrl) {
      setError('Please enter a server URL');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log('[Login] Starting authentication...', hostname ? `(unode: ${hostname})` : '');

      const tokens = await authenticateWithCasdoor(baseUrl, hostname);

      if (!tokens || !tokens.access_token) {
        throw new Error('Authentication cancelled or failed');
      }

      console.log('[Login] Authentication successful');
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
      console.error('[Login] Auth error:', err);
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

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
            <Text style={styles.formTitle}>
              {hostname ? `Sign in to ${hostname}` : 'Sign in to Ushadow'}
            </Text>
            <Text style={styles.formSubtitle}>
              {hostname
                ? extractBaseUrl(initialApiUrl || apiUrl) || 'Checking server…'
                : 'Enter your server URL to connect to your leader node'}
            </Text>

            {/* API URL — only show editable field when not QR-triggered */}
            {!hostname && (
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
            )}

            {/* Loading indicator while checking auth */}
            {checkingAuth && (
              <View style={styles.checkingContainer}>
                <ActivityIndicator size="small" color={theme.primaryButton} />
                <Text style={styles.checkingText}>Checking authentication methods...</Text>
              </View>
            )}

            {/* Login Button */}
            {authEnabled && !checkingAuth && (
              <TouchableOpacity
                style={[styles.loginButton, loading && styles.loginButtonDisabled]}
                onPress={handleLogin}
                disabled={loading}
                testID="login-submit"
              >
                {loading ? (
                  <ActivityIndicator color={theme.primaryButtonText} />
                ) : (
                  <Text style={styles.loginButtonText}>Sign In</Text>
                )}
              </TouchableOpacity>
            )}

            {/* Show message if auth is not available */}
            {authEnabled === false && !checkingAuth && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>
                  Authentication is not available on this server. Please check your server configuration.
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
