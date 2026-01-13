/**
 * Chat Message Component
 *
 * Renders a single message bubble (user or assistant).
 * User messages: right-aligned purple bubble
 * Assistant messages: left-aligned card with memory indicator
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ChatMessage as ChatMessageType } from '../../services/chatApi';
import { colors, theme, spacing, borderRadius, fontSize } from '../../theme';

interface ChatMessageProps {
  message: ChatMessageType;
  testID?: string;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message, testID }) => {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';

  // Format timestamp
  const timeStr = new Date(message.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <View
      style={[styles.container, isUser && styles.containerUser]}
      testID={testID || `chat-message-${message.role}`}
    >
      <View
        style={[
          styles.bubble,
          isUser && styles.bubbleUser,
          isAssistant && styles.bubbleAssistant,
        ]}
      >
        <Text
          style={[
            styles.content,
            isUser && styles.contentUser,
            isAssistant && styles.contentAssistant,
          ]}
        >
          {message.content}
        </Text>

        {/* Memory indicator for assistant messages */}
        {isAssistant && message.metadata?.memoryEnriched && (
          <View style={styles.memoryIndicator}>
            <Ionicons name="bulb" size={12} color={colors.primary[400]} />
            <Text style={styles.memoryText}>Memory enriched</Text>
          </View>
        )}

        {/* Timestamp */}
        <Text
          style={[
            styles.timestamp,
            isUser && styles.timestampUser,
            isAssistant && styles.timestampAssistant,
          ]}
        >
          {timeStr}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  containerUser: {
    alignItems: 'flex-end',
  },
  bubble: {
    maxWidth: '80%',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
  },
  bubbleUser: {
    backgroundColor: colors.accent[500],
    borderBottomRightRadius: borderRadius.sm,
  },
  bubbleAssistant: {
    backgroundColor: theme.backgroundCard,
    borderWidth: 1,
    borderColor: theme.border,
    borderBottomLeftRadius: borderRadius.sm,
  },
  content: {
    fontSize: fontSize.base,
    lineHeight: fontSize.base * 1.5,
  },
  contentUser: {
    color: colors.white,
  },
  contentAssistant: {
    color: theme.textPrimary,
  },
  memoryIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  memoryText: {
    fontSize: fontSize.xs,
    color: theme.textMuted,
    fontStyle: 'italic',
  },
  timestamp: {
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
  },
  timestampUser: {
    color: colors.white,
    opacity: 0.7,
    textAlign: 'right',
  },
  timestampAssistant: {
    color: theme.textMuted,
  },
});
