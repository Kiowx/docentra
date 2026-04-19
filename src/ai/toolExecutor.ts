import { useSpreadsheetStore } from '@/store/useSpreadsheetStore'
import { cellKey, colToLetter } from '@/utils/cellUtils'

function colLetter(col: number): string {
  return colToLetter(col)
}

function assertPositiveNumber(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive number`)
  }
  return value
}

function assertNonNegativeInteger(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative integer`)
  }
  return value
}

function assertPositiveInteger(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive integer`)
  }
  return value
}

function assertStringValue(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${fieldName} must be a non-empty string`)
  }
  return value
}

function assertCellValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  throw new Error('value must be a string, number, boolean, or null')
}

function assertRangeData(value: unknown): string[][] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('data must be a non-empty 2D array')
  }

  const firstRowLength = Array.isArray(value[0]) ? value[0].length : -1
  if (firstRowLength <= 0) {
    throw new Error('data must contain at least one column')
  }

  return value.map((row, rowIndex) => {
    if (!Array.isArray(row) || row.length !== firstRowLength) {
      throw new Error(`data row ${rowIndex} must be an array with ${firstRowLength} columns`)
    }
    return row.map((cell) => assertCellValue(cell))
  })
}

function normalizeRange(input: Record<string, any>) {
  const startRow = assertNonNegativeInteger(input.startRow, 'startRow')
  const startCol = assertNonNegativeInteger(input.startCol, 'startCol')
  const endRow = assertNonNegativeInteger(input.endRow, 'endRow')
  const endCol = assertNonNegativeInteger(input.endCol, 'endCol')

  return {
    startRow: Math.min(startRow, endRow),
    startCol: Math.min(startCol, endCol),
    endRow: Math.max(startRow, endRow),
    endCol: Math.max(startCol, endCol),
  }
}

function assertFormatObject(format: unknown): Record<string, any> {
  if (!format || typeof format !== 'object' || Array.isArray(format)) {
    throw new Error('format must be an object')
  }
  return format as Record<string, any>
}

function assertOptionalStringValue(value: unknown, fieldName: string): string | undefined {
  if (value === undefined) return undefined
  return assertStringValue(value, fieldName)
}

function getSheetByName(sheetName: string) {
  const store = useSpreadsheetStore.getState()
  const exactMatch = store.sheets.find((sheet) => sheet.name === sheetName)
  if (exactMatch) return exactMatch

  const normalizedName = sheetName.toLowerCase()
  return store.sheets.find((sheet) => sheet.name.toLowerCase() === normalizedName)
}

function requireSheetByName(sheetName: unknown, fieldName = 'sheetName') {
  const name = assertStringValue(sheetName, fieldName)
  const sheet = getSheetByName(name)
  if (!sheet) {
    throw new Error(`Sheet "${name}" does not exist`)
  }
  return sheet
}

function selectRange(range: { startRow: number; startCol: number; endRow: number; endCol: number }) {
  const store = useSpreadsheetStore.getState()
  store.setActiveCell(range.startRow, range.startCol)
  if (range.startRow === range.endRow && range.startCol === range.endCol) {
    store.clearRangeSelection()
    return
  }
  store.setSelectionRange(
    { row: range.startRow, col: range.startCol },
    { row: range.endRow, col: range.endCol },
  )
}

function ensureFileExtension(fileName: string, extension: string) {
  const trimmed = fileName.trim()
  if (trimmed.toLowerCase().endsWith(extension.toLowerCase())) {
    return trimmed
  }
  return `${trimmed}${extension}`
}

function buildDefaultFileName(baseName: string, extension: string) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
  return ensureFileExtension(`${baseName}-${stamp}`, extension)
}

function serializeSheetData(maxRows: number, maxCols: number): string {
  const store = useSpreadsheetStore.getState()
  const sheet = store.getActiveSheet()

  // Determine the actual bounds of non-empty data
  let maxRowWithData = -1
  let maxColWithData = -1

  for (const key of Object.keys(sheet.cells)) {
    const parts = key.split(',')
    const r = parseInt(parts[0], 10)
    const c = parseInt(parts[1], 10)
    if (r > maxRowWithData) maxRowWithData = r
    if (c > maxColWithData) maxColWithData = c
  }

  // Use the larger of the data bounds or a minimum visible area, capped by maxRows/maxCols
  const rows = Math.min(Math.max(maxRowWithData + 1, 1), maxRows)
  const cols = Math.min(Math.max(maxColWithData + 1, 1), maxCols)

  // Build column headers
  const headers: string[] = ['']
  for (let c = 0; c < cols; c++) {
    headers.push(colLetter(c))
  }

  const lines: string[] = []
  lines.push(headers.join('\t'))

  for (let r = 0; r < rows; r++) {
    const row: string[] = [String(r + 1)]
    for (let c = 0; c < cols; c++) {
      const cell = sheet.cells[cellKey(r, c)]
      if (cell) {
        if (cell.computedValue !== undefined && cell.computedValue !== null) {
          row.push(String(cell.computedValue))
        } else if (cell.formula) {
          row.push(`=${cell.formula}`)
        } else {
          row.push(cell.value || '')
        }
      } else {
        row.push('')
      }
    }
    lines.push(row.join('\t'))
  }

  lines.unshift(`Sheet: "${sheet.name}"`)
  lines.unshift(`Showing ${rows} rows x ${cols} columns (row/col are 0-indexed):`)

  return lines.join('\n')
}

