/**
 * Chat Header Component
 *
 * Header with status info, memory toggle, and new chat button.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ChatStatus } from '../../services/chatApi';
import { colors, theme, spacing, borderRadius, fontSize } from '../../theme';

interface ChatHeaderProps {
  status: ChatStatus | null;
  useMemory: boolean;
  onToggleMemory: () => void;
  onNewChat: () => void;
  testID?: string;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  status,
  useMemory,
  onToggleMemory,
  onNewChat,
  testID = 'chat-header',
}) => {
  const configured = status?.configured || false;
  const memoryAvailable = status?.memory_available || false;

  return (
    <View style={styles.container} testID={testID}>
      {/* Title and Status */}
      <View style={styles.titleContainer}>
        <Text style={styles.title}>Chat</Text>
        {configured && status && (
          <Text style={styles.status}>
            {status.model || 'Unknown'} · {status.provider || 'Unknown'}
            {memoryAvailable && useMemory && ' · Memory enabled'}
          </Text>
        )}
        {!configured && (
          <Text style={[styles.status, styles.statusError]}>
            Not configured
          </Text>
        )}
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        {/* Memory Toggle */}
        {memoryAvailable && (
          <TouchableOpacity
            style={[
              styles.iconButton,
              useMemory && styles.iconButtonActive,
            ]}
            onPress={onToggleMemory}
            testID={`${testID}-memory-toggle`}
          >
            <Ionicons
              name={useMemory ? 'bulb' : 'bulb-outline'}
              size={20}
              color={useMemory ? colors.primary[400] : theme.textSecondary}
            />
          </TouchableOpacity>
        )}

        {/* New Chat Button */}
        <TouchableOpacity
          style={styles.iconButton}
          onPress={onNewChat}
          testID={`${testID}-new-chat`}
        >
          <Ionicons
            name="create-outline"
            size={20}
            color={theme.textSecondary}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: theme.backgroundCard,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: theme.textPrimary,
    marginBottom: spacing.xs / 2,
  },
  status: {
    fontSize: fontSize.xs,
    color: theme.textSecondary,
  },
  statusError: {
    color: colors.error.default,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    backgroundColor: theme.backgroundInput,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonActive: {
    backgroundColor: colors.primary[400],
    opacity: 0.2,
  },
});
