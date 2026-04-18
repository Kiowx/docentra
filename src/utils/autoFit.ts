import type { CellData, CellFormat, Sheet } from '@/types'
import { DEFAULT_COL_WIDTH, DEFAULT_ROW_HEIGHT } from '@/types'
import { colToLetter, parseCellKey } from './cellUtils'
import { formatCellValue } from './formulaEngine'

const MIN_COL_WIDTH = 60
const MAX_COL_WIDTH = 420
const MIN_ROW_HEIGHT = 25
const MAX_ROW_HEIGHT = 240

function getFontSize(format?: CellFormat) {
  return format?.fontSize ?? 13
}

function estimateCharacterWidth(format?: CellFormat) {
  const base = getFontSize(format) * 0.62
  return format?.bold ? base * 1.08 : base
}

function getDisplayLines(cell: CellData) {
  return formatCellValue(cell).split(/\r?\n/)
}

function estimateLineWidth(text: string, format?: CellFormat) {
  return Math.ceil(text.length * estimateCharacterWidth(format))
}

export function computeAutoFitColumnWidth(sheet: Sheet, colIndex: number) {
  let maxWidth = estimateLineWidth(colToLetter(colIndex), { bold: true }) + 18

  Object.entries(sheet.cells).forEach(([key, cell]) => {
    const [, col] = parseCellKey(key)
    if (col !== colIndex) return

    const widestLine = Math.max(
      ...getDisplayLines(cell).map((line) => estimateLineWidth(line, cell.format)),
      0,
    )
    maxWidth = Math.max(maxWidth, widestLine + 16)
  })

  return Math.max(MIN_COL_WIDTH, Math.min(MAX_COL_WIDTH, maxWidth))
}

function estimateWrappedLineCount(cell: CellData, colWidth: number) {
  const format = cell.format
  const availableWidth = Math.max(20, colWidth - 8)

  return getDisplayLines(cell).reduce((total, line) => {
    if (line === '') return total + 1
    const lineWidth = estimateLineWidth(line, format)
    if (!format?.wrapText) {
      return total + 1
    }
    return total + Math.max(1, Math.ceil(lineWidth / availableWidth))
  }, 0)
}

export function computeAutoFitRowHeight(
  sheet: Sheet,
  rowIndex: number,
  colWidths: Sheet['colWidths'],
) {
  let maxHeight = DEFAULT_ROW_HEIGHT

  Object.entries(sheet.cells).forEach(([key, cell]) => {
    const [row, col] = parseCellKey(key)
    if (row !== rowIndex) return

    const fontSize = getFontSize(cell.format)
    const lineHeight = Math.max(18, Math.round(fontSize * 1.45))
    const colWidth = colWidths[col] ?? DEFAULT_COL_WIDTH
    const lineCount = estimateWrappedLineCount(cell, colWidth)
    const height = lineCount * lineHeight + 6
    maxHeight = Math.max(maxHeight, height)
  })

  return Math.max(MIN_ROW_HEIGHT, Math.min(MAX_ROW_HEIGHT, maxHeight))
}
