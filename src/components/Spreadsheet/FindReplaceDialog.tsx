import React, { useState, useCallback, useRef, useEffect } from 'react'
import { useSpreadsheetStore } from '@/store/useSpreadsheetStore'
import { cellKey, parseCellKey, addressToCellRef } from '@/utils/cellUtils'
import { TOTAL_COLS, TOTAL_ROWS } from '@/types'

interface FindResult {
  row: number
  col: number
}

interface FindReplaceDialogProps {
  mode: 'find' | 'replace'
  onClose: () => void
  onSwitchToReplace?: () => void
  onSwitchToFind?: () => void
}

const FindReplaceDialog: React.FC<FindReplaceDialogProps> = React.memo(({
  mode,
  onClose,
  onSwitchToReplace,
  onSwitchToFind,
}) => {
  const [searchText, setSearchText] = useState('')
  const [replaceText, setReplaceText] = useState('')
  const [matchCase, setMatchCase] = useState(false)
  const [results, setResults] = useState<FindResult[]>([])
  const [currentIdx, setCurrentIdx] = useState(-1)
  const [searched, setSearched] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const activeSheet = useSpreadsheetStore((s) => s.sheets.find((sh) => sh.id === s.activeSheetId) || s.sheets[0])
  const setActiveCell = useSpreadsheetStore((s) => s.setActiveCell)
  const setCell = useSpreadsheetStore((s) => s.setCell)

  useEffect(() => {
    searchRef.current?.focus()
  }, [])

  const doSearch = useCallback(() => {
    if (!searchText) {
      setResults([])
      setCurrentIdx(-1)
      setSearched(true)
      return
    }

    const found: FindResult[] = []
    const cells = activeSheet?.cells || {}
    const query = matchCase ? searchText : searchText.toLowerCase()

    for (const [key, cell] of Object.entries(cells)) {
      const [r, c] = parseCellKey(key)
      const content = String(cell.computedValue ?? cell.value ?? '')
      const haystack = matchCase ? content : content.toLowerCase()
      if (haystack.includes(query)) {
        found.push({ row: r, col: c })
      }
    }

    found.sort((a, b) => a.row !== b.row ? a.row - b.row : a.col - b.col)
    setResults(found)
    setSearched(true)

    if (found.length > 0) {
      setCurrentIdx(0)
      setActiveCell(found[0].row, found[0].col)
    } else {
      setCurrentIdx(-1)
    }
  }, [searchText, matchCase, activeSheet, setActiveCell])

  const handleFindNext = useCallback(() => {
    if (results.length === 0) {
      doSearch()
      return
    }

    const next = (currentIdx + 1) % results.length
    setCurrentIdx(next)
    setActiveCell(results[next].row, results[next].col)
  }, [results, currentIdx, doSearch, setActiveCell])

  const handleFindPrev = useCallback(() => {
    if (results.length === 0) return
    const prev = (currentIdx - 1 + results.length) % results.length
    setCurrentIdx(prev)
    setActiveCell(results[prev].row, results[prev].col)
  }, [results, currentIdx, setActiveCell])

  const handleReplace = useCallback(() => {
    if (currentIdx < 0 || currentIdx >= results.length) return
    const target = results[currentIdx]
    const cell = activeSheet?.cells[cellKey(target.row, target.col)]
    if (!cell) return
    if (cell.formula) return // Skip formula cells

    const content = cell.value || ''
    const flags = matchCase ? 'g' : 'gi'
    const escaped = searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const newValue = content.replace(new RegExp(escaped, flags), replaceText)
    setCell(target.row, target.col, newValue)
    doSearch()
  }, [currentIdx, results, activeSheet, searchText, replaceText, matchCase, setCell, doSearch])

  const handleReplaceAll = useCallback(() => {
    if (results.length === 0) return
    const cells = activeSheet?.cells || {}
    const flags = matchCase ? 'g' : 'gi'
    const escaped = searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

    results.forEach(({ row, col }) => {
      const cell = cells[cellKey(row, col)]
      if (!cell || cell.formula) return
      const content = cell.value || ''
      const newValue = content.replace(new RegExp(escaped, flags), replaceText)
      setCell(row, col, newValue)
    })

    doSearch()
  }, [results, activeSheet, searchText, replaceText, matchCase, setCell, doSearch])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey) {
        handleFindPrev()
      } else {
        handleFindNext()
      }
    }
  }, [onClose, handleFindNext, handleFindPrev])

  return (
    <div
      className="absolute top-2 right-2 z-[60] bg-white border border-gray-300 rounded-lg shadow-xl select-none"
      style={{ width: 380 }}
      onKeyDown={handleKeyDown}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-gray-50 rounded-t-lg">
        <span className="text-sm font-medium text-gray-700">
          {mode === 'find' ? '查找' : '查找和替换'}
        </span>
        <button
          className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 text-gray-500 text-lg"
          onClick={onClose}
        >
          &times;
        </button>
      </div>

      <div className="px-3 py-2 space-y-2">
        <div className="flex items-center gap-2">
          <input
            ref={searchRef}
            className="flex-1 h-7 px-2 text-sm border border-gray-300 rounded outline-none focus:border-blue-500"
            placeholder="查找内容"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
          <button
            className="h-7 px-3 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
            onClick={doSearch}
          >
            查找
          </button>
        </div>

        {mode === 'replace' && (
          <div className="flex items-center gap-2">
            <input
              className="flex-1 h-7 px-2 text-sm border border-gray-300 rounded outline-none focus:border-blue-500"
              placeholder="替换为"
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
            />
          </div>
        )}

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={matchCase}
              onChange={(e) => setMatchCase(e.target.checked)}
              className="w-3 h-3"
            />
            区分大小写
          </label>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            className="h-7 px-2 text-xs border border-gray-300 rounded hover:bg-gray-100 transition-colors"
            onClick={handleFindPrev}
            disabled={results.length === 0}
          >
            上一个
          </button>
          <button
            className="h-7 px-2 text-xs border border-gray-300 rounded hover:bg-gray-100 transition-colors"
            onClick={handleFindNext}
            disabled={results.length === 0}
          >
            下一个
          </button>
          {mode === 'replace' && (
            <>
              <button
                className="h-7 px-2 text-xs border border-gray-300 rounded hover:bg-gray-100 transition-colors"
                onClick={handleReplace}
                disabled={currentIdx < 0}
              >
                替换
              </button>
              <button
                className="h-7 px-2 text-xs border border-gray-300 rounded hover:bg-gray-100 transition-colors"
                onClick={handleReplaceAll}
                disabled={results.length === 0}
              >
                全部替换
              </button>
            </>
          )}
          <div className="flex-1" />
          {mode === 'find' && onSwitchToReplace && (
            <button
              className="h-7 px-2 text-xs text-blue-600 hover:underline"
              onClick={onSwitchToReplace}
            >
              替换 &gt;&gt;
            </button>
          )}
          {mode === 'replace' && onSwitchToFind && (
            <button
              className="h-7 px-2 text-xs text-blue-600 hover:underline"
              onClick={onSwitchToFind}
            >
              &lt;&lt; 查找
            </button>
          )}
        </div>

        {searched && (
          <div className="text-xs text-gray-500 pt-1">
            {results.length === 0
              ? '未找到匹配项'
              : `找到 ${results.length} 个匹配项${currentIdx >= 0 ? `，当前第 ${currentIdx + 1} 个` : ''}`}
          </div>
        )}
      </div>
    </div>
  )
})

FindReplaceDialog.displayName = 'FindReplaceDialog'

export default FindReplaceDialog
