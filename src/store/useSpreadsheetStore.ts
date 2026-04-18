import { create } from 'zustand'
import type {
  CellData, CellFormat, CellAddress, SelectionState, EditMode,
  Sheet, ChatMessage, AIConfig, ContextMenuState, ClipboardData, ImportValidationReport, DimensionSizes,
} from '@/types'
import { DEFAULT_COL_WIDTH, DEFAULT_ROW_HEIGHT, TOTAL_COLS, TOTAL_ROWS } from '@/types'
import { cellKey, parseCellKey, createSheet, normalizeAIConfig } from '@/utils/cellUtils'
import { adjustFormulaReferences, shiftFormulaReferences, type FormulaStructureChange } from '@/utils/formulaReferences'
import { recalculateSheetFormulas } from '@/utils/sheetFormulaUtils'

interface SpreadsheetState {
  // Data
  sheets: Sheet[]
  activeSheetId: string

  // UI State
  selection: SelectionState
  editMode: EditMode
  editValue: string
  contextMenu: ContextMenuState
  clipboard: ClipboardData | null
  importReport: ImportValidationReport | null

  // Chat
  chatMessages: ChatMessage[]
  chatLoading: boolean
  streamingMessageId: string | null
  streamingContent: string

  // AI Config
  aiConfig: AIConfig

  // UI Panels
  showSettings: boolean
  chatPanelWidth: number

  // History
  historyPast: DocumentSnapshot[]
  historyFuture: DocumentSnapshot[]
}

interface DocumentSnapshot {
  sheets: Sheet[]
  activeSheetId: string
  selection: SelectionState
}

interface SpreadsheetActions {
  // Getters
  getActiveSheet: () => Sheet
  getCellData: (row: number, col: number) => CellData | undefined
  getCellDisplayValue: (row: number, col: number) => string

  // Cell operations
  setCell: (row: number, col: number, value: string, sheetId?: string) => void
  setCellFormula: (row: number, col: number, formula: string, sheetId?: string) => void
  setCellFormat: (range: { startRow: number; startCol: number; endRow: number; endCol: number }, format: Partial<CellFormat>, sheetId?: string) => void
  setRange: (startRow: number, startCol: number, data: string[][], sheetId?: string) => void
  clearCells: (range: { startRow: number; startCol: number; endRow: number; endCol: number }) => void

  // Sheet operations
  addSheet: (name?: string) => void
  duplicateSheet: (id?: string) => void
  deleteSheet: (id: string) => void
  renameSheet: (id: string, name: string) => void
  setActiveSheet: (id: string) => void
  addRow: (index: number, count?: number) => void
  deleteRow: (index: number, count?: number) => void
  addColumn: (index: number, count?: number) => void
  deleteColumn: (index: number, count?: number) => void

  // Selection
  setActiveCell: (row: number, col: number) => void
  setSelectionRange: (start: CellAddress, end: CellAddress) => void
  clearRangeSelection: () => void
  setEditMode: (mode: EditMode) => void
  setEditValue: (value: string) => void
  commitEdit: () => void
  cancelEdit: () => void

  // Column/Row sizing
  setColWidth: (colIndex: number, width: number) => void
  setRowHeight: (rowIndex: number, height: number) => void

  // Clipboard
  copy: (range: { startRow: number; startCol: number; endRow: number; endCol: number }) => void
  cut: (range: { startRow: number; startCol: number; endRow: number; endCol: number }) => void
  paste: (targetCell: CellAddress) => void
  importWorkbookData: (sheets: Sheet[], report: ImportValidationReport) => void
  clearImportReport: () => void

  undo: () => void
  redo: () => void

  // Context menu
  showContextMenu: (x: number, y: number, target?: 'cell' | 'rowHeader' | 'colHeader', targetIndex?: number) => void
  hideContextMenu: () => void

  // Sort
  sortRange: (range: { startRow: number; startCol: number; endRow: number; endCol: number }, column: number, direction: 'asc' | 'desc') => void

  // Chat
  addChatMessage: (msg: ChatMessage) => void
  appendMessageContent: (id: string, chunk: string) => void
  updateMessage: (id: string, updater: (message: ChatMessage) => ChatMessage) => void
  deleteChatMessage: (id: string) => void
  setChatLoading: (loading: boolean) => void
  clearChat: () => void

  // AI Config
  setAIConfig: (config: Partial<AIConfig>) => void

  // UI
  setShowSettings: (show: boolean) => void
  setChatPanelWidth: (width: number) => void

