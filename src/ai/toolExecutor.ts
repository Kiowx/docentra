import { useSpreadsheetStore } from '@/store/useSpreadsheetStore'
import { cellKey, colToLetter } from '@/utils/cellUtils'

function colLetter(col: number): string {
  return colToLetter(col)
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

export function executeTool(toolName: string, input: Record<string, any>): string {
  const store = useSpreadsheetStore.getState()

  try {
    switch (toolName) {
      case 'set_cell': {
        const { row, col, value } = input
        store.setCell(row, col, value)
        return `Set cell ${colLetter(col)}${row + 1} = "${value}"`
      }

      case 'set_range': {
        const { startRow, startCol, data } = input
        store.setRange(startRow, startCol, data)
        const rows = data.length
        const cols = data[0]?.length || 0
        return `Set range ${colLetter(startCol)}${startRow + 1}:${colLetter(startCol + cols - 1)}${startRow + rows} (${rows} rows x ${cols} cols)`
      }

      case 'add_row': {
        const { index, count = 1 } = input
        store.addRow(index, count)
        return `Inserted ${count} row(s) at row ${index}`
      }

      case 'add_column': {
        const { index, count = 1 } = input
        store.addColumn(index, count)
        return `Inserted ${count} column(s) at column ${colLetter(index)}`
      }

      case 'delete_row': {
        const { index, count = 1 } = input
        store.deleteRow(index, count)
        return `Deleted ${count} row(s) starting at row ${index}`
      }

      case 'delete_column': {
        const { index, count = 1 } = input
        store.deleteColumn(index, count)
        return `Deleted ${count} column(s) starting at column ${colLetter(index)}`
      }

      case 'format_cells': {
        const { startRow, startCol, endRow, endCol, format } = input
        store.setCellFormat(
          { startRow, startCol, endRow, endCol },
          format
        )
        return `Formatted range ${colLetter(startCol)}${startRow + 1}:${colLetter(endCol)}${endRow + 1}`
      }

      case 'set_formula': {
        const { row, col, formula } = input
        store.setCellFormula(row, col, formula)
        return `Set formula in ${colLetter(col)}${row + 1} = ${formula}`
      }

      case 'sort_range': {
        const { startRow, startCol, endRow, endCol, column, direction } = input
        store.sortRange(
          { startRow, startCol, endRow, endCol },
          column,
          direction
        )
        return `Sorted range ${colLetter(startCol)}${startRow + 1}:${colLetter(endCol)}${endRow + 1} by column ${colLetter(column)} (${direction})`
      }

      case 'get_sheet_data': {
        const { maxRows = 50, maxCols = 26 } = input
        return serializeSheetData(maxRows, maxCols)
      }

      case 'create_sheet': {
        const { name } = input
        store.addSheet(name)
        return `Created new sheet "${name}"`
      }

      case 'rename_sheet': {
        const { name } = input
        const sheetId = useSpreadsheetStore.getState().activeSheetId
        store.renameSheet(sheetId, name)
        return `Renamed active sheet to "${name}"`
      }

      default:
        return `Unknown tool: ${toolName}`
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return `Error executing ${toolName}: ${message}`
  }
}
