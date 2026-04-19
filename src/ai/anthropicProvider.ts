import type { ToolMode } from '@/types'
import type { AIProvider } from './provider'
import { spreadsheetTools } from './tools'
import {
  buildJsonToolPrompt,
  buildInjectedToolPrompt,
  formatInjectedToolResults,
  parsePromptToolCalls,
} from './toolInjection'

interface AnthropicProviderConfig {
  apiKey: string
  model: string
  baseUrl: string
  systemPrompt?: string
  toolMode?: ToolMode
}

interface AnthropicTextBlock {
  type: 'text'
  text: string
}

interface AnthropicToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, any>
}

interface AnthropicToolResultBlock {
  type: 'tool_result'
  tool_use_id: string
  content: string
  is_error?: boolean
}

type AnthropicMessageBlock =
  | AnthropicTextBlock
  | AnthropicToolUseBlock
  | AnthropicToolResultBlock

interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: AnthropicMessageBlock[]
}

type AnthropicResponseBlock = AnthropicTextBlock | AnthropicToolUseBlock

interface AnthropicResponse {
  content: AnthropicResponseBlock[]
  stop_reason: string | null
}

interface ToolModeRunResult {
  content: string
  usedTools: boolean
  executedToolNames: string[]
}

const READ_ONLY_TOOL_NAMES = new Set(['get_sheet_data'])

export class AnthropicProvider implements AIProvider {
  private config: AnthropicProviderConfig

  constructor(config: AnthropicProviderConfig) {
    this.config = config
  }

  async sendMessage(
    messages: { role: 'user' | 'assistant'; content: string }[],
    onToken: (token: string) => void,
    onToolCall: (name: string, input: Record<string, any>) => Promise<string>,
    signal?: AbortSignal,
  ): Promise<string> {
    if (this.config.toolMode === 'auto') {
      return this.sendAutoMessage(messages, onToken, onToolCall, signal)
    }

    if (this.config.toolMode === 'json') {
      return this.sendJsonMessage(messages, onToken, onToolCall, signal)
    }

    if (this.config.toolMode === 'inject') {
      return this.sendInjectedMessage(messages, onToken, onToolCall, signal)
    }

    if (this.config.toolMode === 'none') {
      return this.sendPlainMessage(messages, onToken, signal)
    }

    return this.sendNativeMessage(messages, onToken, onToolCall, signal)
  }

  private async sendAutoMessage(
    messages: { role: 'user' | 'assistant'; content: string }[],
    onToken: (token: string) => void,
    onToolCall: (name: string, input: Record<string, any>) => Promise<string>,
    signal?: AbortSignal,
  ): Promise<string> {
    const nativeTokens: string[] = []
    try {
      const nativeResult = await this.runNativeMessage(
        messages,
        (token) => { nativeTokens.push(token) },
        onToolCall,
        signal,
      )

      if (this.shouldAcceptToolModeResult(nativeResult)) {
        const nativeContent = nativeTokens.join('')
        if (nativeContent) {
          onToken(nativeContent)
        }
        return nativeResult.content
      }

      if (!this.canRetryRejectedResult(nativeResult)) {
        const fallbackMessage = this.buildPostToolFallbackMessage()
        onToken(fallbackMessage)
        return fallbackMessage
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!this.shouldFallbackFromNativeMode(message)) {
        throw error
      }
    }

    const jsonTokens: string[] = []
    try {
      const jsonResult = await this.runJsonMessage(
        messages,
        (token) => { jsonTokens.push(token) },
        onToolCall,
        signal,
      )

      if (this.shouldAcceptToolModeResult(jsonResult)) {
        const jsonContent = jsonTokens.join('')
        if (jsonContent) {
          onToken(jsonContent)
        }
        return jsonResult.content
      }

      if (!this.canRetryRejectedResult(jsonResult)) {
        const fallbackMessage = this.buildPostToolFallbackMessage()
        onToken(fallbackMessage)
        return fallbackMessage
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!this.shouldFallbackFromPromptMode(message)) {
        throw error
      }
    }

    const injectedTokens: string[] = []
    const injectedResult = await this.runInjectedMessage(
      messages,
      (token) => { injectedTokens.push(token) },
      onToolCall,
      signal,
    )

    if (this.shouldAcceptToolModeResult(injectedResult)) {
      const injectedContent = injectedTokens.join('')
      if (injectedContent) {
        onToken(injectedContent)
      }
      return injectedResult.content
    }

    if (!this.canRetryRejectedResult(injectedResult)) {
      const fallbackMessage = this.buildPostToolFallbackMessage()
      onToken(fallbackMessage)
      return fallbackMessage
    }

    const fallbackMessage = '当前 API 返回了可疑的工具失败结果。请点击“测试支持情况”，或切换到“自动回退”工具模式。'
    onToken(fallbackMessage)
    return fallbackMessage
  }

