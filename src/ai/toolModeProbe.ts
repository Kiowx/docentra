import type { AIConfig, ToolMode } from '@/types'
import { buildInjectedToolPrompt, buildJsonToolPrompt, parsePromptToolCalls } from './toolInjection'
import { resolveApiKey, resolveBaseUrl } from './providerUtils'
import { spreadsheetTools } from './tools'

export interface ToolModeProbeResult {
  mode: ToolMode
  summary: string
  details: string
}

interface ProbeResponse {
  ok: boolean
  status?: number
  bodyText?: string
  json?: any
  error?: string
}

function getHeaders(config: Pick<AIConfig, 'provider' | 'apiKey'>): Record<string, string> {
  if (config.provider === 'claude') {
    return {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': config.apiKey,
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  const apiKey = resolveApiKey(config)
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
  }

  return headers
}

function extractResponseContent(content: unknown): string {
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

function extractAnthropicContentText(content: unknown): string {
  if (!Array.isArray(content)) {
    return ''
  }

  return content
    .map((item) => {
      if (item && typeof item === 'object' && 'type' in item && item.type === 'text' && 'text' in item && typeof item.text === 'string') {
        return item.text
      }
      return ''
    })
    .join('')
}

async function postChatCompletion(config: Pick<AIConfig, 'provider' | 'apiKey' | 'model' | 'baseUrl'>, body: Record<string, any>): Promise<ProbeResponse> {
  const url = `${resolveBaseUrl(config)}/chat/completions`

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: getHeaders(config),
      body: JSON.stringify(body),
    })
  } catch (error) {
    return {
      ok: false,
      error: `网络请求失败：${error instanceof Error ? error.message : String(error)}`,
    }
  }

  let bodyText = ''
  try {
    bodyText = await response.text()
  } catch {
    bodyText = ''
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      bodyText,
    }
  }

  try {
    return {
      ok: true,
      status: response.status,
      bodyText,
      json: bodyText ? JSON.parse(bodyText) : {},
    }
  } catch (error) {
    return {
      ok: false,
      status: response.status,
      bodyText,
      error: `返回内容不是合法 JSON：${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

async function postAnthropicMessage(config: Pick<AIConfig, 'provider' | 'apiKey' | 'model' | 'baseUrl'>, body: Record<string, any>): Promise<ProbeResponse> {
  const url = `${resolveBaseUrl(config)}/messages`

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: getHeaders(config),
      body: JSON.stringify(body),
    })
  } catch (error) {
    return {
      ok: false,
      error: `网络请求失败：${error instanceof Error ? error.message : String(error)}`,
    }
  }

  let bodyText = ''
  try {
    bodyText = await response.text()
  } catch {
    bodyText = ''
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      bodyText,
    }
  }

  try {
    return {
      ok: true,
      status: response.status,
      bodyText,
      json: bodyText ? JSON.parse(bodyText) : {},
    }
  } catch (error) {
    return {
      ok: false,
      status: response.status,
      bodyText,
      error: `返回内容不是合法 JSON：${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

function isNativeToolCallResponse(json: any): boolean {
  const toolCalls = json?.choices?.[0]?.message?.tool_calls
  return Array.isArray(toolCalls)
    && toolCalls.some((toolCall) => toolCall?.function?.name === 'get_sheet_data')
}

function isAnthropicNativeToolCallResponse(json: any): boolean {
  const content = json?.content
  return Array.isArray(content)
    && content.some((block) => block?.type === 'tool_use' && block?.name === 'get_sheet_data')
}

function describeMissingNativeToolCall(json: any): string {
  const message = json?.choices?.[0]?.message
  if (!message) {
    return '接口返回成功，但没有标准 message 结构。'
  }

  const content = extractResponseContent(message.content)
  if (content) {
    return `接口返回成功，但没有 tool_calls，模型回复为：${content}`
  }

  return '接口返回成功，但没有返回 tool_calls。'
}

function describeMissingAnthropicToolCall(json: any): string {
  const content = json?.content
  if (!Array.isArray(content)) {
    return '接口返回成功，但没有标准 content 结构。'
  }

  const text = extractAnthropicContentText(content)
  if (text) {
    return `接口返回成功，但没有 tool_use，模型回复为：${text}`
  }

  return '接口返回成功，但没有返回 tool_use。'
}

function summarizeProbeFailure(response: ProbeResponse): string {
  if (response.error) {
    return response.error
  }

  if (response.status) {
    return `HTTP ${response.status}${response.bodyText ? `: ${response.bodyText}` : ''}`
  }

  return '未知错误'
}

function shouldRetryWithoutToolChoice(response: ProbeResponse): boolean {
  const text = `${response.bodyText ?? ''} ${response.error ?? ''}`.toLowerCase()
  return text.includes('tool_choice') || text.includes('tool choice')
}

async function probeNativeToolMode(config: Pick<AIConfig, 'provider' | 'apiKey' | 'model' | 'baseUrl'>): Promise<{ supported: boolean; details: string }> {
  if (config.provider === 'claude') {
    const toolDefinition = spreadsheetTools.find((tool) => tool.name === 'get_sheet_data')
    if (!toolDefinition) {
      return { supported: false, details: '缺少 get_sheet_data 工具定义。' }
    }

    const response = await postAnthropicMessage(config, {
      model: config.model,
      max_tokens: 128,
      system: 'You are running a capability probe. If tool calling is available, call the provided function immediately.',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Call get_sheet_data with {"maxRows":1,"maxCols":1} right now.',
            },
          ],
        },
      ],
      tools: [
        {
          name: toolDefinition.name,
          description: toolDefinition.description,
          input_schema: toolDefinition.parameters,
        },
      ],
    })

    if (response.ok && isAnthropicNativeToolCallResponse(response.json)) {
      return { supported: true, details: '接口接受 tools 参数并返回了原生 tool_use。' }
    }

    if (response.ok) {
      return {
        supported: false,
        details: `原生工具调用未通过探测：${describeMissingAnthropicToolCall(response.json)}`,
      }
    }

    return {
      supported: false,
      details: `原生工具调用未通过探测：${summarizeProbeFailure(response)}`,
    }
  }

  const toolDefinition = spreadsheetTools.find((tool) => tool.name === 'get_sheet_data')
  if (!toolDefinition) {
    return { supported: false, details: '缺少 get_sheet_data 工具定义。' }
  }

  const baseBody = {
    model: config.model,
    messages: [
      {
        role: 'system',
        content: 'You are running a capability probe. If function calling is available, call the provided function immediately.',
      },
      {
        role: 'user',
        content: 'Call get_sheet_data with {"maxRows":1,"maxCols":1} right now.',
      },
    ],
    tools: [
      {
        type: 'function',
        function: {
          name: toolDefinition.name,
          description: toolDefinition.description,
          parameters: toolDefinition.parameters,
        },
      },
    ],
    stream: false,
    max_tokens: 64,
  }

  const forcedResponse = await postChatCompletion(config, {
    ...baseBody,
    tool_choice: {
      type: 'function',
      function: {
        name: 'get_sheet_data',
      },
    },
  })

  if (forcedResponse.ok && isNativeToolCallResponse(forcedResponse.json)) {
    return { supported: true, details: '接口接受 tools 参数并返回了原生 tool_calls。' }
  }

  if (!forcedResponse.ok && !shouldRetryWithoutToolChoice(forcedResponse)) {
    return { supported: false, details: `原生工具调用探测失败：${summarizeProbeFailure(forcedResponse)}` }
  }

  const relaxedResponse = await postChatCompletion(config, baseBody)
  if (relaxedResponse.ok && isNativeToolCallResponse(relaxedResponse.json)) {
    return { supported: true, details: '接口在不强制 tool_choice 的情况下返回了原生 tool_calls。' }
  }

  if (relaxedResponse.ok) {
    return {
      supported: false,
      details: `原生工具调用未通过探测：${describeMissingNativeToolCall(relaxedResponse.json)}`,
    }
  }

  return {
    supported: false,
    details: `原生工具调用未通过探测：${summarizeProbeFailure(relaxedResponse)}`,
  }
}

