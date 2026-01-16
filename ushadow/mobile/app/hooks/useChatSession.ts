/**
 * Use Chat Session Hook
 *
 * Manages chat session state, message sending, and streaming.
 * Handles session persistence and auto-save.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { ChatMessage, ChatStatus, StreamChunk } from '../services/chatApi';
import * as chatApi from '../services/chatApiWrapper';
import {
  loadSession,
  saveSession,
  createNewSession,
  getActiveSessionId,
  setActiveSessionId,
  autoGenerateTitle,
  type ChatSessionData,
} from '../utils/chatStorage';
import { getUserEmail } from '../utils/authStorage';

interface UseChatSessionResult {
  sessionData: ChatSessionData | null;
  messages: ChatMessage[];
  isLoading: boolean;
  isStreaming: boolean;
  error: string | null;
  status: ChatStatus | null;
  sendMessage: (content: string, useMemory: boolean) => Promise<void>;
  loadSessionById: (sessionId: string) => Promise<void>;
  newSession: () => Promise<void>;
  clearError: () => void;
}

export function useChatSession(): UseChatSessionResult {
  const [sessionData, setSessionData] = useState<ChatSessionData | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<ChatStatus | null>(null);

  // Store streaming accumulator
  const streamingContentRef = useRef<string>('');
  const streamingMessageIdRef = useRef<string>('');

  /**
   * Load chat status on mount
   */
  const loadStatus = useCallback(async () => {
    try {
      const chatStatus = await chatApi.getStatus();
      setStatus(chatStatus);
    } catch (err) {
      console.error('[useChatSession] Failed to load status:', err);
      setStatus({
        configured: false,
        provider: null,
        model: null,
        memory_available: false,
        error: err instanceof Error ? err.message : 'Failed to load status',
      });
    }
  }, []);

  /**
   * Load active session or create new one
   */
  const initializeSession = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Try to load active session
      const activeId = await getActiveSessionId();
      if (activeId) {
        const data = await loadSession(activeId);
        if (data) {
          setSessionData(data);
          setMessages(data.messages);
          return;
        }
      }

      // No active session - create new one
      const userEmail = await getUserEmail();
      if (!userEmail) {
        throw new Error('No user email found');
      }

      const newData = await createNewSession(userEmail);
      setSessionData(newData);
      setMessages(newData.messages);
    } catch (err) {
      console.error('[useChatSession] Failed to initialize session:', err);
      setError(err instanceof Error ? err.message : 'Failed to initialize session');
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Load a specific session by ID
   */
  const loadSessionById = useCallback(async (sessionId: string) => {
    try {
      setIsLoading(true);
      setError(null);

      const data = await loadSession(sessionId);
      if (!data) {
        throw new Error('Session not found');
      }

      setSessionData(data);
      setMessages(data.messages);
      await setActiveSessionId(sessionId);
    } catch (err) {
      console.error('[useChatSession] Failed to load session:', err);
      setError(err instanceof Error ? err.message : 'Failed to load session');
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Create a new session
   */
  const newSession = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const userEmail = await getUserEmail();
      if (!userEmail) {
        throw new Error('No user email found');
      }

      const newData = await createNewSession(userEmail);
      setSessionData(newData);
      setMessages(newData.messages);
    } catch (err) {
      console.error('[useChatSession] Failed to create new session:', err);
      setError(err instanceof Error ? err.message : 'Failed to create new session');
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Send a message and stream the response
   */
  const sendMessage = useCallback(
    async (content: string, useMemory: boolean) => {
      if (!sessionData) {
        setError('No active session');
        return;
      }

      try {
        setIsStreaming(true);
        setError(null);

        // Create user message
        const userMessage: ChatMessage = {
          id: `msg_${Date.now()}_user`,
          role: 'user',
          content: content.trim(),
          timestamp: new Date().toISOString(),
        };

        // Add user message to state (optimistic update)
        const updatedMessages = [...messages, userMessage];
        setMessages(updatedMessages);

        // Create streaming assistant message placeholder
        const assistantMessageId = `msg_${Date.now()}_assistant`;
        streamingMessageIdRef.current = assistantMessageId;
        streamingContentRef.current = '';

        const assistantMessage: ChatMessage = {
          id: assistantMessageId,
          role: 'assistant',
          content: '',
          timestamp: new Date().toISOString(),
        };
        setMessages([...updatedMessages, assistantMessage]);

        // Prepare request with full message history
        const request = {
          messages: [...updatedMessages],
          use_memory: useMemory,
        };

        // Stream the response
        for await (const chunk of chatApi.streamChat(request)) {
          if (chunk.type === 'text') {
            // Accumulate content
            streamingContentRef.current += chunk.content;

            // Update message with accumulated content
            setMessages((prev) => {
              const copy = [...prev];
              const lastMsg = copy[copy.length - 1];
              if (lastMsg && lastMsg.id === assistantMessageId) {
                lastMsg.content = streamingContentRef.current;
              }
              return copy;
            });
          } else if (chunk.type === 'finish') {
            // Finalize message with metadata
            setMessages((prev) => {
              const copy = [...prev];
              const lastMsg = copy[copy.length - 1];
              if (lastMsg && lastMsg.id === assistantMessageId) {
                lastMsg.metadata = {
                  finishReason: chunk.finishReason,
                  memoryEnriched: useMemory,
                };
              }
              return copy;
            });
          } else if (chunk.type === 'error') {
            setError(chunk.error);
            // Remove incomplete assistant message on error
            setMessages((prev) => prev.filter((m) => m.id !== assistantMessageId));
            return;
          }
        }

        // Save session after successful message
        const finalMessages = [...updatedMessages, {
          ...assistantMessage,
          content: streamingContentRef.current,
          metadata: {
            memoryEnriched: useMemory,
          },
        }];

        const updatedData: ChatSessionData = {
          session: sessionData.session,
          messages: finalMessages,
        };

        await saveSession(updatedData);

        // Auto-generate title from first user message
        if (sessionData.session.title === 'New Chat' && updatedMessages.length === 1) {
          await autoGenerateTitle(sessionData.session.id);
        }

        // Update session data
        setSessionData(updatedData);
      } catch (err) {
        console.error('[useChatSession] Failed to send message:', err);
        setError(err instanceof Error ? err.message : 'Failed to send message');
      } finally {
        setIsStreaming(false);
        streamingContentRef.current = '';
        streamingMessageIdRef.current = '';
      }
    },
    [sessionData, messages]
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Load status and initialize session on mount
  useEffect(() => {
    const initialize = async () => {
      await loadStatus();
      await initializeSession();
    };
    initialize();
  }, [loadStatus, initializeSession]);

  return {
    sessionData,
    messages,
    isLoading,
    isStreaming,
    error,
    status,
    sendMessage,
    loadSessionById,
    newSession,
    clearError,
  };
}
