import { spreadsheetTools } from './tools'

export interface InjectedToolCall {
  name: string
  arguments: Record<string, any>
}

interface ParseInjectedToolCallResult {
  toolCalls: InjectedToolCall[]
  hadToolSyntax: boolean
}

const knownToolNames = new Set(spreadsheetTools.map((tool) => tool.name))

function stripCodeFence(content: string): string {
  const trimmed = content.trim()
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return match ? match[1].trim() : trimmed
}

function coerceArguments(rawArguments: unknown): Record<string, any> | null {
  if (rawArguments == null) return {}
  if (typeof rawArguments === 'string') {
    try {
      const parsed = JSON.parse(rawArguments)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, any>
      }
      return null
    } catch {
      return null
    }
  }

  if (typeof rawArguments === 'object' && !Array.isArray(rawArguments)) {
    return rawArguments as Record<string, any>
  }

  return null
}

function coerceToolCall(rawToolCall: unknown): InjectedToolCall | null {
  if (!rawToolCall || typeof rawToolCall !== 'object' || Array.isArray(rawToolCall)) {
    return null
  }

  const candidate = rawToolCall as Record<string, unknown>
  const rawName = candidate.name ?? candidate.tool ?? candidate.toolName
  const name = typeof rawName === 'string' ? rawName.trim() : ''
  if (!name || !knownToolNames.has(name)) {
    return null
  }

  const args = coerceArguments(candidate.arguments ?? candidate.input ?? candidate.params)
  if (!args) {
    return null
  }

  return { name, arguments: args }
}

function parseToolCallCandidate(candidate: string): InjectedToolCall[] {
  const normalizedCandidate = stripCodeFence(candidate)
  let parsed: unknown

  try {
    parsed = JSON.parse(normalizedCandidate)
  } catch {
    return []
  }

  if (Array.isArray(parsed)) {
    return parsed
      .map(coerceToolCall)
      .filter((toolCall): toolCall is InjectedToolCall => toolCall !== null)
  }

  if (parsed && typeof parsed === 'object' && 'tool_calls' in parsed) {
    const nestedCalls = (parsed as { tool_calls?: unknown }).tool_calls
    if (Array.isArray(nestedCalls)) {
      return nestedCalls
        .map(coerceToolCall)
        .filter((toolCall): toolCall is InjectedToolCall => toolCall !== null)
    }
  }

  const singleToolCall = coerceToolCall(parsed)
  return singleToolCall ? [singleToolCall] : []
}

function extractCodeFenceCandidates(content: string): string[] {
  const candidates: string[] = []
  const codeFencePattern = /```(?:json)?\s*([\s\S]*?)```/gi
  let match: RegExpExecArray | null

  while ((match = codeFencePattern.exec(content)) !== null) {
    candidates.push(match[1].trim())
  }

  return candidates
}

function findBalancedJsonEnd(content: string, startIndex: number): number {
  const stack: string[] = []
  let inString = false
  let isEscaped = false

  for (let i = startIndex; i < content.length; i++) {
    const ch = content[i]

    if (inString) {
      if (isEscaped) {
        isEscaped = false
        continue
      }

      if (ch === '\\') {
        isEscaped = true
        continue
      }

      if (ch === '"') {
        inString = false
      }
      continue
    }

    if (ch === '"') {
      inString = true
      continue
    }

    if (ch === '{' || ch === '[') {
      stack.push(ch)
      continue
    }

    if (ch === '}' || ch === ']') {
      const expected = ch === '}' ? '{' : '['
      if (stack[stack.length - 1] !== expected) {
        return -1
      }

      stack.pop()
      if (stack.length === 0) {
        return i + 1
      }
    }
  }

  return -1
}