  // Formula recalculation
  recalcFormulas: (sheetId?: string) => void
}

type Store = SpreadsheetState & SpreadsheetActions

const initialSheet = createSheet('工作表1')
const STORAGE_NAME = 'ai-spreadsheet-storage'
const STORAGE_VERSION = 1
const HISTORY_LIMIT = 50

type PersistedStoreState = Pick<SpreadsheetState, 'sheets' | 'activeSheetId' | 'aiConfig' | 'chatPanelWidth'>

interface PersistedEnvelope {
  state: PersistedStoreState
  version: number
}

interface HydratedPersistedState {
  state: Partial<PersistedStoreState>
  rawSerialized: string | null
  needsRewrite: boolean
}

function normalizeDimensionSizes(
  sizes: DimensionSizes | number[] | undefined,
  defaultSize: number,
): DimensionSizes {
  const normalized: DimensionSizes = {}
  if (!sizes) return normalized

  Object.entries(sizes).forEach(([rawIndex, rawValue]) => {
    const index = Number(rawIndex)
    const value = Number(rawValue)
    if (!Number.isInteger(index) || !Number.isFinite(value)) return
    if (value !== defaultSize) {
      normalized[index] = value
    }
  })

  return normalized
}

function normalizeSheet(sheet: Sheet): Sheet {
  return {
    ...sheet,
    colWidths: normalizeDimensionSizes(sheet.colWidths as DimensionSizes | number[], DEFAULT_COL_WIDTH),
    rowHeights: normalizeDimensionSizes(sheet.rowHeights as DimensionSizes | number[], DEFAULT_ROW_HEIGHT),
  }
}

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function buildPersistedState(state: Pick<SpreadsheetState, 'sheets' | 'activeSheetId' | 'aiConfig' | 'chatPanelWidth'>): PersistedStoreState {
  return {
    sheets: state.sheets,
    activeSheetId: state.activeSheetId,
    aiConfig: normalizeAIConfig(state.aiConfig),
    chatPanelWidth: state.chatPanelWidth,
  }
}

function buildDocumentSnapshot(state: Pick<SpreadsheetState, 'sheets' | 'activeSheetId' | 'selection'>): DocumentSnapshot {
  return {
    sheets: state.sheets,
    activeSheetId: state.activeSheetId,
    selection: state.selection,
  }
}

function parseClipboardText(text: string): string[][] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  return normalized.split('\n').map((line) => line.split('\t'))
}

function serializePersistedState(state: PersistedStoreState): string {
  return JSON.stringify({
    state,
    version: STORAGE_VERSION,
  } satisfies PersistedEnvelope)
}

function hydratePersistedState(): HydratedPersistedState {
  const storage = getStorage()
  if (!storage) {
    return { state: {}, rawSerialized: null, needsRewrite: false }
  }

  const rawSerialized = storage.getItem(STORAGE_NAME)
  if (!rawSerialized) {
    return { state: {}, rawSerialized: null, needsRewrite: false }
  }

  try {
    const parsed = JSON.parse(rawSerialized) as Partial<PersistedEnvelope & PersistedStoreState>
    const persistedState = (parsed.state ?? parsed) as Partial<PersistedStoreState>
    const normalizedSheets = Array.isArray(persistedState.sheets) && persistedState.sheets.length > 0
      ? persistedState.sheets.map((sheet) => recalculateSheetFormulas(normalizeSheet(sheet)))
      : undefined
    const activeSheetId = normalizedSheets?.some((sheet) => sheet.id === persistedState.activeSheetId)
      ? persistedState.activeSheetId
      : normalizedSheets?.[0]?.id

    const normalizedState: Partial<PersistedStoreState> = {
      sheets: normalizedSheets,
      activeSheetId,
      aiConfig: normalizeAIConfig(persistedState.aiConfig),
      chatPanelWidth: persistedState.chatPanelWidth,
    }

    const serializedNormalizedState = serializePersistedState({
      sheets: normalizedSheets ?? [initialSheet],
      activeSheetId: activeSheetId ?? normalizedSheets?.[0]?.id ?? initialSheet.id,
      aiConfig: normalizeAIConfig(persistedState.aiConfig),
      chatPanelWidth: persistedState.chatPanelWidth ?? 350,
    })

    return {
      state: normalizedState,
      rawSerialized,
      needsRewrite: rawSerialized !== serializedNormalizedState,
    }
  } catch {
    return { state: {}, rawSerialized, needsRewrite: true }
  }
}

