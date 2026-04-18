import * as XLSX from 'xlsx'
import type { CellData, Sheet } from '@/types'
import { parseCellKey } from './cellUtils'

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[\\/:*?"<>|]+/g, '-')
}

function toWorksheetValue(cell: CellData) {
  if (cell.formula) {
    return cell.computedValue ?? null
  }

  return cell.value
}

function inferScalarCell(value: string): XLSX.CellObject {
  const trimmed = value.trim()

  if (trimmed === 'TRUE' || trimmed === 'FALSE') {
    return {
      t: 'b',
      v: trimmed === 'TRUE',
    }
  }

  if (trimmed !== '' && /^-?\d+(\.\d+)?$/.test(trimmed)) {
    return {
      t: 'n',
      v: Number(trimmed),
    }
  }

  return {
    t: 's',
    v: value,
  }
}

function toWorksheetCell(cell: CellData): XLSX.CellObject {
  const rawValue = toWorksheetValue(cell)

  if (cell.formula) {
    const formulaCell: XLSX.CellObject = {
      f: cell.formula,
      t: 's',
    }

    if (typeof rawValue === 'number') {
      formulaCell.t = 'n'
      formulaCell.v = rawValue
    } else if (typeof rawValue === 'boolean') {
      formulaCell.t = 'b'
      formulaCell.v = rawValue
    } else if (rawValue !== null && rawValue !== undefined && rawValue !== '') {
      formulaCell.t = 's'
      formulaCell.v = String(rawValue)
    }

    return formulaCell
  }

  return inferScalarCell(String(rawValue ?? ''))
}

function buildWorksheet(sheet: Sheet): XLSX.WorkSheet {
  const worksheet: XLSX.WorkSheet = {}
  let maxRow = 0
  let maxCol = 0

  Object.entries(sheet.cells).forEach(([key, cell]) => {
    const [row, col] = parseCellKey(key)
    const address = XLSX.utils.encode_cell({ r: row, c: col })
    worksheet[address] = toWorksheetCell(cell)
    maxRow = Math.max(maxRow, row)
    maxCol = Math.max(maxCol, col)
  })

  Object.keys(sheet.rowHeights).forEach((row) => {
    maxRow = Math.max(maxRow, Number(row))
  })
  Object.keys(sheet.colWidths).forEach((col) => {
    maxCol = Math.max(maxCol, Number(col))
  })

  worksheet['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: maxRow, c: maxCol },
  })

  if (Object.keys(sheet.colWidths).length > 0) {
    const cols: XLSX.ColInfo[] = []
    Object.entries(sheet.colWidths).forEach(([colIndex, width]) => {
      cols[Number(colIndex)] = { wpx: width }
    })
    worksheet['!cols'] = cols
  }

  if (Object.keys(sheet.rowHeights).length > 0) {
    const rows: XLSX.RowInfo[] = []
    Object.entries(sheet.rowHeights).forEach(([rowIndex, height]) => {
      rows[Number(rowIndex)] = { hpx: height }
    })
    worksheet['!rows'] = rows
  }

  return worksheet
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = sanitizeFileName(fileName)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function exportWorkbookBuffer(sheets: Sheet[]) {
  const workbook = XLSX.utils.book_new()

  sheets.forEach((sheet) => {
    const worksheet = buildWorksheet(sheet)
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name)
  })

  return XLSX.write(workbook, {
    bookType: 'xlsx',
    type: 'array',
    cellStyles: false,
  }) as ArrayBuffer
}

export function exportWorkbookFile(sheets: Sheet[], fileName: string) {
  const buffer = exportWorkbookBuffer(sheets)
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  downloadBlob(blob, fileName)
}

export function exportSheetCsv(sheet: Sheet, fileName: string) {
  const worksheet = buildWorksheet(sheet)
  const csv = XLSX.utils.sheet_to_csv(worksheet)
  const utf8Bom = new Uint8Array([0xef, 0xbb, 0xbf])
  const blob = new Blob([utf8Bom, csv], {
    type: 'text/csv;charset=utf-8',
  })
  downloadBlob(blob, fileName)
}