async function probeInjectedToolMode(config: Pick<AIConfig, 'provider' | 'apiKey' | 'model' | 'baseUrl'>): Promise<{ supported: boolean; details: string }> {
  const response = config.provider === 'claude'
    ? await postAnthropicMessage(config, {
      model: config.model,
      max_tokens: 128,
      system: buildInjectedToolPrompt(),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Return exactly one tool call for get_sheet_data with {"maxRows":1,"maxCols":1}. Do not explain.',
            },
          ],
        },
      ],
    })
    : await postChatCompletion(config, {
      model: config.model,
      messages: [
        {
          role: 'system',
          content: buildInjectedToolPrompt(),
        },
        {
          role: 'user',
          content: 'Return exactly one tool call for get_sheet_data with {"maxRows":1,"maxCols":1}. Do not explain.',
        },
      ],
      stream: false,
      max_tokens: 128,
    })

  if (!response.ok) {
    return {
      supported: false,
      details: `注入工具探测失败：${summarizeProbeFailure(response)}`,
    }
  }

  const content = config.provider === 'claude'
    ? extractAnthropicContentText(response.json?.content)
    : extractResponseContent(response.json?.choices?.[0]?.message?.content)
  const parsed = parsePromptToolCalls(content)
  if (parsed.toolCalls.some((toolCall) => toolCall.name === 'get_sheet_data')) {
    return { supported: true, details: '模型能按注入协议稳定返回可解析的工具调用。' }
  }

  return {
    supported: false,
    details: content
      ? `模型返回了普通文本而不是工具调用：${content}`
      : '模型没有返回可解析的注入工具调用。',
  }
}

