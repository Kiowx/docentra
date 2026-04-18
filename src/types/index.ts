// -- Cell --
export interface CellData {
  value: string
  formula?: string
  computedValue?: string | number | boolean | null
  format?: CellFormat
}

export type NumberFormat = 'general' | 'number' | 'currency' | 'percent' | 'scientific' | 'date' | 'text'

export interface CellFormat {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  align?: 'left' | 'center' | 'right'
  wrapText?: boolean
  bgColor?: string
  textColor?: string
  fontSize?: number
  numberFormat?: NumberFormat
}

export type DimensionSizes = Record<number, number>

// -- Address --
export interface CellAddress {
  row: number
  col: number
}

// -- Selection --
export interface SelectionState {
  activeCell: CellAddress
  rangeStart?: CellAddress
  rangeEnd?: CellAddress
}

// -- Edit Mode --
export type EditMode = 'none' | 'cell' | 'formulaBar'

// -- Sheet --
export interface Sheet {
  id: string
  name: string
  cells: Record<string, CellData>
  colWidths: DimensionSizes
  rowHeights: DimensionSizes
}

// -- Chat --
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  toolCalls?: ToolCallResult[]
  isStreaming?: boolean
}

export interface ToolCallResult {
  toolName: string
  input: Record<string, unknown>
  result: string
}

// -- AI Config --
export type ToolMode = 'auto' | 'native' | 'json' | 'inject' | 'none'

export interface AIConfig {
  provider: 'claude' | 'openai' | 'ollama'
  apiKey: string
  model: string
  baseUrl?: string
  toolMode: ToolMode
}

// -- Context Menu --
export interface ContextMenuState {
  visible: boolean
  x: number
  y: number
  target?: 'cell' | 'rowHeader' | 'colHeader'
  targetIndex?: number
}

// -- Clipboard --
export interface ClipboardData {
  data: string[][]
  cutRange?: { startRow: number; startCol: number; endRow: number; endCol: number }
  isCut: boolean
}

// -- Import Validation --
export interface ImportValidationIssue {
  sheetName: string
  cellRef?: string
  kind: 'value' | 'formula' | 'truncated'
  expected: string
  actual: string
}

export interface ImportValidationReport {
  fileName: string
  generatedAt: number
  status: 'success' | 'warning'
  workbookSheetCount: number
  importedSheetCount: number
  importedCellCount: number
  checkedCellCount: number
  mismatchCount: number
  truncatedCellCount: number
  issues: ImportValidationIssue[]
}

// -- Default Configs --
export const DEFAULT_COL_WIDTH = 100
export const DEFAULT_ROW_HEIGHT = 25
export const TOTAL_COLS = 200
export const TOTAL_ROWS = 5000