function extractEmbeddedJsonCandidates(content: string): string[] {
  const candidates: string[] = []

  for (let i = 0; i < content.length; i++) {
    const ch = content[i]
    if (ch !== '{' && ch !== '[') continue

    const preview = content.slice(i, i + 240)
    if (!/"name"\s*:|["']tool_calls["']\s*:|["']toolName["']\s*:/.test(preview)) {
      continue
    }

    const endIndex = findBalancedJsonEnd(content, i)
    if (endIndex === -1) {
      continue
    }

    candidates.push(content.slice(i, endIndex).trim())
    i = endIndex - 1
  }

  return candidates
}

function extractToolCandidates(content: string): { candidates: string[]; explicitSyntax: boolean } {
  const candidates: string[] = []
  const toolCallPattern = /<tool_call>([\s\S]*?)<\/tool_call>/gi
  const toolCallsPattern = /<tool_calls>([\s\S]*?)<\/tool_calls>/gi

  for (const pattern of [toolCallPattern, toolCallsPattern]) {
    pattern.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = pattern.exec(content)) !== null) {
      candidates.push(match[1].trim())
    }
  }

  const codeFenceCandidates = extractCodeFenceCandidates(content)
  candidates.push(...codeFenceCandidates)

  const embeddedJsonCandidates = extractEmbeddedJsonCandidates(content)
  candidates.push(...embeddedJsonCandidates)

  const explicitSyntax = candidates.length > 0
  if (explicitSyntax) {
    return { candidates, explicitSyntax }
  }

  const trimmed = content.trim()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    candidates.push(trimmed)
    return { candidates, explicitSyntax: true }
  }

  const codeFenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  if (codeFenceMatch) {
    candidates.push(codeFenceMatch[1].trim())
  }

  return { candidates, explicitSyntax: false }
}

export function buildInjectedToolPrompt(): string {
  const catalog = spreadsheetTools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }))

  return [
    'Tool injection fallback mode is enabled because native tool calling may be unavailable.',
    'When you need tool calls, output only tool-call markup and nothing else.',
    'Allowed output formats:',
    '<tool_call>{"name":"get_sheet_data","arguments":{"maxRows":50,"maxCols":26}}</tool_call>',
    '<tool_calls>[{"name":"set_range","arguments":{"startRow":0,"startCol":0,"data":[["A"]]}},{"name":"format_cells","arguments":{"startRow":0,"startCol":0,"endRow":0,"endCol":0,"format":{"bold":true}}}]</tool_calls>',
    'Rules:',
    '- Do not add markdown, code fences, or explanatory text around the tool call.',
    '- Prefer batching all independent tool calls needed for a clear request into one response instead of waiting for another round trip.',
    '- Use <tool_call>...</tool_call> for a single call, and <tool_calls>[...]</tool_calls> for multiple calls.',
    '- "name" must exactly match one tool from the catalog.',
    '- "arguments" must be a valid JSON object.',
    '- After you receive a TOOL_RESULT message, either emit another tool-call block with all remaining independent calls or answer the user normally.',
    '- Never fabricate tool results.',
    `Tool catalog:\n${JSON.stringify(catalog, null, 2)}`,
  ].join('\n')
}

export function buildJsonToolPrompt(): string {
  const catalog = spreadsheetTools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }))

  return [
    'Structured JSON tool mode is enabled.',
    'When you need a tool, output JSON only and nothing else.',
    'Allowed output formats:',
    '{"name":"get_sheet_data","arguments":{"maxRows":50,"maxCols":26}}',
    '{"tool_calls":[{"name":"get_sheet_data","arguments":{"maxRows":50,"maxCols":26}}]}',
    'Rules:',
    '- Do not add markdown, code fences, XML tags, or explanatory text.',
    '- "name" must exactly match one tool from the catalog.',
    '- "arguments" must be a valid JSON object.',
    '- Prefer batching all independent tool calls needed for a clear request into one JSON response.',
    '- For one tool call, output {"name":"...","arguments":{...}}. For multiple calls, output {"tool_calls":[...]}',
    '- After you receive a TOOL_RESULT message, either output another JSON tool call payload containing the remaining independent calls or answer the user normally.',
    '- Never fabricate tool results.',
    `Tool catalog:\n${JSON.stringify(catalog, null, 2)}`,
  ].join('\n')
}

export function parsePromptToolCalls(content: string): ParseInjectedToolCallResult {
  const { candidates, explicitSyntax } = extractToolCandidates(content)

  for (const candidate of candidates) {
    const toolCalls = parseToolCallCandidate(candidate)
    if (toolCalls.length > 0) {
      return { toolCalls, hadToolSyntax: true }
    }
  }

  return {
    toolCalls: [],
    hadToolSyntax: explicitSyntax,
  }
}

export const parseInjectedToolCalls = parsePromptToolCalls

export function formatInjectedToolResults(
  toolResults: Array<{ name: string; result: string }>,
): string {
  return [
    'TOOL_RESULT',
    `<tool_results>${JSON.stringify(toolResults)}</tool_results>`,
    'Use these exact tool results.',
    'If you need more tools, emit the remaining independent calls in one <tool_call>...</tool_call> or <tool_calls>...</tool_calls> block.',
    'Otherwise, answer the user normally.',
  ].join('\n')
}