async function probeJsonToolMode(config: Pick<AIConfig, 'provider' | 'apiKey' | 'model' | 'baseUrl'>): Promise<{ supported: boolean; details: string }> {
  const response = config.provider === 'claude'
    ? await postAnthropicMessage(config, {
      model: config.model,
      max_tokens: 128,
      system: buildJsonToolPrompt(),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Return only JSON for a get_sheet_data tool call with {"maxRows":1,"maxCols":1}.',
            },
          ],
        },
      ],
    })
    : await postChatCompletion(config, {
      model: config.model,
      messages: [
        {
          role: 'system',
          content: buildJsonToolPrompt(),
        },
        {
          role: 'user',
          content: 'Return only JSON for a get_sheet_data tool call with {"maxRows":1,"maxCols":1}.',
        },
      ],
      stream: false,
      max_tokens: 128,
    })

  if (!response.ok) {
    return {
      supported: false,
      details: `JSON 工具探测失败：${summarizeProbeFailure(response)}`,
    }
  }

  const content = config.provider === 'claude'
    ? extractAnthropicContentText(response.json?.content)
    : extractResponseContent(response.json?.choices?.[0]?.message?.content)
  const parsed = parsePromptToolCalls(content)
  if (parsed.toolCalls.some((toolCall) => toolCall.name === 'get_sheet_data')) {
    return { supported: true, details: '模型能按纯 JSON 协议稳定返回可解析的工具调用。' }
  }

  return {
    supported: false,
    details: content
      ? `模型返回了普通文本而不是 JSON 工具调用：${content}`
      : '模型没有返回可解析的 JSON 工具调用。',
  }
}

export async function detectBestToolMode(config: Pick<AIConfig, 'provider' | 'apiKey' | 'model' | 'baseUrl'>): Promise<ToolModeProbeResult> {
  const native = await probeNativeToolMode(config)
  if (native.supported) {
    return {
      mode: 'native',
      summary: '已自动切换到原生工具调用',
      details: native.details,
    }
  }

  const json = await probeJsonToolMode(config)
  if (json.supported) {
    return {
      mode: 'json',
      summary: '已自动切换到 JSON 工具模式',
      details: `${native.details}\n${json.details}`,
    }
  }

  const injected = await probeInjectedToolMode(config)
  if (injected.supported) {
    return {
      mode: 'inject',
      summary: '已自动切换到注入工具模式',
      details: `${native.details}\n${json.details}\n${injected.details}`,
    }
  }

  return {
    mode: 'none',
    summary: '未检测到可用的自动工具能力，已切换为纯对话模式',
    details: `${native.details}\n${json.details}\n${injected.details}`,
  }
}
