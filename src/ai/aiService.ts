import { v4 as uuidv4 } from 'uuid'
import { useSpreadsheetStore } from '@/store/useSpreadsheetStore'
import type { AIConfig, ChatMessage, ToolCallResult } from '@/types'
import { systemPrompt, systemPromptWithoutTools } from './systemPrompt'
import { executeTool } from './toolExecutor'
import { OpenAICompatibleProvider } from './openaiProvider'
import { AnthropicProvider } from './anthropicProvider'
import type { AIProvider } from './provider'
import { resolveApiKey, resolveBaseUrl } from './providerUtils'

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
  const userMsg: ChatMessage = {
    id: uuidv4(),
    role: 'user',
    content: userMessage,
    timestamp: Date.now(),
  }
  store.addChatMessage(userMsg)

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
  store.addChatMessage(assistantMsg)
  store.setChatLoading(true)

  try {
    // Build messages array from chat history
    const chatHistory = useSpreadsheetStore.getState().chatMessages
    const messages: { role: 'user' | 'assistant'; content: string }[] = []

    for (const msg of chatHistory) {
      // Skip the placeholder assistant message we just added (it's empty)
      if (msg.id === assistantMsgId) continue
      if (msg.role === 'user' || msg.role === 'assistant') {
        messages.push({ role: msg.role, content: msg.content })
      }
    }

    // Create the provider
    const provider = createProvider(config)

    // Run the agentic loop via the provider
    const finalContent = await provider.sendMessage(
      messages,
      // onToken callback - stream tokens to the assistant message
      (token: string) => {
        useSpreadsheetStore.getState().appendMessageContent(assistantMsgId, token)
      },
      // onToolCall callback - execute the tool and record the result
      async (name: string, input: Record<string, any>): Promise<string> => {
        const result = executeTool(name, input)

        // Record tool call result on the assistant message
        const toolCallResult: ToolCallResult = {
          toolName: name,
          input: input as Record<string, unknown>,
          result,
        }

        useSpreadsheetStore.getState().updateMessage(assistantMsgId, (message) => ({
          ...message,
          toolCalls: [...(message.toolCalls || []), toolCallResult],
        }))

        return result
      },
    )

    // setChatLoading(false) will flush streamingContent into the message
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    // Flush streaming content first, then append error
    const store = useSpreadsheetStore.getState()
    store.setChatLoading(false)
    store.updateMessage(assistantMsgId, (msg) => ({
      ...msg,
      content: msg.content
        ? `${msg.content}\n\nError: ${errorMessage}`
        : `Error: ${errorMessage}`,
    }))
    return
  }
  useSpreadsheetStore.getState().setChatLoading(false)
}
