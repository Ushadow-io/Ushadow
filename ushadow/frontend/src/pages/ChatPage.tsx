import { useState, useEffect, useRef, useCallback } from 'react'
import { MessageSquare, Send, Loader2, AlertCircle, Brain, Settings, Trash2, Bot, Sparkles } from 'lucide-react'
import { useNavigate, Link } from 'react-router-dom'
import { useTheme } from '../contexts/ThemeContext'
import { chatApi, BACKEND_URL } from '../services/api'
import type { ChatMessage, ChatStatus, Agent } from '../services/api'

interface Message extends ChatMessage {
  id: string
  isStreaming?: boolean
  agentInfo?: {
    type: 'created' | 'triggered'
    agent: Agent
    confidence?: number
  }
}

export default function ChatPage() {
  const { isDark } = useTheme()
  const navigate = useNavigate()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [status, setStatus] = useState<ChatStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [useMemory, setUseMemory] = useState(true)
  const [useAgents, setUseAgents] = useState(true)
  const [lastAgentAction, setLastAgentAction] = useState<{ type: string; agent: Agent } | null>(null)

  // Fetch chat status on mount
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await chatApi.getStatus()
        setStatus(response.data)
      } catch (err) {
        console.error('Failed to fetch chat status:', err)
        setError('Failed to connect to chat service')
      }
    }
    fetchStatus()
  }, [])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`
  }

  const generateId = () => Math.random().toString(36).substring(2, 15)

  // Parse AI SDK data stream format
  const parseStreamChunk = (chunk: string): { type: 'text' | 'agent'; content?: string; agentData?: any } | null => {
    // Format: 0:"content" (text delta)
    if (chunk.startsWith('0:')) {
      try {
        const content = JSON.parse(chunk.slice(2))
        return { type: 'text', content }
      } catch {
        return null
      }
    }
    // Format: a:{type, ...data} (agent event)
    if (chunk.startsWith('a:')) {
      try {
        const agentData = JSON.parse(chunk.slice(2))
        return { type: 'agent', agentData }
      } catch {
        return null
      }
    }
    return null
  }

  const sendMessage = useCallback(async () => {
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      content: input.trim(),
    }

    const assistantMessage: Message = {
      id: generateId(),
      role: 'assistant',
      content: '',
      isStreaming: true,
    }

    setMessages(prev => [...prev, userMessage, assistantMessage])
    setInput('')
    setIsLoading(true)
    setError(null)

    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
    }

    try {
      const allMessages = [...messages, userMessage].map(m => ({
        role: m.role,
        content: m.content,
      }))

      const response = await fetch(`${BACKEND_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('ushadow_token')}`,
        },
        body: JSON.stringify({
          messages: allMessages,
          use_memory: useMemory,
          use_agents: useAgents,
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let fullContent = ''
      let currentAgentInfo: Message['agentInfo'] | undefined = undefined

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const text = decoder.decode(value, { stream: true })
        const lines = text.split('\n').filter(Boolean)

        for (const line of lines) {
          const parsed = parseStreamChunk(line)
          if (parsed) {
            if (parsed.type === 'text' && parsed.content) {
              fullContent += parsed.content
              setMessages(prev => {
                const updated = [...prev]
                const lastMsg = updated[updated.length - 1]
                if (lastMsg && lastMsg.role === 'assistant') {
                  lastMsg.content = fullContent
                  if (currentAgentInfo) {
                    lastMsg.agentInfo = currentAgentInfo
                  }
                }
                return updated
              })
            } else if (parsed.type === 'agent' && parsed.agentData) {
              const agentData = parsed.agentData
              if (agentData.type === 'agent_created') {
                currentAgentInfo = {
                  type: 'created',
                  agent: agentData.agent,
                }
                setLastAgentAction({ type: 'created', agent: agentData.agent })
              } else if (agentData.type === 'agent_triggered') {
                currentAgentInfo = {
                  type: 'triggered',
                  agent: agentData.agent,
                  confidence: agentData.confidence,
                }
                setLastAgentAction({ type: 'triggered', agent: agentData.agent })
              }
            }
          }
        }
      }

      // Mark streaming complete
      setMessages(prev => {
        const updated = [...prev]
        const lastMsg = updated[updated.length - 1]
        if (lastMsg && lastMsg.role === 'assistant') {
          lastMsg.isStreaming = false
        }
        return updated
      })

    } catch (err) {
      console.error('Chat error:', err)
      setError(err instanceof Error ? err.message : 'Failed to send message')
      // Remove the empty assistant message on error
      setMessages(prev => prev.filter(m => m.id !== assistantMessage.id))
    } finally {
      setIsLoading(false)
    }
  }, [input, messages, isLoading, useMemory, useAgents])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const clearChat = () => {
    setMessages([])
    setError(null)
  }

  // Not configured state
  if (status && !status.configured) {
    return (
      <div data-testid="chat-page" className="flex flex-col items-center justify-center h-full p-8">
        <div
          className="rounded-xl p-8 max-w-md text-center"
          style={{
            backgroundColor: isDark ? 'var(--surface-800)' : '#ffffff',
            border: `1px solid ${isDark ? 'var(--surface-500)' : '#e4e4e7'}`,
          }}
        >
          <AlertCircle className="h-12 w-12 mx-auto mb-4 text-warning-400" />
          <h2
            className="text-xl font-semibold mb-2"
            style={{ color: isDark ? 'var(--text-primary)' : '#0f0f13' }}
          >
            LLM Not Configured
          </h2>
          <p
            className="mb-6"
            style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}
          >
            Please configure an LLM provider in settings to use the chat feature.
          </p>
          <button
            data-testid="chat-configure-btn"
            onClick={() => navigate('/settings')}
            className="flex items-center justify-center space-x-2 px-4 py-2 rounded-lg font-medium mx-auto"
            style={{ backgroundColor: '#4ade80', color: '#0f0f13' }}
          >
            <Settings className="h-5 w-5" />
            <span>Configure LLM</span>
          </button>
        </div>
      </div>
    )
  }

  return (
    <div data-testid="chat-page" className="flex flex-col h-full">
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 py-4 border-b"
        style={{
          borderColor: isDark ? 'var(--surface-500)' : '#e4e4e7',
          backgroundColor: isDark ? 'var(--surface-800)' : '#ffffff',
        }}
      >
        <div className="flex items-center space-x-3">
          <MessageSquare className="h-6 w-6" style={{ color: '#a855f7' }} />
          <div>
            <h1
              className="text-xl font-semibold"
              style={{ color: isDark ? 'var(--text-primary)' : '#0f0f13' }}
            >
              Chat
            </h1>
            {status && (
              <p
                className="text-sm"
                style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}
              >
                {status.provider} / {status.model}
                {status.memory_available && (
                  <span className="ml-2 text-primary-400">
                    <Brain className="h-3 w-3 inline mr-1" />
                    Memory
                  </span>
                )}
                {status.agents_available && (
                  <span className="ml-2 text-green-400">
                    <Bot className="h-3 w-3 inline mr-1" />
                    {status.active_agents} agent{status.active_agents !== 1 ? 's' : ''}
                  </span>
                )}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            data-testid="chat-memory-toggle"
            onClick={() => status?.memory_available && setUseMemory(!useMemory)}
            disabled={!status?.memory_available}
            className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              !status?.memory_available
                ? 'bg-surface-700/50 text-text-muted cursor-not-allowed opacity-50'
                : useMemory
                ? 'bg-primary-400/20 text-primary-400'
                : 'bg-surface-700 text-text-secondary hover:bg-surface-600'
            }`}
            title={
              !status?.memory_available
                ? 'Memory service unavailable'
                : useMemory
                ? 'Memory context enabled'
                : 'Memory context disabled'
            }
          >
            <Brain className="h-4 w-4" />
            <span className="hidden sm:inline">Memory</span>
          </button>
          <button
            data-testid="chat-agents-toggle"
            onClick={() => status?.agents_available && setUseAgents(!useAgents)}
            disabled={!status?.agents_available}
            className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              !status?.agents_available
                ? 'bg-surface-700/50 text-text-muted cursor-not-allowed opacity-50'
                : useAgents
                ? 'bg-green-400/20 text-green-400'
                : 'bg-surface-700 text-text-secondary hover:bg-surface-600'
            }`}
            title={
              !status?.agents_available
                ? 'Agent Zero not available'
                : useAgents
                ? 'Agents enabled - describe what you want and I\'ll create an agent'
                : 'Agents disabled'
            }
          >
            <Bot className="h-4 w-4" />
            <span className="hidden sm:inline">Agents</span>
          </button>
          <button
            data-testid="chat-clear-btn"
            onClick={clearChat}
            className="p-2 rounded-lg hover:bg-surface-600 transition-colors"
            style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }}
            title="Clear chat"
          >
            <Trash2 className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto p-4 space-y-4"
        style={{ backgroundColor: isDark ? 'var(--surface-900)' : '#f4f4f5' }}
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <MessageSquare
              className="h-16 w-16 mb-4"
              style={{ color: isDark ? 'var(--surface-500)' : '#a1a1aa' }}
            />
            <h3
              className="text-lg font-medium mb-2"
              style={{ color: isDark ? 'var(--text-primary)' : '#0f0f13' }}
            >
              Start a conversation
            </h3>
            <p style={{ color: isDark ? 'var(--text-secondary)' : '#71717a' }} className="max-w-md">
              Send a message to begin chatting with the AI assistant.
            </p>
            {status?.agents_available && useAgents && (
              <div className="mt-4 p-4 rounded-lg max-w-md" style={{ backgroundColor: isDark ? 'var(--surface-700)' : '#e4e4e7' }}>
                <p className="text-sm flex items-start" style={{ color: isDark ? 'var(--text-secondary)' : '#52525b' }}>
                  <Bot className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0 text-green-400" />
                  <span>
                    <strong className="text-green-400">Tip:</strong> Describe what you want an agent to do, like{' '}
                    <em>"When I am having a book review club, summarize the main plot points and characters"</em>
                  </span>
                </p>
              </div>
            )}
          </div>
        ) : (
          messages.map(message => (
            <div
              key={message.id}
              data-testid={`chat-message-${message.role}`}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                  message.role === 'user'
                    ? 'rounded-br-md'
                    : 'rounded-bl-md'
                }`}
                style={{
                  backgroundColor:
                    message.role === 'user'
                      ? '#a855f7'
                      : isDark
                      ? 'var(--surface-700)'
                      : '#ffffff',
                  color:
                    message.role === 'user'
                      ? '#ffffff'
                      : isDark
                      ? 'var(--text-primary)'
                      : '#0f0f13',
                  border:
                    message.role === 'assistant'
                      ? `1px solid ${isDark ? 'var(--surface-500)' : '#e4e4e7'}`
                      : 'none',
                }}
              >
                {/* Agent badge */}
                {message.agentInfo && (
                  <div className="flex items-center space-x-1 mb-2 text-xs">
                    {message.agentInfo.type === 'created' ? (
                      <span className="flex items-center px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">
                        <Sparkles className="h-3 w-3 mr-1" />
                        Created: {message.agentInfo.agent.name}
                      </span>
                    ) : (
                      <span className="flex items-center px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400">
                        <Bot className="h-3 w-3 mr-1" />
                        {message.agentInfo.agent.name}
                      </span>
                    )}
                  </div>
                )}
                <p className="whitespace-pre-wrap break-words">
                  {message.content || (message.isStreaming && (
                    <span className="inline-flex items-center">
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Thinking...
                    </span>
                  ))}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Error message */}
      {error && (
        <div
          className="px-4 py-2 text-sm flex items-center space-x-2"
          style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}
        >
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Input */}
      <div
        className="p-4 border-t"
        style={{
          borderColor: isDark ? 'var(--surface-500)' : '#e4e4e7',
          backgroundColor: isDark ? 'var(--surface-800)' : '#ffffff',
        }}
      >
        <div className="flex items-end space-x-3">
          <textarea
            ref={inputRef}
            data-testid="chat-input"
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Type a message... (Shift+Enter for new line)"
            disabled={isLoading}
            rows={1}
            className="flex-1 resize-none rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50"
            style={{
              backgroundColor: isDark ? 'var(--surface-700)' : '#f4f4f5',
              color: isDark ? 'var(--text-primary)' : '#0f0f13',
              border: `1px solid ${isDark ? 'var(--surface-500)' : '#e4e4e7'}`,
              minHeight: '44px',
              maxHeight: '200px',
            }}
          />
          <button
            data-testid="chat-send-btn"
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
            className="p-3 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: input.trim() && !isLoading ? '#4ade80' : isDark ? 'var(--surface-600)' : '#e4e4e7',
              color: input.trim() && !isLoading ? '#0f0f13' : isDark ? 'var(--text-muted)' : '#a1a1aa',
            }}
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
