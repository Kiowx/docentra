import * as XLSX from 'xlsx'
import type {
  CellData,
  ImportValidationIssue,
  ImportValidationReport,
  Sheet,
} from '@/types'
import { DEFAULT_COL_WIDTH, DEFAULT_ROW_HEIGHT, TOTAL_COLS, TOTAL_ROWS } from '@/types'
import { addressToCellRef, cellKey, createSheet } from './cellUtils'
import { recalculateSheetFormulas } from './sheetFormulaUtils'

const MAX_ISSUES = 8

type ComparableValue = string | number | boolean | null

interface SourceWorkbookCell {
  row: number
  col: number
  formula?: string
  comparableValue: ComparableValue
}

interface ParsedWorkbookSheet {
  name: string
  sheet: Sheet
  cells: SourceWorkbookCell[]
  truncatedCells: number
}

export interface WorkbookImportResult {
  sheets: Sheet[]
  report: ImportValidationReport
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) return value.toString()
  return value.toFixed(10).replace(/\.?0+$/, '')
}

function normalizeComparable(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'number') return formatNumber(value)
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  return String(value).trim()
}

function formatForIssue(value: unknown): string {
  const normalized = normalizeComparable(value)
  return normalized === '' ? '(blank)' : normalized
}

function valuesMatch(expected: unknown, actual: unknown): boolean {
  return normalizeComparable(expected) === normalizeComparable(actual)
}

function toCellString(cell: XLSX.CellObject): string | null {
  if (cell.v === undefined || cell.v === null) return null

  if (cell.t === 'b') {
    return cell.v ? 'TRUE' : 'FALSE'
  }

  if (cell.t === 'd' || cell.v instanceof Date) {
    if (cell.w) return cell.w
    if (cell.v instanceof Date) return cell.v.toISOString()
    if (typeof cell.v === 'number' || typeof cell.v === 'string') {
      return new Date(cell.v).toISOString()
    }
    return String(cell.v)
  }

  if (cell.t === 'n') {
    if (cell.z && XLSX.SSF.is_date(cell.z)) {
      return cell.w || formatNumber(Number(cell.v))
    }
    return formatNumber(Number(cell.v))
  }

  return String(cell.v)
}

function getComparableValue(cell: XLSX.CellObject): ComparableValue {
  if (cell.v === undefined || cell.v === null) return null
  if (cell.v instanceof Date) return cell.v.toISOString()
  if (typeof cell.v === 'number' || typeof cell.v === 'boolean' || typeof cell.v === 'string') {
    return cell.v
  }
  return String(cell.v)
}

function toCellData(cell: XLSX.CellObject): CellData | null {
  if (cell.f) {
    return {
      value: `=${cell.f}`,
      formula: cell.f,
    }
  }

  const value = toCellString(cell)
  if (value === null || value === '') return null

  return { value }
}

function toColWidth(col: XLSX.ColInfo | undefined): number {
  if (!col) return DEFAULT_COL_WIDTH
  if (typeof col.wpx === 'number') return Math.max(30, Math.round(col.wpx))
  if (typeof col.wch === 'number') return Math.max(30, Math.round(col.wch * 8 + 16))
  return DEFAULT_COL_WIDTH
}

function toRowHeight(row: XLSX.RowInfo | undefined): number {
  if (!row) return DEFAULT_ROW_HEIGHT
  if (typeof row.hpx === 'number') return Math.max(15, Math.round(row.hpx))
  if (typeof row.hpt === 'number') return Math.max(15, Math.round(row.hpt * 96 / 72))
  return DEFAULT_ROW_HEIGHT
}

function parseWorksheet(name: string, worksheet: XLSX.WorkSheet): ParsedWorkbookSheet {
  const sheet = createSheet(name)
  const cells: SourceWorkbookCell[] = []
  let truncatedCells = 0

  Object.entries(worksheet).forEach(([address, entry]) => {
    if (address.startsWith('!')) return

    const cell = entry as XLSX.CellObject
    const { r, c } = XLSX.utils.decode_cell(address)
    const cellData = toCellData(cell)
    if (!cellData) return

    if (r >= TOTAL_ROWS || c >= TOTAL_COLS) {
      truncatedCells++
      return
    }

    sheet.cells[cellKey(r, c)] = cellData
    cells.push({
      row: r,
      col: c,
      formula: cell.f || undefined,
      comparableValue: getComparableValue(cell),
    })
  })

  const worksheetCols = worksheet['!cols']
  if (Array.isArray(worksheetCols)) {
    const colWidths: Sheet['colWidths'] = {}
    worksheetCols.forEach((col, index) => {
      if (index >= TOTAL_COLS) return
      const width = toColWidth(col)
      if (width !== DEFAULT_COL_WIDTH) {
        colWidths[index] = width
      }
    })
    sheet.colWidths = colWidths
  }

  const worksheetRows = worksheet['!rows']
  if (Array.isArray(worksheetRows)) {
    const rowHeights: Sheet['rowHeights'] = {}
    worksheetRows.forEach((row, index) => {
      if (index >= TOTAL_ROWS) return
      const height = toRowHeight(row)
      if (height !== DEFAULT_ROW_HEIGHT) {
        rowHeights[index] = height
      }
    })
    sheet.rowHeights = rowHeights
  }

  return { name, sheet, cells, truncatedCells }
}

