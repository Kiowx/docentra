import React, { useMemo } from 'react'
import { useSpreadsheetStore } from '@/store/useSpreadsheetStore'
import { addressToCellRef, getSelectionRange, isCellInRange, parseCellKey } from '@/utils/cellUtils'

function formatNumber(value: number) {
  if (Number.isInteger(value)) return value.toString()
  return value.toFixed(2).replace(/\.?0+$/, '')
}

const SelectionStatusBar: React.FC = React.memo(() => {
  const activeSheet = useSpreadsheetStore((s) => s.sheets.find((sh) => sh.id === s.activeSheetId) || s.sheets[0])
  const selection = useSpreadsheetStore((s) => s.selection)
  const activeCellRef = addressToCellRef(selection.activeCell)
  const selectionRange = useMemo(() => getSelectionRange(selection), [selection])

  const summary = useMemo(() => {
    const range = selectionRange ?? {
      startRow: selection.activeCell.row,
      startCol: selection.activeCell.col,
      endRow: selection.activeCell.row,
      endCol: selection.activeCell.col,
    }

    const selectedRows = range.endRow - range.startRow + 1
    const selectedCols = range.endCol - range.startCol + 1
    const selectedCellCount = selectedRows * selectedCols

    let nonEmptyCount = 0
    let numericCount = 0
    let sum = 0

    Object.entries(activeSheet?.cells || {}).forEach(([key, cell]) => {
      const [row, col] = parseCellKey(key)
      if (!isCellInRange(row, col, range)) return
      if ((cell.computedValue ?? cell.value) === '') return

      nonEmptyCount += 1
      const value = cell.computedValue ?? cell.value
      const numericValue = typeof value === 'number'
        ? value
        : typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))
          ? Number(value)
          : null

      if (numericValue === null) return
      numericCount += 1
      sum += numericValue
    })

    return {
      selectedRows,
      selectedCols,
      selectedCellCount,
      nonEmptyCount,
      numericCount,
      sum,
      average: numericCount > 0 ? sum / numericCount : null,
    }
  }, [activeSheet, selection.activeCell, selectionRange])

  return (
    <div className="flex items-center justify-between gap-4 border-t border-gray-300 bg-gray-50 px-3 py-1.5 text-xs text-gray-600 shrink-0">
      <div className="flex items-center gap-3 overflow-hidden">
        <span className="font-medium text-gray-700">就绪</span>
        <span className="truncate">工作表：{activeSheet?.name || '未命名工作表'}</span>
        <span>活动单元格：{activeCellRef}</span>
        <span>
          已选区域：{summary.selectedRows} 行 x {summary.selectedCols} 列，共 {summary.selectedCellCount} 个单元格
        </span>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span>非空：{summary.nonEmptyCount}</span>
        <span>数值：{summary.numericCount}</span>
        <span>求和：{formatNumber(summary.sum)}</span>
        <span>平均值：{summary.average === null ? '—' : formatNumber(summary.average)}</span>
      </div>
    </div>
  )
})

SelectionStatusBar.displayName = 'SelectionStatusBar'

export default SelectionStatusBar
