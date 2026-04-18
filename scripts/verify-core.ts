function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

function createStorage() {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value) },
    removeItem: (key: string) => { store.delete(key) },
    clear: () => { store.clear() },
  }
}

;(globalThis as Record<string, unknown>).localStorage = createStorage()

async function main() {
  const { evaluateFormula, getFormulaDependencies } = await import('../src/utils/formulaEngine')
  const { AnthropicProvider } = await import('../src/ai/anthropicProvider')
  const { OpenAICompatibleProvider } = await import('../src/ai/openaiProvider')
  const { createSheet, defaultAIConfig } = await import('../src/utils/cellUtils')
  const { TOTAL_COLS, TOTAL_ROWS } = await import('../src/types')
  const { useSpreadsheetStore } = await import('../src/store/useSpreadsheetStore')

  const resetStore = () => {
    const sheet = createSheet('Sheet1')
    useSpreadsheetStore.setState({
      sheets: [sheet],
      activeSheetId: sheet.id,
      selection: { activeCell: { row: 0, col: 0 } },
      editMode: 'none',
      editValue: '',
      contextMenu: { visible: false, x: 0, y: 0 },
      clipboard: null,
      scrollPosition: { scrollLeft: 0, scrollTop: 0 },
      chatMessages: [],
      chatLoading: false,
      aiConfig: defaultAIConfig(),
      showSettings: false,
      chatPanelWidth: 350,
    })
  }

  assert(evaluateFormula('=2^3^2', () => 0) === 512, 'Power operator should be right-associative')
  assert(evaluateFormula('=1<>2', () => 0) === true, 'Not-equal operator should parse correctly')
  assert(evaluateFormula('=COUNT(1,"x","")', () => 0) === 1, 'COUNT should only count numeric values')

  const deps = getFormulaDependencies('=SUM(A1:B2)+C3')
  assert(deps.length === 5, 'Range dependencies should expand to every cell in the range')
  assert(deps.includes('0,0') && deps.includes('1,1') && deps.includes('2,2'), 'Expanded dependencies should include range cells and standalone refs')

  resetStore()
  let store = useSpreadsheetStore.getState()
  store.setCell(0, 0, '1')
  store.setCellFormula(1, 0, 'A1+1')
  store.setCellFormula(2, 0, 'A2+1')
  store = useSpreadsheetStore.getState()
  assert(store.getCellDisplayValue(2, 0) === '3', 'Formula recalculation should resolve dependency chains')

  resetStore()
  store = useSpreadsheetStore.getState()
  store.setCell(0, 0, '1')
  store.setCell(1, 0, '2')
  store.setCell(2, 0, '3')
  store.setCellFormula(0, 1, 'SUM(A1:A3)')
  store.addRow(1)
  store = useSpreadsheetStore.getState()
  assert(store.getCellData(0, 1)?.formula === 'SUM(A1:A4)', 'Inserted rows should expand affected ranges')
  assert(store.getCellDisplayValue(0, 1) === '6', 'Inserted rows should trigger formula recalculation')
  store.deleteRow(1)
  store = useSpreadsheetStore.getState()
  assert(store.getCellData(0, 1)?.formula === 'SUM(A1:A3)', 'Deleted rows should shrink affected ranges')
  assert(store.getCellDisplayValue(0, 1) === '6', 'Deleted rows should keep formulas consistent')

  resetStore()
  store = useSpreadsheetStore.getState()
  store.setCell(0, 0, '1')
  store.setCellFormula(0, 1, 'A1+1')
  store.deleteColumn(0)
  store = useSpreadsheetStore.getState()
  assert(store.getCellDisplayValue(0, 0) === '#REF!', 'Deleting a referenced column should surface a reference error')

  resetStore()
  store = useSpreadsheetStore.getState()
  store.setCellFormula(0, 0, 'B1+1')
  store.setCellFormula(0, 1, 'A1+1')
  store = useSpreadsheetStore.getState()
  assert(store.getCellDisplayValue(0, 0) === '#CYCLE!' && store.getCellDisplayValue(0, 1) === '#CYCLE!', 'Circular references should be marked explicitly')

  resetStore()
  store = useSpreadsheetStore.getState()
  store.addRow(10, 5)
  store.addColumn(3, 2)
  store = useSpreadsheetStore.getState()
  assert(store.getActiveSheet().rowHeights.length === TOTAL_ROWS, 'Row height array should stay aligned with the fixed row count')
  assert(store.getActiveSheet().colWidths.length === TOTAL_COLS, 'Column width array should stay aligned with the fixed column count')

  const originalFetch = globalThis.fetch

  try {
    const streamedTokens: string[] = []
    globalThis.fetch = async () => new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hel"},"finish_reason":null}]}\n'))
          controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"lo"},"finish_reason":"stop"}]}\n'))
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n'))
          controller.close()
        },
      }),
      { status: 200 },
    )

    const openAIProvider = new OpenAICompatibleProvider({
      apiKey: 'test-key',
      model: 'gpt-4o',
      baseUrl: 'https://example.com/v1',
    })

    const openAIText = await openAIProvider.sendMessage([], (token) => {
      streamedTokens.push(token)
    }, async () => '')

    assert(streamedTokens.join('') === 'Hello', 'OpenAI-compatible provider should emit incremental text chunks')
    assert(openAIText === 'Hello', 'OpenAI-compatible provider should return full streamed text')

    const anthropicCalls: Array<{ url: string; body: any; headers: HeadersInit }> = []
    let anthropicStep = 0
    globalThis.fetch = async (input, init) => {
      anthropicCalls.push({
        url: String(input),
        body: JSON.parse(String(init?.body ?? '{}')),
        headers: init?.headers ?? {},
      })

      anthropicStep++
      if (anthropicStep === 1) {
        return new Response(JSON.stringify({
          content: [
            { type: 'text', text: '先读取表格。' },
            { type: 'tool_use', id: 'toolu_01', name: 'get_sheet_data', input: { maxRows: 10 } },
          ],
          stop_reason: 'tool_use',
        }), { status: 200 })
      }

      return new Response(JSON.stringify({
        content: [
          { type: 'text', text: '处理完成。' },
        ],
        stop_reason: 'end_turn',
      }), { status: 200 })
    }

    const anthropicTokens: string[] = []
    const toolCalls: Array<{ name: string; input: Record<string, unknown> }> = []

    const anthropicProvider = new AnthropicProvider({
      apiKey: 'sk-ant-test',
      model: 'claude-sonnet-4-20250514',
      baseUrl: 'https://api.anthropic.com/v1',
      systemPrompt: 'You are helpful.',
    })

    const anthropicText = await anthropicProvider.sendMessage(
      [{ role: 'user', content: '帮我看一下当前表格' }],
      (token) => anthropicTokens.push(token),
      async (name, input) => {
        toolCalls.push({ name, input })
        return '表格为空'
      },
    )

    assert(anthropicCalls.length === 2, 'Anthropic provider should continue the loop after tool use')
    assert(anthropicCalls[0].url.endsWith('/messages'), 'Anthropic provider should call the Messages endpoint')
    assert(toolCalls.length === 1 && toolCalls[0].name === 'get_sheet_data', 'Anthropic provider should execute client tool calls')
    assert(anthropicCalls[1].body.messages.at(-1)?.content?.[0]?.type === 'tool_result', 'Anthropic tool results should be sent back as user tool_result blocks')
    assert(anthropicTokens.join('') === '先读取表格。处理完成。', 'Anthropic provider should surface text across tool turns')
    assert(anthropicText === '先读取表格。处理完成。', 'Anthropic provider should return the accumulated final text')
  } finally {
    globalThis.fetch = originalFetch
  }

  console.log('verify-core: ok')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