  private async sendPlainMessage(
    messages: { role: 'user' | 'assistant'; content: string }[],
    onToken: (token: string) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    const response = await this.makeRequest(this.toConversation(messages), false, this.config.systemPrompt, signal)
    if ('error' in response) {
      throw new Error(response.error)
    }

    const content = this.extractResponseText(response.content)
    if (content) {
      onToken(content)
    }
    return content
  }

  private async sendNativeMessage(
    messages: { role: 'user' | 'assistant'; content: string }[],
    onToken: (token: string) => void,
    onToolCall: (name: string, input: Record<string, any>) => Promise<string>,
    signal?: AbortSignal,
  ): Promise<string> {
    const nativeTokens: string[] = []
    const result = await this.runNativeMessage(
      messages,
      (token) => { nativeTokens.push(token) },
      onToolCall,
      signal,
    )

    if (this.shouldAcceptToolModeResult(result)) {
      const content = nativeTokens.join('')
      if (content) {
        onToken(content)
      }
      return result.content
    }

    if (!this.canRetryRejectedResult(result)) {
      const fallbackMessage = this.buildPostToolFallbackMessage()
      onToken(fallbackMessage)
      return fallbackMessage
    }

    return this.runRescueFallbackModes(messages, onToken, onToolCall, 'json', signal)
  }

  private async runNativeMessage(
    messages: { role: 'user' | 'assistant'; content: string }[],
    onToken: (token: string) => void,
    onToolCall: (name: string, input: Record<string, any>) => Promise<string>,
    signal?: AbortSignal,
  ): Promise<ToolModeRunResult> {
    const conversation = this.toConversation(messages)
    let fullText = ''
    let usedTools = false
    const executedToolNames: string[] = []
    const maxIterations = 20

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      const response = await this.makeRequest(conversation, true, this.config.systemPrompt, signal)
      if ('error' in response) {
        throw new Error(response.error)
      }

      const text = this.extractResponseText(response.content)
      if (text) {
        fullText += text
        onToken(text)
      }

      const toolUses = response.content.filter(
        (block): block is AnthropicToolUseBlock => block.type === 'tool_use',
      )

      if (response.stop_reason !== 'tool_use' || toolUses.length === 0) {
        return { content: fullText, usedTools, executedToolNames }
      }

      usedTools = true
      conversation.push({
        role: 'assistant',
        content: response.content,
      })

      const toolResults = await Promise.all(
        toolUses.map(async (toolUse) => {
          executedToolNames.push(toolUse.name)
          try {
            const result = await onToolCall(toolUse.name, toolUse.input)
            return {
              type: 'tool_result' as const,
              tool_use_id: toolUse.id,
              content: result,
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            return {
              type: 'tool_result' as const,
              tool_use_id: toolUse.id,
              content: message,
              is_error: true,
            }
          }
        }),
      )

      conversation.push({
        role: 'user',
        content: toolResults,
      })
    }

    return {
      content: 'Reached maximum number of tool call iterations.',
      usedTools,
      executedToolNames,
    }
  }

  private async sendJsonMessage(
    messages: { role: 'user' | 'assistant'; content: string }[],
    onToken: (token: string) => void,
    onToolCall: (name: string, input: Record<string, any>) => Promise<string>,
    signal?: AbortSignal,
  ): Promise<string> {
    const jsonTokens: string[] = []
    const result = await this.runJsonMessage(
      messages,
      (token) => { jsonTokens.push(token) },
      onToolCall,
      signal,
    )

    if (this.shouldAcceptToolModeResult(result)) {
      const content = jsonTokens.join('')
      if (content) {
        onToken(content)
      }
      return result.content
    }

    if (!this.canRetryRejectedResult(result)) {
      const fallbackMessage = this.buildPostToolFallbackMessage()
      onToken(fallbackMessage)
      return fallbackMessage
    }

    return this.runRescueFallbackModes(messages, onToken, onToolCall, 'inject', signal)
  }

  private async runJsonMessage(
    messages: { role: 'user' | 'assistant'; content: string }[],
    onToken: (token: string) => void,
    onToolCall: (name: string, input: Record<string, any>) => Promise<string>,
    signal?: AbortSignal,
  ): Promise<ToolModeRunResult> {
    const jsonSystemPrompt = this.config.systemPrompt
      ? `${this.config.systemPrompt}\n\n${buildJsonToolPrompt()}`
      : buildJsonToolPrompt()

    return this.runPromptToolMessage(
      messages,
      onToken,
      onToolCall,
      jsonSystemPrompt,
      [
        'The previous JSON tool call could not be parsed.',
        'Return only valid JSON like {"name":"get_sheet_data","arguments":{"maxRows":1,"maxCols":1}} or {"tool_calls":[{"name":"set_range","arguments":{"startRow":0,"startCol":0,"data":[["A"]]}}]} with no markdown or extra text.',
      ].join('\n'),
      20,
      signal,
    )
  }

