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
import { colors, theme, spacing, borderRadius, fontSize } from '../theme';

// Brand color shortcut
const brandGreen = colors.primary[400];
const errorRed = colors.error.default;

interface StreamingButtonProps {
  isRecording: boolean;
  isInitializing: boolean;
  isConnecting: boolean;
  isDisabled: boolean;
  audioLevel: number;
  error: string | null;
  onPress: () => void;
  testID?: string;
}

const StreamingButton: React.FC<StreamingButtonProps> = ({
  isRecording,
  isInitializing,
  isConnecting,
  isDisabled,
  audioLevel,
  error,
  onPress,
  testID = 'streaming-button',
}) => {
  const getButtonStyle = () => {
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
    if (isInitializing) {
      return 'Initializing...';
    }
    if (isConnecting) {
      return 'Connecting...';
    }
    if (isRecording) {
      return 'Stop Streaming';
    }
    return 'Start Streaming';
  };

  const getMicrophoneIcon = () => {
    if (isRecording) {
      return '\u{1F3A4}'; // Recording microphone
    }
    return '\u{1F399}'; // Idle microphone
  };

  const isLoading = isInitializing || isConnecting;

  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.buttonWrapper}>
        <TouchableOpacity
          style={getButtonStyle()}
          onPress={onPress}
          disabled={isDisabled || isLoading}
          activeOpacity={0.7}
          testID={`${testID}-touch`}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#fff" testID={`${testID}-loader`} />
          ) : (
            <View style={styles.buttonContent}>
              <Text style={styles.icon}>{getMicrophoneIcon()}</Text>
              <Text style={styles.buttonText}>{getButtonText()}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Audio Level Indicator */}
      {isRecording && (
        <View style={styles.audioLevelContainer} testID={`${testID}-audio-level`}>
          <View style={styles.audioLevelBackground}>
            <View
              style={[
                styles.audioLevelBar,
                { width: `${Math.min(audioLevel * 100, 100)}%` },
              ]}
            />
          </View>
          <Text style={styles.audioLevelText}>Audio Level</Text>
        </View>
      )}

      {/* Status Message */}
      {isRecording && (
        <Text style={styles.statusText} testID={`${testID}-status`}>
          Streaming audio to server...
        </Text>
      )}

      {/* Connecting Message */}
      {isConnecting && (
        <Text style={styles.connectingText} testID={`${testID}-connecting`}>
          Establishing connection...
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
  audioLevelContainer: {
    marginTop: spacing.md,
    alignItems: 'center',
  },
  audioLevelBackground: {
    width: '100%',
    height: 4,
    backgroundColor: theme.backgroundInput,
    borderRadius: 2,
    overflow: 'hidden',
  },
  audioLevelBar: {
    height: '100%',
    backgroundColor: brandGreen,
    borderRadius: 2,
  },
  audioLevelText: {
    marginTop: spacing.xs,
    fontSize: 10,
    color: theme.textMuted,
  },
});

export default StreamingButton;
