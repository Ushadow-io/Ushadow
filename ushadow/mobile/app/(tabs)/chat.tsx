/**
 * Chat Tab - Ushadow Mobile
 *
 * Voice-enabled chat interface with AI assistant.
 * Features:
 * - Voice input with native speech-to-text
 * - Real-time streaming transcription
 * - Streaming AI responses
 * - Message history
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { theme, colors, spacing, borderRadius, fontSize } from '../theme';
import { isAuthenticated } from '../utils/authStorage';
import { VoiceChatInput } from '../components/chat/VoiceChatInput';
import {
  ChatMessage,
  ChatStatus,
  getChatStatus,
  sendStreamingMessage,
  createUserMessage,
  createAssistantMessage,
  generateMessageId,
} from '../services/chatApi';

// Message bubble component
interface MessageBubbleProps {
  message: ChatMessage;
  isStreaming?: boolean;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message, isStreaming }) => {
  const isUser = message.role === 'user';

  return (
    <View
      style={[
        styles.messageBubble,
        isUser ? styles.userBubble : styles.assistantBubble,
      ]}
    >
      {!isUser && (
        <View style={styles.assistantHeader}>
          <Ionicons name="sparkles" size={14} color={colors.primary[400]} />
          <Text style={styles.assistantLabel}>Assistant</Text>
          {isStreaming && (
            <ActivityIndicator
              size="small"
              color={colors.primary[400]}
              style={styles.streamingIndicator}
            />
          )}
        </View>
      )}
      <Text style={[styles.messageText, isUser && styles.userMessageText]}>
        {message.content || (isStreaming ? '...' : '')}
      </Text>
      {message.timestamp && (
        <Text style={styles.messageTime}>
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
      )}
    </View>
  );
};

export default function ChatScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [chatStatus, setChatStatus] = useState<ChatStatus | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const flatListRef = useRef<FlatList>(null);

  // Check authentication and chat status
  const checkStatus = useCallback(async () => {
    try {
      setError(null);
      const loggedIn = await isAuthenticated();
      setIsLoggedIn(loggedIn);

      if (loggedIn) {
        try {
          const status = await getChatStatus();
          setChatStatus(status);
          if (status.error) {
            setError(status.error);
          }
        } catch (err) {
          console.warn('[Chat] Could not get chat status:', err);
          // Chat might still work even if status check fails
        }
      }
    } catch (err) {
      console.error('[Chat] Status check failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  // Refresh status when screen gains focus
  useFocusEffect(
    useCallback(() => {
      checkStatus();
    }, [checkStatus])
  );

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messages.length > 0 && flatListRef.current) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages]);

  // Handle sending a message
  const handleSend = useCallback(
    async (content: string) => {
      if (!content.trim() || isProcessing) return;

      setError(null);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      // Add user message
      const userMessage = createUserMessage(content);
      setMessages((prev) => [...prev, userMessage]);

      // Create placeholder for assistant response
      const assistantMessageId = generateMessageId();
      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setStreamingMessageId(assistantMessageId);
      setIsProcessing(true);

      try {
        // Build request with conversation history (last 10 messages for context)
        const recentMessages = messages.slice(-10).map((m) => ({
          role: m.role,
          content: m.content,
        }));

        await sendStreamingMessage(
          {
            messages: [
              ...recentMessages,
              { role: 'user', content },
            ],
            use_memory: true,
          },
          // onChunk
          (chunk) => {
            if (chunk.type === 'text' && chunk.content) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId
                    ? { ...m, content: m.content + chunk.content }
                    : m
                )
              );
            }
          },
          // onDone
          (fullContent) => {
            console.log('[Chat] Streaming complete, length:', fullContent.length);
            setStreamingMessageId(null);
            setIsProcessing(false);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
          // onError
          (errorMsg) => {
            console.error('[Chat] Streaming error:', errorMsg);
            setError(errorMsg);
            setStreamingMessageId(null);
            setIsProcessing(false);
            // Update message to show error
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessageId
                  ? { ...m, content: `Error: ${errorMsg}` }
                  : m
              )
            );
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          }
        );
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to send message';
        console.error('[Chat] Send error:', errorMsg);
        setError(errorMsg);
        setStreamingMessageId(null);
        setIsProcessing(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    },
    [messages, isProcessing]
  );

  // Clear chat history
  const handleClearChat = useCallback(() => {
    setMessages([]);
    setError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  // Render message item
  const renderMessage = ({ item }: { item: ChatMessage }) => (
    <MessageBubble
      message={item}
      isStreaming={item.id === streamingMessageId}
    />
  );

  // Render empty state
  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      {!isLoggedIn ? (
        <>
          <Ionicons name="log-in-outline" size={48} color={theme.textMuted} />
          <Text style={styles.emptyTitle}>Not Logged In</Text>
          <Text style={styles.emptySubtitle}>
            Log in from the Home tab to use voice chat
          </Text>
        </>
      ) : chatStatus && !chatStatus.configured ? (
        <>
          <Ionicons name="settings-outline" size={48} color={theme.textMuted} />
          <Text style={styles.emptyTitle}>Chat Not Configured</Text>
          <Text style={styles.emptySubtitle}>
            Configure an LLM provider in settings to enable chat
          </Text>
        </>
      ) : (
        <>
          <Ionicons name="chatbubble-ellipses-outline" size={48} color={colors.primary[400]} />
          <Text style={styles.emptyTitle}>Start a Conversation</Text>
          <Text style={styles.emptySubtitle}>
            Tap the mic button and speak, or type your message
          </Text>
          <View style={styles.featureList}>
            <View style={styles.featureItem}>
              <Ionicons name="mic" size={16} color={colors.primary[400]} />
              <Text style={styles.featureText}>Voice input with live transcription</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="flash" size={16} color={colors.primary[400]} />
              <Text style={styles.featureText}>Streaming AI responses</Text>
            </View>
            {chatStatus?.memory_available && (
              <View style={styles.featureItem}>
                <Ionicons name="bulb" size={16} color={colors.primary[400]} />
                <Text style={styles.featureText}>Memory-enhanced context</Text>
              </View>
            )}
          </View>
        </>
      )}
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={theme.background} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary[400]} />
          <Text style={styles.loadingText}>Loading chat...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const chatEnabled = isLoggedIn && (chatStatus?.configured ?? true);

  return (
    <SafeAreaView style={styles.container} testID="chat-screen">
      <StatusBar barStyle="light-content" backgroundColor={theme.background} />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Chat</Text>
          {chatStatus?.provider && (
            <Text style={styles.headerSubtitle}>
              {chatStatus.model || chatStatus.provider}
            </Text>
          )}
        </View>
        {messages.length > 0 && (
          <TouchableOpacity
            style={styles.clearButton}
            onPress={handleClearChat}
            disabled={isProcessing}
          >
            <Ionicons
              name="trash-outline"
              size={20}
              color={isProcessing ? theme.textMuted : theme.textSecondary}
            />
          </TouchableOpacity>
        )}
      </View>

      {/* Error Banner */}
      {error && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={20} color={colors.error.default} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => setError(null)}>
            <Ionicons name="close" size={20} color={colors.error.default} />
          </TouchableOpacity>
        </View>
      )}

      {/* Messages List */}
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id || `msg-${item.timestamp}`}
        contentContainerStyle={[
          styles.messagesList,
          messages.length === 0 && styles.emptyList,
        ]}
        ListEmptyComponent={renderEmptyState}
        showsVerticalScrollIndicator={false}
        testID="messages-list"
      />

      {/* Voice Chat Input */}
      {chatEnabled && (
        <VoiceChatInput
          onSend={handleSend}
          isProcessing={isProcessing}
          placeholder="Tap mic to speak or type..."
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontSize: fontSize['2xl'],
    fontWeight: 'bold',
    color: theme.textPrimary,
  },
  headerSubtitle: {
    fontSize: fontSize.sm,
    color: theme.textSecondary,
    marginTop: spacing.xs,
  },
  clearButton: {
    padding: spacing.sm,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.error.bg,
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
  errorText: {
    color: colors.error.default,
    fontSize: fontSize.sm,
    marginLeft: spacing.sm,
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: theme.textMuted,
    fontSize: fontSize.sm,
    marginTop: spacing.md,
  },
  messagesList: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  emptyList: {
    flex: 1,
    justifyContent: 'center',
  },
  messageBubble: {
    maxWidth: '85%',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
  },
  userBubble: {
    backgroundColor: colors.primary[500],
    alignSelf: 'flex-end',
    borderBottomRightRadius: borderRadius.sm,
  },
  assistantBubble: {
    backgroundColor: theme.backgroundCard,
    alignSelf: 'flex-start',
    borderBottomLeftRadius: borderRadius.sm,
  },
  assistantHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  assistantLabel: {
    color: colors.primary[400],
    fontSize: fontSize.xs,
    fontWeight: '600',
    marginLeft: spacing.xs,
  },
  streamingIndicator: {
    marginLeft: spacing.sm,
  },
  messageText: {
    color: theme.textPrimary,
    fontSize: fontSize.base,
    lineHeight: 22,
  },
  userMessageText: {
    color: '#FFFFFF',
  },
  messageTime: {
    color: theme.textMuted,
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
    alignSelf: 'flex-end',
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: theme.textPrimary,
    marginTop: spacing.lg,
  },
  emptySubtitle: {
    fontSize: fontSize.sm,
    color: theme.textMuted,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  featureList: {
    marginTop: spacing.xl,
    alignSelf: 'stretch',
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.backgroundCard,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
  },
  featureText: {
    color: theme.textSecondary,
    fontSize: fontSize.sm,
    marginLeft: spacing.sm,
  },
});
