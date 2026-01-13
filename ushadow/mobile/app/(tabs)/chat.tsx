/**
 * Chat Tab - Ushadow Mobile
 *
 * AI-powered chat interface with memory-enriched conversations.
 * Supports streaming responses, local session persistence, and demo mode.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Keyboard,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors, theme, spacing, borderRadius, fontSize } from '../theme';
import { ChatHeader } from '../components/chat/ChatHeader';
import { ChatMessage } from '../components/chat/ChatMessage';
import { ChatInput } from '../components/chat/ChatInput';
import { StreamingIndicator } from '../components/chat/StreamingIndicator';
import { useChatSession } from '../hooks/useChatSession';
import { isAuthenticated } from '../utils/authStorage';
import { isDemoMode } from '../utils/demoModeStorage';
import { loadPreferences, savePreferences } from '../utils/chatStorage';

export default function ChatScreen() {
  // Auth & demo state
  const [authenticated, setAuthenticated] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  // Chat state from hook
  const {
    sessionData,
    messages,
    isLoading,
    isStreaming,
    error,
    status,
    sendMessage,
    newSession,
    clearError,
  } = useChatSession();

  // UI state
  const [inputText, setInputText] = useState('');
  const [useMemory, setUseMemory] = useState(true);

  // Refs
  const scrollViewRef = useRef<ScrollView>(null);
  const messagesEndRef = useRef<View>(null);

  // Load auth state and preferences on mount
  useEffect(() => {
    const initialize = async () => {
      try {
        const [auth, demo, prefs] = await Promise.all([
          isAuthenticated(),
          isDemoMode(),
          loadPreferences(),
        ]);

        setAuthenticated(auth);
        setDemoMode(demo);
        setUseMemory(prefs.useMemory);
      } catch (err) {
        console.error('[Chat] Failed to initialize:', err);
      } finally {
        setAuthLoading(false);
      }
    };

    initialize();
  }, []);

  // Refresh on focus (tab switch)
  useFocusEffect(
    useCallback(() => {
      const refresh = async () => {
        const [auth, demo] = await Promise.all([
          isAuthenticated(),
          isDemoMode(),
        ]);

        setAuthenticated(auth);
        setDemoMode(demo);
      };

      refresh();
    }, [])
  );

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages]);

  // Scroll when keyboard opens
  useEffect(() => {
    const keyboardListener = Keyboard.addListener('keyboardDidShow', () => {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    });

    return () => keyboardListener.remove();
  }, []);

  // Save memory preference when changed
  useEffect(() => {
    const save = async () => {
      const prefs = await loadPreferences();
      prefs.useMemory = useMemory;
      await savePreferences(prefs);
    };
    save();
  }, [useMemory]);

  // Handle send message
  const handleSend = useCallback(async () => {
    if (inputText.trim() && !isStreaming) {
      const text = inputText.trim();
      setInputText('');
      Keyboard.dismiss();
      await sendMessage(text, useMemory);
    }
  }, [inputText, isStreaming, useMemory, sendMessage]);

  // Handle new chat
  const handleNewChat = useCallback(async () => {
    await newSession();
    setInputText('');
  }, [newSession]);

  // Handle memory toggle
  const handleToggleMemory = useCallback(() => {
    setUseMemory((prev) => !prev);
  }, []);

  // Render empty state
  const renderEmptyState = () => (
    <View style={styles.emptyState} testID="chat-empty-state">
      <Ionicons
        name="chatbubble-ellipses-outline"
        size={64}
        color={theme.textMuted}
      />
      <Text style={styles.emptyTitle}>Start a conversation</Text>
      <Text style={styles.emptySubtitle}>
        Ask questions about your memories and conversations
      </Text>
      {status?.memory_available && (
        <View style={styles.memoryHint}>
          <Ionicons name="bulb" size={16} color={colors.primary[400]} />
          <Text style={styles.memoryHintText}>
            Memory context enabled - I can remember past conversations
          </Text>
        </View>
      )}
    </View>
  );

  // Render error banner
  const renderErrorBanner = () => {
    if (!error) return null;

    return (
      <View style={styles.errorBanner} testID="chat-error-banner">
        <View style={styles.errorContent}>
          <Ionicons name="alert-circle" size={20} color={colors.error.default} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
        <TouchableOpacity
          style={styles.errorClose}
          onPress={clearError}
          testID="chat-error-close"
        >
          <Ionicons name="close" size={20} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>
    );
  };

  // Show login prompt if not authenticated
  if (!authLoading && !authenticated) {
    return (
      <SafeAreaView style={styles.container} testID="chat-auth-required">
        <StatusBar barStyle="light-content" backgroundColor={theme.background} />
        <View style={styles.authRequired}>
          <Ionicons
            name="lock-closed-outline"
            size={64}
            color={theme.textMuted}
          />
          <Text style={styles.authRequiredTitle}>Authentication Required</Text>
          <Text style={styles.authRequiredText}>
            Please sign in to use the chat feature
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Show loading state
  if (authLoading || isLoading) {
    return (
      <SafeAreaView style={styles.container} testID="chat-loading">
        <StatusBar barStyle="light-content" backgroundColor={theme.background} />
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading chat...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} testID="chat-screen">
      <StatusBar barStyle="light-content" backgroundColor={theme.background} />

      {/* Header */}
      <ChatHeader
        status={status}
        useMemory={useMemory}
        onToggleMemory={handleToggleMemory}
        onNewChat={handleNewChat}
      />

      {/* Demo Mode Banner */}
      {demoMode && (
        <View style={styles.demoBanner} testID="chat-demo-banner">
          <Ionicons name="information-circle" size={16} color={colors.primary[400]} />
          <Text style={styles.demoBannerText}>
            Demo Mode - AI responses simulated
          </Text>
        </View>
      )}

      {/* Error Banner */}
      {renderErrorBanner()}

      {/* Messages */}
      <KeyboardAvoidingView
        style={styles.chatContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          ref={scrollViewRef}
          style={styles.messagesContainer}
          contentContainerStyle={styles.messagesContent}
          keyboardShouldPersistTaps="handled"
        >
          {messages.length === 0 ? (
            renderEmptyState()
          ) : (
            <>
              {messages.map((message) => (
                <ChatMessage key={message.id} message={message} />
              ))}
              {isStreaming && (
                <View style={styles.streamingContainer}>
                  <StreamingIndicator />
                </View>
              )}
              <View ref={messagesEndRef} style={styles.messagesEnd} />
            </>
          )}
        </ScrollView>

        {/* Input */}
        <ChatInput
          value={inputText}
          onChange={setInputText}
          onSend={handleSend}
          disabled={isStreaming || !status?.configured}
          placeholder={
            !status?.configured
              ? 'Chat not configured'
              : isStreaming
              ? 'Waiting for response...'
              : 'Type a message...'
          }
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: fontSize.base,
    color: theme.textSecondary,
  },
  authRequired: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  authRequiredTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: theme.textPrimary,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  authRequiredText: {
    fontSize: fontSize.base,
    color: theme.textSecondary,
    textAlign: 'center',
  },
  demoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.success.bgSolid,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.primary[400],
  },
  demoBannerText: {
    fontSize: fontSize.xs,
    color: colors.primary[400],
    fontWeight: '600',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.error.bgSolid,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.error.default,
  },
  errorContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  errorText: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.error.light,
  },
  errorClose: {
    padding: spacing.xs,
  },
  chatContainer: {
    flex: 1,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  streamingContainer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  messagesEnd: {
    height: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing['3xl'],
  },
  emptyTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: theme.textPrimary,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    fontSize: fontSize.base,
    color: theme.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  memoryHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary[400],
    opacity: 0.1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
  },
  memoryHintText: {
    fontSize: fontSize.xs,
    color: colors.primary[400],
  },
});