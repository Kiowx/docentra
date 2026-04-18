import { v4 as uuidv4 } from 'uuid'
import {
  CellAddress, CellData, SelectionState, Sheet, ChatMessage,
  AIConfig, ContextMenuState, ClipboardData,
  ToolMode,
  DimensionSizes,
  DEFAULT_COL_WIDTH, DEFAULT_ROW_HEIGHT, TOTAL_COLS, TOTAL_ROWS,
} from '@/types'

// -- Cell address utilities --
export function cellKey(row: number, col: number): string {
  return `${row},${col}`
}

export function parseCellKey(key: string): [number, number] {
  const [r, c] = key.split(',').map(Number)
  return [r, c]
}

export function colToLetter(col: number): string {
  let result = ''
  let c = col
  while (c >= 0) {
    result = String.fromCharCode(65 + (c % 26)) + result
    c = Math.floor(c / 26) - 1
  }
  return result
}

export function letterToCol(letters: string): number {
  let col = 0
  for (let i = 0; i < letters.length; i++) {
    col = col * 26 + (letters.charCodeAt(i) - 64)
  }
  return col - 1
}

export function cellRefToAddress(ref: string): CellAddress | null {
  const match = ref.match(/^\$?([A-Z]+)\$?(\d+)$/i)
  if (!match) return null
  return { col: letterToCol(match[1].toUpperCase()), row: parseInt(match[2]) - 1 }
}

export function addressToCellRef(addr: CellAddress): string {
  return `${colToLetter(addr.col)}${addr.row + 1}`
}

// -- Range utilities --
export function getSelectionRange(sel: SelectionState): { startRow: number; startCol: number; endRow: number; endCol: number } | null {
  if (!sel.rangeStart || !sel.rangeEnd) return null
  return {
    startRow: Math.min(sel.rangeStart.row, sel.rangeEnd.row),
    startCol: Math.min(sel.rangeStart.col, sel.rangeEnd.col),
    endRow: Math.max(sel.rangeStart.row, sel.rangeEnd.row),
    endCol: Math.max(sel.rangeStart.col, sel.rangeEnd.col),
  }
}

export function isCellInRange(row: number, col: number, range: { startRow: number; startCol: number; endRow: number; endCol: number }): boolean {
  return row >= range.startRow && row <= range.endRow && col >= range.startCol && col <= range.endCol
}

// -- Offset computation --
export function computeOffsets(sizes: DimensionSizes, count: number): number[] {
  const offsets = new Array(count + 1)
  offsets[0] = 0
  for (let i = 0; i < count; i++) {
    offsets[i + 1] = offsets[i] + (sizes[i] ?? DEFAULT_COL_WIDTH)
  }
  return offsets
}

export function computeRowOffsets(sizes: DimensionSizes, count: number): number[] {
  const offsets = new Array(count + 1)
  offsets[0] = 0
  for (let i = 0; i < count; i++) {
    offsets[i + 1] = offsets[i] + (sizes[i] ?? DEFAULT_ROW_HEIGHT)
  }
  return offsets
}

// -- Binary search for visible range --
export function findVisibleStart(offsets: number[], scrollPos: number): number {
  let lo = 0, hi = offsets.length - 2
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (offsets[mid + 1] < scrollPos) lo = mid + 1
    else hi = mid
  }
  return lo
}

export function findVisibleEnd(offsets: number[], scrollPos: number, viewportSize: number): number {
  let lo = 0, hi = offsets.length - 2
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (offsets[mid] <= scrollPos + viewportSize) lo = mid
    else hi = mid - 1
  }
  return lo
}

// -- Sheet creation --
export function createSheet(name: string): Sheet {
  return {
    id: uuidv4(),
    name,
    cells: {},
    colWidths: {},
    rowHeights: {},
  }
}

// -- Default AI config --
export function defaultAIConfig(): AIConfig {
  return {
    provider: 'openai',
    apiKey: '',
    model: 'gpt-4o',
    toolMode: 'auto',
  }
}

type LegacyAIConfig = Partial<AIConfig> & { injectTools?: boolean }

export function normalizeToolMode(mode?: string): ToolMode {
  if (mode === 'auto' || mode === 'native' || mode === 'json' || mode === 'inject' || mode === 'none') {
    return mode
  }
  return 'auto'
}

export function normalizeAIConfig(config?: LegacyAIConfig): AIConfig {
  const toolMode = config?.toolMode
    ?? (config?.injectTools ? 'inject' : defaultAIConfig().toolMode)

  return {
    ...defaultAIConfig(),
    ...config,
    toolMode: normalizeToolMode(toolMode),
  }
}