  private async sendInjectedMessage(
    messages: { role: 'user' | 'assistant'; content: string }[],
    onToken: (token: string) => void,
    onToolCall: (name: string, input: Record<string, any>) => Promise<string>,
    signal?: AbortSignal,
  ): Promise<string> {
    const injectedTokens: string[] = []
    const result = await this.runInjectedMessage(
      messages,
      (token) => { injectedTokens.push(token) },
      onToolCall,
      signal,
    )

    if (this.shouldAcceptToolModeResult(result)) {
      const content = injectedTokens.join('')
      if (content) {
        onToken(content)
      }
      return result.content
    }

    if (!this.canRetryRejectedResult(result)) {
      const fallbackMessage = this.buildPostToolFallbackMessage()
      onToken(fallbackMessage)
      return fallbackMessage
    }

    return this.runRescueFallbackModes(messages, onToken, onToolCall, 'json', signal)
  }

  private async runRescueFallbackModes(
    messages: { role: 'user' | 'assistant'; content: string }[],
    onToken: (token: string) => void,
    onToolCall: (name: string, input: Record<string, any>) => Promise<string>,
    preferredMode: 'json' | 'inject',
    signal?: AbortSignal,
  ): Promise<string> {
    const attempts: Array<'json' | 'inject'> = preferredMode === 'json'
      ? ['json', 'inject']
      : ['inject', 'json']

    for (const mode of attempts) {
      try {
        const tokenBuffer: string[] = []
        const result = mode === 'json'
          ? await this.runJsonMessage(messages, (token) => { tokenBuffer.push(token) }, onToolCall, signal)
          : await this.runInjectedMessage(messages, (token) => { tokenBuffer.push(token) }, onToolCall, signal)

        if (this.shouldAcceptToolModeResult(result)) {
          const content = tokenBuffer.join('')
          if (content) {
            onToken(content)
          }
          return result.content
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (!this.shouldFallbackFromPromptMode(message)) {
          throw error
        }
      }
    }

    const fallbackMessage = '当前 API 返回了可疑的工具失败结果。请点击“测试支持情况”，或切换到“自动回退”工具模式。'
    onToken(fallbackMessage)
    return fallbackMessage
  }

  private async runInjectedMessage(
    messages: { role: 'user' | 'assistant'; content: string }[],
    onToken: (token: string) => void,
    onToolCall: (name: string, input: Record<string, any>) => Promise<string>,
    signal?: AbortSignal,
  ): Promise<ToolModeRunResult> {
    const injectedSystemPrompt = this.config.systemPrompt
      ? `${this.config.systemPrompt}\n\n${buildInjectedToolPrompt()}`
      : buildInjectedToolPrompt()

    return this.runPromptToolMessage(
      messages,
      onToken,
      onToolCall,
      injectedSystemPrompt,
      [
        'The previous tool call could not be parsed.',
        'Reissue a valid <tool_call>{"name":"...","arguments":{}}</tool_call> or <tool_calls>[{"name":"...","arguments":{}}]</tool_calls> block with valid JSON and no extra text.',
      ].join('\n'),
      20,
      signal,
    )
  }

  private async runPromptToolMessage(
    messages: { role: 'user' | 'assistant'; content: string }[],
    onToken: (token: string) => void,
    onToolCall: (name: string, input: Record<string, any>) => Promise<string>,
    modeSystemPrompt: string,
    invalidToolRepairPrompt: string,
    maxIterations = 20,
    signal?: AbortSignal,
  ): Promise<ToolModeRunResult> {
    const conversation = this.toConversation(messages)
    let usedTools = false
    const executedToolNames: string[] = []

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      const response = await this.makeRequest(conversation, false, modeSystemPrompt, signal)
      if ('error' in response) {
        throw new Error(response.error)
      }

      const rawContent = this.extractResponseText(response.content)
      if (!rawContent) {
        return { content: '', usedTools, executedToolNames }
      }

      const parsed = parsePromptToolCalls(rawContent)
      if (parsed.toolCalls.length > 0) {
        usedTools = true
        conversation.push({
          role: 'assistant',
          content: response.content,
        })

        const toolResults: Array<{ name: string; result: string }> = []
        for (const toolCall of parsed.toolCalls) {
          executedToolNames.push(toolCall.name)
          const result = await onToolCall(toolCall.name, toolCall.arguments)
          toolResults.push({ name: toolCall.name, result })
        }

        conversation.push({
          role: 'user',
          content: [{ type: 'text', text: formatInjectedToolResults(toolResults) }],
        })
        continue
      }

      if (parsed.hadToolSyntax) {
        conversation.push({
          role: 'assistant',
          content: response.content,
        })
        conversation.push({
          role: 'user',
          content: [{ type: 'text', text: invalidToolRepairPrompt }],
        })
        continue
      }

      onToken(rawContent)
      return { content: rawContent, usedTools, executedToolNames }
    }

    return {
      content: 'Reached maximum number of prompt-driven tool call iterations.',
      usedTools,
      executedToolNames,
    }
  }

