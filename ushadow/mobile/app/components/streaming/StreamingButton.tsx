/**
 * StreamingButton.tsx
 *
 * Audio streaming control button with visual feedback.
 * Shows recording state, audio level indicator, and status messages.
 */
import React from 'react';
import {
  TouchableOpacity,
  Text,
  View,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { colors, theme, spacing, borderRadius, fontSize } from '../../theme';

// Brand color shortcut
const brandGreen = colors.primary[400];
const errorRed = colors.error.default;

interface StreamingButtonProps {
  isRecording: boolean;
  isInitializing: boolean;
  isConnecting: boolean;
  isRetrying?: boolean;
  retryCount?: number;
  maxRetries?: number;
  isDisabled: boolean;
  audioLevel: number;
  error: string | null;
  onPress: () => void;
  onCancelRetry?: () => void;
  testID?: string;
}

export const StreamingButton: React.FC<StreamingButtonProps> = ({
  isRecording,
  isInitializing,
  isConnecting,
  isRetrying = false,
  retryCount = 0,
  maxRetries = 5,
  isDisabled,
  audioLevel,
  error,
  onPress,
  onCancelRetry,
  testID = 'streaming-button',
}) => {
  const getButtonStyle = () => {
    if (isRetrying) {
      return [styles.button, styles.buttonRetrying];
    }
    if (isDisabled && !isRecording) {
      return [styles.button, styles.buttonDisabled];
    }
    if (isRecording) {
      return [styles.button, styles.buttonRecording];
    }
    if (isConnecting || isInitializing) {
      return [styles.button, styles.buttonConnecting];
    }
    if (error) {
      return [styles.button, styles.buttonError];
    }
    return [styles.button, styles.buttonIdle];
  };

  const getButtonText = () => {
    if (isRetrying) {
      return 'Cancel Retry';
    }
    if (isInitializing) {
      return 'Initializing...';
    }
    if (isConnecting && !isRetrying) {
      return 'Connecting...';
    }
    if (isRecording) {
      return 'Stop Streaming';
    }
    return 'Start Streaming';
  };

  const handlePress = () => {
    if (isRetrying && onCancelRetry) {
      onCancelRetry();
    } else {
      onPress();
    }
  };

  const getMicrophoneIcon = () => {
    if (isRecording) {
      return '\u{1F3A4}'; // Recording microphone
    }
    return '\u{1F399}'; // Idle microphone
  };

  const isLoading = isInitializing || (isConnecting && !isRetrying);

  // Button is clickable during retry to allow cancellation
  const buttonDisabled = isRetrying ? false : (isDisabled || isLoading);

  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.buttonWrapper}>
        <TouchableOpacity
          style={getButtonStyle()}
          onPress={handlePress}
          disabled={buttonDisabled}
          activeOpacity={0.7}
          testID={`${testID}-touch`}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#fff" testID={`${testID}-loader`} />
          ) : (
            <View style={styles.buttonContent}>
              <Text style={styles.icon}>
                {isRetrying ? '\u{274C}' : getMicrophoneIcon()}
              </Text>
              <Text style={styles.buttonText}>{getButtonText()}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>


      {/* Connecting Message */}
      {isConnecting && !isRetrying && (
        <Text style={styles.connectingText} testID={`${testID}-connecting`}>
          Establishing connection...
        </Text>
      )}

      {/* Retry Message */}
      {isRetrying && (
        <Text style={styles.retryText} testID={`${testID}-retry`}>
          Retrying... ({retryCount}/{maxRetries})
        </Text>
      )}

      {/* Error Message */}
      {error && !isRecording && (
        <Text style={styles.errorText} testID={`${testID}-error`}>
          {error}
        </Text>
      )}

      {/* Disabled Message */}
      {isDisabled && !isRecording && (
        <Text style={styles.disabledText} testID={`${testID}-disabled`}>
          Connect to a leader node first
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  buttonWrapper: {
    alignSelf: 'stretch',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    minHeight: 56,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonIdle: {
    backgroundColor: brandGreen,
  },
  buttonRecording: {
    backgroundColor: errorRed,
  },
  buttonConnecting: {
    backgroundColor: theme.statusConnecting,
  },
  buttonRetrying: {
    backgroundColor: colors.warning.default,
  },
  buttonDisabled: {
    backgroundColor: theme.backgroundInput,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
  },
  buttonError: {
    backgroundColor: theme.statusConnecting,
  },
  buttonText: {
    color: '#fff',
    fontSize: fontSize.lg,
    fontWeight: '600',
    marginLeft: spacing.sm,
  },
  icon: {
    fontSize: fontSize['2xl'],
  },
  statusText: {
    textAlign: 'center',
    marginTop: spacing.sm,
    fontSize: fontSize.xs,
    color: theme.textSecondary,
  },
  connectingText: {
    textAlign: 'center',
    marginTop: spacing.sm,
    fontSize: fontSize.xs,
    color: theme.statusConnecting,
  },
  retryText: {
    textAlign: 'center',
    marginTop: spacing.sm,
    fontSize: fontSize.xs,
    color: colors.warning.default,
    fontWeight: '500',
  },
  errorText: {
    textAlign: 'center',
    marginTop: spacing.sm,
    fontSize: fontSize.xs,
    color: errorRed,
  },
  disabledText: {
    textAlign: 'center',
    marginTop: spacing.sm,
    fontSize: fontSize.xs,
    color: theme.textMuted,
    fontStyle: 'italic',
  },
});

export default StreamingButton;
