/**
 * VoiceChatInput.tsx
 *
 * Voice input component for chat with real-time streaming transcription.
 * Shows live transcript as user speaks, with send/cancel actions.
 *
 * Features:
 * - Press-to-talk button with animated feedback
 * - Real-time streaming transcript display
 * - Volume level visualization
 * - Text editing before send
 * - Keyboard input fallback
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSpeechToText } from '../../hooks/useSpeechToText';
import { theme, colors, spacing, borderRadius, fontSize } from '../../theme';

interface VoiceChatInputProps {
  /** Called when user sends a message */
  onSend: (message: string) => void;
  /** Whether chat is currently processing a response */
  isProcessing?: boolean;
  /** Placeholder text for text input */
  placeholder?: string;
  /** Whether to auto-send when voice recognition ends (default: false) */
  autoSendOnVoiceEnd?: boolean;
}

export const VoiceChatInput: React.FC<VoiceChatInputProps> = ({
  onSend,
  isProcessing = false,
  placeholder = 'Type or tap mic to speak...',
  autoSendOnVoiceEnd = false,
}) => {
  const [inputText, setInputText] = useState('');
  const [isTextMode, setIsTextMode] = useState(false);
  const textInputRef = useRef<TextInput>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const volumeAnim = useRef(new Animated.Value(0)).current;

  const {
    isListening,
    isInitializing,
    partialTranscript,
    volumeLevel,
    error,
    isAvailable,
    startListening,
    stopListening,
    cancelListening,
    clearTranscript,
  } = useSpeechToText({
    onPartialResult: (text) => {
      // Update input text with streaming transcript
      setInputText(text);
    },
    onFinalResult: (text) => {
      setInputText(text);
      if (autoSendOnVoiceEnd && text.trim()) {
        handleSend(text);
      }
    },
    onError: (err) => {
      console.warn('[VoiceChatInput] Speech error:', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
  });

  // Animate volume level
  useEffect(() => {
    Animated.timing(volumeAnim, {
      toValue: volumeLevel / 10,
      duration: 100,
      useNativeDriver: true,
    }).start();
  }, [volumeLevel]);

  // Pulse animation while listening
  useEffect(() => {
    if (isListening) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isListening]);

  const handleSend = useCallback(
    (textToSend?: string) => {
      const message = (textToSend || inputText).trim();
      if (message && !isProcessing) {
        onSend(message);
        setInputText('');
        clearTranscript();
        setIsTextMode(false);
        Keyboard.dismiss();
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    },
    [inputText, isProcessing, onSend, clearTranscript]
  );

  const handleMicPress = useCallback(async () => {
    if (isProcessing) return;

    if (isListening) {
      await stopListening();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else {
      setIsTextMode(false);
      Keyboard.dismiss();
      clearTranscript();
      setInputText('');
      await startListening();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }
  }, [isListening, isProcessing, startListening, stopListening, clearTranscript]);

  const handleCancel = useCallback(async () => {
    if (isListening) {
      await cancelListening();
    }
    setInputText('');
    clearTranscript();
    setIsTextMode(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [isListening, cancelListening, clearTranscript]);

  const handleTextInputFocus = useCallback(() => {
    if (isListening) {
      cancelListening();
    }
    setIsTextMode(true);
  }, [isListening, cancelListening]);

  const hasText = inputText.trim().length > 0;
  const showSendButton = hasText || isListening;
  const micButtonDisabled = isProcessing || isInitializing;

  // Dynamic mic button scale based on volume
  const micScale = volumeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.2],
  });

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <View style={styles.container}>
        {/* Error display */}
        {error && !isListening && (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={14} color={colors.error.default} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Listening indicator with transcript */}
        {(isListening || isInitializing) && (
          <View style={styles.listeningContainer}>
            <View style={styles.listeningHeader}>
              <View style={styles.listeningDot} />
              <Text style={styles.listeningLabel}>
                {isInitializing ? 'Starting...' : 'Listening...'}
              </Text>
            </View>
            {partialTranscript ? (
              <Text style={styles.liveTranscript}>{partialTranscript}</Text>
            ) : (
              <Text style={styles.listeningHint}>Speak now</Text>
            )}
          </View>
        )}

        {/* Input row */}
        <View style={styles.inputRow}>
          {/* Text input */}
          <View style={styles.textInputContainer}>
            <TextInput
              ref={textInputRef}
              style={styles.textInput}
              value={inputText}
              onChangeText={setInputText}
              placeholder={isListening ? 'Listening...' : placeholder}
              placeholderTextColor={theme.textMuted}
              multiline
              maxLength={4000}
              editable={!isProcessing && !isListening}
              onFocus={handleTextInputFocus}
              onSubmitEditing={() => handleSend()}
              returnKeyType="send"
              blurOnSubmit={false}
            />
          </View>

          {/* Action buttons */}
          <View style={styles.actionButtons}>
            {/* Cancel button (shown when has text or listening) */}
            {(hasText || isListening) && (
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={handleCancel}
                disabled={isProcessing}
              >
                <Ionicons
                  name="close-circle"
                  size={24}
                  color={theme.textMuted}
                />
              </TouchableOpacity>
            )}

            {/* Mic/Send button */}
            {showSendButton && hasText ? (
              <TouchableOpacity
                style={[
                  styles.sendButton,
                  isProcessing && styles.buttonDisabled,
                ]}
                onPress={() => handleSend()}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <Ionicons
                    name="hourglass"
                    size={22}
                    color={colors.primary[200]}
                  />
                ) : (
                  <Ionicons
                    name="send"
                    size={22}
                    color={theme.textPrimary}
                  />
                )}
              </TouchableOpacity>
            ) : (
              <Animated.View
                style={[
                  styles.micButtonWrapper,
                  {
                    transform: [
                      { scale: isListening ? Animated.multiply(pulseAnim, micScale) : pulseAnim },
                    ],
                  },
                ]}
              >
                <TouchableOpacity
                  style={[
                    styles.micButton,
                    isListening && styles.micButtonListening,
                    micButtonDisabled && styles.buttonDisabled,
                    !isAvailable && styles.micButtonUnavailable,
                  ]}
                  onPress={handleMicPress}
                  disabled={micButtonDisabled || !isAvailable}
                >
                  <Ionicons
                    name={isListening ? 'mic' : 'mic-outline'}
                    size={24}
                    color={
                      isListening
                        ? colors.error.default
                        : isAvailable
                        ? colors.primary[400]
                        : theme.textMuted
                    }
                  />
                </TouchableOpacity>
              </Animated.View>
            )}
          </View>
        </View>

        {/* Voice unavailable notice */}
        {!isAvailable && (
          <Text style={styles.unavailableText}>
            Voice input not available on this device
          </Text>
        )}
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.background,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.error.bg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.sm,
  },
  errorText: {
    color: colors.error.default,
    fontSize: fontSize.xs,
    marginLeft: spacing.xs,
    flex: 1,
  },
  listeningContainer: {
    backgroundColor: theme.backgroundCard,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  listeningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  listeningDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.error.default,
    marginRight: spacing.sm,
  },
  listeningLabel: {
    color: colors.error.default,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  liveTranscript: {
    color: theme.textPrimary,
    fontSize: fontSize.base,
    lineHeight: 22,
  },
  listeningHint: {
    color: theme.textMuted,
    fontSize: fontSize.sm,
    fontStyle: 'italic',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  textInputContainer: {
    flex: 1,
    backgroundColor: theme.backgroundInput,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 44,
    maxHeight: 120,
  },
  textInput: {
    color: theme.textPrimary,
    fontSize: fontSize.base,
    lineHeight: 20,
    maxHeight: 100,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  cancelButton: {
    padding: spacing.xs,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary[500],
    justifyContent: 'center',
    alignItems: 'center',
  },
  micButtonWrapper: {
    // For animated transform
  },
  micButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.backgroundCard,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.primary[400],
  },
  micButtonListening: {
    backgroundColor: colors.error.bg,
    borderColor: colors.error.default,
  },
  micButtonUnavailable: {
    borderColor: theme.textMuted,
    opacity: 0.5,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  unavailableText: {
    color: theme.textMuted,
    fontSize: fontSize.xs,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});