function pushIssue(issues: ImportValidationIssue[], issue: ImportValidationIssue) {
  if (issues.length < MAX_ISSUES) {
    issues.push(issue)
  }
}

function buildValidationReport(
  fileName: string,
  parsedSheets: ParsedWorkbookSheet[],
  importedSheets: Sheet[],
): ImportValidationReport {
  const issues: ImportValidationIssue[] = []
  let importedCellCount = 0
  let checkedCellCount = 0
  let mismatchCount = 0
  let truncatedCellCount = 0

  parsedSheets.forEach((parsedSheet, sheetIndex) => {
    const importedSheet = importedSheets[sheetIndex]
    importedCellCount += parsedSheet.cells.length
    truncatedCellCount += parsedSheet.truncatedCells

    if (parsedSheet.truncatedCells > 0) {
      mismatchCount += parsedSheet.truncatedCells
      pushIssue(issues, {
        sheetName: parsedSheet.name,
        kind: 'truncated',
        expected: `${parsedSheet.truncatedCells} source cells`,
        actual: `Skipped beyond ${TOTAL_COLS} columns x ${TOTAL_ROWS} rows`,
      })
    }

    parsedSheet.cells.forEach((sourceCell) => {
      checkedCellCount++
      const key = cellKey(sourceCell.row, sourceCell.col)
      const importedCell = importedSheet?.cells[key]
      const cellRef = addressToCellRef({ row: sourceCell.row, col: sourceCell.col })

      if (!importedCell) {
        mismatchCount++
        pushIssue(issues, {
          sheetName: parsedSheet.name,
          cellRef,
          kind: 'value',
          expected: 'Cell imported',
          actual: 'Missing after import',
        })
        return
      }

      if (sourceCell.formula && importedCell.formula !== sourceCell.formula) {
        mismatchCount++
        pushIssue(issues, {
          sheetName: parsedSheet.name,
          cellRef,
          kind: 'formula',
          expected: `=${sourceCell.formula}`,
          actual: importedCell.value || '(blank)',
        })
      }

      if (!valuesMatch(sourceCell.comparableValue, importedCell.computedValue ?? importedCell.value)) {
        mismatchCount++
        pushIssue(issues, {
          sheetName: parsedSheet.name,
          cellRef,
          kind: 'value',
          expected: formatForIssue(sourceCell.comparableValue),
          actual: formatForIssue(importedCell.computedValue ?? importedCell.value),
        })
      }
    })
  })

  return {
    fileName,
    generatedAt: Date.now(),
    status: mismatchCount === 0 && truncatedCellCount === 0 ? 'success' : 'warning',
    workbookSheetCount: parsedSheets.length,
    importedSheetCount: importedSheets.length,
    importedCellCount,
    checkedCellCount,
    mismatchCount,
    truncatedCellCount,
    issues,
  }
}

export async function importWorkbookFile(file: File): Promise<WorkbookImportResult> {
  const buffer = await file.arrayBuffer()
  return importWorkbookBuffer(buffer, file.name)
}

export function importWorkbookBuffer(buffer: ArrayBuffer, fileName: string): WorkbookImportResult {
  const workbook = XLSX.read(buffer, {
    type: 'array',
    cellDates: true,
    cellFormula: true,
    cellNF: true,
    cellText: true,
  })

  const parsedSheets = workbook.SheetNames.map((sheetName) => parseWorksheet(sheetName, workbook.Sheets[sheetName]))
  const sheets = parsedSheets.map((entry) => recalculateSheetFormulas(entry.sheet))
  const report = buildValidationReport(fileName, parsedSheets, sheets)

  return { sheets, report }
}
