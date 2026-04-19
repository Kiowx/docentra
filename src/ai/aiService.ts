import { v4 as uuidv4 } from 'uuid'
import { useSpreadsheetStore } from '@/store/useSpreadsheetStore'
import type { AIConfig, ChatMessage, ToolCallResult } from '@/types'
import { systemPrompt, systemPromptWithoutTools } from './systemPrompt'
import { executeTool } from './toolExecutor'
import { OpenAICompatibleProvider } from './openaiProvider'
import { AnthropicProvider } from './anthropicProvider'
import type { AIProvider } from './provider'
import { resolveApiKey, resolveBaseUrl } from './providerUtils'

let currentAbortController: AbortController | null = null

interface TokenBatcher {
  push: (token: string) => void
  flush: () => void
  cancel: () => void
}

interface ProviderMessage {
  role: 'user' | 'assistant'
  content: string
}

interface ContextLimits {
  maxMessages: number
  maxBytes: number
  maxMessageChars: number
  maxLatestUserChars: number
  summaryMaxBytes: number
}

const DEFAULT_CONTEXT_LIMITS: ContextLimits = {
  maxMessages: 16,
  maxBytes: 12000,
  maxMessageChars: 1800,
  maxLatestUserChars: 3200,
  summaryMaxBytes: 1600,
}

function getContextLimits(config: AIConfig): ContextLimits {
  if (config.toolMode === 'none') {
    return {
      maxMessages: 18,
      maxBytes: config.provider === 'claude' ? 14000 : 15000,
      maxMessageChars: 2200,
      maxLatestUserChars: 3600,
      summaryMaxBytes: 1800,
    }
  }

  if (config.provider === 'claude') {
    return {
      maxMessages: 14,
      maxBytes: 10000,
      maxMessageChars: 1600,
      maxLatestUserChars: 3000,
      summaryMaxBytes: 1400,
    }
  }

  if (config.toolMode === 'auto') {
    return {
      maxMessages: 12,
      maxBytes: 8500,
      maxMessageChars: 1400,
      maxLatestUserChars: 2800,
      summaryMaxBytes: 1200,
    }
  }

  return DEFAULT_CONTEXT_LIMITS
}

function measureBytes(value: string): number {
  return new TextEncoder().encode(value).length
}

function measureMessageBytes(message: ProviderMessage): number {
  return measureBytes(JSON.stringify(message))
}

function compactWhitespace(content: string): string {
  return content
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function truncateMiddle(content: string, maxChars: number): string {
  if (content.length <= maxChars) return content
  const head = Math.max(200, Math.floor(maxChars * 0.55))
  const tail = Math.max(120, maxChars - head - 18)
  return `${content.slice(0, head)}\n...[历史已压缩]...\n${content.slice(-tail)}`
}

function compactMessageContent(
  message: ChatMessage,
  maxChars: number,
): string {
  const compacted = compactWhitespace(message.content)
  if (!compacted) return ''
  return truncateMiddle(compacted, maxChars)
}

function summarizeDroppedMessages(
  droppedMessages: ProviderMessage[],
  summaryMaxBytes: number,
): ProviderMessage | null {
  if (droppedMessages.length === 0) return null

  const summaryLines = ['Earlier conversation summary (compressed):']
  const recentDroppedMessages = droppedMessages.slice(-6)

  for (const message of recentDroppedMessages) {
    const label = message.role === 'user' ? 'User' : 'Assistant'
    const snippet = truncateMiddle(compactWhitespace(message.content), 180).replace(/\n/g, ' ')
    if (!snippet) continue
    const nextLine = `- ${label}: ${snippet}`
    const candidate = [...summaryLines, nextLine].join('\n')
    if (measureBytes(candidate) > summaryMaxBytes) {
      break
    }
    summaryLines.push(nextLine)
  }

  if (summaryLines.length === 1) {
    return null
  }

  return {
    role: 'assistant',
    content: summaryLines.join('\n'),
  }
}

function createProvider(config: AIConfig): AIProvider {
  const isClaude = config.provider === 'claude'
  const baseUrl = resolveBaseUrl(config)

  if (isClaude) {
    return new AnthropicProvider({
      apiKey: config.apiKey,
      model: config.model,
      baseUrl,
      systemPrompt: config.toolMode === 'none' ? systemPromptWithoutTools : systemPrompt,
      toolMode: config.toolMode,
    })
  }

  return new OpenAICompatibleProvider({
    apiKey: resolveApiKey(config),
    model: config.model,
    baseUrl,
    systemPrompt: config.toolMode === 'none' ? systemPromptWithoutTools : systemPrompt,
    toolMode: config.toolMode,
  })
}

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return true
  }

  if (error instanceof Error) {
    return error.name === 'AbortError' || error.message.toLowerCase().includes('aborted')
  }

  return false
}

export function stopCurrentMessage(): void {
  currentAbortController?.abort()
}

function createTokenBatcher(
  assistantMsgId: string,
  sessionId: string,
): TokenBatcher {
  let buffer = ''
  let frameId: number | null = null

  const flush = () => {
    if (!buffer) return
    const chunk = buffer
    buffer = ''
    frameId = null
    useSpreadsheetStore.getState().appendMessageContent(assistantMsgId, chunk, sessionId)
  }

  return {
    push(token: string) {
      buffer += token
      if (frameId !== null) return
      frameId = window.requestAnimationFrame(flush)
    },
    flush() {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId)
        frameId = null
      }
      flush()
    },
    cancel() {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId)
        frameId = null
      }
      buffer = ''
    },
  }
}