export async function executeTool(toolName: string, input: Record<string, any>): Promise<string> {
  const store = useSpreadsheetStore.getState()

  try {
    switch (toolName) {
      case 'set_cell': {
        const row = assertNonNegativeInteger(input.row, 'row')
        const col = assertNonNegativeInteger(input.col, 'col')
        const value = assertCellValue(input.value)
        store.setCell(row, col, value)
        return `Set cell ${colLetter(col)}${row + 1} = "${value}"`
      }

      case 'set_range': {
        const startRow = assertNonNegativeInteger(input.startRow, 'startRow')
        const startCol = assertNonNegativeInteger(input.startCol, 'startCol')
        const data = assertRangeData(input.data)
        store.setRange(startRow, startCol, data)
        const rows = data.length
        const cols = data[0]?.length || 0
        return `Set range ${colLetter(startCol)}${startRow + 1}:${colLetter(startCol + cols - 1)}${startRow + rows} (${rows} rows x ${cols} cols)`
      }

      case 'clear_cells': {
        const range = normalizeRange(input)
        selectRange(range)
        store.clearCells(range)
        return `Cleared range ${colLetter(range.startCol)}${range.startRow + 1}:${colLetter(range.endCol)}${range.endRow + 1}`
      }

      case 'add_row': {
        const index = assertNonNegativeInteger(input.index, 'index')
        const count = input.count === undefined ? 1 : assertPositiveInteger(input.count, 'count')
        store.addRow(index, count)
        return `Inserted ${count} row(s) at row ${index}`
      }

      case 'add_column': {
        const index = assertNonNegativeInteger(input.index, 'index')
        const count = input.count === undefined ? 1 : assertPositiveInteger(input.count, 'count')
        store.addColumn(index, count)
        return `Inserted ${count} column(s) at column ${colLetter(index)}`
      }

      case 'delete_row': {
        const index = assertNonNegativeInteger(input.index, 'index')
        const count = input.count === undefined ? 1 : assertPositiveInteger(input.count, 'count')
        store.deleteRow(index, count)
        return `Deleted ${count} row(s) starting at row ${index}`
      }

      case 'delete_column': {
        const index = assertNonNegativeInteger(input.index, 'index')
        const count = input.count === undefined ? 1 : assertPositiveInteger(input.count, 'count')
        store.deleteColumn(index, count)
        return `Deleted ${count} column(s) starting at column ${colLetter(index)}`
      }

      case 'format_cells': {
        const { startRow, startCol, endRow, endCol } = normalizeRange(input)
        const format = assertFormatObject(input.format)
        store.setCellFormat(
          { startRow, startCol, endRow, endCol },
          format
        )
        return `Formatted range ${colLetter(startCol)}${startRow + 1}:${colLetter(endCol)}${endRow + 1}`
      }

      case 'set_formula': {
        const row = assertNonNegativeInteger(input.row, 'row')
        const col = assertNonNegativeInteger(input.col, 'col')
        const formula = assertStringValue(input.formula, 'formula')
        store.setCellFormula(row, col, formula)
        return `Set formula in ${colLetter(col)}${row + 1} = ${formula}`
      }

      case 'sort_range': {
        const { startRow, startCol, endRow, endCol } = normalizeRange(input)
        const column = assertNonNegativeInteger(input.column, 'column')
        const direction = input.direction === 'desc' ? 'desc' : input.direction === 'asc' ? 'asc' : null
        if (!direction) {
          throw new Error('direction must be "asc" or "desc"')
        }
        store.sortRange(
          { startRow, startCol, endRow, endCol },
          column,
          direction
        )
        return `Sorted range ${colLetter(startCol)}${startRow + 1}:${colLetter(endCol)}${endRow + 1} by column ${colLetter(column)} (${direction})`
      }

      case 'get_sheet_data': {
        const maxRows = input.maxRows === undefined ? 50 : assertPositiveInteger(input.maxRows, 'maxRows')
        const maxCols = input.maxCols === undefined ? 26 : assertPositiveInteger(input.maxCols, 'maxCols')
        return serializeSheetData(maxRows, maxCols)
      }

      case 'create_sheet': {
        const name = assertStringValue(input.name, 'name')
        store.addSheet(name)
        return `Created new sheet "${name}"`
      }

      case 'activate_sheet': {
        const sheet = requireSheetByName(input.name, 'name')
        store.setActiveSheet(sheet.id)
        return `Activated sheet "${sheet.name}"`
      }

      case 'rename_sheet': {
        const name = assertStringValue(input.name, 'name')
        const targetSheetName = assertOptionalStringValue(input.sheetName, 'sheetName')
        const targetSheet = targetSheetName
          ? requireSheetByName(targetSheetName, 'sheetName')
          : useSpreadsheetStore.getState().getActiveSheet()
        store.renameSheet(targetSheet.id, name)
        return `Renamed sheet "${targetSheet.name}" to "${name}"`
      }

      case 'duplicate_sheet': {
        const sourceSheet = requireSheetByName(input.sheetName, 'sheetName')
        const newName = assertOptionalStringValue(input.newName, 'newName')
        store.duplicateSheet(sourceSheet.id)
        if (newName) {
          const duplicatedSheet = useSpreadsheetStore.getState().getActiveSheet()
          store.renameSheet(duplicatedSheet.id, newName)
          return `Duplicated sheet "${sourceSheet.name}" as "${newName}"`
        }
        const duplicatedSheet = useSpreadsheetStore.getState().getActiveSheet()
        return `Duplicated sheet "${sourceSheet.name}" as "${duplicatedSheet.name}"`
      }

      case 'delete_sheet': {
        const targetSheet = requireSheetByName(input.sheetName, 'sheetName')
        const currentState = useSpreadsheetStore.getState()
        if (currentState.sheets.length <= 1) {
          throw new Error('Cannot delete the last remaining sheet')
        }
        store.deleteSheet(targetSheet.id)
        return `Deleted sheet "${targetSheet.name}"`
      }

      case 'set_column_width': {
        const col = assertNonNegativeInteger(input.col, 'col')
        const width = assertPositiveNumber(input.width, 'width')
        store.setColWidth(col, width)
        return `Set width of column ${colLetter(col)} to ${Math.round(width)}px`
      }

      case 'set_row_height': {
        const row = assertNonNegativeInteger(input.row, 'row')
        const height = assertPositiveNumber(input.height, 'height')
        store.setRowHeight(row, height)
        return `Set height of row ${row + 1} to ${Math.round(height)}px`
      }

      case 'copy_range': {
        const range = normalizeRange(input)
        selectRange(range)
        store.copy(range)
        return `Copied range ${colLetter(range.startCol)}${range.startRow + 1}:${colLetter(range.endCol)}${range.endRow + 1}`
      }

      case 'cut_range': {
        const range = normalizeRange(input)
        selectRange(range)
        store.cut(range)
        return `Cut range ${colLetter(range.startCol)}${range.startRow + 1}:${colLetter(range.endCol)}${range.endRow + 1}`
      }

      case 'paste_range': {
        const targetRow = assertNonNegativeInteger(input.targetRow, 'targetRow')
        const targetCol = assertNonNegativeInteger(input.targetCol, 'targetCol')
        const currentState = useSpreadsheetStore.getState()
        const clipboard = currentState.clipboard
        if (!clipboard) {
          throw new Error('No internal clipboard data is available. Use copy_range or cut_range first.')
        }
        currentState.setActiveCell(targetRow, targetCol)
        currentState.paste({ row: targetRow, col: targetCol })
        const pastedRows = clipboard.data.length
        const pastedCols = clipboard.data[0]?.length || 1
        selectRange({
          startRow: targetRow,
          startCol: targetCol,
          endRow: targetRow + pastedRows - 1,
          endCol: targetCol + pastedCols - 1,
        })
        return `Pasted clipboard contents at ${colLetter(targetCol)}${targetRow + 1}`
      }

      case 'undo_last_action': {
        const currentState = useSpreadsheetStore.getState()
        if (currentState.historyPast.length === 0) {
          return 'Nothing to undo'
        }
        currentState.undo()
        return 'Undid the most recent spreadsheet action'
      }

      case 'redo_last_action': {
        const currentState = useSpreadsheetStore.getState()
        if (currentState.historyFuture.length === 0) {
          return 'Nothing to redo'
        }
        currentState.redo()
        return 'Redid the most recently undone spreadsheet action'
      }

      case 'export_workbook': {
        const fileName = assertOptionalStringValue(input.fileName, 'fileName')
          ?? buildDefaultFileName('文枢-工作簿', '.xlsx')
        const finalFileName = ensureFileExtension(fileName, '.xlsx')
        const { exportWorkbookFile } = await import('@/utils/xlsxExport')
        exportWorkbookFile(useSpreadsheetStore.getState().sheets, finalFileName)
        return `Started workbook export: ${finalFileName}`
      }

      case 'export_sheet_csv': {
        const sheetName = assertOptionalStringValue(input.sheetName, 'sheetName')
        const targetSheet = sheetName
          ? requireSheetByName(sheetName, 'sheetName')
          : useSpreadsheetStore.getState().getActiveSheet()
        const fileName = assertOptionalStringValue(input.fileName, 'fileName')
          ?? buildDefaultFileName(targetSheet.name, '.csv')
        const finalFileName = ensureFileExtension(fileName, '.csv')
        const { exportSheetCsv } = await import('@/utils/xlsxExport')
        exportSheetCsv(targetSheet, finalFileName)
        return `Started CSV export for sheet "${targetSheet.name}": ${finalFileName}`
      }

      default:
        return `Unknown tool: ${toolName}`
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return `Error executing ${toolName}: ${message}`
  }
}
