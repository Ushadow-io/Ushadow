/**
 * Login Screen Component
 *
 * Manual login fallback when QR code scanning is not available.
 * Authenticates with ushadow backend using email/password.
 *
 * URL Format:
 * - Server URL: https://{tailscale-host} (e.g., https://blue.spangled-kettle.ts.net)
 * - Login endpoint: {serverUrl}/api/auth/login
 * - The login uses JSON POST with username/password
 * - Returns JWT token valid for both ushadow and Chronicle services
 */

import React, { useState } from 'react';
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
import { saveAuthToken, saveApiUrl } from '../utils/authStorage';
import { enableDemoMode } from '../utils/demoModeStorage';
import { MOCK_AUTH_TOKEN, DEMO_UNODE } from '../utils/mockData';
import { getActiveUnodeId, setActiveUnode } from '../utils/unodeStorage';

interface LoginScreenProps {
  visible: boolean;
  onClose: () => void;
  onLoginSuccess: (token: string, apiUrl: string) => void;
  initialApiUrl?: string;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  visible,
  onClose,
  onLoginSuccess,
  initialApiUrl = '',
}) => {
  // Server URL format: https://{tailscale-host}
  // Login will POST to {serverUrl}/api/auth/login
  const [apiUrl, setApiUrl] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Update apiUrl when initialApiUrl changes (from active UNode)
  React.useEffect(() => {
    if (initialApiUrl) {
      setApiUrl(initialApiUrl);
      console.log('[LoginScreen] Updated URL from prop:', initialApiUrl);
    }
  }, [initialApiUrl]);

  const handleDemoMode = async () => {
    setLoading(true);
    setError(null);

    try {
      console.log('[Login] Enabling demo mode');

      // Get current active UNode ID before switching to demo mode
      const currentActiveUnodeId = await getActiveUnodeId();
      console.log('[Login] Current active UNode before demo:', currentActiveUnodeId);

      // Enable demo mode and save previous UNode
      await enableDemoMode(currentActiveUnodeId);

      // Set demo UNode as active (without adding it to storage)
      await setActiveUnode(DEMO_UNODE.id);
      console.log('[Login] Set demo UNode as active');

      // Save demo token and URL
      await saveAuthToken(MOCK_AUTH_TOKEN);
      await saveApiUrl('https://demo.ushadow.io');

      console.log('[Login] Demo mode enabled');

      // Notify parent
      onLoginSuccess(MOCK_AUTH_TOKEN, 'https://demo.ushadow.io');
    } catch (err) {
      console.error('[Login] Demo mode error:', err);
      setError(err instanceof Error ? err.message : 'Failed to enable demo mode');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!apiUrl.trim() || !email.trim() || !password.trim()) {
      setError('Please fill in all fields');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Build login URL (ushadow uses /api/auth/login)
      const baseUrl = apiUrl.trim().replace(/\/$/, '');
      const loginUrl = `${baseUrl}/api/auth/login`;

      console.log('[Login] Attempting login to:', loginUrl);

      // Login request (JSON body)
      const response = await fetch(loginUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email.trim(),
          password: password,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Login] Failed:', response.status, errorText);

        if (response.status === 401 || response.status === 400) {
          throw new Error('Invalid email or password');
        } else if (response.status === 404) {
          throw new Error('Login endpoint not found. Check the API URL.');
        } else {
          throw new Error(`Login failed: ${response.status}`);
        }
      }

      const data = await response.json();
      const token = data.access_token;

      if (!token) {
        throw new Error('No access token received');
      }

      console.log('[Login] Success, token received');

      // Save token and API URL
      await saveAuthToken(token);
      await saveApiUrl(baseUrl);

      // Clear form
      setEmail('');
      setPassword('');

      // Notify parent
      onLoginSuccess(token, baseUrl);
    } catch (err) {
      console.error('[Login] Error:', err);
      setError(err instanceof Error ? err.message : 'Login failed');
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
            <Text style={styles.formTitle}>Sign in to Ushadow</Text>
            <Text style={styles.formSubtitle}>
              Enter your credentials to connect to your leader node
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
            </View>

            {/* Email */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Email</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={theme.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                testID="login-email"
              />
            </View>

            {/* Password */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Password</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="Your password"
                placeholderTextColor={theme.textMuted}
                secureTextEntry
                textContentType="password"
                testID="login-password"
              />
            </View>

            {/* Error */}
            {error && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Login Button */}
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

            {/* Divider */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>OR</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Demo Mode Button */}
            <TouchableOpacity
              style={[styles.demoButton, loading && styles.demoButtonDisabled]}
              onPress={handleDemoMode}
              disabled={loading}
              testID="demo-mode-button"
            >
              <Text style={styles.demoButtonText}>Try Demo Mode</Text>
            </TouchableOpacity>

            {/* Help Text */}
            <Text style={styles.helpText}>
              Don't have an account? Scan the QR code from your Ushadow dashboard to connect automatically.
            </Text>
            <Text style={styles.demoHelpText}>
              Demo mode provides sample data for testing without server connection.
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
  errorContainer: {
    backgroundColor: colors.error.bgSolid,
    padding: spacing.md,
    borderRadius: borderRadius.md,
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
    marginBottom: spacing.xl,
  },
  loginButtonDisabled: {
    opacity: 0.7,
  },
  loginButtonText: {
    color: theme.primaryButtonText,
    fontSize: fontSize.base,
    fontWeight: '600',
  },
  helpText: {
    fontSize: fontSize.sm,
    color: theme.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: theme.border,
  },
  dividerText: {
    marginHorizontal: spacing.md,
    fontSize: fontSize.sm,
    color: theme.textMuted,
  },
  demoButton: {
    backgroundColor: theme.backgroundCard,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.primary[400],
    borderStyle: 'dashed',
  },
  demoButtonDisabled: {
    opacity: 0.7,
  },
  demoButtonText: {
    color: colors.primary[400],
    fontSize: fontSize.base,
    fontWeight: '600',
  },
  demoHelpText: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 16,
  },
});

export default LoginScreen;