const hydratedPersistedState = hydratePersistedState()
let lastPersistedSerialized = hydratedPersistedState.rawSerialized
let persistTimer: ReturnType<typeof setTimeout> | null = null

function schedulePersist(getState: () => Store) {
  const storage = getStorage()
  if (!storage) return

  if (persistTimer) {
    clearTimeout(persistTimer)
  }

  persistTimer = setTimeout(() => {
    persistTimer = null
    const serializedState = serializePersistedState(buildPersistedState(getState()))
    if (serializedState === lastPersistedSerialized) return
    storage.setItem(STORAGE_NAME, serializedState)
    lastPersistedSerialized = serializedState
  }, 120)
}

function remapCellPosition(
  row: number,
  col: number,
  change: FormulaStructureChange,
): CellAddress | null {
  switch (change.type) {
    case 'insert-row': {
      const nextRow = row >= change.index ? row + change.count : row
      return nextRow < TOTAL_ROWS ? { row: nextRow, col } : null
    }
    case 'delete-row': {
      if (row >= change.index && row < change.index + change.count) return null
      const nextRow = row >= change.index + change.count ? row - change.count : row
      return nextRow >= 0 ? { row: nextRow, col } : null
    }
    case 'insert-col': {
      const nextCol = col >= change.index ? col + change.count : col
      return nextCol < TOTAL_COLS ? { row, col: nextCol } : null
    }
    case 'delete-col': {
      if (col >= change.index && col < change.index + change.count) return null
      const nextCol = col >= change.index + change.count ? col - change.count : col
      return nextCol >= 0 ? { row, col: nextCol } : null
    }
  }
}

function remapDimensionIndex(
  index: number,
  change: FormulaStructureChange,
): number | null {
  switch (change.type) {
    case 'insert-row':
    case 'insert-col':
      return index >= change.index ? index + change.count : index
    case 'delete-row':
    case 'delete-col':
      if (index >= change.index && index < change.index + change.count) return null
      return index >= change.index + change.count ? index - change.count : index
  }
}

function remapDimensionSizes(
  sizes: DimensionSizes,
  change: FormulaStructureChange,
  limit: number,
): DimensionSizes {
  const next: DimensionSizes = {}

  Object.entries(sizes).forEach(([rawIndex, size]) => {
    const mappedIndex = remapDimensionIndex(Number(rawIndex), change)
    if (mappedIndex === null || mappedIndex < 0 || mappedIndex >= limit) return
    next[mappedIndex] = size
  })

  return next
}

function rewriteFormulaCell(cell: CellData, change: FormulaStructureChange): CellData {
  if (!cell.formula) {
    return cell
  }

  const adjustedFormula = adjustFormulaReferences(cell.formula, change)
  if (!adjustedFormula) {
    return {
      value: '#REF!',
      computedValue: '#REF!',
      format: cell.format,
    }
  }

  return {
    ...cell,
    value: `=${adjustedFormula}`,
    formula: adjustedFormula,
    computedValue: undefined,
  }
}

function applyStructureChange(sheet: Sheet, change: FormulaStructureChange): Sheet {
  const cells: Record<string, CellData> = {}

  for (const [key, cell] of Object.entries(sheet.cells)) {
    const [row, col] = parseCellKey(key)
    const nextPosition = remapCellPosition(row, col, change)
    if (!nextPosition) continue

    cells[cellKey(nextPosition.row, nextPosition.col)] = rewriteFormulaCell(cell, change)
  }

  return {
    ...sheet,
    cells,
    rowHeights: change.type === 'insert-row' || change.type === 'delete-row'
      ? remapDimensionSizes(sheet.rowHeights, change, TOTAL_ROWS)
      : { ...sheet.rowHeights },
    colWidths: change.type === 'insert-col' || change.type === 'delete-col'
      ? remapDimensionSizes(sheet.colWidths, change, TOTAL_COLS)
      : { ...sheet.colWidths },
  }
}

function updateSheetCells(
  sheet: Sheet,
  updater: (cells: Record<string, CellData>, changedKeys: string[]) => boolean,
): Sheet {
  const cells = { ...sheet.cells }
  const changedKeys: string[] = []
  const changed = updater(cells, changedKeys)

  if (!changed) {
    return sheet
  }

  return recalculateSheetFormulas({ ...sheet, cells }, changedKeys)
}

