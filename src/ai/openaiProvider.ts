import type { ToolMode } from '@/types'
import type { AIProvider } from './provider'
import { spreadsheetTools } from './tools'
import {
  buildJsonToolPrompt,
  buildInjectedToolPrompt,
  formatInjectedToolResults,
  parsePromptToolCalls,
} from './toolInjection'

interface OpenAIProviderConfig {
  apiKey: string
  model: string
  baseUrl: string
  systemPrompt?: string
  toolMode?: ToolMode
}

interface ToolModeRunResult {
  content: string
  usedTools: boolean
}

export class OpenAICompatibleProvider implements AIProvider {
  private config: OpenAIProviderConfig

  constructor(config: OpenAIProviderConfig) {
    this.config = config
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`
    }
    return headers
  }

  async sendMessage(
    messages: { role: 'user' | 'assistant'; content: string }[],
    onToken: (token: string) => void,
    onToolCall: (name: string, input: Record<string, any>) => Promise<string>,
  ): Promise<string> {
    if (this.config.toolMode === 'auto') {
      return this.sendAutoMessage(messages, onToken, onToolCall)
    }

    if (this.config.toolMode === 'json') {
      return this.sendJsonMessage(messages, onToken, onToolCall)
    }

    if (this.config.toolMode === 'inject') {
      return this.sendInjectedMessage(messages, onToken, onToolCall)
    }

    if (this.config.toolMode === 'none') {
      return this.sendPlainMessage(messages, onToken)
    }

    return this.sendNativeMessage(messages, onToken, onToolCall)
  }

  private async sendAutoMessage(
    messages: { role: 'user' | 'assistant'; content: string }[],
    onToken: (token: string) => void,
    onToolCall: (name: string, input: Record<string, any>) => Promise<string>,
  ): Promise<string> {
    const nativeTokens: string[] = []
    try {
      const nativeResult = await this.runNativeMessage(
        messages,
        (token) => { nativeTokens.push(token) },
        onToolCall,
      )

      if (this.shouldAcceptToolModeResult(nativeResult)) {
        const nativeContent = nativeTokens.join('')
        if (nativeContent) {
          onToken(nativeContent)
        }
        return nativeResult.content
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
      )

      if (this.shouldAcceptToolModeResult(jsonResult)) {
        const jsonContent = jsonTokens.join('')
        if (jsonContent) {
          onToken(jsonContent)
        }
        return jsonResult.content
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
    )
    const injectedContent = injectedTokens.join('')
    if (injectedContent) {
      onToken(injectedContent)
    }
    return injectedResult.content
  }

  private async sendPlainMessage(
    messages: { role: 'user' | 'assistant'; content: string }[],
    onToken: (token: string) => void,
  ): Promise<string> {
    const allMessages: any[] = []

    if (this.config.systemPrompt) {
      allMessages.push({ role: 'system', content: this.config.systemPrompt })
    }

    allMessages.push(...messages.map((message) => ({ role: message.role, content: message.content })))

    const response = await this.makeRequest(allMessages, onToken, false)
    if (response.type === 'error') {
      throw new Error(response.error)
    }

    return response.content
  }

  private async sendNativeMessage(
    messages: { role: 'user' | 'assistant'; content: string }[],
    onToken: (token: string) => void,
    onToolCall: (name: string, input: Record<string, any>) => Promise<string>,
  ): Promise<string> {
    const result = await this.runNativeMessage(messages, onToken, onToolCall)
    return result.content
  }

  private async runNativeMessage(
    messages: { role: 'user' | 'assistant'; content: string }[],
    onToken: (token: string) => void,
    onToolCall: (name: string, input: Record<string, any>) => Promise<string>,
  ): Promise<ToolModeRunResult> {
    const maxIterations = 20 // Safety limit for the agentic loop
    let usedTools = false

    const allMessages: any[] = []

    // Prepend system prompt if provided
    if (this.config.systemPrompt) {
      allMessages.push({ role: 'system', content: this.config.systemPrompt })
    }

    allMessages.push(...messages.map(m => ({ role: m.role, content: m.content })))

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      const response = await this.makeRequest(allMessages, onToken)

      if (response.type === 'error') {
        throw new Error(response.error)
      }

      if (response.type === 'content') {
        // No tool calls - just return the accumulated content
        return { content: response.content, usedTools }
      }

      usedTools = true
      // Add the assistant message with tool calls to conversation
      const assistantMessage: any = {
        role: 'assistant',
        content: response.content || null,
        tool_calls: response.toolCalls!.map(tc => ({
          id: tc.id,
          type: 'function',
          function: {
            name: tc.name,
            arguments: tc.arguments,
          },
        })),
      }
      allMessages.push(assistantMessage)

      // Execute each tool call and add results to conversation
      for (const tc of response.toolCalls!) {
        let parsedInput: Record<string, any>
        try {
          parsedInput = JSON.parse(tc.arguments)
        } catch {
          parsedInput = {}
        }

        const result = await onToolCall(tc.name, parsedInput)

        allMessages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: result,
        })
      }

      // Continue the loop - the AI will see the tool results and respond
    }

    return {
      content: 'Reached maximum number of tool call iterations.',
      usedTools,
    }
  }

  private async sendJsonMessage(
    messages: { role: 'user' | 'assistant'; content: string }[],
    onToken: (token: string) => void,
    onToolCall: (name: string, input: Record<string, any>) => Promise<string>,
  ): Promise<string> {
    const result = await this.runJsonMessage(messages, onToken, onToolCall)
    return result.content
  }

  private async runJsonMessage(
    messages: { role: 'user' | 'assistant'; content: string }[],
    onToken: (token: string) => void,
    onToolCall: (name: string, input: Record<string, any>) => Promise<string>,
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
        'Return only valid JSON like {"name":"get_sheet_data","arguments":{"maxRows":1,"maxCols":1}} with no markdown or extra text.',
      ].join('\n'),
    )
  }

  private async sendInjectedMessage(
    messages: { role: 'user' | 'assistant'; content: string }[],
    onToken: (token: string) => void,
    onToolCall: (name: string, input: Record<string, any>) => Promise<string>,
  ): Promise<string> {
    const result = await this.runInjectedMessage(messages, onToken, onToolCall)
    return result.content
  }

  private async runInjectedMessage(
    messages: { role: 'user' | 'assistant'; content: string }[],
    onToken: (token: string) => void,
    onToolCall: (name: string, input: Record<string, any>) => Promise<string>,
  ): Promise<ToolModeRunResult> {
    const maxIterations = 20
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
        'Reissue exactly one valid <tool_call>{"name":"...","arguments":{}}</tool_call> block with valid JSON and no extra text.',
      ].join('\n'),
      maxIterations,
    )
  }

  private async runPromptToolMessage(
    messages: { role: 'user' | 'assistant'; content: string }[],
    onToken: (token: string) => void,
    onToolCall: (name: string, input: Record<string, any>) => Promise<string>,
    modeSystemPrompt: string,
    invalidToolRepairPrompt: string,
    maxIterations = 20,
  ): Promise<ToolModeRunResult> {
    const allMessages: any[] = []
    let usedTools = false
    allMessages.push({ role: 'system', content: modeSystemPrompt })
    allMessages.push(...messages.map((message) => ({ role: message.role, content: message.content })))

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      const response = await this.makePromptToolRequest(allMessages)

      if (response.type === 'error') {
        throw new Error(response.error)
      }

      if (response.type === 'content') {
        if (response.content) {
          onToken(response.content)
        }
        return { content: response.content, usedTools }
      }

      if (response.type === 'invalid_tool_call') {
        allMessages.push({ role: 'assistant', content: response.rawContent })
        allMessages.push({
          role: 'user',
          content: invalidToolRepairPrompt,
        })
        continue
      }

      usedTools = true
      allMessages.push({ role: 'assistant', content: response.rawContent })

      const toolResults: Array<{ name: string; result: string }> = []
      for (const toolCall of response.toolCalls) {
        const result = await onToolCall(toolCall.name, toolCall.arguments)
        toolResults.push({ name: toolCall.name, result })
      }

      allMessages.push({
        role: 'user',
        content: formatInjectedToolResults(toolResults),
      })
    }

    return {
      content: 'Reached maximum number of prompt-driven tool call iterations.',
      usedTools,
    }
  }

  private async makeRequest(
    messages: any[],
    onToken: (token: string) => void,
    includeTools = true,
  ): Promise<
    | { type: 'content'; content: string }
    | { type: 'tool_calls'; content: string; toolCalls: { id: string; name: string; arguments: string }[] }
    | { type: 'error'; error: string }
  > {
    const url = `${this.config.baseUrl}/chat/completions`

    const tools = spreadsheetTools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }))

    const bodyPayload: Record<string, any> = {
      model: this.config.model,
      messages,
      stream: true,
    }

    if (includeTools) {
      bodyPayload.tools = tools
    }

    const body = JSON.stringify(bodyPayload)

    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body,
      })
    } catch (err) {
      return {
        type: 'error',
        error: `Network error: ${err instanceof Error ? err.message : String(err)}`,
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
        type: 'error',
        error: `API error (${response.status}): ${errorText}`,
      }
    }

    const contentType = response.headers.get('content-type')?.toLowerCase() || ''
    if (!contentType.includes('text/event-stream')) {
      return this.processJsonResponse(response, onToken)
    }

    return this.processStream(response, onToken)
  }

  private async makePromptToolRequest(
    messages: any[],
  ): Promise<
    | { type: 'content'; content: string }
    | { type: 'tool_calls'; rawContent: string; toolCalls: { name: string; arguments: Record<string, any> }[] }
    | { type: 'invalid_tool_call'; rawContent: string }
    | { type: 'error'; error: string }
  > {
    const url = `${this.config.baseUrl}/chat/completions`

    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          model: this.config.model,
          messages,
          stream: false,
        }),
      })
    } catch (err) {
      return {
        type: 'error',
        error: `Network error: ${err instanceof Error ? err.message : String(err)}`,
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
        type: 'error',
        error: `API error (${response.status}): ${errorText}`,
      }
    }

    let json: any
    try {
      json = await response.json()
    } catch (err) {
      return {
        type: 'error',
        error: `Invalid JSON response: ${err instanceof Error ? err.message : String(err)}`,
      }
    }

    const content = this.extractResponseContent(json?.choices?.[0]?.message?.content)
    if (!content) {
      return { type: 'content', content: '' }
    }

    const parsed = parsePromptToolCalls(content)
    if (parsed.toolCalls.length > 0) {
      return {
        type: 'tool_calls',
        rawContent: content,
        toolCalls: parsed.toolCalls,
      }
    }

    if (parsed.hadToolSyntax) {
      return {
        type: 'invalid_tool_call',
        rawContent: content,
      }
    }

    return {
      type: 'content',
      content,
    }
  }

  private extractResponseContent(content: unknown): string {
    if (typeof content === 'string') {
      return content
    }

    if (Array.isArray(content)) {
      return content
        .map((item) => {
          if (typeof item === 'string') {
            return item
          }
          if (item && typeof item === 'object' && 'text' in item && typeof item.text === 'string') {
            return item.text
          }
          return ''
        })
        .join('')
    }

    return ''
  }

  private shouldFallbackFromNativeMode(errorMessage: string): boolean {
    const normalized = errorMessage.toLowerCase()
    return (
      normalized.includes('tool') ||
      normalized.includes('function') ||
      normalized.includes('tool_choice') ||
      normalized.includes('unsupported') ||
      normalized.includes('unknown field') ||
      normalized.includes('extra inputs are not permitted') ||
      normalized.includes('invalid parameter') ||
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
    if (result.usedTools) {
      return true
    }

    return !this.isSuspiciousToolFailureContent(result.content)
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

    const mentionsKnownTool = spreadsheetTools.some((tool) => normalized.includes(tool.name.toLowerCase()))
    return suspiciousPatterns.some((pattern) => normalized.includes(pattern)) || mentionsKnownTool
  }

  private async processJsonResponse(
    response: Response,
    onToken: (token: string) => void,
  ): Promise<
    | { type: 'content'; content: string }
    | { type: 'tool_calls'; content: string; toolCalls: { id: string; name: string; arguments: string }[] }
    | { type: 'error'; error: string }
  > {
    let json: any
    try {
      json = await response.json()
    } catch (err) {
      return {
        type: 'error',
        error: `Invalid JSON response: ${err instanceof Error ? err.message : String(err)}`,
      }
    }

    const message = json?.choices?.[0]?.message
    const content = this.extractResponseContent(message?.content)
    if (content) {
      onToken(content)
    }

    const rawToolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : []
    const toolCalls = rawToolCalls
      .map((toolCall: any, index: number) => {
        const name = toolCall?.function?.name
        if (!name) {
          return null
        }

        const rawArguments = toolCall?.function?.arguments
        return {
          id: toolCall?.id || `tool-call-${index}`,
          name,
          arguments: typeof rawArguments === 'string' ? rawArguments : JSON.stringify(rawArguments ?? {}),
        }
      })
      .filter(
        (toolCall: { id: string; name: string; arguments: string } | null): toolCall is { id: string; name: string; arguments: string } => toolCall !== null,
      )

    if (toolCalls.length > 0) {
      return {
        type: 'tool_calls',
        content,
        toolCalls,
      }
    }

    return {
      type: 'content',
      content,
    }
  }

  private async processStream(
    response: Response,
    onToken: (token: string) => void,
  ): Promise<
    | { type: 'content'; content: string }
    | { type: 'tool_calls'; content: string; toolCalls: { id: string; name: string; arguments: string }[] }
    | { type: 'error'; error: string }
  > {
    const reader = response.body?.getReader()
    if (!reader) {
      return { type: 'error', error: 'No response body' }
    }

    const decoder = new TextDecoder()
    let contentBuffer = ''
    let toolCallsMap = new Map<number, { id: string; name: string; arguments: string }>()
    let currentToolCallIndex = 0

    try {
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Process complete SSE lines
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // Keep incomplete line in buffer

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || trimmed === '') continue
          if (trimmed === 'data: [DONE]') continue
          if (!trimmed.startsWith('data: ')) continue

          const jsonStr = trimmed.slice(6) // Remove 'data: '
          if (!jsonStr) continue

          let chunk: any
          try {
            chunk = JSON.parse(jsonStr)
          } catch {
            continue
          }

          const delta = chunk.choices?.[0]?.delta
          if (!delta) continue

          // Handle content tokens
          if (delta.content) {
            contentBuffer += delta.content
            onToken(delta.content)
          }

          // Handle tool call deltas
          if (delta.tool_calls) {
            for (const tcDelta of delta.tool_calls) {
              const idx = tcDelta.index ?? currentToolCallIndex

              if (!toolCallsMap.has(idx)) {
                toolCallsMap.set(idx, {
                  id: tcDelta.id || '',
                  name: '',
                  arguments: '',
                })
                currentToolCallIndex = idx + 1
              }

              const existing = toolCallsMap.get(idx)!

              if (tcDelta.id) {
                existing.id = tcDelta.id
              }
              if (tcDelta.function?.name) {
                existing.name = tcDelta.function.name
              }
              if (tcDelta.function?.arguments) {
                existing.arguments += tcDelta.function.arguments
              }
            }
          }

          // Handle finish_reason
          const finishReason = chunk.choices?.[0]?.finish_reason
          if (finishReason === 'tool_calls' || (finishReason === 'stop' && toolCallsMap.size > 0)) {
            // Tool calls are complete
          }
        }
      }
    } catch (err) {
      return {
        type: 'error',
        error: `Stream error: ${err instanceof Error ? err.message : String(err)}`,
      }
    } finally {
      reader.releaseLock()
    }

    // If we have tool calls, return them
    if (toolCallsMap.size > 0) {
      const toolCalls = Array.from(toolCallsMap.values()).filter(tc => tc.name)
      return {
        type: 'tool_calls',
        content: contentBuffer,
        toolCalls,
      }
    }

    return {
      type: 'content',
      content: contentBuffer,
    }
  }
}
