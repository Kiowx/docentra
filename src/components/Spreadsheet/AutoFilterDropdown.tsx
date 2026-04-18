import React, { useState, useCallback, useRef, useEffect } from 'react'
import { useSpreadsheetStore } from '@/store/useSpreadsheetStore'
import { cellKey, parseCellKey, colToLetter } from '@/utils/cellUtils'
import { formatCellValue } from '@/utils/formulaEngine'

interface AutoFilterDropdownProps {
  col: number
  startRow: number
  endRow: number
  onClose: () => void
  anchorRect: DOMRect
}

const AutoFilterDropdown: React.FC<AutoFilterDropdownProps> = React.memo(({
  col,
  startRow,
  endRow,
  onClose,
  anchorRect,
}) => {
  const activeSheet = useSpreadsheetStore((s) => s.sheets.find((sh) => sh.id === s.activeSheetId) || s.sheets[0])
  const [searchText, setSearchText] = useState('')
  const [filters, setFilters] = useState<Record<string, boolean>>({})
  const [initialized, setInitialized] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const cells = activeSheet?.cells || {}

  const uniqueValues = useCallback(() => {
    const seen = new Map<string, number>()
    for (let r = startRow; r <= endRow; r++) {
      const cell = cells[cellKey(r, col)]
      const val = cell ? formatCellValue(cell) : '(空白)'
      seen.set(val, (seen.get(val) || 0) + 1)
    }
    return Array.from(seen.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [cells, col, startRow, endRow])

  const values = uniqueValues()

  useEffect(() => {
    if (!initialized) {
      const initial: Record<string, boolean> = {}
      values.forEach(([val]) => { initial[val] = true })
      setFilters(initial)
      setInitialized(true)
    }
  }, [initialized, values])

  const toggleFilter = useCallback((val: string) => {
    setFilters(prev => ({ ...prev, [val]: !prev[val] }))
  }, [])

  const selectAll = useCallback(() => {
    const next: Record<string, boolean> = {}
    values.forEach(([val]) => { next[val] = true })
    setFilters(next)
  }, [values])

  const deselectAll = useCallback(() => {
    const next: Record<string, boolean> = {}
    values.forEach(([val]) => { next[val] = false })
    setFilters(next)
  }, [values])

  const setCellFormat = useSpreadsheetStore((s) => s.setCellFormat)

  const applyFilter = useCallback(() => {
    const enabledValues = new Set(
      Object.entries(filters).filter(([, v]) => v).map(([k]) => k)
    )

    if (enabledValues.size === values.length) {
      onClose()
      return
    }

    for (let r = startRow; r <= endRow; r++) {
      const cell = cells[cellKey(r, col)]
      const val = cell ? formatCellValue(cell) : '(空白)'
      const hidden = !enabledValues.has(val)
      if (hidden) {
        setCellFormat(
          { startRow: r, startCol: 0, endRow: r, endCol: 200 },
          { bgColor: '#f0f0f0', textColor: '#ccc' }
        )
      }
    }

    onClose()
  }, [filters, values, cells, col, startRow, endRow, setCellFormat, onClose])

  const filteredValues = searchText
    ? values.filter(([val]) => val.toLowerCase().includes(searchText.toLowerCase()))
    : values

  return (
    <div
      className="fixed inset-0 z-[70]"
      onClick={onClose}
    >
      <div
        ref={dropdownRef}
        className="absolute bg-white border border-gray-300 rounded-md shadow-xl"
        style={{
          left: Math.min(anchorRect.left, window.innerWidth - 260),
          top: Math.min(anchorRect.bottom, window.innerHeight - 320),
          width: 240,
          maxHeight: 320,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-2 py-1.5 border-b border-gray-200">
          <input
            className="w-full h-6 px-2 text-xs border border-gray-300 rounded outline-none focus:border-blue-500"
            placeholder="搜索..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2 px-2 py-1 border-b border-gray-200 text-xs">
          <button className="text-blue-600 hover:underline" onClick={selectAll}>全选</button>
          <button className="text-blue-600 hover:underline" onClick={deselectAll}>取消全选</button>
        </div>

        <div className="overflow-y-auto" style={{ maxHeight: 200 }}>
          {filteredValues.map(([val, count]) => (
            <label key={val} className="flex items-center gap-2 px-2 py-1 hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={!!filters[val]}
                onChange={() => toggleFilter(val)}
                className="w-3 h-3"
              />
              <span className="text-xs text-gray-700 truncate flex-1">{val}</span>
              <span className="text-xs text-gray-400">{count}</span>
            </label>
          ))}
        </div>

        <div className="flex items-center justify-end gap-2 px-2 py-1.5 border-t border-gray-200">
          <button
            className="h-6 px-3 text-xs border border-gray-300 rounded hover:bg-gray-100"
            onClick={onClose}
          >
            取消
          </button>
          <button
            className="h-6 px-3 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
            onClick={applyFilter}
          >
            应用
          </button>
        </div>
      </div>
    </div>
  )
})

AutoFilterDropdown.displayName = 'AutoFilterDropdown'

export default AutoFilterDropdown