export const useSpreadsheetStore = create<Store>()(
  (set, get) => {
    const setDocumentState = (
      partial:
        | Store
        | Partial<Store>
        | ((state: Store) => Store | Partial<Store>),
      replace?: boolean,
    ) => {
      const previousState = get()
      const resolvedPartial = typeof partial === 'function'
        ? partial(previousState)
        : partial

      const nextSheets = 'sheets' in resolvedPartial && resolvedPartial.sheets !== undefined
        ? resolvedPartial.sheets
        : previousState.sheets
      const nextActiveSheetId = 'activeSheetId' in resolvedPartial && resolvedPartial.activeSheetId !== undefined
        ? resolvedPartial.activeSheetId
        : previousState.activeSheetId

      const documentChanged = (
        nextSheets !== previousState.sheets
        || nextActiveSheetId !== previousState.activeSheetId
      )

      const nextPartial = documentChanged
        ? {
            ...resolvedPartial,
            historyPast: [
              ...previousState.historyPast.slice(-(HISTORY_LIMIT - 1)),
              buildDocumentSnapshot(previousState),
            ],
            historyFuture: [],
          }
        : resolvedPartial

      if (replace === undefined) {
        set(nextPartial as Parameters<typeof set>[0])
      } else {
        set(nextPartial as Parameters<typeof set>[0], replace as Parameters<typeof set>[1])
      }

      if (documentChanged) {
        schedulePersist(get)
      }
    }

    const setPersistedState = (
      partial:
        | Store
        | Partial<Store>
        | ((state: Store) => Store | Partial<Store>),
      replace?: boolean,
    ) => {
      if (replace === undefined) {
        set(partial as Parameters<typeof set>[0])
      } else {
        set(partial as Parameters<typeof set>[0], replace as Parameters<typeof set>[1])
      }
      schedulePersist(get)
    }

    return {
      // Initial state
      sheets: hydratedPersistedState.state.sheets ?? [initialSheet],
      activeSheetId: hydratedPersistedState.state.activeSheetId ?? hydratedPersistedState.state.sheets?.[0]?.id ?? initialSheet.id,
      selection: { activeCell: { row: 0, col: 0 } },
      editMode: 'none' as EditMode,
      editValue: '',
      contextMenu: { visible: false, x: 0, y: 0 },
      clipboard: null,
      importReport: null,
      chatMessages: [],
      chatLoading: false,
      streamingMessageId: null,
      streamingContent: '',
      aiConfig: normalizeAIConfig(hydratedPersistedState.state.aiConfig),
      showSettings: false,
      chatPanelWidth: hydratedPersistedState.state.chatPanelWidth ?? 350,
      historyPast: [],
      historyFuture: [],

      // Getters
      getActiveSheet: () => {
        const s = get()
        return s.sheets.find(sh => sh.id === s.activeSheetId) || s.sheets[0]
      },

      getCellData: (row, col) => {
        const sheet = get().getActiveSheet()
        return sheet?.cells[cellKey(row, col)]
      },

      getCellDisplayValue: (row, col) => {
        const cell = get().getCellData(row, col)
        if (!cell) return ''
        if (cell.computedValue !== undefined && cell.computedValue !== null) {
          if (typeof cell.computedValue === 'number') {
            if (Number.isInteger(cell.computedValue)) return cell.computedValue.toString()
            return cell.computedValue.toFixed(2).replace(/\.?0+$/, '')
          }
          return String(cell.computedValue)
        }
        return cell.value || ''
      },

      // Cell operations
      setCell: (row, col, value, sheetId) => {
        setDocumentState(s => {
          const sid = sheetId || s.activeSheetId
          const sheets = s.sheets.map(sh => {
            if (sh.id !== sid) return sh
            return updateSheetCells(sh, (cells, changedKeys) => {
              const key = cellKey(row, col)
              const existing = cells[key]

              if (value === '' || value === undefined) {
                if (!existing) return false
                delete cells[key]
                changedKeys.push(key)
                return true
              }

              if (value.startsWith('=')) {
                const formula = value.slice(1)
                if (existing?.value === value && existing.formula === formula) {
                  return false
                }
                cells[key] = { ...existing, value, formula }
                changedKeys.push(key)
                return true
              }

              if (existing?.value === value && !existing.formula && existing.computedValue === undefined) {
                return false
              }

              cells[key] = { value, format: existing?.format }
              changedKeys.push(key)
              return true
            })
          })
          return { sheets }
        })
      },

      setCellFormula: (row, col, formula, sheetId) => {
        const fullFormula = formula.startsWith('=') ? formula : `=${formula}`
        get().setCell(row, col, fullFormula, sheetId)
      },

      setCellFormat: (range, format, sheetId) => {
        setDocumentState(s => {
          const sid = sheetId || s.activeSheetId
          const sheets = s.sheets.map(sh => {
            if (sh.id !== sid) return sh
            const cells = { ...sh.cells }
            for (let r = range.startRow; r <= range.endRow; r++) {
              for (let c = range.startCol; c <= range.endCol; c++) {
                const key = cellKey(r, c)
                const existing = cells[key] || { value: '' }
                cells[key] = {
                  ...existing,
                  format: { ...existing.format, ...format },
                }
              }
            }
            return { ...sh, cells }
          })
          return { sheets }
        })
      },

      setRange: (startRow, startCol, data, sheetId) => {
        setDocumentState(s => {
          const sid = sheetId || s.activeSheetId
          const sheets = s.sheets.map(sh => {
            if (sh.id !== sid) return sh
            return updateSheetCells(sh, (cells, changedKeys) => {
              let didChange = false

              data.forEach((row, ri) => {
                row.forEach((val, ci) => {
                  const r = startRow + ri
                  const c = startCol + ci
                  const key = cellKey(r, c)
                  const existing = cells[key]
                  const nextValue = val === null || val === undefined ? '' : String(val)

                  if (nextValue === '') {
                    if (!existing) return
                    delete cells[key]
                    changedKeys.push(key)
                    didChange = true
                    return
                  }

                  if (nextValue.startsWith('=')) {
                    const formula = nextValue.slice(1)
                    if (existing?.value === nextValue && existing.formula === formula) return
                    cells[key] = { ...existing, value: nextValue, formula }
                    changedKeys.push(key)
                    didChange = true
                    return
                  }

                  if (existing?.value === nextValue && !existing.formula && existing.computedValue === undefined) {
                    return
                  }

                  cells[key] = { value: nextValue, format: existing?.format }
                  changedKeys.push(key)
                  didChange = true
                })
              })

              return didChange
            })
          })
          return { sheets }
        })
      },

      clearCells: (range) => {
        setDocumentState(s => {
          const sheets = s.sheets.map(sh => {
            if (sh.id !== s.activeSheetId) return sh
            return updateSheetCells(sh, (cells, changedKeys) => {
              let didChange = false

              for (let r = range.startRow; r <= range.endRow; r++) {
                for (let c = range.startCol; c <= range.endCol; c++) {
                  const key = cellKey(r, c)
                  if (!cells[key]) continue
                  delete cells[key]
                  changedKeys.push(key)
                  didChange = true
                }
              }

              return didChange
            })
          })
          return { sheets }
        })
      },

      // Sheet operations
      addSheet: (name) => {
        const sheet = createSheet(name || `工作表${get().sheets.length + 1}`)
        setDocumentState(s => ({ sheets: [...s.sheets, sheet], activeSheetId: sheet.id }))
      },

      duplicateSheet: (id) => {
        setDocumentState(s => {
          const sourceSheet = s.sheets.find((sheet) => sheet.id === (id || s.activeSheetId))
          if (!sourceSheet) return {}

          const duplicatedSheet = {
            ...sourceSheet,
            id: createSheet(sourceSheet.name).id,
            name: `${sourceSheet.name} 副本`,
            cells: Object.fromEntries(
              Object.entries(sourceSheet.cells).map(([key, cell]) => [key, { ...cell, format: cell.format ? { ...cell.format } : undefined }]),
            ),
            colWidths: { ...sourceSheet.colWidths },
            rowHeights: { ...sourceSheet.rowHeights },
          }

          return {
            sheets: [...s.sheets, duplicatedSheet],
            activeSheetId: duplicatedSheet.id,
          }
        })
      },

      deleteSheet: (id) => {
        const s = get()
        if (s.sheets.length <= 1) return
        const sheets = s.sheets.filter(sh => sh.id !== id)
        const activeSheetId = id === s.activeSheetId ? sheets[0].id : s.activeSheetId
        setDocumentState({ sheets, activeSheetId })
      },

      renameSheet: (id, name) => {
        setDocumentState(s => ({
          sheets: s.sheets.map(sh => sh.id === id ? { ...sh, name } : sh),
        }))
      },

      setActiveSheet: (id) => setPersistedState({ activeSheetId: id }),

      addRow: (index, count = 1) => {
        setDocumentState(s => {
          const sheets = s.sheets.map(sh => {
            if (sh.id !== s.activeSheetId) return sh
            return recalculateSheetFormulas(applyStructureChange(sh, { type: 'insert-row', index, count }))
          })
          return { sheets }
        })
      },

      deleteRow: (index, count = 1) => {
        setDocumentState(s => {
          const sheets = s.sheets.map(sh => {
            if (sh.id !== s.activeSheetId) return sh
            return recalculateSheetFormulas(applyStructureChange(sh, { type: 'delete-row', index, count }))
          })
          return { sheets }
        })
      },

      addColumn: (index, count = 1) => {
        setDocumentState(s => {
          const sheets = s.sheets.map(sh => {
            if (sh.id !== s.activeSheetId) return sh
            return recalculateSheetFormulas(applyStructureChange(sh, { type: 'insert-col', index, count }))
          })
          return { sheets }
        })
      },

      deleteColumn: (index, count = 1) => {
        setDocumentState(s => {
          const sheets = s.sheets.map(sh => {
            if (sh.id !== s.activeSheetId) return sh
            return recalculateSheetFormulas(applyStructureChange(sh, { type: 'delete-col', index, count }))
          })
          return { sheets }
        })
      },

      // Selection
      setActiveCell: (row, col) => {
        set(s => ({
          selection: { activeCell: { row, col } },
          editMode: 'none' as EditMode,
          editValue: '',
        }))
      },

      setSelectionRange: (start, end) => {
        set(s => ({
          selection: {
            activeCell: s.selection.activeCell,
            rangeStart: start,
            rangeEnd: end,
          },
        }))
      },

      clearRangeSelection: () => {
        set(s => ({
          selection: { activeCell: s.selection.activeCell },
        }))
      },

      setEditMode: (mode) => set({ editMode: mode }),

      setEditValue: (value) => set({ editValue: value }),

      commitEdit: () => {
        const s = get()
        if (s.editMode === 'none') return
        const { row, col } = s.selection.activeCell
        const value = s.editValue
        setDocumentState(state => {
          const sid = state.activeSheetId
          const sheets = state.sheets.map(sh => {
            if (sh.id !== sid) return sh
            return updateSheetCells(sh, (cells, changedKeys) => {
              const key = cellKey(row, col)
              const existing = cells[key]

              if (value === '' || value === undefined) {
                if (!existing) return false
                delete cells[key]
                changedKeys.push(key)
                return true
              }

              if (value.startsWith('=')) {
                const formula = value.slice(1)
                if (existing?.value === value && existing.formula === formula) return false
                cells[key] = { ...existing, value, formula }
                changedKeys.push(key)
                return true
              }

              if (existing?.value === value && !existing.formula && existing.computedValue === undefined) {
                return false
              }

              cells[key] = { value, format: existing?.format }
              changedKeys.push(key)
              return true
            })
          })

          return { sheets, editMode: 'none', editValue: '' }
        })
      },

      cancelEdit: () => set({ editMode: 'none', editValue: '' }),

      // Sizing
      setColWidth: (colIndex, width) => {
        setDocumentState(s => {
          const sheets = s.sheets.map(sh => {
            if (sh.id !== s.activeSheetId) return sh
            const nextWidth = Math.max(30, width)
            const colWidths = { ...sh.colWidths }
            if (nextWidth === DEFAULT_COL_WIDTH) delete colWidths[colIndex]
            else colWidths[colIndex] = nextWidth
            return { ...sh, colWidths }
          })
          return { sheets }
        })
      },

      setRowHeight: (rowIndex, height) => {
        setDocumentState(s => {
          const sheets = s.sheets.map(sh => {
            if (sh.id !== s.activeSheetId) return sh
            const nextHeight = Math.max(15, height)
            const rowHeights = { ...sh.rowHeights }
            if (nextHeight === DEFAULT_ROW_HEIGHT) delete rowHeights[rowIndex]
            else rowHeights[rowIndex] = nextHeight
            return { ...sh, rowHeights }
          })
          return { sheets }
        })
      },

      // Clipboard
      copy: (range) => {
        const s = get()
        const sheet = s.getActiveSheet()
        const data: string[][] = []
        for (let r = range.startRow; r <= range.endRow; r++) {
          const row: string[] = []
          for (let c = range.startCol; c <= range.endCol; c++) {
            const cell = sheet.cells[cellKey(r, c)]
            row.push(cell?.value || '')
          }
          data.push(row)
        }
        set({ clipboard: { data, cutRange: range, isCut: false } })
        try {
          navigator.clipboard.writeText(data.map(r => r.join('\t')).join('\n'))
        } catch {}
      },

      cut: (range) => {
        const s = get()
        const sheet = s.getActiveSheet()
        const data: string[][] = []
        for (let r = range.startRow; r <= range.endRow; r++) {
          const row: string[] = []
          for (let c = range.startCol; c <= range.endCol; c++) {
            const cell = sheet.cells[cellKey(r, c)]
            row.push(cell?.value || '')
          }
          data.push(row)
        }
        set({ clipboard: { data, cutRange: range, isCut: true } })
        try {
          navigator.clipboard.writeText(data.map(r => r.join('\t')).join('\n'))
        } catch {}
      },

      paste: (targetCell) => {
        const s = get()
        const clip = s.clipboard
        if (!clip) {
          navigator.clipboard.readText().then((text) => {
            const trimmed = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
            if (!trimmed) return
            get().setRange(targetCell.row, targetCell.col, parseClipboardText(trimmed))
          }).catch(() => {})
          return
        }

        setDocumentState(state => {
          const sheets = state.sheets.map(sh => {
            if (sh.id !== state.activeSheetId) return sh
            return updateSheetCells(sh, (cells, changedKeys) => {
              let didChange = false

              if (clip.isCut && clip.cutRange) {
                for (let r = clip.cutRange.startRow; r <= clip.cutRange.endRow; r++) {
                  for (let c = clip.cutRange.startCol; c <= clip.cutRange.endCol; c++) {
                    const key = cellKey(r, c)
                    if (!cells[key]) continue
                    delete cells[key]
                    changedKeys.push(key)
                    didChange = true
                  }
                }
              }

              const srcRow = clip.cutRange?.startRow ?? 0
              const srcCol = clip.cutRange?.startCol ?? 0
              const dRow = targetCell.row - srcRow
              const dCol = targetCell.col - srcCol

              clip.data.forEach((row, ri) => {
                row.forEach((val, ci) => {
                  const r = targetCell.row + ri
                  const c = targetCell.col + ci
                  const key = cellKey(r, c)
                  const existing = cells[key]

                  if (val === '') {
                    if (!existing) return
                    delete cells[key]
                    changedKeys.push(key)
                    didChange = true
                    return
                  }

                  if (val.startsWith('=')) {
                    let adjustedVal = val
                    if (!clip.isCut) {
                      adjustedVal = shiftFormulaReferences(val, dRow, dCol)
                    }
                    const formula = adjustedVal.slice(1)
                    if (existing?.value === adjustedVal && existing.formula === formula) return
                    cells[key] = { ...existing, value: adjustedVal, formula, format: existing?.format }
                    changedKeys.push(key)
                    didChange = true
                    return
                  }

                  if (existing?.value === val && !existing.formula && existing.computedValue === undefined) {
                    return
                  }

                  cells[key] = { value: val, format: existing?.format }
                  changedKeys.push(key)
                  didChange = true
                })
              })

              return didChange
            })
          })

          return {
            sheets,
            clipboard: clip.isCut ? null : state.clipboard,
          }
        })
      },

      importWorkbookData: (sheets, report) => {
        const normalizedSheets = sheets.map((sheet) => recalculateSheetFormulas(sheet))
        setDocumentState({
          sheets: normalizedSheets,
          activeSheetId: normalizedSheets[0]?.id || initialSheet.id,
          selection: { activeCell: { row: 0, col: 0 } },
          editMode: 'none',
          editValue: '',
          contextMenu: { visible: false, x: 0, y: 0 },
          clipboard: null,
          importReport: report,
        })
      },

      clearImportReport: () => set({ importReport: null }),

      undo: () => {
        const s = get()
        const previous = s.historyPast[s.historyPast.length - 1]
        if (!previous) return

        set({
          sheets: previous.sheets,
          activeSheetId: previous.activeSheetId,
          historyPast: s.historyPast.slice(0, -1),
          historyFuture: [buildDocumentSnapshot(s), ...s.historyFuture],
          selection: previous.selection || { activeCell: { row: 0, col: 0 } },
          editMode: 'none',
          editValue: '',
          contextMenu: { visible: false, x: 0, y: 0 },
        })
        schedulePersist(get)
      },

      redo: () => {
        const s = get()
        const next = s.historyFuture[0]
        if (!next) return

        set({
          sheets: next.sheets,
          activeSheetId: next.activeSheetId,
          historyPast: [...s.historyPast, buildDocumentSnapshot(s)],
          historyFuture: s.historyFuture.slice(1),
          selection: next.selection || { activeCell: { row: 0, col: 0 } },
          editMode: 'none',
          editValue: '',
          contextMenu: { visible: false, x: 0, y: 0 },
        })
        schedulePersist(get)
      },

      // Context menu
      showContextMenu: (x, y, target, targetIndex) => {
        set({ contextMenu: { visible: true, x, y, target, targetIndex } })
      },
      hideContextMenu: () => set({ contextMenu: { visible: false, x: 0, y: 0 } }),

      // Sort
      sortRange: (range, column, direction) => {
        setDocumentState(s => {
          const sheets = s.sheets.map(sh => {
            if (sh.id !== s.activeSheetId) return sh
            const rows: { cells: Record<string, CellData>; sortVal: string }[] = []
            for (let r = range.startRow; r <= range.endRow; r++) {
              const rowCells: Record<string, CellData> = {}
              for (let c = range.startCol; c <= range.endCol; c++) {
                const key = cellKey(r, c)
                if (sh.cells[key]) rowCells[key] = sh.cells[key]
              }
              const sortCell = sh.cells[cellKey(r, column)]
              const sortVal = sortCell?.computedValue !== undefined && sortCell?.computedValue !== null
                ? String(sortCell.computedValue)
                : (sortCell?.value || '')
              rows.push({ cells: rowCells, sortVal })
            }
            rows.sort((a, b) => {
              const va = a.sortVal, vb = b.sortVal
              const na = Number(va), nb = Number(vb)
              if (!isNaN(na) && !isNaN(nb)) {
                return direction === 'asc' ? na - nb : nb - na
              }
              return direction === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
            })
            const cells = { ...sh.cells }
            // Remove old range
            for (let r = range.startRow; r <= range.endRow; r++) {
              for (let c = range.startCol; c <= range.endCol; c++) {
                delete cells[cellKey(r, c)]
              }
            }
            // Write sorted
            rows.forEach((row, i) => {
              const r = range.startRow + i
              Object.entries(row.cells).forEach(([key, val]) => {
                const [, c] = parseCellKey(key)
                cells[cellKey(r, c)] = val
              })
            })
            return recalculateSheetFormulas({ ...sh, cells })
          })
          return { sheets }
        })
      },

      // Chat
      addChatMessage: (msg) => set(s => ({ chatMessages: [...s.chatMessages, msg] })),
      appendMessageContent: (id, chunk) => set(s => {
        if (s.streamingMessageId !== id) {
          return { streamingMessageId: id, streamingContent: chunk }
        }
        return { streamingContent: s.streamingContent + chunk }
      }),
      updateMessage: (id, updater) => set(s => ({
        chatMessages: s.chatMessages.map(msg => (
          msg.id === id ? updater(msg) : msg
        )),
      })),
      deleteChatMessage: (id) => set(s => ({
        chatMessages: s.chatMessages.filter((msg) => msg.id !== id),
      })),
      setChatLoading: (loading) => set(s => {
        if (!loading && s.streamingMessageId) {
          // Finalize streaming: flush content into the chat message
          const msgs = s.chatMessages.map(msg =>
            msg.id === s.streamingMessageId
              ? { ...msg, content: s.streamingContent || msg.content, isStreaming: false }
              : msg
          )
          return { chatLoading: false, chatMessages: msgs, streamingMessageId: null, streamingContent: '' }
        }
        return { chatLoading: loading }
      }),
      clearChat: () => set({ chatMessages: [] }),

      // AI Config
      setAIConfig: (config) => setPersistedState(s => ({ aiConfig: normalizeAIConfig({ ...s.aiConfig, ...config }) })),

      // UI
      setShowSettings: (show) => set({ showSettings: show }),
      setChatPanelWidth: (width) => setPersistedState({ chatPanelWidth: Math.max(250, Math.min(600, width)) }),

      // Formula recalculation
      recalcFormulas: (sheetId) => {
        setDocumentState(s => {
          const sid = sheetId || s.activeSheetId
          const sheets = s.sheets.map(sh => {
            if (sh.id !== sid) return sh
            return recalculateSheetFormulas(sh)
          })
          return { sheets }
        })
      },
    }
  }
)

if (hydratedPersistedState.needsRewrite) {
  schedulePersist(useSpreadsheetStore.getState)
}