function buildProviderMessages(
  chatHistory: ChatMessage[],
  assistantMsgId: string,
  config: AIConfig,
): ProviderMessage[] {
  const limits = getContextLimits(config)
  const relevantMessages = chatHistory
    .filter((message) => message.id !== assistantMsgId)
    .filter((message): message is ChatMessage & { role: 'user' | 'assistant' } => (
      message.role === 'user' || message.role === 'assistant'
    ))
    .map((message, index, messages) => {
      const isLatestUserMessage = message.role === 'user'
        && index === messages.map((item) => item.role).lastIndexOf('user')
      const maxChars = isLatestUserMessage ? limits.maxLatestUserChars : limits.maxMessageChars
      return {
      role: message.role,
      content: compactMessageContent(message, maxChars),
    }})
    .filter((message) => message.content.length > 0)

  const selectedMessages: ProviderMessage[] = []
  let totalBytes = 0
  let startIndex = relevantMessages.length

  for (let index = relevantMessages.length - 1; index >= 0; index--) {
    const message = relevantMessages[index]
    const messageBytes = measureMessageBytes(message)
    const exceedsMessageLimit = selectedMessages.length >= limits.maxMessages
    const exceedsByteLimit = selectedMessages.length > 0 && totalBytes + messageBytes > limits.maxBytes

    if (exceedsMessageLimit || exceedsByteLimit) {
      break
    }

    selectedMessages.push(message)
    totalBytes += messageBytes
    startIndex = index
  }

  const messages = selectedMessages.reverse()
  const droppedMessages = relevantMessages.slice(0, startIndex)
  const summaryMessage = summarizeDroppedMessages(droppedMessages, limits.summaryMaxBytes)

  if (!summaryMessage) {
    return messages
  }

  const summaryBytes = measureMessageBytes(summaryMessage)
  while (messages.length > 1 && totalBytes + summaryBytes > limits.maxBytes) {
    const removed = messages.shift()
    if (!removed) break
    totalBytes -= measureMessageBytes(removed)
  }

  if (totalBytes + summaryBytes > limits.maxBytes) {
    return messages
  }

  return [summaryMessage, ...messages]
}

export async function sendMessage(userMessage: string): Promise<void> {
  const store = useSpreadsheetStore.getState()

  // Prevent concurrent requests
  if (store.chatLoading) return

  // Validate config
  const config = store.aiConfig
  if (config.provider !== 'ollama' && !config.apiKey) {
    store.addChatMessage({
      id: uuidv4(),
      role: 'assistant',
      content: 'Please configure your API key in Settings before sending a message.',
      timestamp: Date.now(),
    })
    return
  }

  // Add user message to chat
  const activeSessionId = store.activeChatSessionId
  const userMsg: ChatMessage = {
    id: uuidv4(),
    role: 'user',
    content: userMessage,
    timestamp: Date.now(),
  }
  store.addChatMessage(userMsg, activeSessionId)

  // Add placeholder assistant message for streaming
  const assistantMsgId = uuidv4()
  const assistantMsg: ChatMessage = {
    id: assistantMsgId,
    role: 'assistant',
    content: '',
    timestamp: Date.now(),
    isStreaming: true,
    toolCalls: [],
  }
  store.addChatMessage(assistantMsg, activeSessionId)
  store.setChatLoading(true)
  const abortController = new AbortController()
  currentAbortController = abortController
  const tokenBatcher = createTokenBatcher(assistantMsgId, activeSessionId)

  try {
    // Build messages array from chat history
    const chatHistory = useSpreadsheetStore.getState().chatSessions.find((session) => session.id === activeSessionId)?.messages ?? []
    const messages = buildProviderMessages(chatHistory, assistantMsgId, config)

    // Create the provider
    const provider = createProvider(config)

    // Run the agentic loop via the provider
    const finalContent = await provider.sendMessage(
      messages,
      // onToken callback - stream tokens to the assistant message
      (token: string) => {
        tokenBatcher.push(token)
      },
      // onToolCall callback - execute the tool and record the result
      async (name: string, input: Record<string, any>): Promise<string> => {
        const result = await executeTool(name, input)

        // Record tool call result on the assistant message
        const toolCallResult: ToolCallResult = {
          toolName: name,
          input: input as Record<string, unknown>,
          result,
        }

        useSpreadsheetStore.getState().updateMessage(assistantMsgId, (message) => ({
          ...message,
          toolCalls: [...(message.toolCalls || []), toolCallResult],
        }), activeSessionId)

        return result
      },
      abortController.signal,
    )

    tokenBatcher.flush()
    // setChatLoading(false) will flush streamingContent into the message
  } catch (error) {
    tokenBatcher.flush()

    if (isAbortError(error)) {
      const abortedStore = useSpreadsheetStore.getState()
      abortedStore.setChatLoading(false)
      abortedStore.updateMessage(assistantMsgId, (msg) => ({
        ...msg,
        content: msg.content || '已停止回复。',
        isStreaming: false,
      }), activeSessionId)
      return
    }

    const errorMessage = error instanceof Error ? error.message : String(error)
    // Flush streaming content first, then append error
    const store = useSpreadsheetStore.getState()
    store.setChatLoading(false)
    store.updateMessage(assistantMsgId, (msg) => ({
      ...msg,
      content: msg.content
        ? `${msg.content}\n\nError: ${errorMessage}`
        : `Error: ${errorMessage}`,
    }), activeSessionId)
    return
  } finally {
    tokenBatcher.cancel()
    if (currentAbortController === abortController) {
      currentAbortController = null
    }
  }
  useSpreadsheetStore.getState().setChatLoading(false)
}
