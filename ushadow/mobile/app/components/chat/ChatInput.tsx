/**
 * Chat Input Component
 *
 * Multi-line text input with auto-resize and send button.
 * Supports Enter to send (mobile keyboard limitation handled).
 */

import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, theme, spacing, borderRadius, fontSize } from '../../theme';

interface ChatInputProps {
  value: string;
  onChange: (text: string) => void;
  onSend: () => void;
  disabled?: boolean;
  placeholder?: string;
  testID?: string;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  value,
  onChange,
  onSend,
  disabled = false,
  placeholder = 'Type a message...',
  testID = 'chat-input',
}) => {
  const [inputHeight, setInputHeight] = useState(44);

  const canSend = value.trim().length > 0 && !disabled;

  const handleContentSizeChange = (event: any) => {
    const newHeight = Math.min(
      Math.max(44, event.nativeEvent.contentSize.height),
      120 // Max 5 lines approximately
    );
    setInputHeight(newHeight);
  };

  const handleSend = () => {
    if (canSend) {
      onSend();
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.inputContainer}>
        <TextInput
          style={[styles.input, { height: Math.max(44, inputHeight) }]}
          value={value}
          onChangeText={onChange}
          onContentSizeChange={handleContentSizeChange}
          placeholder={placeholder}
          placeholderTextColor={theme.textMuted}
          multiline
          editable={!disabled}
          autoCorrect
          autoCapitalize="sentences"
          keyboardAppearance="dark"
          returnKeyType="default"
          blurOnSubmit={false}
          testID={testID}
        />
        <TouchableOpacity
          style={[styles.sendButton, canSend && styles.sendButtonActive]}
          onPress={handleSend}
          disabled={!canSend}
          testID={`${testID}-send-button`}
        >
          <Ionicons
            name="arrow-up"
            size={24}
            color={canSend ? theme.background : theme.textMuted}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: theme.background,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    backgroundColor: theme.backgroundInput,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    paddingTop: Platform.OS === 'ios' ? spacing.sm + 2 : spacing.sm,
    color: theme.textPrimary,
    fontSize: fontSize.base,
    minHeight: 44,
    maxHeight: 120,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.backgroundInput,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonActive: {
    backgroundColor: colors.primary[400],
  },
});