  private toConversation(messages: { role: 'user' | 'assistant'; content: string }[]): AnthropicMessage[] {
    return messages.map((message) => ({
      role: message.role,
      content: [{ type: 'text', text: message.content }],
    }))
  }

  private extractResponseText(content: AnthropicResponseBlock[]): string {
    return content
      .filter((block): block is AnthropicTextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')
  }

  private shouldFallbackFromNativeMode(errorMessage: string): boolean {
    const normalized = errorMessage.toLowerCase()
    return (
      normalized.includes('tool') ||
      normalized.includes('function') ||
      normalized.includes('unsupported') ||
      normalized.includes('not supported') ||
      normalized.includes('invalid_request_error') ||
      normalized.includes('extra inputs are not permitted') ||
      normalized.includes('unknown field') ||
      normalized.includes('unrecognized request argument')
    )
  }

  private shouldFallbackFromPromptMode(errorMessage: string): boolean {
    const normalized = errorMessage.toLowerCase()
    return (
      normalized.includes('json') ||
      normalized.includes('tool') ||
      normalized.includes('function') ||
      normalized.includes('unsupported') ||
      normalized.includes('invalid') ||
      normalized.includes('格式') ||
      normalized.includes('解析')
    )
  }

  private shouldAcceptToolModeResult(result: ToolModeRunResult): boolean {
    const trimmed = result.content.trim()
    if (!trimmed) {
      return true
    }

    return !this.isSuspiciousToolFailureContent(result.content)
  }

  private canRetryRejectedResult(result: ToolModeRunResult): boolean {
    return result.executedToolNames.every((toolName) => READ_ONLY_TOOL_NAMES.has(toolName))
  }

  private buildPostToolFallbackMessage(): string {
    return '当前 API 在工具执行后返回了可疑的工具失败结果。我已停止自动重试以避免重复修改；请先检查表格是否已部分更新，并建议点击“测试支持情况”或切换到“自动回退”工具模式。'
  }

  private isSuspiciousToolFailureContent(content: string): boolean {
    const trimmed = content.trim()
    if (!trimmed) {
      return true
    }

    const normalized = trimmed.toLowerCase()
    const suspiciousPatterns = [
      'unknown tool',
      'tool does not exist',
      'does not exist',
      'does not exists',
      'tool not found',
      'function not found',
      'no tool named',
      'not support tool',
      'unsupported tool',
      'unable to use tools',
      'cannot use tools',
      "can't use tools",
      "don't have access to tools",
      'cannot access tools',
      '工具不存在',
      '不支持工具调用',
      '无法调用工具',
      '没有这个工具',
      '无法访问工具',
      '无法直接修改表格',
      '无法读取当前表格',
    ]

    return suspiciousPatterns.some((pattern) => normalized.includes(pattern))
  }

  private async makeRequest(
    messages: AnthropicMessage[],
    includeTools: boolean,
    systemPrompt?: string,
    signal?: AbortSignal,
  ): Promise<AnthropicResponse | { error: string }> {
    const bodyPayload: Record<string, any> = {
      model: this.config.model,
      max_tokens: 2048,
      messages,
    }

    if (systemPrompt) {
      bodyPayload.system = systemPrompt
    }

    if (includeTools) {
      bodyPayload.tools = spreadsheetTools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.parameters,
      }))
    }

    let response: Response
    try {
      response = await fetch(`${this.config.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'x-api-key': this.config.apiKey,
        },
        body: JSON.stringify(bodyPayload),
        signal,
      })
    } catch (error) {
      return {
        error: `Network error: ${error instanceof Error ? error.message : String(error)}`,
      }
    }

    if (!response.ok) {
      let errorText = ''
      try {
        errorText = await response.text()
      } catch {
        errorText = `HTTP ${response.status}`
      }
      return {
        error: `API error (${response.status}): ${errorText}`,
      }
    }

    try {
      return await response.json() as AnthropicResponse
    } catch (error) {
      return {
        error: `Invalid JSON response: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }
}
