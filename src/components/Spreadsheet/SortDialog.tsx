import React, { useState, useCallback, useRef, useEffect } from 'react'
import { useSpreadsheetStore } from '@/store/useSpreadsheetStore'
import { colToLetter, getSelectionRange, getSelectionRange as getSelRange } from '@/utils/cellUtils'
import type { CellAddress } from '@/types'

interface SortLevel {
  col: number
  direction: 'asc' | 'desc'
}

interface SortDialogProps {
  onClose: () => void
}

const SortDialog: React.FC<SortDialogProps> = React.memo(({ onClose }) => {
  const selection = useSpreadsheetStore((s) => s.selection)
  const sortRange = useSpreadsheetStore((s) => {
    const sel = s.selection
    if (sel.rangeStart && sel.rangeEnd) {
      return {
        startRow: Math.min(sel.rangeStart.row, sel.rangeEnd.row),
        startCol: Math.min(sel.rangeStart.col, sel.rangeEnd.col),
        endRow: Math.max(sel.rangeStart.row, sel.rangeEnd.row),
        endCol: Math.max(sel.rangeStart.col, sel.rangeEnd.col),
      }
    }
    return null
  })
  const sortRangeAction = useSpreadsheetStore((s) => s.sortRange)

  const range = sortRange || {
    startRow: selection.activeCell.row,
    startCol: selection.activeCell.col,
    endRow: selection.activeCell.row,
    endCol: selection.activeCell.col,
  }

  const [levels, setLevels] = useState<SortLevel[]>([
    { col: range.startCol, direction: 'asc' },
  ])
  const [hasHeader, setHasHeader] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const addLevel = useCallback(() => {
    const usedCols = new Set(levels.map(l => l.col))
    let nextCol = range.startCol
    while (usedCols.has(nextCol) && nextCol <= range.endCol) nextCol++
    if (nextCol > range.endCol) nextCol = range.startCol
    setLevels(prev => [...prev, { col: nextCol, direction: 'asc' }])
  }, [levels, range])

  const removeLevel = useCallback((idx: number) => {
    setLevels(prev => prev.filter((_, i) => i !== idx))
  }, [])

  const updateLevel = useCallback((idx: number, update: Partial<SortLevel>) => {
    setLevels(prev => prev.map((l, i) => i === idx ? { ...l, ...update } : l))
  }, [])

  const handleSort = useCallback(() => {
    if (levels.length === 0) return

    let r = range
    if (hasHeader && r.startRow < r.endRow) {
      r = { ...r, startRow: r.startRow + 1 }
    }

    for (let i = levels.length - 1; i >= 0; i--) {
      sortRangeAction(r, levels[i].col, levels[i].direction)
    }
    onClose()
  }, [levels, range, hasHeader, sortRangeAction, onClose])

  const colOptions: { value: number; label: string }[] = []
  for (let c = range.startCol; c <= range.endCol; c++) {
    colOptions.push({ value: c, label: colToLetter(c) })
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        ref={dialogRef}
        className="bg-white rounded-lg shadow-2xl border border-gray-300"
        style={{ width: 420 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 rounded-t-lg">
          <h3 className="text-sm font-semibold text-gray-700">排序</h3>
        </div>

        <div className="px-4 py-3 space-y-3">
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={hasHeader}
              onChange={(e) => setHasHeader(e.target.checked)}
              className="w-3 h-3"
            />
            数据包含标题行
          </label>

          {levels.map((level, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="text-xs text-gray-500 w-16">
                {idx === 0 ? '主要关键字' : `次要 ${idx}`}
              </span>
              <select
                className="h-7 flex-1 px-2 text-xs border border-gray-300 rounded outline-none focus:border-blue-500"
                value={level.col}
                onChange={(e) => updateLevel(idx, { col: Number(e.target.value) })}
              >
                {colOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>列 {opt.label}</option>
                ))}
              </select>
              <select
                className="h-7 px-2 text-xs border border-gray-300 rounded outline-none focus:border-blue-500"
                value={level.direction}
                onChange={(e) => updateLevel(idx, { direction: e.target.value as 'asc' | 'desc' })}
              >
                <option value="asc">升序 (A→Z)</option>
                <option value="desc">降序 (Z→A)</option>
              </select>
              {levels.length > 1 && (
                <button
                  className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-red-500"
                  onClick={() => removeLevel(idx)}
                >
                  &times;
                </button>
              )}
            </div>
          ))}

          <button
            className="text-xs text-blue-600 hover:underline"
            onClick={addLevel}
          >
            + 添加排序条件
          </button>
        </div>

        <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-end gap-2">
          <button
            className="h-8 px-4 text-xs border border-gray-300 rounded hover:bg-gray-100 transition-colors"
            onClick={onClose}
          >
            取消
          </button>
          <button
            className="h-8 px-4 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
            onClick={handleSort}
          >
            排序
          </button>
        </div>
      </div>
    </div>
  )
})

SortDialog.displayName = 'SortDialog'

export default SortDialog
