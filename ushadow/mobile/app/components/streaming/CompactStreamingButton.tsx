/**
 * CompactStreamingButton.tsx
 *
 * Compact rectangular button overlaid on waveform for starting streams.
 * Shows minimal visual feedback when idle/disabled.
 */
import React from 'react';
import {
  TouchableOpacity,
  Text,
  View,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, theme, spacing, borderRadius } from '../../theme';

interface CompactStreamingButtonProps {
  isInitializing: boolean;
  isConnecting: boolean;
  isDisabled: boolean;
  error: string | null;
  onPress: () => void;
  testID?: string;
  disabledReason?: string; // Optional custom disabled message
}

export const CompactStreamingButton: React.FC<CompactStreamingButtonProps> = ({
  isInitializing,
  isConnecting,
  isDisabled,
  error,
  onPress,
  testID = 'compact-streaming-button',
  disabledReason,
}) => {
  const getButtonStyle = () => {
    if (isDisabled && !isConnecting) {
      return [styles.button, styles.buttonDisabled];
    }
    if (isConnecting || isInitializing) {
      return [styles.button, styles.buttonConnecting];
    }
    if (error) {
      return [styles.button, styles.buttonError];
    }
    return [styles.button, styles.buttonIdle];
  };

  const isLoading = isInitializing || isConnecting;
  const buttonDisabled = isDisabled || isLoading;

  const handlePress = () => {
    console.log('[CompactStreamingButton] Button pressed', {
      isDisabled,
      isLoading,
      buttonDisabled,
    });
    onPress();
  };

  return (
    <View style={styles.container} testID={testID}>
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
          <>
            <Ionicons
              name="radio-button-on"
              size={20}
              color="#fff"
              testID={`${testID}-record-icon`}
            />
            <Text style={styles.buttonText}>Start</Text>
          </>
        )}
      </TouchableOpacity>

      {/* Status message below button */}
      {isConnecting && (
        <Text style={styles.statusText} testID={`${testID}-connecting`}>
          Connecting...
        </Text>
      )}
      {error && !isConnecting && (
        <Text style={styles.errorText} testID={`${testID}-error`}>
          {error}
        </Text>
      )}
      {isDisabled && !isConnecting && (
        <Text style={styles.disabledText} testID={`${testID}-disabled`}>
          {disabledReason || 'Configure destination'}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: spacing.sm,
    pointerEvents: 'auto', // Ensure container receives touch events
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    minWidth: 140,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  buttonIdle: {
    backgroundColor: colors.accent[400], // Purple/ushadow brand color
  },
  buttonConnecting: {
    backgroundColor: colors.accent[300],
  },
  buttonDisabled: {
    backgroundColor: theme.backgroundInput,
    borderWidth: 2,
    borderColor: theme.borderStrong,
    shadowOpacity: 0.1,
  },
  buttonError: {
    backgroundColor: colors.error.default,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  statusText: {
    fontSize: 12,
    color: theme.statusConnecting,
    fontWeight: '500',
  },
  errorText: {
    fontSize: 12,
    color: colors.error.default,
    fontWeight: '500',
  },
  disabledText: {
    fontSize: 12,
    color: theme.textMuted,
  },
});

export default CompactStreamingButton;
